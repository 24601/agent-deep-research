import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

export class FileUploader {
  constructor(private client: GoogleGenAI) {}

  async uploadDirectory(dirPath: string, storeName: string, config?: { chunkingConfig?: any }) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(dirPath, entry.name));

    const operations = [];
    for (const filePath of files) {
      const fileName = path.basename(filePath);
      const op = await this.client.fileSearchStores.uploadToFileSearchStore({
        fileSearchStoreName: storeName,
        file: filePath,
        config: {
          displayName: fileName,
          ...config,
        },
      });
      operations.push(op);
    }
    return operations;
  }
}
