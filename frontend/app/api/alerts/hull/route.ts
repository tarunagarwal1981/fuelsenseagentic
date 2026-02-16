/**
 * GET /api/alerts/hull
 * Alerts module: returns active hull alerts (POOR condition) for all vessels.
 * Does not touch the agentic AI system.
 */

import { NextResponse } from 'next/server';
import { hullAlertProvider } from '@/lib/alerts/providers/hull-alert-provider';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const vesselLimit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10)), 100) : 100;
    const correlationId = `api-alerts-hull-${Date.now()}`;

    const alerts = await hullAlertProvider.getAlerts({
      vesselLimit,
      correlationId,
    });

    return NextResponse.json({ alerts });
  } catch (error) {
    console.error('[api/alerts/hull] Error:', error);
    return NextResponse.json(
      { alerts: [], error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
