/**
 * Price Repository
 * 
 * Extends BaseRepository to provide fuel price data access methods.
 * Handles mapping between JSON format and repository format.
 * 
 * Provides optimized methods for price queries:
 * - getLatestPrices: Get most recent prices for fuel types at a port
 * - getPriceHistory: Get historical prices over time period
 * - getAveragePrices: Calculate average prices over period
 * - addPrice: Insert new price record with cache invalidation
 */

import { BaseRepository } from './base-repository';
import { RedisCache } from './cache-client';
import { SupabaseClient } from '@supabase/supabase-js';
import { FuelPrice, PriceQuery } from './types';
import { BunkerPricingClient } from '@/lib/clients/bunker-pricing-client';
import * as path from 'path';

/**
 * Convert repository FuelPrice format to JSON format (for database storage)
 */
function mapPriceToJson(price: FuelPrice): Partial<JsonPrice> {
  return {
    port_code: price.portCode,
    fuel_type: price.fuelType,
    price_per_mt: price.priceUSD,
    currency: 'USD',
    last_updated: price.updatedAt.toISOString(),
  };
}

export class PriceRepository extends BaseRepository<FuelPrice & { id: string }> {
  constructor(cache: RedisCache, db: SupabaseClient) {
    // Resolve fallback path relative to project root
    const fallbackPath = path.join(process.cwd(), 'lib', 'data');

    super(cache, db, {
      tableName: 'fuel_prices',
      fallbackPath,
    });
  }

  /**
   * Override cache TTL - prices change frequently, cache for 1 hour
   */
  protected getCacheTTL(): number {
    return 3600; // 1 hour
  }

  /**
   * Get latest prices for fuel types at a port
   * Returns a map of fuelType -> priceUSD
   * 
   * @param query Price query parameters
   * @returns Record mapping fuel types to prices
   */
  async getLatestPrices(query: PriceQuery): Promise<Record<string, number>> {
    const { portCode, portName, fuelTypes } = query;
    const cacheKey = `fuelsense:prices:${portCode ?? portName ?? ''}:latest`;
    const label = portCode ?? portName ?? 'unknown';

    // Step 1: Try cache
    try {
      const cached = await this.cache.get<Record<string, number>>(cacheKey);
      if (cached) {
        console.log(`[CACHE HIT] prices:${label}:latest`);
        const filtered: Record<string, number> = {};
        for (const fuelType of fuelTypes) {
          if (cached[fuelType] !== undefined) {
            filtered[fuelType] = cached[fuelType];
          }
        }
        return filtered;
      }
    } catch (error) {
      console.error(`[PriceRepository] Cache read error for ${label}:`, error);
    }

    // Step 2: Try BunkerPricing API by port name only (API has no port_code; cache is Redis only, no Supabase)
    const hasPortName = portName != null && String(portName).trim() !== '';
    if (hasPortName) {
      try {
        const bunkerClient = new BunkerPricingClient();
        const apiPrices = await bunkerClient.getByPortName(String(portName).trim());
        if (apiPrices.length > 0) {
          const latestByFuel = new Map<string, { priceUSD: number; updatedAt: Date }>();
          for (const p of apiPrices) {
            if (!fuelTypes.includes(p.fuelType)) continue;
            const existing = latestByFuel.get(p.fuelType);
            if (!existing || p.updatedAt.getTime() > existing.updatedAt.getTime()) {
              latestByFuel.set(p.fuelType, { priceUSD: p.priceUSD, updatedAt: p.updatedAt });
            }
          }
          const result: Record<string, number> = {};
          latestByFuel.forEach(({ priceUSD }, fuelType) => {
            result[fuelType] = priceUSD;
          });
          if (Object.keys(result).length > 0) {
            await this.cache.set(cacheKey, result, this.getCacheTTL());
            console.log(`[API HIT] prices:${label}:latest`);
            return result;
          }
        }
      } catch (error) {
        console.error(`[PriceRepository] API read error for ${label}:`, error instanceof Error ? error.message : String(error));
      }
    }

    console.log(`[NOT FOUND] prices:${label}:latest`);
    return {};
  }

  /**
   * Get price history for a port and fuel type over specified days
   * 
   * @param portCode Port code
   * @param fuelType Fuel type
   * @param days Number of days to look back
   * @returns Array of price records sorted by date descending
   */
  async getPriceHistory(
    portCode: string,
    fuelType: string,
    days: number
  ): Promise<FuelPrice[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

      // Query database for historical prices
      const { data, error } = await this.db
        .from(this.tableName)
        .select('*')
        .eq('portCode', portCode)
        .eq('fuelType', fuelType)
        .gte('date', cutoffDateStr)
        .order('date', { ascending: false })
        .order('updatedAt', { ascending: false });

      if (error) {
        throw error;
      }

      if (data && data.length > 0) {
        return data as FuelPrice[];
      }

      return [];
    } catch (error) {
      console.error(
        `[PriceRepository] Error getting price history for ${portCode}/${fuelType}:`,
        error
      );
      return [];
    }
  }

  /**
   * Get average prices for a port over specified days
   * 
   * @param portCode Port code
   * @param days Number of days to average over
   * @returns Record mapping fuel types to average prices
   */
  async getAveragePrices(
    portCode: string,
    days: number
  ): Promise<Record<string, number>> {
    const cacheKey = `fuelsense:prices:${portCode}:avg:${days}`;
    const avgCacheTTL = 21600; // 6 hours

    // Step 1: Try cache
    try {
      const cached = await this.cache.get<Record<string, number>>(cacheKey);
      if (cached) {
        console.log(`[CACHE HIT] prices:${portCode}:avg:${days}`);
        return cached;
      }
    } catch (error) {
      console.error(`[PriceRepository] Cache read error for averages:`, error);
    }

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

      // Query database and calculate averages
      const { data, error } = await this.db
        .from(this.tableName)
        .select('fuelType, priceUSD')
        .eq('portCode', portCode)
        .gte('date', cutoffDateStr);

      if (error) {
        throw error;
      }

      if (data && data.length > 0) {
        // Group by fuelType and calculate average
        const pricesByType = new Map<string, number[]>();
        for (const record of data as { fuelType: string; priceUSD: number }[]) {
          if (!pricesByType.has(record.fuelType)) {
            pricesByType.set(record.fuelType, []);
          }
          pricesByType.get(record.fuelType)!.push(record.priceUSD);
        }

        const result: Record<string, number> = {};
        Array.from(pricesByType.entries()).forEach(([fuelType, prices]) => {
          const sum = prices.reduce((a, b) => a + b, 0);
          result[fuelType] = sum / prices.length;
        });

        // Cache the result
        await this.cache.set(cacheKey, result, avgCacheTTL);
        console.log(`[DB HIT] prices:${portCode}:avg:${days}`);
        return result;
      }

      return {};
    } catch (error) {
      console.error(`[PriceRepository] Error getting average prices:`, error);
      return {};
    }
  }

  /**
   * Add a new price record
   * Validates price and invalidates cache for the port
   * 
   * @param price Price data (without id)
   * @returns Created price record with id
   */
  async addPrice(price: Omit<FuelPrice, 'id'>): Promise<FuelPrice> {
    // Validate price
    if (!this.validatePrice(price.priceUSD)) {
      throw new Error(
        `Invalid price: ${price.priceUSD}. Price must be between $100 and $1500 per MT.`
      );
    }

    try {
      // Insert into database
      const { data, error } = await this.db
        .from(this.tableName)
        .insert({
          portCode: price.portCode,
          fuelType: price.fuelType,
          priceUSD: price.priceUSD,
          date: price.date,
          source: price.source,
          updatedAt: price.updatedAt.toISOString(),
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error('Failed to create price record');
      }

      const created = data as FuelPrice;

      // Invalidate cache for this port
      await this.invalidateCache(price.portCode);

      console.log(
        `[PriceRepository] Added price for ${price.portCode}/${price.fuelType}: $${price.priceUSD}`
      );

      return created;
    } catch (error) {
      console.error(`[PriceRepository] Error adding price:`, error);
      throw error;
    }
  }

  /**
   * Validate price is within acceptable range
   * 
   * @param price Price in USD per MT
   * @returns True if price is valid
   */
  private validatePrice(price: number): boolean {
    // Prices should be between $100-$1500 per MT
    return price >= 100 && price <= 1500;
  }

  /**
   * Invalidate cache for a specific port
   * Overrides base method to handle port-specific cache keys
   */
  protected async invalidateCache(portCode?: string): Promise<void> {
    try {
      if (portCode) {
        // Invalidate latest prices cache
        await this.cache.delete(`fuelsense:prices:${portCode}:latest`);
        // Invalidate average prices caches (pattern matching)
        const avgPattern = `fuelsense:prices:${portCode}:avg:*`;
        await this.cache.clear(avgPattern);
      } else {
        // Invalidate all price caches
        await this.cache.clear('fuelsense:prices:*');
      }
    } catch (error) {
      console.error(`[PriceRepository] Error invalidating cache:`, error);
    }
  }

  /**
   * Override findById - prices use composite key (portCode + fuelType + date)
   * This method is not typically used for prices
   */
  async findById(id: string): Promise<(FuelPrice & { id: string }) | null> {
    // For prices, id might be a composite key or UUID
    // Delegate to base implementation
    const result = await super.findById(id);
    // Ensure id is present
    if (result && !result.id) {
      return { ...result, id } as FuelPrice & { id: string };
    }
    return result;
  }
}

/** JSON shape used for database storage (mapPriceToJson) */
interface JsonPrice {
  port_code: string;
  fuel_type: string;
  price_per_mt: number;
  currency: string;
  last_updated: string;
}
