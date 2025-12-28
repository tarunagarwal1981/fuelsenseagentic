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
 * Tries static lookup first, then API with fuzzy matching
 */
export async function resolvePortCode(
  query: string
): Promise<{ port_code: string; coordinates: { lat: number; lon: number }; source: 'static' | 'api' } | null> {
  const normalizedQuery = query.toLowerCase().trim();

  // Try static lookup first
  const staticPort = STATIC_PORTS.find(
    p =>
      p.port_code.toLowerCase() === normalizedQuery ||
      p.name.toLowerCase() === normalizedQuery ||
      p.name.toLowerCase().includes(normalizedQuery) ||
      normalizedQuery.includes(p.name.toLowerCase())
  );

  if (staticPort && staticPort.coordinates) {
    return {
      port_code: staticPort.port_code,
      coordinates: staticPort.coordinates,
      source: 'static',
    };
  }

  // Try API with fuzzy matching
  try {
    const apiPorts = await fetchSeaRoutePorts();
    
    // Exact code match
    const exactMatch = apiPorts.get(query.toUpperCase());
    if (exactMatch) {
      PortLogger.logPortResolution(query.toUpperCase(), { lat: exactMatch.lat, lon: exactMatch.lon }, 'api');
      return {
        port_code: query.toUpperCase(),
        coordinates: { lat: exactMatch.lat, lon: exactMatch.lon },
        source: 'api',
      };
    }

    // Fuzzy name match
    for (const [code, port] of apiPorts.entries()) {
      const portNameLower = port.name.toLowerCase();
      if (
        portNameLower === normalizedQuery ||
        portNameLower.includes(normalizedQuery) ||
        normalizedQuery.includes(portNameLower)
      ) {
        PortLogger.logPortResolution(code, { lat: port.lat, lon: port.lon }, 'api');
        return {
          port_code: code,
          coordinates: { lat: port.lat, lon: port.lon },
          source: 'api',
        };
      }
    }
  } catch (error) {
    console.warn(`[PORT-RESOLVE] API resolution failed for "${query}":`, error);
  }

  return null;
}

