/**
 * Vessel Information Agent Definition
 *
 * Retrieves vessel master data, current operational status, ROB, position,
 * and voyage details from noon reports. This agent provides foundational
 * vessel data for all other agents.
 *
 * ## Capabilities
 * - **vessel_lookup**: Find vessel by name or IMO
 * - **noon_report_fetch**: Get latest noon report data
 * - **vessel_list**: List vessels by criteria
 * - **consumption_profile**: Get consumption data by speed
 *
 * ## Input Requirements
 * - **vessel_name** or **vessel_imo**: Vessel identifier
 * - Optional: **fleet_name**, **vessel_type** (for listing)
 *
 * ## Output Structure
 * - **vessel_current_state**: Current ROB, position, speed
 * - **vessel_master_data**: IMO, DWT, capacity, consumption profiles
 * - **noon_report_data**: Latest noon report details
 *
 * ## Example Queries
 * - "Show me vessel MV Pacific Star details"
 * - "What is the current ROB of IMO 9234567?"
 * - "List all vessels in fleet Alpha"
 * - "Get consumption profile for MV Ocean Trader"
 */

import type { AgentDefinition } from '@/lib/types/agent-registry';

// Placeholder node function - will be implemented
const vesselInfoAgentNode = async (state: any): Promise<any> => {
  console.log('🚢 [VESSEL-INFO-AGENT] Executing vessel info retrieval...');
  
  // TODO: Implement vessel info retrieval workflow
  // 1. Extract vessel identifier from state
  // 2. Query VesselService/VesselRepository
  // 3. Fetch noon report if available
  // 4. Return vessel data
  
  return {
    ...state,
    vessel_current_state: null,
    vessel_master_data: null,
    messages: [
      ...state.messages,
      {
        role: 'assistant',
        content: 'Vessel Info Agent: Not yet implemented',
      },
    ],
  };
};

export const vesselInfoAgent: AgentDefinition = {
  // Identity
  id: 'vessel_info_agent',
  name: 'Vessel Information Agent',
  description:
    'Retrieves vessel master data, current operational status, ROB, position, and voyage details from noon reports. Provides foundational vessel data for other agents.',
  version: '1.0.0',

  // Type
  type: 'specialist',

  // LLM Config - Minimal (mostly deterministic queries)
  llm: {
    model: 'claude-sonnet-4-5',
    temperature: 0.0,
    maxTokens: 1000,
  },

  // Domain
  domain: ['vessel_operations', 'vessel_data', 'fleet_management'],
  capabilities: [
    'vessel_lookup',
    'vessel_identifier_resolution',
    'noon_report_fetch',
    'vessel_list',
    'consumption_profile',
  ],
  /** Expanded for LLM intent classification */
  intents: [
    'consumption_profile',
    'fleet_composition',
    'fleet_inventory',
    'fleet_list',
    'fleet_size',
    'get_rob',
    'list_vessels',
    'noon_report',
    'noon_report_fetch',
    'ship_roster',
    'show_ships',
    'show_vessel',
    'vessel_catalog',
    'vessel_count',
    'vessel_info',
    'vessel_list',
    'vessel_names',
    'vessel_status',
  ],

  // Contract
  produces: {
    stateFields: ['vessel_specs', 'noon_reports', 'consumption_profiles'],
    messageTypes: ['vessel_data_retrieved', 'vessel_not_found', 'vessel_info_error'],
  },
  consumes: {
    required: ['messages'],
    optional: ['vessel_name', 'vessel_imo', 'fleet_name', 'vessel_type'],
  },

  // Tools (tool IDs from ToolRegistry - capability mapping: noon_report_fetch→fetch_noon_report, consumption_profile→fetch_consumption_profile)
  tools: {
    required: [],
    optional: ['fetch_noon_report', 'fetch_vessel_specs', 'fetch_consumption_profile'],
  },

  // Dependencies
  dependencies: {
    upstream: ['supervisor'],
    downstream: ['rob_tracking_agent', 'route_agent', 'vessel_selection_agent'],
  },

  // Execution
  execution: {
    canRunInParallel: true, // Can run in parallel with route calculation
    maxExecutionTimeMs: 15000,
    retryPolicy: {
      maxRetries: 3,
      backoffMs: 500,
    },
  },

  // Implementation
  implementation: 'lib/registry/agents/vessel-info-agent.ts',
  nodeFunction: vesselInfoAgentNode,

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
