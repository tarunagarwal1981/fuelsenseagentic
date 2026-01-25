/**
 * Compliance Agent Definition
 * 
 * Validates regulatory compliance including ECA zones,
 * EU ETS, FuelEU Maritime, and CII ratings.
 */

import type { AgentDefinition } from '@/lib/types/agent-registry';
import { complianceAgentNode } from '@/lib/multi-agent/agent-nodes';

export const complianceAgent: AgentDefinition = {
  // Identity
  id: 'compliance_agent',
  name: 'Compliance Validator Agent',
  description: 'Validates regulatory compliance including ECA zones, EU ETS, FuelEU Maritime, and CII ratings. Deterministic workflow - no LLM tool-calling. Runs after route_agent to inform bunker planning with compliance requirements.',
  version: '1.0.0',
  
  // Type
  type: 'specialist',
  
  // No LLM - fully deterministic
  llm: undefined,
  
  // Domain
  domain: ['compliance', 'regulations', 'eca_zones', 'emissions'],
  capabilities: [
    'validate_eca_zones',
    'calculate_mgo_requirements',
    'check_eu_ets',
    'validate_fueleu_maritime',
    'calculate_cii_impact',
  ],
  intents: [
    'check_compliance',
    'validate_eca',
    'calculate_emissions',
    'check_regulations',
  ],
  
  // Contract
  produces: {
    stateFields: ['compliance_data'],
    messageTypes: ['compliance_validated', 'compliance_error'],
  },
  consumes: {
    required: ['route_data'],
    optional: ['vessel_speed', 'vessel_consumption'],
  },
  
  // Tools
  tools: {
    required: [],
    optional: [],
  },
  
  // Dependencies
  dependencies: {
    upstream: ['route_agent'],
    downstream: ['bunker_agent'],
  },
  
  // Execution
  execution: {
    canRunInParallel: true, // Can run in parallel with weather_agent
    maxExecutionTimeMs: 15000,
    retryPolicy: {
      maxRetries: 2,
      backoffMs: 500,
    },
  },
  
  // Implementation
  implementation: 'lib/multi-agent/compliance-agent-node.ts',
  nodeFunction: complianceAgentNode,
  
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
