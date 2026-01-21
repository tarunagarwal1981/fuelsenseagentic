/**
 * Standalone Weather Agent Test Script
 * 
 * Tests the weather agent in isolation without affecting the main codebase.
 * Allows testing different timeout values and configurations.
 * 
 * Run with: npx tsx frontend/scripts/test-weather-agent.ts
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
  
  // Calculate vessel timeline from route waypoints
  console.log('⏱️ Calculating vessel timeline...');
  const vesselTimeline = await executeWeatherTimelineTool({
    waypoints: route.waypoints,
    vessel_speed_knots: 14,
    departure_datetime: '2024-12-25T08:00:00Z',
    sampling_interval_hours: 12
  });
  
  console.log(`✅ Vessel timeline calculated: ${vesselTimeline.length} positions`);
  
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
        multi_bunker_plan: null,
    final_recommendation: null,
    formatted_response: null,
    synthesized_insights: null,
    agent_context: {
      weather_agent: {
        needs_consumption: true,
        needs_port_weather: false,
        required_tools: ['fetch_marine_weather', 'calculate_weather_consumption'],
        task_description: 'Fetch weather and calculate consumption',
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
    standalone_port_weather: null,
    next_agent: '',
    selected_route_id: null,
  };
  
  return testState;
}

/**
 * Test weather agent with different timeout configurations
 */
async function testWeatherAgent() {
  console.log('🧪 Testing Weather Agent in Isolation\n');
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
    console.log('   This will test the LLM invocation with actual tools.');
    console.log('   Timeout is set to 90 seconds (TIMEOUTS.WEATHER_AGENT)\n');
    
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
        console.log(`   Tool calls: ${(lastMessage as any).tool_calls.map((tc: any) => tc.name).join(', ')}`);
      }
    }
    
    console.log('\n' + '='.repeat(80));
    
    if (duration > 60000) {
      console.log('⚠️ WARNING: Test took longer than 60 seconds');
      console.log('   This suggests the LLM call is timing out.');
      console.log('   Consider:');
      console.log('   1. Reducing vessel timeline positions (sampling)');
      console.log('   2. Increasing timeout value');
      console.log('   3. Simplifying the system prompt');
    } else if (result.agent_status?.weather_agent === 'success') {
      console.log('✅ TEST PASSED: Weather agent completed successfully');
      process.exit(0);
    } else {
      console.log('❌ TEST FAILED: Weather agent did not complete successfully');
      process.exit(1);
    }
    
  } catch (error: any) {
    console.error('\n❌ Test Error:');
    console.error(`   ${error.message}`);
    if (error.stack) {
      console.error(`   ${error.stack.split('\n').slice(1, 3).join('\n')}`);
    }
    
    if (error.message.includes('timeout') || error.message.includes('timed out')) {
      console.error('\n💡 Timeout detected! Possible fixes:');
      console.error('   1. Increase TIMEOUTS.WEATHER_AGENT in optimizations.ts');
      console.error('   2. Reduce vessel timeline positions (use sampling)');
      console.error('   3. Simplify system prompt to reduce LLM processing time');
    }
    
    process.exit(1);
  }
}

// Run test
testWeatherAgent().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

