import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export class FileUploader {
  constructor(private client: GoogleGenAI) {}

  private determineMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.ts':
      case '.js':
      case '.py':
      case '.txt':
      case '.toml':
      case '.yaml':
      case '.yml':
        return 'text/plain';
      case '.json':
        return 'application/json';
      case '.md':
        return 'text/markdown';
      case '.html':
        return 'text/html';
      case '.pdf':
        return 'application/pdf';
      default:
        return 'text/plain';
    }
  }

  private getFileHash(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }

  async uploadFile(filePath: string, storeName: string, config?: { chunkingConfig?: any, relativePath?: string }) {
    const fileName = path.basename(filePath);
    const mimeType = this.determineMimeType(filePath);
    const stats = fs.statSync(filePath);
    const hash = this.getFileHash(filePath);
    const lastModified = stats.mtime.toISOString();
    const relativePath = config?.relativePath || fileName;

    try {
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
      return op;
    } catch (error: any) {
      console.error(`Failed to upload ${fileName}:`, error.message, error);
      throw new Error(`Failed to upload ${fileName} to ${storeName}: ${JSON.stringify(error)}`);
    }
  }

  async uploadDirectory(dirPath: string, storeName: string, config?: { chunkingConfig?: any }) {
    const absoluteDirPath = path.resolve(dirPath);
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

    const files = getFiles(absoluteDirPath);
    const operations = [];
    
    for (const filePath of files) {
      // Skip hidden files/directories (starting with .)
      if (path.basename(filePath).startsWith('.')) continue;
      
      const relativePath = path.relative(absoluteDirPath, filePath);
      
      try {
        const op = await this.uploadFile(filePath, storeName, { 
            ...config, 
            relativePath 
        });
        operations.push(op);
      } catch (error) {
        console.error(error);
        // Continue with other files
      }
    }
    return operations;
  }
}
