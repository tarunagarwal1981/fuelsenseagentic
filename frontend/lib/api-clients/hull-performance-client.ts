/**
 * Hull Performance API Client
 *
 * Type-safe HTTP client for the Hull Performance API:
 * - GET /hull-performance - hull performance records
 * - GET /vessel-performance-model-table - baseline performance curves
 *
 * Uses a simple circuit breaker to avoid cascading failures; logs errors to Axiom with correlation ID.
 */

import { logError } from '@/lib/monitoring/axiom-logger';

// ---------------------------------------------------------------------------
// Type definitions (matching database schema)
// ---------------------------------------------------------------------------

export interface HullPerformanceRecord {
  id: number;
  vessel_imo: number;
  vessel_name: string;
  report_date: string;
  utc_date_time: string;

  hull_roughness_power_loss: number;
  hull_roughness_speed_loss: number;
  hull_excess_fuel_oil: number;
  hull_excess_fuel_oil_mtd: number;

  speed: number;
  consumption: number;
  predicted_consumption: number;
  distance_travelled_actual: number;
  steaming_time_hrs: number;

  windforce: number;
  weather_category: string;
  loading_condition: string;
  displacement: number;
  total_cargo: number;

  engine_power_loss: number;
  propeller_fouling_power_loss: number;
  engine_speed_loss: number;
  propeller_fouling_speed_loss: number;

  hull_cii_impact: number;
  engine_cii_impact: number;
  propeller_cii_impact: number;

  expected_power: number;
  reported_me_power: number;
  predicted_me_power: number;

  normalised_consumption: number;
}

export interface VesselPerformanceModelRecord {
  id: number;
  vessel_imo: number;
  speed_kts: number;
  me_consumption_: number;
  me_power_kw: number;
  beaufort_scale: number;
  displacement: number;
  load_type: string;
  deadweight: number;
  sfoc: number;
  me_rpm: number;
  sea_trial_rpm: number;
}

// ---------------------------------------------------------------------------
// Simple circuit breaker (in-file; no dependency on tool-specific breaker)
// ---------------------------------------------------------------------------

const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_RESET_TIMEOUT_MS = 30_000;

type CircuitState = 'closed' | 'open' | 'half_open';

function createCircuitBreaker(name: string) {
  let state: CircuitState = 'closed';
  let failures = 0;
  let lastFailureAt = 0;

  return {
    async execute<T>(fn: () => Promise<T>): Promise<T> {
      if (state === 'open') {
        if (Date.now() - lastFailureAt >= CIRCUIT_RESET_TIMEOUT_MS) {
          state = 'half_open';
        } else {
          throw new Error(`Hull Performance API circuit open for ${name}. Try again later.`);
        }
      }

      try {
        const result = await fn();
        if (state === 'half_open') {
          state = 'closed';
          failures = 0;
        } else if (state === 'closed') {
          failures = 0;
        }
        return result;
      } catch (err) {
        failures++;
        lastFailureAt = Date.now();
        if (state === 'half_open' || failures >= CIRCUIT_FAILURE_THRESHOLD) {
          state = 'open';
        }
        throw err;
      }
    },
    getState(): CircuitState {
      if (state === 'open' && Date.now() - lastFailureAt >= CIRCUIT_RESET_TIMEOUT_MS) {
        return 'half_open';
      }
      return state;
    },
  };
}

const hullPerformanceBreaker = createCircuitBreaker('hull-performance');
const vesselPerformanceModelBreaker = createCircuitBreaker('vessel-performance-model');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 15_000;

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Normalize API response to array (raw array or { data: array }) */
function normalizeHullPerformanceResponse(body: unknown): HullPerformanceRecord[] {
  if (Array.isArray(body)) return body as HullPerformanceRecord[];
  if (body && typeof body === 'object' && 'data' in body && Array.isArray((body as { data: unknown }).data)) {
    return (body as { data: HullPerformanceRecord[] }).data;
  }
  return [];
}

function normalizeVesselPerformanceModelResponse(body: unknown): VesselPerformanceModelRecord[] {
  if (Array.isArray(body)) return body as VesselPerformanceModelRecord[];
  if (body && typeof body === 'object' && 'data' in body && Array.isArray((body as { data: unknown }).data)) {
    return (body as { data: VesselPerformanceModelRecord[] }).data;
  }
  return [];
}

/** Map raw API row (snake_case or mixed) to HullPerformanceRecord */
function mapToHullPerformanceRecord(row: Record<string, unknown>): HullPerformanceRecord {
  return {
    id: toNum(row.id),
    vessel_imo: toNum(row.vessel_imo),
    vessel_name: String(row.vessel_name ?? ''),
    report_date: String(row.report_date ?? ''),
    utc_date_time: String(row.utc_date_time ?? ''),

    hull_roughness_power_loss: toNum(row.hull_roughness_power_loss),
    hull_roughness_speed_loss: toNum(row.hull_roughness_speed_loss),
    hull_excess_fuel_oil: toNum(row.hull_excess_fuel_oil),
    hull_excess_fuel_oil_mtd: toNum(row.hull_excess_fuel_oil_mtd),

    speed: toNum(row.speed),
    consumption: toNum(row.consumption),
    predicted_consumption: toNum(row.predicted_consumption),
    distance_travelled_actual: toNum(row.distance_travelled_actual),
    steaming_time_hrs: toNum(row.steaming_time_hrs),

    windforce: toNum(row.windforce),
    weather_category: String(row.weather_category ?? ''),
    loading_condition: String(row.loading_condition ?? ''),
    displacement: toNum(row.displacement),
    total_cargo: toNum(row.total_cargo),

    engine_power_loss: toNum(row.engine_power_loss),
    propeller_fouling_power_loss: toNum(row.propeller_fouling_power_loss),
    engine_speed_loss: toNum(row.engine_speed_loss),
    propeller_fouling_speed_loss: toNum(row.propeller_fouling_speed_loss),

    hull_cii_impact: toNum(row.hull_cii_impact),
    engine_cii_impact: toNum(row.engine_cii_impact),
    propeller_cii_impact: toNum(row.propeller_cii_impact),

    expected_power: toNum(row.expected_power),
    reported_me_power: toNum(row.reported_me_power),
    predicted_me_power: toNum(row.predicted_me_power),

    normalised_consumption: toNum(row.normalised_consumption),
  };
}

/** Map raw API row to VesselPerformanceModelRecord */
function mapToVesselPerformanceModelRecord(row: Record<string, unknown>): VesselPerformanceModelRecord {
  return {
    id: toNum(row.id),
    vessel_imo: toNum(row.vessel_imo),
    speed_kts: toNum(row.speed_kts),
    me_consumption_: toNum(row.me_consumption_),
    me_power_kw: toNum(row.me_power_kw),
    beaufort_scale: toNum(row.beaufort_scale),
    displacement: toNum(row.displacement),
    load_type: String(row.load_type ?? ''),
    deadweight: toNum(row.deadweight),
    sfoc: toNum(row.sfoc),
    me_rpm: toNum(row.me_rpm),
    sea_trial_rpm: toNum(row.sea_trial_rpm),
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class HullPerformanceClient {
  private readonly baseURL: string;
  private readonly timeout: number;
  private readonly correlationId?: string;

  constructor(correlationId?: string) {
    this.baseURL = (
      process.env.HULL_PERFORMANCE_API_URL ||
      process.env.NEXT_PUBLIC_FUELSENSE_API_URL ||
      'https://uat.fuelsense-api.dexpertsystems.com'
    ).replace(/\/$/, '');
    this.timeout = DEFAULT_TIMEOUT_MS;
    this.correlationId = correlationId;
  }

  /**
   * Retrieve hull performance records with optional filters.
   */
  async getHullPerformance(params: {
    vessel_imo?: number;
    vessel_name?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<HullPerformanceRecord[]> {
    const cid = this.correlationId ?? 'unknown';
    try {
      return await hullPerformanceBreaker.execute(async () => {
        const search = new URLSearchParams();
        if (params.vessel_imo != null) search.set('vessel_imo', String(params.vessel_imo));
        if (params.vessel_name != null) search.set('vessel_name', params.vessel_name);
        if (params.start_date != null) search.set('start_date', params.start_date);
        if (params.end_date != null) search.set('end_date', params.end_date);
        if (params.limit != null) search.set('limit', String(params.limit));
        if (params.offset != null) search.set('offset', String(params.offset));
        const query = search.toString();
        const url = `${this.baseURL}/hull-performance${query ? `?${query}` : ''}`;
        const body = await this.fetchJson(url);
        const raw = normalizeHullPerformanceResponse(body);
        return raw.map((row) => mapToHullPerformanceRecord(row as Record<string, unknown>));
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError(cid, err instanceof Error ? err : new Error(message), {
        client: 'HullPerformanceClient',
        method: 'getHullPerformance',
        params,
      });
      throw new Error(`Hull Performance API: ${message}`);
    }
  }

  /**
   * Retrieve baseline performance curves for a vessel (optionally by load type).
   */
  async getVesselPerformanceModel(params: {
    vessel_imo: number;
    load_type?: 'Laden' | 'Ballast';
  }): Promise<VesselPerformanceModelRecord[]> {
    const cid = this.correlationId ?? 'unknown';
    try {
      return await vesselPerformanceModelBreaker.execute(async () => {
        const search = new URLSearchParams();
        search.set('vessel_imo', String(params.vessel_imo));
        if (params.load_type != null) search.set('load_type', params.load_type);
        const url = `${this.baseURL}/vessel-performance-model-table?${search.toString()}`;
        const body = await this.fetchJson(url);
        const raw = normalizeVesselPerformanceModelResponse(body);
        return raw.map((row) => mapToVesselPerformanceModelRecord(row as Record<string, unknown>));
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError(cid, err instanceof Error ? err : new Error(message), {
        client: 'HullPerformanceClient',
        method: 'getVesselPerformanceModel',
        params,
      });
      throw new Error(`Hull Performance API (vessel-performance-model): ${message}`);
    }
  }

  private async fetchJson(url: string): Promise<unknown> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (process.env.HULL_PERFORMANCE_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.HULL_PERFORMANCE_API_KEY}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        if (errBody && typeof (errBody as { message?: string }).message === 'string') {
          message = (errBody as { message: string }).message;
        }
      } catch {
        message = response.statusText || message;
      }
      throw new Error(`${response.status} - ${message}`);
    }

    try {
      return await response.json();
    } catch {
      throw new Error('Invalid JSON response');
    }
  }
}
