/**
 * Redis persistence layer for FuelSense 360 LangGraph multi-agent system.
 *
 * Provides a factory that returns:
 * - RedisSaver (Upstash Redis) in production when UPSTASH_REDIS_REST_URL and
 *   UPSTASH_REDIS_REST_TOKEN are set
 * - MemorySaver in development when Redis is unavailable or env vars are missing
 *
 * Compatible with both /chat-langgraph and /chat-multi-agent. State schema is
 * unchanged; this layer is interchangeable with MemorySaver.
 */

import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";
import { MemorySaver, BaseCheckpointSaver } from "@langchain/langgraph";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** TTL in minutes for checkpoint keys. */
const DEFAULT_TTL_MINUTES = 60;

/** Refresh TTL when a checkpoint is read. */
const REFRESH_ON_READ = true;

/**
 * Connection / pooling-related settings.
 * RedisSaver uses a single node-redis client; tuning is done via TTL and
 * read-refresh to reduce churn. For higher throughput, consider multiple
 * app instances behind a load balancer.
 */
const TTL_CONFIG = {
  defaultTTL: DEFAULT_TTL_MINUTES,
  refreshOnRead: REFRESH_ON_READ,
} as const;

const PERSISTENCE_LOG_PREFIX = "[persistence]";
/** Placeholder for Day 3–4 correlation ID. */
const CORRELATION_ID_PLACEHOLDER = "tbd";

// ---------------------------------------------------------------------------
// Metrics and health (for observability and health endpoint)
// ---------------------------------------------------------------------------

let lastCheckpointAt: number | null = null;

export interface CheckpointMetrics {
  saveDurationMs: number;
  lastSaveDurationMs: number;
  sizeBytes: number;
  lastSizeBytes: number;
  failureCount: number;
}

const checkpointMetrics: CheckpointMetrics = {
  saveDurationMs: 0,
  lastSaveDurationMs: 0,
  sizeBytes: 0,
  lastSizeBytes: 0,
  failureCount: 0,
};

export function getLastCheckpointAt(): number | null {
  return lastCheckpointAt;
}

export function getCheckpointMetrics(): Readonly<CheckpointMetrics> {
  return { ...checkpointMetrics };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUpstashEnv(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token && url.trim() && token.trim()) {
    return { url: url.trim(), token: token.trim() };
  }
  return null;
}

/**
 * Build a Redis URL for ioredis/node-redis from Upstash REST env vars.
 * Upstash REST URL is https://<host>; Redis TCP is rediss://default:<token>@<host>:6379.
 */
function buildRedisUrlFromUpstashRest(restUrl: string, token: string): string {
  const u = new URL(restUrl);
  const host = u.hostname;
  const encoded = encodeURIComponent(token);
  return `rediss://default:${encoded}@${host}:6379`;
}

/**
 * Detect if we're using Upstash Redis (which doesn't support RediSearch/FT.CREATE)
 */
function isUpstashRedis(url: string): boolean {
  return url.includes('upstash.io') || url.includes('upstash.com');
}

// ---------------------------------------------------------------------------
// Singleton checkpointer instance (lazy, once resolved)
// ---------------------------------------------------------------------------

let checkpointerPromise: Promise<BaseCheckpointSaver> | null = null;
let resolvedCheckpointer: BaseCheckpointSaver | null = null;
let resolvedKind: "redis" | "memory" | null = null;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Returns a checkpointer for LangGraph compile({ checkpointer }).
 *
 * - Production: RedisSaver when UPSTASH_REDIS_REST_URL and
 *   UPSTASH_REDIS_REST_TOKEN are set and Redis is reachable.
 * - Development / fallback: MemorySaver when env is missing or Redis fails.
 *
 * Logs which persistence layer is active. Thread-safe; uses a single
 * resolved instance.
 */
export async function getCheckpointer(): Promise<BaseCheckpointSaver> {
  if (resolvedCheckpointer !== null) {
    return resolvedCheckpointer;
  }

  if (!checkpointerPromise) {
    checkpointerPromise = createCheckpointer();
  }

  const cp = await checkpointerPromise;
  resolvedCheckpointer = cp;
  return cp;
}

const MAX_CHECKPOINT_ATTEMPTS = 3;
const CHECKPOINT_RETRY_MS = 100;

/**
 * Wraps a checkpointer with retry (max 3 attempts) and logging for put/putWrites.
 * Delegates get, getTuple, list, deleteThread, end to the inner checkpointer.
 */
function wrapWithRetryAndLogging(inner: BaseCheckpointSaver): BaseCheckpointSaver {
  const log = (msg: string) =>
    console.log(`${PERSISTENCE_LOG_PREFIX} [correlation_id=${CORRELATION_ID_PLACEHOLDER}] ${msg}`);
  const innerHasEnd = typeof (inner as { end?: () => Promise<void> }).end === "function";
  return {
    get: (config) => inner.get(config),
    getTuple: (config) => inner.getTuple(config),
    list: (config, options) => inner.list(config, options),
    deleteThread: (id) => inner.deleteThread(id),
    put: async (config, checkpoint, metadata, newVersions) => {
      const threadId =
        (config as { configurable?: { thread_id?: string } })?.configurable?.thread_id ?? "?";
      const start = Date.now();
      let sizeBytes = 0;
      try {
        sizeBytes = new TextEncoder().encode(JSON.stringify(checkpoint)).length;
      } catch {
        sizeBytes = 0;
      }
      let lastErr: unknown;
      for (let attempt = 1; attempt <= MAX_CHECKPOINT_ATTEMPTS; attempt++) {
        try {
          const r = await inner.put(config, checkpoint, metadata, newVersions);
          const durationMs = Date.now() - start;
          lastCheckpointAt = Date.now();
          checkpointMetrics.lastSaveDurationMs = durationMs;
          checkpointMetrics.saveDurationMs = durationMs;
          checkpointMetrics.lastSizeBytes = sizeBytes;
          checkpointMetrics.sizeBytes = sizeBytes;
          log(
            `checkpoint put success (thread_id=${threadId}) duration_ms=${durationMs} size_bytes=${sizeBytes}`
          );
          return r;
        } catch (e) {
          lastErr = e;
          const msg = e instanceof Error ? e.message : String(e);
          log(
            `checkpoint put failure (attempt ${attempt}/${MAX_CHECKPOINT_ATTEMPTS}, thread_id=${threadId}): ${msg}`
          );
          if (attempt === MAX_CHECKPOINT_ATTEMPTS) {
            checkpointMetrics.failureCount += 1;
            throw lastErr;
          }
          await new Promise((r) => setTimeout(r, CHECKPOINT_RETRY_MS * attempt));
        }
      }
      throw lastErr;
    },
    putWrites: async (config, writes, taskId) => {
      const threadId =
        (config as { configurable?: { thread_id?: string } })?.configurable?.thread_id ?? "?";
      let lastErr: unknown;
      for (let attempt = 1; attempt <= MAX_CHECKPOINT_ATTEMPTS; attempt++) {
        try {
          await inner.putWrites(config, writes, taskId);
          log(`checkpoint putWrites success (thread_id=${threadId})`);
          return;
        } catch (e) {
          lastErr = e;
          const msg = e instanceof Error ? e.message : String(e);
          log(
            `checkpoint putWrites failure (attempt ${attempt}/${MAX_CHECKPOINT_ATTEMPTS}, thread_id=${threadId}): ${msg}`
          );
          if (attempt === MAX_CHECKPOINT_ATTEMPTS) {
            checkpointMetrics.failureCount += 1;
            throw lastErr;
          }
          await new Promise((r) => setTimeout(r, CHECKPOINT_RETRY_MS * attempt));
        }
      }
      throw lastErr;
    },
    ...(innerHasEnd && {
      end: () => (inner as unknown as { end: () => Promise<void> }).end(),
    }),
  } as BaseCheckpointSaver;
}

async function createCheckpointer(): Promise<BaseCheckpointSaver> {
  const env = getUpstashEnv();

  if (!env) {
    console.log(
      `${PERSISTENCE_LOG_PREFIX} UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN not set → using MemorySaver (in-memory)`
    );
    resolvedKind = "memory";
    return new MemorySaver();
  }

  // NEW: Detect Upstash and skip RedisSaver entirely (Upstash doesn't support RediSearch)
  if (isUpstashRedis(env.url)) {
    console.warn(
      `${PERSISTENCE_LOG_PREFIX} Upstash Redis detected. ` +
      `RedisSaver requires RediSearch (FT.CREATE) which Upstash doesn't support. ` +
      `Using MemorySaver instead.`
    );
    resolvedKind = "memory";
    return new MemorySaver();
  }

  // Continue with RedisSaver for standard Redis (with RediSearch support)
  try {
    const redisUrl = buildRedisUrlFromUpstashRest(env.url, env.token);
    const saver = await RedisSaver.fromUrl(redisUrl, TTL_CONFIG);
    
    // Validate checkpointer is properly initialized
    if (!saver || typeof saver.put !== 'function' || typeof saver.get !== 'function') {
      throw new Error('RedisSaver initialization returned invalid checkpointer');
    }
    
    console.log(
      `${PERSISTENCE_LOG_PREFIX} Redis configured → using RedisSaver (production)`
    );
    resolvedKind = "redis";
    return wrapWithRetryAndLogging(saver);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isRediSearchError = 
      msg.includes('FT.CREATE') || 
      msg.includes('RediSearch') || 
      msg.includes('Command is not available');
    
    if (isRediSearchError) {
      console.warn(
        `${PERSISTENCE_LOG_PREFIX} RedisSaver requires RediSearch (FT.CREATE) which is not available. ` +
        `Falling back to MemorySaver.`
      );
    } else {
      console.warn(
        `${PERSISTENCE_LOG_PREFIX} RedisSaver init failed (${msg}) → falling back to MemorySaver`
      );
    }
    resolvedKind = "memory";
    return new MemorySaver();
  }
}

/**
 * Which persistence layer is active. Only set after getCheckpointer() has
 * resolved.
 */
export function getActivePersistenceKind(): "redis" | "memory" | null {
  return resolvedKind;
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

async function _pingUpstash(): Promise<{ ok: boolean; latency_ms: number }> {
  const env = getUpstashEnv();
  if (!env) return { ok: true, latency_ms: 0 };
  const start = Date.now();
  try {
    const pingUrl = `${env.url.replace(/\/$/, "")}/ping`;
    const res = await fetch(pingUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.token}` },
    });
    const data = (await res.json()) as { result?: string };
    const ok = res.ok && data?.result === "PONG";
    if (!ok) {
      console.warn(
        `${PERSISTENCE_LOG_PREFIX} Redis health ping failed: status=${res.status} result=${data?.result}`
      );
    }
    return { ok, latency_ms: Date.now() - start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`${PERSISTENCE_LOG_PREFIX} Redis health ping error:`, msg);
    return { ok: false, latency_ms: Date.now() - start };
  }
}

/**
 * Checks Redis connectivity when using Upstash REST env vars (ping only, no read test).
 *
 * - If REST URL and token are set: POSTs a PING to Upstash REST; returns true
 *   when the instance responds.
 * - If not set (MemorySaver mode): returns true (no backend to check).
 */
export async function checkRedisConnection(): Promise<boolean> {
  return (await _pingUpstash()).ok;
}

const RETRY_AFTER_SECONDS = 30;

/**
 * Full Redis/checkpoint health: ping latency, read test, last checkpoint time, metrics.
 * For use by /api/health/redis and monitoring.
 */
export async function getRedisHealth(): Promise<{
  status: "healthy" | "degraded" | "down";
  latency_ms: number;
  last_checkpoint_at: number | null;
  read_ok?: boolean;
  read_latency_ms?: number;
  metrics: Readonly<CheckpointMetrics>;
  retry_after_seconds?: number;
}> {
  const { ok: pingOk, latency_ms: latencyMs } = await _pingUpstash();

  let readOk: boolean | undefined;
  let readLatencyMs: number | undefined;
  try {
    const cp = await getCheckpointer();
    const t0 = Date.now();
    for await (const _ of cp.list({ configurable: { thread_id: "__health__" } }, { limit: 1 })) {
      // drain at most 1
    }
    readLatencyMs = Date.now() - t0;
    readOk = true;
  } catch (e) {
    readOk = false;
    console.warn(`${PERSISTENCE_LOG_PREFIX} Redis health read test failed:`, e);
  }

  let status: "healthy" | "degraded" | "down" = "healthy";
  let retryAfter: number | undefined;
  if (!pingOk) {
    status = "down";
    retryAfter = RETRY_AFTER_SECONDS;
  } else if (readOk === false) {
    status = "degraded";
    retryAfter = RETRY_AFTER_SECONDS;
  }

  return {
    status,
    latency_ms: latencyMs,
    last_checkpoint_at: getLastCheckpointAt(),
    read_ok: readOk,
    read_latency_ms: readLatencyMs,
    metrics: getCheckpointMetrics(),
    retry_after_seconds: retryAfter,
  };
}
