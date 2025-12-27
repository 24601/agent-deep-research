import { UploadOperationManager } from './UploadOperationManager';
import { WorkspaceConfigManager, UploadOperation } from '../config/WorkspaceConfig';

jest.mock('../config/WorkspaceConfig');

describe('UploadOperationManager', () => {
  let manager: UploadOperationManager;
  let mockOperations: Record<string, UploadOperation>;

  beforeEach(() => {
    manager = new UploadOperationManager();
    mockOperations = {};
    jest.clearAllMocks();

    // Setup WorkspaceConfigManager mocks
    (WorkspaceConfigManager.getUploadOperation as jest.Mock).mockImplementation(
      (id: string) => mockOperations[id]
    );
    (WorkspaceConfigManager.setUploadOperation as jest.Mock).mockImplementation(
      (id: string, operation: UploadOperation) => {
        mockOperations[id] = operation;
      }
    );
    (WorkspaceConfigManager.getAllUploadOperations as jest.Mock).mockImplementation(
      () => mockOperations
    );
  });

  describe('createOperation', () => {
    it('should create a new operation with pending status', () => {
      const operation = manager.createOperation('/path/to/dir', 'fileSearchStores/test', false);

      expect(operation.id).toBeDefined();
      expect(operation.status).toBe('pending');
      expect(operation.path).toBe('/path/to/dir');
      expect(operation.storeName).toBe('fileSearchStores/test');
      expect(operation.smartSync).toBe(false);
      expect(operation.totalFiles).toBe(0);
      expect(operation.completedFiles).toBe(0);
      expect(operation.skippedFiles).toBe(0);
      expect(operation.failedFiles).toBe(0);
      expect(operation.startedAt).toBeDefined();
    });

    it('should persist the operation', () => {
      const operation = manager.createOperation('/path/to/dir', 'fileSearchStores/test', true, 10);

      expect(WorkspaceConfigManager.setUploadOperation).toHaveBeenCalledWith(
        operation.id,
        expect.objectContaining({
          id: operation.id,
          status: 'pending',
          smartSync: true,
          totalFiles: 10,
        })
      );
    });

    it('should generate unique IDs', () => {
      const op1 = manager.createOperation('/path1', 'store1', false);
      const op2 = manager.createOperation('/path2', 'store2', false);

      expect(op1.id).not.toBe(op2.id);
    });
  });

  describe('getOperation', () => {
    it('should return the operation if it exists', () => {
      const operation = manager.createOperation('/path', 'store', false);
      const retrieved = manager.getOperation(operation.id);

      expect(retrieved).toEqual(operation);
    });

    it('should return undefined for non-existent operation', () => {
      const retrieved = manager.getOperation('non-existent-id');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('updateOperation', () => {
    it('should update operation fields', () => {
      const operation = manager.createOperation('/path', 'store', false);

      const updated = manager.updateOperation(operation.id, {
        completedFiles: 5,
        totalFiles: 10,
      });

      expect(updated?.completedFiles).toBe(5);
      expect(updated?.totalFiles).toBe(10);
      expect(updated?.path).toBe('/path'); // Original field preserved
    });

    it('should persist updates', () => {
      const operation = manager.createOperation('/path', 'store', false);
      jest.clearAllMocks();

      manager.updateOperation(operation.id, { completedFiles: 3 });

      expect(WorkspaceConfigManager.setUploadOperation).toHaveBeenCalledWith(
        operation.id,
        expect.objectContaining({
          completedFiles: 3,
        })
      );
    });

    it('should return undefined for non-existent operation', () => {
      const updated = manager.updateOperation('non-existent-id', { completedFiles: 5 });

      expect(updated).toBeUndefined();
    });
  });

  describe('listOperations', () => {
    it('should return all operations', () => {
      manager.createOperation('/path1', 'store1', false);
      manager.createOperation('/path2', 'store2', true);

      const operations = manager.listOperations();

      expect(operations.length).toBe(2);
    });

    it('should return empty array when no operations', () => {
      const operations = manager.listOperations();

      expect(operations).toEqual([]);
    });
  });

  describe('markInProgress', () => {
    it('should update status to in_progress and set totalFiles', () => {
      const operation = manager.createOperation('/path', 'store', false);

      const updated = manager.markInProgress(operation.id, 100);

      expect(updated?.status).toBe('in_progress');
      expect(updated?.totalFiles).toBe(100);
    });
  });

  describe('markCompleted', () => {
    it('should update status to completed and set completedAt', () => {
      const operation = manager.createOperation('/path', 'store', false);

      const updated = manager.markCompleted(operation.id);

      expect(updated?.status).toBe('completed');
      expect(updated?.completedAt).toBeDefined();
    });
  });

  describe('markFailed', () => {
    it('should update status to failed with error message', () => {
      const operation = manager.createOperation('/path', 'store', false);

      const updated = manager.markFailed(operation.id, 'Upload failed: API error');

      expect(updated?.status).toBe('failed');
      expect(updated?.error).toBe('Upload failed: API error');
      expect(updated?.completedAt).toBeDefined();
    });
  });

  describe('updateProgress', () => {
    it('should update all progress counters', () => {
      const operation = manager.createOperation('/path', 'store', false);

      const updated = manager.updateProgress(operation.id, 5, 3, 2);

      expect(updated?.completedFiles).toBe(5);
      expect(updated?.skippedFiles).toBe(3);
      expect(updated?.failedFiles).toBe(2);
    });
  });

  describe('addFailedFile', () => {
    it('should add a failed file to the list', () => {
      const operation = manager.createOperation('/path', 'store', false);

      const updated = manager.addFailedFile(operation.id, 'test.txt', 'Upload failed');

      expect(updated?.failedFiles).toBe(1);
      expect(updated?.failedFilesList).toEqual([
        { file: 'test.txt', error: 'Upload failed' }
      ]);
    });

    it('should append multiple failed files', () => {
      const operation = manager.createOperation('/path', 'store', false);

      manager.addFailedFile(operation.id, 'file1.txt', 'Error 1');
      const updated = manager.addFailedFile(operation.id, 'file2.txt', 'Error 2');

      expect(updated?.failedFiles).toBe(2);
      expect(updated?.failedFilesList).toEqual([
        { file: 'file1.txt', error: 'Error 1' },
        { file: 'file2.txt', error: 'Error 2' }
      ]);
    });

    it('should return undefined for non-existent operation', () => {
      const updated = manager.addFailedFile('non-existent-id', 'test.txt', 'Error');

      expect(updated).toBeUndefined();
    });
  });

  describe('createOperation', () => {
    it('should initialize failedFilesList as empty array', () => {
      const operation = manager.createOperation('/path', 'store', false);

      expect(operation.failedFilesList).toEqual([]);
    });
  });
});
