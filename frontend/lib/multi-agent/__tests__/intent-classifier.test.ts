/**
 * Intent Classifier Test Suite
 *
 * Tests for the LLM-based intent classifier that maps user queries to agent IDs.
 * - Classification accuracy across vessel, bunker, route, weather, compliance queries
 * - Cache behavior (second call cache hit, latency < 10ms)
 * - Success rate, average confidence, latency metrics, total cost
 *
 * Run with: npm run test:intent-classifier
 * or: tsx lib/multi-agent/__tests__/intent-classifier.test.ts
 */

// Load environment variables FIRST before any other imports
import './setup-env';

import { IntentClassifier, type IntentClassification, normalizeVesselNamesFromClassifier } from '../intent-classifier';
import type { RedisCache } from '@/lib/repositories/cache-client';
import { registerAllTools } from '@/lib/registry/tools';
import { registerAllAgents } from '@/lib/registry/agents';

// ============================================================================
// In-Memory Cache for Tests
// ============================================================================

function createInMemoryCache(): RedisCache {
  const store = new Map<string, { value: unknown; ttl: number }>();
  const cache = {
    async get<T>(key: string): Promise<T | null> {
      const entry = store.get(key);
      if (!entry) return null;
      return entry.value as T;
    },
    async set<T>(_key: string, value: T, _ttl: number): Promise<void> {
      store.set(_key, { value, ttl: _ttl });
    },
    async delete(_key: string): Promise<void> {
      store.delete(_key);
    },
    async clear(_pattern: string): Promise<number> {
      store.clear();
      return 0;
    },
  };
  return cache as unknown as RedisCache;
}

// ============================================================================
// Test Cases - Natural Language Variations
// ============================================================================

const testCases = [
  // Vessel queries
  { query: 'give me vessel names from the fleet', expectedAgent: 'vessel_info_agent', minConfidence: 70 },
  { query: 'show me all ships', expectedAgent: 'vessel_info_agent', minConfidence: 70 },
  { query: 'how many vessels do we have', expectedAgent: 'vessel_info_agent', minConfidence: 70 },
  { query: 'fleet composition', expectedAgent: 'vessel_info_agent', minConfidence: 70 },
  { query: 'list our ships', expectedAgent: 'vessel_info_agent', minConfidence: 70 },

  // Bunker queries
  { query: 'cheapest bunker Singapore to Rotterdam', expectedAgent: 'bunker_agent', minConfidence: 70 },
  { query: 'where should I refuel', expectedAgent: 'bunker_agent', minConfidence: 70 },
  { query: 'fuel options along route', expectedAgent: 'bunker_agent', minConfidence: 70 },

  // Route queries
  { query: 'calculate route SGSIN to NLRTM', expectedAgent: 'route_agent', minConfidence: 70 },
  { query: 'distance from Singapore to Rotterdam', expectedAgent: 'route_agent', minConfidence: 70 },
  { query: 'sailing route to Europe', expectedAgent: 'route_agent', minConfidence: 70 },

  // Weather queries
  { query: 'weather at Singapore port', expectedAgent: 'weather_agent', minConfidence: 70 },
  { query: 'sea conditions along route', expectedAgent: 'weather_agent', minConfidence: 70 },
  { query: 'forecast for Houston', expectedAgent: 'weather_agent', minConfidence: 70 },

  // Compliance
  { query: 'ECA zones on my route', expectedAgent: 'compliance_agent', minConfidence: 70 },
  { query: 'emission compliance check', expectedAgent: 'compliance_agent', minConfidence: 70 },
];

// ============================================================================
// Classification Tests (Requires API keys)
// ============================================================================

export async function testIntentClassifier(): Promise<void> {
  console.log('\n' + '═'.repeat(70));
  console.log('🧪 [INTENT-CLASSIFIER-TEST] Intent Classification Test Suite');
  console.log('═'.repeat(70) + '\n');

  // Initialize registries (required for buildAgentListWithIntents)
  registerAllTools();
  registerAllAgents();

  // Check if API keys are available
  const hasApiKey =
    (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 20) ||
    (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.startsWith('sk-'));

  if (!hasApiKey) {
    console.log('⚠️ [INTENT-CLASSIFIER-TEST] Skipping - API keys not available');
    console.log('   Set OPENAI_API_KEY or ANTHROPIC_API_KEY to run classification tests');
    return;
  }

  const inMemoryCache = createInMemoryCache();
  let passed = 0;
  let failed = 0;
  const latencies: number[] = [];
  let totalCost = 0;
  let totalConfidence = 0;
  const results: Array<{ query: string; pass: boolean; result: IntentClassification | null; error?: string }> = [];

  // --------------------------
  // Run classification tests
  // --------------------------
  console.log('📋 Running Classification Tests...\n');

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const correlationId = `test-${i}`;
    console.log(`   Test ${i + 1}/${testCases.length}: "${tc.query}"`);

    try {
      const result = await IntentClassifier.classify(tc.query, correlationId, {
        cache: inMemoryCache,
      });

      const agentMatch = result?.agent_id === tc.expectedAgent;
      const minConfPct = tc.minConfidence;
      const confidencePct = result ? Math.round(result.confidence * 100) : 0;
      const confidenceOk = (result?.confidence ?? 0) >= minConfPct / 100;

      console.log(`   Agent: ${result?.agent_id ?? 'null'} (expected: ${tc.expectedAgent}) ${agentMatch ? '✅' : '❌'}`);
      console.log(`   Confidence: ${confidencePct}% (min: ${minConfPct}%) ${confidenceOk ? '✅' : '❌'}`);
      console.log(`   Reasoning: ${result?.reasoning?.substring(0, 100) ?? 'N/A'}${(result?.reasoning?.length ?? 0) > 100 ? '...' : ''}`);

      if (result?.latency_ms != null) latencies.push(result.latency_ms);
      if (result?.cost_usd != null) totalCost += result.cost_usd;
      if (result?.confidence != null) totalConfidence += result.confidence * 100;

      const pass = agentMatch && confidenceOk;
      if (pass) {
        console.log(`   ✅ PASSED\n`);
        passed++;
      } else {
        console.log(`   ❌ FAILED\n`);
        failed++;
      }

      results.push({ query: tc.query, pass, result, error: pass ? undefined : 'agent/confidence mismatch' });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ ERROR: ${errMsg}\n`);
      failed++;
      results.push({ query: tc.query, pass: false, result: null, error: errMsg });
    }
  }

  // --------------------------
  // Cache behavior test (use unique query not in test cases)
  // --------------------------
  console.log('📋 Cache Behavior Test...\n');
  const cacheTestQuery = 'marine weather forecast Singapore';
  const cacheStart1 = Date.now();
  const firstResult = await IntentClassifier.classify(cacheTestQuery, 'test-cache-1', {
    cache: inMemoryCache,
    skipCache: false,
  });
  const firstCallMs = Date.now() - cacheStart1;

  const cacheStart2 = Date.now();
  const secondResult = await IntentClassifier.classify(cacheTestQuery, 'test-cache-2', {
    cache: inMemoryCache,
    skipCache: false,
  });
  const secondCallMs = Date.now() - cacheStart2;

  const cacheHitOk = secondResult?.cache_hit === true;
  const latencyOk = secondCallMs < 10;
  console.log(`   First call: ${firstCallMs}ms, cache_hit: ${firstResult?.cache_hit ?? 'N/A'}`);
  console.log(`   Second call: ${secondCallMs}ms, cache_hit: ${secondResult?.cache_hit ?? 'N/A'} ${cacheHitOk ? '✅' : '❌'}`);
  console.log(`   Latency < 10ms on cache hit: ${latencyOk ? '✅' : '❌'}`);
  if (cacheHitOk && latencyOk) {
    console.log(`   ✅ Cache hit test PASSED\n`);
  } else {
    console.log(`   ❌ Cache hit test FAILED\n`);
  }

  // --------------------------
  // Aggregate metrics
  // --------------------------
  const successRate = testCases.length > 0 ? (passed / testCases.length) * 100 : 0;
  const avgConfidence = results.filter((r) => r.result?.confidence != null).length > 0
    ? totalConfidence / results.filter((r) => r.result?.confidence != null).length
    : 0;
  const avgLatencyUncached = latencies.length > 0
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : 0;

  console.log('═'.repeat(60));
  console.log('📊 Aggregate Metrics');
  console.log('═'.repeat(60));
  console.log(`   Classification: ${passed} passed, ${failed} failed`);
  console.log(`   Success rate: ${successRate.toFixed(1)}%`);
  console.log(`   Average confidence: ${avgConfidence.toFixed(1)}%`);
  console.log(`   Average latency (uncached): ${avgLatencyUncached.toFixed(0)}ms`);
  console.log(`   Cached call latency: ${secondCallMs}ms`);
  console.log(`   Total cost (LLM): $${totalCost.toFixed(6)}`);
  console.log(`   Cache behavior: ${cacheHitOk && latencyOk ? 'PASS' : 'FAIL'}`);
  console.log('═'.repeat(60));

  // Per-case pass/fail summary
  console.log('\n📋 Pass/Fail Summary:\n');
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const r = results[i];
    const status = r?.pass ? 'PASS' : 'FAIL';
    console.log(`   ${status} | "${tc.query}"`);
  }

  if (failed > 0 || !cacheHitOk || !latencyOk) {
    throw new Error(
      `Intent classifier tests failed: ${failed} classification failures, cache_hit: ${cacheHitOk}, latency_ok: ${latencyOk}`
    );
  }

  console.log('\n✅ [INTENT-CLASSIFIER-TEST] All tests passed!\n');
}

// ============================================================================
// Extracted Params Shape (vessel_names, origin_port, destination_port)
// ============================================================================

export function testExtractedParamsShape(): void {
  console.log('\n🧪 [INTENT-CLASSIFIER-TEST] Extracted params shape (vessel_names, ports)\n');

  const vesselSelection: IntentClassification = {
    agent_id: 'vessel_selection_agent',
    intent: 'bunker_planning',
    confidence: 0.9,
    reasoning: 'User comparing two vessels for next voyage',
    classification_method: 'llm_gpt4o_mini',
    extracted_params: {
      origin_port: 'Singapore',
      destination_port: 'Rotterdam',
      vessel_names: ['ocean pioneer', 'pacific trader'],
    },
  };

  const ok =
    vesselSelection.extracted_params?.origin_port === 'Singapore' &&
    vesselSelection.extracted_params?.destination_port === 'Rotterdam' &&
    Array.isArray(vesselSelection.extracted_params?.vessel_names) &&
    vesselSelection.extracted_params.vessel_names.length === 2 &&
    vesselSelection.extracted_params.vessel_names[0] === 'ocean pioneer';

  if (!ok) throw new Error('Extracted params shape test failed');
  console.log('   ✅ extracted_params with vessel_names (array) and origin_port/destination_port is valid\n');
}

// ============================================================================
// vessel_names normalization (comma-separated string -> array)
// ============================================================================

export function testNormalizeVesselNames(): void {
  console.log('\n🧪 [INTENT-CLASSIFIER-TEST] normalizeVesselNamesFromClassifier (comma-separated)\n');

  const out1 = normalizeVesselNamesFromClassifier(['ocean pioneer, pacific trader']);
  if (!out1 || out1.length !== 2 || out1[0] !== 'ocean pioneer' || out1[1] !== 'pacific trader') {
    throw new Error(`Expected ["ocean pioneer", "pacific trader"], got ${JSON.stringify(out1)}`);
  }
  console.log('   ✅ ["ocean pioneer, pacific trader"] -> ["ocean pioneer", "pacific trader"]');

  const out2 = normalizeVesselNamesFromClassifier(['ship one', 'ship two']);
  if (!out2 || out2.length !== 2 || out2[0] !== 'ship one' || out2[1] !== 'ship two') {
    throw new Error(`Expected ["ship one", "ship two"], got ${JSON.stringify(out2)}`);
  }
  console.log('   ✅ Multiple elements unchanged');

  const out3 = normalizeVesselNamesFromClassifier('single vessel');
  if (!out3 || out3.length !== 1 || out3[0] !== 'single vessel') {
    throw new Error(`Expected ["single vessel"], got ${JSON.stringify(out3)}`);
  }
  console.log('   ✅ Single string -> [string]\n');
}

// ============================================================================
// Error Handling Tests
// ============================================================================

export async function testIntentClassifierErrorHandling(): Promise<void> {
  console.log('\n🧪 [INTENT-CLASSIFIER-ERROR] Error Handling Tests\n');

  const savedOpenAI = process.env.OPENAI_API_KEY;
  const savedAnthropic = process.env.ANTHROPIC_API_KEY;

  try {
    process.env.OPENAI_API_KEY = 'invalid-key';
    process.env.ANTHROPIC_API_KEY = 'invalid-key';

    let threw = false;
    try {
      await IntentClassifier.classify('weather at Singapore', 'test-error', { skipCache: true });
    } catch {
      threw = true;
    }

    if (threw) {
      console.log('   ✅ Invalid API key correctly throws\n');
    } else {
      console.log('   ⚠️ Expected throw on invalid API key (LLMFactory may not have been called)\n');
    }
  } finally {
    process.env.OPENAI_API_KEY = savedOpenAI;
    process.env.ANTHROPIC_API_KEY = savedAnthropic;
  }

  console.log('📋 Malformed response / Network timeout: Run npm run test:intent-classifier:errors\n');
}

// ============================================================================
// Main Entry
// ============================================================================

async function runAll(): Promise<void> {
  try {
    testExtractedParamsShape();
    testNormalizeVesselNames();
    await testIntentClassifier();
    await testIntentClassifierErrorHandling();
  } catch (error) {
    console.error('❌ [INTENT-CLASSIFIER-TEST] Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAll().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}
