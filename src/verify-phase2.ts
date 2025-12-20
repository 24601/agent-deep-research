import { GoogleGenAI } from '@google/genai';
import { FileSearchManager } from './file-search/FileSearchManager';
import { FileUploader } from './file-search/FileUploader';
import * as fs from 'fs';
import * as path from 'path';

async function verify() {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_GENAI_API_KEY environment variable is required.');
    process.exit(1);
  }

  const client = new GoogleGenAI({ apiKey });
  const manager = new FileSearchManager(client);
  const uploader = new FileUploader(client);

  const testStoreName = `verify-phase2-${Date.now()}`;

  console.log(`Creating store: ${testStoreName}...`);
  const store = await manager.createStore(testStoreName);
  console.log('Created store:', store.name);

  console.log('Listing stores...');
  const stores = await manager.listStores();
  let found = false;
  // @ts-ignore - Pager is iterable
  for await (const s of stores) {
    if (s.name === store.name) {
      found = true;
      break;
    }
  }

  if (found) {
    console.log('Success: Store found in list.');
  } else {
    console.error('Error: Store NOT found in list.');
  }

  console.log('Getting store details...');
  const storeDetails = await manager.getStore(store.name!);
  console.log('Store details:', JSON.stringify(storeDetails, null, 2));

  // File Upload Verification
  const tempDir = path.join(process.cwd(), 'temp-verify-upload');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
  fs.writeFileSync(path.join(tempDir, 'test1.txt'), 'Hello from verify script 1');
  fs.writeFileSync(path.join(tempDir, 'test2.txt'), 'Hello from verify script 2');

  console.log(`Uploading directory ${tempDir} to ${store.name}...`);
  try {
    const ops = await uploader.uploadDirectory(tempDir, store.name!, {
      chunkingConfig: {
        whiteSpaceConfig: {
          maxTokensPerChunk: 500,
          maxOverlapTokens: 50
        }
      }
    });
    console.log(`Upload operations started: ${ops.length}`);
    ops.forEach((op, i) => console.log(`  Op ${i+1}:`, op.name));
  } catch (error) {
    console.error('Upload failed:', error);
  } finally {
    // Cleanup files
    fs.unlinkSync(path.join(tempDir, 'test1.txt'));
    fs.unlinkSync(path.join(tempDir, 'test2.txt'));
    fs.rmdirSync(tempDir);
  }

  console.log(`Deleting store: ${store.name} with force=true...`);
  await manager.deleteStore(store.name!, true);
  console.log('Store deleted.');

  console.log('Verification script finished.');
}

verify().catch(console.error);
