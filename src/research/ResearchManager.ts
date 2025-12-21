import { GoogleGenAI } from '@google/genai';

export interface StartResearchParams {
  input: string;
  model: string;
  tools?: any[];
  fileSearchStoreNames?: string[];
  agent?: string;
  agentConfig?: any;
}

export class ResearchManager {
  constructor(private client: GoogleGenAI) {}

  async startResearch(params: StartResearchParams): Promise<any> {
    const { input, model, tools = [], fileSearchStoreNames } = params;
    
    const finalTools = [...tools];
    if (fileSearchStoreNames && fileSearchStoreNames.length > 0) {
      finalTools.push({
        // @ts-ignore
        type: 'file_search',
        file_search_store_names: fileSearchStoreNames,
      });
    }

    // Default to the Deep Research agent if no specific model/agent is provided
    // The API uses 'agent' for this specific capability.
    const agentName = model || 'deep-research-pro-preview-12-2025';

    return await this.client.interactions.create({
      input,
      agent: agentName,
      background: true,
      tools: finalTools.length > 0 ? finalTools : undefined,
    });
  }

  async getResearchStatus(id: string): Promise<any> {
    return await this.client.interactions.get(id);
  }

  async cancelResearch(id: string): Promise<any> {
    return await this.client.interactions.cancel(id);
  }

  async deleteResearch(id: string): Promise<any> {
    return await this.client.interactions.delete(id);
  }

  async pollResearch(id: string, intervalMs: number = 5000): Promise<any> {
    while (true) {
      const interaction = await this.getResearchStatus(id);
      if (interaction.status === 'completed' || interaction.status === 'failed' || interaction.status === 'cancelled') {
        return interaction;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}
