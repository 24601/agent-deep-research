import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  getMimeTypeWithFallback,
  FILE_SIZE_LIMITS,
  UnsupportedFileTypeError,
  FileSizeExceededError,
  FileUploadError,
  ProgressCallback,
} from './mimeTypes';
import { FileSearchManager } from './FileSearchManager';

/**
 * Represents metadata for an existing file in the store.
 * Used by smart sync to compare local files against stored documents.
 *
 * @property hash - SHA-256 hash of the file content
 * @property documentName - Full resource name of the document (e.g., "documents/123")
 */
interface ExistingFileInfo {
  hash: string;
  documentName: string;
}

export class FileUploader {
  private fileSearchManager: FileSearchManager;

  constructor(private client: GoogleGenAI) {
    this.fileSearchManager = new FileSearchManager(client);
  }

  /**
   * Fetches existing file hashes from the store for comparison.
   * Returns a map of relative path -> { hash, documentName }
   */
  async getExistingFileHashes(storeName: string): Promise<Map<string, ExistingFileInfo>> {
    const hashMap = new Map<string, ExistingFileInfo>();

    try {
      const documents = await this.fileSearchManager.listDocuments(storeName);

      for (const doc of documents) {
        // Extract hash and path from customMetadata with defensive checks
        const metadata = Array.isArray(doc.customMetadata) ? doc.customMetadata : [];
        let filePath: string | undefined;
        let hash: string | undefined;

        for (const meta of metadata) {
          if (!meta || typeof meta.key !== 'string') continue;
          if (meta.key === 'path') {
            filePath = meta.stringValue;
          } else if (meta.key === 'hash') {
            hash = meta.stringValue;
          }
        }

        if (filePath && hash && doc.name) {
          hashMap.set(filePath, { hash, documentName: doc.name });
        }
      }
    } catch (error) {
      // If we can't list documents (e.g., empty store), return empty map
      console.error('Note: Could not fetch existing documents:', (error as Error).message);
    }

    return hashMap;
  }

  private determineMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const result = getMimeTypeWithFallback(filePath);

    if (!result) {
      throw new UnsupportedFileTypeError(filePath, ext);
    }

    return result.mimeType;
  }

  private validateFileSize(filePath: string, stats: fs.Stats): void {
    if (stats.size > FILE_SIZE_LIMITS.MAX_FILE_SIZE_BYTES) {
      throw new FileSizeExceededError(
        filePath,
        stats.size,
        FILE_SIZE_LIMITS.MAX_FILE_SIZE_BYTES
      );
    }
  }

  private getFileHash(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }

  async uploadFile(
    filePath: string,
    storeName: string,
    config?: {
      chunkingConfig?: any;
      relativePath?: string;
      onProgress?: ProgressCallback;
      onFileComplete?: () => void;
    }
  ): Promise<any> {
    const fileName = path.basename(filePath);
    const stats = fs.statSync(filePath);

    // Validate size BEFORE expensive hashing operation
    this.validateFileSize(filePath, stats);

    // Validate MIME type (will throw if unsupported)
    const mimeType = this.determineMimeType(filePath);

    // Now proceed with hashing
    const hash = this.getFileHash(filePath);
    const lastModified = stats.mtime.toISOString();
    const relativePath = config?.relativePath || fileName;

    try {
      // Emit progress event if callback provided
      config?.onProgress?.({
        type: 'file_start',
        currentFile: fileName,
      });

      console.error(`Uploading ${fileName} to ${storeName} with metadata (path: ${relativePath})...`);
      const op = await this.client.fileSearchStores.uploadToFileSearchStore({
        fileSearchStoreName: storeName,
        file: filePath,
        config: {
          displayName: fileName,
          mimeType,
          chunkingConfig: config?.chunkingConfig,
          metadata: {
            path: relativePath,
            hash: hash,
            last_modified: lastModified,
          }
        } as any,
      });

      // Call completion callback before emitting progress event
      // This allows the caller to update counters before the event is emitted
      config?.onFileComplete?.();

      // Emit complete event
      config?.onProgress?.({
        type: 'file_complete',
        currentFile: fileName,
      });

      return op;
    } catch (error: any) {
      console.error(`Failed to upload ${fileName}:`, error.message);

      // Emit error event
      config?.onProgress?.({
        type: 'file_error',
        currentFile: fileName,
        error,
      });

      throw new FileUploadError(filePath, error);
    }
  }

  async uploadDirectory(
    dirPath: string,
    storeName: string,
    config?: {
      chunkingConfig?: any;
      onProgress?: ProgressCallback;
      parallel?: { maxConcurrent?: number };
      /** Enable smart sync to skip unchanged files based on hash comparison */
      smartSync?: boolean;
    }
  ): Promise<any[]> {
    const absoluteDirPath = path.resolve(dirPath);
    const maxConcurrent = config?.parallel?.maxConcurrent ?? 5;
    const smartSync = config?.smartSync ?? false;

    const getFiles = (dir: string): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const res = path.resolve(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...getFiles(res));
        } else {
          files.push(res);
        }
      }
      return files;
    };

    const allFiles = getFiles(absoluteDirPath)
      .filter(f => !path.basename(f).startsWith('.')); // Skip hidden files

    // Fetch existing file hashes if smart sync is enabled
    let existingHashes = new Map<string, ExistingFileInfo>();
    if (smartSync) {
      console.error('Smart sync enabled: fetching existing file hashes...');
      existingHashes = await this.getExistingFileHashes(storeName);
      console.error(`Found ${existingHashes.size} existing files in store`);
    }

    // Emit start event
    config?.onProgress?.({
      type: 'start',
      totalFiles: allFiles.length,
      percentage: 0,
    });

    const results: any[] = [];
    let completedFiles = 0;
    let skippedFiles = 0;
    let failedFiles = 0;

    // Process files in batches of maxConcurrent
    for (let i = 0; i < allFiles.length; i += maxConcurrent) {
      const batch = allFiles.slice(i, i + maxConcurrent);

      // Use Promise.allSettled to continue on failures
      const batchResults = await Promise.allSettled(
        batch.map(async (filePath, idx) => {
          const relativePath = path.relative(absoluteDirPath, filePath);
          const fileIndex = i + idx + 1;
          const fileName = path.basename(filePath);

          // Check if we should skip this file (smart sync)
          if (smartSync) {
            const existingInfo = existingHashes.get(relativePath);
            if (existingInfo) {
              // Calculate local file hash
              const localHash = this.getFileHash(filePath);
              if (localHash === existingInfo.hash) {
                // File unchanged, skip upload
                skippedFiles++;
                config?.onProgress?.({
                  type: 'file_skipped',
                  currentFile: fileName,
                  currentFileIndex: fileIndex,
                  totalFiles: allFiles.length,
                  completedFiles,
                  skippedFiles,
                  percentage: Math.round(((completedFiles + skippedFiles) / allFiles.length) * 100),
                });
                return { skipped: true, path: relativePath };
              }
            }
          }

          return this.uploadFile(filePath, storeName, {
            ...config,
            relativePath,
            onFileComplete: () => {
              // Increment counter immediately when file completes
              // This ensures onProgress events have the correct count
              completedFiles++;
            },
            onProgress: (event) => {
              // Augment progress events with batch context
              const augmentedEvent = {
                ...event,
                currentFileIndex: fileIndex,
                totalFiles: allFiles.length,
                completedFiles,
                skippedFiles,
                percentage: Math.round(((completedFiles + skippedFiles) / allFiles.length) * 100),
              };
              config?.onProgress?.(augmentedEvent);
            },
          });
        })
      );

      // Track results
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          // Don't add skipped files to results
          if (!result.value?.skipped) {
            results.push(result.value);
          }
        } else {
          console.error('Upload failed:', result.reason);
          failedFiles++;
        }
      }
    }

    // Emit complete event
    config?.onProgress?.({
      type: 'complete',
      totalFiles: allFiles.length,
      completedFiles,
      skippedFiles,
      failedFiles,
      percentage: 100,
    });

    return results;
  }
}
