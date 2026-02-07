/**
 * Agent Configuration - FuelSense 360
 *
 * Central configuration for all agents.
 * Supports environment-based enabling/disabling and feature flags.
 */

function envBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined || value === '') return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Agent enable/disable flags (environment-based)
 */
export const AGENT_FLAGS: Record<string, boolean> = {
  ENTITY_EXTRACTION: envBool('AGENT_ENTITY_EXTRACTION', true),
  ROUTE_AGENT: envBool('AGENT_ROUTE', true),
  WEATHER_AGENT: envBool('AGENT_WEATHER', true),
  BUNKER_AGENT: envBool('AGENT_BUNKER', true),
  COMPLIANCE_AGENT: envBool('AGENT_COMPLIANCE', true),
  FINALIZE_AGENT: envBool('AGENT_FINALIZE', true),
  VESSEL_DATA: envBool('AGENT_VESSEL_DATA', false), // Beta
  FLEET_OPTIMIZER: envBool('AGENT_FLEET_OPTIMIZER', false), // Beta
};

/**
 * Feature flags for beta agents
 */
export const BETA_AGENT_FLAGS: Record<string, string> = {
  vessel_data: 'AGENT_VESSEL_DATA',
  fleet_optimizer: 'AGENT_FLEET_OPTIMIZER',
};

/**
 * Agent version configuration (for version coexistence)
 */
export const AGENT_VERSIONS: Record<string, string> = {
  'entity-extraction': '1.0.0',
  'route-agent': '1.0.0',
  'weather-agent': '1.0.0',
  'bunker-agent': '1.0.0',
  'compliance-agent': '1.0.0',
  'finalize-agent': '1.0.0',
  'vessel-data': '0.1.0',
  'fleet-optimizer': '0.1.0',
};

/**
 * Map agent ID to flag key
 */
const AGENT_ID_TO_FLAG: Record<string, string> = {
  'entity-extraction': 'ENTITY_EXTRACTION',
  'route-agent': 'ROUTE_AGENT',
  'weather-agent': 'WEATHER_AGENT',
  'bunker-agent': 'BUNKER_AGENT',
  'compliance-agent': 'COMPLIANCE_AGENT',
  'finalize-agent': 'FINALIZE_AGENT',
  'vessel-data': 'VESSEL_DATA',
  'fleet-optimizer': 'FLEET_OPTIMIZER',
};

/**
 * Check if an agent is enabled
 */
export function isAgentEnabled(agentId: string): boolean {
  const flagKey = AGENT_ID_TO_FLAG[agentId] ?? agentId.toUpperCase().replace(/-/g, '_');
  return AGENT_FLAGS[flagKey] ?? true;
}

/**
 * Get feature flag for beta agent
 */
export function getAgentFeatureFlag(agentId: string): string | undefined {
  return BETA_AGENT_FLAGS[agentId];
}
