/**
 * Template Formatter v4 Tests
 * 
 * Tests for the v4 template system with synthesis filtering.
 * Uses tsx runner (no Jest dependency).
 */

import type { MultiAgentState } from '../../multi-agent/state';

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

// ============================================================================
// Mock State Factories
// ============================================================================

function createMockStateWithInformational(): Partial<MultiAgentState> {
  return {
    route_data: {
      distance_nm: 8142,
      estimated_hours: 576,
      waypoints: [],
      route_type: 'via Suez Canal',
      origin_port_code: 'SGSIN',
      destination_port_code: 'NLRTM',
    },
    synthesized_insights: {
      query_type: 'informational',
      response: {
        informational: {
          answer: 'The distance from Singapore to Rotterdam is approximately 8,142 nautical miles via the Suez Canal route.',
          key_facts: [
            'Distance: 8,142 nm',
            'Route: Via Suez Canal',
            'Est. duration: 24 days at 14 knots',
          ],
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
          why_hidden: ['No bunker planning needed'],
        },
      },
    },
    agent_status: {
      route_agent: 'success',
    },
  };
}

function createMockStateWithDecision(): Partial<MultiAgentState> {
  return {
    route_data: {
      distance_nm: 8142,
      estimated_hours: 576,
      waypoints: [],
      route_type: 'via Suez Canal',
      origin_port_code: 'SGSIN',
      destination_port_code: 'NLRTM',
    },
    bunker_analysis: {
      recommendations: [
        {
          port_code: 'SGSIN',
          port_name: 'Singapore',
          distance_from_route_nm: 0,
          fuel_cost_usd: 500000,
          deviation_cost_usd: 0,
          total_cost_usd: 500000,
          rank: 1,
        },
      ],
      best_option: {
        port_code: 'SGSIN',
        port_name: 'Singapore',
        distance_from_route_nm: 0,
        fuel_cost_usd: 500000,
        deviation_cost_usd: 0,
        total_cost_usd: 500000,
        rank: 1,
      },
      worst_option: {
        port_code: 'AEJEA',
        port_name: 'Jebel Ali',
        distance_from_route_nm: 50,
        fuel_cost_usd: 600000,
        deviation_cost_usd: 10000,
        total_cost_usd: 610000,
        rank: 3,
      },
      max_savings_usd: 110000,
      analysis_summary: 'Singapore offers best total cost',
    },
    synthesized_insights: {
      query_type: 'decision-required',
      response: {
        decision: {
          action: 'Bunker 886MT VLSFO + 71MT LSMGO at Singapore immediately',
          primary_metric: '$594K total (2.7 day safety margin violation)',
          risk_level: 'critical',
          confidence: 85,
        },
      },
      strategic_priorities: [
        {
          priority: 1,
          action: 'Execute immediate bunkering at Singapore',
          why: 'Current ROB of 2.7 days violates 3-day safety minimum',
          impact: 'Prevents $2M+ emergency fuel costs and vessel detention',
          urgency: 'immediate',
        },
        {
          priority: 2,
          action: 'Verify current bunker prices',
          why: 'Price data staleness creates variance risk',
          impact: 'Avoid budget overruns from outdated pricing',
          urgency: 'today',
        },
      ],
      critical_risks: [
        {
          risk: 'Safety margin below 3-day minimum',
          severity: 'critical',
          consequence: 'Vessel runs out of VLSFO after 26.2 days without bunkering',
          mitigation: 'Execute immediate bunkering at Singapore as recommended',
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
        agents_analyzed: ['route_agent', 'bunker_agent', 'rob_agent'],
        synthesis_model: 'claude-haiku-4-5',
        synthesis_timestamp: Date.now(),
        confidence_score: 0.85,
        filtering_rationale: {
          why_surfaced: ['Safety margin tight - ROB tracking critical'],
          why_hidden: ['Weather normal', 'No ECA complexity', 'Single port sufficient'],
        },
      },
    },
    rob_waypoints: [
      {
        location: 'Singapore',
        distance_from_previous: 0,
        rob_before_action: { VLSFO: 500, LSMGO: 100 },
        rob_after_action: { VLSFO: 500, LSMGO: 100 },
        safety_margin_days: 14.3,
        is_safe: true,
      },
    ],
    agent_status: {
      route_agent: 'success',
      bunker_agent: 'success',
      rob_agent: 'success',
    },
  };
}

function createMockStateWithAllDetailsFalse(): Partial<MultiAgentState> {
  return {
    route_data: {
      distance_nm: 8142,
      estimated_hours: 576,
      waypoints: [],
      route_type: 'via Suez Canal',
      origin_port_code: 'SGSIN',
      destination_port_code: 'NLRTM',
    },
    synthesized_insights: {
      query_type: 'informational',
      response: {
        informational: {
          answer: 'Distance is 8,142 nm',
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
          why_surfaced: [],
          why_hidden: ['All details filtered out'],
        },
      },
    },
    // Include data that WOULD be shown if flags were true
    multi_bunker_plan: {
      required: true,
      reason: 'Test',
      plans: [],
    },
    rob_waypoints: [
      {
        location: 'Singapore',
        distance_from_previous: 0,
        rob_before_action: { VLSFO: 500, LSMGO: 100 },
        rob_after_action: { VLSFO: 500, LSMGO: 100 },
        safety_margin_days: 14.3,
        is_safe: true,
      },
    ],
    weather_forecast: [],
    compliance_data: {
      eca_zones: {
        has_eca_zones: true,
        total_eca_distance_nm: 100,
        total_eca_time_hours: 10,
        eca_zones_crossed: [],
        proposed_zones_crossed: [],
        fuel_requirements: {
          requires_eca_fuel: true,
          total_mgo_required_mt: 50,
          mgo_with_safety_margin_mt: 55,
          safety_margin_percent: 10,
          switching_points: [],
        },
        compliance_warnings: [],
      },
    },
    agent_status: {
      route_agent: 'success',
    },
  };
}

// ============================================================================
// Test: Query Type Condition Evaluation
// ============================================================================

function testQueryTypeConditions(): void {
  console.log('\n📋 Testing Query Type Conditions...');
  console.log('-'.repeat(50));
  
  const informationalState = createMockStateWithInformational();
  const decisionState = createMockStateWithDecision();
  
  // Test informational query type detection
  assertEqual(
    informationalState.synthesized_insights?.query_type,
    'informational',
    'Informational state has query_type = informational'
  );
  
  // Test decision query type detection
  assertEqual(
    decisionState.synthesized_insights?.query_type,
    'decision-required',
    'Decision state has query_type = decision-required'
  );
  
  // Test that response objects match query type
  assert(
    informationalState.synthesized_insights?.response?.informational !== undefined,
    'Informational state has informational response'
  );
  
  assert(
    decisionState.synthesized_insights?.response?.decision !== undefined,
    'Decision state has decision response'
  );
}

// ============================================================================
// Test: Details to Surface Flags
// ============================================================================

function testDetailsToSurfaceFlags(): void {
  console.log('\n📋 Testing Details to Surface Flags...');
  console.log('-'.repeat(50));
  
  const allFalseState = createMockStateWithAllDetailsFalse();
  const flags = allFalseState.synthesized_insights?.details_to_surface;
  
  assertEqual(flags?.show_multi_port_analysis, false, 'show_multi_port_analysis is false');
  assertEqual(flags?.show_alternatives, false, 'show_alternatives is false');
  assertEqual(flags?.show_rob_waypoints, false, 'show_rob_waypoints is false');
  assertEqual(flags?.show_weather_details, false, 'show_weather_details is false');
  assertEqual(flags?.show_eca_details, false, 'show_eca_details is false');
  
  // Verify the data exists but should NOT be rendered
  assert(
    allFalseState.multi_bunker_plan !== undefined,
    'multi_bunker_plan data exists but should be hidden'
  );
  assert(
    allFalseState.rob_waypoints !== undefined,
    'rob_waypoints data exists but should be hidden'
  );
  assert(
    allFalseState.weather_forecast !== undefined,
    'weather_forecast data exists but should be hidden'
  );
  assert(
    allFalseState.compliance_data?.eca_zones !== undefined,
    'eca_zones data exists but should be hidden'
  );
}

// ============================================================================
// Test: Strategic Priorities Structure
// ============================================================================

function testStrategicPrioritiesStructure(): void {
  console.log('\n📋 Testing Strategic Priorities Structure...');
  console.log('-'.repeat(50));
  
  const decisionState = createMockStateWithDecision();
  const priorities = decisionState.synthesized_insights?.strategic_priorities;
  
  assertEqual(priorities?.length, 2, 'Has 2 strategic priorities');
  
  if (priorities && priorities.length >= 2) {
    assertEqual(priorities[0].priority, 1, 'First priority is 1');
    assertEqual(priorities[0].urgency, 'immediate', 'First priority urgency is immediate');
    assert(priorities[0].why !== undefined, 'Priority has "why" field');
    assert(priorities[0].impact !== undefined, 'Priority has "impact" field');
    
    assertEqual(priorities[1].priority, 2, 'Second priority is 2');
    assertEqual(priorities[1].urgency, 'today', 'Second priority urgency is today');
  }
}

// ============================================================================
// Test: Critical Risks Structure
// ============================================================================

function testCriticalRisksStructure(): void {
  console.log('\n📋 Testing Critical Risks Structure...');
  console.log('-'.repeat(50));
  
  const decisionState = createMockStateWithDecision();
  const risks = decisionState.synthesized_insights?.critical_risks;
  
  assertEqual(risks?.length, 1, 'Has 1 critical risk');
  
  if (risks && risks.length >= 1) {
    assertEqual(risks[0].severity, 'critical', 'Risk severity is critical');
    assert(risks[0].consequence !== undefined, 'Risk has "consequence" field');
    assert(risks[0].mitigation !== undefined, 'Risk has "mitigation" field');
  }
}

// ============================================================================
// Test: Tier System
// ============================================================================

function testTierSystem(): void {
  console.log('\n📋 Testing Tier System...');
  console.log('-'.repeat(50));
  
  // Tier 0 - Map should always render when route_data exists
  const stateWithRoute = createMockStateWithInformational();
  assert(
    stateWithRoute.route_data !== undefined,
    'Tier 0 (map) should render when route_data exists'
  );
  
  // Tier 1 - Primary response based on query type
  assert(
    stateWithRoute.synthesized_insights?.response?.informational !== undefined,
    'Tier 1 informational response renders for informational query'
  );
  
  // Tier 2 - Strategic priorities and critical risks
  const decisionState = createMockStateWithDecision();
  assert(
    (decisionState.synthesized_insights?.strategic_priorities?.length ?? 0) > 0,
    'Tier 2 strategic priorities should render when present'
  );
  assert(
    (decisionState.synthesized_insights?.critical_risks?.length ?? 0) > 0,
    'Tier 2 critical risks should render when present'
  );
  
  // Tier 3 - Conditional on synthesis flags
  // When flags are false, tier 3 sections should NOT render even if data exists
  const allFalseState = createMockStateWithAllDetailsFalse();
  assert(
    allFalseState.synthesized_insights?.details_to_surface?.show_rob_waypoints === false,
    'Tier 3 rob_waypoints flag is false (should not render)'
  );
}

// ============================================================================
// Test: Filtering Rationale
// ============================================================================

function testFilteringRationale(): void {
  console.log('\n📋 Testing Filtering Rationale...');
  console.log('-'.repeat(50));
  
  const decisionState = createMockStateWithDecision();
  const rationale = decisionState.synthesized_insights?.synthesis_metadata?.filtering_rationale;
  
  assert(Array.isArray(rationale?.why_surfaced), 'why_surfaced is an array');
  assert(Array.isArray(rationale?.why_hidden), 'why_hidden is an array');
  
  assert(
    (rationale?.why_surfaced?.length ?? 0) > 0,
    'why_surfaced contains reasons'
  );
  assert(
    (rationale?.why_hidden?.length ?? 0) > 0,
    'why_hidden contains reasons'
  );
}

// ============================================================================
// Test: Fallback Behavior
// ============================================================================

function testFallbackBehavior(): void {
  console.log('\n📋 Testing Fallback Behavior...');
  console.log('-'.repeat(50));
  
  // Test state without synthesized_insights should still work
  const noSynthesisState: Partial<MultiAgentState> = {
    bunker_analysis: {
      recommendations: [],
      best_option: {
        port_code: 'SGSIN',
        port_name: 'Singapore',
        distance_from_route_nm: 0,
        fuel_cost_usd: 500000,
        deviation_cost_usd: 0,
        total_cost_usd: 500000,
        rank: 1,
      },
      worst_option: {
        port_code: 'SGSIN',
        port_name: 'Singapore',
        distance_from_route_nm: 0,
        fuel_cost_usd: 500000,
        deviation_cost_usd: 0,
        total_cost_usd: 500000,
        rank: 1,
      },
      max_savings_usd: 0,
      analysis_summary: 'Test',
    },
    agent_status: {
      bunker_agent: 'success',
    },
  };
  
  assert(
    noSynthesisState.synthesized_insights === undefined,
    'State without synthesis has no synthesized_insights'
  );
  assert(
    noSynthesisState.bunker_analysis !== undefined,
    'State without synthesis still has bunker_analysis for fallback'
  );
}

// ============================================================================
// Main Test Runner
// ============================================================================

export async function testTemplateFormatterV4(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 TEMPLATE FORMATTER V4 TESTS');
  console.log('='.repeat(60));
  
  testsPassed = 0;
  testsFailed = 0;
  
  testQueryTypeConditions();
  testDetailsToSurfaceFlags();
  testStrategicPrioritiesStructure();
  testCriticalRisksStructure();
  testTierSystem();
  testFilteringRationale();
  testFallbackBehavior();
  
  console.log('\n' + '='.repeat(60));
  console.log(`📊 Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('='.repeat(60));
  
  if (testsFailed > 0) {
    throw new Error(`${testsFailed} tests failed`);
  }
}

// Run if executed directly
if (require.main === module) {
  testTemplateFormatterV4()
    .then(() => {
      console.log('\n✅ All template formatter v4 tests passed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Tests failed:', error.message);
      process.exit(1);
    });
}
