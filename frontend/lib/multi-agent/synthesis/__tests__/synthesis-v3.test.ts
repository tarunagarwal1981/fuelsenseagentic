/**
 * Synthesis Engine v3 Tests
 * 
 * Tests for the v3 synthesis engine with query type classification.
 * Uses tsx runner (no Jest dependency).
 */

import { shouldRunSynthesis } from '../synthesis-engine';
import type { MultiAgentState } from '../../state';

// ============================================================================
// Test Utilities
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
    console.log(`     Expected: ${expected}`);
    console.log(`     Actual: ${actual}`);
    testsFailed++;
  }
}

function assertContains(str: string | undefined, substring: string, message: string): void {
  const passed = str?.includes(substring) ?? false;
  if (passed) {
    console.log(`  ✅ ${message}`);
    testsPassed++;
  } else {
    console.log(`  ❌ ${message}`);
    console.log(`     String "${str}" does not contain "${substring}"`);
    testsFailed++;
  }
}

// ============================================================================
// Test: Query Type Classification Schema
// ============================================================================

function testQueryTypeSchema(): void {
  console.log('\n📋 Testing Query Type Schema...');
  console.log('-'.repeat(50));
  
  // Test that the schema supports all 4 query types
  const validQueryTypes = ['informational', 'decision-required', 'validation', 'comparison'];
  
  validQueryTypes.forEach(queryType => {
    const mockInsights: MultiAgentState['synthesized_insights'] = {
      query_type: queryType as any,
      response: {
        informational: queryType === 'informational' ? {
          answer: 'Test answer',
          key_facts: ['Fact 1'],
        } : undefined,
        decision: queryType === 'decision-required' ? {
          action: 'Test action',
          primary_metric: '$100K',
          risk_level: 'safe',
          confidence: 85,
        } : undefined,
        validation: queryType === 'validation' ? {
          result: 'feasible',
          explanation: 'Test explanation',
        } : undefined,
        comparison: queryType === 'comparison' ? {
          winner: 'Port A',
          winner_reason: 'Cheapest',
          comparison_factors: ['cost'],
        } : undefined,
      },
      strategic_priorities: [],
      critical_risks: [],
      details_to_surface: {
        show_multi_port_analysis: false,
        show_alternatives: false,
        show_rob_waypoints: false,
        show_weather_details: false,
        show_eca_details: false,
      },
      cross_agent_connections: [],
      hidden_opportunities: [],
      synthesis_metadata: {
        agents_analyzed: ['test_agent'],
        synthesis_model: 'claude-haiku-4-5',
        synthesis_timestamp: Date.now(),
        confidence_score: 0.85,
        filtering_rationale: {
          why_surfaced: [],
          why_hidden: [],
        },
      },
    };
    
    assert(mockInsights.query_type === queryType, `Query type "${queryType}" is valid`);
  });
}

// ============================================================================
// Test: Strategic Priorities Schema
// ============================================================================

function testStrategicPrioritiesSchema(): void {
  console.log('\n📋 Testing Strategic Priorities Schema...');
  console.log('-'.repeat(50));
  
  const priority: MultiAgentState['synthesized_insights'] = {
    query_type: 'decision-required',
    response: {
      decision: {
        action: 'Bunker at Singapore',
        primary_metric: '$594K total',
        risk_level: 'caution',
        confidence: 85,
      },
    },
    strategic_priorities: [
      {
        priority: 1,
        action: 'Execute bunkering at Singapore',
        why: 'Current ROB violates 3-day safety minimum',
        impact: 'Prevents $2M+ emergency fuel costs',
        urgency: 'immediate',
      },
      {
        priority: 2,
        action: 'Verify bunker prices',
        why: 'Price data is stale',
        impact: 'Avoid budget overruns',
        urgency: 'today',
      },
      {
        priority: 3,
        action: 'Review weather forecast',
        why: 'Weather may affect timing',
        impact: 'Optimize bunkering window',
        urgency: 'this_week',
      },
    ],
    critical_risks: [],
    details_to_surface: {
      show_multi_port_analysis: false,
      show_alternatives: false,
      show_rob_waypoints: true,
      show_weather_details: false,
      show_eca_details: false,
    },
    cross_agent_connections: [],
    hidden_opportunities: [],
    synthesis_metadata: {
      agents_analyzed: ['bunker_agent', 'rob_agent'],
      synthesis_model: 'claude-haiku-4-5',
      synthesis_timestamp: Date.now(),
      confidence_score: 0.85,
      filtering_rationale: {
        why_surfaced: ['Safety margin tight'],
        why_hidden: ['Weather details not material'],
      },
    },
  };
  
  assertEqual(priority!.strategic_priorities.length, 3, 'Has 3 strategic priorities');
  assertEqual(priority!.strategic_priorities[0].priority, 1, 'First priority is 1');
  assertEqual(priority!.strategic_priorities[0].urgency, 'immediate', 'First priority urgency is immediate');
  assert(priority!.strategic_priorities[0].why !== undefined, 'Priority has "why" field (not "rationale")');
}

// ============================================================================
// Test: Critical Risks Schema (renamed from risk_alerts)
// ============================================================================

function testCriticalRisksSchema(): void {
  console.log('\n📋 Testing Critical Risks Schema...');
  console.log('-'.repeat(50));
  
  const insights: MultiAgentState['synthesized_insights'] = {
    query_type: 'decision-required',
    response: {
      decision: {
        action: 'Bunker immediately',
        primary_metric: '2.7 days margin',
        risk_level: 'critical',
        confidence: 90,
      },
    },
    strategic_priorities: [],
    critical_risks: [
      {
        risk: 'Safety margin below 3-day minimum',
        severity: 'critical',
        consequence: 'Vessel runs out of fuel',
        mitigation: 'Execute immediate bunkering',
      },
      {
        risk: 'Price data stale',
        severity: 'high',
        consequence: 'Budget variance risk',
        mitigation: 'Verify current prices',
      },
    ],
    details_to_surface: {
      show_multi_port_analysis: false,
      show_alternatives: false,
      show_rob_waypoints: true,
      show_weather_details: false,
      show_eca_details: false,
    },
    cross_agent_connections: [],
    hidden_opportunities: [],
    synthesis_metadata: {
      agents_analyzed: ['bunker_agent'],
      synthesis_model: 'claude-haiku-4-5',
      synthesis_timestamp: Date.now(),
      confidence_score: 0.85,
      filtering_rationale: {
        why_surfaced: [],
        why_hidden: [],
      },
    },
  };
  
  assertEqual(insights!.critical_risks.length, 2, 'Has 2 critical risks');
  assertEqual(insights!.critical_risks[0].severity, 'critical', 'First risk is critical severity');
  assertEqual(insights!.critical_risks[1].severity, 'high', 'Second risk is high severity');
  assert(insights!.critical_risks[0].consequence !== undefined, 'Risk has "consequence" field');
}

// ============================================================================
// Test: Details to Surface Flags
// ============================================================================

function testDetailsToSurfaceFlags(): void {
  console.log('\n📋 Testing Details to Surface Flags...');
  console.log('-'.repeat(50));
  
  const insights: MultiAgentState['synthesized_insights'] = {
    query_type: 'decision-required',
    response: {
      decision: {
        action: 'Test',
        primary_metric: 'Test',
        risk_level: 'safe',
        confidence: 80,
      },
    },
    strategic_priorities: [],
    critical_risks: [],
    details_to_surface: {
      show_multi_port_analysis: true,
      show_alternatives: false,
      show_rob_waypoints: true,
      show_weather_details: false,
      show_eca_details: true,
    },
    cross_agent_connections: [],
    hidden_opportunities: [],
    synthesis_metadata: {
      agents_analyzed: [],
      synthesis_model: 'claude-haiku-4-5',
      synthesis_timestamp: Date.now(),
      confidence_score: 0.85,
      filtering_rationale: {
        why_surfaced: ['Multi-port required due to capacity'],
        why_hidden: ['Weather conditions normal'],
      },
    },
  };
  
  assertEqual(insights!.details_to_surface.show_multi_port_analysis, true, 'show_multi_port_analysis is true');
  assertEqual(insights!.details_to_surface.show_alternatives, false, 'show_alternatives is false');
  assertEqual(insights!.details_to_surface.show_rob_waypoints, true, 'show_rob_waypoints is true');
  assertEqual(insights!.details_to_surface.show_weather_details, false, 'show_weather_details is false');
  assertEqual(insights!.details_to_surface.show_eca_details, true, 'show_eca_details is true');
}

// ============================================================================
// Test: Filtering Rationale
// ============================================================================

function testFilteringRationale(): void {
  console.log('\n📋 Testing Filtering Rationale...');
  console.log('-'.repeat(50));
  
  const insights: MultiAgentState['synthesized_insights'] = {
    query_type: 'informational',
    response: {
      informational: {
        answer: 'Distance is 8,142nm',
        key_facts: ['Via Suez Canal'],
      },
    },
    strategic_priorities: [],
    critical_risks: [],
    details_to_surface: {
      show_multi_port_analysis: false,
      show_alternatives: false,
      show_rob_waypoints: false,
      show_weather_details: false,
      show_eca_details: false,
    },
    cross_agent_connections: [],
    hidden_opportunities: [],
    synthesis_metadata: {
      agents_analyzed: ['route_agent'],
      synthesis_model: 'claude-haiku-4-5',
      synthesis_timestamp: Date.now(),
      confidence_score: 0.9,
      filtering_rationale: {
        why_surfaced: ['Basic route info requested'],
        why_hidden: ['No bunker planning needed', 'No safety concerns'],
      },
    },
  };
  
  assert(Array.isArray(insights!.synthesis_metadata.filtering_rationale.why_surfaced), 'why_surfaced is array');
  assert(Array.isArray(insights!.synthesis_metadata.filtering_rationale.why_hidden), 'why_hidden is array');
  assertEqual(insights!.synthesis_metadata.filtering_rationale.why_hidden.length, 2, 'Has 2 hidden reasons');
}

// ============================================================================
// Test: shouldRunSynthesis Decision Logic
// ============================================================================

function testShouldRunSynthesis(): void {
  console.log('\n📋 Testing shouldRunSynthesis Decision Logic...');
  console.log('-'.repeat(50));
  
  // Test: No agents
  const noAgentsState: Partial<MultiAgentState> = {
    agent_status: {},
  };
  const noAgentsResult = shouldRunSynthesis(noAgentsState as MultiAgentState);
  assertEqual(noAgentsResult.run, false, 'Returns false when no agents succeeded');
  
  // Test: Safety critical overrides minimum agent count
  const safetyState: Partial<MultiAgentState> = {
    agent_status: {
      route_agent: 'success',
      bunker_agent: 'success',
    },
    rob_safety_status: {
      overall_safe: false,
      minimum_rob_days: 1.5,
      violations: ['Low ROB'],
    },
  };
  const safetyResult = shouldRunSynthesis(safetyState as MultiAgentState);
  assertEqual(safetyResult.run, true, 'Returns true for safety critical even with < min agents');
}

// ============================================================================
// Main Test Runner
// ============================================================================

export async function testSynthesisV3(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 SYNTHESIS ENGINE V3 TESTS');
  console.log('='.repeat(60));
  
  testsPassed = 0;
  testsFailed = 0;
  
  testQueryTypeSchema();
  testStrategicPrioritiesSchema();
  testCriticalRisksSchema();
  testDetailsToSurfaceFlags();
  testFilteringRationale();
  testShouldRunSynthesis();
  
  console.log('\n' + '='.repeat(60));
  console.log(`📊 Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('='.repeat(60));
  
  if (testsFailed > 0) {
    throw new Error(`${testsFailed} tests failed`);
  }
}

// Run if executed directly
if (require.main === module) {
  testSynthesisV3()
    .then(() => {
      console.log('\n✅ All synthesis v3 tests passed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Tests failed:', error.message);
      process.exit(1);
    });
}
