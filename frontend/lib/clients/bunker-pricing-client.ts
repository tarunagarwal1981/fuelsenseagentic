/**
 * BunkerPricing API client
 *
 * Fetches from FuelSense BunkerPricing REST API (fuelsense.bunker table).
 * Table columns: port (name), port_code (NULL), fuel_type, price_usd_per_mt, date, region.
 * Uses @nestjsx/crud-request for query params (filter, sort, limit, offset).
 */

import { RequestQueryBuilder, CondOperator } from '@nestjsx/crud-request';

/** API row shape: API returns camelCase (fuelType, priceUsdPerMt); DB/snake_case also supported */
export interface BunkerPricingRow {
  id?: string | number;
  port?: string;
  port_code?: string | null;
  fuel_type?: string;
  fuelType?: string;
  price_usd_per_mt?: number | string;
  priceUsdPerMt?: number | string;
  price_per_mt?: number | string; // legacy alias
  currency?: string;
  date?: string;
  last_updated?: string | null;
  region?: string;
  [key: string]: unknown;
}

/** Parse date safely; avoid "Invalid time value" from bad/missing values. */
function safeParseDate(value: unknown): Date {
  if (value == null || value === '') return new Date();
  if (typeof value !== 'string') return new Date();
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : new Date();
}

/** Mapped internal shape for repository/callers */
export interface BunkerPriceMapped {
  portCode: string;
  portName: string;
  fuelType: string;
  priceUSD: number;
  date: string;
  updatedAt: Date;
}

const DEFAULT_TIMEOUT_MS = 10000;

function toNumber(v: number | string | undefined | null): number {
  if (v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapRowToInternal(row: BunkerPricingRow): BunkerPriceMapped {
  const dateValue = row.date ?? row.last_updated;
  const updated = safeParseDate(dateValue);
  const priceUSD = toNumber(
    row.price_usd_per_mt ?? row.priceUsdPerMt ?? row.price_per_mt
  );
  const portName = (row.port != null && String(row.port).trim() !== '') ? String(row.port).trim() : '';
  const portCode = (row.port_code != null && String(row.port_code).trim() !== '') ? String(row.port_code).trim() : '';
  const fuelType = row.fuel_type ?? row.fuelType ?? '';
  return {
    portCode,
    portName,
    fuelType,
    priceUSD,
    date: updated.toISOString().split('T')[0],
    updatedAt: updated,
  };
}

function normalizeResponse(body: unknown): BunkerPricingRow[] {
  if (Array.isArray(body)) return body as BunkerPricingRow[];
  if (body && typeof body === 'object' && 'data' in body && Array.isArray((body as { data: unknown }).data)) {
    return (body as { data: BunkerPricingRow[] }).data;
  }
  return [];
}

/**
 * Keep only rows for the latest date present in the response.
 * Ensures we never mix in older dates when the API returns multiple dates.
 */
function filterToLatestDate(rows: BunkerPriceMapped[]): BunkerPriceMapped[] {
  if (rows.length === 0) return [];
  let latestTs = 0;
  for (const r of rows) {
    const ts = r.updatedAt.getTime();
    if (ts > latestTs) latestTs = ts;
  }
  const latestDateStr = new Date(latestTs).toISOString().split('T')[0];
  return rows.filter((r) => r.date === latestDateStr);
}

/**
 * Reduce rows to one per fuelType with the latest date (updatedAt).
 * Use after filterToLatestDate so we only consider the latest date.
 */
function pickLatestByDatePerFuelType(rows: BunkerPriceMapped[]): BunkerPriceMapped[] {
  const byFuel = new Map<string, BunkerPriceMapped>();
  for (const row of rows) {
    const existing = byFuel.get(row.fuelType);
    if (!existing || row.updatedAt.getTime() > existing.updatedAt.getTime()) {
      byFuel.set(row.fuelType, row);
    }
  }
  return Array.from(byFuel.values());
}

export class BunkerPricingClient {
  private readonly baseURL: string;
  private readonly timeout: number;

  constructor() {
    this.baseURL = (
      process.env.NEXT_PUBLIC_FUELSENSE_API_URL ||
      process.env.BUNKER_PRICING_API_URL ||
      'https://uat.fuelsense-api.dexpertsystems.com/api'
    ).replace(/\/$/, '');
    this.timeout = DEFAULT_TIMEOUT_MS;
  }

  /**
   * Fetch all bunker-pricing rows (paginated if API limits page size).
   */
  async getAll(): Promise<BunkerPriceMapped[]> {
    const limit = 500;
    let offset = 0;
    const all: BunkerPriceMapped[] = [];

    while (true) {
      const qb = RequestQueryBuilder.create()
        .setLimit(limit)
        .setOffset(offset)
        .sortBy({ field: 'port_code', order: 'ASC' });
      const queryString = qb.query();
      const url = `${this.baseURL}/bunker-pricing${queryString ? '?' + queryString : ''}`;

      const rows = await this.fetchUrl(url);
      const mapped = rows.map(mapRowToInternal);
      all.push(...mapped);

      if (mapped.length < limit) break;
      offset += limit;
    }

    return all;
  }

  /**
   * Fetch bunker-pricing rows for a single port by code (for getLatestPrices).
   * Note: fuelsense.bunker has port_code NULL; use getByPortName for name-based lookup.
   */
  async getByPortCode(portCode: string): Promise<BunkerPriceMapped[]> {
    if (!portCode || String(portCode).trim() === '') return [];
    const qb = RequestQueryBuilder.create()
      .setFilter({ field: 'port_code', operator: CondOperator.EQUALS, value: portCode })
      .setLimit(200);
    let queryString = qb.query();
    queryString = queryString ? `${queryString}&sort=date,DESC` : 'sort=date,DESC';
    const url = `${this.baseURL}/bunker-pricing${queryString ? '?' + queryString : ''}`;

    const rows = await this.fetchUrl(url);
    const mapped = rows.map(mapRowToInternal);
    const latestDateOnly = filterToLatestDate(mapped);
    return pickLatestByDatePerFuelType(latestDateOnly);
  }

  /**
   * Fetch bunker-pricing rows for a single port by name (fuelsense.bunker column: port).
   * Uses sort=date,DESC (API ignores sort[0]=... array format; needs flat sort param for latest-first).
   */
  async getByPortName(portName: string): Promise<BunkerPriceMapped[]> {
    if (!portName || String(portName).trim() === '') return [];
    const normalizedName = String(portName).trim();
    try {
      const qb = RequestQueryBuilder.create()
        .setFilter({ field: 'port', operator: CondOperator.EQUALS, value: normalizedName })
        .setLimit(200);
      let queryString = qb.query();
      // API expects sort=date,DESC (flat); RequestQueryBuilder produces sort[0]=date,DESC which API ignores
      queryString = queryString ? `${queryString}&sort=date,DESC` : 'sort=date,DESC';
      const url = `${this.baseURL}/bunker-pricing${queryString ? '?' + queryString : ''}`;
      const rows = await this.fetchUrl(url);
      if (rows.length > 0) {
        const mapped = rows.map(mapRowToInternal);
        const latestDateOnly = filterToLatestDate(mapped);
        return pickLatestByDatePerFuelType(latestDateOnly);
      }
    } catch {
      // API may not support filter by port; fall back to client-side filter
    }
    const all = await this.getAll();
    const lower = normalizedName.toLowerCase();
    const filtered = all.filter((p) => p.portName.toLowerCase() === lower || p.portName.toLowerCase().includes(lower) || lower.includes(p.portName.toLowerCase()));
    const latestDateOnly = filterToLatestDate(filtered);
    return pickLatestByDatePerFuelType(latestDateOnly);
  }

  private async fetchUrl(url: string): Promise<BunkerPricingRow[]> {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
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
      throw new Error(`BunkerPricing API error: ${response.status} - ${message}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error('BunkerPricing API returned invalid JSON');
    }

    return normalizeResponse(body);
  }
}
