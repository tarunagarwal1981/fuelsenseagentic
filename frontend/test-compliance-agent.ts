/**
 * Compliance Agent Test Script
 * Tests ECA zone detection and MGO requirement calculations
 * Run with: npx tsx frontend/test-compliance-agent.ts
 */

// Load environment variables FIRST
import './lib/multi-agent/__tests__/setup-env';

import { multiAgentApp } from './lib/multi-agent/graph';
import { HumanMessage } from '@langchain/core/messages';
import type { MultiAgentState } from './lib/multi-agent/state';

async function testComplianceAgent() {
  console.log('🧪 Testing Compliance Agent');
  console.log('='.repeat(80));
  
  const testQueries = [
    {
      name: 'Test 1: Singapore to Rotterdam (Should detect ECA)',
      query: 'Find bunker from Singapore to Rotterdam, 650 MT VLSFO',
      shouldDetectECA: true,
      expectedZones: ['North Sea', 'Baltic'],
    },
    {
      name: 'Test 2: Dubai to Singapore (Should NOT detect ECA)',
      query: 'Find bunker from Dubai to Singapore, 500 MT VLSFO',
      shouldDetectECA: false,
      expectedZones: [],
    },
  ];
  
  for (const test of testQueries) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🧪 ${test.name}`);
    console.log(`📝 Query: "${test.query}"`);
    console.log(`Expected: ${test.shouldDetectECA ? 'ECA DETECTED' : 'NO ECA'}`);
    console.log('-'.repeat(80));
    
    try {
      const startTime = Date.now();
      
      // Create initial state with HumanMessage
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
      };
      
      console.log('🚀 Starting multi-agent workflow...\n');
      
      const result = await multiAgentApp.invoke(initialState, {
        recursionLimit: 60,
      });
      
      const duration = Date.now() - startTime;
      
      // Check compliance data
      const complianceData = result.compliance_data;
      const ecaData = complianceData?.eca_zones;
      
      console.log('\n' + '='.repeat(80));
      console.log('📊 TEST RESULTS:');
      console.log('='.repeat(80));
      
      // Check if compliance agent ran
      const complianceStatus = result.agent_status?.compliance_agent;
      console.log(`✅ Compliance Agent Status: ${complianceStatus || 'not executed'}`);
      
      if (ecaData) {
        console.log(`\n🌍 ECA Zone Detection:`);
        console.log(`   Has ECA zones: ${ecaData.has_eca_zones}`);
        console.log(`   Zones crossed: ${ecaData.eca_zones_crossed?.length || 0}`);
        
        if (ecaData.has_eca_zones && ecaData.eca_zones_crossed) {
          console.log(`\n   Zones:`);
          for (const zone of ecaData.eca_zones_crossed) {
            console.log(`   • ${zone.zone_name}`);
            console.log(`     - Distance: ${zone.distance_in_zone_nm.toFixed(1)} nm`);
            console.log(`     - MGO needed: ${zone.estimated_mgo_consumption_mt.toFixed(1)} MT`);
          }
          
          console.log(`\n   Fuel Requirements:`);
          console.log(`   - Total MGO required: ${ecaData.fuel_requirements.mgo_with_safety_margin_mt} MT`);
          console.log(`   - Safety margin: ${ecaData.fuel_requirements.safety_margin_percent}%`);
          
          if (ecaData.fuel_requirements.switching_points.length > 0) {
            console.log(`\n   Fuel Switching Points:`);
            for (const point of ecaData.fuel_requirements.switching_points) {
              const hours = Math.floor(point.time_from_start_hours);
              const minutes = Math.round((point.time_from_start_hours % 1) * 60);
              const emoji = point.action === 'SWITCH_TO_MGO' ? '🔴' : '🟢';
              console.log(`   ${emoji} ${point.action} at ${hours}h ${minutes}m`);
              console.log(`      Location: ${point.location.lat.toFixed(2)}°N, ${point.location.lon.toFixed(2)}°E`);
            }
          }
        } else {
          console.log(`   ✅ No ECA zones crossed - VLSFO only required`);
        }
      } else {
        console.log(`\n⚠️ No compliance data found`);
      }
      
      // Validate test expectations
      console.log('\n' + '='.repeat(80));
      console.log('✅ VALIDATION:');
      console.log('='.repeat(80));
      
      if (test.shouldDetectECA) {
        if (ecaData?.has_eca_zones) {
          console.log('✅ PASS: ECA zones detected as expected');
          if (ecaData.eca_zones_crossed && ecaData.eca_zones_crossed.length > 0) {
            console.log(`✅ PASS: Found ${ecaData.eca_zones_crossed.length} zone(s)`);
            const mgoRequired = ecaData.fuel_requirements.mgo_with_safety_margin_mt;
            if (mgoRequired > 0) {
              console.log(`✅ PASS: MGO required: ${mgoRequired} MT`);
            } else {
              console.log(`⚠️ WARNING: MGO requirement is 0`);
            }
          }
        } else {
          console.log('❌ FAIL: Expected ECA zones but none detected');
        }
      } else {
        if (!ecaData?.has_eca_zones) {
          console.log('✅ PASS: No ECA zones detected as expected');
        } else {
          console.log('❌ FAIL: Expected no ECA zones but some were detected');
        }
      }
      
      console.log(`\n⏱️  Duration: ${duration}ms`);
      console.log(`📊 Final state:`, {
        has_route: !!result.route_data,
        has_compliance: !!result.compliance_data,
        has_weather: !!result.weather_forecast,
        has_bunker: !!result.bunker_analysis,
        has_recommendation: !!result.final_recommendation,
      });
      
      if (result.final_recommendation) {
        const hasComplianceInRecommendation = result.final_recommendation.includes('REGULATORY COMPLIANCE') || 
                                               result.final_recommendation.includes('ECA') ||
                                               result.final_recommendation.includes('MGO Required');
        console.log(`\n📋 Final recommendation includes compliance: ${hasComplianceInRecommendation ? '✅ YES' : '❌ NO'}`);
        if (hasComplianceInRecommendation) {
          const complianceSection = result.final_recommendation.split('⚖️')[1]?.substring(0, 300) || '';
          console.log(`\n   Compliance section preview:\n${complianceSection}...`);
        }
      }
      
    } catch (error: any) {
      console.error(`\n❌ Test failed:`, error.message);
      console.error(error.stack);
      if (error.message.includes('GraphRecursionError')) {
        console.error('⚠️ RECURSION ERROR - Check graph routing!');
      }
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('🎉 Compliance Agent Tests Complete!');
  console.log('='.repeat(80));
}

testComplianceAgent().catch(console.error);

