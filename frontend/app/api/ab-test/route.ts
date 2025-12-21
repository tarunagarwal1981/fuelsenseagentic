/**
 * A/B Testing API Endpoint
 * 
 * Provides A/B test metrics and comparison data.
 */

export const runtime = 'edge';

import {
  compareVariants,
  calculateVariantMetrics,
  getAllTestResults,
  getABTestConfiguration,
} from '@/lib/utils/ab-testing';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'comparison';

    switch (action) {
      case 'comparison':
        const comparison = compareVariants();
        return new Response(JSON.stringify(comparison), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
          },
        });

      case 'metrics':
        const variant = url.searchParams.get('variant') as 'single-agent' | 'multi-agent' | null;
        if (variant) {
          const metrics = calculateVariantMetrics(variant);
          return new Response(JSON.stringify(metrics), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache',
            },
          });
        }
        // Return both if no variant specified
        const singleAgent = calculateVariantMetrics('single-agent');
        const multiAgent = calculateVariantMetrics('multi-agent');
        return new Response(
          JSON.stringify({ singleAgent, multiAgent }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache',
            },
          }
        );

      case 'results':
        const limit = parseInt(url.searchParams.get('limit') || '100');
        const results = getAllTestResults().slice(-limit);
        return new Response(JSON.stringify(results), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
          },
        });

      case 'config':
        const config = getABTestConfiguration();
        return new Response(JSON.stringify(config), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
          },
        });

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    console.error('❌ [AB-TEST-API] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { requestId, satisfaction, accuracy } = body;

    if (!requestId) {
      return new Response(JSON.stringify({ error: 'requestId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Import here to avoid circular dependencies
    const { recordUserSatisfaction } = await import('@/lib/utils/ab-testing');
    recordUserSatisfaction(requestId, satisfaction, accuracy);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ [AB-TEST-API] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

