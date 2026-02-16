/**
 * Bunker Data Service
 *
 * Provides data access for bunker operations: pricing, port capabilities,
 * vessel specs, ROB, fleet status, and historical prices. Uses FuelSense API
 * with in-memory cache. Throws BunkerDataError when API is unavailable.
 */

import axios, { AxiosError } from 'axios';
import type {
  BunkerPricing,
  DateRange,
  FleetFilters,
  PortCapabilities,
  PriceHistory,
  ROBSnapshot,
  VesselSpecs,
  VesselStatus,
} from '@/lib/types/bunker';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const REQUEST_TIMEOUT_MS = 30000;   // 30 seconds
const LOG_PREFIX = '[BunkerDataService]';

/** Typed error for bunker data operations. */
export class BunkerDataError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'BunkerDataError';
  }
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

function getBaseURL(): string {
  const url = (
    process.env.NEXT_PUBLIC_FUELSENSE_API_URL ||
    process.env.BUNKER_PRICING_API_URL ||
    'https://uat.fuelsense-api.dexpertsystems.com/api'
  ).replace(/\/$/, '');
  return url;
}

/**
 * In-memory cache with TTL. Key format: method:serializedParams.
 */
function cacheKey(method: string, params: string): string {
  return `${method}:${params}`;
}

/** Raw row shape from bunker_pricing API (snake_case); also accepts already-normalized camelCase. */
interface RawBunkerPricingRow {
  id?: number | string;
  date?: string;
  port?: string;
  region?: string;
  fuel_type?: string;
  fuelType?: string;
  port_code?: string | null;
  price_usd_per_mt?: number | string;
  priceUsdPerMt?: number | string;
  pricePerMT?: number;
  last_updated?: string | null;
  currency?: string;
  lastUpdated?: string;
  [key: string]: unknown;
}

function toNumber(v: number | string | undefined | null): number {
  if (v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Normalize API row (bunker_pricing table schema or already camelCase) to BunkerPricing. */
function normalizeBunkerPricingRow(row: RawBunkerPricingRow): BunkerPricing {
  const pricePerMT = toNumber(
    row.pricePerMT ??
      row.price_usd_per_mt ??
      row.priceUsdPerMt ??
      (row as { price_per_mt?: number | string }).price_per_mt
  );
  const fuelType = row.fuel_type ?? row.fuelType ?? '';
  const port = (row.port != null && String(row.port).trim() !== '') ? String(row.port).trim() : 'unknown';
  const dateVal = row.date ?? row.last_updated ?? row.lastUpdated;
  const lastUpdated =
    dateVal != null && dateVal !== ''
      ? (typeof dateVal === 'string' ? dateVal : new Date(dateVal).toISOString())
      : new Date().toISOString();
  const currency = (row.currency != null && String(row.currency).trim() !== '') ? String(row.currency) : 'USD';
  const portCode =
    row.port_code != null && String(row.port_code).trim() !== '' ? String(row.port_code).trim() : undefined;
  return {
    port,
    portCode,
    fuelType,
    pricePerMT,
    currency,
    lastUpdated,
  };
}

/**
 * Bunker data service: fetches from FuelSense API with cache.
 * Use for bunker planning, pricing, port capabilities, vessel specs, ROB, and fleet status.
 */
export class BunkerDataService {
  private readonly baseURL: string;
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(baseURL?: string) {
    this.baseURL = baseURL ?? getBaseURL();
  }

  /** Clear in-memory cache (e.g. for testing or after API schema changes). */
  clearCache(): void {
    this.cache.clear();
    console.log(`${LOG_PREFIX} cache cleared`);
  }

  /**
   * GET request with timeout, logging, and optional cache lookup.
   */
  private async get<T>(
    path: string,
    options: { cacheKey?: string; skipCache?: boolean } = {}
  ): Promise<T> {
    const url = `${this.baseURL}${path}`;
    if (options.cacheKey && !options.skipCache) {
      const hit = this.cache.get(options.cacheKey) as CacheEntry<T> | undefined;
      if (hit && hit.expiresAt > Date.now()) {
        console.log(`${LOG_PREFIX} cache hit: ${options.cacheKey}`);
        return hit.data;
      }
    }

    console.log(`${LOG_PREFIX} request GET ${url}`);
    try {
      const response = await axios.get<T>(url, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json' },
        validateStatus: (status: number) => status >= 200 && status < 300,
      });
      console.log(`${LOG_PREFIX} response ${response.status} ${path}`);
      const data = response.data;
      if (options.cacheKey && data !== undefined) {
        this.cache.set(options.cacheKey, {
          data,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
      }
      return data;
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      const status = axiosErr.response?.status;
      const message = axiosErr.response?.data?.message ?? axiosErr.message ?? String(err);
      console.warn(`${LOG_PREFIX} API error ${path}:`, status ?? message);
      throw new BunkerDataError(
        `Bunker API error: ${status ?? 'network'} - ${message}`,
        axiosErr.code,
        status
      );
    }
  }

  /**
   * Fetch bunker pricing for given ports, optional fuel types and date range.
   * @param ports - Port codes or names
   * @param fuelTypes - Optional filter by fuel types
   * @param dateRange - Optional date range
   * @returns Bunker pricing records
   */
  async fetchBunkerPricing(
    ports: string[],
    fuelTypes?: string[],
    dateRange?: DateRange
  ): Promise<BunkerPricing[]> {
    const key = cacheKey('pricing', JSON.stringify({ ports, fuelTypes, dateRange }));
    const params = new URLSearchParams();
    if (ports.length) params.set('ports', ports.join(','));
    if (fuelTypes?.length) params.set('fuelTypes', fuelTypes.join(','));
    if (dateRange) {
      params.set('startDate', dateRange.startDate);
      params.set('endDate', dateRange.endDate);
    }
    const path = `/bunker-pricing?${params.toString()}`;
    const raw = await this.get<RawBunkerPricingRow[] | { data: RawBunkerPricingRow[] }>(path, { cacheKey: key });
    const list = Array.isArray(raw) ? raw : (raw?.data ?? []);
    return list.map((row) => normalizeBunkerPricingRow(row));
  }

  /**
   * Fetch port capabilities for a single port.
   * @param portCode - UN/LOCODE or port code
   * @returns Port capabilities including fuel types and ECA zone
   */
  async fetchPortCapabilities(portCode: string): Promise<PortCapabilities> {
    const key = cacheKey('portCapabilities', portCode);
    const path = `/ports/${encodeURIComponent(portCode)}/capabilities`;
    return this.get<PortCapabilities>(path, { cacheKey: key });
  }

  /**
   * Fetch vessel specifications for bunker planning.
   * @param vesselId - Vessel IMO or internal ID
   * @returns Vessel specs including consumption and tank capacity
   */
  async fetchVesselSpecs(vesselId: string): Promise<VesselSpecs> {
    const key = cacheKey('vesselSpecs', vesselId);
    const path = `/vessels/${encodeURIComponent(vesselId)}/specs`;
    return this.get<VesselSpecs>(path, { cacheKey: key });
  }

  /**
   * Fetch current remaining-on-board snapshot for a vessel.
   * @param vesselId - Vessel IMO or internal ID
   * @returns ROB snapshot with fuel grades and location
   */
  async fetchCurrentROB(vesselId: string): Promise<ROBSnapshot> {
    const key = cacheKey('rob', vesselId);
    const path = `/vessels/${encodeURIComponent(vesselId)}/rob`;
    return this.get<ROBSnapshot>(path, { cacheKey: key });
  }

  /**
   * Fetch fleet status with optional filters.
   * @param filters - Optional filters (availability, region, vessel types, capacity)
   * @returns List of vessel statuses
   */
  async fetchFleetStatus(filters?: FleetFilters): Promise<VesselStatus[]> {
    const key = cacheKey('fleetStatus', JSON.stringify(filters ?? {}));
    const params = new URLSearchParams();
    if (filters?.availableAfter) params.set('availableAfter', filters.availableAfter);
    if (filters?.currentRegion) params.set('currentRegion', filters.currentRegion);
    if (filters?.vesselTypes?.length) params.set('vesselTypes', filters.vesselTypes.join(','));
    if (filters?.minCapacity != null) params.set('minCapacity', String(filters.minCapacity));
    const path = `/fleet/status?${params.toString()}`;
    const raw = await this.get<VesselStatus[] | { data: VesselStatus[] }>(path, { cacheKey: key });
    const list = Array.isArray(raw) ? raw : (raw?.data ?? []);
    return list;
  }

  /**
   * Fetch historical bunker prices for a port and fuel type.
   * @param port - Port code or name
   * @param fuelType - Fuel type (e.g. VLSFO, MGO)
   * @param lookbackDays - Number of days to look back
   * @returns Time-ordered price history
   */
  async fetchHistoricalBunkerPrices(
    port: string,
    fuelType: string,
    lookbackDays: number
  ): Promise<PriceHistory[]> {
    const key = cacheKey('priceHistory', `${port}:${fuelType}:${lookbackDays}`);
    const params = new URLSearchParams({
      port,
      fuelType,
      lookbackDays: String(lookbackDays),
    });
    const path = `/bunker-pricing/history?${params.toString()}`;
    const raw = await this.get<PriceHistory[] | { data: PriceHistory[] }>(path, { cacheKey: key });
    const list = Array.isArray(raw) ? raw : (raw?.data ?? []);
    return list;
  }
}

/** Singleton instance for use across the app. */
export const bunkerDataService = new BunkerDataService();
