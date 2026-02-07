/**
 * VesselPerformanceModelTable API Client (Baseline Profiles)
 *
 * Fetches vessel baseline profiles: speed, consumption, power.
 * Maps API response (camelCase) to ConsumptionProfile.
 */

import type { ConsumptionProfile } from '@/lib/types/vessel-performance';

/** Raw API row shape - VesselPerformanceModelTable returns camelCase */
export interface VesselPerformanceModelRow {
  id?: number;
  vesselImo?: string;
  speedKts?: number;
  meConsumptionMt?: number;
  mePowerKw?: number;
  beaufortScale?: number;
  loadType?: string;
  displacement?: number;
  deadweight?: number;
  sfoc?: number;
  meRpm?: number;
  seaTrialRpm?: number | null;
  [key: string]: unknown;
}

const DEFAULT_TIMEOUT_MS = 15000;

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Map Beaufort scale to weather condition
 */
function beaufortToWeather(beaufort: number): 'calm' | 'moderate' | 'rough' | 'very_rough' {
  if (beaufort <= 2) return 'calm';
  if (beaufort <= 4) return 'moderate';
  if (beaufort <= 6) return 'rough';
  return 'very_rough';
}

/**
 * Map loadType to load_condition
 */
function mapLoadType(loadType: unknown): 'ballast' | 'laden' | 'normal' {
  const s = String(loadType || '').toLowerCase();
  if (s.includes('ballast')) return 'ballast';
  if (s.includes('laden')) return 'laden';
  return 'normal';
}

function mapRowToConsumptionProfile(row: VesselPerformanceModelRow): ConsumptionProfile {
  const meConsumption = toNum(row.meConsumptionMt);
  const loadCondition = mapLoadType(row.loadType);
  const beaufort = toNum(row.beaufortScale);
  const weatherCondition = beaufortToWeather(beaufort);

  return {
    imo: String(row.vesselImo || ''),
    speed: toNum(row.speedKts),
    weather_condition: weatherCondition,
    load_condition: loadCondition,
    beaufort_scale: beaufort,
    consumption: {
      main_engine: { vlsfo: meConsumption, lsmgo: 0, hsfo: 0, mgo: 0 },
      auxiliary_engine: { vlsfo: 0, lsmgo: 0, hsfo: 0, mgo: 0 },
    },
  };
}

function normalizeResponse(body: unknown): VesselPerformanceModelRow[] {
  if (Array.isArray(body)) return body as VesselPerformanceModelRow[];
  if (body && typeof body === 'object' && 'data' in body && Array.isArray((body as { data: unknown }).data)) {
    return (body as { data: VesselPerformanceModelRow[] }).data;
  }
  return [];
}

export class VesselPerformanceModelClient {
  private readonly baseURL: string;
  private readonly timeout: number;

  constructor() {
    this.baseURL = (
      process.env.BASELINE_PROFILE_API_URL ||
      process.env.VESSEL_MASTER_API_URL ||
      process.env.NOON_REPORT_API_URL ||
      process.env.NEXT_PUBLIC_FUELSENSE_API_URL ||
      'https://uat.fuelsense-api.dexpertsystems.com'
    ).replace(/\/$/, '');
    this.timeout = DEFAULT_TIMEOUT_MS;
  }

  /**
   * Fetch baseline profiles for a vessel by IMO.
   * Returns speed/consumption/power profiles (ballast and laden).
   */
  async getByIMO(imo: string): Promise<ConsumptionProfile[]> {
    if (!imo || String(imo).trim() === '') return [];
    const normalizedIMO = String(imo).trim();
    const url = `${this.baseURL}/vessel-performance-model-table?filter=vesselImo||$eq||${encodeURIComponent(normalizedIMO)}&limit=50`;
    const rows = await this.fetchUrl(url);
    return rows.map(mapRowToConsumptionProfile);
  }

  /**
   * Fetch baseline profiles filtered by IMO and load type.
   */
  async getByIMOAndLoad(
    imo: string,
    loadType: 'ballast' | 'laden'
  ): Promise<ConsumptionProfile[]> {
    const all = await this.getByIMO(imo);
    const loadStr = loadType === 'ballast' ? 'ballast' : 'laden';
    return all.filter((p) => p.load_condition === loadStr);
  }

  private async fetchUrl(url: string): Promise<VesselPerformanceModelRow[]> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (process.env.BASELINE_PROFILE_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.BASELINE_PROFILE_API_KEY}`;
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
        if (errBody && typeof errBody.message === 'string') message = errBody.message;
      } catch {
        message = response.statusText || message;
      }
      throw new Error(`VesselPerformanceModel API error: ${response.status} - ${message}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error('VesselPerformanceModel API returned invalid JSON');
    }

    return normalizeResponse(body);
  }
}
