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
 * Check if all work is complete based on query type and available data
 */
function isAllWorkComplete(match: PatternMatch, state: MultiAgentState): boolean {
  switch (match.type) {
    case 'port_weather':
      // Port weather is complete if we have standalone_port_weather
      return !!state.standalone_port_weather;

    case 'vessel_info':
      // Vessel info is complete if vessel_info_agent succeeded and we have vessel_specs
      return (
        state.agent_status?.vessel_info_agent === 'success' &&
        !!state.vessel_specs?.length
      );

    case 'route_calculation':
      // Route is complete if we have route_data
      return !!state.route_data;

    case 'bunker_planning':
      // Bunker is complete if we have bunker_analysis
      return !!state.bunker_analysis;

    case 'compliance':
      // Compliance is complete if we have compliance_data
      return !!state.compliance_data;

    default:
      // For ambiguous queries, check if we have any final recommendation
      if (state.final_recommendation) return true;
      // Vessel info queries (how many vessels, list vessels) - if vessel_info_agent
      // already succeeded and we have vessel_specs, we're done. Prevents infinite loop.
      if (
        state.agent_status?.vessel_info_agent === 'success' &&
        state.vessel_specs?.length
      ) {
        return true;
      }
      return false;
  }
}

/**
 * Determine next agent based on query type and current state
 */
function determineNextAgent(match: PatternMatch, state: MultiAgentState): string | null {
  // For bunker planning, after route comes weather, then bunker
  if (match.type === 'bunker_planning') {
    if (state.agent_status?.['route_agent'] === 'success' && !state.weather_consumption) {
      return 'weather_agent';
    }
    if (state.agent_status?.['weather_agent'] === 'success' && !state.bunker_analysis) {
      return 'bunker_agent';
    }
    if (state.bunker_analysis) {
      return null; // All done
    }
  }
  
  // For route queries that might need weather
  if (match.type === 'route_calculation' && state.route_data) {
    // Only proceed to weather if explicitly needed
    return null;
  }
  
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
  }
  
  return missing;
}
