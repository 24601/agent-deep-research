import fs from 'fs';
import { FileUploader } from './FileUploader';
import { GoogleGenAI } from '@google/genai';
import * as mimeTypes from './mimeTypes';

jest.mock('fs');
jest.mock('@google/genai');
jest.mock('./mimeTypes');

describe('FileUploader', () => {
  let mockGenAI: jest.Mocked<GoogleGenAI>;
  let uploader: FileUploader;

  beforeEach(() => {
    mockGenAI = {
      files: {
        upload: jest.fn(),
      },
      fileSearchStores: {
        uploadToFileSearchStore: jest.fn(),
      },
    } as unknown as jest.Mocked<GoogleGenAI>;
    uploader = new FileUploader(mockGenAI);
    jest.clearAllMocks();

    // Setup default mock for mimeTypes module
    (mimeTypes.getMimeTypeWithFallback as jest.Mock).mockReturnValue({ mimeType: 'text/plain', isFallback: false });
  });

  it('should scan a directory and upload files', async () => {
    // Mock for the top-level directory
    (fs.readdirSync as jest.Mock).mockReturnValue([
      { name: 'file1.txt', isFile: () => true, isDirectory: () => false },
      { name: 'file2.pdf', isFile: () => true, isDirectory: () => false },
    ]);
    (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('content'));
    (fs.statSync as jest.Mock).mockReturnValue({
      mtime: new Date('2025-01-01T00:00:00Z'),
      size: 1024 // 1 KB - well under limit
    });

    (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock)
      .mockResolvedValueOnce({ name: 'operations/1' })
      .mockResolvedValueOnce({ name: 'operations/2' });

    const result = await uploader.uploadDirectory('my-dir', 'fileSearchStores/my-store');

    expect(fs.readdirSync).toHaveBeenCalledWith(expect.any(String), { withFileTypes: true });
    expect(mockGenAI.fileSearchStores.uploadToFileSearchStore).toHaveBeenCalledTimes(2);
    expect(mockGenAI.fileSearchStores.uploadToFileSearchStore).toHaveBeenCalledWith(
        expect.objectContaining({
            config: expect.objectContaining({
                metadata: expect.objectContaining({
                    path: 'file1.txt',
                    hash: expect.any(String),
                    last_modified: '2025-01-01T00:00:00.000Z'
                })
            })
        })
    );
  });

  it('should upload a single file', async () => {
    (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('content'));
    (fs.statSync as jest.Mock).mockReturnValue({
      mtime: new Date('2025-01-01T00:00:00Z'),
      size: 1024
    });
    (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock)
      .mockResolvedValueOnce({ name: 'operations/1' });

    const result = await uploader.uploadFile('path/to/file.txt', 'fileSearchStores/my-store');

    expect(mockGenAI.fileSearchStores.uploadToFileSearchStore).toHaveBeenCalledWith(
        expect.objectContaining({
            fileSearchStoreName: 'fileSearchStores/my-store',
            file: 'path/to/file.txt',
            config: expect.objectContaining({
                displayName: 'file.txt',
                mimeType: 'text/plain',
                metadata: {
                    path: 'file.txt',
                    hash: 'ed7002b439e9ac845f22357d822bac1444730fbdb6016d3ec9432297b9ec9f73', // hash of 'content'
                    last_modified: '2025-01-01T00:00:00.000Z'
                }
            })
        })
    );
    expect(result).toEqual({ name: 'operations/1' });
  });

  it('should support optional chunkingConfig in uploadDirectory', async () => {
    (fs.readdirSync as jest.Mock).mockReturnValue([
      { name: 'file1.txt', isFile: () => true, isDirectory: () => false },
    ]);
    (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('content'));
    (fs.statSync as jest.Mock).mockReturnValue({
      mtime: new Date('2025-01-01T00:00:00Z'),
      size: 1024
    });

    (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock)
      .mockResolvedValueOnce({ name: 'operations/1' });

    const chunkingConfig = { whiteSpaceConfig: { maxTokensPerChunk: 100 } };
    await uploader.uploadDirectory('my-dir', 'fileSearchStores/my-store', { chunkingConfig });

    expect(mockGenAI.fileSearchStores.uploadToFileSearchStore).toHaveBeenCalledWith(
        expect.objectContaining({
            fileSearchStoreName: 'fileSearchStores/my-store',
            config: expect.objectContaining({
                chunkingConfig
            })
        })
    );
  });

  describe('MIME type validation', () => {
    it('should throw UnsupportedFileTypeError for unsupported extensions', async () => {
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024, mtime: new Date() });
      (mimeTypes.getMimeTypeWithFallback as jest.Mock).mockReturnValue(null);

      const UnsupportedFileTypeError = jest.requireActual('./mimeTypes').UnsupportedFileTypeError;
      (mimeTypes.UnsupportedFileTypeError as any) = UnsupportedFileTypeError;

      await expect(
        uploader.uploadFile('file.exe', 'fileSearchStores/my-store')
      ).rejects.toThrow();
    });

    it('should accept files with validated MIME types', async () => {
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024, mtime: new Date() });
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('content'));
      (mimeTypes.getMimeTypeWithFallback as jest.Mock).mockReturnValue({ mimeType: 'text/x-python', isFallback: false });
      (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock).mockResolvedValue({ name: 'op/1' });

      await expect(
        uploader.uploadFile('script.py', 'fileSearchStores/my-store')
      ).resolves.toBeDefined();
    });

    it('should accept files with fallback MIME types', async () => {
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024, mtime: new Date() });
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('content'));
      (mimeTypes.getMimeTypeWithFallback as jest.Mock).mockReturnValue({ mimeType: 'text/plain', isFallback: true });
      (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock).mockResolvedValue({ name: 'op/1' });

      await expect(
        uploader.uploadFile('script.js', 'fileSearchStores/my-store')
      ).resolves.toBeDefined();
    });

    it('should use fallback MIME type for common programming files', async () => {
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024, mtime: new Date() });
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('content'));
      (mimeTypes.getMimeTypeWithFallback as jest.Mock).mockReturnValue({ mimeType: 'text/plain', isFallback: true });
      (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock).mockResolvedValue({ name: 'op/1' });

      await uploader.uploadFile('config.json', 'fileSearchStores/my-store');

      expect(mockGenAI.fileSearchStores.uploadToFileSearchStore).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            mimeType: 'text/plain'
          })
        })
      );
    });
  });

  describe('File size validation', () => {
    it('should throw FileSizeExceededError for files > 100MB', async () => {
      const largeFileSize = 101 * 1024 * 1024; // 101 MB
      (fs.statSync as jest.Mock).mockReturnValue({
        size: largeFileSize,
        mtime: new Date()
      });

      const FileSizeExceededError = jest.requireActual('./mimeTypes').FileSizeExceededError;
      (mimeTypes.FileSizeExceededError as any) = FileSizeExceededError;
      (mimeTypes.FILE_SIZE_LIMITS as any) = { MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024 };

      await expect(
        uploader.uploadFile('largefile.pdf', 'fileSearchStores/my-store')
      ).rejects.toThrow();
    });

    it('should accept files <= 100MB', async () => {
      const validFileSize = 99 * 1024 * 1024; // 99 MB
      (fs.statSync as jest.Mock).mockReturnValue({
        size: validFileSize,
        mtime: new Date()
      });
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('content'));
      (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock).mockResolvedValue({ name: 'op/1' });

      await expect(
        uploader.uploadFile('file.pdf', 'fileSearchStores/my-store')
      ).resolves.toBeDefined();
    });
  });

  describe('Progress tracking', () => {
    it('should call progress callback with file_start event', async () => {
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024, mtime: new Date() });
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('content'));
      (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock).mockResolvedValue({ name: 'op/1' });

      const onProgress = jest.fn();
      await uploader.uploadFile('file.txt', 'fileSearchStores/my-store', { onProgress });

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'file_start',
          currentFile: 'file.txt'
        })
      );
    });

    it('should call progress callback with file_complete event', async () => {
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024, mtime: new Date() });
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('content'));
      (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock).mockResolvedValue({ name: 'op/1' });

      const onProgress = jest.fn();
      await uploader.uploadFile('file.txt', 'fileSearchStores/my-store', { onProgress });

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'file_complete',
          currentFile: 'file.txt'
        })
      );
    });

    it('should call progress callback with start and complete events for directory', async () => {
      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: 'file1.txt', isFile: () => true, isDirectory: () => false },
      ]);
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024, mtime: new Date() });
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('content'));
      (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock).mockResolvedValue({ name: 'op/1' });

      const onProgress = jest.fn();
      await uploader.uploadDirectory('my-dir', 'fileSearchStores/my-store', { onProgress });

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'start',
          totalFiles: 1,
          percentage: 0
        })
      );

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'complete',
          totalFiles: 1,
          percentage: 100
        })
      );
    });

    it('should work without callback (backward compatibility)', async () => {
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024, mtime: new Date() });
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('content'));
      (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock).mockResolvedValue({ name: 'op/1' });

      await expect(
        uploader.uploadFile('file.txt', 'fileSearchStores/my-store')
      ).resolves.toBeDefined();
    });
  });

  describe('Parallel uploads', () => {
    it('should upload multiple files in parallel', async () => {
      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: 'file1.txt', isFile: () => true, isDirectory: () => false },
        { name: 'file2.txt', isFile: () => true, isDirectory: () => false },
        { name: 'file3.txt', isFile: () => true, isDirectory: () => false },
      ]);
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024, mtime: new Date() });
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('content'));
      (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock).mockResolvedValue({ name: 'op/1' });

      const result = await uploader.uploadDirectory('my-dir', 'fileSearchStores/my-store', {
        parallel: { maxConcurrent: 2 }
      });

      expect(result.length).toBe(3);
      expect(mockGenAI.fileSearchStores.uploadToFileSearchStore).toHaveBeenCalledTimes(3);
    });

    it('should continue on individual failures with Promise.allSettled', async () => {
      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: 'file1.txt', isFile: () => true, isDirectory: () => false },
        { name: 'file2.txt', isFile: () => true, isDirectory: () => false },
      ]);
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024, mtime: new Date() });
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('content'));

      // First file succeeds, second fails
      (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock)
        .mockResolvedValueOnce({ name: 'op/1' })
        .mockRejectedValueOnce(new Error('Upload failed'));

      const result = await uploader.uploadDirectory('my-dir', 'fileSearchStores/my-store');

      // Should return only successful uploads
      expect(result.length).toBe(1);
      expect(result[0]).toEqual({ name: 'op/1' });
    });

    it('should use default maxConcurrent of 5', async () => {
      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: 'file1.txt', isFile: () => true, isDirectory: () => false },
      ]);
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024, mtime: new Date() });
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('content'));
      (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock).mockResolvedValue({ name: 'op/1' });

      // Should work without specifying parallel config
      await expect(
        uploader.uploadDirectory('my-dir', 'fileSearchStores/my-store')
      ).resolves.toBeDefined();
    });
  });

  describe('Smart sync', () => {
    it('should skip unchanged files when smartSync is enabled', async () => {
      // Mock the FileSearchManager listDocuments to return existing file with same hash
      const mockListDocuments = jest.fn().mockResolvedValue([
        {
          name: 'documents/123',
          customMetadata: [
            { key: 'path', stringValue: 'file1.txt' },
            { key: 'hash', stringValue: 'ed7002b439e9ac845f22357d822bac1444730fbdb6016d3ec9432297b9ec9f73' } // hash of 'content'
          ]
        }
      ]);

      // Access the private fileSearchManager to mock it
      (uploader as any).fileSearchManager = {
        listDocuments: mockListDocuments
      };

      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: 'file1.txt', isFile: () => true, isDirectory: () => false },
      ]);
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024, mtime: new Date() });
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('content'));
      (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock).mockResolvedValue({ name: 'op/1' });

      const onProgress = jest.fn();
      const result = await uploader.uploadDirectory('my-dir', 'fileSearchStores/my-store', {
        smartSync: true,
        onProgress
      });

      // Should not upload - file is unchanged
      expect(mockGenAI.fileSearchStores.uploadToFileSearchStore).not.toHaveBeenCalled();
      expect(result.length).toBe(0);

      // Should emit file_skipped event
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'file_skipped',
          currentFile: 'file1.txt',
          skippedFiles: 1
        })
      );
    });

    it('should upload changed files when smartSync is enabled', async () => {
      // Mock existing file with different hash
      const mockListDocuments = jest.fn().mockResolvedValue([
        {
          name: 'documents/123',
          customMetadata: [
            { key: 'path', stringValue: 'file1.txt' },
            { key: 'hash', stringValue: 'different-hash' }
          ]
        }
      ]);

      (uploader as any).fileSearchManager = {
        listDocuments: mockListDocuments
      };

      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: 'file1.txt', isFile: () => true, isDirectory: () => false },
      ]);
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024, mtime: new Date() });
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('content'));
      (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock).mockResolvedValue({ name: 'op/1' });

      const result = await uploader.uploadDirectory('my-dir', 'fileSearchStores/my-store', {
        smartSync: true
      });

      // Should upload - file has changed
      expect(mockGenAI.fileSearchStores.uploadToFileSearchStore).toHaveBeenCalledTimes(1);
      expect(result.length).toBe(1);
    });

    it('should upload new files when smartSync is enabled', async () => {
      // Mock no existing files
      const mockListDocuments = jest.fn().mockResolvedValue([]);

      (uploader as any).fileSearchManager = {
        listDocuments: mockListDocuments
      };

      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: 'file1.txt', isFile: () => true, isDirectory: () => false },
      ]);
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024, mtime: new Date() });
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('content'));
      (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock).mockResolvedValue({ name: 'op/1' });

      const result = await uploader.uploadDirectory('my-dir', 'fileSearchStores/my-store', {
        smartSync: true
      });

      // Should upload - file is new
      expect(mockGenAI.fileSearchStores.uploadToFileSearchStore).toHaveBeenCalledTimes(1);
      expect(result.length).toBe(1);
    });

    it('should upload all files when smartSync is disabled', async () => {
      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: 'file1.txt', isFile: () => true, isDirectory: () => false },
      ]);
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024, mtime: new Date() });
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('content'));
      (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock).mockResolvedValue({ name: 'op/1' });

      const result = await uploader.uploadDirectory('my-dir', 'fileSearchStores/my-store', {
        smartSync: false
      });

      // Should upload regardless of existing files
      expect(mockGenAI.fileSearchStores.uploadToFileSearchStore).toHaveBeenCalledTimes(1);
      expect(result.length).toBe(1);
    });

    it('should include skippedFiles count in complete event', async () => {
      const mockListDocuments = jest.fn().mockResolvedValue([
        {
          name: 'documents/123',
          customMetadata: [
            { key: 'path', stringValue: 'file1.txt' },
            { key: 'hash', stringValue: 'ed7002b439e9ac845f22357d822bac1444730fbdb6016d3ec9432297b9ec9f73' }
          ]
        }
      ]);

      (uploader as any).fileSearchManager = {
        listDocuments: mockListDocuments
      };

      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: 'file1.txt', isFile: () => true, isDirectory: () => false },
        { name: 'file2.txt', isFile: () => true, isDirectory: () => false },
      ]);
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024, mtime: new Date() });
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('content'));
      (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock).mockResolvedValue({ name: 'op/1' });

      const onProgress = jest.fn();
      await uploader.uploadDirectory('my-dir', 'fileSearchStores/my-store', {
        smartSync: true,
        onProgress
      });

      // Should emit complete event with skipped count
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'complete',
          skippedFiles: 1,
          completedFiles: 1 // file2.txt is new so it gets uploaded
        })
      );
    });

    it('should handle listDocuments failure gracefully', async () => {
      const mockListDocuments = jest.fn().mockRejectedValue(new Error('API error'));

      (uploader as any).fileSearchManager = {
        listDocuments: mockListDocuments
      };

      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: 'file1.txt', isFile: () => true, isDirectory: () => false },
      ]);
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024, mtime: new Date() });
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('content'));
      (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock).mockResolvedValue({ name: 'op/1' });

      // Should not throw - continues with upload
      const result = await uploader.uploadDirectory('my-dir', 'fileSearchStores/my-store', {
        smartSync: true
      });

      // Should upload all files since we couldn't get existing hashes
      expect(mockGenAI.fileSearchStores.uploadToFileSearchStore).toHaveBeenCalledTimes(1);
      expect(result.length).toBe(1);
    });
  });

  describe('Error handling', () => {
    it('should throw FileUploadError when upload fails', async () => {
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024, mtime: new Date() });
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('content'));
      (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock)
        .mockRejectedValue(new Error('API error'));

      const FileUploadError = jest.requireActual('./mimeTypes').FileUploadError;
      (mimeTypes.FileUploadError as any) = FileUploadError;

      await expect(
        uploader.uploadFile('file.txt', 'fileSearchStores/my-store')
      ).rejects.toThrow();
    });

    it('should call progress callback with file_error event on failure', async () => {
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024, mtime: new Date() });
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('content'));
      const apiError = new Error('API error');
      (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock)
        .mockRejectedValue(apiError);

      const FileUploadError = jest.requireActual('./mimeTypes').FileUploadError;
      (mimeTypes.FileUploadError as any) = FileUploadError;

      const onProgress = jest.fn();

      await expect(
        uploader.uploadFile('file.txt', 'fileSearchStores/my-store', { onProgress })
      ).rejects.toThrow();

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'file_error',
          currentFile: 'file.txt',
          error: apiError
        })
      );
    });
  });
});
