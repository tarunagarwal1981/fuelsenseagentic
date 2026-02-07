/**
 * Vessel Selection Type Definitions
 *
 * Comprehensive types for the Vessel Selection Agent workflow.
 * Supports multi-vessel comparison, ROB projection, feasibility analysis,
 * and cost-based ranking for voyage planning.
 */

import type { FuelQuantityMT } from '@/lib/multi-agent/state';
import type { VesselProfile } from '@/lib/services/vessel-service';

// ============================================================================
// Input Types
// ============================================================================

/**
 * Next voyage details for vessel comparison
 *
 * Defines the voyage parameters used to evaluate each candidate vessel.
 * Origin and destination are typically UN/LOCODE port codes (e.g., SGSIN, NLRTM).
 *
 * @example
 * ```ts
 * const voyage: NextVoyageDetails = {
 *   origin: 'SGSIN',
 *   destination: 'NLRTM',
 *   departure_date: '2025-03-15',
 *   speed: 14,
 *   cargo_type: 'ballast',
 * };
 * ```
 */
export interface NextVoyageDetails {
  /** Origin port code (e.g., UN/LOCODE like SGSIN) */
  origin: string;
  /** Destination port code (e.g., UN/LOCODE like NLRTM) */
  destination: string;
  /** ISO date string for departure (YYYY-MM-DD) */
  departure_date?: string;
  /** Vessel speed in knots for voyage calculation */
  speed?: number;
  /** Cargo condition: 'ballast' or 'laden' - affects consumption */
  cargo_type?: string;
}

/**
 * Constraints for vessel selection filtering
 *
 * Optional filters applied during vessel comparison to exclude
 * vessels or options that exceed cost/deviation limits.
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
 * Input for vessel selection workflow
 *
 * Complete input structure passed to the Vessel Selection Agent.
 * All required fields must be populated before analysis begins.
 */
export interface VesselSelectionInput {
  /** Array of vessel names or IMO numbers to compare */
  vessel_names: string[];
  /** Next voyage parameters (origin, destination, dates, speed) */
  next_voyage: NextVoyageDetails;
  /** Optional: Reference date for calculations (defaults to now) */
  current_date?: Date;
  /** Optional: Cost, deviation, and exclusion constraints */
  constraints?: VesselSelectionConstraints;
}

// ============================================================================
// Cost & Analysis Types
// ============================================================================

/**
 * Cost breakdown for a vessel's voyage
 *
 * Itemized cost components used for comparison and ranking.
 * All values in USD.
 */
export interface CostBreakdown {
  /** Base fuel cost for voyage consumption (without bunkering) */
  base_fuel_cost: number;
  /** Cost of bunker fuel needed to complete voyage */
  bunker_fuel_cost: number;
  /** Port fees and service charges at bunker port */
  bunker_port_fees: number;
  /** Cost of route deviation to reach bunker port */
  deviation_cost: number;
  /** Time cost (e.g., opportunity cost of delay) */
  time_cost: number;
  /** Total voyage cost (sum of all components) */
  total_cost: number;
}

/**
 * Bunker plan for a vessel when bunkering is required
 *
 * Represents the recommended bunker stop(s) when the vessel
 * cannot proceed without refueling. Structure aligns with
 * bunker analysis outputs.
 */
export interface BunkerPlan {
  /** Recommended bunker port code */
  port_code: string;
  /** Recommended bunker port name */
  port_name: string;
  /** Fuel quantities to bunker (MT) */
  bunker_quantity: FuelQuantityMT;
  /** Total cost at this port in USD */
  total_cost_usd: number;
  /** Deviation from route in nautical miles */
  deviation_nm?: number;
  /** Additional stops if multi-port bunkering required */
  additional_stops?: Array<{
    port_code: string;
    port_name: string;
    bunker_quantity: FuelQuantityMT;
    cost_usd: number;
  }>;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Per-vessel analysis result
 *
 * Complete analysis for a single vessel including ROB projection,
 * bunker requirements, cost breakdown, and feasibility assessment.
 */
export interface VesselAnalysisResult {
  /** Vessel name (e.g., "OCEAN PRIDE") */
  vessel_name: string;
  /** Vessel profile with ROB, capacity, consumption, fouling factor */
  vessel_profile: VesselProfile;
  /** Port where current voyage ends (where next voyage starts) */
  current_voyage_end_port: string;
  /** Estimated arrival at current voyage end */
  current_voyage_end_eta: Date;
  /** Projected ROB at start of next voyage (arrival at origin) */
  projected_rob_at_start: FuelQuantityMT;
  /** Fuel required for next voyage (VLSFO + LSMGO) */
  next_voyage_requirements: FuelQuantityMT;
  /** Whether vessel can complete next voyage without bunkering */
  can_proceed_without_bunker: boolean;
  /** Bunker plan if bunkering is required */
  bunker_plan?: BunkerPlan;
  /** Total voyage cost in USD (fuel + bunker + deviation + fees) */
  total_voyage_cost: number;
  /** Itemized cost breakdown */
  cost_breakdown: CostBreakdown;
  /** Feasibility score 0-100 (100 = fully feasible) */
  feasibility_score: number;
  /** Risk factors (e.g., "Low ROB margin", "Weather delay") */
  risks: string[];
}

/**
 * Vessel ranking entry
 *
 * Single vessel in the ranked comparison output.
 * Used for recommendation display and comparison matrix.
 */
export interface VesselRanking {
  /** Rank position (1 = best recommended) */
  rank: number;
  /** Vessel name */
  vessel_name: string;
  /** Composite score (cost + feasibility + other factors) */
  score: number;
  /** Human-readable reason for this recommendation */
  recommendation_reason: string;
}

/**
 * Complete vessel comparison analysis
 *
 * Aggregated output from the Vessel Selection Agent.
 * Contains per-vessel results, rankings, and comparison matrix.
 */
export interface VesselComparisonAnalysis {
  /** Per-vessel analysis results */
  vessels_analyzed: VesselAnalysisResult[];
  /** Vessels ranked by cost and feasibility */
  rankings: VesselRanking[];
  /** Recommended vessel name (best option) */
  recommended_vessel: string;
  /** Human-readable summary of the comparison */
  analysis_summary: string;
  /** Comparison matrix: vessel -> metric -> value */
  comparison_matrix: Record<string, Record<string, unknown>>;
}
