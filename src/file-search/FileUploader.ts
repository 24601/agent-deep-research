import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

export class FileUploader {
  constructor(private client: GoogleGenAI) {}

  async uploadDirectory(dirPath: string, storeName: string) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(dirPath, entry.name));

    const operations = [];
    for (const filePath of files) {
      const op = await this.client.fileSearchStores.uploadToFileSearchStore({
        fileSearchStoreName: storeName,
        file: filePath,
      });
      operations.push(op);
    }
    return operations;
  }
}
