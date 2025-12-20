import { ResearchManager } from './ResearchManager';
import { GoogleGenAI } from '@google/genai';

jest.mock('@google/genai');

describe('ResearchManager', () => {
  let mockGenAI: jest.Mocked<GoogleGenAI>;
  let manager: ResearchManager;

  beforeEach(() => {
    mockGenAI = {
      interactions: {
        create: jest.fn(),
        get: jest.fn(),
        delete: jest.fn(),
        cancel: jest.fn(),
      },
    } as unknown as jest.Mocked<GoogleGenAI>;
    manager = new ResearchManager(mockGenAI);
    jest.clearAllMocks();
  });

  it('should start a background research interaction', async () => {
    const mockInteraction = { id: 'interaction-123', status: 'in_progress' };
    (mockGenAI.interactions.create as jest.Mock).mockResolvedValue(mockInteraction);

    const result = await manager.startResearch({
      input: 'Who is Allen Hutchison?',
      model: 'gemini-2.5-flash',
      tools: [{ fileSearch: { fileSearchStoreNames: ['my-store'] } }]
    });

    expect(mockGenAI.interactions.create).toHaveBeenCalledWith({
      input: 'Who is Allen Hutchison?',
      model: 'gemini-2.5-flash',
      background: true,
      tools: [{ fileSearch: { fileSearchStoreNames: ['my-store'] } }]
    });
    expect(result).toEqual(mockInteraction);
  });

  it('should get research status', async () => {
    const mockInteraction = { id: 'interaction-123', status: 'completed' };
    (mockGenAI.interactions.get as jest.Mock).mockResolvedValue(mockInteraction);

    const result = await manager.getResearchStatus('interaction-123');

    expect(mockGenAI.interactions.get).toHaveBeenCalledWith('interaction-123');
    expect(result).toEqual(mockInteraction);
  });

  it('should cancel an interaction', async () => {
    (mockGenAI.interactions.cancel as jest.Mock).mockResolvedValue({ id: 'interaction-123', status: 'cancelled' });

    await manager.cancelResearch('interaction-123');

    expect(mockGenAI.interactions.cancel).toHaveBeenCalledWith('interaction-123');
  });
});
