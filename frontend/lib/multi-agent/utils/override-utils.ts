/**
 * Utilities for reading parameter overrides from multi-agent state.
 * Used when the supervisor passes corrected parameters during recovery (e.g. port codes).
 */

import type { MultiAgentState } from '../state';

/** Route agent uses state.port_overrides (origin/destination); other agents may use generic keys */
const ROUTE_AGENT_PORT_KEYS = ['origin', 'destination'] as const;

function getPortOverridesValue(
  state: MultiAgentState,
  paramKey: string
): string | undefined {
  if (paramKey !== 'origin' && paramKey !== 'destination') return undefined;
  return (
    state.port_overrides?.[paramKey] ??
    state.agent_context?.route_agent?.port_overrides?.[paramKey]
  );
}

/**
 * Check if state has parameter overrides from supervisor recovery
 *
 * @param state - Current multi-agent state
 * @param agentId - ID of the agent (e.g. 'route_agent', 'weather_agent')
 * @param paramKey - Parameter key to check (e.g. 'origin', 'port', 'date')
 * @returns true if override exists, false otherwise
 */
export function hasParameterOverride(
  state: MultiAgentState,
  agentId: string,
  paramKey: string
): boolean {
  // Route agent: state.port_overrides.origin / .destination
  if (agentId === 'route_agent' && ROUTE_AGENT_PORT_KEYS.includes(paramKey as any)) {
    return getPortOverridesValue(state, paramKey) != null;
  }
  // Generic: direct state keys and agent_context
  const direct = (state as Record<string, unknown>)[`${paramKey}_override`];
  if (direct !== undefined) return true;
  const directGroup = (state as Record<string, unknown>)[`${paramKey}_overrides`];
  if (typeof directGroup === 'object' && directGroup !== null && paramKey in directGroup) return true;
  const ctx = state.agent_context?.[agentId as keyof typeof state.agent_context] as Record<string, unknown> | undefined;
  if (ctx?.[`${paramKey}_override`] !== undefined) return true;
  if (typeof ctx?.[`${paramKey}_overrides`] === 'object' && ctx?.[`${paramKey}_overrides`] !== null) {
    const group = ctx[`${paramKey}_overrides`] as Record<string, unknown>;
    if (paramKey in group) return true;
  }
  // Generic agent_overrides
  const agentOverrides = state.agent_overrides?.[agentId];
  if (agentOverrides && paramKey in agentOverrides) return true;
  return false;
}

/**
 * Get parameter value with override precedence
 *
 * Priority:
 * 1. Route agent port_overrides (state.port_overrides / agent_context.route_agent.port_overrides)
 * 2. Direct state overrides (state[paramKey_override])
 * 3. Agent context overrides
 * 4. agent_overrides[agentId][paramKey]
 * 5. Provided default value
 *
 * @param state - Current multi-agent state
 * @param agentId - ID of the agent
 * @param paramKey - Parameter key
 * @param defaultValue - Default value if no override
 * @returns Override value or default
 */
export function getParameterWithOverride<T = string>(
  state: MultiAgentState,
  agentId: string,
  paramKey: string,
  defaultValue?: T
): T | undefined {
  // Route agent: port_overrides
  if (agentId === 'route_agent' && ROUTE_AGENT_PORT_KEYS.includes(paramKey as any)) {
    const v = getPortOverridesValue(state, paramKey);
    if (v !== undefined) {
      if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development' && defaultValue !== undefined) {
        if (typeof v !== typeof defaultValue) {
          console.warn(
            `[OVERRIDE-UTILS] Type mismatch for ${agentId}.${paramKey}: expected ${typeof defaultValue}, got ${typeof v}`
          );
        }
      }
      return v as T;
    }
  }

  const raw = state as Record<string, unknown>;
  const directOverride = raw[`${paramKey}_override`] ?? (raw[`${paramKey}_overrides`] as Record<string, unknown>)?.[paramKey];
  if (directOverride !== undefined) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development' && defaultValue !== undefined) {
      if (typeof directOverride !== typeof defaultValue) {
        console.warn(
          `[OVERRIDE-UTILS] Type mismatch for ${agentId}.${paramKey}: expected ${typeof defaultValue}, got ${typeof directOverride}`
        );
      }
    }
    return directOverride as T;
  }

  const ctx = state.agent_context?.[agentId as keyof typeof state.agent_context] as Record<string, unknown> | undefined;
  const contextOverride = ctx?.[`${paramKey}_override`] ?? (ctx?.[`${paramKey}_overrides`] as Record<string, unknown>)?.[paramKey];
  if (contextOverride !== undefined) return contextOverride as T;

  const agentOverride = state.agent_overrides?.[agentId]?.[paramKey];
  if (agentOverride !== undefined) return agentOverride as T;

  return defaultValue;
}

/**
 * Log override usage for debugging (standardized format)
 */
export function logOverrideUsage(
  agentId: string,
  overrides: Record<string, unknown>,
  source: 'supervisor' | 'agent_context' = 'supervisor'
): void {
  if (Object.keys(overrides).length === 0) return;
  console.log(`🔧 [${agentId.toUpperCase().replace(/_/g, '-')}] Using parameter overrides from ${source}:`);
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      console.log(`   ${key}: ${value}`);
    }
  }
}
