/**
 * SeaRoute API ports list and name-to-code resolution.
 * Used by PortResolutionService for API fallback (no static ports.json).
 * Fetches from maritime-route-api.onrender.com/ports and does fuzzy name matching.
 */

const SEA_ROUTE_PORTS_URL = 'https://maritime-route-api.onrender.com/ports';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

let cache: { ports: Map<string, { name: string; lat: number; lon: number }>; expiresAt: number } | null = null;

export async function fetchSeaRoutePortsMap(): Promise<Map<string, { name: string; lat: number; lon: number }>> {
  if (cache && Date.now() < cache.expiresAt) {
    return cache.ports;
  }
  const response = await fetch(SEA_ROUTE_PORTS_URL, {
    method: 'GET',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error(`SeaRoute ports API returned ${response.status}: ${response.statusText}`);
  }
  const data = (await response.json()) as unknown;
  const portsMap = new Map<string, { name: string; lat: number; lon: number }>();

  if (Array.isArray(data)) {
    for (const port of data) {
      const code = (port as { code?: string; port_code?: string; portCode?: string }).code
        || (port as { code?: string; port_code?: string; portCode?: string }).port_code
        || (port as { code?: string; port_code?: string; portCode?: string }).portCode;
      const p = port as { lat?: number; lon?: number; lng?: number; latitude?: number; longitude?: number; name?: string };
      const lat = p.lat ?? p.latitude;
      const lon = p.lon ?? p.lng ?? p.longitude;
      const name = p.name || code;
      if (code && lat !== undefined && lon !== undefined && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lon))) {
        portsMap.set(String(code).toUpperCase(), {
          name: String(name || code),
          lat: Number(lat),
          lon: Number(lon),
        });
      }
    }
  } else if (data && typeof data === 'object' && data !== null) {
    const d = data as { ports?: unknown; data?: unknown[] };
    const arr = Array.isArray(d.ports) ? d.ports : Array.isArray(d.data) ? d.data : null;
    if (arr) {
      for (const port of arr) {
        const code = (port as { code?: string; port_code?: string }).code ?? (port as { code?: string; port_code?: string }).port_code;
        const p = port as { lat?: number; lon?: number; lng?: number; name?: string };
        const lat = p.lat;
        const lon = p.lon ?? p.lng;
        const name = p.name || code;
        if (code && lat !== undefined && lon !== undefined && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lon))) {
          portsMap.set(String(code).toUpperCase(), {
            name: String(name || code),
            lat: Number(lat),
            lon: Number(lon),
          });
        }
      }
    } else if (d.ports && typeof d.ports === 'object' && !Array.isArray(d.ports)) {
      for (const [code, portData] of Object.entries(d.ports)) {
        const p = portData as { lat?: number; lon?: number; lng?: number; name?: string };
        const lat = p.lat;
        const lon = p.lon ?? p.lng;
        const name = p.name || code;
        if (lat !== undefined && lon !== undefined && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lon))) {
          portsMap.set(String(code).toUpperCase(), {
            name: String(name || code),
            lat: Number(lat),
            lon: Number(lon),
          });
        }
      }
    }
  }

  cache = { ports: portsMap, expiresAt: Date.now() + CACHE_TTL_MS };
  return portsMap;
}

/**
 * Resolve a port name (or code) to a port code using SeaRoute API only.
 * Returns UN/LOCODE or null if not found.
 */
export async function resolvePortNameToCode(query: string): Promise<string | null> {
  const normalizedQuery = query.toLowerCase().trim().replace(/\b(port|of|the|at|in)\b/gi, '').replace(/\s+/g, ' ').trim();
  const portsMap = await fetchSeaRoutePortsMap();

  // Exact code match
  const exactCode = portsMap.get(query.toUpperCase());
  if (exactCode) {
    return query.toUpperCase();
  }

  // Fuzzy name match with scoring
  const candidates: Array<{ code: string; name: string; score: number }> = [];
  for (const [code, port] of portsMap.entries()) {
    const nameLower = port.name.toLowerCase();
    let score = 0;
    if (nameLower === normalizedQuery) score = 100;
    else if (nameLower.startsWith(normalizedQuery)) score = 90;
    else if (normalizedQuery.length >= 3 && nameLower.includes(normalizedQuery)) score = 80;
    else if (normalizedQuery.length >= 3 && normalizedQuery.includes(nameLower)) score = 70;
    else if (normalizedQuery.length >= 3) {
      const portFirst = nameLower.split(/[\s,]+/)[0];
      const queryFirst = normalizedQuery.split(/[\s,]+/)[0];
      if (portFirst === queryFirst) score = 75;
      else if (portFirst.startsWith(queryFirst) || queryFirst.startsWith(portFirst)) score = 60;
    } else if (normalizedQuery.length >= 4 && nameLower.includes(normalizedQuery.substring(0, 4))) score = 50;
    if (score > 0) {
      candidates.push({ code, name: port.name, score });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].code;
}
