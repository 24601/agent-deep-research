import { FileSearchManager } from './FileSearchManager';
import { GoogleGenAI } from '@google/genai';

jest.mock('@google/genai');

describe('FileSearchManager', () => {
  let mockGenAI: jest.Mocked<GoogleGenAI>;
  let manager: FileSearchManager;

  beforeEach(() => {
    mockGenAI = {
      fileSearchStores: {
        create: jest.fn(),
        list: jest.fn(),
        get: jest.fn(),
        delete: jest.fn(),
      },
      interactions: {
        create: jest.fn(),
      },
    } as unknown as jest.Mocked<GoogleGenAI>;
    manager = new FileSearchManager(mockGenAI);
  });

  it('should create a file search store', async () => {
    const mockStore = { name: 'fileSearchStores/my-store' };
    (mockGenAI.fileSearchStores.create as jest.Mock).mockResolvedValue(mockStore);

    const result = await manager.createStore('my-store');
    
    expect(mockGenAI.fileSearchStores.create).toHaveBeenCalledWith({
      config: {
        displayName: 'my-store',
      }
    });
    expect(result).toEqual(mockStore);
  });

  it('should list file search stores', async () => {
    const mockStores = [
      { name: 'fileSearchStores/store-1', displayName: 'Store 1' },
      { name: 'fileSearchStores/store-2', displayName: 'Store 2' },
    ];
    (mockGenAI.fileSearchStores.list as jest.Mock).mockResolvedValue(mockStores);

    const result = await manager.listStores();
    
    expect(mockGenAI.fileSearchStores.list).toHaveBeenCalled();
    expect(result).toEqual(mockStores);
  });

  it('should get a file search store', async () => {
    const mockStore = { name: 'fileSearchStores/my-store', displayName: 'My Store' };
    (mockGenAI.fileSearchStores.get as jest.Mock).mockResolvedValue(mockStore);

    const result = await manager.getStore('fileSearchStores/my-store');
    
    expect(mockGenAI.fileSearchStores.get).toHaveBeenCalledWith({ name: 'fileSearchStores/my-store' });
    expect(result).toEqual(mockStore);
  });

  it('should delete a file search store', async () => {
    (mockGenAI.fileSearchStores.delete as jest.Mock).mockResolvedValue({});

    await manager.deleteStore('fileSearchStores/my-store');
    
    expect(mockGenAI.fileSearchStores.delete).toHaveBeenCalledWith({ name: 'fileSearchStores/my-store', config: { force: false } });
  });

  it('should delete a file search store with force option', async () => {
    (mockGenAI.fileSearchStores.delete as jest.Mock).mockResolvedValue({});

    await manager.deleteStore('fileSearchStores/my-store', true);
    
    expect(mockGenAI.fileSearchStores.delete).toHaveBeenCalledWith({ name: 'fileSearchStores/my-store', config: { force: true } });
  });

  it('should query a file search store', async () => {
    const mockInteraction = {
      outputs: [{ text: 'Answer grounded in file content.' }]
    };
    (mockGenAI.interactions.create as jest.Mock).mockResolvedValue(mockInteraction);

    const result = await manager.queryStore('fileSearchStores/my-store', 'What is inside?', 'gemini-2.5-flash');

    expect(mockGenAI.interactions.create).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      input: 'What is inside?',
      tools: [{ 
          fileSearch: { 
              fileSearchStoreNames: ['fileSearchStores/my-store'] 
          } 
      }]
    });
    expect(result).toEqual(mockInteraction);
  });
});