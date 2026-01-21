/**
 * Router Fix Validation Tests
 * 
 * Validates that the agentToolRouter infinite loop fix works correctly.
 * 
 * Run with: npx tsx frontend/lib/multi-agent/__tests__/router-fix-validation.test.ts
 */

// Load environment variables FIRST before any other imports
import './setup-env';

import { agentToolRouter } from '../graph';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { MultiAgentState } from '../state';

/**
 * Helper to create a minimal MultiAgentState for testing
 */
function createTestState(messages: any[]): MultiAgentState {
  return {
    messages,
    next_agent: '',
    agent_context: null,
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
    final_recommendation: null,
    formatted_response: null,
    synthesized_insights: null,
    agent_errors: {},
    agent_status: {},
  } as MultiAgentState;
}

/**
 * Test runner
 */
function runTests(): void {
  console.log('\n🧪 [ROUTER-FIX-TEST] Starting router fix validation tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Should route to tools when last message has unexecuted tool_calls
  console.log('📋 Test 1: Router with unexecuted tool_calls → should route to "tools"');
  try {
    const state = createTestState([
      new HumanMessage('Test query'),
      new AIMessage({
        content: '',
        tool_calls: [{ id: 'call_123', name: 'calculate_route', args: {} }]
      })
    ]);
    
    const result = agentToolRouter(state);
    if (result === 'tools') {
      console.log('✅ Test 1 PASSED');
      passed++;
    } else {
      console.error(`❌ Test 1 FAILED: Expected "tools", got "${result}"`);
      failed++;
    }
  } catch (error: any) {
    console.error(`❌ Test 1 FAILED with error: ${error.message}`);
    failed++;
  }
  
  // Test 2: Should route to supervisor when tool_calls are already executed
  console.log('\n📋 Test 2: Router with executed tool_calls → should route to "supervisor"');
  try {
    const state = createTestState([
      new HumanMessage('Test query'),
      new AIMessage({
        content: '',
        tool_calls: [{ id: 'call_123', name: 'calculate_route', args: {} }]
      }),
      new ToolMessage({
        content: JSON.stringify({ result: 'success' }),
        tool_call_id: 'call_123'
      }),
      new AIMessage({ content: 'Route calculated' })
    ]);
    
    const result = agentToolRouter(state);
    if (result === 'supervisor') {
      console.log('✅ Test 2 PASSED');
      passed++;
    } else {
      console.error(`❌ Test 2 FAILED: Expected "supervisor", got "${result}"`);
      failed++;
    }
  } catch (error: any) {
    console.error(`❌ Test 2 FAILED with error: ${error.message}`);
    failed++;
  }
  
  // Test 3: Should NOT route to tools based on old tool_calls in history (bug fix)
  console.log('\n📋 Test 3: Router with old executed tool_calls in history → should route to "supervisor" (NOT "tools")');
  try {
    const state = createTestState([
      new HumanMessage('Test query'),
      new AIMessage({
        content: '',
        tool_calls: [{ id: 'call_123', name: 'calculate_route', args: {} }]
      }),
      new ToolMessage({
        content: JSON.stringify({ result: 'success' }),
        tool_call_id: 'call_123'
      }),
      new AIMessage({
        content: '',
        tool_calls: [{ id: 'call_456', name: 'calculate_timeline', args: {} }]
      }),
      new ToolMessage({
        content: JSON.stringify({ result: 'success' }),
        tool_call_id: 'call_456'
      }),
      new AIMessage({ content: 'Complete' }) // Last message - no tool_calls
    ]);
    
    const result = agentToolRouter(state);
    
    // CRITICAL: Should route to supervisor, NOT to tools
    // Old bug would find message at index 3 with tool_calls and route to tools
    if (result === 'supervisor') {
      console.log('✅ Test 3 PASSED - Bug fix validated!');
      passed++;
    } else {
      console.error(`❌ Test 3 FAILED: Expected "supervisor", got "${result}"`);
      console.error('   This indicates the infinite loop bug is still present!');
      failed++;
    }
  } catch (error: any) {
    console.error(`❌ Test 3 FAILED with error: ${error.message}`);
    failed++;
  }
  
  // Test 4: Should route to supervisor when last message has no tool_calls
  console.log('\n📋 Test 4: Router with no tool_calls → should route to "supervisor"');
  try {
    const state = createTestState([
      new HumanMessage('Test query'),
      new AIMessage({ content: 'Done' })
    ]);
    
    const result = agentToolRouter(state);
    if (result === 'supervisor') {
      console.log('✅ Test 4 PASSED');
      passed++;
    } else {
      console.error(`❌ Test 4 FAILED: Expected "supervisor", got "${result}"`);
      failed++;
    }
  } catch (error: any) {
    console.error(`❌ Test 4 FAILED with error: ${error.message}`);
    failed++;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`📊 Test Summary: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));
  
  if (failed === 0) {
    console.log('✅ All tests passed! Router fix is working correctly.\n');
    process.exit(0);
  } else {
    console.error(`❌ ${failed} test(s) failed. Please review the errors above.\n`);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

export { runTests };

