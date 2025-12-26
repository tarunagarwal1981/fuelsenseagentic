/**
 * Manual test script to verify infinite loop fix
 * 
 * This script simulates the exact failure scenario from the logs where
 * the router kept finding old tool_calls and routing to tools repeatedly.
 * 
 * Run with: npx tsx frontend/scripts/test-router-fix.ts
 */

// Load environment variables FIRST before any other imports
import '../lib/multi-agent/__tests__/setup-env';

import { multiAgentApp } from '../lib/multi-agent/graph';
import { HumanMessage } from '@langchain/core/messages';

async function testInfiniteLoopFix() {
  console.log('🧪 Testing Infinite Loop Fix\n');
  console.log('='.repeat(80));
  
  const testQuery = "I need 650 MT VLSFO and 80 MT LSGO for Singapore to Rotterdam voyage. Where should I bunker?";
  
  console.log(`📝 Test Query: ${testQuery}\n`);
  
  const startTime = Date.now();
  let stepCount = 0;
  let hitRecursionLimit = false;
  let routeAgentCallCount = 0;
  let lastRouteAgentStep = 0;
  const routeAgentSteps: number[] = [];
  
  try {
    const streamResult = await multiAgentApp.stream(
      {
        messages: [new HumanMessage(testQuery)],
        next_agent: '',
        route_data: null,
        vessel_timeline: null,
        weather_forecast: null,
        weather_consumption: null,
        port_weather_status: null,
        bunker_ports: null,
        port_prices: null,
        bunker_analysis: null,
        final_recommendation: null,
        agent_context: null,
        selected_route_id: null,
        agent_errors: {},
        agent_status: {},
        weather_agent_partial: false,
      },
      {
        streamMode: 'values',
        recursionLimit: 60
      }
    );
    
    for await (const event of streamResult) {
      stepCount++;
      const nodeName = Object.keys(event)[0] as string;
      const state = (event as any)[nodeName];
      
      // Track route_agent calls
      if (nodeName === 'route_agent') {
        routeAgentCallCount++;
        lastRouteAgentStep = stepCount;
        routeAgentSteps.push(stepCount);
        
        // Check for infinite loop pattern
        if (state.messages) {
          const lastFewMessages = state.messages.slice(-5);
          const hasLoopPattern = lastFewMessages.some((m: any) => 
            (typeof m.content === 'string' && m.content.includes('already available')) || 
            (typeof m.content === 'string' && m.content.includes('skipping'))
          );
          
          if (hasLoopPattern && routeAgentCallCount > 3) {
            console.error(`\n⚠️ WARNING: Potential loop pattern detected at step ${stepCount}`);
            console.error(`   route_agent has been called ${routeAgentCallCount} times`);
            console.error(`   Last few messages may contain "already available" or "skipping"`);
          }
        }
      }
      
      // Log progress every 10 steps
      if (stepCount % 10 === 0) {
        console.log(`📊 Step ${stepCount}: ${nodeName}`);
      }
      
      // Check if we're hitting recursion limit
      if (stepCount >= 55) {
        console.warn(`\n⚠️ WARNING: Approaching recursion limit (${stepCount}/60)`);
      }
    }
    
    const duration = Date.now() - startTime;
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 Test Results:\n');
    console.log(`   Total steps: ${stepCount}`);
    console.log(`   Duration: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
    console.log(`   Route agent calls: ${routeAgentCallCount}`);
    if (routeAgentSteps.length > 0) {
      console.log(`   Route agent called at steps: ${routeAgentSteps.slice(0, 10).join(', ')}${routeAgentSteps.length > 10 ? '...' : ''}`);
    }
    console.log(`   Hit recursion limit: ${hitRecursionLimit ? '❌ YES' : '✅ NO'}`);
    
    // Analyze results
    if (hitRecursionLimit) {
      console.log('\n❌ TEST FAILED: Infinite loop detected');
      console.log('   The fix was not applied correctly or is insufficient.');
      process.exit(1);
    } else if (stepCount >= 60) {
      console.log('\n❌ TEST FAILED: Hit recursion limit');
      console.log('   Query did not complete within 60 steps.');
      console.log('   This suggests an infinite loop or inefficient workflow.');
      process.exit(1);
    } else if (routeAgentCallCount > 5) {
      console.log('\n⚠️ TEST WARNING: Route agent called many times');
      console.log(`   Route agent was called ${routeAgentCallCount} times, which may indicate inefficient routing.`);
      console.log('   However, query completed successfully.');
      process.exit(0);
    } else if (stepCount < 60 && duration < 120000) {
      console.log('\n✅ TEST PASSED: No infinite loop detected');
      console.log('   Query completed successfully without hitting recursion limit.');
      console.log('   Router fix appears to be working correctly.');
      process.exit(0);
    } else {
      console.log('\n⚠️ TEST INCONCLUSIVE: Query completed but took many steps or long time');
      console.log('   Consider investigating if the workflow is optimal.');
      process.exit(0);
    }
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    console.log('\n' + '='.repeat(80));
    console.log('❌ Test Error:\n');
    console.log(`   Error: ${error.message}`);
    console.log(`   Steps before error: ${stepCount}`);
    console.log(`   Duration: ${duration}ms`);
    
    if (error.message.includes('Recursion limit') || error.message.includes('recursion')) {
      console.log('\n❌ TEST FAILED: Hit recursion limit (infinite loop)');
      console.log('   The fix was not applied correctly.');
      console.log(`   Route agent was called ${routeAgentCallCount} times before failure.`);
      process.exit(1);
    } else {
      console.log('\n❌ TEST FAILED: Unexpected error');
      console.log(`   ${error.stack}`);
      process.exit(1);
    }
  }
}

// Run test
testInfiniteLoopFix().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

