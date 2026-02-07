/**
 * Bunker Agent Definition
 * 
 * Finds bunker ports, fetches fuel prices, and analyzes
 * optimal bunkering options with cost-benefit analysis.
 */

import type { AgentDefinition } from '@/lib/types/agent-registry';
import { bunkerAgentNode } from '@/lib/multi-agent/agent-nodes';

export const bunkerAgent: AgentDefinition = {
  // Identity
  id: 'bunker_agent',
  name: 'Bunker Planner Agent',
  description: 'Finds bunker ports along route, validates weather safety, fetches fuel prices, and analyzes optimal bunkering options with cost-benefit analysis. Deterministic workflow - executes workflow directly without LLM tool-calling.',
  version: '1.0.0',
  
  // Type
  type: 'specialist',
  
  // No LLM - fully deterministic
  llm: undefined,
  
  // Domain
  domain: ['bunker_planning', 'cost_optimization', 'fuel_procurement'],
  capabilities: [
    'find_bunker_ports',
    'fetch_fuel_prices',
    'analyze_bunker_options',
    'calculate_deviation_cost',
    'rank_bunker_options',
    'multi_port_planning',
  ],
  /** Expanded for LLM intent classification */
  intents: [
    'bunker_costs',
    'bunker_planning',
    'bunkering_ports',
    'cheapest_bunker',
    'compare_ports',
    'find_fuel',
    'fuel_optimization',
    'fuel_planning',
    'fuel_stops',
    'optimize_bunker',
    'plan_bunker',
    'refueling_options',
    'voyage_optimization',
  ],
  
  // Contract
  produces: {
    stateFields: ['bunker_ports', 'port_prices', 'bunker_analysis', 'multi_bunker_analysis'],
    messageTypes: ['bunker_analyzed', 'ports_found', 'bunker_error'],
  },
  consumes: {
    required: ['route_data'],
    optional: ['weather_consumption', 'compliance_data', 'port_weather_status', 'fuel_quantity', 'fuel_types'],
  },
  
  // Tools - Deterministic workflow calls functions directly
  tools: {
    required: [],
    optional: [],
  },
  
  // Dependencies
  dependencies: {
    upstream: ['route_agent', 'weather_agent'],
    downstream: ['finalize'],
  },
  
  // Execution
  execution: {
    canRunInParallel: false, // Needs weather data first
    maxExecutionTimeMs: 30000,
    retryPolicy: {
      maxRetries: 2,
      backoffMs: 1000,
    },
  },
  
  // Implementation
  implementation: 'lib/multi-agent/agent-nodes.ts',
  nodeFunction: bunkerAgentNode,
  
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
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date(),
  deprecated: false,
};
