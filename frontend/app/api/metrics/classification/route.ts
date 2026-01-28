/**
 * Classification metrics endpoint.
 * GET /api/metrics/classification
 * Returns current query-classifier telemetry: tier distribution and top patterns.
 */

export const runtime = 'nodejs';

import { getMetrics, getTopPatterns } from '@/lib/telemetry/classification-metrics';

export async function GET() {
  try {
    const metrics = getMetrics();
    const total = metrics.total_classifications;
    const tier1Pct = total > 0 ? (metrics.tier1_hits / total) * 100 : 0;
    const tier2Pct = total > 0 ? (metrics.tier2_hits / total) * 100 : 0;
    const tier3Pct = total > 0 ? (metrics.tier3_hits / total) * 100 : 0;

    const topPatterns = getTopPatterns(10);

    const body = {
      success: true,
      timestamp: new Date().toISOString(),
      metrics: {
        total_classifications: metrics.total_classifications,
        tier1_hits: metrics.tier1_hits,
        tier2_hits: metrics.tier2_hits,
        tier3_hits: metrics.tier3_hits,
        last_updated: metrics.timestamp.toISOString(),
      },
      tier_distribution: {
        tier1_percent: Math.round(tier1Pct * 100) / 100,
        tier2_percent: Math.round(tier2Pct * 100) / 100,
        tier3_percent: Math.round(tier3Pct * 100) / 100,
      },
      top_patterns: topPatterns,
      tier1_patterns: metrics.tier1_patterns,
    };

    return Response.json(body, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[METRICS/CLASSIFICATION] Error:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
