/**
 * Classification telemetry for query classifier.
 * Tracks tier usage, pattern hits, and supports identifying patterns to promote from Tier 3 to Tier 1.
 * In-memory storage (server-side); suitable for monitoring and accuracy over time.
 */

/** Minimal shape needed for tracking; avoids circular dependency with query-classifier. */
export interface ClassificationResultForTracking {
  queryType: string;
  confidence: number;
  method: string;
  reasoning: string;
}

// ============================================================================
// Types
// ============================================================================

export interface ClassificationMetrics {
  tier1_hits: number;
  tier2_hits: number;
  tier3_hits: number;
  /** Pattern key (e.g. reasoning) → count. Tier 1 only. */
  tier1_patterns: Record<string, number>;
  total_classifications: number;
  timestamp: Date;
}

const SUMMARY_LOG_INTERVAL = 100;

// ============================================================================
// In-memory store
// ============================================================================

let tier1Hits = 0;
let tier2Hits = 0;
let tier3Hits = 0;
const tier1PatternsMap = new Map<string, number>();
let totalClassifications = 0;
let lastTimestamp = new Date();

// ============================================================================
// Public API
// ============================================================================

/**
 * Record which tier was used from a classification result.
 * Tier 1: method starts with "tier1"
 * Tier 2: method === "tier2-state"
 * Tier 3: method === "fallback" (informational fallback; candidates for promotion to Tier 1)
 */
export function trackClassification(result: ClassificationResultForTracking): void {
  totalClassifications++;
  lastTimestamp = new Date();

  if (result.method.startsWith('tier1')) {
    tier1Hits++;
    const patternKey = result.reasoning || result.method;
    tier1PatternsMap.set(patternKey, (tier1PatternsMap.get(patternKey) ?? 0) + 1);
  } else if (result.method === 'tier2-state') {
    tier2Hits++;
  } else {
    tier3Hits++;
  }

  if (totalClassifications % SUMMARY_LOG_INTERVAL === 0) {
    logSummary();
  }
}

/**
 * Return current metrics snapshot.
 * tier1_patterns is serialized as a plain object for JSON.
 */
export function getMetrics(): ClassificationMetrics {
  const tier1Patterns: Record<string, number> = {};
  tier1PatternsMap.forEach((count, pattern) => {
    tier1Patterns[pattern] = count;
  });
  return {
    tier1_hits: tier1Hits,
    tier2_hits: tier2Hits,
    tier3_hits: tier3Hits,
    tier1_patterns: tier1Patterns,
    total_classifications: totalClassifications,
    timestamp: new Date(lastTimestamp),
  };
}

/**
 * Clear all metrics. Useful for tests or resetting a reporting window.
 */
export function resetMetrics(): void {
  tier1Hits = 0;
  tier2Hits = 0;
  tier3Hits = 0;
  tier1PatternsMap.clear();
  totalClassifications = 0;
  lastTimestamp = new Date();
}

/**
 * Return the most-used Tier 1 patterns, for identifying promotion candidates.
 */
export function getTopPatterns(limit: number): Array<{ pattern: string; count: number }> {
  const entries = Array.from(tier1PatternsMap.entries())
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count);
  return entries.slice(0, limit);
}

// ============================================================================
// Logging
// ============================================================================

function logSummary(): void {
  const total = totalClassifications;
  if (total === 0) return;

  const pct1 = ((tier1Hits / total) * 100).toFixed(1);
  const pct2 = ((tier2Hits / total) * 100).toFixed(1);
  const pct3 = ((tier3Hits / total) * 100).toFixed(1);

  console.log(`📊 [CLASSIFICATION-METRICS] Summary (every ${SUMMARY_LOG_INTERVAL} classifications):`);
  console.log(`   Total: ${total}`);
  console.log(`   Tier 1: ${tier1Hits} (${pct1}%)`);
  console.log(`   Tier 2: ${tier2Hits} (${pct2}%)`);
  console.log(`   Tier 3 (fallback): ${tier3Hits} (${pct3}%)`);

  const top = getTopPatterns(10);
  if (top.length > 0) {
    console.log('   Top Tier 1 patterns:');
    top.forEach(({ pattern, count }, i) => {
      console.log(`     ${i + 1}. [${count}x] ${pattern.slice(0, 60)}${pattern.length > 60 ? '…' : ''}`);
    });
  }
}
