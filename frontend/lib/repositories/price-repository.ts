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
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * JSON format price (from prices.json)
 */
interface JsonPrice {
  port_code: string;
  fuel_type: string;
  price_per_mt: number;
  currency: string;
  last_updated: string;
}

/**
 * Convert JSON price format to repository FuelPrice format
 */
function mapJsonToPrice(jsonPrice: JsonPrice): FuelPrice {
  return {
    id: undefined,
    portCode: jsonPrice.port_code,
    fuelType: jsonPrice.fuel_type as FuelPrice['fuelType'],
    priceUSD: jsonPrice.price_per_mt,
    date: new Date(jsonPrice.last_updated).toISOString().split('T')[0],
    source: 'manual',
    updatedAt: new Date(jsonPrice.last_updated),
  };
}

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
    const { portCode, fuelTypes } = query;
    const cacheKey = `fuelsense:prices:${portCode}:latest`;

    // Step 1: Try cache
    try {
      const cached = await this.cache.get<Record<string, number>>(cacheKey);
      if (cached) {
        console.log(`[CACHE HIT] prices:${portCode}:latest`);
        // Filter to only requested fuel types
        const filtered: Record<string, number> = {};
        for (const fuelType of fuelTypes) {
          if (cached[fuelType] !== undefined) {
            filtered[fuelType] = cached[fuelType];
          }
        }
        return filtered;
      }
    } catch (error) {
      console.error(`[PriceRepository] Cache read error for ${portCode}:`, error);
    }

    // Step 2: Try database
    try {
      // Query for latest price of each fuel type
      const { data, error } = await this.db
        .from(this.tableName)
        .select('*')
        .eq('portCode', portCode)
        .in('fuelType', fuelTypes)
        .order('date', { ascending: false })
        .order('updatedAt', { ascending: false });

      if (error) {
        throw error;
      }

      if (data && data.length > 0) {
        // Group by fuelType and take the latest for each
        const pricesByType = new Map<string, FuelPrice & { id: string }>();
        for (const price of data as (FuelPrice & { id: string })[]) {
          if (!pricesByType.has(price.fuelType)) {
            pricesByType.set(price.fuelType, price);
          } else {
            const existing = pricesByType.get(price.fuelType)!;
            const existingDate = new Date(existing.date);
            const currentDate = new Date(price.date);
            if (currentDate > existingDate) {
              pricesByType.set(price.fuelType, price);
            }
          }
        }

        // Convert to record format
        const result: Record<string, number> = {};
        Array.from(pricesByType.entries()).forEach(([fuelType, price]) => {
          result[fuelType] = price.priceUSD;
        });

        // Cache the result
        await this.cache.set(cacheKey, result, this.getCacheTTL());
        console.log(`[DB HIT] prices:${portCode}:latest`);
        return result;
      }
    } catch (error) {
      console.error(`[PriceRepository] Database read error for ${portCode}:`, error);
    }

    // Step 3: Try JSON fallback
    try {
      const allPrices = await this.loadAllPricesFromFallback();
      const portPrices = allPrices.filter((p) => p.portCode === portCode);

      if (portPrices.length > 0) {
        // Group by fuelType and take the latest for each
        const pricesByType = new Map<string, FuelPrice & { id: string }>();
        for (const price of portPrices) {
          if (fuelTypes.includes(price.fuelType)) {
            if (!pricesByType.has(price.fuelType)) {
              pricesByType.set(price.fuelType, price as FuelPrice & { id: string });
            } else {
              const existing = pricesByType.get(price.fuelType)!;
              const existingDate = new Date(existing.date);
              const currentDate = new Date(price.date);
              if (currentDate > existingDate) {
                pricesByType.set(price.fuelType, price as FuelPrice & { id: string });
              }
            }
          }
        }

        const result: Record<string, number> = {};
        Array.from(pricesByType.entries()).forEach(([fuelType, price]) => {
          result[fuelType] = price.priceUSD;
        });

        // Cache the result
        await this.cache.set(cacheKey, result, this.getCacheTTL());
        console.log(`[FALLBACK HIT] prices:${portCode}:latest`);
        return result;
      }
    } catch (error) {
      console.error(`[PriceRepository] Fallback read error for ${portCode}:`, error);
    }

    console.log(`[NOT FOUND] prices:${portCode}:latest`);
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

      // Fallback to JSON if no database results
      const allPrices = await this.loadAllPricesFromFallback();
      const portPrices = allPrices.filter(
        (p) => p.portCode === portCode && p.fuelType === fuelType
      );

      // Filter by date and sort
      const filtered = portPrices
        .filter((p) => {
          const priceDate = new Date(p.date);
          return priceDate >= cutoffDate;
        })
        .sort((a, b) => {
          const dateA = new Date(a.date);
          const dateB = new Date(b.date);
          return dateB.getTime() - dateA.getTime();
        });

      return filtered;
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

      // Fallback to JSON
      const allPrices = await this.loadAllPricesFromFallback();
      const portPrices = allPrices.filter((p) => {
        const priceDate = new Date(p.date);
        return p.portCode === portCode && priceDate >= cutoffDate;
      });

      // Group by fuelType and calculate average
      const pricesByType = new Map<string, number[]>();
      for (const price of portPrices) {
        if (!pricesByType.has(price.fuelType)) {
          pricesByType.set(price.fuelType, []);
        }
        pricesByType.get(price.fuelType)!.push(price.priceUSD);
      }

      const result: Record<string, number> = {};
      Array.from(pricesByType.entries()).forEach(([fuelType, prices]) => {
        const sum = prices.reduce((a, b) => a + b, 0);
        result[fuelType] = sum / prices.length;
      });

      await this.cache.set(cacheKey, result, avgCacheTTL);
      console.log(`[FALLBACK HIT] prices:${portCode}:avg:${days}`);
      return result;
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
   * Load all prices from JSON fallback file
   */
  private async loadAllPricesFromFallback(): Promise<FuelPrice[]> {
    if (!this.fallbackPath) {
      console.log('[PriceRepository] No fallback path configured');
      return [];
    }

    try {
      // Use 'prices.json' instead of 'fuel_prices.json' (actual filename)
      const filePath = path.join(this.fallbackPath, 'prices.json');
      console.log(`[PriceRepository] Loading prices from fallback: ${filePath}`);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const jsonPrices: JsonPrice[] = JSON.parse(fileContent);

      if (!Array.isArray(jsonPrices)) {
        console.log('[PriceRepository] JSON file is not an array');
        return [];
      }

      const prices = jsonPrices.map(mapJsonToPrice);
      console.log(`[PriceRepository] Loaded ${prices.length} prices from JSON fallback`);
      return prices;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        console.error(`[PriceRepository] Error loading fallback:`, err.message || error);
      } else {
        console.log(`[PriceRepository] Fallback file not found: ${path.join(this.fallbackPath, 'prices.json')}`);
      }
      return [];
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
