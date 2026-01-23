/**
 * Baseline Query Tests
 *
 * Tests current system behavior before engine integration.
 * These tests establish the baseline we must maintain or improve.
 *
 * Run with:
 *   npm run test:baseline
 *   or: npx tsx tests/integration/baseline-queries.test.ts
 *
 * Save baseline output (run before and after integration):
 *   npm run test:baseline > baseline-output.txt 2>&1
 */

// Load environment variables FIRST
import '../../lib/multi-agent/__tests__/setup-env';

import { multiAgentApp } from '../../lib/multi-agent/graph';
import { MultiAgentStateAnnotation } from '../../lib/multi-agent/state';
import { HumanMessage } from '@langchain/core/messages';
import type { MultiAgentState } from '../../lib/multi-agent/state';

// ============================================================================
// Types
// ============================================================================

interface TestQuery {
  id: string;
  description: string;
  query: string;
  vessel?: string;
  origin?: string;
  destination?: string;
  expectedAgents: string[];
  /** State keys to check (maps to actual MultiAgentState fields) */
  expectedData: string[];
}

/** Maps expectedData names to actual state keys and optional value checks */
const EXPECTED_DATA_MAP: Record<
  string,
  { key: keyof MultiAgentState; check?: (s: MultiAgentState) => boolean }
> = {
  route_data: { key: 'route_data' },
  total_distance: {
    key: 'route_data',
    check: (s) => (s.route_data?.distance_nm ?? 0) > 0,
  },
  weather_data: {
    key: 'weather_forecast',
    check: (s) => !!(s.weather_forecast || s.weather_consumption),
  },
  bunker_ports: { key: 'bunker_ports' },
  recommended_port: {
    key: 'bunker_analysis',
    check: (s) => !!(s.bunker_analysis?.best_option),
  },
  fuel_prices: { key: 'port_prices' },
  eca_zones: {
    key: 'compliance_data',
    check: (s) => !!(s.compliance_data?.eca_zones),
  },
};

// ============================================================================
// Baseline Queries
// ============================================================================

const BASELINE_QUERIES: TestQuery[] = [
  {
    id: 'query-1',
    description: 'Basic bunker planning - Singapore to Rotterdam',
    query: 'Find cheapest bunker for MV Pacific Star from Singapore to Rotterdam',
    vessel: 'MV Pacific Star',
    origin: 'Singapore',
    destination: 'Rotterdam',
    expectedAgents: ['supervisor', 'route_agent', 'weather_agent', 'bunker_agent', 'finalize'],
    expectedData: ['route_data', 'weather_data', 'bunker_ports', 'recommended_port'],
  },
  {
    id: 'query-2',
    description: 'Route calculation only',
    query: 'Calculate route from Singapore to Colombo',
    origin: 'Singapore',
    destination: 'Colombo',
    expectedAgents: ['supervisor', 'route_agent', 'finalize'],
    expectedData: ['route_data', 'total_distance'],
  },
  {
    id: 'query-3',
    description: 'Weather forecast query',
    query: 'What is the weather forecast from Singapore to Colombo?',
    origin: 'Singapore',
    destination: 'Colombo',
    expectedAgents: ['supervisor', 'route_agent', 'weather_agent', 'finalize'],
    expectedData: ['route_data', 'weather_data'],
  },
  {
    id: 'query-4',
    description: 'Bunker planning with ECA zones',
    query: 'Find bunker options for MV Pacific Star from Shanghai to Hamburg',
    vessel: 'MV Pacific Star',
    origin: 'Shanghai',
    destination: 'Hamburg',
    expectedAgents: ['supervisor', 'route_agent', 'weather_agent', 'bunker_agent', 'finalize'],
    expectedData: ['route_data', 'weather_data', 'bunker_ports', 'eca_zones'],
  },
  {
    id: 'query-5',
    description: 'Fuel price lookup',
    query: 'What is the fuel price at Fujairah?',
    expectedAgents: ['supervisor', 'finalize'],
    expectedData: ['fuel_prices'],
  },
];

// ============================================================================
// Helpers
// ============================================================================

function buildInitialState(query: string): MultiAgentState {
  return {
    messages: [new HumanMessage(query)],
    correlation_id: 'test-correlation-id',
    next_agent: '',
    agent_context: null,
    agent_call_counts: { route_agent: 0, weather_agent: 0, bunker_agent: 0 },
    selected_route_id: null,
    route_data: null,
    vessel_timeline: null,
    weather_forecast: null,
    weather_consumption: null,
    port_weather_status: null,
    weather_agent_partial: false,
    standalone_port_weather: null,
    bunker_ports: null,
    port_prices: null,
    bunker_analysis: null,
    multi_bunker_plan: null,
    compliance_data: null,
    vessel_consumption: null,
    rob_tracking: null,
    rob_waypoints: null,
    rob_safety_status: null,
    eca_consumption: null,
    eca_summary: null,
    vessel_name: null,
    vessel_profile: null,
    final_recommendation: null,
    formatted_response: null,
    synthesized_insights: null,
    agent_errors: {},
    agent_status: {},
    // Agentic supervisor state
    reasoning_history: [],
    current_thought: null,
    next_action: null,
    recovery_attempts: 0,
    needs_clarification: false,
    clarification_question: null,
    // Parameter override fields (supervisor → agent communication)
    port_overrides: undefined,
    agent_overrides: undefined,
  };
}

function hasExpectedData(state: MultiAgentState, dataKey: string): boolean {
  const def = EXPECTED_DATA_MAP[dataKey];
  if (!def) return false;
  const raw = state[def.key];
  if (def.check) return def.check(state);
  return raw != null && (typeof raw !== 'object' || (Array.isArray(raw) ? raw.length > 0 : Object.keys(raw).length > 0));
}

// ============================================================================
// System Health Check
// ============================================================================

export function testSystemHealth(): void {
  console.log('\n🧪 [BASELINE] System Health Check\n');
  if (!multiAgentApp) {
    throw new Error('multiAgentApp is not defined');
  }
  if (!MultiAgentStateAnnotation) {
    throw new Error('MultiAgentStateAnnotation is not defined');
  }
  console.log('✅ multiAgentApp defined');
  console.log('✅ MultiAgentStateAnnotation defined');
}

// ============================================================================
// Query Execution - Baseline Behavior
// ============================================================================

export async function runBaselineQueries(): Promise<{ passed: number; failed: number; results: Array<{ id: string; ok: boolean; duration: number; error?: string }> }> {
  const results: Array<{ id: string; ok: boolean; duration: number; error?: string }> = [];
  let passed = 0;
  let failed = 0;

  for (const tq of BASELINE_QUERIES) {
    console.log(`\n🧪 Testing: ${tq.description}`);
    console.log(`📝 Query: "${tq.query}"`);
    const start = Date.now();
    let ok = true;
    let err: string | undefined;

    try {
      const result = await multiAgentApp.invoke(buildInitialState(tq.query), { recursionLimit: 50 });
      const duration = Date.now() - start;
      console.log(`⏱️  Duration: ${duration}ms`);
      console.log('🤖 Expected agents (reference):', tq.expectedAgents.join(' → '));
      console.log('📊 Expected data:');

      for (const key of tq.expectedData) {
        const has = hasExpectedData(result, key);
        console.log(`  ${has ? '✅' : '❌'} ${key}`);
        if (!has) console.warn(`⚠️  Missing expected data: ${key}`);
      }

      if (!result || !result.messages || result.messages.length < 2) {
        ok = false;
        err = 'Expected state and at least 2 messages';
      } else {
        const last = result.messages[result.messages.length - 1] as { content?: string | unknown };
        const str = typeof last?.content === 'string' ? last.content : Array.isArray(last?.content) ? '' : String(last?.content ?? '');
        if (!str || str.length === 0) {
          ok = false;
          err = 'Last message has no content';
        }
      }

      results.push({ id: tq.id, ok, duration, error: err });
      if (ok) passed++;
      else failed++;
      console.log(`\n${ok ? '✅' : '❌'} ${tq.id} completed\n`);
    } catch (e) {
      const duration = Date.now() - start;
      err = e instanceof Error ? e.message : String(e);
      console.error(`❌ ${tq.id} failed:`, err);
      results.push({ id: tq.id, ok: false, duration, error: err });
      failed++;
    }
    console.log('─'.repeat(80));
  }

  return { passed, failed, results };
}

// ============================================================================
// Response Quality Checks
// ============================================================================

export async function testResponseQuality(): Promise<{ passed: number; failed: number }> {
  console.log('\n🧪 [BASELINE] Response Quality Checks\n');
  let passed = 0;
  let failed = 0;

  try {
    const routeResult = await multiAgentApp.invoke(
      buildInitialState('Calculate route from Singapore to Colombo'),
      { recursionLimit: 50 }
    );
    if (routeResult?.route_data && (routeResult.route_data.distance_nm ?? 0) > 0) {
      console.log('✅ Route query: route_data.distance_nm > 0');
      passed++;
    } else {
      console.log('❌ Route query: route_data or distance_nm missing');
      failed++;
    }
  } catch (e) {
    console.error('❌ Route quality check error:', e);
    failed++;
  }

  try {
    const bunkerResult = await multiAgentApp.invoke(
      buildInitialState('Find bunker for MV Pacific Star from Singapore to Rotterdam'),
      { recursionLimit: 50 }
    );
    const hasBunker = !!(bunkerResult?.bunker_ports && (Array.isArray(bunkerResult.bunker_ports) ? bunkerResult.bunker_ports.length > 0 : true));
    const hasRec = !!bunkerResult?.bunker_analysis?.best_option;
    if (hasBunker || hasRec) {
      console.log('✅ Bunker query: bunker_ports or bunker_analysis.best_option present');
      passed++;
    } else {
      console.log('❌ Bunker query: missing bunker_ports and best_option');
      failed++;
    }
  } catch (e) {
    console.error('❌ Bunker quality check error:', e);
    failed++;
  }

  return { passed, failed };
}

// ============================================================================
// Performance Benchmarks
// ============================================================================

export async function testPerformanceBenchmarks(): Promise<{ passed: number; failed: number }> {
  console.log('\n🧪 [BASELINE] Performance Benchmarks\n');
  let passed = 0;
  let failed = 0;
  const ROUTE_LIMIT_MS = 10_000;
  const BUNKER_LIMIT_MS = 30_000;

  try {
    const t0 = Date.now();
    await multiAgentApp.invoke(
      buildInitialState('Distance from Singapore to Colombo'),
      { recursionLimit: 50 }
    );
    const d = Date.now() - t0;
    console.log(`⏱️  Route query: ${d}ms (limit ${ROUTE_LIMIT_MS}ms)`);
    if (d < ROUTE_LIMIT_MS) {
      passed++;
      console.log('✅ Route query under 10s');
    } else {
      failed++;
      console.log('❌ Route query over 10s');
    }
  } catch (e) {
    console.error('❌ Route benchmark error:', e);
    failed++;
  }

  try {
    const t0 = Date.now();
    await multiAgentApp.invoke(
      buildInitialState('Find bunker for MV Pacific Star from Singapore to Colombo'),
      { recursionLimit: 50 }
    );
    const d = Date.now() - t0;
    console.log(`⏱️  Full bunker planning: ${d}ms (limit ${BUNKER_LIMIT_MS}ms)`);
    if (d < BUNKER_LIMIT_MS) {
      passed++;
      console.log('✅ Bunker planning under 30s');
    } else {
      failed++;
      console.log('❌ Bunker planning over 30s');
    }
  } catch (e) {
    console.error('❌ Bunker benchmark error:', e);
    failed++;
  }

  return { passed, failed };
}

// ============================================================================
// Main Runner
// ============================================================================

export async function runBaselineTests(): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('BASELINE QUERY TESTS – capture current system behavior before engine integration');
  console.log('='.repeat(80));

  testSystemHealth();

  const q = await runBaselineQueries();
  const rq = await testResponseQuality();
  const perf = await testPerformanceBenchmarks();

  const totalPassed = q.passed + rq.passed + perf.passed;
  const totalFailed = q.failed + rq.failed + perf.failed;

  console.log('\n' + '='.repeat(80));
  console.log('BASELINE SUMMARY');
  console.log('  Baseline queries:  passed=%d failed=%d', q.passed, q.failed);
  console.log('  Response quality:  passed=%d failed=%d', rq.passed, rq.failed);
  console.log('  Performance:       passed=%d failed=%d', perf.passed, perf.failed);
  console.log('  TOTAL:             passed=%d failed=%d', totalPassed, totalFailed);
  console.log('='.repeat(80));

  if (totalFailed > 0) {
    process.exit(1);
  }
}

// ============================================================================
// Port Extraction Tests - Fixed Logic
// ============================================================================

import { extractPortsFromQuery } from '../../lib/utils/port-lookup';

interface PortExtractionTest {
  query: string;
  expectedOrigin: string | null;
  expectedDestination: string | null;
  description: string;
}

const PORT_EXTRACTION_TESTS: PortExtractionTest[] = [
  {
    query: 'route from Chiba to Singapore',
    expectedOrigin: 'JPCHB',
    expectedDestination: 'SGSIN',
    description: 'Basic "from X to Y" with uncommon origin port',
  },
  {
    query: 'Chiba to Singapore',
    expectedOrigin: 'JPCHB',
    expectedDestination: 'SGSIN',
    description: '"X to Y" without "from" keyword',
  },
  {
    query: 'Singapore to Rotterdam',
    expectedOrigin: 'SGSIN',
    expectedDestination: 'NLRTM',
    description: 'Common port to common port',
  },
  {
    query: 'from JPCHB to SGSIN',
    expectedOrigin: 'JPCHB',
    expectedDestination: 'SGSIN',
    description: 'Direct port codes',
  },
  {
    query: 'give me the rote between Chiba and Singapore',
    expectedOrigin: 'JPCHB',
    expectedDestination: 'SGSIN',
    description: 'Typo in "route", using "between X and Y" pattern',
  },
  {
    query: 'route from Singapore to Chiba',
    expectedOrigin: 'SGSIN',
    expectedDestination: 'JPCHB',
    description: 'Reverse direction',
  },
  {
    query: 'calculate route JPCHB to SGSIN',
    expectedOrigin: 'JPCHB',
    expectedDestination: 'SGSIN',
    description: 'Port codes without "from" keyword',
  },
  {
    query: 'Find bunker from Rotterdam to Shanghai',
    expectedOrigin: 'NLRTM',
    expectedDestination: 'CNSHA',
    description: 'Bunker query with common ports',
  },
  {
    query: 'voyage from Hong Kong to Fujairah',
    expectedOrigin: 'HKHKG',
    expectedDestination: 'AEFJR',
    description: 'Voyage query with common ports',
  },
];

export async function testPortExtraction(): Promise<{ passed: number; failed: number }> {
  console.log('\n🧪 [BASELINE] Port Extraction Tests - Fixed Logic\n');
  let passed = 0;
  let failed = 0;

  for (const test of PORT_EXTRACTION_TESTS) {
    console.log(`\n📝 Testing: "${test.query}"`);
    console.log(`   Description: ${test.description}`);
    console.log(`   Expected: ${test.expectedOrigin} → ${test.expectedDestination}`);
    
    try {
      const result = await extractPortsFromQuery(test.query);
      console.log(`   Got:      ${result.origin} → ${result.destination}`);
      
      const originMatch = test.expectedOrigin === null 
        ? result.origin === null 
        : result.origin === test.expectedOrigin;
      const destMatch = test.expectedDestination === null 
        ? result.destination === null 
        : result.destination === test.expectedDestination;
      
      if (originMatch && destMatch) {
        console.log('   ✅ PASSED');
        passed++;
      } else {
        console.log('   ❌ FAILED');
        if (!originMatch) {
          console.log(`      Origin mismatch: expected ${test.expectedOrigin}, got ${result.origin}`);
        }
        if (!destMatch) {
          console.log(`      Destination mismatch: expected ${test.expectedDestination}, got ${result.destination}`);
        }
        failed++;
      }
    } catch (error) {
      console.log(`   ❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  }

  console.log(`\n📊 Port Extraction Results: ${passed}/${PORT_EXTRACTION_TESTS.length} passed`);
  return { passed, failed };
}

// ============================================================================
// Context-Aware Single Port Detection Tests
// ============================================================================

interface SinglePortTest {
  query: string;
  expectedIsOrigin: boolean | null; // true = origin, false = dest, null = unclear/error expected
  expectedPort: string;
  description: string;
}

const SINGLE_PORT_CONTEXT_TESTS: SinglePortTest[] = [
  {
    query: 'from Singapore to unknown port',
    expectedIsOrigin: true,
    expectedPort: 'SGSIN',
    description: '"from X" pattern - port is origin',
  },
  {
    query: 'voyage to Singapore',
    expectedIsOrigin: false,
    expectedPort: 'SGSIN',
    description: '"to X" pattern - port is destination',
  },
];

export async function testSinglePortContext(): Promise<{ passed: number; failed: number }> {
  console.log('\n🧪 [BASELINE] Single Port Context Detection Tests\n');
  let passed = 0;
  let failed = 0;

  for (const test of SINGLE_PORT_CONTEXT_TESTS) {
    console.log(`\n📝 Testing: "${test.query}"`);
    console.log(`   Description: ${test.description}`);
    
    try {
      const result = await extractPortsFromQuery(test.query);
      
      // Determine if port was detected as origin or destination
      const detectedAsOrigin = result.origin === test.expectedPort;
      const detectedAsDest = result.destination === test.expectedPort;
      
      console.log(`   Got: origin=${result.origin}, dest=${result.destination}`);
      
      if (test.expectedIsOrigin === true && detectedAsOrigin) {
        console.log('   ✅ PASSED - Correctly identified as origin');
        passed++;
      } else if (test.expectedIsOrigin === false && detectedAsDest) {
        console.log('   ✅ PASSED - Correctly identified as destination');
        passed++;
      } else if (test.expectedIsOrigin === null && !detectedAsOrigin && !detectedAsDest) {
        console.log('   ✅ PASSED - Correctly triggered fallback (context unclear)');
        passed++;
      } else {
        console.log('   ❌ FAILED - Incorrect context detection');
        failed++;
      }
    } catch (error) {
      if (test.expectedIsOrigin === null) {
        console.log('   ✅ PASSED - Error expected for ambiguous context');
        passed++;
      } else {
        console.log(`   ❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
        failed++;
      }
    }
  }

  console.log(`\n📊 Single Port Context Results: ${passed}/${SINGLE_PORT_CONTEXT_TESTS.length} passed`);
  return { passed, failed };
}

// ============================================================================
// Updated Main Runner
// ============================================================================

export async function runBaselineTests(): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('BASELINE QUERY TESTS – capture current system behavior before engine integration');
  console.log('='.repeat(80));

  testSystemHealth();

  // Run port extraction tests first (faster)
  const portTests = await testPortExtraction();
  const contextTests = await testSinglePortContext();

  const q = await runBaselineQueries();
  const rq = await testResponseQuality();
  const perf = await testPerformanceBenchmarks();

  const totalPassed = q.passed + rq.passed + perf.passed + portTests.passed + contextTests.passed;
  const totalFailed = q.failed + rq.failed + perf.failed + portTests.failed + contextTests.failed;

  console.log('\n' + '='.repeat(80));
  console.log('BASELINE SUMMARY');
  console.log('  Port extraction:   passed=%d failed=%d', portTests.passed, portTests.failed);
  console.log('  Context detection: passed=%d failed=%d', contextTests.passed, contextTests.failed);
  console.log('  Baseline queries:  passed=%d failed=%d', q.passed, q.failed);
  console.log('  Response quality:  passed=%d failed=%d', rq.passed, rq.failed);
  console.log('  Performance:       passed=%d failed=%d', perf.passed, perf.failed);
  console.log('  TOTAL:             passed=%d failed=%d', totalPassed, totalFailed);
  console.log('='.repeat(80));

  if (totalFailed > 0) {
    process.exit(1);
  }
}

// Run when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runBaselineTests().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
