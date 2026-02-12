/**
 * Port Finder Tool
 *
 * Finds bunker ports near a shipping route by calculating distances
 * from route waypoints to available ports using the haversine formula.
 *
 * Bunker port list comes from BunkerPricing API; coordinates from ports.json
 * or World Port Index. Deviation = min haversine distance to any waypoint.
 *
 * This tool is useful for:
 * - Finding refueling options along a route
 * - Identifying alternative ports for bunkering
 * - Planning multi-port voyages
 */

import { z } from 'zod';
import { Coordinates, Port, FuelType } from '@/lib/types';
import { ServiceContainer } from '@/lib/repositories/service-container';
import { BunkerPricingClient } from '@/lib/clients/bunker-pricing-client';

/**
 * Input parameters for port finder
 */
export interface PortFinderInput {
  /** Array of waypoint coordinates along the route */
  route_waypoints: Coordinates[];
  /** Maximum deviation distance in nautical miles (default: 150) */
  max_deviation_nm?: number;
}

/**
 * Port found near the route
 */
export interface FoundPort {
  /** Port information */
  port: Port;
  /** Distance from nearest waypoint in nautical miles */
  distance_from_route_nm: number;
  /** Index of the nearest waypoint */
  nearest_waypoint_index: number;
  /** Coordinates of the nearest waypoint */
  nearest_waypoint: Coordinates;
}

/**
 * Output from port finder
 */
export interface PortFinderOutput {
  /** Array of ports found near the route, sorted by distance */
  ports: FoundPort[];
  /** Total number of waypoints analyzed */
  waypoints_analyzed: number;
  /** Maximum deviation distance used */
  max_deviation_nm: number;
  /** Total ports found */
  total_ports_found: number;
}

/**
 * Zod schema for input validation
 */
export const portFinderInputSchema = z.object({
  route_waypoints: z
    .array(
      z.object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
      })
    )
    .min(1, 'Route must have at least one waypoint')
    .describe('Array of waypoint coordinates along the route'),
  
  max_deviation_nm: z
    .number()
    .positive('Maximum deviation must be positive')
    .max(500, 'Maximum deviation cannot exceed 500 nautical miles')
    .optional()
    .default(150)
    .describe('Maximum distance in nautical miles from route to consider a port (default: 150 nm)'),
});

/**
 * Error class for port finder failures
 */
export class PortFinderError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'PortFinderError';
  }
}

/**
 * Geographic bounding box (lat/lon limits).
 * Used to filter bunker ports to the route region and reduce distance calculations.
 */
export interface GeographicBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/**
 * Compute a bounding box from route waypoints with a buffer for max deviation.
 * Used to geo-filter ports so only ports near the route are considered.
 * @param waypoints - Route waypoints
 * @param maxDeviationNm - Max deviation in nautical miles (buffer added to box)
 * @returns Bounds clamped to valid lat/lon
 */
export function calculateRouteBounds(
  waypoints: Coordinates[],
  maxDeviationNm: number
): GeographicBounds {
  if (waypoints.length === 0) {
    return { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 };
  }
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const wp of waypoints) {
    minLat = Math.min(minLat, wp.lat);
    maxLat = Math.max(maxLat, wp.lat);
    minLon = Math.min(minLon, wp.lon);
    maxLon = Math.max(maxLon, wp.lon);
  }
  // ~1 deg lat ≈ 60 nm; add buffer for max deviation
  const bufferDeg = (maxDeviationNm / 60) * 1.2;
  return {
    minLat: Math.max(-90, minLat - bufferDeg),
    maxLat: Math.min(90, maxLat + bufferDeg),
    minLon: Math.max(-180, minLon - bufferDeg),
    maxLon: Math.min(180, maxLon + bufferDeg),
  };
}

/**
 * Calculate the distance between two points on Earth using the Haversine formula
 * 
 * The Haversine formula calculates the great-circle distance between two points
 * on a sphere given their latitudes and longitudes.
 * 
 * @param point1 - First coordinate point
 * @param point2 - Second coordinate point
 * @returns Distance in nautical miles
 */
export function haversineDistance(
  point1: Coordinates,
  point2: Coordinates
): number {
  const R = 3440.065; // Earth's radius in nautical miles

  // Convert degrees to radians
  const lat1Rad = (point1.lat * Math.PI) / 180;
  const lat2Rad = (point2.lat * Math.PI) / 180;
  const deltaLatRad = ((point2.lat - point1.lat) * Math.PI) / 180;
  const deltaLonRad = ((point2.lon - point1.lon) * Math.PI) / 180;

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

/** Port entry from ports.json (for coordinates/name/country) */
interface PortsJsonEntry {
  port_code: string;
  name: string;
  country: string;
  coordinates: { lat: number; lon: number };
  fuel_capabilities?: string[];
}

/** Looks like a LOCODE (e.g. 5 chars, uppercase, no spaces). */
function looksLikeLOCODE(key: string): boolean {
  const k = String(key).trim();
  return k.length >= 4 && k.length <= 6 && /^[A-Z0-9]+$/.test(k.toUpperCase());
}

/** Max concurrent WPI API calls to avoid timeout (83 sequential calls exceeded 15s). */
const WPI_LOOKUP_CONCURRENCY = 15;

/** Safety limit: max ports to resolve via WPI after geo-filter (circuit breaker). */
const MAX_PORTS_TO_RESOLVE = 40;

/** Coordinate map for geo-filtering (port_code or name -> { lat, lon }). Built from ports.json. */
let portsJsonCoordMap: Map<string, Coordinates> | null = null;

/**
 * Build coordinate map from ports.json for geo-filtering before WPI.
 * Keys: port_code and name (so BunkerPricing identifiers match).
 */
async function getPortsJsonCoordMap(): Promise<Map<string, Coordinates>> {
  if (portsJsonCoordMap) return portsJsonCoordMap;
  const map = new Map<string, Coordinates>();
  try {
    const portsModule = await import('@/lib/data/ports.json');
    const arr = portsModule.default ?? portsModule;
    if (Array.isArray(arr)) {
      for (const entry of arr as PortsJsonEntry[]) {
        if (entry.coordinates) {
          const coords = { lat: entry.coordinates.lat, lon: entry.coordinates.lon };
          map.set(entry.port_code, coords);
          if (entry.name?.trim()) map.set(entry.name.trim(), coords);
        }
      }
    }
    portsJsonCoordMap = map;
  } catch {
    console.warn('[port-finder] Could not load ports.json for coordinate map');
  }
  return map;
}

/** True if coords are inside the given bounds. */
function isInBounds(coords: Coordinates, bounds: GeographicBounds): boolean {
  return (
    coords.lat >= bounds.minLat &&
    coords.lat <= bounds.maxLat &&
    coords.lon >= bounds.minLon &&
    coords.lon <= bounds.maxLon
  );
}

/**
 * Build Port[] from identifier (port code or name) -> fuel types map.
 * Resolves coordinates via ports.json or WPI (findByCode for LOCODE, findByName for port names).
 * WPI lookups run in parallel batches so port finder completes within timeout.
 */
async function buildPortsFromIdentifiers(
  identifierToFuelTypes: Map<string, Set<string>>,
  portRepo: {
    findByCode: (code: string) => Promise<{ name: string; country: string; coordinates: [number, number] } | null>;
    findByName: (name: string) => Promise<{ name: string; country: string; coordinates: [number, number] } | null>;
  }
): Promise<Port[]> {
  let portsByCode: Record<string, PortsJsonEntry> = {};
  try {
    const portsModule = await import('@/lib/data/ports.json');
    const arr = portsModule.default ?? portsModule;
    if (Array.isArray(arr)) {
      for (const entry of arr as PortsJsonEntry[]) {
        portsByCode[entry.port_code] = entry;
      }
    }
  } catch {
    console.warn('[port-finder] Could not load ports.json for coordinates');
  }

  const ports: Port[] = [];
  const needWpi: { identifier: string; fuelTypes: FuelType[] }[] = [];

  for (const [identifier, fuelSet] of identifierToFuelTypes) {
    if (identifier == null || String(identifier).trim() === '') continue;
    const fuelTypes = Array.from(fuelSet) as FuelType[];
    const fromJson = portsByCode[identifier];
    if (fromJson?.coordinates) {
      ports.push({
        port_code: identifier,
        name: fromJson.name,
        country: fromJson.country,
        coordinates: fromJson.coordinates,
        fuel_capabilities: fuelTypes,
      });
      continue;
    }
    needWpi.push({ identifier, fuelTypes });
  }

  // Resolve WPI lookups in parallel batches (Promise.allSettled so one failure doesn't fail the batch)
  for (let i = 0; i < needWpi.length; i += WPI_LOOKUP_CONCURRENCY) {
    const batch = needWpi.slice(i, i + WPI_LOOKUP_CONCURRENCY);
    const batchStart = Date.now();
    const batchPromises = batch.map(async ({ identifier, fuelTypes }) => {
      try {
        const wpiPort = looksLikeLOCODE(identifier)
          ? await portRepo.findByCode(identifier)
          : await portRepo.findByName(identifier);
        return { identifier, fuelTypes, wpiPort };
      } catch (err) {
        console.warn(`⚠️ [PORT-FINDER] Failed to resolve ${identifier}:`, err instanceof Error ? err.message : err);
        return { identifier, fuelTypes, wpiPort: null };
      }
    });
    const settled = await Promise.allSettled(batchPromises);
    const duration = Date.now() - batchStart;
    const batchNum = Math.floor(i / WPI_LOOKUP_CONCURRENCY) + 1;
    console.log(`   🔄 [PORT-FINDER] Batch ${batchNum}: ${batch.length} ports in ${duration}ms`);
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      const { identifier, fuelTypes, wpiPort } = result.value;
      if (wpiPort?.coordinates) {
        const code = 'code' in wpiPort && (wpiPort as { code?: string }).code
          ? (wpiPort as { code: string }).code
          : identifier;
        ports.push({
          port_code: code,
          name: wpiPort.name,
          country: wpiPort.country,
          coordinates: { lat: wpiPort.coordinates[0], lon: wpiPort.coordinates[1] },
          fuel_capabilities: fuelTypes,
        });
      }
    }
  }

  return ports;
}

/**
 * Loads bunker-capable port data from BunkerPricing API only.
 * When bounds are provided: filters identifiers by route bounds BEFORE WPI (using ports.json
 * coords), then resolves only candidates via WPI. When bounds are omitted, resolves all.
 */
async function loadPortsData(bounds?: GeographicBounds): Promise<Port[]> {
  const container = ServiceContainer.getInstance();
  const portRepo = container.getPortRepository();

  const bunkerClient = new BunkerPricingClient();
  const allPrices = await bunkerClient.getAll();
  if (allPrices.length === 0) {
    console.warn('[port-finder] BunkerPricing API returned no rows');
    return [];
  }

  const portCodeToFuelTypes = new Map<string, Set<string>>();
  for (const p of allPrices) {
    // Use port name when port code is empty (fuelsense.bunker has port_code NULL)
    const key = (p.portName && String(p.portName).trim()) || (p.portCode && String(p.portCode).trim());
    if (!key) continue;
    if (!portCodeToFuelTypes.has(key)) {
      portCodeToFuelTypes.set(key, new Set());
    }
    portCodeToFuelTypes.get(key)!.add(p.fuelType);
  }

  const allIdentifiers = Array.from(portCodeToFuelTypes.keys());
  let candidateIdentifiers: string[];

  if (bounds) {
    const coordMap = await getPortsJsonCoordMap();
    // Include: (in coord map and inside bounds) OR (not in coord map — must resolve via WPI)
    candidateIdentifiers = allIdentifiers.filter((id) => {
      const coords = coordMap.get(id);
      if (!coords) return true; // unknown coords, need WPI
      return isInBounds(coords, bounds);
    });
    console.log(`   🎯 [PORT-FINDER] Geo-filter: ${allIdentifiers.length} → ${candidateIdentifiers.length} ports in route bounds`);
  } else {
    candidateIdentifiers = allIdentifiers;
  }

  // Circuit breaker: cap candidates by distance to route midpoint if over limit
  if (bounds && candidateIdentifiers.length > MAX_PORTS_TO_RESOLVE) {
    const coordMap = await getPortsJsonCoordMap();
    const midLat = (bounds.minLat + bounds.maxLat) / 2;
    const midLon = (bounds.minLon + bounds.maxLon) / 2;
    const midpoint: Coordinates = { lat: midLat, lon: midLon };
    const withCoords: { id: string; distance: number }[] = [];
    const noCoords: string[] = [];
    for (const id of candidateIdentifiers) {
      const c = coordMap.get(id);
      if (c) withCoords.push({ id, distance: haversineDistance(c, midpoint) });
      else noCoords.push(id);
    }
    withCoords.sort((a, b) => a.distance - b.distance);
    const take = Math.max(0, MAX_PORTS_TO_RESOLVE - noCoords.length);
    const beforeCap = candidateIdentifiers.length;
    candidateIdentifiers = [
      ...withCoords.slice(0, take).map((x) => x.id),
      ...noCoords,
    ].slice(0, MAX_PORTS_TO_RESOLVE);
    console.warn(`   ⚠️ [PORT-FINDER] Limiting candidates: ${beforeCap} → ${candidateIdentifiers.length}`);
  }

  const filteredMap = new Map<string, Set<string>>();
  for (const id of candidateIdentifiers) {
    const fuelSet = portCodeToFuelTypes.get(id);
    if (fuelSet) filteredMap.set(id, fuelSet);
  }

  const ports = await buildPortsFromIdentifiers(filteredMap, portRepo);
  return ports;
}

/**
 * Finds the nearest waypoint to a given port
 * 
 * @param port - Port to find nearest waypoint for
 * @param waypoints - Array of route waypoints
 * @returns Object containing distance, waypoint index, and waypoint coordinates
 */
function findNearestWaypoint(
  port: Port,
  waypoints: Coordinates[]
): {
  distance: number;
  waypointIndex: number;
  waypoint: Coordinates;
} {
  let minDistance = Infinity;
  let nearestIndex = 0;
  let nearestWaypoint = waypoints[0];

  for (let i = 0; i < waypoints.length; i++) {
    const distance = haversineDistance(port.coordinates, waypoints[i]);
    if (distance < minDistance) {
      minDistance = distance;
      nearestIndex = i;
      nearestWaypoint = waypoints[i];
    }
  }

  return {
    distance: minDistance,
    waypointIndex: nearestIndex,
    waypoint: nearestWaypoint,
  };
}

/**
 * Main function to find ports near a route
 * 
 * This function:
 * 1. Validates input parameters using Zod
 * 2. Loads port data from PortRepository (with 3-tier caching)
 * 3. For each waypoint, finds ports within max_deviation_nm
 * 4. Removes duplicate ports (same port found near multiple waypoints)
 * 5. Sorts results by distance from route
 * 6. Returns filtered and sorted port list
 * 
 * @param input - Port finder parameters
 * @returns Array of ports found near the route, sorted by distance
 * @throws PortFinderError - If validation fails or data loading fails
 */
export async function findPortsNearRoute(
  input: PortFinderInput
): Promise<PortFinderOutput> {
  // Validate input using Zod schema
  const validatedInput = portFinderInputSchema.parse(input);

  const { route_waypoints, max_deviation_nm = 150 } = validatedInput;

  console.log(`\n🔍 Finding ports near route...`);
  console.log(`   Waypoints: ${route_waypoints.length}`);
  console.log(`   Max deviation: ${max_deviation_nm} nm`);

  try {
    // Geo-filter: only load ports within route bounding box for fewer distance calculations
    const bounds = calculateRouteBounds(route_waypoints, max_deviation_nm);
    console.log(`   📍 Route bounds: lat ${bounds.minLat.toFixed(1)}°–${bounds.maxLat.toFixed(1)}°, lon ${bounds.minLon.toFixed(1)}°–${bounds.maxLon.toFixed(1)}°`);
    const ports = await loadPortsData(bounds);
    console.log(`   Available ports (in bounds): ${ports.length}`);
    if (ports.length === 0) {
      console.warn('⚠️ [PORT-FINDER] No ports found within route bounds');
      console.warn(`   Bounds: lat ${bounds.minLat.toFixed(1)}°–${bounds.maxLat.toFixed(1)}°, lon ${bounds.minLon.toFixed(1)}°–${bounds.maxLon.toFixed(1)}°`);
    }

    // Track found ports with their minimum distance
    const portMap = new Map<string, FoundPort>();

    // For each waypoint, find nearby ports
    for (let waypointIndex = 0; waypointIndex < route_waypoints.length; waypointIndex++) {
      const waypoint = route_waypoints[waypointIndex];

      for (const port of ports) {
        const distance = haversineDistance(port.coordinates, waypoint);

        // Check if port is within max deviation
        if (distance <= max_deviation_nm) {
          const portKey = port.port_code;

          // If port not found yet, or found closer to this waypoint, update it
          if (!portMap.has(portKey)) {
            portMap.set(portKey, {
              port,
              distance_from_route_nm: distance,
              nearest_waypoint_index: waypointIndex,
              nearest_waypoint: waypoint,
            });
          } else {
            const existing = portMap.get(portKey)!;
            // Update if this waypoint is closer
            if (distance < existing.distance_from_route_nm) {
              portMap.set(portKey, {
                port,
                distance_from_route_nm: distance,
                nearest_waypoint_index: waypointIndex,
                nearest_waypoint: waypoint,
              });
            }
          }
        }
      }
    }

    // Convert map to array and sort by distance
    const foundPorts = Array.from(portMap.values()).sort(
      (a, b) => a.distance_from_route_nm - b.distance_from_route_nm
    );

    console.log(`   ✅ Found ${foundPorts.length} ports near route`);

    return {
      ports: foundPorts,
      waypoints_analyzed: route_waypoints.length,
      max_deviation_nm,
      total_ports_found: foundPorts.length,
    };
  } catch (error) {
    // Re-throw PortFinderError as-is
    if (error instanceof PortFinderError) {
      throw error;
    }

    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      throw new PortFinderError(
        `Input validation failed: ${error.issues.map((e) => e.message).join(', ')}`,
        'VALIDATION_ERROR'
      );
    }

    // Handle unexpected errors
    throw new PortFinderError(
      `Unexpected error during port finding: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'UNEXPECTED_ERROR'
    );
  }
}

/**
 * Tool schema for Claude (Anthropic SDK)
 * This schema is used to register the tool with Claude so it can be called by the AI agent
 */
export const portFinderToolSchema = {
  name: 'find_ports_near_route',
  description: `Find bunker ports near a shipping route. 
    Analyzes route waypoints and returns ports within a specified maximum deviation distance.
    Only returns ports that have fuel capabilities (VLSFO, LSGO, MGO).
    Results are sorted by distance from the route, with closest ports first.
    Useful for finding refueling options along a planned voyage.`,
  input_schema: {
    type: 'object',
    properties: {
      route_waypoints: {
        type: 'array',
        description: 'Array of waypoint coordinates along the route. Each waypoint should have lat and lon properties.',
        items: {
          type: 'object',
          properties: {
            lat: {
              type: 'number',
              description: 'Latitude in decimal degrees (-90 to 90)',
            },
            lon: {
              type: 'number',
              description: 'Longitude in decimal degrees (-180 to 180)',
            },
          },
          required: ['lat', 'lon'],
        },
      },
      max_deviation_nm: {
        type: 'number',
        description: 'Maximum distance in nautical miles from route waypoints to consider a port (default: 150 nm)',
      },
    },
    required: ['route_waypoints'],
  },
} as const;

/**
 * Tool execution wrapper for Claude
 * This function is called by the agent when the tool is invoked
 */
export async function executePortFinderTool(
  args: unknown
): Promise<PortFinderOutput> {
  return findPortsNearRoute(args as PortFinderInput);
}

