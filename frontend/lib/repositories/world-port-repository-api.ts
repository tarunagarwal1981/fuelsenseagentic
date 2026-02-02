import { WorldPortIndexClient, WorldPortIndexPort } from '../clients/world-port-index-client';
import { RedisCache } from './cache-client';
import type { WorldPortEntry, IWorldPortRepository } from './types';
import { stringSimilarity, removeCommonAffixes } from '../utils/string-similarity';

/**
 * Known alternate spellings for port names (normalized key -> search terms to try).
 * Used when exact and affix-removed search return 0 (e.g. API has "Al Fujayrah", user types "Fujairah").
 */
const NAME_SPELLING_VARIANTS: Record<string, string[]> = {
  fujairah: ['fujayrah', 'al fujayrah'],
};

/**
 * Repository for WorldPortIndex data with caching and business logic
 * Handles data transformation, normalization, and caching strategies
 */
export class WorldPortRepositoryAPI implements IWorldPortRepository {
  private client: WorldPortIndexClient;
  private cache: RedisCache;
  private readonly CACHE_TTL = 24 * 60 * 60; // 24 hours in seconds

  /**
   * Initialize repository with cache client
   * @param cache - Redis cache instance for caching port data
   */
  constructor(cache: RedisCache) {
    this.client = new WorldPortIndexClient();
    this.cache = cache;
  }

  /**
   * Find a port by its UN/LOCODE
   * Uses cache-aside pattern for performance
   * @param code - Port code (e.g., "USNYC", "SGSIN")
   * @returns Promise with port data or null if not found
   */
  public async findByCode(code: string): Promise<WorldPortEntry | null> {
    try {
      // 0. Guard: invalid code → return null (avoid "Cannot read properties of null (reading 'replace')")
      if (code == null || typeof code !== 'string' || String(code).trim() === '') {
        return null;
      }
      // 1. Normalize the code
      const normalizedCode = this.normalizeCode(code);

      // 2. Create cache key
      const cacheKey = `fuelsense:port:code:${normalizedCode}`;

      // 3. Try to get from cache
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        // Cache hit: Handle both string and object returns
        if (typeof cached === 'string') {
          return JSON.parse(cached) as WorldPortEntry;
        } else {
          return cached as WorldPortEntry;
        }
      }

      // 4. Cache miss: Call API
      const apiPort = await this.client.findByLOCODE(normalizedCode);
      
      // If API returns null → return null
      if (!apiPort) {
        return null;
      }

      // If API returns port:
      // Transform using transformPort()
      const port = this.transformPort(apiPort);

      // Store in cache with CACHE_TTL
      await this.cache.set(cacheKey, JSON.stringify(port), this.CACHE_TTL);

      // Also cache by name
      const nameCacheKey = `fuelsense:port:name:${port.name.toLowerCase()}`;
      await this.cache.set(nameCacheKey, JSON.stringify(port), this.CACHE_TTL);

      // Return Port object
      return port;
    } catch (error) {
      // 5. Graceful degradation - log warning and return null
      console.warn(`Error finding port by code ${code}:`, error);
      return null;
    }
  }

  /**
   * Find a port by name (main or alternate)
   * Searches and returns best matching port using fuzzy matching if needed
   * @param name - Port name to search for
   * @returns Promise with port data or null if no match found
   */
  public async findByName(name: string): Promise<WorldPortEntry | null> {
    try {
      // 1. Normalize the name
      const normalizedName = this.normalizeName(name);

      // 2. Create cache key
      const cacheKey = `fuelsense:port:name:${normalizedName}`;

      // 3. Try to get from cache
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        // Cache hit: Handle both string and object returns
        if (typeof cached === 'string') {
          return JSON.parse(cached) as WorldPortEntry;
        } else {
          return cached as WorldPortEntry;
        }
      }

      // 4. Cache miss: Call API with original normalized name
      const apiPorts = await this.client.searchByName(normalizedName);
      
      // If API returns results, use fuzzy matching to select best
      if (apiPorts.length > 0) {
        console.log(`✅ [PORT-REPO] Found ${apiPorts.length} results for "${name}"`);
        const port = this.selectBestFuzzyMatch(name, apiPorts);
        
        if (port) {
          // Store in cache by name
          await this.cache.set(cacheKey, JSON.stringify(port), this.CACHE_TTL);
          
          // Also store by code
          if (port.code) {
            const codeCacheKey = `fuelsense:port:code:${port.code}`;
            await this.cache.set(codeCacheKey, JSON.stringify(port), this.CACHE_TTL);
          }
          
          return port;
        }
      }
      
      // 5. No results with normalized name - try fuzzy search with affix removal
      const cleanedName = removeCommonAffixes(name);
      if (cleanedName !== normalizedName) {
        console.log(`🔍 [PORT-REPO] Trying fuzzy search: "${name}" → "${cleanedName}"`);
        const fuzzyResults = await this.client.searchByName(cleanedName);
        
        if (fuzzyResults.length > 0) {
          console.log(`✅ [PORT-REPO] Fuzzy match found: "${name}" → "${cleanedName}" → ${fuzzyResults.length} results`);
          const port = this.selectBestFuzzyMatch(name, fuzzyResults);
          
          if (port) {
            // Store in cache by original name
            await this.cache.set(cacheKey, JSON.stringify(port), this.CACHE_TTL);
            
            // Also store by code
            if (port.code) {
              const codeCacheKey = `fuelsense:port:code:${port.code}`;
              await this.cache.set(codeCacheKey, JSON.stringify(port), this.CACHE_TTL);
            }
            
            return port;
          }
        }
      }

      // 6. No results - try alternate spellings (e.g. Fujairah -> Fujayrah, Al Fujayrah)
      const variants = NAME_SPELLING_VARIANTS[normalizedName];
      if (variants?.length) {
        for (const variant of variants) {
          console.log(`🔍 [PORT-REPO] Trying spelling variant: "${name}" → "${variant}"`);
          const variantResults = await this.client.searchByName(variant);
          if (variantResults.length > 0) {
            console.log(`✅ [PORT-REPO] Spelling variant match: "${name}" → "${variant}" → ${variantResults.length} results`);
            const port = this.selectBestFuzzyMatch(name, variantResults);
            if (port) {
              await this.cache.set(cacheKey, JSON.stringify(port), this.CACHE_TTL);
              if (port.code) {
                const codeCacheKey = `fuelsense:port:code:${port.code}`;
                await this.cache.set(codeCacheKey, JSON.stringify(port), this.CACHE_TTL);
              }
              return port;
            }
          }
        }
      }

      // 7. No matches found
      console.warn(`⚠️ [PORT-REPO] No port found for "${name}"`);
      return null;
    } catch (error) {
      // 8. Graceful degradation - log warning and return null
      console.warn(`Error finding port by name ${name}:`, error);
      return null;
    }
  }

  /**
   * Transform API port data to application Port format
   * @param apiPort - Raw port data from WorldPortIndex API
   * @returns Transformed port object for application use
   * @throws Error if coordinates are invalid
   */
  private transformPort(apiPort: WorldPortIndexPort): WorldPortEntry {
    // 1. Extract fields from API response (camelCase format)
    const rawCode = apiPort.unLocode || '';
    const code = this.normalizeCode(rawCode); // Normalize to remove spaces
    const name = apiPort.mainPortName || '';
    const countryCode = apiPort.countryCode || '';
    const latitude = apiPort.latitude || 0;
    const longitude = apiPort.longitude || 0;
    const harborSize = apiPort.harborSize;

    // 2. Validate coordinates
    if (isNaN(latitude) || latitude > 90 || latitude < -90) {
      throw new Error(`Invalid latitude for port ${code}: ${latitude}`);
    }
    if (isNaN(longitude) || longitude > 180 || longitude < -180) {
      throw new Error(`Invalid longitude for port ${code}: ${longitude}`);
    }

    // 3. Create WorldPortEntry object
    const port: WorldPortEntry = {
      id: code,
      code: code || null,
      name: name,
      coordinates: [latitude, longitude],
      countryCode: countryCode,
      harborSize: harborSize
    };

    // 4. Return WorldPortEntry object
    return port;
  }

  /**
   * Normalize port name for consistent searching and comparison
   * @param name - Port name to normalize
   * @returns Normalized port name
   * @example normalizeName("Port of Singapore") => "singapore"
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase() // Convert to lowercase
      .replace(/\bport\s+of\b/gi, '') // Remove "port of" (case-insensitive)
      .replace(/\bport\b/gi, '') // Remove "port" (case-insensitive)
      .replace(/\bharbor\b/gi, '') // Remove "harbor" (case-insensitive)
      .replace(/\s+/g, ' ') // Collapse multiple spaces to single space
      .trim(); // Trim whitespace
  }

  /**
   * Normalize port code for consistent searching and comparison
   * @param code - Port code to normalize
   * @returns Normalized port code
   * @example normalizeCode("SG SIN") => "SGSIN"
   */
  private normalizeCode(code: string): string {
    if (code == null || typeof code !== 'string') return '';
    return code
      .replace(/\s/g, '') // Remove all spaces
      .toUpperCase() // Convert to uppercase
      .trim(); // Trim whitespace
  }

  /**
   * Resolve the best matching port from search results
   * Uses harbor size ranking to select the most significant port
   * @param ports - Array of matching ports from API
   * @returns Best matching port or null if no suitable match
   */
  private resolveBestMatch(ports: WorldPortIndexPort[]): WorldPortIndexPort | null {
    // 1. If empty array → return null
    if (ports.length === 0) {
      return null;
    }

    // 2. If single port → return it
    if (ports.length === 1) {
      return ports[0];
    }

    // 3. If multiple ports → rank by harbor size
    // Define harbor size ranking: Large=4, Medium=3, Small=2, Very Small=1, Unknown=0
    const getHarborSizeRank = (harborSize?: string): number => {
      if (!harborSize) return 0;
      const normalized = harborSize.toLowerCase().trim();
      
      if (normalized === 'large') return 4;
      if (normalized === 'medium') return 3;
      if (normalized === 'small') return 2;
      if (normalized === 'very small') return 1;
      return 0; // Unknown
    };

    // Find port with highest harbor size rank
    let bestPort = ports[0];
    let bestRank = getHarborSizeRank(bestPort.harborSize);

    for (let i = 1; i < ports.length; i++) {
      const currentRank = getHarborSizeRank(ports[i].harborSize);
      if (currentRank > bestRank) {
        bestPort = ports[i];
        bestRank = currentRank;
      }
      // If tie, keep first one (no change to bestPort)
    }

    return bestPort;
  }

  /**
   * Select best match using fuzzy scoring
   * Combines string similarity and harbor size to find the best match
   * @param query - Original query string from user
   * @param ports - Array of candidate ports from API
   * @returns Best matching port entry or null
   */
  private selectBestFuzzyMatch(
    query: string,
    ports: WorldPortIndexPort[]
  ): WorldPortEntry | null {
    if (ports.length === 0) return null;
    if (ports.length === 1) return this.transformPort(ports[0]);
    
    const queryClean = removeCommonAffixes(query.toLowerCase());
    
    // Score each port
    const scored = ports.map(port => {
      const mainName = removeCommonAffixes(port.mainPortName?.toLowerCase() || '');
      const altName = removeCommonAffixes(port.alternatePortName?.toLowerCase() || '');
      
      // Calculate similarity scores
      const mainScore = stringSimilarity(queryClean, mainName);
      const altScore = stringSimilarity(queryClean, altName);
      const bestNameScore = Math.max(mainScore, altScore);
      
      // Harbor size bonus (0-20 points)
      const harborBonus = this.getHarborSizeBonus(port.harborSize);
      
      // Total score
      const totalScore = bestNameScore + harborBonus;
      
      return {
        port,
        score: totalScore,
        mainScore,
        altScore,
        harborBonus,
      };
    });
    
    // Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score);
    
    const winner = scored[0];
    console.log(`🎯 [FUZZY-MATCH] Best match for "${query}": ${winner.port.mainPortName} (score: ${winner.score})`);
    console.log(`   Main: ${winner.mainScore}, Alt: ${winner.altScore}, Harbor: ${winner.harborBonus}`);
    
    return this.transformPort(winner.port);
  }

  /**
   * Get harbor size bonus points for fuzzy matching
   * Larger ports get higher bonus to prefer major ports in ambiguous cases
   * @param harborSize - Harbor size from API (Large, Medium, Small, Very Small)
   * @returns Bonus points (0-20)
   */
  private getHarborSizeBonus(harborSize?: string): number {
    if (!harborSize) return 0;
    const normalized = harborSize.toLowerCase().trim();
    
    if (normalized === 'large') return 20;
    if (normalized === 'medium') return 15;
    if (normalized === 'small') return 10;
    if (normalized === 'very small') return 5;
    return 0;
  }
}
