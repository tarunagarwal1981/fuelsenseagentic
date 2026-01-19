/**
 * Test Bunker Query
 * 
 * Test script to find bunker ports within 100nm of route from Shanghai to Hamburg
 */

import { multiAgentApp } from './graph';
import { MultiAgentStateAnnotation } from './state';
import { HumanMessage } from '@langchain/core/messages';

async function testBunkerQuery() {
  console.log('🧪 Testing Bunker Port Query');
  console.log('Query: Find bunker ports within 100 nautical miles of direct route from Shanghai to Hamburg\n');

  const query = 'Find bunker ports within 100 nautical miles of direct route from Shanghai to Hamburg. I can\'t deviate more than that.';

  const initialState = {
    messages: [new HumanMessage(query)],
    next_agent: '',
    agent_context: null,
    agent_call_counts: {
      route_agent: 0,
      weather_agent: 0,
      bunker_agent: 0,
    },
    selected_route_id: null,
    route_data: null,
    vessel_timeline: null,
    weather_forecast: null,
    weather_consumption: null,
    port_weather_status: null,
    weather_agent_partial: false,
    bunker_ports: null,
    port_prices: null,
    bunker_analysis: null,
        multi_bunker_plan: null,
    compliance_data: null,
    vessel_consumption: null,
    rob_tracking: null,
    rob_waypoints: null,
    rob_safety_status: null,
    eca_consumption: null,
    eca_summary: null,
    vessel_name: null,
    vessel_profile: null,
    final_recommendation: null,
    formatted_response: null,
    synthesized_insights: null,
    agent_errors: {},
    agent_status: {},
  };

  try {
    console.log('🚀 Starting multi-agent execution...\n');
    
    const result = await multiAgentApp.invoke(initialState, {
      recursionLimit: 50,
    });

    console.log('\n✅ Execution completed!\n');
    console.log('📊 Results:');
    
    if (result.bunker_ports && Array.isArray(result.bunker_ports)) {
      console.log(`\n⚓ Found ${result.bunker_ports.length} bunker ports:`);
      
      if (result.bunker_ports.length > 0) {
        result.bunker_ports.slice(0, 10).forEach((portWithDist: any, index: number) => {
          const p = portWithDist.port ?? portWithDist;
          console.log(`\n${index + 1}. ${p?.name || 'Unknown'} (${p?.port_code || 'N/A'})`);
          console.log(`   Distance: ${portWithDist.distance_from_route_nm?.toFixed(1)} nm`);
          console.log(`   Country: ${p?.country || 'N/A'}`);
          console.log(`   Fuel types: ${p?.fuel_capabilities?.join(', ') || 'N/A'}`);
        });
        
        if (result.bunker_ports.length > 10) {
          console.log(`\n... and ${result.bunker_ports.length - 10} more ports`);
        }
      }
    }

    if (result.bunker_analysis) {
      console.log('\n💰 Bunker Analysis:');
      console.log(`   Best option: ${result.bunker_analysis.best_option?.port_name || 'N/A'}`);
      console.log(`   Total cost: $${result.bunker_analysis.best_option?.total_cost_usd?.toFixed(2) || 'N/A'}`);
      console.log(`   Max savings: $${result.bunker_analysis.max_savings_usd?.toFixed(2) || 'N/A'}`);
    }

    if (result.final_recommendation) {
      console.log('\n📝 Final Recommendation:');
      console.log(result.final_recommendation);
    }

    console.log('\n✅ Test completed successfully!');
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

// Run the test
testBunkerQuery().catch(console.error);


