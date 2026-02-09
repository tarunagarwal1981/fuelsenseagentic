/**
 * Multi-Agent State Definition
 *
 * Defines the shared state for the multi-agent LangGraph system.
 * This state is used by all agents (Route, Weather, Bunker) and the supervisor
 * to coordinate the complete bunker optimization workflow.
 */

import { randomUUID } from 'crypto';
import { Annotation } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import type { Coordinates, Port, FuelType } from '@/lib/types';
import type { PriceFetcherOutput } from '@/lib/tools/price-fetcher';
import type { ECAZoneValidatorOutput } from '../tools/eca-zone-validator';
import type { FormattedResponse } from '../formatters/response-formatter';
import type { ROBTrackingOutput, ROBWaypoint } from '@/lib/engines/rob-tracking-engine';
import type { ECAConsumptionOutput } from '@/lib/engines/eca-consumption-engine';
import type { VesselProfile } from '@/lib/services/vessel-service';
import type {
  VesselBasicInfo,
  NoonReportData,
  ConsumptionProfile,
  VesselIdentifiers,
} from '@/lib/types/vessel-performance';

// ============================================================================
// Reasoning Types (Agentic Supervisor)
// ============================================================================

/**
 * A single step in the supervisor's reasoning chain (ReAct pattern)
 */
export interface ReasoningStep {
  /** Step number in the reasoning chain */
  step_number: number;
  /** The supervisor's thought process */
  thought: string;
  /** Action chosen based on reasoning */
  action: 'call_agent' | 'validate' | 'recover' | 'clarify' | 'finalize';
  /** Parameters for the action */
  action_params?: {
    agent?: string;
    recovery_action?: 'retry_agent' | 'skip_agent' | 'ask_user';
    question?: string;
    [key: string]: unknown;
  };
  /** Observation after action execution */
  observation?: string;
  /** Timestamp of this step */
  timestamp: Date;
}

/**
 * Next action decided by agentic supervisor
 */
export interface SupervisorNextAction {
  type: 'call_agent' | 'ask_user' | 'finalize' | 'recover';
  agent?: string;
  params?: Record<string, unknown>;
  question?: string;
}

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Routing metadata from intent classification.
 * Populated when query is classified (LLM or pattern match) for observability and debugging.
 */
export interface RoutingMetadata {
  /** Intent matched from query (e.g., 'vessel_list', 'bunker_planning') */
  matched_intent: string;
  /** Target agent selected by classification */
  target_agent: string;
  /** Classification confidence (0-100) */
  confidence: number;
  /** Method used for classification */
  classification_method: 'llm_intent_classifier' | 'pattern_match' | 'llm_reasoning';
  /** LLM reasoning for routing decision */
  reasoning: string;
  /** Timestamp of classification */
  classified_at: number;

  /** Latency of classification in milliseconds */
  latency_ms?: number;
  /** Whether result came from cache */
  cache_hit?: boolean;
  /** Cost of classification in USD (for LLM calls) */
  cost_usd?: number;
  /** Query hash for cache lookup */
  query_hash?: string;

  /** Parameters extracted by classifier */
  extracted_params?: {
    vessel_name?: string;
    imo?: string;
    origin_port?: string;
    destination_port?: string;
    date?: string;
    [key: string]: string | undefined;
  };
}

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
    /** Port overrides extracted by supervisor (origin/destination and optional coordinates) */
    port_overrides?: {
      origin?: string;
      destination?: string;
      origin_coordinates?: [number, number];
      destination_coordinates?: [number, number];
    };
    /** Vessel speed extracted by supervisor */
    vessel_speed?: number;
    /** Departure date extracted by supervisor */
    departure_date?: string;
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
    /** Port for port weather (from supervisor entity extraction) */
    port?: string;
    /** Date for weather forecast (from supervisor entity extraction) */
    date?: string;
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
    /** Fuel types extracted by supervisor */
    fuel_types?: Array<{ type: string; quantity?: number; unit?: string }>;
    /** Bunker ports extracted by supervisor */
    bunker_ports?: string[];
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
  /** Origin port display name (e.g. "Fujairah", "Port Clyde") when resolved from World Port / service */
  origin_port_name?: string;
  /** Destination port display name when resolved */
  destination_port_name?: string;
  /** Origin coordinates for map when port is not in ports.json (e.g. WPI_*) */
  origin_coordinates?: { lat: number; lon: number };
  /** Destination coordinates for map when port is not in ports.json */
  destination_coordinates?: { lat: number; lon: number };
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
// Vessel Selection Agent Types
// ============================================================================

/**
 * Next voyage details for vessel comparison
 * Populated by supervisor or entity extractor
 */
export interface NextVoyageDetails {
  origin: string;
  destination: string;
  departure_date?: string;
  speed?: number;
  /** Cargo condition: 'ballast' or 'laden' - affects consumption */
  cargo_type?: string;
}

/**
 * Per-vessel comparison analysis entry
 * Populated by Vessel Selection Agent for each vessel
 */
export interface VesselComparisonAnalysis {
  vessel_imo?: string;
  vessel_name?: string;
  planning_data?: unknown;
  projected_rob?: unknown;
  bunker_plan?: unknown;
  total_cost_usd?: number;
  feasibility?: 'feasible' | 'marginal' | 'infeasible';
  [key: string]: unknown;
}

/**
 * Aggregate vessel comparison analysis result
 * Contains full analysis output from Vessel Selection Agent
 */
export interface VesselComparisonAnalysisResult {
  /** Per-vessel analysis results (VesselAnalysisResult[]) */
  vessels_analyzed: unknown[];
  /** Vessels ranked by cost and feasibility */
  rankings: unknown[];
  /** Recommended vessel name (best option) */
  recommended_vessel: string;
  /** Human-readable summary of the comparison */
  analysis_summary: string;
  /** Comparison matrix: vessel -> metric -> value */
  comparison_matrix: Record<string, unknown>;
}

/**
 * Constraints for vessel selection filtering
 * Optional filters applied during vessel comparison
 */
export interface VesselSelectionConstraints {
  /** Maximum total bunker cost in USD - exclude vessels exceeding this */
  max_bunker_cost?: number;
  /** Maximum route deviation in nautical miles for bunker stops */
  max_deviation_nm?: number;
  /** Preferred bunker ports - prioritize these when ranking options */
  preferred_bunker_ports?: string[];
  /** Vessel names or IMOs to exclude from comparison */
  exclude_vessels?: string[];
}

/**
 * Vessel ranking by total cost
 */
export interface VesselRanking {
  rank: number;
  vessel_name: string;
  vessel_imo?: string;
  total_cost_usd: number;
  feasibility: 'feasible' | 'marginal' | 'infeasible';
  [key: string]: unknown;
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
   * Correlation ID for tracing a single request across all agent hops.
   * Persists in Redis checkpoints. Reducer keeps first ID (y || x).
   */
  correlation_id: Annotation<string>({
    reducer: (x, y) => y || x,
    default: () => randomUUID(),
  }),

  /**
   * Schema version for state versioning and migration support.
   * Used by checkpoint system to detect and migrate older state versions.
   */
  _schema_version: Annotation<string>({
    reducer: (_, update) => update || '2.0.0',
    default: () => '2.0.0',
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
   * Original user intent extracted from their query.
   * Persists through entire workflow to track what user actually wants.
   * Examples: 'bunker_planning', 'route_calculation', 'weather_analysis', 'vessel_info'
   * Used by isAllWorkComplete() to know when we're truly done (not just one step).
   */
  original_intent: Annotation<string | null>({
    reducer: (current, update) => (current != null && current !== '' ? current : (update ?? current)),
    default: () => null,
  }),

  /**
   * Routing metadata from intent classification (optional).
   * Won't exist in old state objects. Set when query is classified for observability.
   */
  routing_metadata: Annotation<RoutingMetadata | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
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
  // Vessel Performance (Hull Performance & Machinery Performance Agents)
  // ========================================================================

  /**
   * Extracted vessel identifiers from user query
   * Populated by Entity Extractor Agent
   */
  vessel_identifiers: Annotation<VesselIdentifiers | undefined>({
    reducer: (x, y) => (y != null ? y : x),
    default: () => undefined,
  }),

  /**
   * Fetched noon report data
   * Populated by tools or Machinery Performance Agent
   */
  noon_reports: Annotation<NoonReportData[] | undefined>({
    reducer: (x, y) => (y != null ? y : x),
    default: () => undefined,
  }),

  /**
   * Vessel consumption profiles
   * Populated by tools or Machinery Performance Agent
   */
  consumption_profiles: Annotation<ConsumptionProfile[] | undefined>({
    reducer: (x, y) => (y != null ? y : x),
    default: () => undefined,
  }),

  /**
   * Basic vessel information
   * Populated by vessel spec fetcher tool
   */
  vessel_specs: Annotation<VesselBasicInfo[] | undefined>({
    reducer: (x, y) => (y != null ? y : x),
    default: () => undefined,
  }),

  // ========================================================================
  // Vessel Selection Agent State
  // ========================================================================

  /**
   * Vessel names or IMOs to compare.
   * Populated by supervisor or VesselSelectionQueryParser from user query.
   */
  vessel_names: Annotation<string[] | undefined>({
    reducer: (x, y) => (y != null ? y : x),
    default: () => undefined,
  }),

  /**
   * Next voyage details (origin, destination, dates, speed).
   * Required for vessel comparison. Populated by supervisor or entity extractor.
   */
  next_voyage_details: Annotation<NextVoyageDetails | undefined>({
    reducer: (x, y) => (y != null ? y : x),
    default: () => undefined,
  }),

  /**
   * Aggregate vessel comparison analysis result.
   * Contains vessels_analyzed, rankings, recommended_vessel, analysis_summary, comparison_matrix.
   * Populated by Vessel Selection Agent when analysis completes.
   */
  vessel_comparison_analysis: Annotation<VesselComparisonAnalysisResult | undefined>({
    reducer: (x, y) => (y != null ? y : x),
    default: () => undefined,
  }),

  /**
   * Vessels ranked by total cost and feasibility.
   * Duplicated from vessel_comparison_analysis.rankings for convenient access.
   */
  vessel_rankings: Annotation<VesselRanking[] | undefined>({
    reducer: (x, y) => (y != null ? y : x),
    default: () => undefined,
  }),

  /**
   * Recommended vessel name (best option from comparison).
   * Duplicated from vessel_comparison_analysis.recommended_vessel for convenient access.
   */
  recommended_vessel: Annotation<string | undefined>({
    reducer: (x, y) => (y != null ? y : x),
    default: () => undefined,
  }),

  /**
   * Per-vessel bunker plans (vessel name/IMO -> bunker plan).
   * Only populated for vessels that require bunkering.
   */
  per_vessel_bunker_plans: Annotation<Record<string, unknown> | undefined>({
    reducer: (x, y) => (y != null ? y : x),
    default: () => undefined,
  }),

  /**
   * Vessel selection constraints (max cost, deviation, preferred ports, exclusions).
   * Populated by supervisor or VesselSelectionQueryParser from user query.
   */
  vessel_selection_constraints: Annotation<VesselSelectionConstraints | undefined>({
    reducer: (x, y) => (y != null ? y : x),
    default: () => undefined,
  }),

  /**
   * Vessel feasibility matrix (vessel -> feasibility status)
   */
  vessel_feasibility_matrix: Annotation<Record<string, 'feasible' | 'marginal' | 'infeasible'> | undefined>({
    reducer: (x, y) => (y != null ? y : x),
    default: () => undefined,
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
      /** Query classifier result for template selection (set by synthesis engine) */
      classification_result?: {
        queryType: string;
        confidence: number;
        method: string;
        reasoning: string;
      };
    };
  } | null>({
    reducer: (_, value) => value ?? null,
    default: () => null,
  }),

  /**
   * Decoupled synthesized response (NEW - separate from formatting)
   * Contains structured data, insights, recommendations, warnings, alerts
   * Can be formatted into multiple output formats (text, JSON, HTML, etc.)
   */
  synthesized_response: Annotation<any | null>({
    reducer: (_, value) => value ?? null,
    default: () => null,
  }),

  /**
   * Request context for template selection
   * Contains stakeholder, format preferences, and rendering options
   */
  request_context: Annotation<{
    stakeholder?: 'charterer' | 'operator' | 'compliance' | 'technical' | 'api';
    format?: 'text' | 'html' | 'json' | 'mobile';
    verbosity?: 'summary' | 'detailed' | 'full';
    includeMetrics?: boolean;
    includeReasoning?: boolean;
    headers?: {
      accept?: string;
      'user-agent'?: string;
    };
  } | null>({
    reducer: (_, value) => value ?? null,
    default: () => null,
  }),

  /**
   * Synthesis data (alias for synthesized_response, for API responses)
   */
  synthesis_data: Annotation<any | null>({
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

  /**
   * Degraded mode flag - indicates system is operating with reduced functionality
   */
  degraded_mode: Annotation<boolean>({
    reducer: (x, y) => {
      // Once degraded, stay degraded (true wins)
      return y !== null && y !== undefined ? (y || x) : x;
    },
    default: () => false,
  }),

  /**
   * List of missing data components that caused degraded mode
   */
  missing_data: Annotation<string[]>({
    reducer: (x, y) => {
      // Merge arrays, deduplicate
      if (!y || y.length === 0) return x || [];
      if (!x || x.length === 0) return y;
      return Array.from(new Set([...x, ...y]));
    },
    default: () => [],
  }),

  // ========================================================================
  // Execution Plan State (Plan-Based Orchestration)
  // ========================================================================

  /**
   * Execution plan generated by supervisor
   * Contains the complete workflow to execute with all stages
   */
  execution_plan: Annotation<{
    planId: string;
    queryType: string;
    workflowId: string;
    stages: Array<{
      stageId: string;
      agentId: string;
      order: number;
      required: boolean;
    }>;
    currentStageIndex: number;
    completedStages: string[];
    failedStages: string[];
  } | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  /**
   * Current stage index in execution plan (0-based)
   */
  workflow_stage: Annotation<number>({
    reducer: (_, update) => update ?? 0,
    default: () => 0,
  }),

  /**
   * Execution result from plan executor
   * Contains final metrics, costs, and errors after plan execution
   */
  execution_result: Annotation<{
    planId: string;
    success: boolean;
    durationMs: number;
    stagesCompleted: string[];
    stagesFailed: string[];
    stagesSkipped: string[];
    costs: {
      llmCalls: number;
      apiCalls: number;
      actualCostUSD: number;
    };
    errors: Array<{
      stageId: string;
      agentId: string;
      error: string;
    }>;
  } | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // ========================================================================
  // Agentic Supervisor State (ReAct Pattern)
  // ========================================================================

  /**
   * Reasoning history - tracks supervisor's thought process
   * Each step contains thought, action, and observation
   */
  reasoning_history: Annotation<ReasoningStep[]>({
    reducer: (current, update) => [...(current || []), ...update],
    default: () => [],
  }),

  /**
   * Current thought from supervisor's reasoning
   * Updated at each reasoning step
   */
  current_thought: Annotation<string | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  /**
   * Next action decided by agentic supervisor
   * Determines routing and behavior
   */
  next_action: Annotation<SupervisorNextAction | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  /**
   * Count of error recovery attempts
   * Used to prevent infinite recovery loops
   */
  recovery_attempts: Annotation<number>({
    reducer: (current, update) => (current || 0) + update,
    default: () => 0,
  }),

  /**
   * Flag indicating user clarification is needed
   * When true, finalize will generate a clarifying question
   */
  needs_clarification: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => false,
  }),

  /**
   * Clarification question to ask user (if needs_clarification is true)
   */
  clarification_question: Annotation<string | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // ========================================================================
  // Parameter Override System (Supervisor → Agent Communication)
  // ========================================================================

  /**
   * Port overrides from supervisor (bypasses extraction logic)
   * Used when supervisor detects typos/corrections and wants to pass validated port codes directly
   * Example: { origin: "JPCHB", destination: "SGSIN" } for "Chiba to sigapore" query
   */
  port_overrides: Annotation<{
    origin?: string;      // UN/LOCODE format (e.g., "JPCHB")
    destination?: string; // UN/LOCODE format (e.g., "SGSIN")
    origin_coordinates?: [number, number];      // [latitude, longitude]
    destination_coordinates?: [number, number]; // [latitude, longitude]
  } | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),

  /**
   * Generic agent parameter overrides
   * Allows supervisor to pass pre-validated/corrected parameters to any agent
   * Key = agent_name, Value = parameters to override
   * Example: { "weather_agent": { "coordinates": [1.29, 103.85] } }
   */
  agent_overrides: Annotation<Record<string, Record<string, unknown>> | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
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
// State shape validation (for checkpoint deserialization verification)
// ============================================================================

/**
 * Validates that a deserialized state object has the expected MultiAgentState shape.
 * Used to verify that complex objects (Route, Port[], BunkerAnalysis, etc.) persist
 * and deserialize correctly across Redis checkpoint save/load.
 *
 * @returns true if the object has the expected structure; false otherwise.
 */
export function validateMultiAgentStateShape(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  if (o.messages != null && !Array.isArray(o.messages)) return false;
  if (o.route_data != null && typeof o.route_data === 'object') {
    const r = o.route_data as Record<string, unknown>;
    if (typeof r.distance_nm !== 'number') return false;
    if (!Array.isArray(r.waypoints)) return false;
  }
  if (o.bunker_analysis != null && typeof o.bunker_analysis === 'object') {
    const b = o.bunker_analysis as Record<string, unknown>;
    if (!Array.isArray(b.recommendations)) return false;
  }
  if (o.bunker_ports != null && !Array.isArray(o.bunker_ports)) return false;
  return true;
}

