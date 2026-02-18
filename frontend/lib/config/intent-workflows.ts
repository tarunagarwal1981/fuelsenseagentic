/**
 * Intent Workflows - Config-driven agent sequences per user intent.
 *
 * Single source of truth for multi-step workflows. The decision framework
 * uses getNextAgentFromWorkflow() to determine the next agent when a
 * workflow exists for the current intent.
 */

import type { MultiAgentState } from '@/lib/multi-agent/state';

// ============================================================================
// Types
// ============================================================================

export interface IntentWorkflow {
  /** Ordered list of agent IDs for this intent. */
  steps: string[];
  /**
   * Optional conditions per step. If defined for a step, that step is only
   * included when condition(state) is true (e.g. vessel_selection_agent
   * only when comparing 2+ vessels).
   */
  stepConditions?: Partial<Record<string, (state: MultiAgentState) => boolean>>;
}

// ============================================================================
// Helpers used in conditions
// ============================================================================

function hasVesselIds(state: MultiAgentState): boolean {
  return !!(
    state.vessel_identifiers &&
    ((state.vessel_identifiers.names?.length ?? 0) > 0 ||
      (state.vessel_identifiers.imos?.length ?? 0) > 0)
  );
}

// ============================================================================
// Intent Workflows Config
// ============================================================================

export const INTENT_WORKFLOWS: Record<string, IntentWorkflow> = {
  bunker_planning: {
    steps: [
      'route_agent',
      'entity_extractor',
      'vessel_info_agent',
      'bunker_agent',
      'vessel_selection_agent',
    ],
    stepConditions: {
      entity_extractor: (s) => !hasVesselIds(s),
      vessel_info_agent: (s) => hasVesselIds(s) && (s.vessel_specs?.length ?? 0) === 0,
      vessel_selection_agent: (s) =>
        (s.vessel_names?.length ?? 0) >= 2 && !s.vessel_comparison_analysis,
    },
  },
  weather_analysis: {
    steps: ['route_agent', 'weather_agent'],
  },
  compliance: {
    steps: ['route_agent', 'compliance_agent'],
  },
  hull_analysis: {
    steps: ['entity_extractor', 'hull_performance_agent'],
    stepConditions: {
      entity_extractor: (s) => !hasVesselIds(s),
    },
  },
  vessel_info: {
    steps: ['vessel_info_agent'],
  },
  route_calculation: {
    steps: ['route_agent'],
  },
  port_weather: {
    steps: ['weather_agent'],
  },
};

// ============================================================================
// getNextAgentFromWorkflow
// ============================================================================

/**
 * Returns the next agent to run for the given intent from the workflow config,
 * or null if the workflow is complete or intent has no workflow.
 */
export function getNextAgentFromWorkflow(
  intent: string,
  state: MultiAgentState
): string | null {
  const workflow = INTENT_WORKFLOWS[intent];
  if (!workflow) return null;

  for (const step of workflow.steps) {
    if (state.agent_status?.[step] === 'success') continue;
    const condition = workflow.stepConditions?.[step];
    if (condition && !condition(state)) continue;
    return step;
  }
  return null;
}
