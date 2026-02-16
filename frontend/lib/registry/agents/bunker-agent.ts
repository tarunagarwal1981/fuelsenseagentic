/**
 * Bunker Agent Definition
 *
 * Comprehensive bunker planning agent supporting multiple query types:
 * - SIMPLE_PORT_TO_PORT: Basic bunker options between two ports
 * - VESSEL_SPECIFIC: Bunker planning considering vessel ROB, capacity, specs
 * - FLEET_COMPARISON: Compare multiple vessels for voyage assignment
 * - CONSTRAINT_FIRST: Find bunker options meeting specific constraints
 *
 * Capabilities:
 * - ROB calculation and fuel requirement estimation
 * - Tank capacity validation
 * - Multi-port bunkering optimization
 * - Cost-benefit analysis with deviation costs
 * - Fleet comparison and vessel-voyage matching
 * - Constraint-based port filtering
 *
 * @version 2.0.0
 * @updated 2024-01-15
 *
 * ---
 * Migration (1.x → 2.0):
 * - New capabilities: calculate_rob_requirements, validate_tank_capacity,
 *   compare_fleet_for_voyage, optimize_multi_port_bunkering,
 *   extract_bunker_constraints, validate_port_capabilities.
 * - New optional consumes: vessel_identifiers, vessel_specs, fleet_status.
 * - New state fields: vessel_comparison_analysis, rob_calculation.
 * - New message types: multi_port_strategy, fleet_comparison_complete, rob_calculated.
 * - No breaking changes to existing state field shapes; new fields are additive.
 */

import type { AgentDefinition } from '@/lib/types/agent-registry';
import { bunkerAgentNode } from '@/lib/multi-agent/agent-nodes';

export const bunkerAgent: AgentDefinition = {
  id: 'bunker_agent',
  name: 'Bunker Planner Agent',
  description:
    'Finds bunker ports along route, validates weather safety, fetches fuel prices, and analyzes optimal bunkering options with cost-benefit analysis. Supports vessel-specific ROB, fleet comparison, and constraint-first workflows. Deterministic workflow - executes workflow directly without LLM tool-calling.',
  version: '2.0.0',

  type: 'specialist',

  llm: undefined,

  domain: ['bunker_planning', 'cost_optimization', 'fuel_procurement'],
  capabilities: [
    'find_bunker_ports',
    'fetch_fuel_prices',
    'analyze_bunker_options',
    'calculate_deviation_cost',
    'rank_bunker_options',
    'multi_port_planning',
    'calculate_rob_requirements',
    'validate_tank_capacity',
    'compare_fleet_for_voyage',
    'optimize_multi_port_bunkering',
    'extract_bunker_constraints',
    'validate_port_capabilities',
  ],
  intents: [
    'bunker_costs',
    'bunker_options',
    'bunker_planning',
    'bunkering_ports',
    'cheapest_bunker',
    'fuel_optimization',
    'fuel_planning',
    'fuel_stops',
    'refueling_options',
    'voyage_optimization',
  ],

  produces: {
    stateFields: [
      'bunker_ports',
      'port_prices',
      'bunker_analysis',
      'multi_bunker_analysis',
      'vessel_comparison_analysis',
      'rob_calculation',
    ],
    messageTypes: [
      'bunker_analyzed',
      'ports_found',
      'bunker_error',
      'multi_port_strategy',
      'fleet_comparison_complete',
      'rob_calculated',
    ],
  },
  consumes: {
    required: ['route_data'],
    optional: [
      'weather_consumption',
      'compliance_data',
      'port_weather_status',
      'fuel_quantity',
      'fuel_types',
      'vessel_identifiers',
      'vessel_specs',
      'fleet_status',
    ],
  },

  tools: {
    required: [],
    optional: [],
  },

  dependencies: {
    upstream: ['route_agent', 'weather_agent'],
    downstream: ['finalize'],
  },

  execution: {
    canRunInParallel: false,
    maxExecutionTimeMs: 30000,
    retryPolicy: {
      maxRetries: 2,
      backoffMs: 1000,
    },
  },

  implementation: 'lib/multi-agent/agent-nodes.ts',
  nodeFunction: bunkerAgentNode,

  metrics: {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    avgExecutionTimeMs: 0,
  },

  enabled: true,

  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-15'),
  deprecated: false,
};
