/**
 * Maritime Safety Validators
 *
 * DETERMINISTIC checks that override LLM routing for safety-critical decisions.
 * These are GUARDRAILS that protect against unsafe LLM decisions.
 *
 * Example: LLM might route directly to vessel deployment,
 * but we MUST validate bunker availability first.
 *
 * Usage:
 *   const result = SafetyValidators.validateAll(state);
 *   if (!result.valid) {
 *     next_agent = result.required_agent;  // Override LLM decision
 *   }
 *
 * To add new validators: add a static method and register it in validateAll().
 */

import type { MultiAgentState } from './state';

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  required_agent?: string;
  reason?: string;
  severity?: 'warning' | 'critical';
}

// ============================================================================
// Safety Validators
// ============================================================================

export class SafetyValidators {
  /**
   * Validate that bunker analysis has been done before vessel selection
   *
   * RULE: Cannot recommend vessel without knowing bunker availability
   * This is a HARD BUSINESS RULE that LLM cannot override
   */
  static validateBunkerBeforeVesselSelection(
    state: MultiAgentState
  ): ValidationResult {
    if (state.next_agent === 'vessel_selection_agent') {
      if (!state.bunker_analysis || !state.bunker_ports) {
        const reason =
          'SAFETY: Must analyze bunker availability before vessel selection';
        console.error(`🚨 [SAFETY] validateBunkerBeforeVesselSelection FAILED`);
        console.error(`   Reason: ${reason}`);
        console.error(
          `   Missing: bunker_analysis=${!!state.bunker_analysis}, bunker_ports=${!!state.bunker_ports}`
        );
        return {
          valid: false,
          required_agent: 'bunker_agent',
          reason,
          severity: 'critical',
        };
      }
    }
    return { valid: true };
  }

  /**
   * Validate that route exists before bunker planning
   *
   * RULE: Cannot find bunker ports without knowing the route
   */
  static validateRouteBeforeBunker(state: MultiAgentState): ValidationResult {
    if (state.next_agent === 'bunker_agent') {
      if (!state.route_data) {
        const reason =
          'SAFETY: Must calculate route before finding bunker ports';
        console.error(`🚨 [SAFETY] validateRouteBeforeBunker FAILED`);
        console.error(`   Reason: ${reason}`);
        console.error(`   Missing: route_data`);
        return {
          valid: false,
          required_agent: 'route_agent',
          reason,
          severity: 'critical',
        };
      }
    }
    return { valid: true };
  }

  /**
   * Validate that vessel data exists before ROB projection
   *
   * RULE: Cannot project ROB without current vessel state (vessel_profile contains ROB)
   */
  static validateVesselDataBeforeROB(state: MultiAgentState): ValidationResult {
    const robAgentId = 'rob_tracking_agent';
    if (state.next_agent === robAgentId) {
      if (!state.vessel_profile) {
        const reason =
          'SAFETY: Must fetch vessel data before ROB projection';
        console.error(`🚨 [SAFETY] validateVesselDataBeforeROB FAILED`);
        console.error(`   Reason: ${reason}`);
        console.error(`   Missing: vessel_profile`);
        return {
          valid: false,
          required_agent: 'vessel_info_agent',
          reason,
          severity: 'critical',
        };
      }
    }
    return { valid: true };
  }

  /**
   * Run all safety validations
   *
   * Returns first failed validation, or { valid: true } if all pass.
   * Call this before accepting LLM routing decisions.
   *
   * @param state - Current state with next_agent set to proposed routing
   * @returns ValidationResult - first failure or success
   */
  static validateAll(state: MultiAgentState): ValidationResult {
    const validations: Array<() => ValidationResult> = [
      () => this.validateRouteBeforeBunker(state),
      () => this.validateBunkerBeforeVesselSelection(state),
      () => this.validateVesselDataBeforeROB(state),
      // Add more validators here as needed
    ];

    for (const validate of validations) {
      const result = validate();
      if (!result.valid) {
        console.error(
          `🚨 [SAFETY] Validation failed: ${result.reason} (severity: ${result.severity})`
        );
        console.error(
          `   Override: next_agent=${state.next_agent} → ${result.required_agent}`
        );
        return result;
      }
    }

    return { valid: true };
  }

  /**
   * Check if routing should be overridden based on safety validations
   *
   * Convenience method that returns the agent to route to:
   * - If validation fails: returns required_agent (override)
   * - If validation passes: returns proposed next_agent unchanged
   *
   * @param state - State with proposed next_agent
   * @returns Agent ID to route to (may be overridden for safety)
   */
  static getSafeNextAgent(state: MultiAgentState): string | undefined {
    const result = this.validateAll(state);
    if (!result.valid && result.required_agent) {
      console.log(
        `🛡️ [SAFETY] Overriding routing: ${state.next_agent} → ${result.required_agent}`
      );
      return result.required_agent;
    }
    return state.next_agent;
  }
}
