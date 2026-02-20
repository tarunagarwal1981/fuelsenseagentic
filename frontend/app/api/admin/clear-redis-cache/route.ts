/**
 * Clear Redis cache (hull performance, baseline, intent classification, and general FuelSense keys).
 * GET or POST /api/admin/clear-redis-cache
 *
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
 */

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { RedisCache } from '@/lib/repositories/cache-client';

const PATTERNS = [
  'hull_perf:*',
  'hull_baseline:*',
  'fuelsense:intent:*',
  'fuelsense:*',
] as const;

export async function GET(): Promise<NextResponse> {
  return clearRedisCache();
}

export async function POST(): Promise<NextResponse> {
  return clearRedisCache();
}

async function clearRedisCache(): Promise<NextResponse> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisUrl?.trim() || !redisToken?.trim()) {
    return NextResponse.json(
      { ok: false, error: 'UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set' },
      { status: 503 }
    );
  }

  try {
    const cache = new RedisCache(redisUrl.trim(), redisToken.trim());
    const result: Record<string, number> = {};

    for (const pattern of PATTERNS) {
      result[pattern] = await cache.clear(pattern);
    }

    const total = Object.values(result).reduce((a, b) => a + b, 0);
    return NextResponse.json({
      ok: true,
      message: 'Redis cache cleared',
      deleted: result,
      total,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/admin/clear-redis-cache] Error:', err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
