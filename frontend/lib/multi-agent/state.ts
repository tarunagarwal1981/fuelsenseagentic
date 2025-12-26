/**
 * Multi-Agent State Definition
 * 
 * Defines the shared state for the multi-agent LangGraph system.
 * This state is used by all agents (Route, Weather, Bunker) and the supervisor
 * to coordinate the complete bunker optimization workflow.
 */

import { Annotation } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import type { Coordinates, Port, FuelType } from '@/lib/types';
import type { PriceFetcherOutput } from '@/lib/tools/price-fetcher';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Agent context passed from supervisor to agents
 * Contains intent-based instructions for each agent
 */
export interface AgentContext {
  route_agent?: {
    /** Whether weather timeline is needed (for weather/bunker queries) */
    needs_weather_timeline: boolean;
    /** Whether port information is needed (for bunker queries) */
    needs_port_info?: boolean;
    /** Tool names this agent should bind (from supervisor plan) */
    required_tools: string[];
    /** Task description from supervisor */
    task_description: string;
    /** Priority level for this agent's work */
    priority: 'critical' | 'important' | 'optional';
  };
  weather_agent?: {
    /** Whether weather consumption calculation is needed (for bunker planning) */
    needs_consumption: boolean;
    /** Whether port weather check is needed (if bunker ports exist) */
    needs_port_weather: boolean;
    /** Tool names this agent should bind (from supervisor plan) */
    required_tools: string[];
    /** Task description from supervisor */
    task_description: string;
    /** Priority level for this agent's work */
    priority: 'critical' | 'important' | 'optional';
  };
  bunker_agent?: {
    /** Whether weather consumption is needed for accurate bunker analysis */
    needs_weather_consumption: boolean;
    /** Whether port weather check is needed */
    needs_port_weather: boolean;
    /** Tool names this agent should bind (from supervisor plan) */
    required_tools: string[];
    /** Task description from supervisor */
    task_description: string;
    /** Priority level for this agent's work */
    priority: 'critical' | 'important' | 'optional';
  };
  finalize: {
    /** Query complexity level */
    complexity: 'low' | 'medium' | 'high';
    /** Whether weather analysis is needed in final response */
    needs_weather_analysis: boolean;
    /** Whether bunker analysis is needed in final response */
    needs_bunker_analysis: boolean;
  };
}

/**
 * Route data from route calculation
 */
export interface RouteData {
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
  /** Flag indicating if route came from cache */
  _from_cache?: boolean;
}

/**
 * Vessel position from weather timeline
 */
export interface VesselPosition {
  /** Latitude in decimal degrees */
  lat: number;
  /** Longitude in decimal degrees */
  lon: number;
  /** Datetime at this position (ISO 8601 format) */
  datetime: string;
  /** Cumulative distance from start in nautical miles */
  distance_from_start_nm: number;
  /** Index of the route segment this position belongs to */
  segment_index: number;
}

/**
 * Weather point from marine weather forecast
 */
export interface WeatherPoint {
  /** Position coordinates */
  position: Coordinates;
  /** Datetime for this forecast */
  datetime: string;
  /** Weather data */
  weather: {
    /** Wave height in meters */
    wave_height_m: number;
    /** Wind speed in knots */
    wind_speed_knots: number;
    /** Wind direction in degrees (0-360) */
    wind_direction_deg: number;
    /** Sea state classification */
    sea_state: string;
  };
  /** Forecast confidence level */
  forecast_confidence: 'high' | 'medium' | 'low';
}

/**
 * Weather consumption analysis
 */
export interface WeatherConsumption {
  /** Base consumption estimate */
  base_consumption_mt: number;
  /** Weather-adjusted consumption */
  weather_adjusted_consumption_mt: number;
  /** Additional fuel needed due to weather */
  additional_fuel_needed_mt: number;
  /** Consumption increase as percentage */
  consumption_increase_percent: number;
  /** Optional breakdown by fuel type */
  breakdown_by_fuel_type?: {
    VLSFO?: {
      base: number;
      adjusted: number;
    };
    LSGO?: {
      base: number;
      adjusted: number;
    };
  };
  /** Weather alerts for severe conditions */
  weather_alerts: Array<{
    location?: Coordinates;
    datetime: string;
    severity: 'warning' | 'severe';
    description: string;
    wave_height_m: number;
    wind_speed_knots: number;
  }>;
  /** Voyage weather summary */
  voyage_weather_summary: {
    avg_wave_height_m: number;
    max_wave_height_m: number;
    avg_multiplier: number;
    worst_conditions_date: string;
  };
}

/**
 * Port weather status from port weather check
 */
export interface PortWeatherStatus {
  /** Port code */
  port_code: string;
  /** Port name */
  port_name: string;
  /** Whether bunkering is feasible */
  bunkering_feasible: boolean;
  /** Weather risk level */
  weather_risk: 'Low' | 'Medium' | 'High';
  /** Weather conditions during bunkering */
  weather_during_bunkering: {
    arrival_time: string;
    bunkering_window_hours: number;
    avg_wave_height_m: number;
    max_wave_height_m: number;
    avg_wind_speed_kt: number;
    max_wind_speed_kt: number;
    conditions: string;
  };
  /** Human-readable recommendation */
  recommendation: string;
  /** Optional next good window if current is unsafe */
  next_good_window?: {
    starts_at: string;
    duration_hours: number;
  };
}

/**
 * Port price information
 */
export interface PortPrice {
  /** Port code */
  port_code: string;
  /** Port name */
  port_name: string;
  /** Fuel prices by type */
  prices: {
    VLSFO?: number;
    LSGO?: number;
    MGO?: number;
  };
  /** Currency code (e.g., 'USD', 'EUR') */
  currency: string;
  /** Timestamp of when this price was last updated (ISO 8601 format) */
  last_updated: string;
  /** Whether price is considered stale (> 24 hours) */
  is_stale?: boolean;
}

/**
 * Bunker analysis result
 */
export interface BunkerAnalysis {
  /** All recommendations ranked by total cost */
  recommendations: Array<{
    port_code: string;
    port_name: string;
    distance_from_route_nm: number;
    fuel_cost_usd: number;
    deviation_cost_usd: number;
    total_cost_usd: number;
    rank: number;
    savings_vs_worst_usd?: number;
  }>;
  /** Best (cheapest) option */
  best_option: {
    port_code: string;
    port_name: string;
    distance_from_route_nm: number;
    fuel_cost_usd: number;
    deviation_cost_usd: number;
    total_cost_usd: number;
    rank: number;
    savings_vs_worst_usd?: number;
  };
  /** Worst (most expensive) option */
  worst_option: {
    port_code: string;
    port_name: string;
    distance_from_route_nm: number;
    fuel_cost_usd: number;
    deviation_cost_usd: number;
    total_cost_usd: number;
    rank: number;
    savings_vs_worst_usd?: number;
  };
  /** Maximum potential savings */
  max_savings_usd: number;
  /** Human-readable analysis summary */
  analysis_summary: string;
}

// ============================================================================
// LangGraph State Annotation
// ============================================================================

/**
 * Multi-Agent State Annotation
 * 
 * Defines the shared state structure for the multi-agent system.
 * Uses LangGraph Annotation with reducer functions for state updates.
 */
export const MultiAgentStateAnnotation = Annotation.Root({
  // ========================================================================
  // Core State (Supervisor)
  // ========================================================================
  
  /**
   * Conversation history - messages are concatenated
   */
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),

  /**
   * Next agent to route to (supervisor's decision)
   */
  next_agent: Annotation<string>({
    reducer: (x, y) => {
      // New value overwrites old
      const result = y !== null && y !== undefined ? y : x;
      if (result) {
        console.log('🔄 Next agent reducer: routing to', result);
      }
      return result;
    },
    default: () => '',
  }),

  /**
   * Agent context with intent-based instructions
   * Set by supervisor, read by agents to determine tool usage
   */
  agent_context: Annotation<AgentContext | null>({
    reducer: (x, y) => {
      // New value overwrites old if provided
      const result = y !== null && y !== undefined ? y : x;
      if (result) {
        console.log('🔄 Agent context reducer: updating context');
      }
      return result;
    },
    default: () => null,
  }),

  /**
   * Selected cached route ID (from UI route selector)
   */
  selected_route_id: Annotation<string | null>({
    reducer: (x, y) => {
      // New value overwrites old if provided
      const result = y !== null && y !== undefined ? y : x;
      return result;
    },
    default: () => null,
  }),

  // ========================================================================
  // Route Agent State
  // ========================================================================

  /**
   * Route data from route calculation
   */
  route_data: Annotation<RouteData | null>({
    reducer: (x, y) => {
      // New value overwrites old if provided
      const result = y !== null && y !== undefined ? y : x;
      if (result) {
        console.log(
          '🔄 Route data reducer: updating route',
          result.origin_port_code,
          '->',
          result.destination_port_code
        );
      }
      return result;
    },
    default: () => null,
  }),

  /**
   * Vessel timeline positions from weather timeline tool
   */
  vessel_timeline: Annotation<VesselPosition[] | null>({
    reducer: (x, y) => {
      // New value overwrites old if provided
      const result = y !== null && y !== undefined ? y : x;
      if (result) {
        console.log('🔄 Vessel timeline reducer: updating timeline', result.length, 'positions');
      }
      return result;
    },
    default: () => null,
  }),

  // ========================================================================
  // Weather Agent State
  // ========================================================================

  /**
   * Weather forecast data from marine weather tool
   */
  weather_forecast: Annotation<WeatherPoint[] | null>({
    reducer: (x, y) => {
      // New value overwrites old if provided
      const result = y !== null && y !== undefined ? y : x;
      if (result) {
        console.log('🔄 Weather forecast reducer: updating forecast', result.length, 'points');
      }
      return result;
    },
    default: () => null,
  }),

  /**
   * Weather-adjusted consumption analysis
   */
  weather_consumption: Annotation<WeatherConsumption | null>({
    reducer: (x, y) => {
      // New value overwrites old if provided
      const result = y !== null && y !== undefined ? y : x;
      if (result) {
        console.log(
          '🔄 Weather consumption reducer: updating consumption',
          result.consumption_increase_percent.toFixed(2),
          '% increase'
        );
      }
      return result;
    },
    default: () => null,
  }),

  /**
   * Port weather status from port weather check
   */
  port_weather_status: Annotation<PortWeatherStatus[] | null>({
    reducer: (x, y) => {
      // New value overwrites old if provided
      const result = y !== null && y !== undefined ? y : x;
      if (result) {
        console.log('🔄 Port weather status reducer: updating status', result.length, 'ports');
      }
      return result;
    },
    default: () => null,
  }),

  /**
   * Flag indicating weather agent returned partial data (timeout or partial failure)
   */
  weather_agent_partial: Annotation<boolean>({
    reducer: (x, y) => {
      // New value overwrites old if provided
      return y !== null && y !== undefined ? y : x;
    },
    default: () => false,
  }),

  // ========================================================================
  // Bunker Agent State
  // ========================================================================

  /**
   * Bunker ports found along the route
   */
  bunker_ports: Annotation<Port[] | null>({
    reducer: (x, y) => {
      // New value overwrites old if provided
      const result = y !== null && y !== undefined ? y : x;
      if (result) {
        console.log('🔄 Bunker ports reducer: updating ports', result.length, 'ports');
      }
      return result;
    },
    default: () => null,
  }),

  /**
   * Port fuel prices
   * Stores PriceFetcherOutput format (with prices_by_port object)
   * This matches what the price fetcher tool returns and what bunker analyzer expects
   */
  port_prices: Annotation<PriceFetcherOutput | null>({
    reducer: (x, y) => {
      // New value overwrites old if provided
      const result = y !== null && y !== undefined ? y : x;
      if (result) {
        const portCount = result.prices_by_port ? Object.keys(result.prices_by_port).length : 0;
        console.log('🔄 Port prices reducer: updating prices', portCount, 'ports');
      }
      return result;
    },
    default: () => null,
  }),

  /**
   * Bunker analysis result
   */
  bunker_analysis: Annotation<BunkerAnalysis | null>({
    reducer: (x, y) => {
      // New value overwrites old if provided
      const result = y !== null && y !== undefined ? y : x;
      if (result) {
        console.log(
          '🔄 Bunker analysis reducer: updating analysis',
          result.recommendations?.length || 0,
          'recommendations'
        );
      }
      return result;
    },
    default: () => null,
  }),

  // ========================================================================
  // Final State
  // ========================================================================

  /**
   * Final recommendation from the complete analysis
   */
  final_recommendation: Annotation<string | null>({
    reducer: (x, y) => {
      // New value overwrites old if provided
      const result = y !== null && y !== undefined ? y : x;
      if (result) {
        console.log('🔄 Final recommendation reducer: updating recommendation');
      }
      return result;
    },
    default: () => null,
  }),

  // ========================================================================
  // Error Tracking (for graceful degradation)
  // ========================================================================

  /**
   * Agent errors - tracks which agents failed and why
   */
  agent_errors: Annotation<Record<string, { error: string; timestamp: number }>>({
    reducer: (x, y) => {
      // Merge errors, keeping existing ones unless overwritten
      return { ...x, ...y };
    },
    default: () => ({}),
  }),

  /**
   * Success status for each agent
   */
  agent_status: Annotation<Record<string, 'success' | 'failed' | 'skipped' | 'pending'>>({
    reducer: (x, y) => {
      // Merge status, keeping existing ones unless overwritten
      return { ...x, ...y };
    },
    default: () => ({}),
  }),
});

/**
 * Multi-Agent State Type
 * 
 * TypeScript type derived from the state annotation.
 * Use this type for type-safe state access in agents.
 */
export type MultiAgentState = typeof MultiAgentStateAnnotation.State;

// ============================================================================
// Type Exports
// ============================================================================

// Types are already exported above with their interface declarations
// No need for duplicate export type statement

