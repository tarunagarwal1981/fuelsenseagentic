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
import { Coordinates } from '../types';
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
export declare const routeCalculatorInputSchema: z.ZodObject<{
    origin_port_code: z.ZodString;
    destination_port_code: z.ZodString;
    vessel_speed_knots: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    origin_port_code: string;
    destination_port_code: string;
    vessel_speed_knots: number;
}, {
    origin_port_code: string;
    destination_port_code: string;
    vessel_speed_knots?: number | undefined;
}>;
/**
 * Error class for route calculation failures
 */
export declare class RouteCalculationError extends Error {
    readonly code: string;
    readonly statusCode?: number | undefined;
    constructor(message: string, code: string, statusCode?: number | undefined);
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
export declare function calculateRoute(input: RouteCalculatorInput): Promise<RouteCalculatorOutput>;
/**
 * Tool schema for Claude (Anthropic SDK)
 * This schema is used to register the tool with Claude so it can be called by the AI agent
 */
export declare const routeCalculatorToolSchema: {
    readonly name: "calculate_route";
    readonly description: "Calculate optimal maritime route between two ports using Maritime Route API.\n    Returns distance, estimated travel time, waypoints, and route type (e.g., via Suez Canal).\n    Accounts for navigable waterways, canal passages, and restricted areas.";
    readonly input_schema: {
        readonly type: "object";
        readonly properties: {
            readonly origin_port_code: {
                readonly type: "string";
                readonly description: "Origin port code in UNLOCODE format (e.g., SGSIN for Singapore)";
            };
            readonly destination_port_code: {
                readonly type: "string";
                readonly description: "Destination port code in UNLOCODE format (e.g., NLRTM for Rotterdam)";
            };
            readonly vessel_speed_knots: {
                readonly type: "number";
                readonly description: "Vessel speed in knots (optional, defaults to 14 knots)";
            };
        };
        readonly required: readonly ["origin_port_code", "destination_port_code"];
    };
};
/**
 * Tool execution wrapper for Claude
 * This function is called by the agent when the tool is invoked
 */
export declare function executeRouteCalculatorTool(args: unknown): Promise<RouteCalculatorOutput>;
//# sourceMappingURL=route-calculator.d.ts.map