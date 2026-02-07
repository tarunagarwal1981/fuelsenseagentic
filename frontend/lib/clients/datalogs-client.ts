/**
 * Datalogs API Client (Noon Reports)
 *
 * Fetches noon report data from FuelSense Datalogs REST API.
 * Uses NestJS CRUD query params (filter, sort, limit).
 * Maps API response (UPPERCASE keys) to NoonReportData.
 */

import type { NoonReportData } from '@/lib/types/vessel-performance';

/** Raw API row shape - Datalogs API returns UPPERCASE keys */
export interface DatalogRow {
  ID?: number;
  VESSEL_IMO?: string;
  VESSEL_NAME?: string;
  EVENT?: string;
  REPORT_DATE?: string;
  UTC_DATE_TIME?: string;
  LATITUDE?: string | number;
  LONGITUDE?: string | number;
  ROB_VLSFO?: number;
  ROB_LSMGO?: number;
  ROB_HSFO?: number;
  ROB_ULSFO?: number;
  ROB_MDO?: number;
  SPEED?: number;
  DISTANCETOGO?: number;
  FROM_PORT?: string;
  TO_PORT?: string;
  [key: string]: unknown;
}

const DEFAULT_TIMEOUT_MS = 15000;

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapRowToNoonReport(row: DatalogRow): NoonReportData {
  const lat = toNum(row.LATITUDE);
  const lon = toNum(row.LONGITUDE);
  const timestamp = row.REPORT_DATE || row.UTC_DATE_TIME || new Date().toISOString();
  const toPort = (row.TO_PORT || '').trim();
  const fromPort = (row.FROM_PORT || '').trim();

  return {
    timestamp,
    imo: String(row.VESSEL_IMO || ''),
    vessel_name: String(row.VESSEL_NAME || ''),
    position: { latitude: lat, longitude: lon },
    next_port: {
      name: toPort || fromPort || 'Unknown',
      locode: undefined,
      eta: undefined,
    },
    rob: {
      vlsfo: toNum(row.ROB_VLSFO),
      lsmgo: toNum(row.ROB_LSMGO),
      hsfo: toNum(row.ROB_HSFO),
      mgo: toNum(row.ROB_MDO),
    },
    speed: toNum(row.SPEED),
    distance_to_go: row.DISTANCETOGO != null ? toNum(row.DISTANCETOGO) : undefined,
  };
}

function normalizeResponse(body: unknown): DatalogRow[] {
  if (Array.isArray(body)) return body as DatalogRow[];
  if (body && typeof body === 'object' && 'data' in body && Array.isArray((body as { data: unknown }).data)) {
    return (body as { data: DatalogRow[] }).data;
  }
  return [];
}

export class DatalogsClient {
  private readonly baseURL: string;
  private readonly timeout: number;

  constructor() {
    this.baseURL = (
      process.env.NOON_REPORT_API_URL ||
      process.env.NEXT_PUBLIC_FUELSENSE_API_URL ||
      process.env.BUNKER_PRICING_API_URL ||
      'https://uat.fuelsense-api.dexpertsystems.com'
    ).replace(/\/$/, '');
    this.timeout = DEFAULT_TIMEOUT_MS;
  }

  /**
   * Fetch latest noon report(s) for a vessel by IMO.
   * Returns the most recent report (first row after sort by REPORT_DATE DESC).
   */
  async getLatestByIMO(imo: string): Promise<NoonReportData | null> {
    if (!imo || String(imo).trim() === '') return null;
    const normalizedIMO = String(imo).trim();
    const url = `${this.baseURL}/datalogs?filter=VESSEL_IMO||$eq||${encodeURIComponent(normalizedIMO)}&limit=1&sort=REPORT_DATE,DESC`;
    const rows = await this.fetchUrl(url);
    if (rows.length === 0) return null;
    return mapRowToNoonReport(rows[0]);
  }

  /**
   * Fetch latest noon report(s) for a vessel by name (fuzzy match).
   * Uses VESSEL_NAME filter; returns most recent.
   */
  async getLatestByName(vesselName: string): Promise<NoonReportData | null> {
    if (!vesselName || String(vesselName).trim() === '') return null;
    const normalized = String(vesselName).trim();
    const url = `${this.baseURL}/datalogs?filter=VESSEL_NAME||$contL||${encodeURIComponent(normalized)}&limit=1&sort=REPORT_DATE,DESC`;
    const rows = await this.fetchUrl(url);
    if (rows.length === 0) return null;
    return mapRowToNoonReport(rows[0]);
  }

  private async fetchUrl(url: string): Promise<DatalogRow[]> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (process.env.NOON_REPORT_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.NOON_REPORT_API_KEY}`;
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
      throw new Error(`Datalogs API error: ${response.status} - ${message}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error('Datalogs API returned invalid JSON');
    }

    return normalizeResponse(body);
  }
}
