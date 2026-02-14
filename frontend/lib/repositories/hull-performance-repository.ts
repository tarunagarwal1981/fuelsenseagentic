/**
 * Hull Performance Repository
 *
 * Repository pattern for Hull Performance data with Redis caching.
 * - L1: Redis (12h TTL for performance data, 24h for baseline curves)
 * - L2: Hull Performance API on cache miss
 *
 * Logs fetch/cache events to Axiom. Does not throw; returns structured responses with success/error.
 */

import type {
  HullPerformanceRecord,
  VesselPerformanceModelRecord,
  IHullPerformanceDataSource,
} from '@/lib/api-clients/hull-performance-client';
import { RedisCache } from './cache-client';
import { logCustomEvent, logError } from '@/lib/monitoring/axiom-logger';

// ---------------------------------------------------------------------------
// Cache TTL (seconds)
// ---------------------------------------------------------------------------

const HULL_PERF_TTL_SEC = 12 * 60 * 60; // 12 hours
const HULL_BASELINE_TTL_SEC = 24 * 60 * 60; // 24 hours

// ---------------------------------------------------------------------------
// Cache key helpers
// ---------------------------------------------------------------------------

function sanitizeKeyPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

export type GetVesselPerformanceDataResult = {
  success: boolean;
  data: HullPerformanceRecord[];
  metadata: {
    total_records: number;
    date_range: { start: string; end: string };
    cache_hit: boolean;
    source: 'cache' | 'api';
  };
  error?: string;
};

export class HullPerformanceRepository {
  private client: IHullPerformanceDataSource;
  private redis: RedisCache;
  private correlationId: string;

  constructor(
    correlationId: string,
    dependencies: {
      client: IHullPerformanceDataSource;
      redis: RedisCache;
    }
  ) {
    this.correlationId = correlationId;
    this.client = dependencies.client;
    this.redis = dependencies.redis;
  }

  /**
   * Build Redis cache key for hull performance data.
   * Format: hull_perf:{imo|name}:{value}:{days}|{start}:{end}
   */
  private buildCacheKey(
    vesselIdentifier: { imo?: string; name?: string },
    dateRange?: {
      days?: number;
      startDate?: string;
      endDate?: string;
    }
  ): string {
    const idPart = vesselIdentifier.imo
      ? `imo:${vesselIdentifier.imo}`
      : vesselIdentifier.name
        ? `name:${sanitizeKeyPart(vesselIdentifier.name)}`
        : 'all';
    const rangePart = dateRange?.days != null
      ? String(dateRange.days)
      : dateRange?.startDate && dateRange?.endDate
        ? `${sanitizeKeyPart(dateRange.startDate)}:${sanitizeKeyPart(dateRange.endDate)}`
        : '90';
    return `hull_perf:${idPart}:${rangePart}`;
  }

  /**
   * Calculate start/end dates from options.
   * Default: last 90 days.
   */
  private calculateDateRange(options?: {
    days?: number;
    startDate?: string;
    endDate?: string;
  }): { startDate: string; endDate: string } {
    const end = options?.endDate
      ? new Date(options.endDate)
      : new Date();
    const start = options?.startDate
      ? new Date(options.startDate)
      : (() => {
          const d = new Date(end);
          d.setDate(d.getDate() - (options?.days ?? 90));
          return d;
        })();
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }

  /**
   * Get hull performance records for a vessel within a date range.
   * L1: Redis (12h TTL), L2: API.
   */
  async getVesselPerformanceData(
    vesselIdentifier: { imo?: string; name?: string },
    dateRange?: {
      days?: number;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<GetVesselPerformanceDataResult> {
    const startMs = Date.now();
    const { startDate, endDate } = this.calculateDateRange(dateRange);
    const cacheKey = this.buildCacheKey(vesselIdentifier, dateRange);

    logCustomEvent(
      'hull_performance_fetch_start',
      this.correlationId,
      {
        vessel_imo: vesselIdentifier.imo ?? undefined,
        vessel_name: vesselIdentifier.name ?? undefined,
        cache_key: cacheKey,
        date_range: { start: startDate, end: endDate },
      },
      'info'
    );

    try {
      // L1: Redis (on error, fall through to L2 so DB is still tried)
      let cached: { data: HullPerformanceRecord[]; date_range?: { start: string; end: string } } | null = null;
      try {
        cached = await this.redis.get(cacheKey) as
          | { data: HullPerformanceRecord[]; date_range: { start: string; end: string } }
          | null;
      } catch (redisErr) {
        const msg = redisErr instanceof Error ? redisErr.message : String(redisErr);
        logCustomEvent(
          'hull_performance_redis_error',
          this.correlationId,
          { error: msg, cache_key: cacheKey, falling_through_to_db: true },
          'warn'
        );
      }
      if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
        const durationMs = Date.now() - startMs;
        logCustomEvent(
          'hull_performance_cache_hit',
          this.correlationId,
          {
            vessel_imo: vesselIdentifier.imo ?? undefined,
            vessel_name: vesselIdentifier.name ?? undefined,
            cache_hit: true,
            duration_ms: durationMs,
            record_count: cached.data.length,
            date_range: cached.date_range ?? { start: startDate, end: endDate },
          },
          'info'
        );
        return {
          success: true,
          data: cached.data,
          metadata: {
            total_records: cached.data.length,
            date_range: cached.date_range ?? { start: startDate, end: endDate },
            cache_hit: true,
            source: 'cache',
          },
        };
      }

      logCustomEvent(
        'hull_performance_cache_miss',
        this.correlationId,
        {
          vessel_imo: vesselIdentifier.imo ?? undefined,
          vessel_name: vesselIdentifier.name ?? undefined,
          cache_hit: false,
          duration_ms: Date.now() - startMs,
          record_count: 0,
        },
        'info'
      );

      // L2: API
      const params: {
        vessel_imo?: number;
        vessel_name?: string;
        start_date?: string;
        end_date?: string;
        limit?: number;
      } = {
        start_date: startDate,
        end_date: endDate,
        limit: 5000,
      };
      if (vesselIdentifier.imo != null) {
        const imoNum = parseInt(String(vesselIdentifier.imo).replace(/\D/g, ''), 10);
        if (Number.isFinite(imoNum)) params.vessel_imo = imoNum;
      }
      if (vesselIdentifier.name != null)
        params.vessel_name = vesselIdentifier.name.trim().toUpperCase();

      const data = await this.client.getHullPerformance(params);
      console.log(
        '[Hull Repo] getHullPerformance returned',
        data.length,
        'rows',
        data.length === 0 ? { params } : ''
      );
      const payload = {
        data,
        date_range: { start: startDate, end: endDate },
      };
      if (data.length > 0) {
        try {
          await this.redis.set(cacheKey, payload, HULL_PERF_TTL_SEC);
        } catch {
          // ignore Redis set failure; we still return DB data
        }
      }

      const durationMs = Date.now() - startMs;
      logCustomEvent(
        'hull_performance_api_success',
        this.correlationId,
        {
          vessel_imo: vesselIdentifier.imo ?? undefined,
          vessel_name: vesselIdentifier.name ?? undefined,
          cache_hit: false,
          duration_ms: durationMs,
          record_count: data.length,
        },
        'info'
      );

      return {
        success: true,
        data,
        metadata: {
          total_records: data.length,
          date_range: { start: startDate, end: endDate },
          cache_hit: false,
          source: 'api',
        },
      };
    } catch (err) {
      const durationMs = Date.now() - startMs;
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Hull Repo] getVesselPerformanceData error:', message);
      logError(this.correlationId, err instanceof Error ? err : new Error(message), {
        repository: 'HullPerformanceRepository',
        method: 'getVesselPerformanceData',
        vessel_imo: vesselIdentifier.imo,
        vessel_name: vesselIdentifier.name,
        cache_key: cacheKey,
      });
      logCustomEvent(
        'hull_performance_api_error',
        this.correlationId,
        {
          vessel_imo: vesselIdentifier.imo ?? undefined,
          vessel_name: vesselIdentifier.name ?? undefined,
          cache_hit: false,
          duration_ms: durationMs,
          record_count: 0,
          error: message,
        },
        'error'
      );
      return {
        success: false,
        data: [],
        metadata: {
          total_records: 0,
          date_range: { start: startDate, end: endDate },
          cache_hit: false,
          source: 'api',
        },
        error: message,
      };
    }
  }

  /**
   * Get latest hull performance record (most recent).
   */
  async getLatestPerformance(
    vesselIdentifier: { imo?: string; name?: string }
  ): Promise<HullPerformanceRecord | null> {
    const startMs = Date.now();
    try {
      const result = await this.getVesselPerformanceData(vesselIdentifier, { days: 365 });
      if (!result.success || result.data.length === 0) return null;
      const sorted = [...result.data].sort(
        (a, b) => new Date(b.report_date).getTime() - new Date(a.report_date).getTime()
      );
      return sorted[0] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Get vessel baseline performance curves. Cached 24 hours.
   */
  async getVesselBaselineCurves(
    vesselImo: number,
    loadType?: 'Laden' | 'Ballast'
  ): Promise<VesselPerformanceModelRecord[]> {
    const startMs = Date.now();
    const cacheKey = `hull_baseline:${vesselImo}:${loadType ?? 'all'}`;

    logCustomEvent(
      'hull_baseline_fetch',
      this.correlationId,
      {
        vessel_imo: String(vesselImo),
        load_type: loadType ?? 'all',
        cache_key: cacheKey,
      },
      'info'
    );

    try {
      const cached = await this.redis.get(cacheKey) as VesselPerformanceModelRecord[] | null;
      if (cached && Array.isArray(cached)) {
        const durationMs = Date.now() - startMs;
        logCustomEvent(
          'hull_baseline_fetch',
          this.correlationId,
          {
            vessel_imo: String(vesselImo),
            cache_hit: true,
            duration_ms: durationMs,
            record_count: cached.length,
          },
          'info'
        );
        return cached;
      }

      const data = await this.client.getVesselPerformanceModel({
        vessel_imo: vesselImo,
        load_type: loadType,
      });
      await this.redis.set(cacheKey, data, HULL_BASELINE_TTL_SEC);

      const durationMs = Date.now() - startMs;
      logCustomEvent(
        'hull_baseline_fetch',
        this.correlationId,
        {
          vessel_imo: String(vesselImo),
          cache_hit: false,
          duration_ms: durationMs,
          record_count: data.length,
        },
        'info'
      );
      return data;
    } catch (err) {
      const durationMs = Date.now() - startMs;
      const message = err instanceof Error ? err.message : String(err);
      logError(this.correlationId, err instanceof Error ? err : new Error(message), {
        repository: 'HullPerformanceRepository',
        method: 'getVesselBaselineCurves',
        vessel_imo: vesselImo,
        load_type: loadType,
      });
      logCustomEvent(
        'hull_performance_api_error',
        this.correlationId,
        {
          vessel_imo: String(vesselImo),
          cache_hit: false,
          duration_ms: durationMs,
          record_count: 0,
          error: message,
        },
        'error'
      );
      return [];
    }
  }
}
