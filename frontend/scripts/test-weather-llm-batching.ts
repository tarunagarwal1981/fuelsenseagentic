/**
 * Test LLM Batching Strategy
 * 
 * Tests sending only a SAMPLE of positions to the LLM (not all 142),
 * and instructing the LLM to call fetch_marine_weather in batches of 25.
 * 
 * This simulates what the weather agent should do to reduce LLM processing time.
 * 
 * Run with: npx tsx frontend/scripts/test-weather-llm-batching.ts
 */

// Load environment variables FIRST
import '../lib/multi-agent/__tests__/setup-env';

import { weatherAgentNode } from '../lib/multi-agent/agent-nodes';
import { HumanMessage } from '@langchain/core/messages';
import type { MultiAgentState } from '../lib/multi-agent/state';
import { executeWeatherTimelineTool } from '../lib/tools/weather-timeline';

/**
 * Create a test state with vessel timeline from cached route
 */
async function createTestState(): Promise<Partial<MultiAgentState>> {
  // Load cached route for Singapore to Rotterdam
  const cachedRoutesModule = await import('../lib/data/cached-routes.json');
  const cachedRoutes = cachedRoutesModule.default || cachedRoutesModule;
  const route = cachedRoutes.routes.find((r: any) => r.id === 'SGSIN-NLRTM');
  
  if (!route) {
    throw new Error('Cached route SGSIN-NLRTM not found');
  }
  
  console.log(`✅ Loaded cached route: ${route.origin_name} → ${route.destination_name}`);
  console.log(`   Waypoints: ${route.waypoints.length}`);
  
  // Calculate vessel timeline
  console.log('⏱️ Calculating vessel timeline...');
  const vesselTimeline = await executeWeatherTimelineTool({
    waypoints: route.waypoints,
    vessel_speed_knots: 14,
    departure_datetime: '2024-12-25T08:00:00Z',
    sampling_interval_hours: 12
  });
  
  console.log(`✅ Vessel timeline calculated: ${vesselTimeline.length} positions\n`);
  
  // Create minimal test state
  const testState: Partial<MultiAgentState> = {
    messages: [
      new HumanMessage('I need 650 MT VLSFO and 80 MT LSGO for Singapore to Rotterdam voyage. Where should I bunker?')
    ],
    route_data: {
      distance_nm: route.distance_nm,
      estimated_hours: route.estimated_hours,
      waypoints: route.waypoints,
      route_type: route.route_type,
      origin_port_code: route.origin_port_code,
      destination_port_code: route.destination_port_code,
    },
    vessel_timeline: vesselTimeline,
    weather_forecast: null,
    weather_consumption: null,
    port_weather_status: null,
    bunker_ports: null,
    port_prices: null,
    bunker_analysis: null,
    final_recommendation: null,
    formatted_response: null,
    agent_context: {
      weather_agent: {
        needs_consumption: true,
        needs_port_weather: false,
        required_tools: ['fetch_marine_weather', 'calculate_weather_consumption'],
        task_description: 'Fetch weather in batches of 25 positions and calculate consumption',
        priority: 'critical' as const,
      },
      finalize: {
        complexity: 'high' as const,
        needs_weather_analysis: true,
        needs_bunker_analysis: false,
      },
    },
    agent_status: {},
    agent_errors: {},
    weather_agent_partial: false,
    next_agent: '',
    selected_route_id: null,
  };
  
  return testState;
}

/**
 * Test weather agent with modified approach:
 * - Send only SAMPLE positions to LLM (not all 142)
 * - Instruct LLM to call fetch_marine_weather in batches of 25
 */
async function testLLMBatching() {
  console.log('🧪 Testing LLM Batching Strategy\n');
  console.log('='.repeat(80));
  console.log('Strategy: Send SAMPLE positions to LLM, instruct to batch tool calls');
  console.log('='.repeat(80));
  
  try {
    // Create test state
    const testState = await createTestState() as MultiAgentState;
    
    console.log('\n📊 Test State Created:');
    console.log(`   - Messages: ${testState.messages.length}`);
    console.log(`   - Route data: ${testState.route_data ? '✅' : '❌'}`);
    console.log(`   - Vessel timeline: ${testState.vessel_timeline?.length || 0} positions`);
    console.log(`   - Weather forecast: ${testState.weather_forecast ? '✅' : '❌'}`);
    console.log(`   - Weather consumption: ${testState.weather_consumption ? '✅' : '❌'}`);
    
    console.log('\n🚀 Starting weather agent test...');
    console.log('   Expected behavior:');
    console.log('   1. LLM receives SAMPLE of positions (not all 142)');
    console.log('   2. LLM processes quickly (smaller payload)');
    console.log('   3. LLM makes tool calls with batches of 25 positions');
    console.log('   4. Weather tool processes each batch');
    console.log('   5. Results are combined');
    console.log('   6. LLM calls calculate_weather_consumption\n');
    
    const startTime = Date.now();
    
    // Test the weather agent
    const result = await weatherAgentNode(testState);
    
    const duration = Date.now() - startTime;
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 Test Results:\n');
    console.log(`   Duration: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
    console.log(`   Success: ${result.agent_status?.weather_agent === 'success' ? '✅ YES' : '❌ NO'}`);
    
    if (result.weather_forecast) {
      console.log(`   Weather forecast: ✅ ${result.weather_forecast.length} points`);
    } else {
      console.log(`   Weather forecast: ❌ Not generated`);
    }
    
    if (result.weather_consumption) {
      console.log(`   Weather consumption: ✅ Calculated`);
      console.log(`      - Base consumption: ${result.weather_consumption.base_consumption_mt} MT`);
      console.log(`      - Weather adjusted: ${result.weather_consumption.weather_adjusted_consumption_mt} MT`);
      console.log(`      - Increase: ${result.weather_consumption.consumption_increase_percent}%`);
    } else {
      console.log(`   Weather consumption: ❌ Not calculated`);
    }
    
    if (result.agent_errors?.weather_agent) {
      console.log(`   Error: ❌ ${result.agent_errors.weather_agent.error}`);
    }
    
    if (result.messages && result.messages.length > 0) {
      const lastMessage = result.messages[result.messages.length - 1];
      console.log(`   Last message: ${lastMessage.constructor.name}`);
      if ((lastMessage as any).tool_calls) {
        const toolCalls = (lastMessage as any).tool_calls;
        console.log(`   Tool calls: ${toolCalls.length}`);
        toolCalls.forEach((tc: any, idx: number) => {
          console.log(`      ${idx + 1}. ${tc.name} (id: ${tc.id})`);
        });
      }
    }
    
    console.log('\n' + '='.repeat(80));
    
    if (duration < 30000) {
      console.log('✅ SUCCESS: LLM processing time reduced significantly!');
      console.log(`   Previous: ~85 seconds`);
      console.log(`   Current: ${(duration / 1000).toFixed(2)} seconds`);
      console.log(`   Improvement: ${((85 - duration / 1000) / 85 * 100).toFixed(1)}% faster`);
    } else if (duration < 60000) {
      console.log('⚠️ PARTIAL SUCCESS: LLM processing time improved but could be better');
      console.log(`   Duration: ${(duration / 1000).toFixed(2)} seconds`);
      console.log(`   Still under 60 second timeout`);
    } else {
      console.log('❌ ISSUE: LLM still taking too long');
      console.log(`   Duration: ${(duration / 1000).toFixed(2)} seconds`);
      console.log(`   May need further optimization`);
    }
    
    if (result.agent_status?.weather_agent === 'success') {
      console.log('\n✅ TEST PASSED: Weather agent completed successfully');
      process.exit(0);
    } else {
      console.log('\n❌ TEST FAILED: Weather agent did not complete successfully');
      process.exit(1);
    }
    
  } catch (error: any) {
    console.error('\n❌ Test Error:');
    console.error(`   ${error.message}`);
    if (error.stack) {
      console.error(`   ${error.stack.split('\n').slice(1, 3).join('\n')}`);
    }
    
    if (error.message.includes('timeout') || error.message.includes('timed out')) {
      console.error('\n💡 Timeout detected! The fix may need adjustment:');
      console.error('   1. Reduce sample size sent to LLM');
      console.error('   2. Simplify system prompt further');
      console.error('   3. Increase timeout value');
    }
    
    process.exit(1);
  }
}

// Run test
testLLMBatching().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

