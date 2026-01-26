/**
 * Find Bunker Ports Tool
 * 
 * Thin wrapper around RouteService and BunkerService that finds bunker ports along a route.
 * Uses the service layer for route calculation and bunker port finding.
 * 
 * This tool:
 * - Validates input parameters
 * - Calculates route using RouteService
 * - Finds bunker ports along route using BunkerService
 * - Formats output for agent consumption
 */

import { z } from 'zod';
import { ServiceContainer } from '@/lib/repositories/service-container';

/**
 * Input parameters for finding bunker ports
 */
export interface FindBunkerPortsInput {
  /** Origin port code (UNLOCODE format, e.g., 'SGSIN') */
  origin_port: string;
  /** Destination port code (UNLOCODE format, e.g., 'NLRTM') */
  destination_port: string;
  /** Maximum deviation from route in nautical miles */
  max_deviation_nm: number;
  /** Fuel types to filter by (optional, defaults to ['VLSFO', 'MGO']) */
  fuel_types?: string[];
  /** Vessel speed in knots (optional, defaults to 14) */
  speed?: number;
}

/**
 * Output from finding bunker ports
 */
export interface FindBunkerPortsOutput {
  /** Whether the operation was successful */
  success: boolean;
  /** Array of found bunker ports */
  ports?: Array<{
    code: string;
    name: string;
    deviation: number;
    fuels: string[];
  }>;
  /** Total count of ports found */
  count?: number;
  /** Error message if operation failed */
  error?: string;
}

/**
 * Zod schema for input validation
 */
export const FindBunkerPortsSchema = z.object({
  origin_port: z
    .string()
    .min(5, 'Origin port code must be exactly 5 characters (UNLOCODE format)')
    .max(5, 'Origin port code must be exactly 5 characters (UNLOCODE format)')
    .describe('Origin port code in UNLOCODE format (e.g., SGSIN for Singapore)'),
  
  destination_port: z
    .string()
    .min(5, 'Destination port code must be exactly 5 characters (UNLOCODE format)')
    .max(5, 'Destination port code must be exactly 5 characters (UNLOCODE format)')
    .describe('Destination port code in UNLOCODE format (e.g., NLRTM for Rotterdam)'),
  
  max_deviation_nm: z
    .number()
    .min(0, 'Maximum deviation must be non-negative')
    .max(500, 'Maximum deviation cannot exceed 500 nautical miles')
    .describe('Maximum deviation from route in nautical miles'),
  
  fuel_types: z
    .array(z.string())
    .optional()
    .default(['VLSFO', 'MGO'])
    .describe('Fuel types to filter by (defaults to VLSFO and MGO)'),
  
  speed: z
    .number()
    .min(5, 'Vessel speed must be at least 5 knots')
    .max(25, 'Vessel speed must be realistic (max 25 knots)')
    .optional()
    .default(14)
    .describe('Vessel speed in knots (default: 14 knots)'),
});

/**
 * Error class for bunker port finding failures
 */
export class FindBunkerPortsError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'FindBunkerPortsError';
  }
}

/**
 * Main function to find bunker ports along a route
 * 
 * This function:
 * 1. Validates input parameters using Zod
 * 2. Gets RouteService and BunkerService from ServiceContainer
 * 3. Calculates route using RouteService
 * 4. Finds bunker ports along route using BunkerService
 * 5. Formats output for agent consumption
 * 
 * @param params - Bunker port finding parameters
 * @returns Bunker ports found along the route
 */
export async function find_bunker_ports(
  params: FindBunkerPortsInput
): Promise<FindBunkerPortsOutput> {
  try {
    // 1. Validate input
    const validated = FindBunkerPortsSchema.parse(params);
    
    // 2. Get services from container
    const container = ServiceContainer.getInstance();
    const routeService = container.getRouteService();
    const bunkerService = container.getBunkerService();
    
    // 3. Calculate route first
    const route = await routeService.calculateRoute({
      origin: validated.origin_port,
      destination: validated.destination_port,
      speed: validated.speed,
      departureDate: new Date()
    });
    
    // 4. Find bunker ports along route
    const bunkerPorts = await bunkerService.findBunkerPorts({
      route,
      maxDeviation: validated.max_deviation_nm,
      fuelTypes: validated.fuel_types
    });
    
    // 5. Format output
    return {
      success: true,
      ports: bunkerPorts.map(port => ({
        code: port.code,
        name: port.name,
        deviation: Math.round(port.deviation * 10) / 10, // Round to 1 decimal place
        fuels: port.fuelsAvailable
      })),
      count: bunkerPorts.length
    };
    
  } catch (error) {
    // Enhanced error logging for debugging
    console.error('[FIND-BUNKER-PORTS] Detailed error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context: 'find bunker ports',
      origin: params.origin_port,
      destination: params.destination_port,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Input validation failed: ${error.issues.map((e) => e.message).join(', ')}`
      };
    }
    
    // Handle service errors
    if (error instanceof Error) {
      return {
        success: false,
        error: error.message
      };
    }
    
    // Handle unexpected errors
    return {
      success: false,
      error: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Tool schema for Claude (Anthropic SDK)
 * This schema is used to register the tool with Claude so it can be called by the AI agent
 */
export const findBunkerPortsToolSchema = {
  name: 'find_bunker_ports',
  description: `Find bunker ports along a maritime route within a specified deviation distance.
    
This tool:
- Calculates the optimal route between origin and destination ports
- Finds bunker-capable ports along the route within the maximum deviation
- Filters ports by available fuel types
- Returns ports sorted by distance from route

Input:
- origin_port: Origin port code in UNLOCODE format (5 characters, e.g., SGSIN)
- destination_port: Destination port code in UNLOCODE format (5 characters, e.g., NLRTM)
- max_deviation_nm: Maximum deviation from route in nautical miles (0-500)
- fuel_types: Optional array of fuel types to filter by (defaults to ['VLSFO', 'MGO'])
- speed: Optional vessel speed in knots (defaults to 14)

Output:
- success: Whether the operation succeeded
- ports: Array of found bunker ports with code, name, deviation, and available fuels
- count: Total number of ports found
- error: Error message if operation failed

Use this tool after calculating a route to find refueling options along the way.`,
  input_schema: {
    type: 'object',
    properties: {
      origin_port: {
        type: 'string',
        description: 'Origin port code in UNLOCODE format (5 characters, e.g., SGSIN for Singapore)',
      },
      destination_port: {
        type: 'string',
        description: 'Destination port code in UNLOCODE format (5 characters, e.g., NLRTM for Rotterdam)',
      },
      max_deviation_nm: {
        type: 'number',
        description: 'Maximum deviation from route in nautical miles (0-500)',
      },
      fuel_types: {
        type: 'array',
        items: { type: 'string' },
        description: 'Fuel types to filter by (optional, defaults to VLSFO and MGO)',
      },
      speed: {
        type: 'number',
        description: 'Vessel speed in knots (optional, defaults to 14 knots)',
      },
    },
    required: ['origin_port', 'destination_port', 'max_deviation_nm'],
  },
} as const;

/**
 * Tool execution wrapper for Claude
 * This function is called by the agent when the tool is invoked
 */
export async function executeFindBunkerPortsTool(
  args: unknown
): Promise<FindBunkerPortsOutput> {
  return find_bunker_ports(args as FindBunkerPortsInput);
}
