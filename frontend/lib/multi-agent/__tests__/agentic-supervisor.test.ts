/**
 * Agentic Supervisor Tests
 * 
 * Tests for the 3-tier decision framework:
 * - Tier 1: Pattern Matcher (fast regex matching)
 * - Tier 2: Decision Framework (confidence thresholds)
 * - Tier 3: LLM Reasoning (complex queries)
 */

// Load environment variables FIRST before any other imports
import './setup-env';

import { HumanMessage } from '@langchain/core/messages';
import type { MultiAgentState } from '../state';
import { matchQueryPattern, validateExtractedData, formatClarificationQuestion, type PatternMatch } from '../pattern-matcher';
import { makeRoutingDecision, CONFIDENCE_THRESHOLDS, type DecisionResult } from '../decision-framework';

// ============================================================================
// Pattern Matcher Tests (No API keys required)
// ============================================================================

/**
 * Test the pattern matcher with various query types
 */
export async function testPatternMatcher(): Promise<void> {
  console.log('\n🧪 [PATTERN-MATCHER-TEST] Testing Tier 1: Pattern Matcher\n');
  
  const testCases: Array<{
    query: string;
    expectedType: PatternMatch['type'];
    expectedAgent?: PatternMatch['agent'];
    minConfidence: number;
    maxConfidence: number;
    description: string;
  }> = [
    // Port Weather - High Confidence
    {
      query: 'what is the weather condition at Singapore on 22nd jan 2026',
      expectedType: 'port_weather',
      expectedAgent: 'weather_agent',
      minConfidence: 90,
      maxConfidence: 100,
      description: 'Port weather with clear port name and date',
    },
    {
      query: 'weather at Singapore port',
      expectedType: 'port_weather',
      expectedAgent: 'weather_agent',
      minConfidence: 90,
      maxConfidence: 100,
      description: 'Simple port weather query',
    },
    {
      query: 'How is the weather at Rotterdam tomorrow',
      expectedType: 'port_weather',
      expectedAgent: 'weather_agent',
      minConfidence: 85,
      maxConfidence: 100,
      description: 'Conversational weather query',
    },
    // Port Weather - Ambiguous (generic word "port" is not a valid port name)
    {
      query: 'weather at port',
      expectedType: 'ambiguous',  // "port" alone is not a valid port name, so no pattern match
      expectedAgent: undefined,
      minConfidence: 0,
      maxConfidence: 10,
      description: 'Generic port word - no valid pattern match',
    },
    // Route Queries - High Confidence
    {
      query: 'route from Singapore to Rotterdam',
      expectedType: 'route_calculation',
      expectedAgent: 'route_agent',
      minConfidence: 85,
      maxConfidence: 100,
      description: 'Clear route query with origin and destination',
    },
    {
      query: 'distance from Tokyo to Shanghai',
      expectedType: 'route_calculation',
      expectedAgent: 'route_agent',
      minConfidence: 85,
      maxConfidence: 100,
      description: 'Distance query is a route query',
    },
    // Bunker Queries
    {
      query: 'cheapest bunker from Singapore to Rotterdam',
      expectedType: 'bunker_planning',
      expectedAgent: 'route_agent',
      minConfidence: 80,
      maxConfidence: 100,
      description: 'Bunker with route - starts with route_agent',
    },
    {
      query: 'cheapest bunker',
      expectedType: 'bunker_planning',
      expectedAgent: undefined,
      minConfidence: 30,
      maxConfidence: 50,
      description: 'Bunker without route - medium confidence',
    },
    // Ambiguous Queries
    {
      query: 'hello there',
      expectedType: 'ambiguous',
      expectedAgent: undefined,
      minConfidence: 0,
      maxConfidence: 10,
      description: 'Unrelated query - no pattern match',
    },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    console.log(`📋 Test: ${testCase.description}`);
    console.log(`   Query: "${testCase.query}"`);
    
    const result = await matchQueryPattern(testCase.query);
    
    const typeMatch = result.type === testCase.expectedType;
    const agentMatch = result.agent === testCase.expectedAgent;
    const confidenceMatch = result.confidence >= testCase.minConfidence && result.confidence <= testCase.maxConfidence;
    
    console.log(`   Type: ${result.type} (expected: ${testCase.expectedType}) ${typeMatch ? '✅' : '❌'}`);
    console.log(`   Agent: ${result.agent || 'none'} (expected: ${testCase.expectedAgent || 'none'}) ${agentMatch ? '✅' : '❌'}`);
    console.log(`   Confidence: ${result.confidence}% (expected: ${testCase.minConfidence}-${testCase.maxConfidence}%) ${confidenceMatch ? '✅' : '❌'}`);
    
    if (typeMatch && agentMatch && confidenceMatch) {
      console.log(`   ✅ PASSED\n`);
      passed++;
    } else {
      console.log(`   ❌ FAILED\n`);
      failed++;
    }
  }
  
  console.log('='.repeat(60));
  console.log(`📊 Pattern Matcher Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    throw new Error(`Pattern matcher tests failed: ${failed} failures`);
  }
  
  console.log('✅ [PATTERN-MATCHER-TEST] All pattern matcher tests passed!\n');
}

// ============================================================================
// Decision Framework Tests (No API keys required)
// ============================================================================

/**
 * Test the decision framework with pattern matches
 */
export async function testDecisionFramework(): Promise<void> {
  console.log('\n🧪 [DECISION-FRAMEWORK-TEST] Testing Tier 2: Decision Framework\n');
  
  // Mock empty state for testing
  const emptyState: Partial<MultiAgentState> = {
    messages: [],
    reasoning_history: [],
    recovery_attempts: 0,
    agent_status: {},
    agent_errors: {},
    route_data: null,
    standalone_port_weather: null,
    bunker_analysis: null,
  };
  
  const testCases: Array<{
    patternMatch: PatternMatch;
    state: Partial<MultiAgentState>;
    expectedDecision: DecisionResult['decision'];
    expectedAgent?: string;
    description: string;
  }> = [
    // High Confidence - Immediate Action
    {
      patternMatch: {
        matched: true,
        type: 'port_weather',
        agent: 'weather_agent',
        confidence: 95,
        extracted_data: { port: 'Singapore', date: '22nd jan 2026' },
        reason: 'Clear port weather pattern',
      },
      state: emptyState,
      expectedDecision: 'immediate_action',
      expectedAgent: 'weather_agent',
      description: 'High confidence port weather → immediate action',
    },
    // Low Confidence - Request Clarification
    {
      patternMatch: {
        matched: true,
        type: 'port_weather',
        agent: 'weather_agent',
        confidence: 20,
        extracted_data: { port: undefined },
        reason: 'Generic word "port" - low confidence',
      },
      state: emptyState,
      expectedDecision: 'request_clarification',
      expectedAgent: undefined,
      description: 'Low confidence → request clarification',
    },
    // Medium Confidence - LLM Reasoning
    {
      patternMatch: {
        matched: true,
        type: 'bunker_planning',
        agent: undefined,
        confidence: 50,
        extracted_data: {},
        reason: 'Bunker without route info',
      },
      state: emptyState,
      expectedDecision: 'llm_reasoning',
      expectedAgent: undefined,
      description: 'Medium confidence → LLM reasoning',
    },
    // Agent Already Succeeded - Finalize
    {
      patternMatch: {
        matched: true,
        type: 'port_weather',
        agent: 'weather_agent',
        confidence: 95,
        extracted_data: { port: 'Singapore' },
        reason: 'Port weather pattern',
      },
      state: {
        ...emptyState,
        standalone_port_weather: {
          port_code: 'SGSIN',
          port_name: 'Singapore',
          coordinates: { lat: 1.29, lon: 103.85 },
          target_date: '2026-01-22',
          forecast: { wave_height: 1.5 },
        },
      },
      expectedDecision: 'finalize',
      expectedAgent: 'finalize',
      description: 'Work complete → finalize',
    },
    // No Pattern Match - LLM Reasoning
    {
      patternMatch: {
        matched: false,
        type: 'ambiguous',
        confidence: 0,
        reason: 'No pattern matched',
      },
      state: emptyState,
      expectedDecision: 'llm_reasoning',
      expectedAgent: undefined,
      description: 'No pattern → LLM reasoning',
    },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    console.log(`📋 Test: ${testCase.description}`);
    console.log(`   Pattern: ${testCase.patternMatch.type}, ${testCase.patternMatch.confidence}%`);
    
    const result = makeRoutingDecision(testCase.patternMatch, testCase.state as MultiAgentState);
    
    const decisionMatch = result.decision === testCase.expectedDecision;
    const agentMatch = result.agent === testCase.expectedAgent;
    
    console.log(`   Decision: ${result.decision} (expected: ${testCase.expectedDecision}) ${decisionMatch ? '✅' : '❌'}`);
    console.log(`   Agent: ${result.agent || 'none'} (expected: ${testCase.expectedAgent || 'none'}) ${agentMatch ? '✅' : '❌'}`);
    
    if (decisionMatch && agentMatch) {
      console.log(`   ✅ PASSED\n`);
      passed++;
    } else {
      console.log(`   ❌ FAILED\n`);
      failed++;
    }
  }
  
  console.log('='.repeat(60));
  console.log(`📊 Decision Framework Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    throw new Error(`Decision framework tests failed: ${failed} failures`);
  }
  
  console.log('✅ [DECISION-FRAMEWORK-TEST] All decision framework tests passed!\n');
}

// ============================================================================
// Clarification Question Tests (No API keys required)
// ============================================================================

/**
 * Test clarification question generation
 */
export async function testClarificationQuestions(): Promise<void> {
  console.log('\n🧪 [CLARIFICATION-TEST] Testing clarification question generation\n');
  
  const testCases = [
    {
      match: { type: 'port_weather' as const, matched: true, confidence: 20 },
      missing: ['port'],
      expectedContains: 'port',
      description: 'Port weather missing port',
    },
    {
      match: { type: 'route_calculation' as const, matched: true, confidence: 30 },
      missing: ['origin port', 'destination port'],
      expectedContains: 'origin',
      description: 'Route missing both ports',
    },
    {
      match: { type: 'bunker_planning' as const, matched: true, confidence: 40 },
      missing: ['route information'],
      expectedContains: 'voyage',
      description: 'Bunker missing route',
    },
  ];
  
  let passed = 0;
  
  for (const testCase of testCases) {
    console.log(`📋 Test: ${testCase.description}`);
    
    const question = formatClarificationQuestion(testCase.match as PatternMatch, testCase.missing);
    const containsExpected = question.toLowerCase().includes(testCase.expectedContains);
    
    console.log(`   Question: "${question}"`);
    console.log(`   Contains "${testCase.expectedContains}": ${containsExpected ? '✅' : '❌'}\n`);
    
    if (containsExpected) passed++;
  }
  
  console.log(`📊 Clarification Tests: ${passed}/${testCases.length} passed`);
  console.log('✅ [CLARIFICATION-TEST] Tests complete\n');
}

// ============================================================================
// Full Integration Tests (Requires API keys)
// ============================================================================

/**
 * Test the agentic supervisor with various query types
 */
export async function testAgenticSupervisor(): Promise<void> {
  console.log('\n' + '═'.repeat(70));
  console.log('🧪 [AGENTIC-SUPERVISOR-TEST] Starting 3-Tier Decision Framework Tests');
  console.log('═'.repeat(70) + '\n');
  
  // ============================================================================
  // Tier 1 & 2 Tests (No API keys required)
  // ============================================================================
  
  console.log('📋 Running Tier 1 & 2 Tests (No API keys required)...\n');
  
  // Test pattern matcher
  await testPatternMatcher();
  
  // Test decision framework
  await testDecisionFramework();
  
  // Test clarification questions
  await testClarificationQuestions();
  
  // ============================================================================
  // Tier 3 Tests (Requires API keys)
  // ============================================================================
  
  console.log('\n📋 Running Tier 3 Tests (Requires API keys)...\n');
  
  // Check if API keys are available
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    console.log('⚠️ [AGENTIC-SUPERVISOR-TEST] Skipping Tier 3 - API keys not available');
    console.log('   Set ANTHROPIC_API_KEY or OPENAI_API_KEY to run full integration tests');
    console.log('✅ [AGENTIC-SUPERVISOR-TEST] Tier 1 & 2 tests completed successfully');
    return;
  }
  
  // Import the agentic supervisor
  const { reasoningSupervisor, MAX_REASONING_STEPS, MAX_RECOVERY_ATTEMPTS } = await import('../agentic-supervisor');
  
  console.log(`✅ Agentic supervisor loaded`);
  console.log(`   - Max reasoning steps: ${MAX_REASONING_STEPS}`);
  console.log(`   - Max recovery attempts: ${MAX_RECOVERY_ATTEMPTS}`);
  
  // ============================================================================
  // Test 1: Port Weather Query (should route directly to weather_agent)
  // ============================================================================
  console.log('\n📋 Test 1: Port Weather Query');
  console.log('-'.repeat(60));
  
  try {
    const portWeatherState: Partial<MultiAgentState> = {
      messages: [new HumanMessage('What is the weather at Singapore port on January 22?')],
      reasoning_history: [],
      recovery_attempts: 0,
      agent_status: {},
      agent_errors: {},
      route_data: null,
      vessel_timeline: null,
      weather_forecast: null,
      weather_consumption: null,
      bunker_ports: null,
      bunker_analysis: null,
    };
    
    const result = await reasoningSupervisor(portWeatherState as MultiAgentState);
    
    console.log(`   Thought: ${result.current_thought?.substring(0, 100)}...`);
    console.log(`   Next agent: ${result.next_agent}`);
    console.log(`   Reasoning steps: ${result.reasoning_history?.length || 0}`);
    
    // Validate: Should route to weather_agent OR finalize (both acceptable)
    if (result.next_agent !== 'weather_agent' && result.next_agent !== 'finalize') {
      console.error(`❌ Test 1 FAILED: Expected weather_agent or finalize, got ${result.next_agent}`);
      return;
    }
    
    // Validate: Should have reasoning history
    if (!result.reasoning_history || result.reasoning_history.length === 0) {
      console.error(`❌ Test 1 FAILED: No reasoning history generated`);
      return;
    }
    
    console.log(`✅ Test 1 PASSED: Port weather query handled correctly`);
    
  } catch (error) {
    console.error(`❌ Test 1 FAILED:`, error);
    throw error;
  }
  
  // ============================================================================
  // Test 2: Max Reasoning Steps (should force finalize)
  // ============================================================================
  console.log('\n📋 Test 2: Max Reasoning Steps Limit');
  console.log('-'.repeat(60));
  
  try {
    // Create state with max reasoning steps already reached
    const maxStepsState: Partial<MultiAgentState> = {
      messages: [new HumanMessage('Test query')],
      reasoning_history: Array(MAX_REASONING_STEPS).fill({
        step_number: 1,
        thought: 'test thought',
        action: 'call_agent' as const,
        action_params: { agent: 'route_agent' },
        timestamp: new Date(),
      }),
      recovery_attempts: 0,
      agent_status: {},
      agent_errors: {},
      route_data: null,
    };
    
    const result = await reasoningSupervisor(maxStepsState as MultiAgentState);
    
    console.log(`   Next agent: ${result.next_agent}`);
    console.log(`   Needs clarification: ${result.needs_clarification}`);
    
    // Validate: Should route to finalize
    if (result.next_agent !== 'finalize') {
      console.error(`❌ Test 2 FAILED: Expected finalize when max steps reached, got ${result.next_agent}`);
      return;
    }
    
    console.log(`✅ Test 2 PASSED: Max reasoning steps forces finalize`);
    
  } catch (error) {
    console.error(`❌ Test 2 FAILED:`, error);
    throw error;
  }
  
  // ============================================================================
  // Test 3: Max Recovery Attempts (should trigger clarification)
  // ============================================================================
  console.log('\n📋 Test 3: Max Recovery Attempts Limit');
  console.log('-'.repeat(60));
  
  try {
    // Create state with max recovery attempts reached
    const maxRecoveryState: Partial<MultiAgentState> = {
      messages: [new HumanMessage('Test query')],
      reasoning_history: [],
      recovery_attempts: MAX_RECOVERY_ATTEMPTS,
      agent_status: {},
      agent_errors: {},
      route_data: null,
    };
    
    const result = await reasoningSupervisor(maxRecoveryState as MultiAgentState);
    
    console.log(`   Next agent: ${result.next_agent}`);
    console.log(`   Needs clarification: ${result.needs_clarification}`);
    console.log(`   Clarification question: ${result.clarification_question?.substring(0, 50)}...`);
    
    // Validate: Should route to finalize with clarification
    if (result.next_agent !== 'finalize') {
      console.error(`❌ Test 3 FAILED: Expected finalize when max recovery reached, got ${result.next_agent}`);
      return;
    }
    
    if (result.needs_clarification !== true) {
      console.error(`❌ Test 3 FAILED: Expected needs_clarification=true`);
      return;
    }
    
    console.log(`✅ Test 3 PASSED: Max recovery attempts triggers clarification`);
    
  } catch (error) {
    console.error(`❌ Test 3 FAILED:`, error);
    throw error;
  }
  
  // ============================================================================
  // Test 4: Bunker Planning Query (should start with route_agent)
  // ============================================================================
  console.log('\n📋 Test 4: Bunker Planning Query');
  console.log('-'.repeat(60));
  
  try {
    const bunkerState: Partial<MultiAgentState> = {
      messages: [new HumanMessage('Find cheapest bunker from Singapore to Rotterdam')],
      reasoning_history: [],
      recovery_attempts: 0,
      agent_status: {},
      agent_errors: {},
      route_data: null,
      vessel_timeline: null,
      weather_forecast: null,
      weather_consumption: null,
      bunker_ports: null,
      bunker_analysis: null,
    };
    
    const result = await reasoningSupervisor(bunkerState as MultiAgentState);
    
    console.log(`   Thought: ${result.current_thought?.substring(0, 100)}...`);
    console.log(`   Next agent: ${result.next_agent}`);
    
    // Validate: Should route to route_agent first (need route before bunker)
    if (result.next_agent !== 'route_agent') {
      console.error(`❌ Test 4 FAILED: Expected route_agent for bunker query, got ${result.next_agent}`);
      return;
    }
    
    console.log(`✅ Test 4 PASSED: Bunker query correctly routes to route_agent first`);
    
  } catch (error) {
    console.error(`❌ Test 4 FAILED:`, error);
    throw error;
  }
  
  // ============================================================================
  // Test 5: Route Already Available (should skip to next agent)
  // ============================================================================
  console.log('\n📋 Test 5: Route Already Available');
  console.log('-'.repeat(60));
  
  try {
    const routeAvailableState: Partial<MultiAgentState> = {
      messages: [new HumanMessage('Find cheapest bunker from Singapore to Rotterdam')],
      reasoning_history: [],
      recovery_attempts: 0,
      agent_status: { route_agent: 'success' },
      agent_errors: {},
      route_data: {
        origin_port_code: 'SGSIN',
        destination_port_code: 'NLRTM',
        distance_nm: 8500,
        estimated_hours: 720,
        waypoints: [],
        route_type: 'direct',
      },
      vessel_timeline: [
        { lat: 1.29, lon: 103.85, datetime: '2024-01-22T00:00:00Z', distance_from_start_nm: 0, segment_index: 0 }
      ],
      weather_forecast: null,
      weather_consumption: null,
      bunker_ports: null,
      bunker_analysis: null,
    };
    
    const result = await reasoningSupervisor(routeAvailableState as MultiAgentState);
    
    console.log(`   Thought: ${result.current_thought?.substring(0, 100)}...`);
    console.log(`   Next agent: ${result.next_agent}`);
    
    // Validate: Should skip route_agent and go to weather or bunker
    if (result.next_agent === 'route_agent') {
      console.error(`❌ Test 5 FAILED: Should skip route_agent when route already available`);
      return;
    }
    
    console.log(`✅ Test 5 PASSED: Correctly skips route_agent when route available`);
    
  } catch (error) {
    console.error(`❌ Test 5 FAILED:`, error);
    throw error;
  }
  
  // ============================================================================
  // Summary
  // ============================================================================
  console.log('\n' + '═'.repeat(70));
  console.log('✅ [AGENTIC-SUPERVISOR-TEST] All 3-Tier Framework Tests Passed!');
  console.log('═'.repeat(70));
  
  console.log('\n📊 Complete Test Summary:');
  console.log('\n   Tier 1 - Pattern Matcher:');
  console.log('   ✅ Port weather patterns (high confidence)');
  console.log('   ✅ Route calculation patterns');
  console.log('   ✅ Bunker planning patterns');
  console.log('   ✅ Low confidence detection');
  
  console.log('\n   Tier 2 - Decision Framework:');
  console.log('   ✅ High confidence → immediate action');
  console.log('   ✅ Medium confidence → LLM reasoning');
  console.log('   ✅ Low confidence → request clarification');
  console.log('   ✅ Work complete → finalize');
  
  console.log('\n   Tier 3 - Integration:');
  console.log('   ✅ Port weather query → weather_agent');
  console.log('   ✅ Max reasoning steps → finalize');
  console.log('   ✅ Max recovery attempts → clarification');
  console.log('   ✅ Bunker query → route_agent first');
  console.log('   ✅ Route available → skip route_agent');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testAgenticSupervisor().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}
