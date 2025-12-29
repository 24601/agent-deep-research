import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'path';

// Mock fs before importing WorkspaceConfigManager
const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();

jest.unstable_mockModule('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}));

// Dynamic import after mocking
const { WorkspaceConfigManager } = await import('./WorkspaceConfig');

describe('WorkspaceConfigManager', () => {
  const mockConfigPath = path.resolve(process.cwd(), '.gemini-research.json');
  const mockConfig = {
    researchIds: ['research-123'],
    fileSearchStores: {
      'my-store': 'stores/store-456',
    },
    uploadOperations: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load existing config', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));

    const config = WorkspaceConfigManager.load();
    expect(config).toEqual(mockConfig);
    expect(mockReadFileSync).toHaveBeenCalledWith(mockConfigPath, 'utf-8');
  });

  it('should return default config if file does not exist', () => {
    mockExistsSync.mockReturnValue(false);

    const config = WorkspaceConfigManager.load();
    expect(config).toEqual({ researchIds: [], fileSearchStores: {}, uploadOperations: {} });
  });

  it('should save config', () => {
    WorkspaceConfigManager.save(mockConfig);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      mockConfigPath,
      JSON.stringify(mockConfig, null, 2)
    );
  });

  it('should add a research ID', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ researchIds: [], fileSearchStores: {} }));

    WorkspaceConfigManager.addResearchId('new-id');

    expect(mockWriteFileSync).toHaveBeenCalledWith(
        mockConfigPath,
        expect.stringContaining('"researchIds": [\n    "new-id"\n  ]')
    );
  });

  it('should add a file search store', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ researchIds: [], fileSearchStores: {} }));

    WorkspaceConfigManager.addFileSearchStore('new-store', 'stores/123');

    expect(mockWriteFileSync).toHaveBeenCalledWith(
        mockConfigPath,
        expect.stringContaining('"new-store": "stores/123"')
    );
  });
});
