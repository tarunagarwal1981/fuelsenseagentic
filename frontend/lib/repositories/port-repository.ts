/**
 * Port Repository
 * 
 * Extends BaseRepository to provide port-specific data access methods.
 * Handles mapping between JSON format (port_code, coordinates object) and
 * repository format (code, coordinates array).
 * 
 * Provides optimized methods for common port queries:
 * - findByCode: Fast lookup by port code
 * - findBunkerPorts: Get all bunker-capable ports
 * - findNearby: Find ports within radius using Haversine formula
 * - searchByName: Case-insensitive name search
 */

import { BaseRepository } from './base-repository';
import { RedisCache } from './cache-client';
import { SupabaseClient } from '@supabase/supabase-js';
import { Port } from './types';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * JSON format port (from ports.json)
 */
interface JsonPort {
  port_code: string;
  name: string;
  country: string;
  coordinates: {
    lat: number;
    lon: number;
  };
  fuel_capabilities: string[];
}

/**
 * Convert JSON port format to repository Port format.
 * Coordinates stored as [lat, lon] for consistency with Leaflet and route services.
 */
function mapJsonToPort(jsonPort: JsonPort): Port {
  return {
    id: jsonPort.port_code,
    code: jsonPort.port_code,
    name: jsonPort.name,
    country: jsonPort.country,
    coordinates: [jsonPort.coordinates.lat, jsonPort.coordinates.lon], // [lat, lon]
    bunkerCapable: jsonPort.fuel_capabilities && jsonPort.fuel_capabilities.length > 0,
    fuelsAvailable: jsonPort.fuel_capabilities || [],
    timezone: '', // Not in JSON, will be empty for now
  };
}

/**
 * Convert repository Port format to JSON format (for database storage)
 */
function mapPortToJson(port: Port): Partial<JsonPort> {
  return {
    port_code: port.code,
    name: port.name,
    country: port.country,
    coordinates: {
      lat: port.coordinates[0],
      lon: port.coordinates[1],
    },
    fuel_capabilities: port.fuelsAvailable,
  };
}

export class PortRepository extends BaseRepository<Port> {
  constructor(cache: RedisCache, db: SupabaseClient) {
    // Resolve fallback path relative to project root
    // In Next.js, process.cwd() returns the project root (frontend/)
    // So we just need 'lib/data' not 'frontend/lib/data'
    const fallbackPath = path.join(process.cwd(), 'lib', 'data');
    
    super(cache, db, {
      tableName: 'ports',
      fallbackPath,
    });
  }

  /**
   * Override cache TTL - ports are stable data, cache for 24 hours
   */
  protected getCacheTTL(): number {
    return 86400; // 24 hours
  }

  /**
   * Find port by code with 3-tier fallback
   * Cache key: fuelsense:ports:{code}
   * 
   * @param code Port code (e.g., "SGSIN")
   * @returns Port or null if not found
   */
  async findByCode(code: string): Promise<Port | null> {
    const cacheKey = `fuelsense:ports:${code}`;

    // Step 1: Try cache
    try {
      const cached = await this.cache.get<Port>(cacheKey);
      if (cached) {
        console.log(`[CACHE HIT] ports:${code}`);
        return cached;
      }
    } catch (error) {
      console.error(`[PortRepository] Cache read error for ${code}:`, error);
    }

    // Step 2: Try database
    try {
      const { data, error } = await this.db
        .from(this.tableName)
        .select('*')
        .eq('code', code)
        .single();

      if (error) {
        throw error;
      }

      if (data) {
        const port = data as Port;
        await this.cache.set(cacheKey, port, this.getCacheTTL());
        console.log(`[DB HIT] ports:${code}`);
        return port;
      }
    } catch (error) {
      console.error(`[PortRepository] Database read error for ${code}:`, error);
    }

    // Step 3: Try JSON fallback
    try {
      const fallback = await this.loadPortFromFallback(code);
      if (fallback) {
        await this.cache.set(cacheKey, fallback, this.getCacheTTL());
        console.log(`[FALLBACK HIT] ports:${code}`);
        return fallback;
      }
    } catch (error) {
      console.error(`[PortRepository] Fallback read error for ${code}:`, error);
    }

    // Step 4: Not found
    console.log(`[NOT FOUND] ports:${code}`);
    return null;
  }

  /**
   * Find all bunker-capable ports
   * Cache key: fuelsense:ports:bunker:all
   * Cache TTL: 12 hours
   * 
   * @returns Array of bunker-capable ports
   */
  async findBunkerPorts(): Promise<Port[]> {
    const cacheKey = 'fuelsense:ports:bunker:all';
    const bunkerCacheTTL = 43200; // 12 hours

    // Step 1: Try cache
    try {
      const cached = await this.cache.get<Port[]>(cacheKey);
      if (cached) {
        console.log(`[CACHE HIT] ports:bunker:all`);
        return cached;
      }
    } catch (error) {
      console.error(`[PortRepository] Cache read error for bunker ports:`, error);
    }

    // Step 2: Try database
    try {
      const { data, error } = await this.db
        .from(this.tableName)
        .select('*')
        .eq('bunkerCapable', true);

      if (error) {
        throw error;
      }

      if (data && data.length > 0) {
        const ports = data as Port[];
        await this.cache.set(cacheKey, ports, bunkerCacheTTL);
        console.log(`[DB HIT] ports:bunker:all (${ports.length} ports)`);
        return ports;
      }
    } catch (error) {
      console.error(`[PortRepository] Database read error for bunker ports:`, error);
    }

    // Step 3: Try JSON fallback
    try {
      const allPorts = await this.loadAllPortsFromFallback();
      const bunkerPorts = allPorts.filter((p) => p.bunkerCapable);
      if (bunkerPorts.length > 0) {
        await this.cache.set(cacheKey, bunkerPorts, bunkerCacheTTL);
        console.log(`[FALLBACK HIT] ports:bunker:all (${bunkerPorts.length} ports)`);
        return bunkerPorts;
      }
    } catch (error) {
      console.error(`[PortRepository] Fallback read error for bunker ports:`, error);
    }

    console.log(`[NOT FOUND] ports:bunker:all`);
    return [];
  }

  /**
   * Find ports near a location using Haversine formula
   * Does not cache results (dynamic calculation)
   * 
   * @param lat Latitude in decimal degrees
   * @param lon Longitude in decimal degrees
   * @param radiusNm Radius in nautical miles
   * @returns Array of ports within radius, sorted by distance
   */
  async findNearby(lat: number, lon: number, radiusNm: number): Promise<Port[]> {
    try {
      // Get all ports (from cache, DB, or fallback)
      const allPorts = await this.findAll();

      // Calculate distances and filter
      const portsWithDistance = allPorts
        .map((port) => {
          const distance = this.calculateDistance(
            [lat, lon],
            port.coordinates
          );
          return { port, distance };
        })
        .filter((item) => item.distance <= radiusNm)
        .sort((a, b) => a.distance - b.distance)
        .map((item) => item.port);

      console.log(
        `[PortRepository] Found ${portsWithDistance.length} ports within ${radiusNm}nm of [${lat}, ${lon}]`
      );
      return portsWithDistance;
    } catch (error) {
      console.error(`[PortRepository] Error finding nearby ports:`, error);
      return [];
    }
  }

  /**
   * Search ports by name (case-insensitive)
   * 
   * @param query Search query
   * @returns Array of matching ports (max 20)
   */
  async searchByName(query: string): Promise<Port[]> {
    const searchQuery = query.trim().toLowerCase();
    if (!searchQuery) {
      return [];
    }

    try {
      // Try database first
      const { data, error } = await this.db
        .from(this.tableName)
        .select('*')
        .ilike('name', `%${searchQuery}%`)
        .limit(20);

      if (!error && data && data.length > 0) {
        return data as Port[];
      }
    } catch (error) {
      console.error(`[PortRepository] Database search error:`, error);
    }

    // Fallback to loading all and filtering
    try {
      const allPorts = await this.findAll();
      const matches = allPorts
        .filter((port) => port.name.toLowerCase().includes(searchQuery))
        .slice(0, 20);
      return matches;
    } catch (error) {
      console.error(`[PortRepository] Fallback search error:`, error);
      return [];
    }
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * 
   * @param from [latitude, longitude] of starting point
   * @param to [latitude, longitude] of destination point
   * @returns Distance in nautical miles
   */
  private calculateDistance(
    from: [number, number],
    to: [number, number]
  ): number {
    const R = 3440.065; // Earth's radius in nautical miles

    // Convert degrees to radians
    const lat1Rad = (from[0] * Math.PI) / 180;
    const lat2Rad = (to[0] * Math.PI) / 180;
    const deltaLatRad = ((to[0] - from[0]) * Math.PI) / 180;
    const deltaLonRad = ((to[1] - from[1]) * Math.PI) / 180;

    // Haversine formula
    const a =
      Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
      Math.cos(lat1Rad) *
        Math.cos(lat2Rad) *
        Math.sin(deltaLonRad / 2) *
        Math.sin(deltaLonRad / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
  }

  /**
   * Load a single port from JSON fallback by code
   */
  private async loadPortFromFallback(code: string): Promise<Port | null> {
    if (!this.fallbackPath) {
      return null;
    }

    try {
      const allPorts = await this.loadAllPortsFromFallback();
      return allPorts.find((p) => p.code === code) || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Load all ports from JSON fallback file
   */
  private async loadAllPortsFromFallback(): Promise<Port[]> {
    if (!this.fallbackPath) {
      console.log('[PortRepository] No fallback path configured');
      return [];
    }

    try {
      const filePath = path.join(this.fallbackPath, `${this.tableName}.json`);
      console.log(`[PortRepository] Loading from fallback: ${filePath}`);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const jsonPorts: JsonPort[] = JSON.parse(fileContent);

      if (!Array.isArray(jsonPorts)) {
        console.log('[PortRepository] JSON file is not an array');
        return [];
      }

      const ports = jsonPorts.map(mapJsonToPort);
      console.log(`[PortRepository] Loaded ${ports.length} ports from JSON fallback`);
      return ports;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        console.error(`[PortRepository] Error loading fallback:`, err.message || error);
      } else {
        console.log(`[PortRepository] Fallback file not found: ${path.join(this.fallbackPath, `${this.tableName}.json`)}`);
      }
      return [];
    }
  }

  /**
   * Override findById to use findByCode (since id === code for ports)
   */
  async findById(id: string): Promise<Port | null> {
    return this.findByCode(id);
  }
}
