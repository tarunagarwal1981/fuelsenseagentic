"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeCalculatorToolSchema = exports.RouteCalculationError = exports.routeCalculatorInputSchema = void 0;
exports.calculateRoute = calculateRoute;
exports.executeRouteCalculatorTool = executeRouteCalculatorTool;
const zod_1 = require("zod");
/**
 * Zod schema for input validation
 * Validates that required fields are present and have correct types
 */
exports.routeCalculatorInputSchema = zod_1.z.object({
    origin_port_code: zod_1.z
        .string()
        .min(1, 'Origin port code is required')
        .max(10, 'Port code must be 10 characters or less')
        .describe('Origin port code in UNLOCODE format (e.g., SGSIN for Singapore)'),
    destination_port_code: zod_1.z
        .string()
        .min(1, 'Destination port code is required')
        .max(10, 'Port code must be 10 characters or less')
        .describe('Destination port code in UNLOCODE format (e.g., NLRTM for Rotterdam)'),
    vessel_speed_knots: zod_1.z
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
class RouteCalculationError extends Error {
    code;
    statusCode;
    constructor(message, code, statusCode) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.name = 'RouteCalculationError';
    }
}
exports.RouteCalculationError = RouteCalculationError;
/**
 * Port data cache - loaded once at module initialization
 * In production, this would query a database or API
 */
let portsCache = null;
/**
 * Loads port data from the ports.json file
 * Caches the data for subsequent lookups
 * Works in both Node.js and Edge runtime
 */
async function loadPortsData() {
    if (portsCache) {
        return portsCache;
    }
    try {
        // Use dynamic import for JSON file (works with resolveJsonModule in tsconfig)
        const portsModule = await Promise.resolve().then(() => __importStar(require('@/lib/data/ports.json')));
        // JSON imports return the data directly, not as default export
        const ports = Array.isArray(portsModule)
            ? portsModule
            : portsModule.default || portsModule;
        const cache = ports.map((p) => ({
            port_code: p.port_code,
            coordinates: p.coordinates,
        }));
        portsCache = cache;
        return cache;
    }
    catch (error) {
        throw new RouteCalculationError(`Failed to load ports data: ${error instanceof Error ? error.message : 'Unknown error'}`, 'PORT_DATA_LOAD_ERROR');
    }
}
/**
 * Fetches port coordinates from the ports database
 * In a real implementation, this would query a database or API
 */
async function getPortCoordinates(portCode) {
    try {
        const ports = await loadPortsData();
        const port = ports.find((p) => p.port_code === portCode);
        if (!port) {
            throw new RouteCalculationError(`Port code ${portCode} not found in database`, 'PORT_NOT_FOUND');
        }
        return port.coordinates;
    }
    catch (error) {
        if (error instanceof RouteCalculationError) {
            throw error;
        }
        throw new RouteCalculationError(`Failed to fetch port coordinates: ${error instanceof Error ? error.message : 'Unknown error'}`, 'PORT_FETCH_ERROR');
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
async function callMaritimeRouteApi(origin, destination, speedKnots = 14) {
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
            throw new RouteCalculationError(`Maritime Route API error: ${response.status} ${response.statusText} - ${errorText}`, 'API_ERROR', response.status);
        }
        const data = await response.json();
        // Validate API response structure
        if (!data || data.status !== 'success') {
            throw new RouteCalculationError(`API returned unsuccessful status: ${data?.status || 'unknown'}`, 'INVALID_RESPONSE');
        }
        if (!data.distance || typeof data.distance.value !== 'number') {
            throw new RouteCalculationError('Invalid response format: missing or invalid distance field', 'INVALID_RESPONSE');
        }
        if (!data.route || !Array.isArray(data.route.coordinates)) {
            throw new RouteCalculationError('Invalid response format: missing or invalid route coordinates', 'INVALID_RESPONSE');
        }
        return {
            distance: data.distance.value, // Extract distance value
            geometry: data.route.coordinates, // Extract route coordinates
            duration: data.duration?.value || 0, // Extract duration value if available
        };
    }
    catch (error) {
        // Clear timeout in case of error
        clearTimeout(timeoutId);
        if (error instanceof RouteCalculationError) {
            throw error;
        }
        // Handle AbortError (timeout)
        if (error instanceof Error && error.name === 'AbortError') {
            throw new RouteCalculationError(`Maritime Route API request timed out after ${FETCH_TIMEOUT_MS / 1000} seconds. The API may be slow or unavailable.`, 'TIMEOUT_ERROR');
        }
        // Handle network errors
        if (error instanceof TypeError && error.message.includes('fetch')) {
            throw new RouteCalculationError('Network error: Unable to reach Maritime Route API. Check your internet connection.', 'NETWORK_ERROR');
        }
        throw new RouteCalculationError(`Unexpected error calling Maritime Route API: ${error instanceof Error ? error.message : 'Unknown error'}`, 'UNEXPECTED_ERROR');
    }
}
/**
 * Determines route type based on waypoints and route characteristics
 * This helps identify if the route goes through canals or specific passages
 */
function determineRouteType(waypoints, origin, destination) {
    // Check for major canal passages based on coordinates
    // Suez Canal: approximately 30°N, 32°E
    const suezCanal = { lat: 30.5852, lon: 32.2656 };
    // Panama Canal: approximately 9°N, 79°W
    const panamaCanal = { lat: 9.0, lon: -79.5 };
    // Check if route passes near Suez Canal
    const nearSuez = waypoints.some((wp) => Math.abs(wp.lat - suezCanal.lat) < 2 && Math.abs(wp.lon - suezCanal.lon) < 2);
    // Check if route passes near Panama Canal
    const nearPanama = waypoints.some((wp) => Math.abs(wp.lat - panamaCanal.lat) < 2 && Math.abs(wp.lon - panamaCanal.lon) < 2);
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
async function calculateRoute(input) {
    // Validate input using Zod schema
    const validatedInput = exports.routeCalculatorInputSchema.parse(input);
    const { origin_port_code, destination_port_code, vessel_speed_knots = 14 } = validatedInput;
    // Check if origin and destination are the same
    if (origin_port_code === destination_port_code) {
        throw new RouteCalculationError('Origin and destination ports cannot be the same', 'INVALID_INPUT');
    }
    try {
        // Fetch port coordinates
        const [originCoords, destinationCoords] = await Promise.all([
            getPortCoordinates(origin_port_code),
            getPortCoordinates(destination_port_code),
        ]);
        // Call Maritime Route API
        const apiResponse = await callMaritimeRouteApi(originCoords, destinationCoords, vessel_speed_knots);
        // Convert API geometry ([lon, lat]) to our Coordinates format ({lat, lon})
        const waypoints = apiResponse.geometry.map(([lon, lat]) => ({
            lat,
            lon,
        }));
        // Determine route type
        const routeType = determineRouteType(waypoints, origin_port_code, destination_port_code);
        // Use duration from API if available, otherwise calculate from distance and speed
        const estimatedHours = apiResponse.duration > 0
            ? apiResponse.duration
            : apiResponse.distance / vessel_speed_knots;
        return {
            distance_nm: apiResponse.distance,
            estimated_hours: Math.round(estimatedHours * 100) / 100, // Round to 2 decimal places
            waypoints,
            route_type: routeType,
            origin_port_code,
            destination_port_code,
        };
    }
    catch (error) {
        // Re-throw RouteCalculationError as-is
        if (error instanceof RouteCalculationError) {
            throw error;
        }
        // Handle Zod validation errors
        if (error instanceof zod_1.z.ZodError) {
            throw new RouteCalculationError(`Input validation failed: ${error.issues.map((e) => e.message).join(', ')}`, 'VALIDATION_ERROR');
        }
        // Handle unexpected errors
        throw new RouteCalculationError(`Unexpected error during route calculation: ${error instanceof Error ? error.message : 'Unknown error'}`, 'UNEXPECTED_ERROR');
    }
}
/**
 * Tool schema for Claude (Anthropic SDK)
 * This schema is used to register the tool with Claude so it can be called by the AI agent
 */
exports.routeCalculatorToolSchema = {
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
};
/**
 * Tool execution wrapper for Claude
 * This function is called by the agent when the tool is invoked
 */
async function executeRouteCalculatorTool(args) {
    return calculateRoute(args);
}
//# sourceMappingURL=route-calculator.js.map