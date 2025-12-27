import fs from 'fs';
import path from 'path';
import { z } from 'zod';

export const FailedFileSchema = z.object({
  file: z.string(),
  error: z.string(),
});

export type FailedFile = z.infer<typeof FailedFileSchema>;

export const UploadOperationSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
  path: z.string(),
  storeName: z.string(),
  smartSync: z.boolean(),
  totalFiles: z.number(),
  completedFiles: z.number(),
  skippedFiles: z.number(),
  failedFiles: z.number(),
  failedFilesList: z.array(FailedFileSchema).default([]),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
});

export type UploadOperation = z.infer<typeof UploadOperationSchema>;

export const WorkspaceConfigSchema = z.object({
  researchIds: z.array(z.string()).default([]),
  fileSearchStores: z.record(z.string(), z.string()).default({}),
  uploadOperations: z.record(z.string(), UploadOperationSchema).default({}),
});

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

export class WorkspaceConfigManager {
  private static configPath = path.resolve(process.cwd(), '.gemini-research.json');

  static load(): WorkspaceConfig {
    if (!fs.existsSync(this.configPath)) {
      const defaultConfig: WorkspaceConfig = { researchIds: [], fileSearchStores: {}, uploadOperations: {} };
      this.save(defaultConfig);
      return defaultConfig;
    }

    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(content);
      return WorkspaceConfigSchema.parse(parsed);
    } catch (error) {
      // In case of error (e.g. corrupted file), return default or throw?
      // For now, let's return default but maybe log warning?
      // adhering to spec: "Persistence: Stores research IDs and local settings"
      // If file is corrupt, safer to return default to avoid crashing, but ideally we'd warn.
      return { researchIds: [], fileSearchStores: {}, uploadOperations: {} };
    }
  }

  static save(config: WorkspaceConfig): void {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  static addResearchId(id: string): void {
    const config = this.load();
    if (!config.researchIds.includes(id)) {
        config.researchIds.push(id);
        this.save(config);
    }
  }

  static addFileSearchStore(name: string, resourceName: string): void {
    const config = this.load();
    config.fileSearchStores[name] = resourceName;
    this.save(config);
  }

  static getUploadOperation(id: string): UploadOperation | undefined {
    const config = this.load();
    return config.uploadOperations[id];
  }

  static setUploadOperation(id: string, operation: UploadOperation): void {
    const config = this.load();
    config.uploadOperations[id] = operation;
    this.save(config);
  }

  static getAllUploadOperations(): Record<string, UploadOperation> {
    const config = this.load();
    return config.uploadOperations;
  }
}
