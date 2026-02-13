/**
 * Agent Registry Index
 * 
 * Central registration point for all agents in the FuelSense 360 system.
 * Call registerAllAgents() at application startup to initialize the registry.
 * 
 * This registry provides:
 * - Complete agent capability mappings for dynamic routing
 * - Intent-to-capability mapping for intelligent query routing
 * - Enriched metadata for agent discovery
 * - Capability descriptions for documentation
 */

import { AgentRegistry } from '@/lib/registry/agent-registry';

// Import all agent definitions
import { supervisorAgent } from './supervisor-agent';
import { routeAgent } from './route-agent';
import { complianceAgent } from './compliance-agent';
import { weatherAgent } from './weather-agent';
import { bunkerAgent } from './bunker-agent';
import { vesselSelectionAgent } from './vessel-selection-agent';
import { vesselInfoAgent } from './vessel-info-agent';
import { robTrackingAgent } from './rob-tracking-agent';
import { hullPerformanceAgent } from './hull-performance-agent';
import { finalizeAgent } from './finalize-agent';

/**
 * Intent-to-Capability Mapping
 * 
 * Maps query intents to the capabilities required to fulfill them.
 * Used by the supervisor for intelligent agent routing.
 */
export const INTENT_CAPABILITY_MAP: Record<string, string[]> = {
  // Entity extraction (always first)
  entity_extraction: ['entity_extraction'],
  
  // Route & Navigation
  route_planning: ['route_calculation', 'eca_detection', 'waypoint_generation'],
  
  // Weather Analysis
  weather_analysis: ['weather_forecast', 'weather_impact', 'port_weather'],
  
  // Bunker Planning
  bunker_planning: ['port_finding', 'price_fetching', 'bunker_analysis', 'deviation_cost'],
  
  // Vessel Information
  vessel_information: ['vessel_lookup', 'noon_report_fetch', 'vessel_list', 'consumption_profile'],
  
  // Vessel Selection (Multi-vessel comparison)
  vessel_selection: ['vessel_comparison', 'multi_vessel_analysis', 'voyage_feasibility_check', 'vessel_ranking'],
  
  // ROB Management
  rob_projection: ['rob_calculation', 'fuel_tracking', 'consumption_monitoring'],
  
  // Compliance (Future)
  hull_performance: ['hull_analysis', 'fouling_detection'],
  cii_compliance: ['cii_calculation', 'rating_analysis'],
  eu_ets_compliance: ['ets_calculation', 'allowance_tracking'],
};

/**
 * Capability-to-Tool ID Mapping
 *
 * Maps capability names to ToolRegistry tool IDs for dynamic tool resolution.
 * Used when agent definitions specify capabilities; registry resolves to tool IDs.
 */
export const CAPABILITY_TOOL_MAP: Record<string, string> = {
  // Vessel Information
  vessel_lookup: 'fetch_vessel_specs',
  noon_report_fetch: 'fetch_noon_report',
  vessel_list: 'fetch_vessel_specs',
  consumption_profile: 'fetch_consumption_profile',
};

/**
 * Capability Descriptions
 * 
 * Human-readable descriptions of what each capability does.
 * Used for documentation and agent discovery.
 */
export const CAPABILITY_DESCRIPTIONS: Record<string, string> = {
  // Entity Extraction
  entity_extraction: 'Extract entities (vessels, ports, dates) from natural language queries',
  
  // Route & Navigation
  route_calculation: 'Calculate maritime route between two ports with waypoints',
  eca_detection: 'Detect ECA zones along route',
  waypoint_generation: 'Generate navigation waypoints for route',
  
  // Weather
  weather_forecast: 'Fetch weather forecasts along route',
  weather_impact: 'Calculate weather impact on fuel consumption',
  port_weather: 'Get weather conditions at port',
  
  // Bunker Planning
  port_finding: 'Find bunker ports along route',
  price_fetching: 'Fetch fuel prices at bunker ports',
  bunker_analysis: 'Analyze bunker port options with cost-benefit',
  deviation_cost: 'Calculate cost of deviating to bunker port',
  
  // Vessel Information
  vessel_lookup: 'Find vessel by name or IMO and retrieve master data',
  noon_report_fetch: 'Get latest noon report with ROB, position, consumption',
  vessel_list: 'List vessels by fleet, type, or other criteria',
  consumption_profile: 'Get vessel consumption profile by speed',
  
  // Vessel Selection
  vessel_comparison: 'Compare multiple vessels for voyage suitability',
  multi_vessel_analysis: 'Analyze multiple vessels in parallel',
  voyage_feasibility_check: 'Check if vessel has sufficient ROB for voyage',
  vessel_ranking: 'Rank vessels by total cost (bunker + deviation)',
  
  // ROB Tracking
  rob_calculation: 'Calculate remaining fuel at specific time/location',
  fuel_tracking: 'Track fuel consumption over time',
  consumption_monitoring: 'Monitor real-time fuel consumption',
  
  // Compliance (Future)
  hull_analysis: 'Analyze hull performance and efficiency',
  fouling_detection: 'Detect hull fouling from consumption patterns',
  cii_calculation: 'Calculate CII rating for vessel',
  rating_analysis: 'Analyze compliance rating trends',
  ets_calculation: 'Calculate EU ETS allowance requirements',
  allowance_tracking: 'Track allowance usage and costs',
};

/**
 * Register all agents with the Agent Registry
 * 
 * This function should be called at application startup to initialize
 * the agent registry with all available agents.
 * 
 * @throws Error if agent registration fails (e.g., duplicate IDs, validation errors)
 */
export function registerAllAgents(): void {
  const registry = AgentRegistry.getInstance();
  
  // Clear registry first (useful for testing/reloading)
  registry.clear();
  
  const agents = [
    // Orchestration
    supervisorAgent,
    
    // Specialists (in execution order)
    vesselInfoAgent,        // Vessel data retrieval (upstream)
    robTrackingAgent,       // ROB tracking and projections (upstream)
    routeAgent,             // Route calculation
    complianceAgent,        // Compliance validation
    weatherAgent,           // Weather analysis
    bunkerAgent,            // Bunker port planning
    vesselSelectionAgent,   // Multi-vessel comparison and selection
    hullPerformanceAgent,   // Hull performance analysis

    // Finalizer
    finalizeAgent,
  ];
  
  let registeredCount = 0;
  let errorCount = 0;
  
  for (const agent of agents) {
    try {
      registry.register(agent);
      registeredCount++;
    } catch (error: any) {
      console.error(`❌ [AGENT-REGISTRY] Failed to register agent ${agent.id}:`, error.message);
      errorCount++;
    }
  }
  
  if (errorCount > 0) {
    throw new Error(
      `Failed to register ${errorCount} of ${agents.length} agents. ` +
      `Successfully registered ${registeredCount} agents.`
    );
  }
  
  console.log(`✅ [AGENT-REGISTRY] Successfully registered ${registeredCount} agents`);
  console.log(`   Supervisor: 1 agent`);
  console.log(`   Specialists: 8 agents (vessel_info, rob_tracking, route, compliance, weather, bunker, vessel_selection, hull_performance)`);
  console.log(`   Finalizer: 1 agent`);
}

/**
 * Get all registered agent IDs
 * 
 * @returns Array of agent IDs
 */
export function getAllAgentIds(): string[] {
  const registry = AgentRegistry.getInstance();
  return registry.getAll().map((agent) => agent.id);
}

/**
 * Get agents by capability
 * 
 * @param capability Capability to search for
 * @returns Array of agents that have this capability
 */
export function getAgentsByCapability(capability: string): string[] {
  const registry = AgentRegistry.getInstance();
  return registry.getAll()
    .filter((agent) => agent.capabilities.includes(capability))
    .map((agent) => agent.id);
}

/**
 * Get capabilities required for an intent
 * 
 * @param intent Query intent
 * @returns Array of required capabilities
 */
export function getCapabilitiesForIntent(intent: string): string[] {
  return INTENT_CAPABILITY_MAP[intent] || [];
}

/**
 * Get capability description
 * 
 * @param capability Capability name
 * @returns Human-readable description
 */
export function getCapabilityDescription(capability: string): string {
  return CAPABILITY_DESCRIPTIONS[capability] || 'No description available';
}

/**
 * Verify all expected agents are registered
 * 
 * @returns Object with verification results
 */
export function verifyAgentRegistration(): {
  allRegistered: boolean;
  missing: string[];
  extra: string[];
} {
  const registry = AgentRegistry.getInstance();
  const registeredIds = new Set(registry.getAll().map((agent) => agent.id));
  
  const expectedAgents = [
    'supervisor',
    'vessel_info_agent',
    'rob_tracking_agent',
    'route_agent',
    'compliance_agent',
    'weather_agent',
    'bunker_agent',
    'vessel_selection_agent',
    'hull_performance_agent',
    'finalize',
  ];
  
  const expectedSet = new Set(expectedAgents);
  const missing = expectedAgents.filter((id) => !registeredIds.has(id));
  const extra = Array.from(registeredIds).filter((id) => !expectedSet.has(id));
  
  return {
    allRegistered: missing.length === 0,
    missing,
    extra,
  };
}

/**
 * Get execution order for all agents
 * 
 * @returns Array of agent IDs in valid execution order
 */
export function getAgentExecutionOrder(): string[] {
  const registry = AgentRegistry.getInstance();
  const allIds = registry.getAll().map((a) => a.id);
  
  try {
    return registry.getExecutionOrder(allIds);
  } catch (error) {
    console.error('❌ [AGENT-REGISTRY] Failed to get execution order:', error);
    // Return default order
    return [
      'supervisor',
      'vessel_info_agent',
      'rob_tracking_agent',
      'route_agent',
      'compliance_agent',
      'weather_agent',
      'bunker_agent',
      'vessel_selection_agent',
      'hull_performance_agent',
      'finalize',
    ];
  }
}

/**
 * Get all available intents
 * 
 * @returns Array of all intent keys
 */
export function getAllIntents(): string[] {
  return Object.keys(INTENT_CAPABILITY_MAP);
}

/**
 * Get all available capabilities
 * 
 * @returns Array of all capability keys
 */
export function getAllCapabilities(): string[] {
  return Object.keys(CAPABILITY_DESCRIPTIONS);
}

// Export individual agents for direct access if needed
export {
  supervisorAgent,
  vesselInfoAgent,
  robTrackingAgent,
  routeAgent,
  complianceAgent,
  weatherAgent,
  bunkerAgent,
  vesselSelectionAgent,
  hullPerformanceAgent,
  finalizeAgent,
};
