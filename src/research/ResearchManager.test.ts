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

  it('should start research with fileSearchStoreNames helper', async () => {
    const mockInteraction = { id: 'interaction-123', status: 'in_progress' };
    (mockGenAI.interactions.create as jest.Mock).mockResolvedValue(mockInteraction);

    const result = await manager.startResearch({
      input: 'Search my files',
      model: 'gemini-2.5-flash',
      fileSearchStoreNames: ['store-1', 'store-2']
    });

    expect(mockGenAI.interactions.create).toHaveBeenCalledWith({
      input: 'Search my files',
      model: 'gemini-2.5-flash',
      background: true,
      tools: [{
        fileSearch: {
          fileSearchStoreNames: ['store-1', 'store-2']
        }
      }]
    });
    expect(result).toEqual(mockInteraction);
  });

  it('should support mixed tools and fileSearchStoreNames', async () => {
    const mockInteraction = { id: 'interaction-123', status: 'in_progress' };
    (mockGenAI.interactions.create as jest.Mock).mockResolvedValue(mockInteraction);

    const result = await manager.startResearch({
      input: 'Mixed tools',
      model: 'gemini-2.5-flash',
      tools: [{ googleSearch: {} }],
      fileSearchStoreNames: ['store-1']
    });

    expect(mockGenAI.interactions.create).toHaveBeenCalledWith({
      input: 'Mixed tools',
      model: 'gemini-2.5-flash',
      background: true,
      tools: [
        { googleSearch: {} },
        { fileSearch: { fileSearchStoreNames: ['store-1'] } }
      ]
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

  it('should delete an interaction', async () => {
    (mockGenAI.interactions.delete as jest.Mock).mockResolvedValue({});

    await manager.deleteResearch('interaction-123');

    expect(mockGenAI.interactions.delete).toHaveBeenCalledWith('interaction-123');
  });

  it('should poll research status until completion', async () => {
    (mockGenAI.interactions.get as jest.Mock)
      .mockResolvedValueOnce({ id: 'interaction-123', status: 'in_progress' })
      .mockResolvedValueOnce({ id: 'interaction-123', status: 'completed', outputs: [{ type: 'text', text: 'Result' }] });

    const result = await manager.pollResearch('interaction-123', 10); // 10ms interval for test

    expect(mockGenAI.interactions.get).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('completed');
    expect(result.outputs).toEqual([{ type: 'text', text: 'Result' }]);
  });

  it('should poll research status until failure', async () => {
    (mockGenAI.interactions.get as jest.Mock)
      .mockResolvedValueOnce({ id: 'interaction-123', status: 'in_progress' })
      .mockResolvedValueOnce({ id: 'interaction-123', status: 'failed', error: { message: 'Oops' } });

    const result = await manager.pollResearch('interaction-123', 10);

    expect(mockGenAI.interactions.get).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('failed');
    expect(result.error?.message).toBe('Oops');
  });

  it('should poll research status with default interval', async () => {
    (mockGenAI.interactions.get as jest.Mock)
      .mockResolvedValueOnce({ id: 'interaction-123', status: 'completed' });

    // We don't want to actually wait 5 seconds in test, 
    // but since it completes immediately in this mock, it shouldn't wait.
    const result = await manager.pollResearch('interaction-123');

    expect(mockGenAI.interactions.get).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('completed');
  });
});
