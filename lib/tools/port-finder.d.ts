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
import { Coordinates, Port } from '../types';
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
export declare const portFinderInputSchema: z.ZodObject<{
    route_waypoints: z.ZodArray<z.ZodObject<{
        lat: z.ZodNumber;
        lon: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        lon: number;
        lat: number;
    }, {
        lon: number;
        lat: number;
    }>, "many">;
    max_deviation_nm: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    route_waypoints: {
        lon: number;
        lat: number;
    }[];
    max_deviation_nm: number;
}, {
    route_waypoints: {
        lon: number;
        lat: number;
    }[];
    max_deviation_nm?: number | undefined;
}>;
/**
 * Error class for port finder failures
 */
export declare class PortFinderError extends Error {
    readonly code: string;
    constructor(message: string, code: string);
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
export declare function haversineDistance(point1: Coordinates, point2: Coordinates): number;
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
export declare function findPortsNearRoute(input: PortFinderInput): Promise<PortFinderOutput>;
/**
 * Tool schema for Claude (Anthropic SDK)
 * This schema is used to register the tool with Claude so it can be called by the AI agent
 */
export declare const portFinderToolSchema: {
    readonly name: "find_ports_near_route";
    readonly description: "Find bunker ports near a shipping route. \n    Analyzes route waypoints and returns ports within a specified maximum deviation distance.\n    Only returns ports that have fuel capabilities (VLSFO, LSGO, MGO).\n    Results are sorted by distance from the route, with closest ports first.\n    Useful for finding refueling options along a planned voyage.";
    readonly input_schema: {
        readonly type: "object";
        readonly properties: {
            readonly route_waypoints: {
                readonly type: "array";
                readonly description: "Array of waypoint coordinates along the route. Each waypoint should have lat and lon properties.";
                readonly items: {
                    readonly type: "object";
                    readonly properties: {
                        readonly lat: {
                            readonly type: "number";
                            readonly description: "Latitude in decimal degrees (-90 to 90)";
                        };
                        readonly lon: {
                            readonly type: "number";
                            readonly description: "Longitude in decimal degrees (-180 to 180)";
                        };
                    };
                    readonly required: readonly ["lat", "lon"];
                };
            };
            readonly max_deviation_nm: {
                readonly type: "number";
                readonly description: "Maximum distance in nautical miles from route waypoints to consider a port (default: 150 nm)";
            };
        };
        readonly required: readonly ["route_waypoints"];
    };
};
/**
 * Tool execution wrapper for Claude
 * This function is called by the agent when the tool is invoked
 */
export declare function executePortFinderTool(args: unknown): Promise<PortFinderOutput>;
//# sourceMappingURL=port-finder.d.ts.map