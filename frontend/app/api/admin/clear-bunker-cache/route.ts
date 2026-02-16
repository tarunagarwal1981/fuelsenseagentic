/**
 * Clear BunkerDataService in-memory cache.
 * POST /api/admin/clear-bunker-cache
 */

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { bunkerDataService } from '@/lib/services/bunker-data-service';

export async function POST(): Promise<NextResponse> {
  bunkerDataService.clearCache();
  return NextResponse.json({ ok: true, message: 'Bunker cache cleared' });
}

export async function GET(): Promise<NextResponse> {
  bunkerDataService.clearCache();
  return NextResponse.json({ ok: true, message: 'Bunker cache cleared' });
}
