/**
 * Multi-Agent Tools Configuration
 * 
 * Configures tool sets for each specialized agent in the multi-agent system.
 * Tools are organized by agent type (Route, Weather, Bunker) for better
 * organization and agent-specific tool binding.
 * 
 * MIGRATION NOTE:
 * ===============
 * Tool implementations are now registered in the Tool Registry system.
 * See: lib/registry/tools/ for tool definitions
 * 
 * This file contains:
 * - Tool implementations (execute* functions) - KEPT for backward compatibility
 * - LangChain tool wrappers - KEPT for agent binding
 * - Circuit breakers - KEPT for resilience
 * 
 * Tool metadata (schemas, descriptions, categories) is now managed by:
 * - lib/registry/tools/routing-tools.ts
 * - lib/registry/tools/weather-tools.ts
 * - lib/registry/tools/bunker-tools.ts
 * 
 * To register tools, call registerAllTools() from lib/registry/tools/index.ts
 * at application startup.
 */

import { tool } from '@langchain/core/tools';
import { getCorrelationId } from '@/lib/monitoring/correlation-context';
import { generateCorrelationId } from '@/lib/utils/correlation';
import { logToolCall } from '@/lib/monitoring/axiom-logger';
import { sanitizeToolInput, sanitizeToolOutput } from '@/lib/monitoring/sanitize';
import { createToolCircuitBreaker } from '@/lib/resilience/circuit-breaker';

// Route Agent Tools
import {
  executeRouteCalculatorTool,
  routeCalculatorInputSchema,
} from '@/lib/tools/route-calculator';
import {
  executeWeatherTimelineTool,
  weatherTimelineInputSchema,
} from '@/lib/tools/weather-timeline';

// Weather Agent Tools
import {
  executeMarineWeatherTool,
  marineWeatherInputSchema,
} from '@/lib/tools/marine-weather';
import {
  executeWeatherConsumptionTool,
  weatherConsumptionInputSchema,
} from '@/lib/tools/weather-consumption';
import {
  executePortWeatherTool,
  portWeatherInputSchema,
} from '@/lib/tools/port-weather';

// Bunker Agent Tools
import {
  executePortFinderTool,
  portFinderInputSchema,
} from '@/lib/tools/port-finder';
import {
  executePriceFetcherTool,
  priceFetcherInputSchema,
} from '@/lib/tools/price-fetcher';
import {
  executeBunkerAnalyzerTool,
  bunkerAnalyzerInputSchema,
} from '@/lib/tools/bunker-analyzer';

// Vessel Performance Tools
import {
  executeNoonReportFetcherTool,
  noonReportFetcherInputSchema,
  executeVesselSpecFetcherTool,
  vesselSpecFetcherInputSchema,
  executeConsumptionProfileFetcherTool,
  consumptionProfileFetcherInputSchema,
} from '@/lib/tools/vessel-performance';

// ============================================================================
// Circuit breakers (wrap external API calls)
// ============================================================================

const calculateRouteBreaker = createToolCircuitBreaker('calculate_route', (i) => executeRouteCalculatorTool(i), 'route');
const calculateWeatherTimelineBreaker = createToolCircuitBreaker('calculate_weather_timeline', (i) => executeWeatherTimelineTool(i), 'route');
const fetchMarineWeatherBreaker = createToolCircuitBreaker('fetch_marine_weather', (i) => executeMarineWeatherTool(i), 'weather');
const calculateWeatherConsumptionBreaker = createToolCircuitBreaker('calculate_weather_consumption', (i) => executeWeatherConsumptionTool(i), 'weather');
const checkPortWeatherBreaker = createToolCircuitBreaker('check_bunker_port_weather', (i) => executePortWeatherTool(i), 'weather');
const findBunkerPortsBreaker = createToolCircuitBreaker('find_bunker_ports', (i) => executePortFinderTool(i), 'analysis');
const getFuelPricesBreaker = createToolCircuitBreaker('get_fuel_prices', (i) => executePriceFetcherTool(i), 'price');
const analyzeBunkerOptionsBreaker = createToolCircuitBreaker('analyze_bunker_options', (i) => executeBunkerAnalyzerTool(i), 'analysis');
const fetchNoonReportBreaker = createToolCircuitBreaker('fetch_noon_report', (i) => executeNoonReportFetcherTool(i), 'vessel');
const fetchVesselSpecsBreaker = createToolCircuitBreaker('fetch_vessel_specs', (i) => executeVesselSpecFetcherTool(i), 'vessel');
const fetchConsumptionProfileBreaker = createToolCircuitBreaker('fetch_consumption_profile', (i) => executeConsumptionProfileFetcherTool(i), 'vessel');

// ============================================================================
// Route Agent Tools
// ============================================================================

/**
 * Route Calculator Tool
 * 
 * Calculates the optimal maritime route between two ports.
 */
export const calculateRouteTool = tool(
  async (input) => {
    const cid = getCorrelationId() || generateCorrelationId();
    const t0 = Date.now();
    logToolCall('calculate_route', cid, sanitizeToolInput(input), undefined, 0, 'started');
    console.log('🗺️ [ROUTE-AGENT] Executing calculate_route');
    try {
      const result = await calculateRouteBreaker.fire(input);
      logToolCall('calculate_route', cid, sanitizeToolInput(input), sanitizeToolOutput(result), Date.now() - t0, 'success');
      return JSON.stringify(result);
    } catch (error: any) {
      logToolCall('calculate_route', cid, sanitizeToolInput(input), { error: error.message }, Date.now() - t0, 'failed');
      console.error('❌ [ROUTE-AGENT] Route calculation error:', error.message);
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: 'calculate_route',
    description: `Calculate the optimal maritime route between two ports using the Maritime Route API.

This tool:
- Calculates distance in nautical miles
- Estimates voyage time in hours
- Returns waypoint coordinates along the route
- Identifies route type (e.g., "via Suez Canal", "direct route")

Input:
- origin_port_code: Origin port code in UNLOCODE format (e.g., "SGSIN" for Singapore)
- destination_port_code: Destination port code in UNLOCODE format (e.g., "NLRTM" for Rotterdam)
- vessel_speed_knots: Optional vessel speed in knots (default: 14)

Output:
- distance_nm: Distance in nautical miles
- estimated_hours: Estimated travel time in hours
- waypoints: Array of waypoint coordinates [{lat, lon}, ...]
- route_type: Description of route type
- origin_port_code: Origin port code
- destination_port_code: Destination port code

Use this tool first to get the route waypoints needed for weather timeline calculation.`,
    schema: routeCalculatorInputSchema,
  }
);

/**
 * Weather Timeline Tool
 * 
 * Calculates vessel position at regular intervals along a route.
 */
export const calculateWeatherTimelineTool = tool(
  async (input) => {
    const cid = getCorrelationId() || generateCorrelationId();
    const t0 = Date.now();
    logToolCall('calculate_weather_timeline', cid, sanitizeToolInput(input), undefined, 0, 'started');
    console.log('⏱️ [ROUTE-AGENT] Executing calculate_weather_timeline');
    try {
      const result = await calculateWeatherTimelineBreaker.fire(input);
      logToolCall('calculate_weather_timeline', cid, sanitizeToolInput(input), sanitizeToolOutput(result), Date.now() - t0, 'success');
      return JSON.stringify(result);
    } catch (error: any) {
      logToolCall('calculate_weather_timeline', cid, sanitizeToolInput(input), { error: error.message }, Date.now() - t0, 'failed');
      console.error('❌ [ROUTE-AGENT] Weather timeline error:', error.message);
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: 'calculate_weather_timeline',
    description: `Calculate vessel position at regular intervals along a maritime route.

This tool:
- Takes waypoints from the route calculation
- Generates positions at regular time intervals
- Tracks cumulative distance and datetime from departure
- Uses Haversine formula for accurate distance calculations

Input:
- waypoints: Array of waypoint coordinates from calculate_route result [{lat, lon}, ...]
- vessel_speed_knots: Vessel speed in knots (5-30 knots)
- departure_datetime: Departure datetime in ISO 8601 format (e.g., "2024-12-25T08:00:00Z")
- sampling_interval_hours: Optional sampling interval in hours (default: 12)

Output:
- Array of positions with:
  - lat, lon: Coordinates
  - datetime: ISO 8601 datetime
  - distance_from_start_nm: Cumulative distance
  - segment_index: Route segment index

Use this tool after calculate_route to generate vessel positions for weather forecasting.
The waypoints should come from the calculate_route tool result.`,
    schema: weatherTimelineInputSchema,
  }
);

// ============================================================================
// Weather Agent Tools
// ============================================================================

/**
 * Create a state-aware fetch_marine_weather tool
 * Automatically uses vessel_timeline from state if LLM provides too few positions
 */
export function createFetchMarineWeatherTool(state: { vessel_timeline?: any[] | null }) {
  return tool(
    async (input: any) => {
      const cid = getCorrelationId() || generateCorrelationId();
      const t0 = Date.now();
      logToolCall('fetch_marine_weather', cid, sanitizeToolInput(input), undefined, 0, 'started');
      console.log('🌊 [WEATHER-AGENT] Executing fetch_marine_weather');
      
      // CRITICAL FIX: Check if LLM provided too few positions
      // If so, automatically use full vessel_timeline from state
      const providedPositions = input?.positions || [];
      const hasVesselTimeline = state.vessel_timeline && state.vessel_timeline.length > 0;
      
      if (hasVesselTimeline && providedPositions.length < 10 && state.vessel_timeline) {
        // LLM only provided a sample - use full vessel_timeline from state
        console.log(`⚠️ [WEATHER-AGENT] LLM only provided ${providedPositions.length} positions (expected ${state.vessel_timeline.length}). Using full vessel_timeline from state.`);
        
        const fullPositions = state.vessel_timeline.map((pos: any) => ({
          lat: pos.lat,
          lon: pos.lon,
          datetime: pos.datetime
        }));
        
        // Replace input with full positions
        input = {
          ...input,
          positions: fullPositions
        };
        
        console.log(`✅ [WEATHER-AGENT] Using ${fullPositions.length} positions from vessel_timeline`);
      } else if (providedPositions.length > 0) {
        console.log(`✅ [WEATHER-AGENT] Using ${providedPositions.length} positions provided by LLM`);
      }
      
      try {
        const result = await fetchMarineWeatherBreaker.fire(input);
        logToolCall('fetch_marine_weather', cid, sanitizeToolInput(input), sanitizeToolOutput(result), Date.now() - t0, 'success');
        return result;
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logToolCall('fetch_marine_weather', cid, sanitizeToolInput(input), { error: errorMessage }, Date.now() - t0, 'failed');
        console.error('❌ [WEATHER-AGENT] Marine weather error:', errorMessage);
        return { error: errorMessage };
      }
    },
  {
    name: 'fetch_marine_weather',
    description: `Fetch marine weather forecast from Open-Meteo API for vessel positions.

This tool:
- Fetches weather data for multiple positions efficiently
- Batches API calls by grouping positions into 6-hour windows
- Returns wave height, wind speed, wind direction, and sea state
- Provides forecast confidence (high for 0-16 days, medium for 16+ days)

Input:
- positions: Array of positions with coordinates and datetime:
  [
    {
      lat: number,
      lon: number,
      datetime: "ISO 8601 format"
    },
    ...
  ]

Output:
- Array of weather forecasts with:
  - position: {lat, lon}
  - datetime: ISO 8601 datetime
  - weather: {
      wave_height_m: number (meters)
      wind_speed_knots: number (knots)
      wind_direction_deg: number (0-360)
      sea_state: string ("Calm", "Slight", "Moderate", "Rough", "Very Rough", "High")
    }
  - forecast_confidence: "high" | "medium" | "low"

Use this tool with vessel positions from calculate_weather_timeline to get weather forecasts.`,
    schema: marineWeatherInputSchema,
  }
  );
}

/**
 * Marine Weather Tool (default export for backward compatibility)
 * Note: This tool doesn't have state access. Use createFetchMarineWeatherTool in agent nodes.
 */
export const fetchMarineWeatherTool = tool(
  async (input) => {
    const cid = getCorrelationId() || generateCorrelationId();
    const t0 = Date.now();
    logToolCall('fetch_marine_weather', cid, sanitizeToolInput(input), undefined, 0, 'started');
    console.log('🌊 [WEATHER-AGENT] Executing fetch_marine_weather');
    try {
      const result = await fetchMarineWeatherBreaker.fire(input);
      logToolCall('fetch_marine_weather', cid, sanitizeToolInput(input), sanitizeToolOutput(result), Date.now() - t0, 'success');
      return result;
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logToolCall('fetch_marine_weather', cid, sanitizeToolInput(input), { error: errorMessage }, Date.now() - t0, 'failed');
      console.error('❌ [WEATHER-AGENT] Marine weather error:', errorMessage);
      return { error: errorMessage };
    }
  },
  {
    name: 'fetch_marine_weather',
    description: `Fetch marine weather forecast from Open-Meteo API for vessel positions.

This tool:
- Fetches weather data for multiple positions efficiently
- Batches API calls by grouping positions into 6-hour windows
- Returns wave height, wind speed, wind direction, and sea state
- Provides forecast confidence (high for 0-16 days, medium for 16+ days)

Input:
- positions: Array of positions with coordinates and datetime:
  [
    {
      lat: number,
      lon: number,
      datetime: "ISO 8601 format"
    },
    ...
  ]

Output:
- Array of weather forecasts with:
  - position: {lat, lon}
  - datetime: ISO 8601 datetime
  - weather: {
      wave_height_m: number (meters)
      wind_speed_knots: number (knots)
      wind_direction_deg: number (0-360)
      sea_state: string ("Calm", "Slight", "Moderate", "Rough", "Very Rough", "High")
    }
  - forecast_confidence: "high" | "medium" | "low"

Use this tool with vessel positions from calculate_weather_timeline to get weather forecasts.`,
    schema: marineWeatherInputSchema,
  }
);

/**
 * Weather Consumption Tool
 * 
 * Calculates fuel consumption adjusted for weather conditions.
 */
export const calculateWeatherConsumptionTool = tool(
  async (input) => {
    const cid = getCorrelationId() || generateCorrelationId();
    const t0 = Date.now();
    logToolCall('calculate_weather_consumption', cid, sanitizeToolInput(input), undefined, 0, 'started');
    console.log('⛽ [WEATHER-AGENT] Executing calculate_weather_consumption');
    try {
      const result = await calculateWeatherConsumptionBreaker.fire(input);
      logToolCall('calculate_weather_consumption', cid, sanitizeToolInput(input), sanitizeToolOutput(result), Date.now() - t0, 'success');
      return result;
    } catch (error: any) {
      logToolCall('calculate_weather_consumption', cid, sanitizeToolInput(input), { error: error.message }, Date.now() - t0, 'failed');
      console.error('❌ [WEATHER-AGENT] Weather consumption error:', error.message);
      return { error: error.message };
    }
  },
  {
    name: 'calculate_weather_consumption',
    description: `Calculate fuel consumption adjusted for weather conditions along a voyage.

This tool:
- Accounts for wave height impact on fuel consumption
- Accounts for wind direction relative to vessel heading
- Calculates weather-adjusted consumption and additional fuel needed
- Generates weather alerts for severe conditions
- Provides voyage weather summary

Input:
- weather_data: Array of weather data points from fetch_marine_weather:
  [
    {
      datetime: "ISO 8601 format",
      weather: {
        wave_height_m: number
        wind_speed_knots: number
        wind_direction_deg: number (0-360)
        sea_state: string
      },
      position: {lat, lon} (optional)
    },
    ...
  ]
- base_consumption_mt: Base fuel consumption estimate in metric tons
- vessel_heading_deg: Average vessel heading in degrees (0-360)
- fuel_type_breakdown: Optional breakdown by fuel type {VLSFO?: number, LSGO?: number}

Output:
- base_consumption_mt: Base consumption
- weather_adjusted_consumption_mt: Adjusted consumption
- additional_fuel_needed_mt: Additional fuel needed
- consumption_increase_percent: Percentage increase
- breakdown_by_fuel_type: Optional fuel type breakdown
- weather_alerts: Array of weather alerts for severe conditions
- voyage_weather_summary: Summary statistics

Use this tool with weather data from fetch_marine_weather to calculate weather impact on fuel consumption.`,
    schema: weatherConsumptionInputSchema,
  }
);

/**
 * Port Weather Check Tool
 * 
 * Checks if bunker ports have safe weather conditions for bunkering.
 */
export const checkPortWeatherTool = tool(
  async (input) => {
    const cid = getCorrelationId() || generateCorrelationId();
    const t0 = Date.now();
    logToolCall('check_bunker_port_weather', cid, sanitizeToolInput(input), undefined, 0, 'started');
    console.log('⚓ [BUNKER-AGENT] Executing check_bunker_port_weather');
    try {
      const result = await checkPortWeatherBreaker.fire(input);
      logToolCall('check_bunker_port_weather', cid, sanitizeToolInput(input), sanitizeToolOutput(result), Date.now() - t0, 'success');
      return JSON.stringify(result);
    } catch (error: any) {
      logToolCall('check_bunker_port_weather', cid, sanitizeToolInput(input), { error: error.message }, Date.now() - t0, 'failed');
      console.error('❌ [BUNKER-AGENT] Port weather error:', error.message);
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: 'check_bunker_port_weather',
    description: `Check if bunker ports have safe weather conditions for bunkering operations.

This tool:
- Fetches weather forecasts for port locations
- Evaluates conditions during the bunkering window
- Classifies weather risk (Low, Medium, High)
- Determines bunkering feasibility
- Optionally finds next safe window if current is unsafe

Input:
- bunker_ports: Array of bunker ports to check:
  [
    {
      port_code: string (UNLOCODE format)
      port_name: string
      lat: number
      lon: number
      estimated_arrival: "ISO 8601 format"
      bunkering_duration_hours: number (optional, default: 8)
    },
    ...
  ]

Output:
- Array of port weather assessments with:
  - port_code, port_name: Port identification
  - bunkering_feasible: boolean (true if safe)
  - weather_risk: "Low" | "Medium" | "High"
  - weather_during_bunkering: {
      arrival_time: string
      bunkering_window_hours: number
      avg_wave_height_m: number
      max_wave_height_m: number (must be ≤ 1.5m for safe)
      avg_wind_speed_kt: number
      max_wind_speed_kt: number (must be ≤ 25kt for safe)
      conditions: "Excellent" | "Good" | "Marginal" | "Unsafe"
    }
  - recommendation: Human-readable recommendation
  - next_good_window: Optional next safe window if current is unsafe

Safety Limits:
- Max wave height: 1.5m
- Max wind speed: 25 knots
- Both limits must be satisfied for "safe" classification

Use this tool to check weather conditions at bunker ports before making final recommendations.`,
    schema: portWeatherInputSchema,
  }
);

// ============================================================================
// Bunker Agent Tools
// ============================================================================

/**
 * Find Bunker Ports Tool
 * 
 * Finds bunker ports along a maritime route.
 */
export const findBunkerPortsTool = tool(
  async (input) => {
    const cid = getCorrelationId() || generateCorrelationId();
    const t0 = Date.now();
    logToolCall('find_bunker_ports', cid, sanitizeToolInput(input), undefined, 0, 'started');
    console.log('🔍 [BUNKER-AGENT] Executing find_bunker_ports');
    console.log('🔍 [BUNKER-AGENT] Input received:', JSON.stringify(input).substring(0, 200));
    try {
      const result = await findBunkerPortsBreaker.fire(input);
      logToolCall('find_bunker_ports', cid, sanitizeToolInput(input), sanitizeToolOutput(result), Date.now() - t0, 'success');
      return JSON.stringify(result);
    } catch (error: any) {
      logToolCall('find_bunker_ports', cid, sanitizeToolInput(input), { error: error.message }, Date.now() - t0, 'failed');
      console.error('❌ [BUNKER-AGENT] Port finder error:', error.message);
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: 'find_bunker_ports',
    description: `Find bunker ports along a maritime route within a specified deviation distance.

This tool:
- Calculates distances from route waypoints to available ports
- Uses Haversine formula for accurate distance calculations
- Returns ports sorted by distance from route
- Includes port capabilities and fuel types

IMPORTANT: This tool requires the route waypoints from the calculate_route tool result.

Input:
- route_waypoints: Array of waypoint coordinates from calculate_route result:
  [
    {"lat": number, "lon": number},
    ...
  ]
- max_deviation_nm: Maximum deviation distance in nautical miles (default: 150)

Output:
- ports: Array of found ports with:
  - port: {
      port_code: string
      name: string
      country: string
      coordinates: {lat, lon}
      fuel_capabilities: ["VLSFO", "LSGO", "MGO"]
    }
  - distance_from_route_nm: Distance from nearest waypoint
  - nearest_waypoint_index: Index of nearest waypoint
  - nearest_waypoint: {lat, lon}
- waypoints_analyzed: Number of waypoints analyzed
- max_deviation_nm: Maximum deviation used
- total_ports_found: Total number of ports found

Example:
Extract the "waypoints" array from calculate_route result and pass it as "route_waypoints":
{
  "route_waypoints": [{"lat": 1.29, "lon": 103.85}, {"lat": 25.02, "lon": 55.03}],
  "max_deviation_nm": 150
}

Use this tool after calculate_route to find bunker ports along the route.`,
    schema: portFinderInputSchema,
  }
);

/**
 * Get Fuel Prices Tool
 * 
 * Fetches current fuel prices for specified ports.
 */
export const getFuelPricesTool = tool(
  async (input) => {
    const cid = getCorrelationId() || generateCorrelationId();
    const t0 = Date.now();
    logToolCall('get_fuel_prices', cid, sanitizeToolInput(input), undefined, 0, 'started');
    console.log('💰 [BUNKER-AGENT] Executing get_fuel_prices');
    try {
      const result = await getFuelPricesBreaker.fire(input);
      logToolCall('get_fuel_prices', cid, sanitizeToolInput(input), sanitizeToolOutput(result), Date.now() - t0, 'success');
      return JSON.stringify(result);
    } catch (error: any) {
      logToolCall('get_fuel_prices', cid, sanitizeToolInput(input), { error: error.message }, Date.now() - t0, 'failed');
      console.error('❌ [BUNKER-AGENT] Price fetcher error:', error.message);
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: 'get_fuel_prices',
    description: `Fetch current fuel prices for specified ports.

This tool:
- Retrieves prices for VLSFO, LSGO, and MGO fuel types
- Includes price freshness indicators
- Returns prices in USD per metric ton
- Handles multiple ports in a single call

Input:
- port_codes: Array of port codes in UNLOCODE format:
  ["SGSIN", "NLRTM", ...]
- fuel_types: Optional array of fuel types to fetch (default: all types):
  ["VLSFO", "LSGO", "MGO"]

Output:
- prices_by_port: Object mapping port codes to price arrays:
  {
    "SGSIN": [
      {
        price: {
          port_code: string
          fuel_type: "VLSFO" | "LSGO" | "MGO"
          price_per_mt: number (USD)
          currency: "USD"
          last_updated: "ISO 8601 format"
        }
        is_fresh: boolean
      },
      ...
    ],
    ...
  }

Use this tool with port codes from find_bunker_ports to get current fuel prices.`,
    schema: priceFetcherInputSchema,
  }
);

/**
 * Analyze Bunker Options Tool
 * 
 * Analyzes and ranks bunker port options based on total cost.
 */
export const analyzeBunkerOptionsTool = tool(
  async (input) => {
    const cid = getCorrelationId() || generateCorrelationId();
    const t0 = Date.now();
    logToolCall('analyze_bunker_options', cid, sanitizeToolInput(input), undefined, 0, 'started');
    console.log('📊 [BUNKER-AGENT] Executing analyze_bunker_options');
    try {
      const result = await analyzeBunkerOptionsBreaker.fire(input);
      logToolCall('analyze_bunker_options', cid, sanitizeToolInput(input), sanitizeToolOutput(result), Date.now() - t0, 'success');
      return JSON.stringify(result);
    } catch (error: any) {
      logToolCall('analyze_bunker_options', cid, sanitizeToolInput(input), { error: error.message }, Date.now() - t0, 'failed');
      console.error('❌ [BUNKER-AGENT] Bunker analyzer error:', error.message);
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: 'analyze_bunker_options',
    description: `Analyze and rank bunker port options based on total cost (fuel cost + deviation cost).

This tool:
- Calculates total cost including fuel cost and deviation cost
- Ranks ports by total cost (cheapest first)
- Calculates potential savings vs worst option
- Provides detailed cost breakdown for each option

Input:
- bunker_ports: Array of found ports from find_bunker_ports
- port_prices: Price data from get_fuel_prices
- fuel_quantity_mt: Fuel quantity needed in metric tons
- fuel_type: Optional fuel type ("VLSFO", "LSGO", "MGO")
- vessel_speed_knots: Optional vessel speed for deviation time calculation (default: 14)
- vessel_consumption_mt_per_day: Optional consumption for deviation fuel cost (default: 35)

Output:
- recommendations: Array of ranked recommendations:
  [
    {
      port_code: string
      port_name: string
      distance_from_route_nm: number
      fuel_cost_usd: number
      deviation_cost_usd: number
      total_cost_usd: number
      rank: number (1 = best/cheapest)
      savings_vs_worst_usd: number
    },
    ...
  ]
- best_option: Best (cheapest) option
- worst_option: Worst (most expensive) option
- max_savings_usd: Maximum potential savings
- analysis_summary: Human-readable summary

Use this tool with ports from find_bunker_ports and prices from get_fuel_prices to get ranked recommendations.`,
    schema: bunkerAnalyzerInputSchema,
  }
);

// ============================================================================
// Vessel Performance Tools (Machinery Performance Agent)
// ============================================================================

/**
 * Fetch Noon Report Tool
 *
 * Fetches latest noon report data including position, ROB, and vessel status.
 */
export const fetchNoonReportTool = tool(
  async (input) => {
    const cid = getCorrelationId() || generateCorrelationId();
    const t0 = Date.now();
    logToolCall('fetch_noon_report', cid, sanitizeToolInput(input), undefined, 0, 'started');
    console.log('📋 [VESSEL-AGENT] Executing fetch_noon_report');
    try {
      const result = await fetchNoonReportBreaker.fire(input);
      logToolCall('fetch_noon_report', cid, sanitizeToolInput(input), sanitizeToolOutput(result), Date.now() - t0, 'success');
      return JSON.stringify(result);
    } catch (error: any) {
      logToolCall('fetch_noon_report', cid, sanitizeToolInput(input), { error: error.message }, Date.now() - t0, 'failed');
      console.error('❌ [VESSEL-AGENT] Noon report fetch error:', error.message);
      return JSON.stringify({
        success: false,
        error: error.message,
        vessel_identifiers: (input as any)?.vessel_identifiers,
        message: 'Failed to fetch noon report. API may be unavailable.',
      });
    }
  },
  {
    name: 'fetch_noon_report',
    description: `Fetch the latest noon report for a vessel by IMO number or vessel name.

Returns comprehensive vessel status including:
- Current position (latitude/longitude)
- Next port of call and ETA
- Remaining on Board (ROB) fuel quantities (VLSFO, LSMGO, etc.)
- Current speed in knots
- Weather conditions (if available)
- Distance to next port

Use this tool when you need:
- Real-time vessel position
- Current fuel levels (ROB)
- Vessel route/destination information
- Recent operational data

Input: Vessel IMO number OR vessel name (at least one required)
Output: Noon report data with quality metrics, or error if vessel not found`,
    schema: noonReportFetcherInputSchema,
  }
);

/**
 * Fetch Vessel Specs Tool
 *
 * Fetches vessel master data including type, DWT, flag, and build information.
 */
export const fetchVesselSpecsTool = tool(
  async (input) => {
    const cid = getCorrelationId() || generateCorrelationId();
    const t0 = Date.now();
    logToolCall('fetch_vessel_specs', cid, sanitizeToolInput(input), undefined, 0, 'started');
    console.log('📋 [VESSEL-AGENT] Executing fetch_vessel_specs');
    try {
      const result = await fetchVesselSpecsBreaker.fire(input);
      logToolCall('fetch_vessel_specs', cid, sanitizeToolInput(input), sanitizeToolOutput(result), Date.now() - t0, 'success');
      return JSON.stringify(result);
    } catch (error: any) {
      logToolCall('fetch_vessel_specs', cid, sanitizeToolInput(input), { error: error.message }, Date.now() - t0, 'failed');
      console.error('❌ [VESSEL-AGENT] Vessel spec fetch error:', error.message);
      return JSON.stringify({
        success: false,
        error: error.message,
        vessel_identifier: (input as any)?.vessel_identifier,
        message: 'Failed to fetch vessel specifications. API may be unavailable.',
      });
    }
  },
  {
    name: 'fetch_vessel_specs',
    description: `Fetch vessel master data and specifications by IMO or vessel name.

Returns vessel information including:
- Vessel name and IMO number
- Vessel type (e.g., Bulk Carrier, Container Ship, Tanker)
- Deadweight tonnage (DWT)
- Flag state
- Build year
- Operator/manager company (if available)

Use this tool when you need:
- Basic vessel identification information
- Vessel type and size specifications
- Vessel age and flag information
- Context about the vessel for analysis

Input: Vessel IMO number OR vessel name (at least one required)
Output: Vessel specification data, or error if vessel not found`,
    schema: vesselSpecFetcherInputSchema,
  }
);

/**
 * Fetch Consumption Profile Tool
 *
 * Fetches vessel fuel consumption profiles at different speeds and weather conditions.
 */
export const fetchConsumptionProfileTool = tool(
  async (input) => {
    const cid = getCorrelationId() || generateCorrelationId();
    const t0 = Date.now();
    logToolCall('fetch_consumption_profile', cid, sanitizeToolInput(input), undefined, 0, 'started');
    console.log('⛽ [VESSEL-AGENT] Executing fetch_consumption_profile');
    try {
      const result = await fetchConsumptionProfileBreaker.fire(input);
      logToolCall('fetch_consumption_profile', cid, sanitizeToolInput(input), sanitizeToolOutput(result), Date.now() - t0, 'success');
      return JSON.stringify(result);
    } catch (error: any) {
      logToolCall('fetch_consumption_profile', cid, sanitizeToolInput(input), { error: error.message }, Date.now() - t0, 'failed');
      console.error('❌ [VESSEL-AGENT] Consumption profile fetch error:', error.message);
      return JSON.stringify({
        success: false,
        error: error.message,
        imo: (input as any)?.imo,
        message: 'Failed to fetch consumption profiles. API may be unavailable.',
      });
    }
  },
  {
    name: 'fetch_consumption_profile',
    description: `Fetch vessel fuel consumption profiles showing consumption rates at different operating conditions.

Returns consumption data including:
- Main engine consumption (MT/day) by fuel grade
- Auxiliary engine consumption (MT/day) by fuel grade
- Consumption at specific speeds
- Consumption under different weather conditions (calm, moderate, rough, very rough)
- Ballast vs laden consumption differences

Use this tool when you need to:
- Predict fuel consumption for a voyage
- Calculate fuel endurance (how long current ROB will last)
- Compare actual vs expected consumption
- Optimize vessel speed for fuel efficiency
- Identify consumption anomalies

Input: Vessel IMO (required), optional filters for speed, weather, and load condition
Output: Array of consumption profiles matching the criteria`,
    schema: consumptionProfileFetcherInputSchema,
  }
);

// ============================================================================
// Tool Exports by Agent
// ============================================================================

/**
 * Route Agent Tools
 * 
 * Tools for route calculation and vessel timeline generation.
 */
export const routeAgentTools = [calculateRouteTool, calculateWeatherTimelineTool];

/**
 * Weather Agent Tools
 * 
 * Tools for weather forecasting and consumption analysis.
 */
export const weatherAgentTools = [
  fetchMarineWeatherTool,
  calculateWeatherConsumptionTool,
  checkPortWeatherTool,
];

/**
 * Bunker Agent Tools - DEPRECATED
 *
 * Bunker agent is now deterministic and calls these functions directly.
 * Keeping exports for backward compatibility and reference.
 *
 * The bunker agent workflow now uses:
 * - executePortFinderTool() directly
 * - executePortWeatherTool() directly
 * - executePriceFetcherTool() directly
 * - executeBunkerAnalyzerTool() directly
 */
export const bunkerAgentTools: any[] = []; // Empty - bunker agent doesn't use tool binding

/**
 * Vessel Performance Tools (Machinery Performance Agent, Hull Performance Agent)
 */
export const vesselPerformanceAgentTools = [
  fetchNoonReportTool,
  fetchVesselSpecsTool,
  fetchConsumptionProfileTool,
];

/**
 * All Tools (for reference)
 *
 * Combined array of all tools across all agents.
 */
export const allTools = [
  ...routeAgentTools,
  ...weatherAgentTools,
  ...bunkerAgentTools,
  ...vesselPerformanceAgentTools,
];

