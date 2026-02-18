/**
 * Intent Workflows Unit Tests
 *
 * Tests config-driven workflow: getNextAgentFromWorkflow, INTENT_WORKFLOWS.
 */

import type { MultiAgentState } from '@/lib/multi-agent/state';
import {
  getNextAgentFromWorkflow,
  INTENT_WORKFLOWS,
} from '@/lib/config/intent-workflows';

function emptyState(): Partial<MultiAgentState> {
  return {
    original_intent: null,
    route_data: null,
    bunker_analysis: null,
    vessel_names: undefined,
    vessel_comparison_analysis: undefined,
    vessel_identifiers: undefined,
    vessel_specs: undefined,
    agent_status: {},
  };
}

/**
 * Run intent workflow tests
 */
export async function testIntentWorkflows(): Promise<void> {
  console.log('\n🧪 [INTENT-WORKFLOWS-TEST] Starting intent workflow tests...\n');

  let passed = 0;
  let failed = 0;

  // --- bunker_planning: no state -> route_agent
  const s0 = emptyState() as MultiAgentState;
  const next0 = getNextAgentFromWorkflow('bunker_planning', s0);
  if (next0 === 'route_agent') {
    console.log('   ✅ bunker_planning (empty state) -> route_agent');
    passed++;
  } else {
    console.log(`   ❌ bunker_planning (empty state) -> expected route_agent, got ${next0}`);
    failed++;
  }

  // --- bunker_planning: route done -> entity_extractor (no vessel ids)
  const s1 = {
    ...emptyState(),
    original_intent: 'bunker_planning',
    route_data: {},
    agent_status: { route_agent: 'success' },
  } as MultiAgentState;
  const next1 = getNextAgentFromWorkflow('bunker_planning', s1);
  if (next1 === 'entity_extractor') {
    console.log('   ✅ bunker_planning (route done, no vessel ids) -> entity_extractor');
    passed++;
  } else {
    console.log(`   ❌ bunker_planning (route done) -> expected entity_extractor, got ${next1}`);
    failed++;
  }

  // --- bunker_planning: route + entity done, has vessel ids, no specs -> vessel_info_agent
  const s2 = {
    ...emptyState(),
    original_intent: 'bunker_planning',
    route_data: {},
    vessel_identifiers: { names: ['ship a'], imos: [] },
    vessel_specs: undefined,
    agent_status: { route_agent: 'success', entity_extractor: 'success' },
  } as MultiAgentState;
  const next2 = getNextAgentFromWorkflow('bunker_planning', s2);
  if (next2 === 'vessel_info_agent') {
    console.log('   ✅ bunker_planning (has vessel ids, no specs) -> vessel_info_agent');
    passed++;
  } else {
    console.log(`   ❌ bunker_planning (has ids, no specs) -> expected vessel_info_agent, got ${next2}`);
    failed++;
  }

  // --- bunker_planning: bunker done, 2+ vessels, no comparison -> vessel_selection_agent
  const s3 = {
    ...emptyState(),
    original_intent: 'bunker_planning',
    route_data: {},
    bunker_analysis: {},
    vessel_names: ['ocean pioneer', 'pacific trader'],
    vessel_comparison_analysis: undefined,
    agent_status: {
      route_agent: 'success',
      entity_extractor: 'success',
      vessel_info_agent: 'success',
      bunker_agent: 'success',
    },
  } as MultiAgentState;
  const next3 = getNextAgentFromWorkflow('bunker_planning', s3);
  if (next3 === 'vessel_selection_agent') {
    console.log('   ✅ bunker_planning (bunker done, 2 vessels) -> vessel_selection_agent');
    passed++;
  } else {
    console.log(`   ❌ bunker_planning (bunker done, 2 vessels) -> expected vessel_selection_agent, got ${next3}`);
    failed++;
  }

  // --- bunker_planning: vessel_selection done -> null
  const s4 = {
    ...s3,
    vessel_comparison_analysis: {},
    agent_status: { ...s3.agent_status, vessel_selection_agent: 'success' },
  } as MultiAgentState;
  const next4 = getNextAgentFromWorkflow('bunker_planning', s4);
  if (next4 === null) {
    console.log('   ✅ bunker_planning (all done) -> null');
    passed++;
  } else {
    console.log(`   ❌ bunker_planning (all done) -> expected null, got ${next4}`);
    failed++;
  }

  // --- unknown intent -> null
  const nextUnknown = getNextAgentFromWorkflow('unknown_intent', s0);
  if (nextUnknown === null) {
    console.log('   ✅ unknown intent -> null');
    passed++;
  } else {
    console.log(`   ❌ unknown intent -> expected null, got ${nextUnknown}`);
    failed++;
  }

  // --- weather_analysis: empty -> route_agent
  const nextWeather = getNextAgentFromWorkflow('weather_analysis', s0);
  if (nextWeather === 'route_agent') {
    console.log('   ✅ weather_analysis (empty) -> route_agent');
    passed++;
  } else {
    console.log(`   ❌ weather_analysis (empty) -> expected route_agent, got ${nextWeather}`);
    failed++;
  }

  // --- INTENT_WORKFLOWS has expected keys
  const expectedIntents = [
    'bunker_planning',
    'weather_analysis',
    'compliance',
    'hull_analysis',
    'vessel_info',
    'route_calculation',
    'port_weather',
  ];
  for (const intent of expectedIntents) {
    if (INTENT_WORKFLOWS[intent]?.steps?.length) {
      passed++;
    } else {
      console.log(`   ❌ INTENT_WORKFLOWS["${intent}"] missing or empty steps`);
      failed++;
    }
  }
  console.log('   ✅ INTENT_WORKFLOWS has expected intent keys');

  console.log('\n' + '='.repeat(60));
  console.log(`📊 Intent workflows: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    throw new Error(`Intent workflow tests failed: ${failed} failures`);
  }
  console.log('✅ [INTENT-WORKFLOWS-TEST] All tests passed!\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  testIntentWorkflows().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
