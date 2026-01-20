/**
 * Synthesis Engine
 * 
 * Core logic for cross-agent synthesis using LLM.
 * Analyzes outputs from multiple specialist agents and generates
 * strategic insights, priorities, and cross-agent connections.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MultiAgentState } from '../state';
import { getSynthesisConfig, type SynthesisConfig } from '../../config/synthesis-config-loader';
import { buildSynthesisPrompt } from './synthesis-prompts';
import { isFeatureEnabled } from '../../config/feature-flags';
import { getSynthesisMetrics } from './synthesis-metrics';

// ============================================================================
// Types
// ============================================================================

export interface SynthesisResult {
  success: boolean;
  synthesized_insights?: MultiAgentState['synthesized_insights'];
  error?: string;
  cost_usd?: number;
  duration_ms?: number;
}

interface ShouldRunResult {
  run: boolean;
  reason?: string;
  agentList?: string[];
}

interface LLMResult {
  success: boolean;
  response?: string;
  error?: string;
  cost_usd?: number;
}

// ============================================================================
// Main Synthesis Function
// ============================================================================

/**
 * Generate synthesis from agent outputs
 */
export async function generateSynthesis(
  state: MultiAgentState
): Promise<SynthesisResult> {
  const metrics = getSynthesisMetrics();
  metrics.recordAttempt();
  
  const startTime = Date.now();
  
  try {
    console.log('🧠 [SYNTHESIS] Starting cross-agent synthesis...');
    
    // Step 1: Check if synthesis should run
    const shouldRun = shouldRunSynthesis(state);
    if (!shouldRun.run) {
      console.log(`⏭️ [SYNTHESIS] Skipping: ${shouldRun.reason}`);
      metrics.recordSkipped();
      return {
        success: false,
        error: `Synthesis skipped: ${shouldRun.reason}`,
      };
    }
    
    console.log(`✅ [SYNTHESIS] Will synthesize ${shouldRun.agentList!.length} agents: ${shouldRun.agentList!.join(', ')}`);
    
    // Step 2: Build prompt (async - loads v3 prompt with agent outputs embedded)
    const fullPrompt = await buildSynthesisPrompt(state, shouldRun.agentList!);
    
    if (isFeatureEnabled('SYNTHESIS_DEBUG')) {
      console.log(`📝 [SYNTHESIS-DEBUG] Full prompt:\n${fullPrompt.substring(0, 1000)}...`);
    } else {
      console.log(`📝 [SYNTHESIS] Prompt length: ${fullPrompt.length} chars`);
    }
    
    // Step 3: Call LLM
    const config = getSynthesisConfig();
    const llmResult = await callSynthesisLLM(fullPrompt, config);
    
    if (!llmResult.success) {
      metrics.recordFailure();
      return {
        success: false,
        error: llmResult.error,
        duration_ms: Date.now() - startTime,
      };
    }
    
    // Step 4: Parse and validate response
    const parsedInsights = parseAndValidateSynthesis(llmResult.response!, shouldRun.agentList!);
    
    if (!parsedInsights) {
      metrics.recordFailure();
      return {
        success: false,
        error: 'Failed to parse synthesis response',
        duration_ms: Date.now() - startTime,
      };
    }
    
    // Step 5: Add metadata
    // Note: parsedInsights excludes synthesis_metadata (from Omit), so we construct it fresh
    // The LLM response may include partial metadata which we'll use if present
    const rawParsed = JSON.parse(llmResult.response!.trim().replace(/```json\n?/g, '').replace(/```\n?/g, ''));
    const finalInsights: MultiAgentState['synthesized_insights'] = {
      ...parsedInsights,
      synthesis_metadata: {
        agents_analyzed: shouldRun.agentList!,
        synthesis_model: config.llm.model,
        synthesis_timestamp: Date.now(),
        confidence_score: rawParsed.synthesis_metadata?.confidence_score ?? 0.8,
        filtering_rationale: rawParsed.synthesis_metadata?.filtering_rationale ?? {
          why_surfaced: [],
          why_hidden: [],
        },
      },
    };
    
    const duration = Date.now() - startTime;
    const cost = llmResult.cost_usd || 0;
    
    // Record success metrics
    metrics.recordSuccess(cost, duration);
    
    console.log(`✅ [SYNTHESIS] Completed in ${duration}ms`);
    console.log(`   Query Type: ${finalInsights.query_type}`);
    console.log(`   Strategic Priorities: ${finalInsights.strategic_priorities?.length || 0}`);
    console.log(`   Critical Risks: ${finalInsights.critical_risks?.length || 0}`);
    
    return {
      success: true,
      synthesized_insights: finalInsights,
      cost_usd: cost,
      duration_ms: duration,
    };
    
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ [SYNTHESIS] Error:', message);
    metrics.recordFailure();
    return {
      success: false,
      error: message,
      duration_ms: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Decision Logic: Should Synthesis Run?
// ============================================================================

/**
 * Determine if synthesis should run based on config and state
 */
export function shouldRunSynthesis(state: MultiAgentState): ShouldRunResult {
  // Check: Feature flag first
  if (!isFeatureEnabled('USE_SYNTHESIS')) {
    return { run: false, reason: 'Synthesis disabled via feature flag' };
  }
  
  const config = getSynthesisConfig();
  
  // Check: Is synthesis enabled in config?
  if (!config.enabled) {
    return { run: false, reason: 'Synthesis disabled in config' };
  }
  
  // Get list of successful agents
  const successfulAgents = Object.entries(state.agent_status || {})
    .filter(([_, status]) => status === 'success')
    .map(([agent, _]) => agent);
  
  if (successfulAgents.length === 0) {
    return { run: false, reason: 'No successful agents' };
  }
  
  console.log(`🔍 [SYNTHESIS] Checking ${successfulAgents.length} successful agents`);
  
  // Check: Safety critical (always synthesize if unsafe)
  if (state.rob_safety_status && !state.rob_safety_status.overall_safe) {
    console.log('🚨 [SYNTHESIS] Safety critical - forcing synthesis');
    return { run: true, agentList: successfulAgents };
  }
  
  // Check: Skip combinations (exact match)
  const shouldSkip = config.skip_synthesis_combinations.some(combo => {
    if (combo.length !== successfulAgents.length) return false;
    const sortedCombo = [...combo].sort();
    const sortedAgents = [...successfulAgents].sort();
    return sortedCombo.every((agent, i) => agent === sortedAgents[i]);
  });
  
  if (shouldSkip) {
    return { run: false, reason: 'Agent combination in skip list' };
  }
  
  // Check: Always synthesize combinations (contains all agents in combo)
  const shouldAlwaysSynthesize = config.always_synthesize_combinations.some(combo => {
    return combo.every(agent => successfulAgents.includes(agent));
  });
  
  if (shouldAlwaysSynthesize) {
    console.log('✅ [SYNTHESIS] Special combination detected (always synthesize)');
    return { run: true, agentList: successfulAgents };
  }
  
  // Check: Minimum agents threshold
  if (successfulAgents.length < config.min_agents_for_synthesis) {
    return { 
      run: false, 
      reason: `Only ${successfulAgents.length} agents (need ${config.min_agents_for_synthesis})` 
    };
  }
  
  // All checks passed
  return { run: true, agentList: successfulAgents };
}

// ============================================================================
// LLM Call
// ============================================================================

/**
 * Call LLM for synthesis
 * Uses Anthropic Claude for synthesis tasks
 */
async function callSynthesisLLM(
  prompt: string,
  config: SynthesisConfig
): Promise<LLMResult> {
  try {
    console.log('🤖 [SYNTHESIS-LLM] Calling LLM...');
    
    // Check for API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        success: false,
        error: 'ANTHROPIC_API_KEY not configured',
      };
    }
    
    // Use Anthropic Claude for synthesis
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    
    // Map config model to Anthropic model
    // Config may specify gpt-4o-mini but we use Claude for synthesis
    const model = mapToAnthropicModel(config.llm.model);
    
    const response = await anthropic.messages.create({
      model,
      max_tokens: config.llm.max_tokens,
      temperature: config.llm.temperature,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });
    
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return {
        success: false,
        error: 'No text response from LLM',
      };
    }
    
    // Calculate cost (Anthropic pricing)
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    
    // Claude Haiku pricing (per 1M tokens)
    const costPer1MInputTokens = 0.25;
    const costPer1MOutputTokens = 1.25;
    const cost = (inputTokens / 1_000_000 * costPer1MInputTokens) +
                 (outputTokens / 1_000_000 * costPer1MOutputTokens);
    
    console.log(`✅ [SYNTHESIS-LLM] Success (${inputTokens} in + ${outputTokens} out tokens, ~$${cost.toFixed(4)})`);
    
    return {
      success: true,
      response: textContent.text,
      cost_usd: cost,
    };
    
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ [SYNTHESIS-LLM] Error:', message);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Map config model name to Anthropic model
 * Handles cases where config specifies OpenAI model
 */
function mapToAnthropicModel(configModel: string): string {
  // If already an Anthropic model, use it
  if (configModel.startsWith('claude-')) {
    return configModel;
  }
  
  // Map OpenAI models to equivalent Claude models
  if (configModel === 'gpt-4o-mini' || configModel === 'gpt-4o') {
    // Use Claude Haiku for cost-effective synthesis
    return 'claude-haiku-4-5-20251001';
  }
  
  if (configModel === 'gpt-4-turbo' || configModel === 'gpt-4') {
    // Use Claude Sonnet for higher capability
    return 'claude-sonnet-4-20250514';
  }
  
  // Default to Haiku
  return 'claude-haiku-4-5-20251001';
}

// ============================================================================
// Response Parsing & Validation
// ============================================================================

/**
 * Parse and validate LLM response
 * Returns structured insights or null on failure
 */
function parseAndValidateSynthesis(
  response: string,
  agentList: string[]
): Omit<NonNullable<MultiAgentState['synthesized_insights']>, 'synthesis_metadata'> | null {
  try {
    let jsonStr = response.trim();
    
    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    }
    
    const parsed = JSON.parse(jsonStr);
    
    // DEBUG: Log parsed structure
    console.log('🔍 [SYNTHESIS-DEBUG] Parsed keys:', Object.keys(parsed));
    console.log('🔍 [SYNTHESIS-DEBUG] Response keys:', parsed.response ? Object.keys(parsed.response) : 'NO RESPONSE');
    
    // ===== VALIDATE QUERY TYPE =====
    const validQueryTypes = ['informational', 'decision-required', 'validation', 'comparison'];
    if (!parsed.query_type || !validQueryTypes.includes(parsed.query_type)) {
      console.error('❌ [SYNTHESIS] Invalid query_type:', parsed.query_type);
      return null;
    }
    
    console.log(`✅ [SYNTHESIS] Query type: ${parsed.query_type}`);
    
    // ===== VALIDATE RESPONSE OBJECT =====
    if (!parsed.response) {
      console.error('❌ [SYNTHESIS] Missing response object');
      console.error('🔍 [SYNTHESIS-DEBUG] Full parsed object:', JSON.stringify(parsed, null, 2).substring(0, 2000));
      return null;
    }
    
    // Check that response contains the right key for query type
    const queryType = parsed.query_type;
    const expectedKey = queryType === 'decision-required' ? 'decision' : queryType;
    
    if (!parsed.response[expectedKey]) {
      console.error(`❌ [SYNTHESIS] Missing response.${expectedKey} for query_type ${queryType}`);
      console.error(`🔍 [SYNTHESIS-DEBUG] Available response keys:`, Object.keys(parsed.response));
      console.error(`🔍 [SYNTHESIS-DEBUG] Response content:`, JSON.stringify(parsed.response, null, 2).substring(0, 1000));
      return null;
    }
    
    // ===== VALIDATE TYPE-SPECIFIC FIELDS =====
    switch (queryType) {
      case 'informational':
        if (!parsed.response.informational.answer || !Array.isArray(parsed.response.informational.key_facts)) {
          console.error('❌ [SYNTHESIS] Invalid informational response structure');
          return null;
        }
        break;
        
      case 'decision-required':
        if (!parsed.response.decision.action || !parsed.response.decision.primary_metric) {
          console.error('❌ [SYNTHESIS] Invalid decision response structure');
          return null;
        }
        break;
        
      case 'validation':
        if (!parsed.response.validation.result || !parsed.response.validation.explanation) {
          console.error('❌ [SYNTHESIS] Invalid validation response structure');
          return null;
        }
        const validResults = ['feasible', 'not_feasible', 'risky'];
        if (!validResults.includes(parsed.response.validation.result)) {
          console.error('❌ [SYNTHESIS] Invalid validation result:', parsed.response.validation.result);
          return null;
        }
        break;
        
      case 'comparison':
        if (!parsed.response.comparison.winner || !parsed.response.comparison.winner_reason) {
          console.error('❌ [SYNTHESIS] Invalid comparison response structure');
          return null;
        }
        break;
    }
    
    // ===== VALIDATE DETAILS_TO_SURFACE =====
    if (!parsed.details_to_surface) {
      console.warn('⚠️ [SYNTHESIS] Missing details_to_surface - using defaults (all false)');
      parsed.details_to_surface = {
        show_multi_port_analysis: false,
        show_alternatives: false,
        show_rob_waypoints: false,
        show_weather_details: false,
        show_eca_details: false,
      };
    }
    
    // ===== VALIDATE ARRAYS =====
    if (!Array.isArray(parsed.strategic_priorities)) {
      parsed.strategic_priorities = [];
    }
    
    if (!Array.isArray(parsed.critical_risks)) {
      parsed.critical_risks = [];
    }
    
    if (!Array.isArray(parsed.cross_agent_connections)) {
      parsed.cross_agent_connections = [];
    }
    
    if (!Array.isArray(parsed.hidden_opportunities)) {
      parsed.hidden_opportunities = [];
    }
    
    // Validate priority structure
    parsed.strategic_priorities.forEach((priority: { why?: string; rationale?: string }, idx: number) => {
      if (!priority.why && priority.rationale) {
        // Migrate old 'rationale' field to 'why'
        priority.why = priority.rationale;
        delete priority.rationale;
      }
      if (!priority.why) {
        console.warn(`⚠️ [SYNTHESIS] Priority ${idx + 1} missing 'why' field`);
      }
    });
    
    console.log(`✅ [SYNTHESIS] Validation passed`);
    console.log(`   Strategic priorities: ${parsed.strategic_priorities.length}`);
    console.log(`   Critical risks: ${parsed.critical_risks.length}`);
    console.log(`   Details to surface: ${Object.values(parsed.details_to_surface).filter(Boolean).length}/5`);
    
    return parsed;
    
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ [SYNTHESIS] Parse error:', message);
    return null;
  }
}

