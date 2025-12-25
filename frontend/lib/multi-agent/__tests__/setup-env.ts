/**
 * Environment Setup
 * 
 * Loads environment variables from .env.local before any other imports.
 * This must be imported FIRST in test files.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local file (Next.js convention)
// Use absolute path from project root
const envPath = resolve(process.cwd(), '.env.local');
const result = config({ path: envPath });

if (result.error) {
  console.warn(`⚠️ [TEST-SETUP] Could not load .env.local: ${result.error.message}`);
} else {
  const loadedCount = Object.keys(result.parsed || {}).length;
  console.log(`✅ [TEST-SETUP] Loaded ${loadedCount} environment variables from .env.local`);
}

