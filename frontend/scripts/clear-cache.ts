/**
 * Clear FuelSense Redis cache (routes, ports, etc.).
 * Loads .env.local and calls ServiceContainer.cleanup().
 *
 * Run from frontend: npx tsx scripts/clear-cache.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env.local');
config({ path: envPath });

async function main() {
  const { ServiceContainer } = await import('../lib/repositories/service-container');
  const container = ServiceContainer.getInstance();
  await container.cleanup();
  console.log('✅ Cache cleared. Restart dev server to pick up fresh data.');
}

main().catch((err) => {
  console.error('❌ Clear cache failed:', err);
  process.exit(1);
});
