/**
 * Monitoring API Endpoint
 * 
 * Provides access to system metrics and monitoring data.
 * Can be secured with authentication in production.
 */

export const runtime = 'edge';

import { getSystemMetrics, logMetricsSummary } from '@/lib/multi-agent/monitoring';

export async function GET(req: Request) {
  // Optional: Add authentication check here
  // const authHeader = req.headers.get('Authorization');
  // if (authHeader !== `Bearer ${process.env.MONITORING_API_KEY}`) {
  //   return new Response('Unauthorized', { status: 401 });
  // }

  try {
    const metrics = getSystemMetrics();

    // Log summary to console
    logMetricsSummary();

    return new Response(JSON.stringify(metrics, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('❌ [MONITORING-API] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}

