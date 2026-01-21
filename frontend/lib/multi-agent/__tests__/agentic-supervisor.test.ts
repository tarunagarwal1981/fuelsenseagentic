/**
 * Agentic Supervisor Tests
 * 
 * Tests for the ReAct pattern implementation of the agentic supervisor.
 */

// Load environment variables FIRST before any other imports
import './setup-env';

import { HumanMessage } from '@langchain/core/messages';
import type { MultiAgentState } from '../state';

/**
 * Test the agentic supervisor with various query types
 */
export async function testAgenticSupervisor(): Promise<void> {
  console.log('\n🧪 [AGENTIC-SUPERVISOR-TEST] Starting agentic supervisor validation...\n');
  
  // Check if API keys are available
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    console.log('⚠️ [AGENTIC-SUPERVISOR-TEST] Skipping - API keys not available');
    console.log('   Set ANTHROPIC_API_KEY or OPENAI_API_KEY to run agentic supervisor tests');
    console.log('✅ [AGENTIC-SUPERVISOR-TEST] Test skipped (requires API keys)');
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
  console.log('\n' + '='.repeat(60));
  console.log('✅ [AGENTIC-SUPERVISOR-TEST] All tests passed!');
  console.log('='.repeat(60));
  
  console.log('\n📊 Test Summary:');
  console.log('   - Test 1: Port weather query → weather_agent ✅');
  console.log('   - Test 2: Max reasoning steps → finalize ✅');
  console.log('   - Test 3: Max recovery attempts → clarification ✅');
  console.log('   - Test 4: Bunker query → route_agent first ✅');
  console.log('   - Test 5: Route available → skip route_agent ✅');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testAgenticSupervisor().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}
