/**
 * Hull Performance Monitoring Events
 *
 * Standard Axiom logging events for hull performance: fetch, cache, API, condition, errors.
 * Every log includes correlation_id, timestamp, event_type, and vessel_imo/vessel_name where relevant.
 */

import { logCustomEvent, logError } from './axiom-logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HullPerformanceVesselIdentifier = { imo?: string; name?: string };

export interface HullPerformanceFetchParams {
  time_period_days?: number;
  start_date?: string;
  end_date?: string;
}

export interface HullPerformanceFetchResult {
  success: boolean;
  record_count?: number;
  condition?: string;
  duration_ms?: number;
  cache_hit?: boolean;
}

// ---------------------------------------------------------------------------
// 1. Fetch (full flow result)
// ---------------------------------------------------------------------------

/**
 * Log the result of a hull performance fetch (tool/repository flow).
 */
export function logHullPerformanceFetch(
  correlationId: string,
  vesselIdentifier: HullPerformanceVesselIdentifier,
  params: HullPerformanceFetchParams,
  result: HullPerformanceFetchResult
): void {
  logCustomEvent('hull_performance_fetch', correlationId, {
    event_type: 'hull_performance_fetch',
    vessel_imo: vesselIdentifier.imo ?? undefined,
    vessel_name: vesselIdentifier.name ?? undefined,
    ...params,
    ...result,
  });
}

// ---------------------------------------------------------------------------
// 2. Cache hit
// ---------------------------------------------------------------------------

/**
 * Log a hull performance cache hit.
 */
export function logHullPerformanceCacheHit(
  correlationId: string,
  cacheKey: string,
  recordCount: number,
  vesselIdentifier?: HullPerformanceVesselIdentifier
): void {
  logCustomEvent('hull_performance_cache_hit', correlationId, {
    event_type: 'hull_performance_cache_hit',
    cache_key: cacheKey,
    record_count: recordCount,
    cache_hit: true,
    vessel_imo: vesselIdentifier?.imo ?? undefined,
    vessel_name: vesselIdentifier?.name ?? undefined,
  });
}

// ---------------------------------------------------------------------------
// 3. Cache miss
// ---------------------------------------------------------------------------

/**
 * Log a hull performance cache miss.
 */
export function logHullPerformanceCacheMiss(
  correlationId: string,
  cacheKey: string,
  vesselIdentifier?: HullPerformanceVesselIdentifier
): void {
  logCustomEvent('hull_performance_cache_miss', correlationId, {
    event_type: 'hull_performance_cache_miss',
    cache_key: cacheKey,
    cache_hit: false,
    vessel_imo: vesselIdentifier?.imo ?? undefined,
    vessel_name: vesselIdentifier?.name ?? undefined,
  });
}

// ---------------------------------------------------------------------------
// 4. API call
// ---------------------------------------------------------------------------

/**
 * Log a hull performance API call (duration and success).
 */
export function logHullPerformanceAPICall(
  correlationId: string,
  endpoint: string,
  durationMs: number,
  success: boolean,
  vesselIdentifier?: HullPerformanceVesselIdentifier
): void {
  logCustomEvent(
    'hull_performance_api_call',
    correlationId,
    {
      event_type: 'hull_performance_api_call',
      endpoint,
      duration_ms: durationMs,
      success,
      vessel_imo: vesselIdentifier?.imo ?? undefined,
      vessel_name: vesselIdentifier?.name ?? undefined,
    },
    success ? 'info' : 'warn'
  );
}

// ---------------------------------------------------------------------------
// 5. Condition determined
// ---------------------------------------------------------------------------

/**
 * Log when hull condition is determined (GOOD/AVERAGE/POOR) for a vessel.
 */
export function logHullConditionDetermined(
  correlationId: string,
  vessel: HullPerformanceVesselIdentifier,
  condition: string,
  excessPower: number
): void {
  logCustomEvent('hull_condition_determined', correlationId, {
    event_type: 'hull_condition_determined',
    vessel_imo: vessel.imo ?? undefined,
    vessel_name: vessel.name ?? undefined,
    condition,
    excess_power_pct: excessPower,
  });
}

// ---------------------------------------------------------------------------
// 6. Error
// ---------------------------------------------------------------------------

/**
 * Log a hull performance error with context.
 * Uses both logError (for stack/error shape) and a structured hull_performance_error event.
 */
export function logHullPerformanceError(
  correlationId: string,
  error: unknown,
  context?: Record<string, unknown>
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  logError(correlationId, err, {
    event_type: 'hull_performance_error',
    ...context,
  });
  logCustomEvent(
    'hull_performance_error',
    correlationId,
    {
      event_type: 'hull_performance_error',
      error_message: err.message,
      error_stack: err.stack ?? undefined,
      ...context,
    },
    'error'
  );
}
