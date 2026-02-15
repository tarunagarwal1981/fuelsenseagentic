/**
 * Clear Redis cache (hull performance and intent classification).
 * Run from frontend: npx tsx scripts/clear-redis-cache.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { RedisCache } from '../lib/repositories/cache-client';

// Load env from frontend directory
const frontendDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(frontendDir, '.env.local') });
dotenv.config({ path: path.join(frontendDir, '.env') });

async function main() {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisUrl || !redisToken) {
    console.error('❌ UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set.');
    process.exit(1);
  }

  const cache = new RedisCache(redisUrl.trim(), redisToken.trim());

  console.log('Clearing Redis cache...\n');

  const hullDeleted = await cache.clear('hull_perf:*');
  console.log(`  hull_perf:*     → ${hullDeleted} key(s) deleted`);

  const baselineDeleted = await cache.clear('hull_baseline:*');
  console.log(`  hull_baseline:* → ${baselineDeleted} key(s) deleted`);

  const intentDeleted = await cache.clear('fuelsense:intent:*');
  console.log(`  fuelsense:intent:* → ${intentDeleted} key(s) deleted`);

  console.log('\n✅ Redis cache cleared.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
