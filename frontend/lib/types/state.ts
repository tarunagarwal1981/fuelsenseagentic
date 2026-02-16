/**
 * Agent state type definitions.
 * Documents the bunker-related subset of graph state produced/consumed by the bunker agent.
 * Full runtime state is MultiAgentState in @/lib/multi-agent/state.
 * BunkerAnalysis and VesselComparisonAnalysisResult are defined there to avoid circular imports.
 */

import type { BunkerRequirement, MultiPortStrategy } from '@/lib/types/bunker';

/** Price fetcher output shape (see @/lib/tools/price-fetcher). */
export interface PriceFetcherOutputLike {
  prices_by_port?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Bunker-related subset of agent state.
 * Aligns with registry produces.stateFields and MultiAgentState bunker fields.
 * For bunker_analysis and vessel_comparison_analysis, use types from @/lib/multi-agent/state when needed.
 */
export interface AgentState {
  /** Bunker analysis result (recommendations, best/worst option, summary). See BunkerAnalysis in multi-agent/state. */
  bunker_analysis?: unknown;
  /** Multi-port strategy when single stop is insufficient. */
  multi_bunker_analysis?: MultiPortStrategy;
  /** Fleet comparison result (vessels_analyzed, rankings, recommended_vessel). See VesselComparisonAnalysisResult in multi-agent/state. */
  vessel_comparison_analysis?: unknown;
  /** ROB/fuel requirement calculation result. */
  rob_calculation?: BunkerRequirement;
  /** Bunker ports found along the route (Port[] in MultiAgentState). */
  bunker_ports?: unknown;
  /** Port fuel prices (PriceFetcherOutput shape). */
  port_prices?: PriceFetcherOutputLike | null;
}
