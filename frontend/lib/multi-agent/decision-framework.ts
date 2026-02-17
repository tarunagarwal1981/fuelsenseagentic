/**
 * Decision Framework for Agentic Supervisor
 * 
 * Defines explicit rules for when to:
 * - Call an agent immediately (high confidence >= 80)
 * - Use LLM reasoning (medium confidence 30-80)
 * - Ask for clarification (low confidence < 30)
 * 
 * Part of the 3-Tier Decision Framework:
 * - Tier 1: Pattern Matcher - Fast regex matching
 * - Tier 2: Decision Framework (this file) - Confidence thresholds
 * - Tier 3: LLM Reasoning - Complex queries
 */

import type { MultiAgentState } from './state';
import type { PatternMatch } from './pattern-matcher';

// ============================================================================
// Confidence Thresholds
// ============================================================================

export const CONFIDENCE_THRESHOLDS = {
  /** Confidence >= 80: Proceed with action immediately (no LLM needed) */
  HIGH_CONFIDENCE: 80,
  /** Confidence 30-80: Use LLM reasoning to decide */
  MEDIUM_CONFIDENCE: 30,
  /** Confidence < 30: Ask for clarification */
  LOW_CONFIDENCE: 30,
} as const;

// ============================================================================
// Decision Types
// ============================================================================

export type DecisionType = 
  | 'immediate_action'      // High confidence - proceed without LLM
  | 'llm_reasoning'         // Medium confidence - use LLM to decide
  | 'request_clarification' // Low confidence - ask user
  | 'finalize';             // All done - go to finalize

export interface DecisionResult {
  /** The decision type */
  decision: DecisionType;
  /** Confidence score 0-100 */
  confidence: number;
  /** Agent to call (if decision is immediate_action) */
  agent?: string;
  /** Human-readable reason for the decision */
  reason: string;
  /** Clarification question (if decision is request_clarification) */
  clarification_question?: string;
}

// ============================================================================
// Main Decision Logic
// ============================================================================

/**
 * Make routing decision based on pattern match and current state
 * 
 * This is the core decision logic that determines what action to take.
 * It considers:
 * - Pattern match confidence
 * - Current state (what data we have)
 * - Agent status (success/failure)
 * - Recovery attempts
 */
export function makeRoutingDecision(
  match: PatternMatch,
  state: MultiAgentState
): DecisionResult {
  
  // ============================================================================
  // Rule 0: Check if all work is done
  // ============================================================================
  
  if (isAllWorkComplete(match, state)) {
    return {
      decision: 'finalize',
      confidence: 100,
      agent: 'finalize',
      reason: 'All required data is available, ready to finalize',
    };
  }
  
  // ============================================================================
  // Rule 1: High Confidence Pattern Match (>= 80)
  // ============================================================================
  
  if (match.confidence >= CONFIDENCE_THRESHOLDS.HIGH_CONFIDENCE && match.agent) {
    // Check if the suggested agent has already succeeded
    if (state.agent_status?.[match.agent] === 'success') {
      // Agent already completed - check what else needs to be done
      const nextAgent = determineNextAgent(match, state);
      if (nextAgent) {
        // Don't retry an agent that has already failed (avoids infinite loop)
        if (state.agent_status?.[nextAgent] === 'failed') {
          return {
            decision: 'finalize',
            confidence: 100,
            agent: 'finalize',
            reason: `${nextAgent} failed previously, finalizing with available data`,
          };
        }
        return {
          decision: 'immediate_action',
          confidence: 90,
          agent: nextAgent,
          reason: `${match.agent} already completed, proceeding to ${nextAgent}`,
        };
      }
      return {
        decision: 'finalize',
        confidence: 100,
        agent: 'finalize',
        reason: `${match.agent} already completed successfully, finalizing`,
      };
    }
    
    // Check if agent previously failed
    if (state.agent_status?.[match.agent] === 'failed') {
      return {
        decision: 'llm_reasoning',
        confidence: 50,
        reason: `${match.agent} failed previously, need LLM to decide recovery strategy`,
      };
    }
    
    // Proceed with high confidence action
    return {
      decision: 'immediate_action',
      confidence: match.confidence,
      agent: match.agent,
      reason: match.reason || `High confidence (${match.confidence}%) pattern match for ${match.agent}`,
    };
  }
  
  // ============================================================================
  // Rule 2: Medium Confidence - Use LLM Reasoning (30-80)
  // ============================================================================
  
  if (match.confidence >= CONFIDENCE_THRESHOLDS.MEDIUM_CONFIDENCE) {
    return {
      decision: 'llm_reasoning',
      confidence: match.confidence,
      reason: `Medium confidence (${match.confidence}%) - using LLM reasoning to decide`,
    };
  }
  
  // ============================================================================
  // Rule 3: Low Confidence - Request Clarification (< 30)
  // ============================================================================
  
  if (match.confidence < CONFIDENCE_THRESHOLDS.LOW_CONFIDENCE && match.matched) {
    const { validateExtractedData, formatClarificationQuestion } = require('./pattern-matcher');
    const validation = validateExtractedData(match);
    const question = formatClarificationQuestion(match, validation.missing);
    
    return {
      decision: 'request_clarification',
      confidence: match.confidence,
      reason: `Low confidence (${match.confidence}%) - missing: ${validation.missing.join(', ')}`,
      clarification_question: question,
    };
  }
  
  // ============================================================================
  // Rule 4: No Pattern Match - Use LLM Reasoning
  // ============================================================================
  
  return {
    decision: 'llm_reasoning',
    confidence: 0,
    reason: 'No clear pattern matched - using LLM reasoning for complex query',
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Intent requirements: what data must exist for each user goal to be "complete".
 * Uses original_intent when set (persists through workflow); falls back to pattern.type.
 */
const INTENT_REQUIREMENTS: Record<string, (state: MultiAgentState) => boolean> = {
  port_weather: (s) => !!s.standalone_port_weather,
  vessel_info: (s) =>
    s.agent_status?.vessel_info_agent === 'success' && !!s.vessel_specs?.length,
  route_calculation: (s) => !!s.route_data,
  bunker_planning: (s) => !!s.route_data && !!s.bunker_analysis,
  weather_analysis: (s) => !!s.route_data && !!s.weather_forecast,
  compliance: (s) => !!s.route_data && !!s.compliance_data,
  hull_analysis: (s) =>
    s.agent_status?.hull_performance_agent === 'success' && s.hull_performance != null,
};

/**
 * Check if all work is complete based on ORIGINAL USER INTENT and available data.
 * Uses original_intent (set on first query) so we don't prematurely finalize
 * when pattern.type is just the current step (e.g. route_calculation) but the
 * user's goal was bunker_planning (needs route + bunker_analysis).
 */
function isAllWorkComplete(match: PatternMatch, state: MultiAgentState): boolean {
  const intent = state.original_intent || match.type;

  const checkComplete = INTENT_REQUIREMENTS[intent];
  if (checkComplete) {
    return checkComplete(state);
  }

  // Fallback for unknown or ambiguous intent
  if (state.final_recommendation) return true;
  if (
    state.agent_status?.vessel_info_agent === 'success' &&
    state.vessel_specs?.length
  ) {
    return true;
  }
  return false;
}

/**
 * Determine next agent based on ORIGINAL INTENT and current state.
 * Routes through multi-step workflows (e.g. bunker_planning: route -> bunker).
 */
function determineNextAgent(match: PatternMatch, state: MultiAgentState): string | null {
  const intent = state.original_intent || match.type;

  // Bunker planning: route -> entity_extractor (when no vessel ids) -> vessel_info (if needed) -> bunker
  if (intent === 'bunker_planning') {
    const hasVesselIds =
      state.vessel_identifiers &&
      ((state.vessel_identifiers.names?.length ?? 0) > 0 ||
        (state.vessel_identifiers.imos?.length ?? 0) > 0);
    const hasVesselSpecs = (state.vessel_specs?.length ?? 0) > 0;
    const entityExtractorRan = state.agent_status?.entity_extractor === 'success';
    if (!state.route_data) return 'route_agent';
    if (!hasVesselIds && !entityExtractorRan) return 'entity_extractor';
    if (hasVesselIds && !hasVesselSpecs) return 'vessel_info_agent';
    if (!state.bunker_analysis) return 'bunker_agent';
    return null;
  }

  // Weather analysis: route -> weather
  if (intent === 'weather_analysis') {
    if (!state.route_data) return 'route_agent';
    if (!state.weather_forecast) return 'weather_agent';
    return null;
  }

  // Compliance: route -> compliance
  if (intent === 'compliance') {
    if (!state.route_data) return 'route_agent';
    if (!state.compliance_data) return 'compliance_agent';
    return null;
  }

  // Hull analysis: entity_extractor -> hull_performance_agent
  if (intent === 'hull_analysis') {
    const hasVesselIds =
      state.vessel_identifiers &&
      ((state.vessel_identifiers.names?.length ?? 0) > 0 ||
        (state.vessel_identifiers.imos?.length ?? 0) > 0);
    if (!hasVesselIds) return 'entity_extractor';
    if (
      state.agent_status?.hull_performance_agent !== 'success' ||
      state.hull_performance == null
    ) {
      return 'hull_performance_agent';
    }
    return null;
  }

  // Vessel info (list/count/specs/status): entity_extractor optional -> vessel_info_agent
  // Covers: (1) list/catalog query routed to vessel_info_agent (no entity step), or
  // (2) specific-vessel query routed to entity_extractor first, then vessel_info_agent
  if (intent === 'vessel_info') {
    const vesselInfoDone =
      state.agent_status?.vessel_info_agent === 'success' &&
      (state.vessel_specs?.length ?? 0) > 0;
    if (vesselInfoDone) return null;
    return 'vessel_info_agent';
  }

  // Route-only or other: no next step
  return null;
}

/**
 * Check if we can skip LLM reasoning for simple cases
 * 
 * Returns true if:
 * - This is the first decision (no reasoning history)
 * - No agents have failed
 * - We have a high confidence pattern match
 */
export function canSkipLLMReasoning(
  match: PatternMatch,
  state: MultiAgentState
): boolean {
  // If we're already in a reasoning loop, don't skip
  if (state.reasoning_history && state.reasoning_history.length > 0) {
    return false;
  }
  
  // If any agent has failed, don't skip (need LLM for recovery)
  const failedAgents = Object.entries(state.agent_status || {})
    .filter(([_, status]) => status === 'failed');
  
  if (failedAgents.length > 0) {
    return false;
  }
  
  // Can skip if high confidence
  return match.confidence >= CONFIDENCE_THRESHOLDS.HIGH_CONFIDENCE;
}

/**
 * Check if state has required prerequisites for an agent
 */
export function hasPrerequisites(agent: string, state: MultiAgentState): boolean {
  switch (agent) {
    case 'weather_agent':
      // Weather agent can work standalone (port weather) or with route
      return true; // Always allow weather agent
      
    case 'bunker_agent':
      // Bunker agent needs route data
      return !!state.route_data;
      
    case 'compliance_agent':
      // Compliance agent needs route data
      return !!state.route_data;
      
    case 'route_agent':
      // Route agent has no prerequisites
      return true;
      
    case 'hull_performance_agent':
      // Hull performance needs vessel_identifiers from entity extractor
      return !!(
        state.vessel_identifiers &&
        ((state.vessel_identifiers.names?.length ?? 0) > 0 ||
          (state.vessel_identifiers.imos?.length ?? 0) > 0)
      );
      
    default:
      return true;
  }
}

/**
 * Get missing prerequisites for an agent
 */
export function getMissingPrerequisites(agent: string, state: MultiAgentState): string[] {
  const missing: string[] = [];
  
  switch (agent) {
    case 'bunker_agent':
      if (!state.route_data) missing.push('route_data');
      break;
      
    case 'compliance_agent':
      if (!state.route_data) missing.push('route_data');
      break;
      
    case 'hull_performance_agent':
      if (
        !state.vessel_identifiers ||
        ((state.vessel_identifiers.names?.length ?? 0) === 0 &&
          (state.vessel_identifiers.imos?.length ?? 0) === 0)
      ) {
        missing.push('vessel_identifiers');
      }
      break;
  }
  
  return missing;
}
