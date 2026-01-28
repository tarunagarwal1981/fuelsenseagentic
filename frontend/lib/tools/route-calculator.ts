/**
 * Route Calculator Tool
 * 
 * Thin wrapper around RouteService that calculates optimal maritime routes between ports.
 * Uses the service layer for route calculation with ECA zone detection and timeline calculation.
 * 
 * This tool:
 * - Validates input parameters
 * - Delegates to RouteService for route calculation
 * - Formats output for agent consumption
 */

import { z } from 'zod';
import { Coordinates } from '@/lib/types';
import { ServiceContainer } from '@/lib/repositories/service-container';
import { PortLogger } from '@/lib/utils/debug-logger';
import { haversineDistance } from '@/lib/utils/coordinate-validator';

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
 * Zod schema for input validation
 * Validates that required fields are present and have correct types
 */
export const routeCalculatorInputSchema = z.object({
  origin_port_code: z
    .string()
    .min(5, 'Origin port code must be exactly 5 characters (UNLOCODE format)')
    .max(5, 'Origin port code must be exactly 5 characters (UNLOCODE format)')
    .describe('Origin port code in UNLOCODE format (e.g., SGSIN for Singapore)'),
  
  destination_port_code: z
    .string()
    .min(5, 'Destination port code must be exactly 5 characters (UNLOCODE format)')
    .max(5, 'Destination port code must be exactly 5 characters (UNLOCODE format)')
    .describe('Destination port code in UNLOCODE format (e.g., NLRTM for Rotterdam)'),
  
  vessel_speed_knots: z
    .number()
    .min(5, 'Vessel speed must be at least 5 knots')
    .max(25, 'Vessel speed must be realistic (max 25 knots)')
    .optional()
    .default(14)
    .describe('Vessel speed in knots (default: 14 knots)'),
  
  departure_date: z
    .string()
    .datetime()
    .optional()
    .describe('Departure date in ISO 8601 format (optional, defaults to current date)'),
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
 * Main execute function for route calculation
 * 
 * This function:
 * 1. Validates input parameters using Zod
 * 2. Gets RouteService from ServiceContainer
 * 3. Delegates route calculation to RouteService
 * 4. Formats RouteData output to RouteCalculatorOutput format
 * 
 * @param input - Route calculation parameters
 * @returns Route calculation result with distance, time, waypoints, and route type
 * @throws RouteCalculationError - If validation fails or route calculation fails
 */
export async function calculateRoute(
  input: RouteCalculatorInput
): Promise<RouteCalculatorOutput> {
  try {
    // Validate input using Zod schema
    const validated = routeCalculatorInputSchema.parse(input);
    
    const { 
      origin_port_code, 
      destination_port_code, 
      vessel_speed_knots = 14,
      departure_date 
    } = validated;
    
    // Check if origin and destination are the same
    if (origin_port_code === destination_port_code) {
      throw new RouteCalculationError(
        'Origin and destination ports cannot be the same',
        'INVALID_INPUT'
      );
    }
    
    // Get service from container
    const container = ServiceContainer.getInstance();
    const routeService = container.getRouteService();
    
    // Call service (does all the work: port lookup, API call, ECA detection, timeline)
    const routeData = await routeService.calculateRoute({
      origin: origin_port_code,
      destination: destination_port_code,
      speed: vessel_speed_knots,
      departureDate: departure_date ? new Date(departure_date) : new Date()
    });

    // ===== POST-CALCULATION VALIDATION =====
    console.log('🔍 [ROUTE-WORKFLOW] Validating calculated route...');

    const warnings: string[] = [];

    const originCoords = {
      lat: routeData.origin.coordinates.lat,
      lon: routeData.origin.coordinates.lon,
    };
    const destCoords = {
      lat: routeData.destination.coordinates.lat,
      lon: routeData.destination.coordinates.lon,
    };

    const straightLineDistance = haversineDistance(originCoords, destCoords);
    const routeDistance = routeData.totalDistanceNm;
    const distanceRatio = straightLineDistance > 0 ? routeDistance / straightLineDistance : 0;

    console.log('   Straight-line distance:', straightLineDistance.toFixed(0), 'nm');
    console.log('   Route distance:', routeDistance.toFixed(0), 'nm');
    console.log('   Distance ratio:', distanceRatio.toFixed(2), 'x');

    if (distanceRatio < 1.0 && straightLineDistance > 0) {
      warnings.push('Route distance is less than straight-line distance - impossible!');
    } else if (distanceRatio > 3.5) {
      warnings.push(
        `Route distance is ${distanceRatio.toFixed(2)}x straight-line distance - unusually long. ` +
          'This may indicate wrong port identification.'
      );
    }

    const waypointCount = routeData.waypoints?.length ?? 0;
    console.log('   Waypoints:', waypointCount);

    if (waypointCount === 0) {
      warnings.push('Route has no waypoints - route calculation may have failed');
    } else if (waypointCount < 5) {
      warnings.push('Route has very few waypoints - may be incomplete');
    }

    if (routeData.totalDistanceNm === 0) {
      warnings.push('Route distance is zero - calculation failed');
    }

    if (warnings.length > 0) {
      console.warn('⚠️ [ROUTE-WORKFLOW] Post-calculation validation warnings:', warnings);
    } else {
      console.log('✅ [ROUTE-WORKFLOW] Route validation passed - no issues detected');
    }

    // Convert RouteData waypoints ([lat, lon]) to Coordinates format ({lat, lon})
    const waypoints: Coordinates[] = routeData.waypoints.map((wp) => ({
      lat: wp.coordinates[0],
      lon: wp.coordinates[1],
    }));
    
    // Format output for agent consumption
    const result: RouteCalculatorOutput = {
      distance_nm: routeData.totalDistanceNm,
      estimated_hours: Math.round(routeData.estimatedHours * 100) / 100, // Round to 2 decimal places
      waypoints,
      route_type: routeData.routeType,
      origin_port_code: routeData.origin.port_code,
      destination_port_code: routeData.destination.port_code,
    };
    
    PortLogger.logRouteCalculation(
      origin_port_code, 
      destination_port_code, 
      result.distance_nm, 
      waypoints.length
    );
    
    return result;
  } catch (error) {
    // Enhanced error logging for debugging
    console.error('[ROUTE-CALC] Detailed error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context: 'route calculation',
      origin: input.origin_port_code,
      destination: input.destination_port_code,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      throw new RouteCalculationError(
        `Input validation failed: ${error.issues.map((e) => e.message).join(', ')}`,
        'VALIDATION_ERROR'
      );
    }
    
    // Re-throw RouteCalculationError as-is
    if (error instanceof RouteCalculationError) {
      throw error;
    }
    
    // Handle service errors (port not found, API errors, etc.)
    if (error instanceof Error) {
      // Check for common error patterns from RouteService
      if (error.message.includes('not found')) {
        throw new RouteCalculationError(
          error.message,
          'PORT_NOT_FOUND'
        );
      }
      
      throw new RouteCalculationError(
        `Route calculation failed: ${error.message}`,
        'SERVICE_ERROR'
      );
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
    Accounts for navigable waterways, canal passages, and restricted areas.
    
    Port codes must be valid UN/LOCODE format (5 characters):
    - Format: [2-letter country][3-letter port]
    - Examples: SGSIN (Singapore), NLRTM (Rotterdam), USNYC (New York)
    
    Common ports:
    - Asia: SGSIN, CNSHA, HKHKG, JPYOK, KRPUS
    - Middle East: AEJEA, AEFUJ, INMUN
    - Europe: NLRTM, DEHAM, GIGIB, GRPIR
    - Americas: USNYC, USHOU, PAMIT
    
    The tool will return a helpful error if port codes are invalid.`,
  input_schema: {
    type: 'object',
    properties: {
      origin_port_code: {
        type: 'string',
        description: 'Origin port code in UNLOCODE format (5 characters, e.g., SGSIN for Singapore). Must be exactly 5 alphanumeric characters.',
      },
      destination_port_code: {
        type: 'string',
        description: 'Destination port code in UNLOCODE format (5 characters, e.g., NLRTM for Rotterdam). Must be exactly 5 alphanumeric characters.',
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

