/**
 * Query Classifier Integration Tests
 *
 * Covers Tier 1 (deterministic), Tier 2 (state inference), fallback, and integration.
 * Uses tsx runner (no Jest). Run: npx tsx lib/multi-agent/synthesis/__tests__/query-classifier.test.ts
 */

import { classifyQuery, type QueryClassification, type QueryType } from '../query-classifier';
import { matchDeterministicPatterns } from '../classifiers/tier1-deterministic';
import { inferFromState } from '../classifiers/tier2-state-inference';
import type { MultiAgentState } from '../../state';

// ============================================================================
// Assertion helpers
// ============================================================================

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✅ ${message}`);
    testsPassed++;
  } else {
    console.log(`  ❌ ${message}`);
    testsFailed++;
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const passed = actual === expected;
  if (passed) {
    console.log(`  ✅ ${message}`);
    testsPassed++;
  } else {
    console.log(`  ❌ ${message}`);
    console.log(`     Expected: ${JSON.stringify(expected)}`);
    console.log(`     Actual: ${JSON.stringify(actual)}`);
    testsFailed++;
  }
}

function assertGte(actual: number, min: number, message: string): void {
  const passed = actual >= min;
  if (passed) {
    console.log(`  ✅ ${message}`);
    testsPassed++;
  } else {
    console.log(`  ❌ ${message}`);
    console.log(`     Expected >= ${min}, got ${actual}`);
    testsFailed++;
  }
}

function assertOneOf<T>(actual: T, allowed: T[], message: string): void {
  const passed = allowed.includes(actual);
  if (passed) {
    console.log(`  ✅ ${message}`);
    testsPassed++;
  } else {
    console.log(`  ❌ ${message}`);
    console.log(`     Expected one of: ${allowed.join(', ')}`);
    console.log(`     Actual: ${actual}`);
    testsFailed++;
  }
}

// ============================================================================
// Minimal state builders for Tier 2
// ============================================================================

function makeState(overrides: Partial<Record<string, unknown>>): MultiAgentState {
  const base = {
    messages: [],
    route_data: null,
    bunker_analysis: null,
    weather_forecast: null,
    agent_status: {},
  } as unknown as MultiAgentState;
  return { ...base, ...overrides } as MultiAgentState;
}

// ============================================================================
// Tier 1: Deterministic patterns
// ============================================================================

function testTier1ExactPhrases(): void {
  console.log('\n📋 Tier 1: Exact phrase matching');
  console.log('-'.repeat(50));

  const cases: Array<{ query: string; expectedType: QueryType; minConfidence: number }> = [
    { query: 'calculate route from Singapore to Rotterdam', expectedType: 'route-only', minConfidence: 90 },
    { query: 'give me route between Dubai and Tokyo', expectedType: 'route-only', minConfidence: 90 },
    { query: 'find bunker ports between Singapore and Rotterdam', expectedType: 'bunker_planning', minConfidence: 90 },
    { query: 'where should I bunker on this route', expectedType: 'bunker_planning', minConfidence: 85 },
    { query: 'compare costs for bunker options', expectedType: 'cost-comparison', minConfidence: 90 },
    { query: 'weather forecast along the route', expectedType: 'weather-analysis', minConfidence: 90 },
  ];

  const emptyState = makeState({});
  cases.forEach(({ query, expectedType, minConfidence }) => {
    const result = matchDeterministicPatterns(query);
    assertEqual(result.queryType, expectedType, `"${query.slice(0, 40)}..." → ${expectedType}`);
    assertGte(result.confidence, minConfidence, `Confidence >= ${minConfidence} (got ${result.confidence})`);
    assert(result.method.startsWith('tier1'), `Method is tier1 (got ${result.method})`);
  });
}

function testTier1KeywordRouteOnly(): void {
  console.log('\n📋 Tier 1: Keyword matching (route-only)');
  console.log('-'.repeat(50));

  const result = matchDeterministicPatterns('show me the route');
  assertEqual(result.queryType, 'route-only', 'Keyword "route" without bunker/cost → route-only');
  assertEqual(result.confidence, 85, 'Keyword confidence 85%');
}

function testTier1Regex(): void {
  console.log('\n📋 Tier 1: Regex patterns');
  console.log('-'.repeat(50));

  const cases: Array<{ query: string; expectedType: QueryType; minConfidence: number }> = [
    { query: 'how far is it from SGSIN to NLRTM', expectedType: 'route-only', minConfidence: 75 },
    { query: 'distance between Tokyo and Singapore', expectedType: 'route-only', minConfidence: 80 },
    { query: 'where should we bunker on this voyage', expectedType: 'bunker_planning', minConfidence: 85 },
  ];

  cases.forEach(({ query, expectedType, minConfidence }) => {
    const result = matchDeterministicPatterns(query);
    assertEqual(result.queryType, expectedType, `Regex: "${query.slice(0, 45)}..." → ${expectedType}`);
    assertGte(result.confidence, minConfidence, `Confidence >= ${minConfidence}`);
  });
}

// ============================================================================
// Tier 2: State inference
// ============================================================================

function testTier2RouteOnly(): void {
  console.log('\n📋 Tier 2: route-only inference');
  console.log('-'.repeat(50));

  const state = makeState({
    route_data: { distance_nm: 5000, waypoints: [], origin_port_code: 'AEJEA', destination_port_code: 'JPTYO' } as any,
    bunker_analysis: null,
  });
  const result = inferFromState(state);
  assertEqual(result.queryType, 'route-only', 'route_data only, no bunker → route-only');
  assertGte(result.confidence, 75, 'Confidence >= 75');
  assertEqual(result.method, 'tier2-state', 'Method tier2-state');
}

function testTier2BunkerPlanning(): void {
  console.log('\n📋 Tier 2: bunker_planning inference');
  console.log('-'.repeat(50));

  const state = makeState({
    route_data: { distance_nm: 5000, waypoints: [] } as any,
    bunker_analysis: { recommendations: [{ port_code: 'SGSIN' }], best_option: {} as any, worst_option: {} as any, max_savings_usd: 0, analysis_summary: '' },
  });
  const result = inferFromState(state);
  assertEqual(result.queryType, 'bunker_planning', 'route + bunker (1 recommendation) → bunker_planning');
  assertGte(result.confidence, 75, 'Confidence >= 75');
}

function testTier2CostComparison(): void {
  console.log('\n📋 Tier 2: cost-comparison inference');
  console.log('-'.repeat(50));

  const state = makeState({
    route_data: { distance_nm: 5000, waypoints: [] } as any,
    bunker_analysis: {
      recommendations: [{ port_code: 'A' }, { port_code: 'B' }],
      best_option: {} as any,
      worst_option: {} as any,
      max_savings_usd: 0,
      analysis_summary: '',
    },
  });
  const result = inferFromState(state);
  assertEqual(result.queryType, 'cost-comparison', '2+ recommendations → cost-comparison');
  assertGte(result.confidence, 75, 'Confidence >= 75');
}

function testTier2WeatherAnalysis(): void {
  console.log('\n📋 Tier 2: weather-analysis inference');
  console.log('-'.repeat(50));

  const state = makeState({
    route_data: null,
    bunker_analysis: null,
    weather_forecast: Array(6).fill({ position: { lat: 0, lon: 0 }, datetime: '', weather: {} }),
  });
  const result = inferFromState(state);
  assertEqual(result.queryType, 'weather-analysis', '5+ weather entries, no bunker → weather-analysis');
  assertEqual(result.confidence, 75, 'Confidence 75');
}

// ============================================================================
// Fallback
// ============================================================================

function testFallback(): void {
  console.log('\n📋 Fallback behavior');
  console.log('-'.repeat(50));

  const emptyState = makeState({});

  const fallbackQueries = ['hello', 'xyz', '', 'random text with no keywords'];
  fallbackQueries.forEach((query) => {
    const result = classifyQuery(query, emptyState);
    assertEqual(result.queryType, 'informational', `"${query || '(empty)'}" → informational`);
    assertEqual(result.confidence, 50, 'Fallback confidence 50');
    assertEqual(result.method, 'fallback', 'Method fallback');
  });
}

// ============================================================================
// Integration: full classifyQuery with test cases
// ============================================================================

interface TestCase {
  query: string;
  expectedType: QueryType;
  expectedMinConfidence: number;
  expectedTier: 1 | 2 | 'fallback';
  state?: Partial<Record<string, unknown>>;
}

function testIntegrationCases(): void {
  console.log('\n📋 Integration: test cases');
  console.log('-'.repeat(50));

  const testCases: TestCase[] = [
    {
      query: 'calculate route from Singapore to Rotterdam',
      expectedType: 'route-only',
      expectedMinConfidence: 85,
      expectedTier: 1,
    },
    {
      query: 'give me route between Dubai and Tokyo',
      expectedType: 'route-only',
      expectedMinConfidence: 85,
      expectedTier: 1,
    },
    {
      query: 'how far is it from SGSIN to NLRTM',
      expectedType: 'route-only',
      expectedMinConfidence: 75,
      expectedTier: 1,
    },
    {
      query: 'find bunker ports between Singapore and Rotterdam',
      expectedType: 'bunker_planning',
      expectedMinConfidence: 85,
      expectedTier: 1,
    },
    {
      query: 'where should I bunker on this route',
      expectedType: 'bunker_planning',
      expectedMinConfidence: 85,
      expectedTier: 1,
    },
    {
      query: 'show me the analysis',
      expectedType: 'route-only',
      expectedMinConfidence: 75,
      expectedTier: 2,
      state: {
        route_data: { distance_nm: 3000, waypoints: [] } as any,
        bunker_analysis: null,
      },
    },
    {
      query: 'hello',
      expectedType: 'informational',
      expectedMinConfidence: 50,
      expectedTier: 'fallback',
    },
  ];

  testCases.forEach((tc) => {
    const state = tc.state ? makeState(tc.state) : makeState({});
    const result = classifyQuery(tc.query, state);
    assertEqual(result.queryType, tc.expectedType, `"${tc.query.slice(0, 40)}..." → ${tc.expectedType}`);
    assertGte(result.confidence, tc.expectedMinConfidence, `Confidence >= ${tc.expectedMinConfidence}`);
    if (tc.expectedTier === 1) {
      assert(result.method.startsWith('tier1'), 'Tier 1 method');
    } else if (tc.expectedTier === 2) {
      assertEqual(result.method, 'tier2-state', 'Tier 2 method');
    } else {
      assertEqual(result.method, 'fallback', 'Fallback method');
    }
  });
}

// ============================================================================
// Edge cases and ambiguous
// ============================================================================

function testEdgeCases(): void {
  console.log('\n📋 Edge cases');
  console.log('-'.repeat(50));

  const emptyState = makeState({});

  assertEqual(classifyQuery('', emptyState).queryType, 'informational', 'Empty string → informational');
  assertEqual(classifyQuery('   ', emptyState).queryType, 'informational', 'Whitespace only → informational');

  const routeResult = classifyQuery('route from A to B', emptyState);
  assertOneOf(routeResult.queryType, ['route-only', 'informational'], 'Ambiguous "route from A to B"');

  const bunkerResult = classifyQuery('bunker at Singapore', emptyState);
  assertEqual(bunkerResult.queryType, 'bunker_planning', '"bunker at Singapore" → bunker_planning');
}

// ============================================================================
// Run all
// ============================================================================

function runAllTests(): void {
  console.log('🧪 Query Classifier Integration Tests');
  console.log('='.repeat(60));

  testTier1ExactPhrases();
  testTier1KeywordRouteOnly();
  testTier1Regex();
  testTier2RouteOnly();
  testTier2BunkerPlanning();
  testTier2CostComparison();
  testTier2WeatherAnalysis();
  testFallback();
  testIntegrationCases();
  testEdgeCases();

  console.log('\n' + '='.repeat(60));
  console.log(`📊 Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('='.repeat(60));

  if (testsFailed > 0) {
    throw new Error(`${testsFailed} tests failed`);
  }
}

// Run when executed directly (tsx)
const isMain = typeof process !== 'undefined' && process.argv[1]?.includes('query-classifier.test');
if (isMain) {
  try {
    runAllTests();
    console.log('\n✅ All query classifier tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Tests failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export { runAllTests, testsPassed, testsFailed };
