/**
 * VesselDetails API Client (Vessel Master)
 *
 * Fetches vessel master data from FuelSense VesselDetails REST API.
 * Uses NestJS CRUD query params (filter, limit).
 * Maps API response (camelCase) to VesselBasicInfo.
 */

import type { VesselBasicInfo } from '@/lib/types/vessel-performance';

/** Raw API row shape - VesselDetails API returns camelCase */
export interface VesselDetailRow {
  imo?: number | string;
  vesselName?: string;
  vesselType?: string;
  vesselSubType?: string;
  builtDate?: string;
  deadweight?: string | number;
  grossTonnage?: number;
  flag?: string;
  class?: string;
  office?: string;
  fleet?: string;
  registeredOwner?: string;
  [key: string]: unknown;
}

const DEFAULT_TIMEOUT_MS = 15000;

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function extractBuiltYear(builtDate: unknown): number {
  if (!builtDate || typeof builtDate !== 'string') return 0;
  const match = builtDate.match(/^(\d{4})/);
  return match ? parseInt(match[1], 10) : 0;
}

function mapRowToVesselBasicInfo(row: VesselDetailRow): VesselBasicInfo {
  const imo = row.imo != null ? String(row.imo) : '';
  const built = extractBuiltYear(row.builtDate) || new Date().getFullYear();
  const operator = [row.registeredOwner, row.office, row.fleet].find((s) => s && String(s).trim());
  return {
    imo,
    name: String(row.vesselName || ''),
    type: String(row.vesselType || row.vesselSubType || 'Unknown'),
    dwt: toNum(row.deadweight),
    flag: String(row.flag || ''),
    built,
    operator: operator ? String(operator).trim() : undefined,
  };
}

function normalizeResponse(body: unknown): VesselDetailRow[] {
  if (Array.isArray(body)) return body as VesselDetailRow[];
  if (body && typeof body === 'object' && 'data' in body && Array.isArray((body as { data: unknown }).data)) {
    return (body as { data: VesselDetailRow[] }).data;
  }
  return [];
}

export class VesselDetailsClient {
  private readonly baseURL: string;
  private readonly timeout: number;

  constructor() {
    this.baseURL = (
      process.env.VESSEL_MASTER_API_URL ||
      process.env.NEXT_PUBLIC_FUELSENSE_API_URL ||
      process.env.NOON_REPORT_API_URL ||
      'https://uat.fuelsense-api.dexpertsystems.com'
    ).replace(/\/$/, '');
    this.timeout = DEFAULT_TIMEOUT_MS;
  }

  /**
   * Fetch multiple vessel details (e.g. for "how many vessels" queries).
   * Uses limit param. Returns up to `limit` vessels.
   */
  async getAll(limit = 100): Promise<VesselBasicInfo[]> {
    const url = `${this.baseURL}/vessel-details?limit=${limit}`;
    const rows = await this.fetchUrl(url);
    return rows.map(mapRowToVesselBasicInfo);
  }

  /**
   * Fetch vessel details by IMO.
   * Uses filter imo||$eq||{imo} (API uses camelCase).
   */
  async getByIMO(imo: string): Promise<VesselBasicInfo | null> {
    if (!imo || String(imo).trim() === '') return null;
    const normalizedIMO = String(imo).trim();
    const url = `${this.baseURL}/vessel-details?filter=imo||$eq||${encodeURIComponent(normalizedIMO)}&limit=1`;
    const rows = await this.fetchUrl(url);
    if (rows.length === 0) return null;
    return mapRowToVesselBasicInfo(rows[0]);
  }

  /**
   * Fetch vessel details by name (fuzzy match).
   * Uses filter vesselName||$contL||{name}.
   */
  async getByName(vesselName: string): Promise<VesselBasicInfo | null> {
    if (!vesselName || String(vesselName).trim() === '') return null;
    const normalized = String(vesselName).trim();
    const url = `${this.baseURL}/vessel-details?filter=vesselName||$contL||${encodeURIComponent(normalized)}&limit=1`;
    const rows = await this.fetchUrl(url);
    if (rows.length === 0) return null;
    return mapRowToVesselBasicInfo(rows[0]);
  }

  private async fetchUrl(url: string): Promise<VesselDetailRow[]> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (process.env.VESSEL_MASTER_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.VESSEL_MASTER_API_KEY}`;
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
      throw new Error(`VesselDetails API error: ${response.status} - ${message}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error('VesselDetails API returned invalid JSON');
    }

    return normalizeResponse(body);
  }
}
