import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import { FileSearchManager } from './file-search/FileSearchManager.js';
import { FileUploader } from './file-search/FileUploader.js';
import { ResearchManager } from './research/ResearchManager.js';
import { ReportGenerator } from './reporting/ReportGenerator.js';
import { WorkspaceConfigManager } from './config/WorkspaceConfig.js';
import * as fs from 'fs';
import * as path from 'path';

// Initialize SDK and Managers
const apiKey = process.env.GEMINI_DEEP_RESEARCH_API_KEY || process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error('Error: API key not found.');
  console.error('Please set either GEMINI_DEEP_RESEARCH_API_KEY or GEMINI_API_KEY environment variable.');
  process.exit(1);
}

const client = new GoogleGenAI({ apiKey });

const defaultModel = process.env.GEMINI_DEEP_RESEARCH_MODEL || process.env.GEMINI_MODEL || 'models/gemini-flash-latest';

const fileSearchManager = new FileSearchManager(client);
const fileUploader = new FileUploader(client);
const researchManager = new ResearchManager(client);
const reportGenerator = new ReportGenerator();

const server = new McpServer({
  name: 'gemini-deep-research',
  version: '1.0.0',
});

// --- File Search Tools ---

server.registerTool(
  'file_search_create_store',
  {
    description: 'Creates a new file search store for RAG grounding.',
    inputSchema: z.object({
      displayName: z.string().describe('The display name for the store'),
    }).shape,
  },
  async ({ displayName }) => {
    const store = await fileSearchManager.createStore(displayName);
    WorkspaceConfigManager.addFileSearchStore(displayName, store.name!);
    return { content: [{ type: 'text', text: `Created store: ${store.name} (${displayName})` }] };
  }
);

server.registerTool(
  'file_search_list_stores',
  {
    description: 'Lists all available file search stores.',
    inputSchema: z.object({}).shape,
  },
  async () => {
    const stores = await fileSearchManager.listStores();
    const storeList = [];
    // @ts-ignore - stores is an async iterable Pager
    for await (const store of stores) {
      storeList.push({ name: store.name, displayName: store.displayName });
    }
    return { content: [{ type: 'text', text: JSON.stringify(storeList, null, 2) }] };
  }
);

server.registerTool(
  'file_search_upload',
  {
    description: 'Uploads a file or recursively uploads a directory to a file search store.',
    inputSchema: z.object({
      path: z.string().describe('Absolute path to the local file or directory'),
      storeName: z.string().describe('The resource name of the file search store (e.g., fileSearchStores/...)'),
    }).shape,
  },
  async ({ path: fsPath, storeName }) => {
    if (!fs.existsSync(fsPath)) {
      return { isError: true, content: [{ type: 'text', text: `Path not found: ${fsPath}` }] };
    }

    const stats = fs.statSync(fsPath);
    if (stats.isDirectory()) {
        const ops = await fileUploader.uploadDirectory(fsPath, storeName);
        return { content: [{ type: 'text', text: `Started ${ops.length} upload operations to ${storeName} from directory ${fsPath}` }] };
    } else if (stats.isFile()) {
        await fileUploader.uploadFile(fsPath, storeName);
        return { content: [{ type: 'text', text: `Uploaded file ${fsPath} to ${storeName}` }] };
    } else {
        return { isError: true, content: [{ type: 'text', text: `Path is not a file or directory: ${fsPath}` }] };
    }
  }
);

server.registerTool(
  'file_search_delete_store',
  {
    description: 'Deletes a file search store.',
    inputSchema: z.object({
      name: z.string().describe('The resource name of the store to delete'),
      force: z.boolean().optional().default(false).describe('Whether to force delete even if contains documents'),
    }).shape,
  },
  async ({ name, force }) => {
    await fileSearchManager.deleteStore(name, force);
    return { content: [{ type: 'text', text: `Deleted store: ${name}` }] };
  }
);

server.registerTool(
  'file_search_query',
  {
    description: 'Queries a file search store using a model to get grounded answers.',
    inputSchema: z.object({
      query: z.string().describe('The question to ask the model'),
      storeName: z.string().describe('The resource name of the file search store'),
    }).shape,
  },
  async ({ query, storeName }) => {
    try {
      const interaction = await fileSearchManager.queryStore(storeName, query, defaultModel);
      // Retrieve the last text output
      const outputs = interaction.outputs || [];
      const lastOutput = outputs[outputs.length - 1];
      const text = lastOutput?.text || 'No response generated.';
      
      return { content: [{ type: 'text', text }] };
    } catch (error: any) {
      return { isError: true, content: [{ type: 'text', text: `Query failed: ${error.message}` }] };
    }
  }
);

// --- Research Tools ---

server.registerTool(
  'research_start',
  {
    description: 'Starts a new Deep Research interaction in the background.',
    inputSchema: z.object({
      input: z.string().describe('The research query or instructions'),
      model: z.string().optional().default('deep-research-pro-preview-12-2025').describe('The agent to use (default: deep-research-pro-preview-12-2025)'),
      fileSearchStoreNames: z.array(z.string()).optional().describe('Optional list of file search store names for grounding'),
    }).shape,
  },
  async ({ input, model, fileSearchStoreNames }) => {
    const interaction = await researchManager.startResearch({
      input,
      model,
      fileSearchStoreNames,
    });
    if (interaction.id) {
        WorkspaceConfigManager.addResearchId(interaction.id);
    }
    return { 
      content: [{ 
        type: 'text', 
        text: `Research started. ID: ${interaction.id}\nStatus: ${interaction.status}\nUse research_status to check progress.` 
      }] 
    };
  }
);

server.registerTool(
  'research_status',
  {
    description: 'Checks the status and retrieves outputs of a Deep Research interaction.',
    inputSchema: z.object({
      id: z.string().describe('The interaction ID'),
    }).shape,
  },
  async ({ id }) => {
    const interaction = await researchManager.getResearchStatus(id);
    return { content: [{ type: 'text', text: JSON.stringify(interaction, null, 2) }] };
  }
);

server.registerTool(
  'research_save_report',
  {
    description: 'Generates a Markdown report from a completed research interaction and saves it to a file.',
    inputSchema: z.object({
      id: z.string().describe('The interaction ID'),
      filePath: z.string().describe('The local file path to save the report (e.g., report.md)'),
    }).shape,
  },
  async ({ id, filePath }) => {
    const interaction = await researchManager.getResearchStatus(id);
    if (interaction.status !== 'completed') {
      return { isError: true, content: [{ type: 'text', text: `Interaction ${id} is not completed. Current status: ${interaction.status}` }] };
    }
    
    if (!interaction.outputs) {
      return { isError: true, content: [{ type: 'text', text: 'No outputs found for this interaction.' }] };
    }

    const markdown = reportGenerator.generateMarkdown(interaction.outputs);
    fs.writeFileSync(filePath, markdown);
    return { content: [{ type: 'text', text: `Report saved to ${filePath}` }] };
  }
);

// --- Start Server ---

async function main() {
  const transport = new StdioServerTransport();
  // Ensure config file exists
  WorkspaceConfigManager.load();
  await server.connect(transport);
  console.error('Gemini Deep Research MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main:', error);
  process.exit(1);
});
