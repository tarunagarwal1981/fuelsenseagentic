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

  // Resolve WPI lookups in parallel batches to stay under port-finder timeout
  for (let i = 0; i < needWpi.length; i += WPI_LOOKUP_CONCURRENCY) {
    const batch = needWpi.slice(i, i + WPI_LOOKUP_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async ({ identifier, fuelTypes }) => {
        const wpiPort = looksLikeLOCODE(identifier)
          ? await portRepo.findByCode(identifier)
          : await portRepo.findByName(identifier);
        return { identifier, fuelTypes, wpiPort };
      })
    );
    for (const { identifier, fuelTypes, wpiPort } of results) {
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
 * Enriches with coordinates from ports.json or World Port Index.
 */
async function loadPortsData(): Promise<Port[]> {
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

  return buildPortsFromIdentifiers(portCodeToFuelTypes, portRepo);
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
    // Load port data
    const ports = await loadPortsData();
    console.log(`   Available ports: ${ports.length}`);

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

