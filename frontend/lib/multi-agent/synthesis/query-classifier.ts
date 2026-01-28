/**
 * Query classification system for maritime fuel management.
 * Two-tier: Tier 1 (deterministic patterns) → Tier 2 (state inference) → fallback informational.
 */

import type { MultiAgentState } from '../state';
import { matchDeterministicPatterns } from './classifiers/tier1-deterministic';
import { inferFromState } from './classifiers/tier2-state-inference';
import { trackClassification as recordClassificationMetrics } from '@/lib/telemetry/classification-metrics';

// Re-export for consumers that expect "AgentState"
export type AgentState = MultiAgentState;

// ============================================================================
// Types
// ============================================================================

/** Supported query types for template and synthesis selection. */
export type QueryType =
  | 'route-only'
  | 'bunker_planning'
  | 'weather-analysis'
  | 'cost-comparison'
  | 'informational'
  | 'validation';

/** Result of query classification. */
export interface QueryClassification {
  queryType: QueryType;
  /** 0–100. Higher = more confident. */
  confidence: number;
  /** How this classification was determined. */
  method: string;
  /** Short human-readable reason. */
  reasoning: string;
}

const TIER1_MIN_CONFIDENCE = 85;
const TIER2_MIN_CONFIDENCE = 75;
const FALLBACK_CONFIDENCE = 50;

/**
 * Classify user query into a template/query type using two-tier fallback.
 *
 * 1. Tier 1: Deterministic pattern matching on message (fast, ~90% of queries).
 * 2. Tier 2: State inference from route_data, bunker_analysis, weather_forecast.
 * 3. Fallback: 'informational' with 50% confidence.
 *
 * @param userMessage - Raw user message.
 * @param state - Current multi-agent state (used for Tier 2 only).
 * @returns QueryClassification with queryType, confidence, method, reasoning.
 */
export function classifyQuery(userMessage: string, state: MultiAgentState): QueryClassification {
  const trimmed = (userMessage || '').trim();

  // Tier 1: deterministic patterns
  const tier1 = matchDeterministicPatterns(trimmed);
  if (tier1.confidence >= TIER1_MIN_CONFIDENCE) {
    console.log(`✅ [QUERY-CLASSIFIER] Tier 1 match: ${tier1.queryType} (${tier1.confidence}%) — ${tier1.reasoning}`);
    recordClassificationMetrics(tier1);
    return tier1;
  }

  // Tier 2: state inference (only if Tier 1 didn't meet threshold)
  const tier2 = inferFromState(state);
  if (tier2.confidence >= TIER2_MIN_CONFIDENCE) {
    console.log(`🔍 [QUERY-CLASSIFIER] Tier 2 inference: ${tier2.queryType} (${tier2.confidence}%) — ${tier2.reasoning}`);
    recordClassificationMetrics(tier2);
    return tier2;
  }

  // Fallback (Tier 3)
  const fallback: QueryClassification = {
    queryType: 'informational',
    confidence: FALLBACK_CONFIDENCE,
    method: 'fallback',
    reasoning: 'No Tier 1/2 match; defaulting to informational',
  };
  console.log(`🔍 [QUERY-CLASSIFIER] Fallback: ${fallback.queryType} (${fallback.confidence}%)`);
  recordClassificationMetrics(fallback);
  return fallback;
}
