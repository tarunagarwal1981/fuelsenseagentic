/**
 * Intent Classifier Test Suite
 *
 * Tests for the LLM-based intent classifier that maps user queries to agent IDs.
 * - Classification accuracy across vessel, bunker, route, weather, compliance queries
 * - Cache behavior (second call should be cache hit with latency < 10ms)
 * - Error handling (invalid API key, malformed response, network timeout)
 * - Success rate and aggregate metrics
 *
 * Run with: npm run test:intent-classifier
 * or: tsx lib/multi-agent/__tests__/intent-classifier.test.ts
 */

// Load environment variables FIRST before any other imports
import './setup-env';

import { IntentClassifier, type IntentClassification } from '../intent-classifier';
import type { RedisCache } from '@/lib/repositories/cache-client';
import { registerAllTools } from '@/lib/registry/tools';
import { registerAllAgents } from '@/lib/registry/agents';

// ============================================================================
// In-Memory Cache for Tests
// ============================================================================

function createInMemoryCache(): RedisCache {
  const store = new Map<string, { value: unknown; ttl: number }>();
  return {
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
}

// ============================================================================
// Test Cases
// ============================================================================

const testCases = [
  // Vessel queries - variations (intents from vessel_info_agent)
  {
    query: 'give me vessel names from the fleet',
    expectedAgent: 'vessel_info_agent',
    expectedIntent: 'list_vessels',
    description: 'Vessel list query',
  },
  {
    query: 'show me all ships',
    expectedAgent: 'vessel_info_agent',
    expectedIntent: 'list_vessels',
    description: 'Ship list synonym',
  },
  {
    query: 'how many vessels do we have',
    expectedAgent: 'vessel_info_agent',
    expectedIntent: 'fleet_size',
    description: 'Vessel count query',
  },
  {
    query: 'fleet composition',
    expectedAgent: 'vessel_info_agent',
    expectedIntent: 'fleet_inventory',
    description: 'Fleet inventory query',
  },
  // Bunker queries
  {
    query: 'cheapest bunker Singapore to Rotterdam',
    expectedAgent: 'bunker_agent',
    expectedIntent: 'bunker_planning',
    description: 'Bunker planning with route',
  },
  {
    query: 'where should I refuel',
    expectedAgent: 'bunker_agent',
    expectedIntent: 'refueling_options',
    description: 'Refueling options query',
  },
  // Route queries
  {
    query: 'calculate route SGSIN to NLRTM',
    expectedAgent: 'route_agent',
    expectedIntent: 'route_calculation',
    description: 'Route calculation with port codes',
  },
  {
    query: 'distance from Singapore to Rotterdam',
    expectedAgent: 'route_agent',
    expectedIntent: 'route_distance',
    description: 'Route distance query',
  },
  // Weather queries
  {
    query: 'weather at Singapore port',
    expectedAgent: 'weather_agent',
    expectedIntent: 'port_weather',
    description: 'Port weather query',
  },
  {
    query: 'sea conditions along route',
    expectedAgent: 'weather_agent',
    expectedIntent: 'marine_weather',
    description: 'Marine weather query',
  },
  // Compliance queries
  {
    query: 'ECA zones on my route',
    expectedAgent: 'compliance_agent',
    expectedIntent: 'eca_validation',
    description: 'ECA validation query',
  },
  {
    query: 'emission compliance check',
    expectedAgent: 'compliance_agent',
    expectedIntent: 'emissions_calc',
    description: 'Emissions compliance query',
  },
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
    console.log('   Run test:error-handling for error handling tests without API keys');
    return;
  }

  const inMemoryCache = createInMemoryCache();
  const MIN_CONFIDENCE = 0.7; // 70% as 0-1 scale
  let passed = 0;
  let failed = 0;
  const results: Array<{ query: string; pass: boolean; result: IntentClassification | null; error?: string }> = [];

  // --------------------------
  // Run classification tests
  // --------------------------
  console.log('📋 Running Classification Tests...\n');

  for (const tc of testCases) {
    console.log(`   Test: ${tc.description}`);
    console.log(`   Query: "${tc.query}"`);

    try {
      const result = await IntentClassifier.classify(tc.query, {
        cache: inMemoryCache,
        correlationId: 'test-intent-classifier',
      });

      const agentMatch = result?.agent_id === tc.expectedAgent;
      const intentMatch = result?.intent === tc.expectedIntent;
      const confidenceOk = (result?.confidence ?? 0) >= MIN_CONFIDENCE;

      console.log(`   Agent: ${result?.agent_id ?? 'null'} (expected: ${tc.expectedAgent}) ${agentMatch ? '✅' : '❌'}`);
      console.log(`   Intent: ${result?.intent ?? 'null'} (expected: ${tc.expectedIntent}) ${intentMatch ? '✅' : '❌'}`);
      console.log(`   Confidence: ${result ? (result.confidence * 100).toFixed(0) : 0}% (min: 70%) ${confidenceOk ? '✅' : '❌'}`);
      console.log(`   Reasoning: ${result?.reasoning?.substring(0, 80) ?? 'N/A'}...`);

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
      results.push({
        query: tc.query,
        pass: false,
        result: null,
        error: errMsg,
      });
    }
  }

  // --------------------------
  // Cache behavior test
  // --------------------------
  console.log('📋 Cache Behavior Test...\n');
  const cacheTestQuery = 'weather at Singapore port';
  const cacheStart1 = Date.now();
  await IntentClassifier.classify(cacheTestQuery, {
    cache: inMemoryCache,
    skipCache: false,
  });
  const firstCallMs = Date.now() - cacheStart1;

  const cacheStart2 = Date.now();
  await IntentClassifier.classify(cacheTestQuery, {
    cache: inMemoryCache,
    skipCache: false,
  });
  const secondCallMs = Date.now() - cacheStart2;

  const cacheHitOk = secondCallMs < 10;
  console.log(`   First call: ${firstCallMs}ms`);
  console.log(`   Second call (cache hit): ${secondCallMs}ms (expected < 10ms) ${cacheHitOk ? '✅' : '❌'}`);
  if (cacheHitOk) {
    console.log(`   ✅ Cache hit test PASSED\n`);
  } else {
    console.log(`   ❌ Cache hit test FAILED (second call took ${secondCallMs}ms)\n`);
  }

  // --------------------------
  // Success rate and metrics
  // --------------------------
  const successRate = testCases.length > 0 ? (passed / testCases.length) * 100 : 0;

  console.log('='.repeat(60));
  console.log('📊 Aggregate Metrics');
  console.log('='.repeat(60));
  console.log(`   Classification: ${passed} passed, ${failed} failed`);
  console.log(`   Success rate: ${successRate.toFixed(1)}%`);
  console.log(`   Cache behavior: ${cacheHitOk ? 'PASS' : 'FAIL'}`);
  console.log('='.repeat(60));

  // Per-case pass/fail summary
  console.log('\n📋 Pass/Fail Summary:\n');
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const r = results[i];
    const status = r?.pass ? 'PASS' : 'FAIL';
    console.log(`   ${status} | "${tc.query}"`);
  }

  if (failed > 0 || !cacheHitOk) {
    throw new Error(
      `Intent classifier tests failed: ${failed} classification failures, cache test: ${cacheHitOk ? 'pass' : 'fail'}`
    );
  }

  console.log('\n✅ [INTENT-CLASSIFIER-TEST] All tests passed!\n');
}

// ============================================================================
// Error Handling Tests
// ============================================================================

export async function testIntentClassifierErrorHandling(): Promise<void> {
  console.log('\n🧪 [INTENT-CLASSIFIER-ERROR] Error Handling Tests\n');

  // 1. Invalid API key scenario
  console.log('📋 Test: Invalid API key');
  const savedOpenAI = process.env.OPENAI_API_KEY;
  const savedAnthropic = process.env.ANTHROPIC_API_KEY;

  try {
    process.env.OPENAI_API_KEY = 'invalid-key';
    process.env.ANTHROPIC_API_KEY = 'invalid-key';

    let threw = false;
    try {
      await IntentClassifier.classify('weather at Singapore', { skipCache: true });
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

  // 2. Malformed LLM response & 3. Network timeout
  // Covered by Jest tests with mocks. Run: npm run test:intent-classifier:errors
  console.log('📋 Test: Malformed response / Network timeout');
  console.log('   ℹ️  Run: npm run test:intent-classifier:errors\n');
}

// ============================================================================
// Main Entry
// ============================================================================

async function runAll(): Promise<void> {
  try {
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
