import { GoogleGenAI } from '@google/genai';

export interface StartResearchParams {
  input: string;
  model: string;
  tools?: any[];
  agent?: string;
  agentConfig?: any;
}

export class ResearchManager {
  constructor(private client: GoogleGenAI) {}

  async startResearch(params: StartResearchParams) {
    const { input, model, tools, agent, agentConfig } = params;
    return await this.client.interactions.create({
      input,
      model,
      background: true,
      tools,
      agent,
      agentConfig,
    });
  }

  async getResearchStatus(id: string) {
    return await this.client.interactions.get(id);
  }

  async cancelResearch(id: string) {
    return await this.client.interactions.cancel(id);
  }

  async deleteResearch(id: string) {
    return await this.client.interactions.delete(id);
  }
}
