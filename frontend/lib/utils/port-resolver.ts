/**
 * Port Resolver Utility
 * 
 * Validates port codes against SeaRoute API and provides fallback port resolution.
 * Uses static ports.json as primary source, falls back to API when needed.
 */

import portsData from '@/lib/data/ports.json';
import { PortLogger } from './debug-logger';

interface Port {
  port_code: string;
  name: string;
  coordinates: {
    lat: number;
    lon: number;
  };
}

interface ApiPort {
  code: string;
  name: string;
  lat: number;
  lon: number;
}

interface PortCache {
  ports: Map<string, { name: string; lat: number; lon: number }>;
  fetchedAt: number;
  expiresAt: number;
}

const STATIC_PORTS: Port[] = portsData as Port[];
let apiPortCache: PortCache | null = null;
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch ports from SeaRoute API
 * Caches response for 24 hours
 */
async function fetchSeaRoutePorts(): Promise<Map<string, { name: string; lat: number; lon: number }>> {
  // Check cache first
  if (apiPortCache && Date.now() < apiPortCache.expiresAt) {
    console.log('[PORT-RESOLVE] Using cached API ports');
    return apiPortCache.ports;
  }

  try {
    console.log('[PORT-RESOLVE] Fetching ports from SeaRoute API...');
    const response = await fetch('https://maritime-route-api.onrender.com/ports', {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();
    const portsMap = new Map<string, { name: string; lat: number; lon: number }>();

    // Handle different response formats
    const portsArray = Array.isArray(data) ? data : (data.ports || []);

    for (const port of portsArray) {
      if (port.code && port.lat !== undefined && port.lon !== undefined) {
        portsMap.set(port.code.toUpperCase(), {
          name: port.name || port.code,
          lat: port.lat,
          lon: port.lon,
        });
      }
    }

    // Update cache
    const now = Date.now();
    apiPortCache = {
      ports: portsMap,
      fetchedAt: now,
      expiresAt: now + CACHE_DURATION_MS,
    };

    console.log(`[PORT-RESOLVE] Fetched ${portsMap.size} ports from API`);
    return portsMap;
  } catch (error) {
    console.warn('[PORT-RESOLVE] API fetch failed, using static data:', error);
    // Return empty map to indicate fallback
    return new Map();
  }
}

/**
 * Validate port code against static data and API
 * Returns validation result with coordinates if found
 */
export async function validatePortCode(
  portCode: string
): Promise<{ valid: boolean; coordinates?: { lat: number; lon: number }; name?: string; source?: 'static' | 'api' }> {
  const normalizedCode = portCode.toUpperCase().trim();

  // Check static data first (fast path)
  const staticPort = STATIC_PORTS.find(p => p.port_code.toUpperCase() === normalizedCode);
  if (staticPort && staticPort.coordinates) {
    return {
      valid: true,
      coordinates: staticPort.coordinates,
      name: staticPort.name,
      source: 'static',
    };
  }

  // Try API as fallback
  try {
    const apiPorts = await fetchSeaRoutePorts();
    const apiPort = apiPorts.get(normalizedCode);
    if (apiPort) {
      PortLogger.logPortResolution(normalizedCode, { lat: apiPort.lat, lon: apiPort.lon }, 'api');
      return {
        valid: true,
        coordinates: { lat: apiPort.lat, lon: apiPort.lon },
        name: apiPort.name,
        source: 'api',
      };
    }
  } catch (error) {
    console.warn(`[PORT-RESOLVE] API lookup failed for ${normalizedCode}:`, error);
  }

  return { valid: false };
}

/**
 * Resolve port code from query string (port name or code)
 * Tries static lookup first, then API with enhanced fuzzy matching and scoring
 */
export async function resolvePortCode(
  query: string
): Promise<{ port_code: string; coordinates: { lat: number; lon: number }; source: 'static' | 'api' } | null> {
  const normalizedQuery = query.toLowerCase().trim();
  
  // Remove common noise words before searching
  const cleanedQuery = normalizedQuery
    .replace(/\b(port|of|the|at|in)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  console.log(`🔍 [PORT-RESOLVE] Searching for: "${query}" (cleaned: "${cleanedQuery}")`);

  // Try static lookup first
  const staticPort = STATIC_PORTS.find(p => {
    const portName = p.name.toLowerCase();
    const portCode = p.port_code.toLowerCase();
    
    return (
      // Exact matches
      portCode === normalizedQuery ||
      portName === normalizedQuery ||
      portName === cleanedQuery ||
      // Contains matches (with minimum length check)
      (cleanedQuery.length >= 3 && portName.includes(cleanedQuery)) ||
      (cleanedQuery.length >= 3 && cleanedQuery.includes(portName)) ||
      // Port code partial match (e.g., "JPCH" matches "JPCHB")
      (normalizedQuery.length >= 4 && portCode.startsWith(normalizedQuery))
    );
  });

  if (staticPort && staticPort.coordinates) {
    console.log(`✅ [PORT-RESOLVE] Static match: ${staticPort.port_code} (${staticPort.name})`);
    return {
      port_code: staticPort.port_code,
      coordinates: staticPort.coordinates,
      source: 'static',
    };
  }

  // Try API with enhanced fuzzy matching
  try {
    const apiPorts = await fetchSeaRoutePorts();
    
    // Exact code match
    const exactMatch = apiPorts.get(query.toUpperCase());
    if (exactMatch) {
      console.log(`✅ [PORT-RESOLVE] API exact match: ${query.toUpperCase()}`);
      PortLogger.logPortResolution(query.toUpperCase(), { lat: exactMatch.lat, lon: exactMatch.lon }, 'api');
      return {
        port_code: query.toUpperCase(),
        coordinates: { lat: exactMatch.lat, lon: exactMatch.lon },
        source: 'api',
      };
    }

    // Fuzzy name match with scoring
    const candidates: Array<{ code: string; port: { name: string; lat: number; lon: number }; score: number }> = [];
    
    for (const [code, port] of apiPorts.entries()) {
      const portNameLower = port.name.toLowerCase();
      let score = 0;
      
      // Exact name match - highest score
      if (portNameLower === normalizedQuery || portNameLower === cleanedQuery) {
        score = 100;
      }
      // Name starts with query (e.g., "Chiba" matches "Chiba Port")
      else if (portNameLower.startsWith(cleanedQuery)) {
        score = 90;
      }
      // Name contains query at word boundary (e.g., "Singapore" in "Singapore Port")
      else if (cleanedQuery.length >= 3 && portNameLower.includes(cleanedQuery)) {
        score = 80;
      }
      // Query contains port name (e.g., "Chiba Port" contains "Chiba")
      else if (cleanedQuery.length >= 3 && cleanedQuery.includes(portNameLower)) {
        score = 70;
      }
      // First word matches (e.g., "Singapore" matches "Singapore, Jurong")
      else if (cleanedQuery.length >= 3) {
        const portFirstWord = portNameLower.split(/[\s,]+/)[0];
        const queryFirstWord = cleanedQuery.split(/[\s,]+/)[0];
        if (portFirstWord === queryFirstWord) {
          score = 75;
        } else if (portFirstWord.startsWith(queryFirstWord) || queryFirstWord.startsWith(portFirstWord)) {
          score = 60;
        }
      }
      // Partial match (at least 4 chars) - lower score
      else if (cleanedQuery.length >= 4 && portNameLower.includes(cleanedQuery.substring(0, 4))) {
        score = 50;
      }
      
      if (score > 0) {
        candidates.push({ code, port, score });
      }
    }
    
    // Sort by score and return best match
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0];
      
      console.log(`✅ [PORT-RESOLVE] API fuzzy match: ${best.code} (${best.port.name}) - score: ${best.score}`);
      if (candidates.length > 1) {
        console.log(`   Other candidates: ${candidates.slice(1, 3).map(c => `${c.code}(${c.score})`).join(', ')}`);
      }
      
      PortLogger.logPortResolution(best.code, { lat: best.port.lat, lon: best.port.lon }, 'api');
      return {
        port_code: best.code,
        coordinates: { lat: best.port.lat, lon: best.port.lon },
        source: 'api',
      };
    }
  } catch (error) {
    console.warn(`[PORT-RESOLVE] API resolution failed for "${query}":`, error);
  }

  console.warn(`❌ [PORT-RESOLVE] No match found for: "${query}"`);
  return null;
}

