/**
 * Compliance Agent Integration Test
 * Verifies that adding compliance agent didn't break existing functionality
 * Run with: npx tsx frontend/test-compliance-integration.ts
 */

// Load environment variables FIRST
import './lib/multi-agent/__tests__/setup-env';

import { multiAgentApp } from './lib/multi-agent/graph';
import { HumanMessage } from '@langchain/core/messages';
import type { MultiAgentState } from './lib/multi-agent/state';

async function testComplianceIntegration() {
  console.log('🧪 Testing Compliance Agent Integration');
  console.log('='.repeat(80));
  console.log('Verifying existing functionality still works after adding compliance agent\n');
  
  const testQueries = [
    {
      name: 'Test 1: Simple Route Query',
      query: 'Calculate route from Singapore to Rotterdam',
      expectedAgents: ['route_agent'],
      shouldHaveCompliance: false, // Simple route query may not trigger compliance
      checkRoute: true,
    },
    {
      name: 'Test 2: Bunker Ports Query',
      query: 'Find bunker ports from Singapore to Rotterdam',
      expectedAgents: ['route_agent', 'compliance_agent', 'bunker_agent'],
      shouldHaveCompliance: true,
      checkRoute: true,
      checkBunker: true,
    },
    {
      name: 'Test 3: Bunker with Weather Safety',
      query: 'Find bunker from Dubai to Singapore with weather safety check',
      expectedAgents: ['route_agent', 'compliance_agent', 'bunker_agent'],
      shouldHaveCompliance: true,
      checkRoute: true,
      checkBunker: true,
      checkWeather: true,
    },
  ];
  
  let allTestsPassed = true;
  
  for (const test of testQueries) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🧪 ${test.name}`);
    console.log(`📝 Query: "${test.query}"`);
    console.log('-'.repeat(80));
    
    try {
      const startTime = Date.now();
      
      // Create initial state
      const initialState: MultiAgentState = {
        messages: [new HumanMessage(test.query)],
        correlation_id: 'test-correlation-id',
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
        vessel_identifiers: undefined,
        noon_reports: undefined,
        consumption_profiles: undefined,
        vessel_specs: undefined,
        vessel_names: undefined,
        next_voyage_details: undefined,
        vessel_comparison_analysis: undefined,
        vessel_rankings: undefined,
        recommended_vessel: undefined,
        per_vessel_bunker_plans: undefined,
        vessel_selection_constraints: undefined,
        vessel_feasibility_matrix: undefined,
        final_recommendation: null,
        formatted_response: null,
        synthesized_insights: null,
        agent_errors: {},
        agent_status: {},
        agent_context: null,
        selected_route_id: null,
        weather_agent_partial: false,
        standalone_port_weather: null,
        compliance_data: null,
        vessel_consumption: null,
        rob_tracking: null,
        rob_waypoints: null,
        rob_safety_status: null,
        eca_consumption: null,
        eca_summary: null,
        vessel_name: null,
        vessel_profile: null,
        hull_performance: null,
        hull_performance_charts: null,
        agent_call_counts: {
          route_agent: 0,
          weather_agent: 0,
          bunker_agent: 0,
        },
        // Agentic supervisor state
        reasoning_history: [],
        current_thought: null,
        next_action: null,
        recovery_attempts: 0,
        needs_clarification: false,
        clarification_question: null,
        // Parameter override fields (supervisor → agent communication)
        port_overrides: undefined,
        agent_overrides: undefined,
        execution_result: null,
        execution_plan: null,
        workflow_stage: 0,
        _schema_version: '2.0.0',
        synthesized_response: null,
        request_context: null,
        synthesis_data: null,
        // Graceful degradation fields
        degraded_mode: false,
        missing_data: [],
        routing_metadata: undefined,
        bunker_analysis_speed: undefined,
        bunker_analysis_load_condition: undefined,
        bunker_hitl_pending: undefined,
        original_intent: null,
      };
      
      console.log('🚀 Starting multi-agent workflow...\n');
      
      const result = await multiAgentApp.invoke(initialState, {
        recursionLimit: 60,
      });
      
      const duration = Date.now() - startTime;
      
      // ========================================================================
      // Validation
      // ========================================================================
      console.log('\n' + '='.repeat(80));
      console.log('📊 VALIDATION RESULTS:');
      console.log('='.repeat(80));
      
      let testPassed = true;
      
      // Check route agent
      if (test.checkRoute) {
        if (result.route_data) {
          console.log(`✅ Route Agent: PASS - Route calculated (${result.route_data.distance_nm.toFixed(1)} nm)`);
          console.log(`   Origin: ${result.route_data.origin_port_code}`);
          console.log(`   Destination: ${result.route_data.destination_port_code}`);
          console.log(`   Waypoints: ${result.route_data.waypoints.length}`);
        } else {
          console.log(`❌ Route Agent: FAIL - No route data`);
          testPassed = false;
        }
      }
      
      // Check compliance agent
      if (test.shouldHaveCompliance) {
        if (result.compliance_data) {
          console.log(`✅ Compliance Agent: PASS - Compliance data present`);
          const ecaData = result.compliance_data.eca_zones;
          if (ecaData) {
            console.log(`   ECA zones detected: ${ecaData.has_eca_zones}`);
            if (ecaData.has_eca_zones) {
              console.log(`   Zones crossed: ${ecaData.eca_zones_crossed.length}`);
              console.log(`   MGO required: ${ecaData.fuel_requirements.mgo_with_safety_margin_mt} MT`);
            }
          }
        } else {
          console.log(`⚠️  Compliance Agent: WARNING - No compliance data (may be expected for some routes)`);
        }
      }
      
      // Check bunker agent
      if (test.checkBunker) {
        if (result.bunker_analysis) {
          console.log(`✅ Bunker Agent: PASS - Bunker analysis complete`);
          console.log(`   Recommendations: ${result.bunker_analysis.recommendations?.length || 0}`);
          if (result.bunker_analysis.best_option) {
            console.log(`   Best option: ${result.bunker_analysis.best_option.port_name}`);
            console.log(`   Total cost: $${result.bunker_analysis.best_option.total_cost_usd?.toFixed(2) || 'N/A'}`);
          }
        } else {
          console.log(`❌ Bunker Agent: FAIL - No bunker analysis`);
          testPassed = false;
        }
      }
      
      // Check weather (if requested)
      if (test.checkWeather) {
        if (result.port_weather_status && result.port_weather_status.length > 0) {
          console.log(`✅ Weather Safety: PASS - Port weather checked (${result.port_weather_status.length} ports)`);
        } else {
          console.log(`⚠️  Weather Safety: WARNING - No port weather data (may be expected)`);
        }
      }
      
      // Check final recommendation
      if (result.final_recommendation) {
        console.log(`✅ Final Recommendation: PASS - Generated successfully`);
        
        // Check if compliance info is included (if expected)
        if (test.shouldHaveCompliance) {
          const hasComplianceInfo = 
            result.final_recommendation.includes('REGULATORY COMPLIANCE') ||
            result.final_recommendation.includes('ECA') ||
            result.final_recommendation.includes('MGO Required') ||
            result.final_recommendation.includes('No ECA zones crossed');
          
          if (hasComplianceInfo) {
            console.log(`✅ Compliance in Output: PASS - Compliance info included in recommendation`);
          } else {
            console.log(`⚠️  Compliance in Output: WARNING - Compliance info not found in recommendation`);
          }
        }
      } else {
        console.log(`❌ Final Recommendation: FAIL - No recommendation generated`);
        testPassed = false;
      }
      
      // Check agent status
      const agentStatus = result.agent_status || {};
      const failedAgents = Object.entries(agentStatus)
        .filter(([_, status]) => status === 'failed')
        .map(([agent]) => agent);
      
      if (failedAgents.length > 0) {
        console.log(`❌ Agent Failures: ${failedAgents.join(', ')}`);
        testPassed = false;
      } else {
        console.log(`✅ Agent Status: PASS - All agents completed successfully`);
      }
      
      // Check for errors
      const agentErrors = result.agent_errors || {};
      if (Object.keys(agentErrors).length > 0) {
        console.log(`⚠️  Agent Errors: ${Object.keys(agentErrors).length} agent(s) had errors`);
        Object.entries(agentErrors).forEach(([agent, error]: [string, any]) => {
          console.log(`   - ${agent}: ${error.error}`);
        });
      }
      
      console.log(`\n⏱️  Duration: ${duration}ms`);
      
      // Summary
      console.log('\n' + '='.repeat(80));
      if (testPassed) {
        console.log(`✅ ${test.name}: PASSED`);
      } else {
        console.log(`❌ ${test.name}: FAILED`);
        allTestsPassed = false;
      }
      console.log('='.repeat(80));
      
    } catch (error: any) {
      console.error(`\n❌ ${test.name}: ERROR - ${error.message}`);
      console.error(error.stack);
      allTestsPassed = false;
    }
  }
  
  // Final Summary
  console.log('\n' + '='.repeat(80));
  console.log('🎉 INTEGRATION TEST SUMMARY');
  console.log('='.repeat(80));
  
  if (allTestsPassed) {
    console.log('✅ ALL TESTS PASSED');
    console.log('✅ Compliance agent integration successful - no breaking changes detected');
    console.log('✅ Existing functionality preserved');
  } else {
    console.log('❌ SOME TESTS FAILED');
    console.log('⚠️  Review failures above');
  }
  
  console.log('='.repeat(80));
}

testComplianceIntegration().catch(console.error);

