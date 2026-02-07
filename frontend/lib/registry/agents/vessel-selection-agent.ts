/**
 * Vessel Selection Agent Definition
 *
 * Compares vessels for voyage planning, projects ROB at voyage end,
 * checks feasibility, calculates bunker requirements per vessel,
 * and ranks vessels by cost for fleet optimization.
 *
 * ## Input Requirements
 * - **vessel_names**: Array of vessel names or IMO numbers to compare
 * - **next_voyage_details**: Origin, destination, departure date, speed
 *
 * ## Output Structure
 * - **vessel_comparison_analysis**: Aggregate result (vessels_analyzed, rankings, recommended_vessel, analysis_summary, comparison_matrix)
 * - **vessel_rankings**: Vessels ranked by total cost (bunker + deviation)
 * - **recommended_vessel**: Best vessel for the voyage
 * - **per_vessel_bunker_plans**: Bunker plans for each vessel
 * - **vessel_feasibility_matrix**: Feasibility (ROB, capacity, ETA)
 *
 * ## Workflow Steps (deterministic)
 * 1. Get vessel names from state (required)
 * 2. Get next voyage details (origin, destination, dates)
 * 3. For each vessel: get planning data via VesselService
 * 4. Project ROB at voyage end for each vessel
 * 5. Calculate bunker requirements per vessel (via BunkerService)
 * 6. Rank vessels by total cost
 * 7. Build feasibility matrix
 * 8. Select recommended vessel
 */

import type { AgentDefinition } from '@/lib/types/agent-registry';
import { vesselSelectionAgentNode } from '@/lib/multi-agent/agent-nodes';

export const vesselSelectionAgent: AgentDefinition = {
  // Identity
  id: 'vessel_selection_agent',
  name: 'Vessel Selection Agent',
  description:
    'Compares vessels for voyage planning, projects ROB at voyage end, checks feasibility, calculates bunker requirements per vessel, and ranks vessels by cost. Deterministic workflow - executes workflow directly without LLM tool-calling.',
  version: '1.0.0',

  // Type
  type: 'specialist',

  // No LLM - fully deterministic
  llm: undefined,

  // Domain
  domain: ['vessel_operations', 'fleet_optimization', 'voyage_planning'],
  capabilities: [
    'compare_vessels',
    'project_rob_at_voyage_end',
    'check_next_voyage_feasibility',
    'calculate_bunker_requirements_per_vessel',
    'rank_vessels_by_cost',
    'multi_vessel_analysis',
  ],
  intents: [
    'compare_vessels',
    'which_vessel',
    'best_ship',
    'vessel_selection',
    'select_vessel',
    'compare_ships',
  ],

  // Contract
  produces: {
    stateFields: [
      'vessel_comparison_analysis',
      'vessel_rankings',
      'recommended_vessel',
      'per_vessel_bunker_plans',
      'vessel_feasibility_matrix',
    ],
    messageTypes: ['vessels_compared', 'vessels_ranked', 'vessel_selection_error'],
  },
  consumes: {
    required: ['vessel_names', 'next_voyage_details'],
    optional: ['route_data', 'current_rob_data'],
  },

  // Tools - Deterministic workflow calls functions directly
  tools: {
    required: [],
    optional: [],
  },

  // Dependencies
  dependencies: {
    upstream: ['route_agent', 'bunker_agent'],
    downstream: ['finalize'],
  },

  // Execution
  execution: {
    canRunInParallel: false, // Needs route and bunker data first
    maxExecutionTimeMs: 45000,
    retryPolicy: {
      maxRetries: 2,
      backoffMs: 1000,
    },
  },

  // Implementation
  implementation: 'lib/multi-agent/agent-nodes.ts',
  nodeFunction: vesselSelectionAgentNode,

  // Monitoring
  metrics: {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    avgExecutionTimeMs: 0,
  },

  // Access
  enabled: true,

  // Metadata
  createdAt: new Date('2025-02-07'),
  updatedAt: new Date(),
  deprecated: false,
};
