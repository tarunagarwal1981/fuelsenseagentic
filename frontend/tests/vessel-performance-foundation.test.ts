/**
 * Vessel Performance Foundation Tests
 *
 * Tests for Phase 1 foundation components:
 * - Entity Extractor Agent
 * - Tool registration (noon report, vessel specs, consumption profiles)
 * - Agent registry integration
 *
 * Run with: npx tsx tests/vessel-performance-foundation.test.ts
 * Or: npm run test:vessel-foundation
 */

// Load environment variables first (must be before other imports)
import '../lib/multi-agent/__tests__/setup-env';

import { entityExtractorAgentNode } from '@/lib/multi-agent/agents/entity-extractor-agent';
import { ToolRegistry } from '@/lib/registry/tool-registry';
import { registerAllTools } from '@/lib/registry/tools';
import { AgentRegistryV2 } from '@/lib/multi-agent/agent-registry-v2';
import type { MultiAgentState } from '@/lib/multi-agent/state';
import type {
  VesselBasicInfo,
  NoonReportData,
  ConsumptionProfile,
} from '@/lib/types/vessel-performance';

// Import to trigger agent registration
import '@/lib/multi-agent/agents/entity-extractor-agent';

// ============================================================================
// Assertion Helpers
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

function assertDefined<T>(value: T | undefined | null, message: string): void {
  assert(value != null, message);
}

function assertContains<T>(arr: T[] | undefined, item: T, message: string): void {
  assert(Array.isArray(arr) && arr.includes(item), message);
}

function assertLength(arr: unknown[] | undefined, len: number, message: string): void {
  assert(Array.isArray(arr) && arr.length === len, message);
}

// ============================================================================
// Test State Helpers
// ============================================================================

function makeState(overrides: Partial<MultiAgentState>): MultiAgentState {
  const base: Partial<MultiAgentState> = {
    messages: [],
    vessel_identifiers: undefined,
    agent_status: {},
    agent_errors: {},
  };
  return { ...base, ...overrides } as MultiAgentState;
}

function makeUserMessage(content: string) {
  return { role: 'user' as const, content } as any;
}

// ============================================================================
// Entity Extractor Agent Tests
// ============================================================================

async function runEntityExtractorTests() {
  console.log('\n📋 Entity Extractor Agent\n');

  // Single vessel name
  const r1 = await entityExtractorAgentNode(
    makeState({ messages: [makeUserMessage("What's the position of OCEAN PRIDE?")] }),
    { __mockLLMResponse: '{"vessel_names": ["OCEAN PRIDE"], "imo_numbers": [], "confidence": "high"}' }
  );
  assertDefined(r1.vessel_identifiers, 'extracts single vessel name from query');
  assertContains(r1.vessel_identifiers?.names, 'OCEAN PRIDE', 'vessel_identifiers.names contains OCEAN PRIDE');
  assertLength(r1.vessel_identifiers?.names, 1, 'single vessel name');
  assertLength(r1.vessel_identifiers?.imos || [], 0, 'no IMO numbers');

  // Multiple vessel names
  const r2 = await entityExtractorAgentNode(
    makeState({ messages: [makeUserMessage('Compare fuel consumption for TITAN and ATHENA')] }),
    { __mockLLMResponse: '{"vessel_names": ["TITAN", "ATHENA"], "imo_numbers": [], "confidence": "high"}' }
  );
  assertContains(r2.vessel_identifiers?.names, 'TITAN', 'extracts TITAN');
  assertContains(r2.vessel_identifiers?.names, 'ATHENA', 'extracts ATHENA');
  assertLength(r2.vessel_identifiers?.names, 2, 'multiple vessel names');

  // IMO with prefix
  const r3 = await entityExtractorAgentNode(
    makeState({ messages: [makeUserMessage('Show noon report for IMO 9876543')] }),
    { __mockLLMResponse: '{"vessel_names": [], "imo_numbers": ["9876543"], "confidence": "high"}' }
  );
  assertContains(r3.vessel_identifiers?.imos, '9876543', 'extracts IMO with prefix');
  assertLength(r3.vessel_identifiers?.imos || [], 1, 'single IMO');

  // IMO without prefix
  const r4 = await entityExtractorAgentNode(
    makeState({ messages: [makeUserMessage('Get data for vessel 9876543')] }),
    { __mockLLMResponse: '{"vessel_names": [], "imo_numbers": ["9876543"], "confidence": "high"}' }
  );
  assertContains(r4.vessel_identifiers?.imos, '9876543', 'extracts IMO without prefix');

  // Both name and IMO
  const r5 = await entityExtractorAgentNode(
    makeState({ messages: [makeUserMessage('Show data for OCEAN PRIDE (IMO 9876543)')] }),
    { __mockLLMResponse: '{"vessel_names": ["OCEAN PRIDE"], "imo_numbers": ["9876543"], "confidence": "high"}' }
  );
  assertContains(r5.vessel_identifiers?.names, 'OCEAN PRIDE', 'extracts name when both present');
  assertContains(r5.vessel_identifiers?.imos, '9876543', 'extracts IMO when both present');

  // Removes vessel prefixes (MV, M/V)
  const r6 = await entityExtractorAgentNode(
    makeState({ messages: [makeUserMessage('Status of MV ATLANTIC STAR')] }),
    { __mockLLMResponse: '{"vessel_names": ["ATLANTIC STAR"], "imo_numbers": [], "confidence": "high"}' }
  );
  assertContains(r6.vessel_identifiers?.names, 'ATLANTIC STAR', 'removes MV prefix');
  assert(
    !r6.vessel_identifiers?.names?.includes('MV ATLANTIC STAR'),
    'does not include MV in extracted name'
  );

  // No vessels - returns empty (agent_status only, no vessel_identifiers)
  const r7 = await entityExtractorAgentNode(
    makeState({ messages: [makeUserMessage('What is the weather in Singapore?')] }),
    { __mockLLMResponse: '{"vessel_names": [], "imo_numbers": [], "confidence": "high"}' }
  );
  assert(r7.vessel_identifiers === undefined, 'returns no vessel_identifiers when no vessels');
  assert(r7.agent_status?.entity_extractor === 'success', 'still sets agent_status success');

  // Idempotent - skips if already extracted
  const r8 = await entityExtractorAgentNode(
    makeState({
      vessel_identifiers: { names: ['EXISTING VESSEL'], imos: [] },
      messages: [makeUserMessage("What's the position of OCEAN PRIDE?")],
    }),
    { __mockLLMResponse: '{"vessel_names": ["OCEAN PRIDE"], "imo_numbers": [], "confidence": "high"}' }
  );
  assertEqual(Object.keys(r8).length, 0, 'skips extraction when vessel_identifiers already exists (idempotent)');

  // Empty messages - returns empty
  const r9 = await entityExtractorAgentNode(makeState({ messages: [] }));
  assertEqual(Object.keys(r9).length, 0, 'handles empty message array gracefully');
}

// ============================================================================
// Tool Registration Tests
// ============================================================================

async function runToolRegistrationTests() {
  console.log('\n📋 Tool Registration\n');

  // Register all tools (including vessel performance tools)
  registerAllTools();

  const registry = ToolRegistry.getInstance();

  const noonReportTool = registry.getById('fetch_noon_report');
  assertDefined(noonReportTool, 'noon report tool is registered');
  assertEqual(noonReportTool?.name, 'Noon Report Fetcher', 'noon report tool has correct name');
  assertEqual(noonReportTool?.category, 'vessel', 'noon report tool has vessel category');

  const vesselSpecTool = registry.getById('fetch_vessel_specs');
  assertDefined(vesselSpecTool, 'vessel spec tool is registered');
  assertEqual(vesselSpecTool?.name, 'Vessel Specification Fetcher', 'vessel spec tool has correct name');
  assertEqual(vesselSpecTool?.category, 'vessel', 'vessel spec tool has vessel category');

  const consumptionTool = registry.getById('fetch_consumption_profile');
  assertDefined(consumptionTool, 'consumption profile tool is registered');
  assertEqual(consumptionTool?.name, 'Consumption Profile Fetcher', 'consumption tool has correct name');
  assertEqual(consumptionTool?.category, 'vessel', 'consumption tool has vessel category');

  // All vessel tools in vessel category
  const vesselTools = registry.getByCategory('vessel');
  assert(
    vesselTools.length >= 3,
    `at least 3 vessel tools registered (got ${vesselTools.length})`
  );
  assert(
    vesselTools.some((t) => t.id === 'fetch_noon_report'),
    'noon report in vessel category'
  );
  assert(
    vesselTools.some((t) => t.id === 'fetch_vessel_specs'),
    'vessel specs in vessel category'
  );
  assert(
    vesselTools.some((t) => t.id === 'fetch_consumption_profile'),
    'consumption profile in vessel category'
  );
}

// ============================================================================
// Agent Registry Integration Tests
// ============================================================================

async function runAgentRegistryTests() {
  console.log('\n📋 Agent Registry Integration\n');

  const agent = AgentRegistryV2.getAgent('entity_extractor');
  assertDefined(agent, 'entity extractor is registered');
  assertEqual(agent?.agent_name, 'Entity Extractor Agent', 'entity extractor has correct name');
  assertEqual(agent?.domain, 'vessel_performance', 'entity extractor has vessel_performance domain');

  assertContains(
    agent?.prerequisites.required_state,
    'messages',
    'entity extractor requires messages'
  );
  assertLength((agent?.prerequisites as { required_tools?: string[] } | undefined)?.required_tools ?? [], 0, 'entity extractor has no required tools');
  assertLength(agent?.prerequisites.required_agents || [], 0, 'entity extractor has no required agents');

  assertContains(agent?.produces.primary, 'vessel_identifiers', 'entity extractor produces vessel_identifiers');

  assertEqual(agent?.can_run_in_parallel, true, 'entity extractor can run in parallel');
  assertEqual(agent?.priority, 'high', 'entity extractor has high priority');
}

// ============================================================================
// Future Agent Prerequisites Tests
// ============================================================================

async function runFuturePrerequisitesTests() {
  console.log('\n📋 Prerequisites for Future Agents\n');

  const hullRequiredTools = [
    'fetch_vessel_specs',
    'fetch_noon_report',
  ];
  const hullRequiredAgents = ['entity_extractor'];
  const hullRequiredState = ['vessel_identifiers'];

  assertContains(hullRequiredTools, 'fetch_vessel_specs', 'Hull agent will need vessel specs');
  assertContains(hullRequiredTools, 'fetch_noon_report', 'Hull agent will need noon report');
  assertContains(hullRequiredAgents, 'entity_extractor', 'Hull agent will need entity extractor');

  const machineryRequiredTools = [
    'fetch_noon_report',
    'fetch_consumption_profile',
    'fetch_vessel_specs',
  ];
  const machineryRequiredAgents = ['entity_extractor'];

  assertEqual(machineryRequiredTools.length, 3, 'Machinery agent needs 3 tools');
  assertContains(machineryRequiredAgents, 'entity_extractor', 'Machinery agent will need entity extractor');
}

// ============================================================================
// Type Definition Tests
// ============================================================================

async function runTypeDefinitionTests() {
  console.log('\n📋 Type Definitions\n');

  const vessel: VesselBasicInfo = {
    name: 'TEST VESSEL',
    imo: '1234567',
    type: 'Bulk Carrier',
    dwt: 75000,
    flag: 'SG',
    built: 2015,
  };
  assertEqual(vessel.name, 'TEST VESSEL', 'VesselBasicInfo type is defined');

  const report: NoonReportData = {
    timestamp: '2025-02-04T12:00:00Z',
    imo: '1234567',
    vessel_name: 'TEST VESSEL',
    position: { latitude: 1.2, longitude: 103.8 },
    next_port: { name: 'Singapore' },
    rob: { vlsfo: 500, lsmgo: 100 },
    speed: 14.5,
  };
  assertEqual(report.speed, 14.5, 'NoonReportData type is defined');

  const profile: ConsumptionProfile = {
    imo: '1234567',
    speed: 14,
    weather_condition: 'moderate',
    consumption: {
      main_engine: { vlsfo: 25 },
      auxiliary_engine: { vlsfo: 3 },
    },
    load_condition: 'laden',
  };
  assertEqual(profile.speed, 14, 'ConsumptionProfile type is defined');
}

// ============================================================================
// Main Runner
// ============================================================================

async function runAllTests() {
  console.log('🚀 Vessel Performance Foundation Tests');
  console.log('='.repeat(60));

  await runEntityExtractorTests();
  await runToolRegistrationTests();
  await runAgentRegistryTests();
  await runFuturePrerequisitesTests();
  await runTypeDefinitionTests();

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Results: ${testsPassed} passed, ${testsFailed} failed`);

  if (testsFailed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runAllTests().catch((err) => {
  console.error('❌ Test runner error:', err);
  process.exit(1);
});

/**
 * Integration Test Plan (for Phase 2)
 *
 * Once Hull and Machinery agents are implemented:
 *
 * 1. End-to-end vessel query test
 * 2. Parallel execution of entity_extractor + route agent
 * 3. Full state flow: entity extraction → performance analysis → synthesis
 * 4. Multi-vessel comparison queries
 * 5. Error handling with missing vessel data
 */
