/**
 * Route Calculator Tool
 * 
 * Integrates with Maritime Route API to calculate optimal maritime routes between ports.
 * The Maritime Route API provides real-world maritime routing that accounts for:
 * - Navigable waterways
 * - Canal passages (Suez, Panama, etc.)
 * - Restricted areas
 * - Optimal waypoints for fuel efficiency
 * 
 * API Endpoint: https://maritime-route-api.onrender.com/route
 */

import { z } from 'zod';
import { Coordinates, Route } from '@/lib/types';
import { PortLogger } from '@/lib/utils/debug-logger';

/**
 * Input parameters for route calculation
 */
export interface RouteCalculatorInput {
  /** Origin port code (UNLOCODE format, e.g., 'SGSIN') */
  origin_port_code: string;
  /** Destination port code (UNLOCODE format, e.g., 'NLRTM') */
  destination_port_code: string;
  /** Vessel speed in knots (optional, defaults to 14 knots) */
  vessel_speed_knots?: number;
}

/**
 * Output from route calculation
 */
export interface RouteCalculatorOutput {
  /** Distance in nautical miles */
  distance_nm: number;
  /** Estimated travel time in hours */
  estimated_hours: number;
  /** Array of waypoint coordinates along the route */
  waypoints: Coordinates[];
  /** Description of the route type (e.g., "via Suez Canal", "direct route") */
  route_type: string;
  /** Origin port code */
  origin_port_code: string;
  /** Destination port code */
  destination_port_code: string;
}

/**
 * Maritime Route API response structure
 */
interface MaritimeRouteApiResponse {
  /** Distance object with unit and value */
  distance: {
    unit: string;
    value: number;
  };
  /** Duration object with unit and value */
  duration: {
    unit: string;
    value: number;
  };
  /** Route information */
  route: {
    /** Route coordinates as array of [lon, lat] arrays */
    coordinates: [number, number][];
    /** Route type (e.g., "LineString") */
    type: string;
    /** Number of waypoints */
    waypoints: number;
  };
  /** Status of the request */
  status: string;
  /** Origin information */
  from: {
    coordinates: [number, number];
    name: string;
  };
  /** Destination information */
  to: {
    coordinates: [number, number];
    name: string;
  };
}

/**
 * Zod schema for input validation
 * Validates that required fields are present and have correct types
 */
export const routeCalculatorInputSchema = z.object({
  origin_port_code: z
    .string()
    .min(1, 'Origin port code is required')
    .max(10, 'Port code must be 10 characters or less')
    .describe('Origin port code in UNLOCODE format (e.g., SGSIN for Singapore)'),
  
  destination_port_code: z
    .string()
    .min(1, 'Destination port code is required')
    .max(10, 'Port code must be 10 characters or less')
    .describe('Destination port code in UNLOCODE format (e.g., NLRTM for Rotterdam)'),
  
  vessel_speed_knots: z
    .number()
    .positive('Vessel speed must be positive')
    .max(30, 'Vessel speed must be realistic (max 30 knots)')
    .optional()
    .default(14)
    .describe('Vessel speed in knots (default: 14 knots)'),
});

/**
 * Error class for route calculation failures
 */
export class RouteCalculationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'RouteCalculationError';
  }
}

/**
 * Port data cache - loaded once at module initialization
 * In production, this would query a database or API
 */
let portsCache: Array<{ port_code: string; coordinates: Coordinates }> | null = null;

/**
 * Cached routes data - loaded once at module initialization
 */
let cachedRoutesData: any = null;

/**
 * Loads cached routes from the cached-routes.json file
 * Falls back to cached routes when API fails
 */
async function loadCachedRoutes(): Promise<any> {
  if (cachedRoutesData) {
    return cachedRoutesData;
  }
  
  try {
    // Use dynamic import for JSON file (works with resolveJsonModule in tsconfig)
    const routesModule = await import('@/lib/data/cached-routes.json');
    // JSON imports return the data directly, not as default export
    const routes = routesModule.default || routesModule;
    cachedRoutesData = routes;
    return cachedRoutesData;
  } catch (error) {
    console.warn('⚠️ [ROUTE-CALCULATOR] Failed to load cached routes:', error);
    return null;
  }
}

/**
 * Finds a cached route matching origin and destination port codes
 * Returns null if no matching route is found
 */
async function findCachedRoute(
  origin_port_code: string,
  destination_port_code: string
): Promise<RouteCalculatorOutput | null> {
  try {
    const cachedRoutes = await loadCachedRoutes();
    if (!cachedRoutes || !cachedRoutes.routes || !Array.isArray(cachedRoutes.routes)) {
      return null;
    }
    
    // Search for matching route (check both directions)
    const cachedRoute = cachedRoutes.routes.find(
      (r: any) =>
        (r.origin_port_code === origin_port_code && r.destination_port_code === destination_port_code) ||
        (r.origin_port_code === destination_port_code && r.destination_port_code === origin_port_code)
    );
    
    if (!cachedRoute) {
      return null;
    }
    
    console.log(`✅ [ROUTE-CALCULATOR] Found cached route: ${cachedRoute.origin_name} → ${cachedRoute.destination_name}`);
    
    // Convert cached route to RouteCalculatorOutput format
    return {
      distance_nm: cachedRoute.distance_nm,
      estimated_hours: cachedRoute.estimated_hours,
      waypoints: cachedRoute.waypoints || [],
      route_type: cachedRoute.route_type || 'direct route',
      origin_port_code: cachedRoute.origin_port_code,
      destination_port_code: cachedRoute.destination_port_code,
    };
  } catch (error) {
    console.warn('⚠️ [ROUTE-CALCULATOR] Error searching cached routes:', error);
    return null;
  }
}

/**
 * Loads port data from the ports.json file
 * Caches the data for subsequent lookups
 * Works in both Node.js and Edge runtime
 */
async function loadPortsData(): Promise<Array<{ port_code: string; coordinates: Coordinates }>> {
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
    const cache = ports.map((p: any) => ({
      port_code: p.port_code,
      coordinates: p.coordinates,
    }));
    portsCache = cache;
    return cache;
  } catch (error) {
    throw new RouteCalculationError(
      `Failed to load ports data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'PORT_DATA_LOAD_ERROR'
    );
  }
}

/**
 * Fetches port coordinates from the ports database
 * Uses port-resolver to validate against static data and API
 */
async function getPortCoordinates(portCode: string): Promise<Coordinates> {
  try {
    // Try static data first (fast path)
    const ports = await loadPortsData();
    const port = ports.find((p) => p.port_code === portCode);
    
    if (port) {
      return port.coordinates;
    }
    
    // Try port-resolver as fallback (API validation)
    const { validatePortCode } = await import('@/lib/utils/port-resolver');
    const validation = await validatePortCode(portCode);
    
    if (validation.valid && validation.coordinates) {
      console.log(`[ROUTE-CALC] Port ${portCode} validated via ${validation.source}`);
      return validation.coordinates;
    }
    
    throw new RouteCalculationError(
      `Port code ${portCode} not found in database or API`,
      'PORT_NOT_FOUND'
    );
  } catch (error) {
    if (error instanceof RouteCalculationError) {
      throw error;
    }
    throw new RouteCalculationError(
      `Failed to fetch port coordinates: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'PORT_FETCH_ERROR'
    );
  }
}

/**
 * Calls the Maritime Route API to calculate the optimal maritime route
 * 
 * Maritime Route API Endpoint: https://maritime-route-api.onrender.com/route
 * 
 * The API accepts GET request with query parameters:
 * - origin_lon: origin longitude
 * - origin_lat: origin latitude
 * - dest_lon: destination longitude
 * - dest_lat: destination latitude
 * - speed: vessel speed in knots (optional)
 * 
 * Returns route data with distance, waypoints, and metadata
 */
async function callMaritimeRouteApi(
  origin: Coordinates,
  destination: Coordinates,
  speedKnots: number = 14
): Promise<{ distance: number; geometry: [number, number][]; duration: number }> {
  const baseUrl = 'https://maritime-route-api.onrender.com';
  const apiUrl = `${baseUrl}/route`;
  
  // Build query parameters
  const params = new URLSearchParams({
    origin_lon: origin.lon.toString(),
    origin_lat: origin.lat.toString(),
    dest_lon: destination.lon.toString(),
    dest_lat: destination.lat.toString(),
    speed: speedKnots.toString(),
  });

  // Set up timeout for fetch call (20 seconds)
  // This prevents the API call from hanging indefinitely
  const FETCH_TIMEOUT_MS = 20000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${apiUrl}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    
    // Clear timeout if request completes successfully
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new RouteCalculationError(
        `Maritime Route API error: ${response.status} ${response.statusText} - ${errorText}`,
        'API_ERROR',
        response.status
      );
    }

    const data = await response.json() as MaritimeRouteApiResponse;
    
    // Validate API response structure
    if (!data || data.status !== 'success') {
      throw new RouteCalculationError(
        `API returned unsuccessful status: ${data?.status || 'unknown'}`,
        'INVALID_RESPONSE'
      );
    }
    
    if (!data.distance || typeof data.distance.value !== 'number') {
      throw new RouteCalculationError(
        'Invalid response format: missing or invalid distance field',
        'INVALID_RESPONSE'
      );
    }
    
    if (!data.route || !Array.isArray(data.route.coordinates)) {
      throw new RouteCalculationError(
        'Invalid response format: missing or invalid route coordinates',
        'INVALID_RESPONSE'
      );
    }

    return {
      distance: data.distance.value, // Extract distance value
      geometry: data.route.coordinates, // Extract route coordinates
      duration: data.duration?.value || 0, // Extract duration value if available
    };
  } catch (error) {
    // Clear timeout in case of error
    clearTimeout(timeoutId);
    
    if (error instanceof RouteCalculationError) {
      throw error;
    }
    
    // Handle AbortError (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new RouteCalculationError(
        `Maritime Route API request timed out after ${FETCH_TIMEOUT_MS / 1000} seconds. The API may be slow or unavailable.`,
        'TIMEOUT_ERROR'
      );
    }
    
    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new RouteCalculationError(
        'Network error: Unable to reach Maritime Route API. Check your internet connection.',
        'NETWORK_ERROR'
      );
    }
    
    throw new RouteCalculationError(
      `Unexpected error calling Maritime Route API: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'UNEXPECTED_ERROR'
    );
  }
}

/**
 * Determines route type based on waypoints and route characteristics
 * This helps identify if the route goes through canals or specific passages
 */
function determineRouteType(
  waypoints: Coordinates[],
  origin: string,
  destination: string
): string {
  // Check for major canal passages based on coordinates
  // Suez Canal: approximately 30°N, 32°E
  const suezCanal = { lat: 30.5852, lon: 32.2656 };
  // Panama Canal: approximately 9°N, 79°W
  const panamaCanal = { lat: 9.0, lon: -79.5 };
  
  // Check if route passes near Suez Canal
  const nearSuez = waypoints.some(
    (wp) =>
      Math.abs(wp.lat - suezCanal.lat) < 2 && Math.abs(wp.lon - suezCanal.lon) < 2
  );
  
  // Check if route passes near Panama Canal
  const nearPanama = waypoints.some(
    (wp) =>
      Math.abs(wp.lat - panamaCanal.lat) < 2 && Math.abs(wp.lon - panamaCanal.lon) < 2
  );
  
  if (nearSuez) {
    return 'via Suez Canal';
  }
  if (nearPanama) {
    return 'via Panama Canal';
  }
  
  // Check if route crosses major ocean basins (indicates long-distance route)
  const lats = waypoints.map((wp) => wp.lat);
  const lons = waypoints.map((wp) => wp.lon);
  const latRange = Math.max(...lats) - Math.min(...lats);
  const lonRange = Math.max(...lons) - Math.min(...lons);
  
  if (latRange > 30 || lonRange > 60) {
    return 'transoceanic route';
  }
  
  return 'direct route';
}

/**
 * Main execute function for route calculation
 * 
 * This function:
 * 1. Validates input parameters using Zod
 * 2. Fetches port coordinates from the database
 * 3. Calls Maritime Route API to get optimal route
 * 4. Processes and formats the response
 * 5. Returns structured route data
 * 
 * @param input - Route calculation parameters
 * @returns Route calculation result with distance, time, waypoints, and route type
 * @throws RouteCalculationError - If validation fails, port lookup fails, or API call fails
 */
export async function calculateRoute(
  input: RouteCalculatorInput
): Promise<RouteCalculatorOutput> {
  // Validate input using Zod schema
  const validatedInput = routeCalculatorInputSchema.parse(input);
  
  const { origin_port_code, destination_port_code, vessel_speed_knots = 14 } = validatedInput;
  
  // Check if origin and destination are the same
  if (origin_port_code === destination_port_code) {
    throw new RouteCalculationError(
      'Origin and destination ports cannot be the same',
      'INVALID_INPUT'
    );
  }
  
  try {
    // Fetch port coordinates
    const [originCoords, destinationCoords] = await Promise.all([
      getPortCoordinates(origin_port_code),
      getPortCoordinates(destination_port_code),
    ]);
    
    // Call Maritime Route API
    const apiResponse = await callMaritimeRouteApi(
      originCoords,
      destinationCoords,
      vessel_speed_knots
    );
    
    // Convert API geometry ([lon, lat]) to our Coordinates format ({lat, lon})
    // Only normalize longitudes if clearly out of range, preserve route continuity
    const normalizeLongitude = (lon: number): number => {
      // Only normalize if clearly out of range
      if (lon > 180 && lon <= 360) return lon - 360;
      if (lon < -180 && lon >= -360) return lon + 360;
      // Otherwise trust the API (preserves route continuity)
      return lon;
    };
    
    // Check for route continuity issues (suspicious longitude jumps)
    const waypoints: Coordinates[] = apiResponse.geometry.map(([lon, lat], index) => {
      const normalizedLon = normalizeLongitude(lon);
      
      // Check for suspicious jumps between consecutive waypoints
      if (index > 0) {
        const prevLon = waypoints[index - 1]?.lon;
        if (prevLon !== undefined) {
          const lonDiff = Math.abs(normalizedLon - prevLon);
          // If longitude difference > 180°, flag as suspicious (but don't auto-correct)
          if (lonDiff > 180 && lonDiff < 360) {
            console.warn(
              `[ROUTE-CALC] Suspicious longitude jump detected at waypoint ${index}: ` +
              `${prevLon}° → ${normalizedLon}° (diff: ${lonDiff.toFixed(1)}°)`
            );
          }
        }
      }
      
      return {
        lat,
        lon: normalizedLon,
      };
    });
    
    // Determine route type
    const routeType = determineRouteType(waypoints, origin_port_code, destination_port_code);
    
    // Use duration from API if available, otherwise calculate from distance and speed
    const estimatedHours = apiResponse.duration > 0 
      ? apiResponse.duration 
      : apiResponse.distance / vessel_speed_knots;
    
    const result = {
      distance_nm: apiResponse.distance,
      estimated_hours: Math.round(estimatedHours * 100) / 100, // Round to 2 decimal places
      waypoints,
      route_type: routeType,
      origin_port_code,
      destination_port_code,
    };
    
    PortLogger.logRouteCalculation(origin_port_code, destination_port_code, result.distance_nm, waypoints.length);
    
    return result;
  } catch (error) {
    // Handle Zod validation errors (don't fallback for validation errors)
    if (error instanceof z.ZodError) {
      throw new RouteCalculationError(
        `Input validation failed: ${error.issues.map((e) => e.message).join(', ')}`,
        'VALIDATION_ERROR'
      );
    }
    
    // For API errors (timeout, network, etc.), try to fallback to cached routes
    const isApiError = error instanceof RouteCalculationError && (
      error.code === 'TIMEOUT_ERROR' ||
      error.code === 'NETWORK_ERROR' ||
      error.code === 'API_ERROR' ||
      error.code === 'INVALID_RESPONSE' ||
      error.code === 'UNEXPECTED_ERROR'
    );
    
    if (isApiError) {
      console.warn(`⚠️ [ROUTE-CALCULATOR] API error (${error.code}), attempting fallback to cached routes...`);
      
      try {
        const cachedRoute = await findCachedRoute(origin_port_code, destination_port_code);
        if (cachedRoute) {
          console.log(`✅ [ROUTE-CALCULATOR] Successfully using cached route as fallback`);
          return cachedRoute;
        } else {
          console.warn(`⚠️ [ROUTE-CALCULATOR] No cached route found for ${origin_port_code} → ${destination_port_code}`);
        }
      } catch (fallbackError) {
        console.error(`❌ [ROUTE-CALCULATOR] Fallback to cached routes failed:`, fallbackError);
      }
    }
    
    // Re-throw RouteCalculationError as-is (or original error if not a RouteCalculationError)
    if (error instanceof RouteCalculationError) {
      throw error;
    }
    
    // Handle unexpected errors
    throw new RouteCalculationError(
      `Unexpected error during route calculation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'UNEXPECTED_ERROR'
    );
  }
}

/**
 * Tool schema for Claude (Anthropic SDK)
 * This schema is used to register the tool with Claude so it can be called by the AI agent
 */
export const routeCalculatorToolSchema = {
  name: 'calculate_route',
  description: `Calculate optimal maritime route between two ports using Maritime Route API.
    Returns distance, estimated travel time, waypoints, and route type (e.g., via Suez Canal).
    Accounts for navigable waterways, canal passages, and restricted areas.`,
  input_schema: {
    type: 'object',
    properties: {
      origin_port_code: {
        type: 'string',
        description: 'Origin port code in UNLOCODE format (e.g., SGSIN for Singapore)',
      },
      destination_port_code: {
        type: 'string',
        description: 'Destination port code in UNLOCODE format (e.g., NLRTM for Rotterdam)',
      },
      vessel_speed_knots: {
        type: 'number',
        description: 'Vessel speed in knots (optional, defaults to 14 knots)',
      },
    },
    required: ['origin_port_code', 'destination_port_code'],
  },
} as const;

/**
 * Tool execution wrapper for Claude
 * This function is called by the agent when the tool is invoked
 */
export async function executeRouteCalculatorTool(
  args: unknown
): Promise<RouteCalculatorOutput> {
  return calculateRoute(args as RouteCalculatorInput);
}

