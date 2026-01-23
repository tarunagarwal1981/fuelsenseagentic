/**
 * Circuit breaker status endpoint.
 *
 * GET /api/health/circuit-breakers
 *
 * Returns status of all tool circuit breakers:
 * { tool_name: { state: 'OPEN'|'CLOSED'|'HALF_OPEN', failures: N, last_failure_at } }
 */

export const runtime = 'nodejs';

import { getCircuitBreakerStatus } from '@/lib/resilience/circuit-breaker';
// Ensure circuit breakers are created (they are created when tools.ts is first loaded)
import '@/lib/multi-agent/tools';

export async function GET() {
  try {
    const status = getCircuitBreakerStatus();
    return new Response(JSON.stringify(status, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[health/circuit-breakers] Error:', e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}
