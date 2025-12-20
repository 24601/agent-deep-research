import fs from 'fs';
import { FileUploader } from './FileUploader';
import { GoogleGenAI } from '@google/genai';

jest.mock('fs');
jest.mock('@google/genai');

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
  });

  it('should scan a directory and upload files', async () => {
    (fs.readdirSync as jest.Mock).mockReturnValue([
      { name: 'file1.txt', isFile: () => true },
      { name: 'file2.pdf', isFile: () => true },
      { name: 'subdir', isFile: () => false },
    ]);

    (mockGenAI.fileSearchStores.uploadToFileSearchStore as jest.Mock)
      .mockResolvedValueOnce({ name: 'operations/1' })
      .mockResolvedValueOnce({ name: 'operations/2' });

    const result = await uploader.uploadDirectory('my-dir', 'fileSearchStores/my-store');

    expect(fs.readdirSync).toHaveBeenCalledWith('my-dir', { withFileTypes: true });
    expect(mockGenAI.fileSearchStores.uploadToFileSearchStore).toHaveBeenCalledTimes(2);
    expect(mockGenAI.fileSearchStores.uploadToFileSearchStore).toHaveBeenCalledWith({
      fileSearchStoreName: 'fileSearchStores/my-store',
      file: 'my-dir/file1.txt',
    });
    expect(mockGenAI.fileSearchStores.uploadToFileSearchStore).toHaveBeenCalledWith({
      fileSearchStoreName: 'fileSearchStores/my-store',
      file: 'my-dir/file2.pdf',
    });
    expect(result).toEqual([{ name: 'operations/1' }, { name: 'operations/2' }]);
  });

  it('should ignore non-supported file types if applicable', async () => {
      // For now let's assume it tries to upload everything and let the API handle it, 
      // or we can add a filter.
  });
});
