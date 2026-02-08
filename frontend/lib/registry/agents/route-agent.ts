/**
 * Route Agent Definition
 * 
 * Calculates maritime routes between ports and generates
 * vessel position timeline for weather analysis.
 */

import type { AgentDefinition } from '@/lib/types/agent-registry';
import { routeAgentNode } from '@/lib/multi-agent/agent-nodes';

export const routeAgent: AgentDefinition = {
  // Identity
  id: 'route_agent',
  name: 'Route Calculator Agent',
  description: 'Calculates maritime routes between ports using Maritime Route API and generates vessel position timeline for weather analysis. Deterministic workflow - no LLM tool-calling.',
  version: '1.0.0',
  
  // Type
  type: 'specialist',
  
  // LLM Config - Minimal use for error handling
  llm: {
    model: 'claude-sonnet-4-5',
    temperature: 0.1,
    maxTokens: 2000,
  },
  
  // Domain
  domain: ['route_planning', 'voyage_planning', 'navigation'],
  capabilities: [
    'calculate_route',
    'estimate_distance',
    'generate_waypoints',
    'calculate_weather_timeline',
    'estimate_travel_time',
  ],
  /** Expanded for LLM intent classification */
  intents: [
    'calculate_route',
    'distance_calculation',
    'maritime_route',
    'navigation_route',
    'route_calculation',
    'route_distance',
    'route_planning',
    'sailing_route',
    'voyage_route',
  ],
  
  // Contract
  produces: {
    stateFields: ['route_data', 'vessel_timeline', 'waypoints'],
    messageTypes: ['route_calculated', 'route_error'],
  },
  consumes: {
    required: ['messages'],
    optional: ['origin', 'destination', 'vessel_speed', 'departure_datetime'],
  },
  
  // Tools
  tools: {
    required: ['calculate_route'],
    optional: ['calculate_weather_timeline'],
  },
  
  // Dependencies
  dependencies: {
    upstream: ['supervisor'],
    downstream: ['compliance_agent', 'weather_agent', 'bunker_agent'],
  },
  
  // Execution
  execution: {
    canRunInParallel: false, // Must run first in the workflow
    maxExecutionTimeMs: 30000,
    retryPolicy: {
      maxRetries: 3,
      backoffMs: 1000,
    },
  },
  
  // Implementation
  implementation: 'lib/multi-agent/agent-nodes.ts',
  nodeFunction: routeAgentNode,
  
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
