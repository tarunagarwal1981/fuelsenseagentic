/**
 * Agentic Supervisor - Enhanced 3-Tier Decision Framework
 * 
 * Implements a truly agentic supervisor with a 3-tier decision system:
 * 
 * TIER 1: Pattern Matcher (Fast Path)
 * - Regex-based pattern matching for common queries
 * - Avoids LLM calls for obvious cases
 * - Returns confidence score for decision
 * 
 * TIER 2: Decision Framework (Confidence Routing)
 * - High confidence (>= 80%): Immediate action
 * - Medium confidence (30-80%): LLM reasoning
 * - Low confidence (< 30%): Request clarification
 * 
 * TIER 3: LLM Reasoning (Complex Queries)
 * - ReAct pattern for step-by-step reasoning
 * - Handles ambiguous queries
 * - Recovery from failures
 * 
 * Key Principle: DEFAULT TO ACTION, NOT CLARIFICATION
 * - 80%+ confidence → ACT immediately
 * - Only clarify when critical info is COMPLETELY absent
 */

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LLMFactory } from './llm-factory';
import { AgentRegistry } from './registry';
import type { MultiAgentState, ReasoningStep, RoutingMetadata } from './state';
import { matchQueryPattern, type PatternMatch } from './pattern-matcher';
import { makeRoutingDecision, CONFIDENCE_THRESHOLDS, type DecisionResult } from './decision-framework';
import { logIntentClassification, hashQueryForIntent } from '@/lib/monitoring/intent-classification-logger';
import { SupervisorPromptGenerator } from './supervisor-prompt-generator';

// ============================================================================
// Constants
// ============================================================================

const MAX_REASONING_STEPS = 15;
const MAX_RECOVERY_ATTEMPTS = 3;

// ============================================================================
// Types
// ============================================================================

interface Reasoning {
  thought: string;
  action: 'call_agent' | 'validate' | 'recover' | 'clarify' | 'finalize';
  params?: {
    agent?: string;
    recovery_action?: 'retry_agent' | 'skip_agent' | 'ask_user';
    question?: string;
    [key: string]: unknown;
  };
}

// ============================================================================
// Logging Utilities
// ============================================================================

// ============================================================================
// Routing Metadata
// ============================================================================

/**
 * Build routing_metadata from pattern match and decision.
 * Used for observability and debugging - persists through agent execution.
 */
function buildRoutingMetadata(
  patternMatch: PatternMatch,
  decision: DecisionResult,
  options?: { classification_method?: RoutingMetadata['classification_method']; matched_intent?: string }
): RoutingMetadata {
  const extracted_data = patternMatch.extracted_data;
  const extracted_params: RoutingMetadata['extracted_params'] = extracted_data
    ? {
        origin_port: extracted_data.origin,
        destination_port: extracted_data.destination,
        date: extracted_data.date,
        ...(extracted_data.port && { port: extracted_data.port }),
      }
    : undefined;

  const classification_method =
    options?.classification_method ??
    (patternMatch.reason?.includes('LLM intent')
      ? 'llm_intent_classifier'
      : patternMatch.matched
        ? 'pattern_match'
        : 'llm_reasoning');

  return {
    matched_intent: options?.matched_intent ?? (patternMatch.type === 'ambiguous' ? 'unknown' : patternMatch.type),
    target_agent: decision.agent || 'none',
    confidence: decision.confidence,
    classification_method,
    reasoning: decision.reason,
    classified_at: Date.now(),
    extracted_params,
    latency_ms: patternMatch.latency_ms ?? 0,
    cache_hit: patternMatch.cache_hit ?? false,
    cost_usd: patternMatch.cost_usd ?? 0,
    query_hash: patternMatch.query_hash,
  };
}

/**
 * Log routing decision for observability.
 */
function logRoutingDecision(
  query: string,
  correlationId: string,
  routing_metadata: RoutingMetadata
): void {
  logIntentClassification({
    correlation_id: correlationId,
    query,
    query_hash: routing_metadata.query_hash ?? hashQueryForIntent(query),
    classification_method: routing_metadata.classification_method,
    matched_agent: routing_metadata.target_agent,
    matched_intent: routing_metadata.matched_intent,
    confidence: routing_metadata.confidence,
    reasoning: routing_metadata.reasoning,
    cache_hit: routing_metadata.cache_hit ?? false,
    latency_ms: routing_metadata.latency_ms ?? 0,
    cost_usd: routing_metadata.cost_usd ?? 0,
    timestamp: routing_metadata.classified_at,
  });
}

/**
 * Build routing_metadata for Tier 3 LLM reasoning path.
 * Extracts intent from LLM response if available.
 */
function buildRoutingMetadataForTier3(
  reasoning: Reasoning,
  patternMatch: PatternMatch
): RoutingMetadata {
  const targetAgent =
    reasoning.action === 'call_agent'
      ? (reasoning.params?.agent as string) || 'none'
      : reasoning.action === 'finalize'
        ? 'finalize'
        : reasoning.action === 'clarify'
          ? 'finalize'
          : reasoning.action === 'recover'
            ? (reasoning.params?.agent as string) || 'none'
            : 'none';

  const matched_intent =
    (reasoning.params?.intent as string) ?? 'llm_decided';

  const extracted_data = patternMatch.extracted_data;
  const extracted_params: RoutingMetadata['extracted_params'] = extracted_data
    ? {
        origin_port: extracted_data.origin,
        destination_port: extracted_data.destination,
        date: extracted_data.date,
        ...(extracted_data.port && { port: extracted_data.port }),
      }
    : undefined;

  return {
    matched_intent,
    target_agent: targetAgent,
    confidence: 70, // Tier 3 uses LLM - reasonable default
    classification_method: 'llm_reasoning',
    reasoning: reasoning.thought,
    classified_at: Date.now(),
    extracted_params,
    latency_ms: patternMatch.latency_ms ?? 0,
    cache_hit: patternMatch.cache_hit ?? false,
    cost_usd: patternMatch.cost_usd ?? 0,
    query_hash: patternMatch.query_hash,
  };
}

// ============================================================================
// Logging Utilities
// ============================================================================

/**
 * Log decision flow for debugging
 */
function logDecisionFlow(stage: string, data: Record<string, unknown>): void {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`🔍 [DECISION-FLOW] ${stage}`);
  console.log(`${'─'.repeat(70)}`);
  
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'object' && value !== null) {
      console.log(`   ${key}:`, JSON.stringify(value, null, 2).split('\n').join('\n   '));
    } else {
      console.log(`   ${key}: ${value}`);
    }
  }
}

// ============================================================================
// Main Reasoning Supervisor (3-Tier Framework)
// ============================================================================

/**
 * Agentic Reasoning Supervisor (Enhanced with 3-Tier Decision Framework)
 * 
 * Tier 1: Pre-processing pattern matcher (fast, deterministic)
 * Tier 2: Decision framework with confidence thresholds
 * Tier 3: LLM reasoning for complex queries
 */
export async function reasoningSupervisor(
  state: MultiAgentState
): Promise<Partial<MultiAgentState>> {
  console.log('\n🧠 [AGENTIC-SUPERVISOR] Starting 3-tier decision framework...');
  
  // ============================================================================
  // CIRCUIT BREAKERS - Check limits first
  // ============================================================================
  
  const reasoningStepCount = state.reasoning_history?.length || 0;
  if (reasoningStepCount >= MAX_REASONING_STEPS) {
    console.warn('⚠️ [AGENTIC-SUPERVISOR] Max reasoning steps reached');
    return {
      next_agent: 'finalize',
      current_thought: 'Maximum reasoning steps reached, finalizing with available data',
      needs_clarification: false,
    };
  }
  
  const recoveryAttempts = state.recovery_attempts || 0;
  if (recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
    console.warn('⚠️ [AGENTIC-SUPERVISOR] Max recovery attempts reached');
    return {
      next_agent: 'finalize',
      needs_clarification: true,
      clarification_question: 'I encountered persistent issues. Could you rephrase your request?',
      current_thought: 'Unable to recover from errors, need user input',
    };
  }
  
  // ============================================================================
  // TIER 1: PATTERN MATCHER (Fast Path)
  // ============================================================================
  
  const query = extractQuery(state);
  console.log(`\n🔍 [TIER-1] Pattern Matcher analyzing: "${query.substring(0, 80)}..."`);
  
  const patternMatch = await matchQueryPattern(query);

  // Store original intent on first pass (persists through workflow for isAllWorkComplete)
  const originalIntentUpdate =
    !state.original_intent && patternMatch.type !== 'ambiguous'
      ? { original_intent: patternMatch.type }
      : {};
  
  logDecisionFlow('Pattern Match Results', {
    type: patternMatch.type,
    confidence: `${patternMatch.confidence}%`,
    agent: patternMatch.agent || 'none',
    extracted_data: patternMatch.extracted_data || {},
    reason: patternMatch.reason || 'N/A',
  });
  
  // ============================================================================
  // TIER 2: DECISION FRAMEWORK (Confidence Routing)
  // ============================================================================
  
  const decision = makeRoutingDecision(patternMatch, state);
  
  logDecisionFlow('Decision Framework Results', {
    decision: decision.decision,
    confidence: `${decision.confidence}%`,
    agent: decision.agent || 'none',
    reason: decision.reason,
  });
  
  // ============================================================================
  // IMMEDIATE ACTION (High Confidence >= 80%)
  // ============================================================================
  
  if (decision.decision === 'immediate_action' && decision.agent) {
    console.log(`\n🎯 [TIER-2] HIGH CONFIDENCE - Direct routing to ${decision.agent}`);
    
    const step: ReasoningStep = {
      step_number: reasoningStepCount + 1,
      thought: decision.reason,
      action: 'call_agent',
      action_params: { agent: decision.agent },
      observation: `Pattern match with ${decision.confidence}% confidence → ${decision.agent}`,
      timestamp: new Date(),
    };

    const routing_metadata = buildRoutingMetadata(patternMatch, decision);
    logRoutingDecision(query, state.correlation_id || 'unknown', routing_metadata);
    console.log('📋 [AGENTIC-SUPERVISOR] Setting routing_metadata:', {
      matched_intent: routing_metadata.matched_intent,
      target_agent: routing_metadata.target_agent,
      classification_method: routing_metadata.classification_method,
    });
    
    return {
      ...originalIntentUpdate,
      next_agent: decision.agent,
      current_thought: decision.reason,
      reasoning_history: [step],
      needs_clarification: false,
      routing_metadata,
    };
  }
  
  // ============================================================================
  // FINALIZE (Work Complete)
  // ============================================================================
  
  if (decision.decision === 'finalize') {
    console.log('\n✅ [TIER-2] All work complete - Routing to finalize');
    
    const step: ReasoningStep = {
      step_number: reasoningStepCount + 1,
      thought: decision.reason,
      action: 'finalize',
      action_params: {},
      observation: 'All required data available',
      timestamp: new Date(),
    };

    const routing_metadata = buildRoutingMetadata(patternMatch, decision);
    logRoutingDecision(query, state.correlation_id || 'unknown', routing_metadata);
    console.log('📋 [AGENTIC-SUPERVISOR] Setting routing_metadata:', {
      matched_intent: routing_metadata.matched_intent,
      target_agent: routing_metadata.target_agent,
      classification_method: routing_metadata.classification_method,
    });
    
    return {
      ...originalIntentUpdate,
      next_agent: 'finalize',
      current_thought: decision.reason,
      reasoning_history: [step],
      needs_clarification: false,
      routing_metadata,
    };
  }

  // ============================================================================
  // REQUEST CLARIFICATION (Low Confidence < 30%)
  // ============================================================================
  
  if (decision.decision === 'request_clarification') {
    console.log('\n❓ [TIER-2] LOW CONFIDENCE - Requesting clarification');
    
    const step: ReasoningStep = {
      step_number: reasoningStepCount + 1,
      thought: decision.reason,
      action: 'clarify',
      action_params: { question: decision.clarification_question },
      observation: `Confidence too low (${decision.confidence}%), need user input`,
      timestamp: new Date(),
    };

    const routing_metadata = buildRoutingMetadata(patternMatch, decision);
    logRoutingDecision(query, state.correlation_id || 'unknown', routing_metadata);
    console.log('📋 [AGENTIC-SUPERVISOR] Setting routing_metadata:', {
      matched_intent: routing_metadata.matched_intent,
      target_agent: routing_metadata.target_agent,
      classification_method: routing_metadata.classification_method,
    });
    
    return {
      ...originalIntentUpdate,
      needs_clarification: true,
      clarification_question: decision.clarification_question,
      current_thought: decision.reason,
      reasoning_history: [step],
      next_agent: 'finalize',
      routing_metadata,
    };
  }
  
  // ============================================================================
  // TIER 3: LLM REASONING (Medium Confidence or Complex Query)
  // ============================================================================
  
  console.log('\n🧠 [TIER-3] Using LLM reasoning for complex decision...');
  
  // Generate reasoning using LLM with pattern context
  const reasoning = await generateReasoning(state, patternMatch);
  
  logDecisionFlow('LLM Reasoning Results', {
    thought: reasoning.thought.substring(0, 200) + '...',
    action: reasoning.action,
    params: reasoning.params || {},
  });
  
  // Record reasoning step
  const step: ReasoningStep = {
    step_number: reasoningStepCount + 1,
    thought: reasoning.thought,
    action: reasoning.action,
    action_params: reasoning.params,
    timestamp: new Date(),
  };
  
  // Execute action (pass patternMatch for routing_metadata)
  const tier3Result = executeReasoningAction(reasoning, state, step, patternMatch);
  return { ...originalIntentUpdate, ...tier3Result };
}

// ============================================================================
// Query Extraction
// ============================================================================

/**
 * Extract the user query from state
 */
function extractQuery(state: MultiAgentState): string {
  // Find the last HumanMessage
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];
    if (msg instanceof HumanMessage || msg._getType?.() === 'human') {
      return typeof msg.content === 'string' ? msg.content : String(msg.content);
    }
  }
  return '';
}

// ============================================================================
// LLM Reasoning Generation
// ============================================================================

/**
 * Generate reasoning using LLM (with pattern match context)
 */
async function generateReasoning(
  state: MultiAgentState,
  patternMatch: PatternMatch
): Promise<Reasoning> {
  const llm = LLMFactory.getLLMForTask('reasoning');
  
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildReasoningPrompt(state, patternMatch);
  
  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ]);
  
  // Parse JSON response
  const content = typeof response.content === 'string' 
    ? response.content 
    : JSON.stringify(response.content);
  
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('❌ [AGENTIC-SUPERVISOR] Failed to parse reasoning response');
    return {
      thought: 'Unable to parse reasoning, defaulting to finalize',
      action: 'finalize',
      params: {},
    };
  }
  
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('❌ [AGENTIC-SUPERVISOR] JSON parse error:', error);
    return {
      thought: 'JSON parse failed, defaulting to finalize',
      action: 'finalize',
      params: {},
    };
  }
}

/**
 * Build enhanced system prompt with explicit decision rules
 * 
 * NEW: Uses SupervisorPromptGenerator for dynamic prompt generation
 * from Agent Registry instead of hardcoded agent descriptions.
 */
function buildSystemPrompt(): string {
  // ============================================================================
  // OPTION 1: Use Dynamic Prompt Generator (RECOMMENDED)
  // ============================================================================
  // Generates complete prompt from Agent Registry including:
  // - All registered agents with capabilities
  // - Capability-to-agent mapping
  // - Dependency graph
  // - Routing examples
  const USE_DYNAMIC_PROMPT = process.env.USE_DYNAMIC_SUPERVISOR_PROMPT !== 'false';
  
  if (USE_DYNAMIC_PROMPT) {
    console.log('🎯 [AGENTIC-SUPERVISOR] Using dynamic prompt generator');
    const basePrompt = SupervisorPromptGenerator.generateSupervisorPrompt();
    
    // Add agentic-specific instructions to the dynamically generated prompt
    return `${basePrompt}

═══════════════════════════════════════════════════════════════════════════════
AGENTIC SUPERVISOR ENHANCEMENTS
═══════════════════════════════════════════════════════════════════════════════

CRITICAL: YOU ARE THE DECISION-MAKER, NOT A QUESTIONNAIRE BOT

DEFAULT BEHAVIOR: Take action whenever you have sufficient information (>= 80% confidence)
EXCEPTION: Only ask for clarification when confidence < 30% AND critical info is COMPLETELY ABSENT

═══════════════════════════════════════════════════════════════════════════════
IMPORTANT PRINCIPLES
═══════════════════════════════════════════════════════════════════════════════

1. DEFAULT TO ACTION, NOT CLARIFICATION
   - If you have 80%+ of needed info → ACT
   - Only clarify if critical info is 100% absent
   
2. TRUST DOWNSTREAM AGENTS
   - Weather agent can look up ports you don't recognize
   - Route agent can handle port name variations
   - Don't clarify just because you're uncertain
   
3. USE REASONABLE DEFAULTS
   - Missing date? → Assume current date
   - Unclear terminal? → Agent will figure it out
   
4. NEVER CLARIFY FOR MINOR UNCERTAINTIES
   - ❌ DON'T: "I see Singapore, but which specific terminal?"
   - ✅ DO: Call weather_agent, let it figure out terminals

═══════════════════════════════════════════════════════════════════════════════
ACTIONS YOU CAN TAKE
═══════════════════════════════════════════════════════════════════════════════

1. "call_agent" - Route to specific agent
   When: Confidence >= 80%
   Params: { "agent": "agent_id" }

2. "validate" - Validate prerequisites
   When: Need to check state before proceeding
   Params: { "check": "description" }

3. "recover" - Attempt error recovery with CORRECTIONS
   When: An agent has failed due to invalid/misspelled data
   Params: {
     "recovery_action": "retry_agent" | "skip_agent" | "ask_user",
     "agent": "agent_name",
     "corrected_params": { ... },
     "reason": "explanation"
   }

4. "clarify" - Ask user for clarification
   When: Confidence < 30% AND critical info completely missing
   Params: { "question": "specific question about missing info" }

5. "finalize" - Return response
   When: All necessary agents have completed
   Params: {}

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT (STRICT JSON)
═══════════════════════════════════════════════════════════════════════════════

{
  "thought": "Your reasoning: What info do I have? What's my confidence? What should I do?",
  "action": "call_agent" | "validate" | "recover" | "clarify" | "finalize",
  "params": { ... }
}

CRITICAL: 
- Always return valid JSON
- Be DECISIVE (default to action)
- Only clarify when confidence < 30%
- When retrying failed agents, provide corrected_params to fix the issue`;
  }
  
  // ============================================================================
  // OPTION 2: Legacy Hardcoded Prompt (Fallback)
  // ============================================================================
  console.log('⚠️ [AGENTIC-SUPERVISOR] Using legacy hardcoded prompt');
  const agentDescriptions = getAgentDescriptions();
  
  return `You are an intelligent maritime operations coordinator with a DECISIVE mindset.
Your job is to make CONFIDENT routing decisions based on available information.

AVAILABLE AGENTS:
${agentDescriptions}

═══════════════════════════════════════════════════════════════════════════════
CRITICAL: YOU ARE THE DECISION-MAKER, NOT A QUESTIONNAIRE BOT
═══════════════════════════════════════════════════════════════════════════════

DEFAULT BEHAVIOR: Take action whenever you have sufficient information (>= 80% confidence)
EXCEPTION: Only ask for clarification when confidence < 30% AND critical info is COMPLETELY ABSENT

═══════════════════════════════════════════════════════════════════════════════
DECISION MATRIX
═══════════════════════════════════════════════════════════════════════════════

🌤️ PORT WEATHER QUERIES:
┌────────────────────────────────────────────────────────────────────────────┐
│ Required: Port name (or port code)                                         │
│ Optional: Date (default = current date if missing)                         │
│ Action: call_agent → weather_agent                                         │
│                                                                             │
│ ✅ HIGH CONFIDENCE (Proceed):                                              │
│   - "weather at Singapore" (port clear)                                   │
│   - "weather condition at Singapore on 22nd jan" (all info present)       │
│   - "Singapore port weather" (port clear)                                 │
│                                                                             │
│ ❌ LOW CONFIDENCE (Clarify):                                               │
│   - "weather at port" (which port? - generic word)                        │
│   - "weather" (where? - no location at all)                               │
└────────────────────────────────────────────────────────────────────────────┘

🗺️ ROUTE CALCULATION QUERIES:
┌────────────────────────────────────────────────────────────────────────────┐
│ Required: Origin port AND Destination port                                 │
│ Action: call_agent → route_agent                                           │
│                                                                             │
│ ✅ HIGH CONFIDENCE (Proceed):                                              │
│   - "route from Singapore to Rotterdam" (both ports clear)                │
│   - "Singapore Rotterdam route" (both identifiable)                        │
│                                                                             │
│ ❌ LOW CONFIDENCE (Clarify):                                               │
│   - "route to Rotterdam" (from where? - missing origin)                   │
│   - "route from Singapore" (to where? - missing destination)              │
└────────────────────────────────────────────────────────────────────────────┘

⛽ BUNKER PLANNING QUERIES:
┌────────────────────────────────────────────────────────────────────────────┐
│ Required: Route information (origin + destination)                         │
│ Depends on: route_data in state                                            │
│ Action: If route exists → bunker_agent, else → route_agent first          │
│                                                                             │
│ ✅ HIGH CONFIDENCE (Proceed):                                              │
│   - "cheapest bunker Singapore to Rotterdam" (route info present)         │
│   - "bunker recommendation" (IF route_data already in state)              │
│                                                                             │
│ ❌ LOW CONFIDENCE (Clarify):                                               │
│   - "cheapest bunker" (what route? - no route info)                       │
└────────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════
IMPORTANT PRINCIPLES
═══════════════════════════════════════════════════════════════════════════════

1. DEFAULT TO ACTION, NOT CLARIFICATION
   - If you have 80%+ of needed info → ACT
   - Only clarify if critical info is 100% absent
   
2. TRUST DOWNSTREAM AGENTS
   - Weather agent can look up ports you don't recognize
   - Route agent can handle port name variations
   - Don't clarify just because you're uncertain
   
3. USE REASONABLE DEFAULTS
   - Missing date? → Assume current date
   - Unclear terminal? → Agent will figure it out
   
4. NEVER CLARIFY FOR MINOR UNCERTAINTIES
   - ❌ DON'T: "I see Singapore, but which specific terminal?"
   - ✅ DO: Call weather_agent, let it figure out terminals

═══════════════════════════════════════════════════════════════════════════════
ACTIONS YOU CAN TAKE
═══════════════════════════════════════════════════════════════════════════════

1. "call_agent" - Route to specific agent
   When: Confidence >= 80%
   Params: { "agent": "route_agent" | "weather_agent" | "bunker_agent" | "compliance_agent" }

2. "validate" - Validate prerequisites
   When: Need to check state before proceeding
   Params: { "check": "description" }

3. "recover" - Attempt error recovery with CORRECTIONS
   When: An agent has failed due to invalid/misspelled data
   Params structure:
   {
     "recovery_action": "retry_agent" | "skip_agent" | "ask_user",
     "agent": "agent_name",
     "corrected_params": {  // REQUIRED for retry_agent when fixing data issues
       "origin_port": "JPCHB",      // Use UN/LOCODE format
       "destination_port": "SGSIN"  // Use UN/LOCODE format
     },
     "reason": "Brief explanation (e.g., 'Fixed typo: sigapore → SGSIN')"
   }
   
   CRITICAL: When recovery_action is "retry_agent" and the failure was due to 
   invalid/misspelled ports, you MUST provide corrected_params. The agent will 
   use these corrected parameters directly instead of re-parsing the query.
   
   WPI_* CODES: Do NOT replace a WPI_* port code (e.g. WPI_710 for Port Clyde) with a 
   guessed UN/LOCODE (e.g. GBPCD). WPI_* codes are valid World Port Index IDs. If the 
   error was "Unknown port code: WPI_*", retry WITHOUT changing the port codes in 
   corrected_params, or use ask_user instead of substituting a different code.

4. "clarify" - Ask user for clarification
   When: Confidence < 30% AND critical info completely missing
   Params: { "question": "specific question about missing info" }

5. "finalize" - Return response
   When: All necessary agents have completed
   Params: {}

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT (STRICT JSON)
═══════════════════════════════════════════════════════════════════════════════

{
  "thought": "Your reasoning: What info do I have? What's my confidence? What should I do?",
  "action": "call_agent" | "validate" | "recover" | "clarify" | "finalize",
  "params": { ... }
}

═══════════════════════════════════════════════════════════════════════════════
RECOVERY EXAMPLE (Port Typo Correction)
═══════════════════════════════════════════════════════════════════════════════

User Query: "route from Chiba to sigapore"
Agent Error: "Could not identify destination port 'sigapore'. Did you mean 'Singapore' (SGSIN)?"

CORRECT RECOVERY RESPONSE:
{
  "thought": "The route_agent failed because 'sigapore' is misspelled. The error suggests SGSIN (Singapore). I should retry with the corrected port codes: JPCHB (Chiba) and SGSIN (Singapore).",
  "action": "recover",
  "params": {
    "recovery_action": "retry_agent",
    "agent": "route_agent",
    "corrected_params": {
      "origin_port": "JPCHB",
      "destination_port": "SGSIN"
    },
    "reason": "Corrected typo: 'sigapore' → 'Singapore' (SGSIN)"
  }
}

CRITICAL: 
- Always return valid JSON
- Be DECISIVE (default to action)
- Only clarify when confidence < 30%
- When retrying failed agents, provide corrected_params to fix the issue`;
}

/**
 * Build reasoning prompt with pattern match context
 */
function buildReasoningPrompt(state: MultiAgentState, patternMatch: PatternMatch): string {
  const query = extractQuery(state);
  const stateSummary = summarizeState(state);
  const agentStatus = summarizeAgentStatus(state);
  const recentReasoning = summarizeRecentReasoning(state);
  
  // Build error context if any agent failed
  const errorContext = buildErrorContext(state);
  
  return `
═══════════════════════════════════════════════════════════════════════════════
CURRENT SITUATION
═══════════════════════════════════════════════════════════════════════════════

USER QUERY: "${query}"

PATTERN ANALYSIS (from Tier 1):
  Type: ${patternMatch.type}
  Confidence: ${patternMatch.confidence}%
  Agent Suggestion: ${patternMatch.agent || 'none'}
  Extracted Data: ${JSON.stringify(patternMatch.extracted_data || {})}
  Reason: ${patternMatch.reason || 'N/A'}

AVAILABLE DATA:
${stateSummary}

AGENT STATUS:
${agentStatus}
${errorContext}

RECENT REASONING:
${recentReasoning}

═══════════════════════════════════════════════════════════════════════════════
SUPERVISOR CAPABILITIES (Error Recovery)
═══════════════════════════════════════════════════════════════════════════════

When retrying a failed agent, you can provide CORRECTED PARAMETERS that bypass
the agent's extraction logic. This is critical for fixing typos/misspellings.

Example: If route_agent fails on "sigapore" (typo), retry with:
{
  "action": "recover",
  "params": {
    "recovery_action": "retry_agent",
    "agent": "route_agent",
    "corrected_params": {
      "origin_port": "JPCHB",      // UN/LOCODE for Chiba
      "destination_port": "SGSIN"  // UN/LOCODE for Singapore (corrected)
    },
    "reason": "Fixed typo: sigapore → SGSIN"
  }
}

The agent will use your corrected port codes DIRECTLY, skipping extraction.

═══════════════════════════════════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════════════════════════════════

Analyze the situation and decide the next action.

IMPORTANT CHECKS:
✓ Pattern confidence is ${patternMatch.confidence}% - ${patternMatch.confidence >= 80 ? 'HIGH (should act)' : patternMatch.confidence >= 30 ? 'MEDIUM (use judgment)' : 'LOW (may clarify)'}
✓ Extracted data: ${JSON.stringify(patternMatch.extracted_data)}
✓ If query has a port name → call weather_agent (don't clarify for minor details)
✓ If query has origin AND destination → call route_agent
✓ If agent failed previously → provide corrected_params in recovery action
✓ If all required data available → finalize

RECOVERY DECISION:
- Agent failed due to typo/misspelling? → retry with corrected_params (fix the typo!)
- Agent failed due to missing critical data? → ask_user for clarification
- Agent failed for unknown reason after 2+ attempts? → skip_agent and continue

CONFIDENCE CALIBRATION:
- Port name present (even if unknown to you) = 90% confidence → ACT
- Date missing but can default to today = Still 90% confidence → ACT
- Generic word like "port" with no name = 20% confidence → CLARIFY
- No location at all = 0% confidence → CLARIFY

Remember: Default to ACTION (call_agent), not CLARIFICATION!

Provide your reasoning and next action as JSON.`;
}

/**
 * Build error context for failed agents
 */
function buildErrorContext(state: MultiAgentState): string {
  const errors = state.agent_errors || {};
  const errorMessages: string[] = [];
  
  for (const [agent, errorInfo] of Object.entries(errors)) {
    if (errorInfo?.error) {
      errorMessages.push(`\n⚠️ ${agent} ERROR: ${errorInfo.error}`);
    }
  }
  
  if (errorMessages.length === 0) {
    return '';
  }
  
  return `
AGENT ERRORS:${errorMessages.join('')}

RECOVERY HINT: If error mentions a typo like "sigapore", retry with corrected_params.
Common port codes: SGSIN (Singapore), NLRTM (Rotterdam), JPCHB (Chiba), AEDXB (Dubai).
Do NOT replace WPI_* codes (e.g. WPI_710) with a guessed UN/LOCODE like GBPCD; retry without changing ports or ask_user.`;
}

// ============================================================================
// State Summarization
// ============================================================================

/**
 * Summarize current state for reasoning
 */
function summarizeState(state: MultiAgentState): string {
  const items: string[] = [];
  
  if (state.route_data) {
    items.push(`✅ Route: ${(state.route_data.origin_port_name ?? state.route_data.origin_port_code)} → ${(state.route_data.destination_port_name ?? state.route_data.destination_port_code)} (${state.route_data.distance_nm}nm)`);
  } else {
    items.push('❌ Route: Not calculated');
  }
  
  if (state.vessel_timeline) {
    items.push(`✅ Timeline: ${state.vessel_timeline.length} waypoints`);
  }
  
  if (state.weather_forecast) {
    items.push(`✅ Weather forecast: ${state.weather_forecast.length} points`);
  }
  
  if (state.weather_consumption) {
    items.push(`✅ Weather consumption: +${state.weather_consumption.consumption_increase_percent.toFixed(1)}%`);
  }
  
  if (state.standalone_port_weather) {
    items.push(`✅ Port weather: ${state.standalone_port_weather.port_name}`);
  }
  
  if (state.bunker_ports && state.bunker_ports.length > 0) {
    items.push(`✅ Bunker ports: ${state.bunker_ports.length} found`);
  }
  
  if (state.bunker_analysis?.recommendations && state.bunker_analysis.recommendations.length > 0) {
    items.push(`✅ Bunker analysis: ${state.bunker_analysis.recommendations.length} options`);
  }
  
  if (state.compliance_data) {
    items.push('✅ Compliance: ECA validated');
  }
  
  return items.length > 0 ? items.join('\n') : 'No data collected yet';
}

/**
 * Summarize agent status
 */
function summarizeAgentStatus(state: MultiAgentState): string {
  const status = state.agent_status || {};
  const errors = state.agent_errors || {};
  const items: string[] = [];
  
  const allAgents = ['route_agent', 'compliance_agent', 'weather_agent', 'bunker_agent'];
  
  for (const agent of allAgents) {
    const result = status[agent];
    const error = errors[agent];
    
    if (result === 'success') {
      items.push(`✅ ${agent}: SUCCESS`);
    } else if (result === 'failed') {
      items.push(`❌ ${agent}: FAILED${error ? ` - ${error.error}` : ''}`);
    } else if (result === 'skipped') {
      items.push(`⏭️ ${agent}: SKIPPED`);
    } else {
      items.push(`⏳ ${agent}: Not executed`);
    }
  }
  
  return items.join('\n');
}

/**
 * Summarize recent reasoning steps
 */
function summarizeRecentReasoning(state: MultiAgentState): string {
  const history = state.reasoning_history || [];
  
  if (history.length === 0) {
    return 'None yet (first reasoning step)';
  }
  
  const recentSteps = history.slice(-3);
  return recentSteps.map(step => 
    `Step ${step.step_number}: ${step.thought.substring(0, 80)}... → ${step.action}`
  ).join('\n');
}

/**
 * Get agent descriptions from registry
 */
function getAgentDescriptions(): string {
  const agents = AgentRegistry.getAllAgents();
  return agents.map(agent => {
    const prereqs = agent.prerequisites.length > 0 
      ? `Prerequisites: ${agent.prerequisites.join(', ')}` 
      : 'Prerequisites: None';
    return `- ${agent.agent_name}: ${agent.description} (${prereqs})`;
  }).join('\n');
}

// ============================================================================
// Action Execution
// ============================================================================

/**
 * Execute reasoning action
 */
async function executeReasoningAction(
  reasoning: Reasoning,
  state: MultiAgentState,
  step: ReasoningStep,
  patternMatch: PatternMatch
): Promise<Partial<MultiAgentState>> {
  const routing_metadata = buildRoutingMetadataForTier3(reasoning, patternMatch);
  const tier3Query = extractQuery(state);
  logRoutingDecision(tier3Query, state.correlation_id || 'unknown', routing_metadata);
  console.log('📋 [AGENTIC-SUPERVISOR] Setting routing_metadata (Tier 3):', {
    matched_intent: routing_metadata.matched_intent,
    target_agent: routing_metadata.target_agent,
    classification_method: routing_metadata.classification_method,
  });

  switch (reasoning.action) {
    case 'call_agent':
      return handleCallAgent(reasoning, state, step, routing_metadata);
      
    case 'validate':
      return handleValidate(reasoning, state, step);
      
    case 'recover':
      return handleRecover(reasoning, state, step, routing_metadata);
      
    case 'clarify':
      return handleClarify(reasoning, state, step, routing_metadata);
      
    case 'finalize':
      return handleFinalize(reasoning, state, step, routing_metadata);
      
    default:
      console.error(`❌ [AGENTIC-SUPERVISOR] Unknown action: ${reasoning.action}`);
      return handleFinalize(reasoning, state, step, routing_metadata);
  }
}

/**
 * Handle call_agent action
 */
function handleCallAgent(
  reasoning: Reasoning,
  state: MultiAgentState,
  step: ReasoningStep,
  routing_metadata: RoutingMetadata
): Partial<MultiAgentState> {
  const agentName = reasoning.params?.agent;

  if (!agentName) {
    console.error('❌ [AGENTIC-SUPERVISOR] No agent specified');
    return {
      next_agent: 'finalize',
      current_thought: 'No agent specified, finalizing',
      reasoning_history: [step],
      routing_metadata: { ...routing_metadata, target_agent: 'finalize' },
    };
  }

  // Task-complete guard: if vessel_info_agent already succeeded and we have
  // vessel_specs, avoid re-calling it (prevents infinite loop for "how many vessels").
  if (
    agentName === 'vessel_info_agent' &&
    state.agent_status?.vessel_info_agent === 'success' &&
    state.vessel_specs?.length
  ) {
    console.log(
      '✅ [AGENTIC-SUPERVISOR] vessel_info_agent already succeeded with vessel_specs, routing to finalize'
    );
    step.observation = 'Vessel data already available, finalizing';
    return {
      next_agent: 'finalize',
      current_thought: 'Vessel info already retrieved, synthesizing response',
      reasoning_history: [step],
      needs_clarification: false,
      routing_metadata: { ...routing_metadata, target_agent: 'finalize' },
    };
  }

  // Derive valid agents from registry for scalability
  const registryAgentNames = AgentRegistry.getAllAgents().map((a) => a.agent_name);
  const validAgents = [...new Set([...registryAgentNames, 'supervisor'])];
  if (!validAgents.includes(agentName)) {
    console.error(`❌ [AGENTIC-SUPERVISOR] Invalid agent: ${agentName}`);
    return {
      next_agent: 'finalize',
      current_thought: `Invalid agent ${agentName}, finalizing`,
      reasoning_history: [step],
      routing_metadata: { ...routing_metadata, target_agent: 'finalize' },
    };
  }

  console.log(`🎯 [AGENTIC-SUPERVISOR] Routing to: ${agentName}`);
  step.observation = `Routing to ${agentName}`;

  return {
    next_agent: agentName,
    current_thought: reasoning.thought,
    reasoning_history: [step],
    needs_clarification: false,
    routing_metadata,
  };
}

/**
 * Handle validate action
 */
function handleValidate(
  reasoning: Reasoning,
  state: MultiAgentState,
  step: ReasoningStep
): Partial<MultiAgentState> {
  console.log('✓ [AGENTIC-SUPERVISOR] Validating prerequisites');
  step.observation = 'Validation complete';
  
  return {
    current_thought: reasoning.thought,
    reasoning_history: [step],
    next_agent: 'supervisor',
  };
}

/**
 * Handle recover action with parameter override support
 * 
 * When the LLM provides corrected_params during recovery, these are passed
 * to the agent via state.port_overrides (for route_agent) or state.agent_overrides
 * (for other agents). This allows the agent to bypass extraction logic and use
 * the supervisor's validated corrections directly.
 */
function handleRecover(
  reasoning: Reasoning,
  state: MultiAgentState,
  step: ReasoningStep,
  routing_metadata: RoutingMetadata
): Partial<MultiAgentState> {
  console.log('🔄 [AGENTIC-SUPERVISOR] Attempting error recovery');
  
  const recoveryAction = reasoning.params?.recovery_action;
  const targetAgent = reasoning.params?.agent as string | undefined;
  
  if (recoveryAction === 'retry_agent' && targetAgent) {
    console.log(`🔄 [AGENTIC-SUPERVISOR] Retrying ${targetAgent}`);
    step.observation = `Retrying ${targetAgent}`;
    
    // Clear agent's failed status to allow retry
    const newAgentStatus = { ...state.agent_status };
    delete newAgentStatus[targetAgent];
    
    // Extract corrected parameters from LLM reasoning
    // LLM might use different field names, so check all variations
    const correctedParams = reasoning.params?.corrected_params as Record<string, unknown> | undefined ||
                            reasoning.params?.override_ports as Record<string, unknown> | undefined ||
                            reasoning.params?.override_params as Record<string, unknown> | undefined;
    
    // Build base state update
    const stateUpdate: Partial<MultiAgentState> = {
      next_agent: targetAgent,
      current_thought: reasoning.thought,
      reasoning_history: [step],
      recovery_attempts: 1, // Will be added to existing count via reducer
      agent_status: newAgentStatus,
      routing_metadata: { ...routing_metadata, target_agent: targetAgent },
    };
    
    // If this is route_agent and we have corrected port parameters, pass them via port_overrides
    if (targetAgent === 'route_agent' && correctedParams) {
      const originPort = (correctedParams.origin_port || correctedParams.origin) as string | undefined;
      let destPort = (correctedParams.destination_port || correctedParams.destination) as string | undefined;

      // Do not apply a guessed 5-char UN/LOCODE when the failure was "Unknown port code: WPI_*"
      const routeError = state.agent_errors?.route_agent?.error ?? '';
      if (routeError.includes('Unknown port code: WPI_') && destPort && /^[A-Z0-9]{5}$/.test(destPort)) {
        console.warn('⚠️ [AGENTIC-SUPERVISOR] Ignoring corrected destination (WPI_* error):', destPort, '- retry will re-extract ports');
        destPort = undefined;
      }

      if (originPort || destPort) {
        console.log('🎯 [AGENTIC-SUPERVISOR] Passing corrected ports to route_agent:');
        if (originPort) console.log(`   Origin: ${originPort}`);
        if (destPort) console.log(`   Destination: ${destPort}`);

        stateUpdate.port_overrides = {
          origin: originPort,
          destination: destPort,
        };

        step.observation = `Retrying ${targetAgent} with corrected ports: ${originPort} → ${destPort}`;
      } else if (routeError.includes('Unknown port code: WPI_')) {
        step.observation = `Retrying ${targetAgent} without port overrides (WPI_* codes preserved)`;
      } else {
        console.warn('⚠️ [AGENTIC-SUPERVISOR] corrected_params found but no port data:', correctedParams);
      }
    }
    
    // For other agents, use the generic agent_overrides
    if (targetAgent !== 'route_agent' && correctedParams) {
      console.log(`🎯 [AGENTIC-SUPERVISOR] Passing corrected params to ${targetAgent}:`, correctedParams);
      stateUpdate.agent_overrides = {
        [targetAgent]: correctedParams,
      };
      step.observation = `Retrying ${targetAgent} with corrected parameters`;
    }
    
    // Log the reason if provided
    if (reasoning.params?.reason) {
      console.log(`📝 [AGENTIC-SUPERVISOR] Recovery reason: ${reasoning.params.reason}`);
    }
    
    return stateUpdate;
  }
  
  if (recoveryAction === 'skip_agent') {
    console.log('⏭️ [AGENTIC-SUPERVISOR] Skipping failed agent');
    step.observation = `Skipping ${targetAgent || 'failed agent'}`;
    
    const newAgentStatus = { ...state.agent_status };
    if (targetAgent) {
      newAgentStatus[targetAgent] = 'skipped';
    }
    
    return {
      next_agent: 'supervisor',
      current_thought: reasoning.thought,
      reasoning_history: [step],
      agent_status: newAgentStatus,
    };
  }
  
  if (recoveryAction === 'ask_user') {
    console.log('❓ [AGENTIC-SUPERVISOR] Asking user for help');
    step.observation = 'Need user clarification';
    
    return {
      needs_clarification: true,
      clarification_question: reasoning.params?.question || 'Could you provide more details?',
      current_thought: reasoning.thought,
      reasoning_history: [step],
      next_agent: 'finalize',
      routing_metadata,
    };
  }
  
  return handleFinalize(reasoning, state, step, routing_metadata);
}

/**
 * Handle clarify action
 */
function handleClarify(
  reasoning: Reasoning,
  state: MultiAgentState,
  step: ReasoningStep,
  routing_metadata: RoutingMetadata
): Partial<MultiAgentState> {
  console.log('❓ [AGENTIC-SUPERVISOR] Need user clarification');
  
  const question = reasoning.params?.question || 'Could you provide more details?';
  step.observation = `Asking: "${question}"`;
  
  return {
    needs_clarification: true,
    clarification_question: question,
    current_thought: reasoning.thought,
    reasoning_history: [step],
    next_agent: 'finalize',
    routing_metadata,
  };
}

/**
 * Handle finalize action
 */
function handleFinalize(
  reasoning: Reasoning,
  state: MultiAgentState,
  step: ReasoningStep,
  routing_metadata: RoutingMetadata
): Partial<MultiAgentState> {
  console.log('✅ [AGENTIC-SUPERVISOR] Finalizing');
  step.observation = 'Proceeding to finalize';
  
  return {
    next_agent: 'finalize',
    current_thought: reasoning.thought,
    reasoning_history: [step],
    needs_clarification: false,
    routing_metadata,
  };
}

// ============================================================================
// Exports
// ============================================================================

export { MAX_REASONING_STEPS, MAX_RECOVERY_ATTEMPTS };
