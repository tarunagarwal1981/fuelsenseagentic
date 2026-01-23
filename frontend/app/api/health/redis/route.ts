/**
 * Redis health check endpoint.
 *
 * GET /api/health/redis
 *
 * Returns:
 * - status: 'healthy' | 'degraded' | 'down'
 * - latency_ms: Redis ping latency (or 0 when not using Redis)
 * - last_checkpoint_at: timestamp of last successful checkpoint (ms since epoch, or null)
 * - read_ok, read_latency_ms: result of checkpoint list read test
 * - metrics: checkpoint save duration, size, failure count
 * - retry_after_seconds: when status is not healthy, suggest retry after N seconds
 *
 * HTTP 200 when healthy or degraded; 503 when down.
 */

export const runtime = "nodejs";

import { getRedisHealth } from "@/lib/persistence/redis-checkpointer";

export async function GET() {
  try {
    const h = await getRedisHealth();
    const body = {
      status: h.status,
      latency_ms: h.latency_ms,
      last_checkpoint_at: h.last_checkpoint_at,
      read_ok: h.read_ok,
      read_latency_ms: h.read_latency_ms,
      metrics: h.metrics,
      retry_after_seconds: h.retry_after_seconds,
    };
    const status = h.status === "down" ? 503 : 200;
    return new Response(JSON.stringify(body, null, 2), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...(h.retry_after_seconds != null && {
          "Retry-After": String(h.retry_after_seconds),
        }),
      },
    });
  } catch (e) {
    console.error("[health/redis] Error:", e);
    return new Response(
      JSON.stringify({
        status: "down",
        latency_ms: 0,
        last_checkpoint_at: null,
        error: e instanceof Error ? e.message : String(e),
        retry_after_seconds: 30,
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Retry-After": "30",
        },
      }
    );
  }
}
