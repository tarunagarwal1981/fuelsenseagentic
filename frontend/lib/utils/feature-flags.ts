/**
 * Feature Flag Utilities
 * 
 * Provides feature flag support for gradual rollout and per-user enablement.
 */

// ============================================================================
// Feature Flag Types
// ============================================================================

export type FeatureFlagValue = boolean | string | number;

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  value?: FeatureFlagValue;
  rolloutPercentage?: number; // 0-100
  userIds?: string[]; // Whitelist of user IDs
  excludeUserIds?: string[]; // Blacklist of user IDs
}

// ============================================================================
// Feature Flag Configuration
// ============================================================================

/**
 * Get feature flag configuration from environment
 */
function getFeatureFlagConfig(flagName: string): FeatureFlag {
  const envKey = `FEATURE_${flagName.toUpperCase().replace(/-/g, '_')}`;
  const enabled = process.env[envKey] !== 'false';
  const rolloutPercentage = parseFloat(process.env[`${envKey}_ROLLOUT`] || '100');
  const userIds = process.env[`${envKey}_USER_IDS`]?.split(',') || [];
  const excludeUserIds = process.env[`${envKey}_EXCLUDE_USER_IDS`]?.split(',') || [];

  return {
    name: flagName,
    enabled,
    rolloutPercentage,
    userIds: userIds.length > 0 ? userIds : undefined,
    excludeUserIds: excludeUserIds.length > 0 ? excludeUserIds : undefined,
  };
}

// ============================================================================
// Feature Flag Checks
// ============================================================================

/**
 * Check if a feature is enabled for a user
 */
export function isFeatureEnabled(
  flagName: string,
  userId?: string,
  sessionId?: string
): boolean {
  const config = getFeatureFlagConfig(flagName);

  // If globally disabled, return false
  if (!config.enabled) {
    return false;
  }

  // Check user whitelist
  if (config.userIds && userId) {
    return config.userIds.includes(userId);
  }

  // Check user blacklist
  if (config.excludeUserIds && userId) {
    if (config.excludeUserIds.includes(userId)) {
      return false;
    }
  }

  // Check rollout percentage
  if (config.rolloutPercentage !== undefined && config.rolloutPercentage < 100) {
    const hash = hashUser(userId || sessionId || '');
    const percentage = (hash % 100) + 1; // 1-100
    return percentage <= config.rolloutPercentage;
  }

  // Default to enabled if all checks pass
  return true;
}

/**
 * Get feature flag value
 */
export function getFeatureFlagValue(
  flagName: string,
  userId?: string,
  sessionId?: string
): FeatureFlagValue | undefined {
  const config = getFeatureFlagConfig(flagName);

  if (!isFeatureEnabled(flagName, userId, sessionId)) {
    return undefined;
  }

  const envKey = `FEATURE_${flagName.toUpperCase().replace(/-/g, '_')}_VALUE`;
  const value = process.env[envKey];

  if (value === undefined) {
    return config.value;
  }

  // Try to parse as number or boolean
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (!isNaN(Number(value))) return Number(value);

  return value;
}

/**
 * Hash user ID/session for consistent assignment
 */
function hashUser(identifier: string): number {
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    const char = identifier.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// ============================================================================
// Multi-Agent Feature Flag
// ============================================================================

/**
 * Check if multi-agent system is enabled for user
 */
export function isMultiAgentEnabled(userId?: string, sessionId?: string): boolean {
  // First check the explicit flag
  if (process.env.MULTI_AGENT_ENABLED === 'false') {
    return false;
  }

  // Then check feature flag
  return isFeatureEnabled('multi-agent', userId, sessionId);
}

/**
 * Get A/B test variant with feature flag support
 */
export function getABTestVariantWithFeatureFlag(
  userId?: string,
  sessionId?: string
): 'single-agent' | 'multi-agent' {
  // If multi-agent feature flag is disabled, always use single-agent
  if (!isMultiAgentEnabled(userId, sessionId)) {
    return 'single-agent';
  }

  // Otherwise, use A/B testing logic
  const { getTestVariant } = require('./ab-testing');
  return getTestVariant(userId, sessionId);
}

