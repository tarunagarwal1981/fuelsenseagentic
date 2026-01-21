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
import type { ECAZoneValidatorOutput } from '../tools/eca-zone-validator';
import type { FormattedResponse } from '../formatters/response-formatter';
import type { ROBTrackingOutput, ROBWaypoint } from '@/lib/engines/rob-tracking-engine';
import type { ECAConsumptionOutput } from '@/lib/engines/eca-consumption-engine';
import type { VesselProfile } from '@/lib/services/vessel-service';

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
  compliance_agent?: {
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
 * Compliance data for ECA and regulatory requirements
 */
export interface ComplianceData {
  eca_zones: ECAZoneValidatorOutput;
  // Future: EU ETS, FuelEU, CII will be added here
}

/**
 * Vessel consumption profile
 */
export interface VesselConsumptionProfile {
  main_engine_mt_per_day: number;
  auxiliary_mt_per_day: number;
  boiler_mt_per_day?: number;
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
// Multi-Port Bunker Types (Phase 1: 2-stop maximum)
// ============================================================================

/**
 * Fuel quantity by type
 */
export interface FuelQuantityMT {
  VLSFO: number;
  LSMGO: number;
}

/**
 * A single bunker stop in a multi-port plan
 */
export interface MultiBunkerStop {
  /** Port code (e.g., 'SGSIN') */
  port_code: string;
  /** Port name (e.g., 'Singapore') */
  port_name: string;
  /** Position on route - departure (origin) or midpoint (en-route) */
  position_on_route: 'departure' | 'midpoint';
  /** Segment index: -1 for departure (before first segment), or index of segment after which to bunker */
  segment_index: number;
  /** Distance along route in nautical miles (0 for departure) */
  distance_along_route_nm: number;
  /** Deviation from main route in nautical miles */
  deviation_nm: number;
  /** Fuel quantity to bunker at this stop */
  bunker_quantity: FuelQuantityMT;
  /** ROB when arriving at this port (before bunkering) */
  arrival_rob: FuelQuantityMT;
  /** ROB after bunkering (departure from this port) */
  departure_rob: FuelQuantityMT;
  /** Estimated cost at this stop in USD */
  estimated_cost_usd: number;
  /** Fuel prices at this port */
  fuel_prices: {
    VLSFO: number;
    LSMGO: number;
  };
  /** Estimated arrival time at this port */
  estimated_arrival?: string;
}

/**
 * A complete multi-port bunker plan (2-stop maximum in Phase 1)
 */
export interface MultiBunkerPlan {
  /** Array of bunker stops (departure + mid-voyage) */
  stops: MultiBunkerStop[];
  /** Total cost across all stops in USD */
  total_cost_usd: number;
  /** Final ROB at destination */
  final_rob: FuelQuantityMT;
  /** Whether this plan results in safe voyage (ROB >= safety margin at all points) */
  is_safe: boolean;
  /** Rank (1 = best/cheapest) */
  rank: number;
  /** Savings vs worst multi-port option */
  savings_vs_worst?: number;
  /** Limitation note for user */
  limitation_note: string;
  /** Comparison to single-port (if capacity allowed) */
  comparison_to_single_port?: {
    single_port_cost_if_possible: number;
    cost_difference_usd: number;
    cost_increase_percent: number;
  };
}

/**
 * Complete multi-port bunker analysis result
 */
export interface MultiBunkerAnalysis {
  /** Whether multi-port bunkering is required (voyage consumption > capacity) */
  required: boolean;
  /** Reason multi-port is needed (human readable) */
  reason?: string;
  /** Detailed capacity constraint info */
  capacity_constraint?: {
    voyage_consumption_mt: FuelQuantityMT;
    vessel_capacity_mt: FuelQuantityMT;
    shortfall_mt: FuelQuantityMT;
  };
  /** Ranked multi-port plans (top 3) */
  plans: MultiBunkerPlan[];
  /** Best (cheapest safe) plan */
  best_plan?: MultiBunkerPlan;
  /** Error message if no valid plans found */
  error_message?: string;
  /** Timestamp of analysis */
  analyzed_at?: string;
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
   * Agent call counts for circuit breaker (tracks consecutive calls per agent)
   */
  agent_call_counts: Annotation<Record<string, number>>({
    reducer: (x, y) => {
      // Merge counts, new values overwrite old
      const result = { ...(x || {}), ...(y || {}) };
      return result;
    },
    default: () => ({
      route_agent: 0,
      weather_agent: 0,
      bunker_agent: 0,
    }),
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

  /**
   * Standalone port weather data (for queries like "weather at Singapore port")
   * This is separate from weather_forecast which is for route-based weather
   */
  standalone_port_weather: Annotation<{
    port_code: string;
    port_name: string;
    coordinates: { lat: number; lon: number };
    target_date: string;
    forecast: {
      temperature_2m?: number;
      wind_speed_10m?: number;
      wind_direction?: number;
      wave_height?: number;
      wave_period?: number;
      sea_state?: string;
      conditions?: string;
      visibility?: number;
    };
    hourly_forecast?: Array<{
      datetime: string;
      wave_height: number;
      wind_speed: number;
      conditions: string;
    }>;
  } | null>({
    reducer: (x, y) => {
      const result = y !== null && y !== undefined ? y : x;
      if (result) {
        console.log('🔄 Standalone port weather reducer: updating for', result.port_name);
      }
      return result;
    },
    default: () => null,
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

  /**
   * Multi-port bunker plan (when single stop is insufficient due to capacity constraints)
   * Phase 1: Maximum 2 stops (departure + 1 mid-voyage port)
   */
  multi_bunker_plan: Annotation<MultiBunkerAnalysis | null>({
    reducer: (x, y) => {
      const result = y !== null && y !== undefined ? y : x;
      if (result && result.required) {
        console.log(
          '🔄 Multi-bunker plan reducer: updating plan',
          result.plans?.length || 0,
          'options,',
          result.required ? 'REQUIRED' : 'not required'
        );
      }
      return result;
    },
    default: () => null,
  }),

  // ========================================================================
  // Compliance Agent State
  // ========================================================================

  /**
   * Compliance data including ECA zone validation
   */
  compliance_data: Annotation<ComplianceData | null>({
    reducer: (_, value) => value ?? null,
    default: () => null,
  }),

  /**
   * Vessel consumption profile for fuel calculations
   */
  vessel_consumption: Annotation<VesselConsumptionProfile | null>({
    reducer: (_, value) => value ?? null,
    default: () => null,
  }),

  // ========================================================================
  // ROB Tracking (Bunker Agent)
  // ========================================================================

  rob_tracking: Annotation<ROBTrackingOutput | null>({
    reducer: (x, y) => (y != null ? y : x),
    default: () => null,
  }),

  rob_waypoints: Annotation<ROBWaypoint[] | null>({
    reducer: (x, y) => (y != null ? y : x),
    default: () => null,
  }),

  rob_safety_status: Annotation<{
    overall_safe: boolean;
    minimum_rob_days: number;
    violations: string[];
  } | null>({
    reducer: (x, y) => (y != null ? y : x),
    default: () => null,
  }),

  // ========================================================================
  // ECA Consumption (Bunker Agent)
  // ========================================================================

  eca_consumption: Annotation<ECAConsumptionOutput | null>({
    reducer: (x, y) => (y != null ? y : x),
    default: () => null,
  }),

  eca_summary: Annotation<{
    eca_distance_nm: number;
    eca_percentage: number;
    total_vlsfo_mt: number;
    total_lsmgo_mt: number;
    segments_in_eca: number;
  } | null>({
    reducer: (x, y) => (y != null ? y : x),
    default: () => null,
  }),

  /**
   * Vessel name (extracted from query, used for ROB lookup)
   */
  vessel_name: Annotation<string | null>({
    reducer: (x, y) => (y != null ? y : x),
    default: () => null,
  }),

  /**
   * Vessel profile from database (ROB, capacity, consumption, fouling)
   */
  vessel_profile: Annotation<VesselProfile | null>({
    reducer: (x, y) => (y != null ? y : x),
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

  /**
   * Formatted response with structured data (optional, for enhanced UI)
   */
  formatted_response: Annotation<FormattedResponse | null>({
    reducer: (_, value) => value ?? null,
    default: () => null,
  }),

  /**
   * Synthesized insights from multi-agent analysis (generated by finalizer's synthesis phase)
   */
  synthesized_insights: Annotation<{
    // Query type classification
    query_type: 'informational' | 'decision-required' | 'validation' | 'comparison';
    
    // Type-specific responses
    response: {
      informational?: {
        answer: string;
        key_facts: string[];
        additional_context?: string;
      };
      decision?: {
        action: string;
        primary_metric: string;
        risk_level: 'safe' | 'caution' | 'critical';
        confidence: number;
      };
      validation?: {
        result: 'feasible' | 'not_feasible' | 'risky';
        explanation: string;
        consequence?: string;
        alternative?: string;
      };
      comparison?: {
        winner: string;
        winner_reason: string;
        runner_up?: string;
        comparison_factors: string[];
      };
    };
    
    // Strategic priorities (for decision/validation only)
    strategic_priorities: Array<{
      priority: 1 | 2 | 3;
      action: string;
      why: string;  // Changed from 'rationale'
      impact: string;
      urgency: 'immediate' | 'today' | 'this_week';
    }>;
    
    // Critical risks only (renamed from risk_alerts)
    critical_risks: Array<{
      risk: string;
      severity: 'critical' | 'high';
      consequence: string;
      mitigation: string;
    }>;
    
    // Filtering decisions
    details_to_surface: {
      show_multi_port_analysis: boolean;
      show_alternatives: boolean;
      show_rob_waypoints: boolean;
      show_weather_details: boolean;
      show_eca_details: boolean;
    };
    
    // Cross-agent connections
    cross_agent_connections: Array<{
      insight: string;
      agents_involved: string[];
      confidence: number;
    }>;
    
    // Hidden opportunities
    hidden_opportunities: Array<{
      opportunity: string;
      potential_value: string;
      effort_required: 'low' | 'medium' | 'high';
    }>;
    
    // Metadata with filtering rationale
    synthesis_metadata: {
      agents_analyzed: string[];
      synthesis_model: string;
      synthesis_timestamp: number;
      confidence_score: number;
      filtering_rationale: {
        why_surfaced: string[];
        why_hidden: string[];
      };
    };
  } | null>({
    reducer: (_, value) => value ?? null,
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
   * compliance_agent can be 'success' | 'failed'
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

