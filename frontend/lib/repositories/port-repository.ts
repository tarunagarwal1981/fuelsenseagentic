/**
 * Port Repository
 * 
 * Simplified wrapper around WorldPortRepositoryAPI for port data access.
 * Delegates to WorldPortIndex API for worldwide port lookups.
 * 
 * Methods:
 * - findByCode: Lookup by UN/LOCODE
 * - findByName: Search by port name
 */

import { WorldPortRepositoryAPI } from './world-port-repository-api';
import { Port, WorldPortEntry } from './types';
import { RedisCache } from './cache-client';

/**
 * Repository for port data access
 * Delegates to WorldPortIndex API with caching
 */
export class PortRepository {
  private apiRepository: WorldPortRepositoryAPI;
  private cache: RedisCache;

  /**
   * Initialize port repository with cache
   * @param cache - Redis cache instance
   */
  constructor(cache: RedisCache) {
    this.cache = cache;
    this.apiRepository = new WorldPortRepositoryAPI(cache);
  }

  /**
   * Transform WorldPortEntry to full Port type (adds bunker fields as defaults)
   */
  private transformToFullPort(apiPort: WorldPortEntry): Port {
    return {
      id: apiPort.id,
      code: apiPort.code ?? apiPort.id ?? '',
      name: apiPort.name,
      country: apiPort.countryCode || '',
      coordinates: apiPort.coordinates,
      bunkerCapable: false, // Default - bunker data not available from WorldPortIndex API yet
      fuelsAvailable: [],    // Default - will be populated from separate bunker API
      timezone: '',          // Default - can be derived from coordinates if needed
    };
  }

  /**
   * Find port by UN/LOCODE
   * @param code - Port code (e.g., "USNYC", "SGSIN")
   * @returns Port or null if not found
   */
  async findByCode(code: string): Promise<Port | null> {
    const apiPort = await this.apiRepository.findByCode(code);
    return apiPort ? this.transformToFullPort(apiPort) : null;
  }

  /**
   * Find port by name (main or alternate)
   * @param name - Port name to search for
   * @returns Port or null if not found
   */
  async findByName(name: string): Promise<Port | null> {
    const apiPort = await this.apiRepository.findByName(name);
    return apiPort ? this.transformToFullPort(apiPort) : null;
  }

  /**
   * Find bunker-capable ports
   * @deprecated This method is not yet implemented with the WorldPortIndex API
   * @returns Empty array - bunker capability data not available yet
   */
  async findBunkerPorts(): Promise<Port[]> {
    console.warn('[PortRepository] findBunkerPorts() not yet implemented with WorldPortIndex API');
    // Return empty array for now - bunker data will come from separate API
    return [];
  }

  /**
   * Find nearby ports within a radius
   * @deprecated This method is not yet implemented with the WorldPortIndex API
   */
  async findNearby(lat: number, lon: number, radiusNm: number): Promise<Port[]> {
    console.warn('[PortRepository] findNearby() not yet implemented with WorldPortIndex API');
    // Return empty array for now
    return [];
  }
}

/**
 * Export Port type for external use
 */
export type { Port };
