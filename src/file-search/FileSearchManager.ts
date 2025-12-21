import { GoogleGenAI } from '@google/genai';

export class FileSearchManager {
  constructor(private client: GoogleGenAI) {}

  async createStore(displayName: string) {
    return await this.client.fileSearchStores.create({
      config: {
        displayName,
      },
    });
  }

  async listStores() {
    return await this.client.fileSearchStores.list();
  }

  async getStore(name: string) {
    return await this.client.fileSearchStores.get({ name });
  }

  async deleteStore(name: string, force: boolean = false) {
    return await this.client.fileSearchStores.delete({ name, config: { force } });
  }

  async queryStore(storeName: string, query: string, model: string = 'gemini-2.5-flash'): Promise<any> {
    return await this.client.interactions.create({
      model: model,
      input: query,
      tools: [
        {
          // @ts-ignore
          type: 'file_search',
          file_search_store_names: [storeName],
        } as any,
      ],
    });
  }
}