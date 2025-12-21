/**
 * Port Finder Tool
 * 
 * Finds bunker ports near a shipping route by calculating distances
 * from route waypoints to available ports using the haversine formula.
 * 
 * This tool is useful for:
 * - Finding refueling options along a route
 * - Identifying alternative ports for bunkering
 * - Planning multi-port voyages
 */

import { z } from 'zod';
import { Coordinates, Port } from '@/lib/types';

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

/**
 * Port data cache - loaded once at module initialization
 */
let portsCache: Port[] | null = null;

/**
 * Loads port data from the ports.json file
 * Caches the data for subsequent lookups
 * Works in both Node.js and Edge runtime
 */
async function loadPortsData(): Promise<Port[]> {
  if (portsCache) {
    return portsCache;
  }

  try {
    // Use dynamic import for JSON file (works with resolveJsonModule in tsconfig)
    const portsModule = await import('@/lib/data/ports.json');
    // JSON imports return the data directly, not as default export
    const ports = Array.isArray(portsModule)
      ? portsModule
      : (portsModule as any).default || portsModule;

    // Filter ports that have fuel capabilities
    portsCache = ports.filter(
      (p: any) =>
        p.fuel_capabilities &&
        Array.isArray(p.fuel_capabilities) &&
        p.fuel_capabilities.length > 0
    ) as Port[];

    return portsCache;
  } catch (error) {
    throw new PortFinderError(
      `Failed to load ports data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'PORT_DATA_LOAD_ERROR'
    );
  }
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
 * 2. Loads port data from the database
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

