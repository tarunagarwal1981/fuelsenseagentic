/**
 * Feature Flag Configuration
 * 
 * Controls feature toggles for safe rollout of new features.
 * All flags start as false for safe deployment.
 */

export const FEATURE_FLAGS: Record<string, boolean> = {
  // Response Formatter - START WITH FALSE
  USE_RESPONSE_FORMATTER: false,
  
  // Individual component flags (all start FALSE)
  SHOW_COMPLIANCE_CARD: false,
  SHOW_WEATHER_CARD: false,
  SHOW_ENHANCED_BUNKER_TABLE: false,
  SHOW_VOYAGE_TIMELINE: false,
  SHOW_MAP_OVERLAYS: false,
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

