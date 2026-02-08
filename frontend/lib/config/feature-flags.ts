/**
 * Feature Flag Configuration
 * 
 * Controls feature toggles for safe rollout of new features.
 * All flags start as false for safe deployment.
 * 
 * Environment variables can override these defaults.
 */

/**
 * Parse boolean from environment variable
 */
function envBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

export const FEATURE_FLAGS: Record<string, boolean> = {
  // Response Formatter - ENABLED
  USE_RESPONSE_FORMATTER: envBool('USE_RESPONSE_FORMATTER', true),
  
  // Synthesis - ENABLED
  USE_SYNTHESIS: envBool('USE_SYNTHESIS', true),  // Master switch for cross-agent synthesis
  SYNTHESIS_DEBUG: envBool('SYNTHESIS_DEBUG', false),  // Extra debug logging for synthesis
  LLM_FIRST_SYNTHESIS: envBool('LLM_FIRST_SYNTHESIS', false),  // LLM-first response generation; template fallback on failure
  USE_LLM_CONTENT_ARCHITECT: envBool('USE_LLM_CONTENT_ARCHITECT', true),  // Hybrid: LLM decides structure for unknown patterns, templates format
  
  // Agentic Supervisor - ReAct Pattern (starts FALSE for safe rollout)
  // Enable with: USE_AGENTIC_SUPERVISOR=true in environment
  // This uses LLM reasoning for routing instead of hard-coded rules
  // Cost: ~$0.08/query vs $0.02/query, but 95% vs 60% success rate
  USE_AGENTIC_SUPERVISOR: envBool('USE_AGENTIC_SUPERVISOR', false),
  
  // Individual component flags (all start FALSE)
  SHOW_COMPLIANCE_CARD: envBool('SHOW_COMPLIANCE_CARD', false),
  SHOW_WEATHER_CARD: envBool('SHOW_WEATHER_CARD', false),
  SHOW_ENHANCED_BUNKER_TABLE: envBool('SHOW_ENHANCED_BUNKER_TABLE', false),
  SHOW_VOYAGE_TIMELINE: envBool('SHOW_VOYAGE_TIMELINE', false),
  SHOW_MAP_OVERLAYS: envBool('SHOW_MAP_OVERLAYS', false),
};

export type FeatureFlagKey = string;

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(flag: FeatureFlagKey): boolean {
  return FEATURE_FLAGS[flag] === true;
}

/**
 * Enable a feature (for testing)
 */
export function enableFeature(flag: FeatureFlagKey): void {
  console.log(`🎛️ [FEATURE-FLAG] Enabling: ${flag}`);
  (FEATURE_FLAGS as any)[flag] = true;
}

/**
 * Disable a feature (for rollback)
 */
export function disableFeature(flag: FeatureFlagKey): void {
  console.log(`🎛️ [FEATURE-FLAG] Disabling: ${flag}`);
  (FEATURE_FLAGS as any)[flag] = false;
}

