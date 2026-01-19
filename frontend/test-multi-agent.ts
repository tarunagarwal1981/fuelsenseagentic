/**
 * Quick test for multi-agent system
 * Run with: npx tsx frontend/test-multi-agent.ts
 */

// Load environment variables FIRST
import './lib/multi-agent/__tests__/setup-env';

import { multiAgentApp } from './lib/multi-agent/graph';
import { HumanMessage } from '@langchain/core/messages';
import type { MultiAgentState } from './lib/multi-agent/state';

async function testMultiAgent() {
  console.log('🧪 Testing Multi-Agent System');
  console.log('='.repeat(60));
  
  const testQueries = [
    {
      name: 'Simple Route',
      query: 'Calculate route from Singapore (SGSIN) to Rotterdam (NLRTM)',
      expectedAgents: ['route_agent'],
    },
    {
      name: 'Full Bunker Planning',
      query: 'Find bunker options from Singapore to Rotterdam',
      expectedAgents: ['route_agent', 'weather_agent', 'bunker_agent'],
    },
  ];
  
  for (const test of testQueries) {
    console.log(`\n🧪 Test: ${test.name}`);
    console.log(`📝 Query: "${test.query}"`);
    console.log('-'.repeat(60));
    
    try {
      const startTime = Date.now();
      
      // Create initial state with HumanMessage
      const initialState: MultiAgentState = {
        messages: [new HumanMessage(test.query)],
        next_agent: '',
        route_data: null,
        vessel_timeline: null,
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
        agent_errors: {},
        agent_status: {},
        agent_context: null,
        selected_route_id: null,
        weather_agent_partial: false,
        compliance_data: null,
        vessel_consumption: null,
        rob_tracking: null,
        rob_waypoints: null,
        rob_safety_status: null,
        eca_consumption: null,
        eca_summary: null,
        vessel_name: null,
        vessel_profile: null,
        agent_call_counts: {
          route_agent: 0,
          weather_agent: 0,
          bunker_agent: 0,
        },
      };
      
      const result = await multiAgentApp.invoke(initialState, {
        recursionLimit: 60,
      });
      
      const duration = Date.now() - startTime;
      
      console.log(`✅ Test passed in ${duration}ms`);
      console.log(`📊 Final state:`, {
        has_route: !!result.route_data,
        has_weather: !!result.weather_forecast,
        has_bunker: !!result.bunker_analysis,
        has_recommendation: !!result.final_recommendation,
        message_count: result.messages.length,
      });
      
      if (result.final_recommendation) {
        console.log(`📋 Recommendation: ${result.final_recommendation.substring(0, 200)}...`);
      }
    } catch (error: any) {
      console.error(`❌ Test failed:`, error.message);
      if (error.message.includes('GraphRecursionError')) {
        console.error('⚠️ RECURSION ERROR - Bugs not fixed properly!');
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🎉 All tests complete!');
}

testMultiAgent().catch(console.error);

