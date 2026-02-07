/**
 * Intent Classification Observability Logger
 *
 * Logs intent classification events for observability and aggregates metrics.
 * Uses Axiom when available, falls back to structured console.log.
 */

import { createHash } from 'crypto';
import { logCustomEvent } from './axiom-logger';

// ============================================================================
// Query Hash (matches IntentClassifier)
// ============================================================================

export function hashQueryForIntent(query: string): string {
  const normalized = query.toLowerCase().trim().substring(0, 500);
  return createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

// ============================================================================
// Types
// ============================================================================

export type ClassificationMethod =
  | 'llm_intent_classifier'
  | 'pattern_match'
  | 'llm_reasoning';

export interface IntentClassificationLog {
  correlation_id: string;
  query: string;
  query_hash: string;
  classification_method: ClassificationMethod;
  matched_agent: string;
  matched_intent: string;
  confidence: number;
  reasoning: string;
  cache_hit: boolean;
  latency_ms: number;
  cost_usd: number;
  timestamp: number;
}

export interface ClassificationMetrics {
  total_classifications: number;
  cache_hit_rate: number;
  average_confidence: number;
  by_method: Record<ClassificationMethod, number>;
  avg_latency_by_method: Record<ClassificationMethod, number>;
  total_cost_usd: number;
}

// ============================================================================
// In-Memory Store for Aggregation
// ============================================================================

const MAX_STORED_LOGS = 10_000;
const logs: IntentClassificationLog[] = [];

function addToStore(entry: IntentClassificationLog): void {
  logs.push(entry);
  if (logs.length > MAX_STORED_LOGS) {
    logs.splice(0, logs.length - MAX_STORED_LOGS);
  }
}

// ============================================================================
// Logging
// ============================================================================

/**
 * Log an intent classification event.
 * Uses Axiom logCustomEvent when AXIOM_TOKEN is set, else structured console.log.
 */
export function logIntentClassification(entry: IntentClassificationLog): void {
  addToStore(entry);

  const payload = {
    type: 'intent_classification',
    query: entry.query.substring(0, 200),
    query_hash: entry.query_hash,
    classification_method: entry.classification_method,
    matched_agent: entry.matched_agent,
    matched_intent: entry.matched_intent,
    confidence: entry.confidence,
    reasoning: entry.reasoning.substring(0, 500),
    cache_hit: entry.cache_hit,
    latency_ms: entry.latency_ms,
    cost_usd: entry.cost_usd,
    timestamp: entry.timestamp,
  };

  try {
    logCustomEvent('intent_classification', entry.correlation_id, payload);
  } catch {
    // Axiom may not be configured - fallback to console
  }

  console.log(
    `[INTENT-CLASSIFICATION] ${entry.correlation_id} | method=${entry.classification_method} | agent=${entry.matched_agent} | intent=${entry.matched_intent} | confidence=${entry.confidence} | cache_hit=${entry.cache_hit} | latency_ms=${entry.latency_ms}`
  );
}

// ============================================================================
// Aggregation
// ============================================================================

/**
 * Get aggregated classification metrics from stored logs.
 */
export function getClassificationMetrics(): ClassificationMetrics {
  const total = logs.length;
  if (total === 0) {
    return {
      total_classifications: 0,
      cache_hit_rate: 0,
      average_confidence: 0,
      by_method: {
        llm_intent_classifier: 0,
        pattern_match: 0,
        llm_reasoning: 0,
      },
      avg_latency_by_method: {
        llm_intent_classifier: 0,
        pattern_match: 0,
        llm_reasoning: 0,
      },
      total_cost_usd: 0,
    };
  }

  const cacheHits = logs.filter((l) => l.cache_hit).length;
  const sumConfidence = logs.reduce((s, l) => s + l.confidence, 0);
  const totalCost = logs.reduce((s, l) => s + l.cost_usd, 0);

  const byMethod: Record<ClassificationMethod, number> = {
    llm_intent_classifier: 0,
    pattern_match: 0,
    llm_reasoning: 0,
  };
  const sumLatencyByMethod: Record<ClassificationMethod, number> = {
    llm_intent_classifier: 0,
    pattern_match: 0,
    llm_reasoning: 0,
  };
  const countByMethod: Record<ClassificationMethod, number> = {
    llm_intent_classifier: 0,
    pattern_match: 0,
    llm_reasoning: 0,
  };

  for (const l of logs) {
    const m = l.classification_method;
    if (m in byMethod) {
      byMethod[m as ClassificationMethod]++;
      countByMethod[m as ClassificationMethod]++;
      sumLatencyByMethod[m as ClassificationMethod] += l.latency_ms;
    }
  }

  const avgLatencyByMethod: Record<ClassificationMethod, number> = {
    llm_intent_classifier:
      countByMethod.llm_intent_classifier > 0
        ? sumLatencyByMethod.llm_intent_classifier / countByMethod.llm_intent_classifier
        : 0,
    pattern_match:
      countByMethod.pattern_match > 0
        ? sumLatencyByMethod.pattern_match / countByMethod.pattern_match
        : 0,
    llm_reasoning:
      countByMethod.llm_reasoning > 0
        ? sumLatencyByMethod.llm_reasoning / countByMethod.llm_reasoning
        : 0,
  };

  return {
    total_classifications: total,
    cache_hit_rate: cacheHits / total,
    average_confidence: sumConfidence / total,
    by_method: byMethod,
    avg_latency_by_method: avgLatencyByMethod,
    total_cost_usd: totalCost,
  };
}
