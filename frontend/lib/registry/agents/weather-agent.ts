/**
 * Weather Agent Definition
 * 
 * Fetches marine weather forecasts, calculates weather-adjusted
 * fuel consumption, and validates bunker port weather safety.
 */

import type { AgentDefinition } from '@/lib/types/agent-registry';
import { weatherAgentNode } from '@/lib/multi-agent/agent-nodes';

export const weatherAgent: AgentDefinition = {
  // Identity
  id: 'weather_agent',
  name: 'Weather Analyzer Agent',
  description: 'Fetches marine weather forecasts from Open-Meteo API, calculates weather-adjusted fuel consumption, and validates bunker port weather safety. Deterministic workflow - no LLM tool-calling.',
  version: '1.0.0',
  
  // Type
  type: 'specialist',
  
  // No LLM - fully deterministic
  llm: undefined,
  
  // Domain
  domain: ['weather_analysis', 'fuel_consumption', 'safety'],
  capabilities: [
    'fetch_marine_weather',
    'calculate_weather_consumption',
    'check_port_weather',
    'assess_sea_state',
    'generate_weather_alerts',
  ],
  /** Expanded for LLM intent classification */
  intents: [
    'forecast',
    'marine_weather',
    'port_weather',
    'sea_conditions',
    'weather_analysis',
    'weather_check',
    'weather_conditions',
    'weather_forecast',
    'weather_info',
  ],
  
  // Contract
  produces: {
    stateFields: ['weather_forecast', 'weather_consumption', 'port_weather_status'],
    messageTypes: ['weather_fetched', 'consumption_calculated', 'weather_error'],
  },
  consumes: {
    required: ['vessel_timeline'],
    optional: ['bunker_ports', 'vessel_consumption', 'vessel_heading'],
  },
  
  // Tools
  tools: {
    required: ['fetch_marine_weather'],
    optional: ['calculate_weather_consumption', 'check_bunker_port_weather'],
  },
  
  // Dependencies
  dependencies: {
    upstream: ['route_agent'],
    downstream: ['bunker_agent'],
  },
  
  // Execution
  execution: {
    canRunInParallel: true, // Can run in parallel with compliance_agent
    maxExecutionTimeMs: 45000, // Weather API can be slow
    retryPolicy: {
      maxRetries: 3,
      backoffMs: 2000,
    },
  },
  
  // Implementation
  implementation: 'lib/multi-agent/agent-nodes.ts',
  nodeFunction: weatherAgentNode,
  
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
