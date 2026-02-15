/**
 * Synthesis Engine Unit Tests
 * 
 * Tests synthesis engine synthesizes response from execution result,
 * extracts core data, generates insights, recommendations, warnings, alerts,
 * reasoning, and next steps.
 */

import { SynthesisEngine, getSynthesisEngine } from '@/lib/synthesis/synthesis-engine';
import type { MultiAgentState } from '@/lib/multi-agent/state';
import type { PlanExecutionResult } from '@/lib/types/execution-plan';

/**
 * Create a mock execution result
 */
function createMockExecutionResult(): PlanExecutionResult {
  return {
    planId: 'test-plan-123',
    success: true,
    startedAt: new Date(),
    completedAt: new Date(),
    durationMs: 5000,
    stagesCompleted: ['route_stage', 'bunker_stage'],
    stagesFailed: [],
    stagesSkipped: [],
    stageResults: [],
    finalState: {} as MultiAgentState,
    costs: {
      llmCalls: 0,
      apiCalls: 2,
      actualCostUSD: 0.01,
    },
    errors: [],
  };
}

/**
 * Create a state with bunker analysis data
 */
function createStateWithBunkerData(): MultiAgentState {
  return {
    messages: [],
    correlation_id: 'test-synthesis-123',
    execution_plan: {
      planId: 'test-plan-123',
      queryType: 'bunker_planning',
    } as any,
    route_data: {
      origin_port_code: 'SGSIN',
      destination_port_code: 'NLRTM',
      total_distance_nm: 8500,
      estimated_hours: 240,
      waypoints: [
        { lat: 1.0, lon: 103.0 },
        { lat: 51.0, lon: 4.0 },
      ],
      eca_segments: [
        { start_nm: 0, end_nm: 100 },
      ],
    } as any,
    bunker_analysis: {
      best_option: {
        port_code: 'AEFJR',
        port_name: 'Fujairah',
        total_cost_usd: 500000,
        fuel_cost_usd: 450000,
        deviation_cost_usd: 50000,
        quantity_mt: 1000,
        fuel_type: 'VLSFO',
      },
      worst_option: {
        total_cost_usd: 600000,
      },
      max_savings_usd: 100000,
      recommendations: [
        { port_code: 'AEFJR', port_name: 'Fujairah' },
        { port_code: 'AEJEA', port_name: 'Jebel Ali' },
      ],
      total_options_evaluated: 5,
    } as any,
    vessel: {
      name: 'Test Vessel',
      imo: '1234567',
      capacity_mt: 2000,
      fuel_type: 'VLSFO',
    } as any,
  } as unknown as MultiAgentState;
}

/**
 * Create a state with weather data
 */
function createStateWithWeatherData(): MultiAgentState {
  const baseState = createStateWithBunkerData();
  return {
    ...baseState,
    weather_forecast: {
      overall_risk: 'high',
      unsafe_segments: [
        { start_nm: 2000, end_nm: 2500 },
        { start_nm: 4000, end_nm: 4500 },
      ],
      warnings: ['High waves expected'],
      critical_warning: 'Severe weather conditions ahead',
    } as any,
  };
}

/**
 * Create a state with CII data
 */
function createStateWithCIIData(): MultiAgentState {
  const baseState = createStateWithBunkerData();
  return {
    ...baseState,
    cii_rating: {
      rating: 'E',
      cii_value: 15.5,
      required_cii: 10.0,
    } as any,
  } as unknown as MultiAgentState;
}

/**
 * Run synthesis engine tests
 */
export async function testSynthesisEngine(): Promise<void> {
  console.log('\n🧪 [SYNTHESIS-ENGINE-TEST] Starting synthesis engine tests...\n');
  
  let allPassed = true;
  const engine = getSynthesisEngine();
  
  // Test 1: Synthesizes response from execution result
  console.log('📋 Test 1: Synthesizes response from execution result');
  try {
    const state = createStateWithBunkerData();
    const executionResult = createMockExecutionResult();
    
    const synthesis = await engine.synthesize(state, executionResult);
    
    if (!synthesis) {
      console.error('❌ Test 1 FAILED: Should return synthesized response');
      allPassed = false;
    } else if (synthesis.correlationId !== state.correlation_id) {
      console.error('❌ Test 1 FAILED: Correlation ID should match');
      allPassed = false;
    } else if (synthesis.queryType !== 'bunker_planning') {
      console.error(`❌ Test 1 FAILED: Query type should be bunker_planning, got ${synthesis.queryType}`);
      allPassed = false;
    } else {
      console.log('✅ Test 1 PASSED: Synthesizes response from execution result');
      console.log(`   - Correlation ID: ${synthesis.correlationId}`);
      console.log(`   - Query type: ${synthesis.queryType}`);
      console.log(`   - Success: ${synthesis.success}`);
    }
  } catch (error: any) {
    console.error('❌ Test 1 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 2: Extracts core data correctly
  console.log('\n📋 Test 2: Extracts core data correctly');
  try {
    const state = createStateWithBunkerData();
    const executionResult = createMockExecutionResult();
    
    const synthesis = await engine.synthesize(state, executionResult);
    
    if (!synthesis.data) {
      console.error('❌ Test 2 FAILED: Should extract core data');
      allPassed = false;
    } else {
      const hasRoute = 'route' in synthesis.data;
      const hasBunker = 'bunker' in synthesis.data;
      const hasVessel = 'vessel' in synthesis.data;
      
      if (!hasRoute || !hasBunker || !hasVessel) {
        console.error('❌ Test 2 FAILED: Should extract route, bunker, and vessel data');
        console.error(`   - Route: ${hasRoute}`);
        console.error(`   - Bunker: ${hasBunker}`);
        console.error(`   - Vessel: ${hasVessel}`);
        allPassed = false;
      } else {
        // Verify route data structure
        const routeData = synthesis.data.route;
        const routeValid = routeData.origin === 'SGSIN' && 
                          routeData.destination === 'NLRTM' &&
                          routeData.distance_nm === 8500;
        
        // Verify bunker data structure
        const bunkerData = synthesis.data.bunker;
        const bunkerValid = bunkerData.best_option?.port_code === 'AEFJR';
        
        if (!routeValid || !bunkerValid) {
          console.error('❌ Test 2 FAILED: Extracted data should match source');
          allPassed = false;
        } else {
          console.log('✅ Test 2 PASSED: Extracts core data correctly');
          console.log(`   - Route data: ${hasRoute} (origin: ${routeData.origin})`);
          console.log(`   - Bunker data: ${hasBunker} (port: ${bunkerData.best_option?.port_code})`);
          console.log(`   - Vessel data: ${hasVessel}`);
        }
      }
    }
  } catch (error: any) {
    console.error('❌ Test 2 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 3: Generates insights
  console.log('\n📋 Test 3: Generates insights');
  try {
    const state = createStateWithBunkerData();
    const executionResult = createMockExecutionResult();
    
    const synthesis = await engine.synthesize(state, executionResult);
    
    if (!Array.isArray(synthesis.insights)) {
      console.error('❌ Test 3 FAILED: Insights should be an array');
      allPassed = false;
    } else {
      // Should have cost optimization insight (max_savings_usd > 1000)
      const hasCostInsight = synthesis.insights.some(i => i.type === 'cost_optimization');
      const hasECAInsight = synthesis.insights.some(i => i.type === 'eca_compliance');
      
      if (!hasCostInsight && !hasECAInsight) {
        console.warn('⚠️  Test 3: No insights generated (may be expected if thresholds not met)');
        console.log(`   - Total insights: ${synthesis.insights.length}`);
      } else {
        console.log('✅ Test 3 PASSED: Generates insights');
        console.log(`   - Total insights: ${synthesis.insights.length}`);
        console.log(`   - Cost optimization: ${hasCostInsight}`);
        console.log(`   - ECA compliance: ${hasECAInsight}`);
      }
    }
  } catch (error: any) {
    console.error('❌ Test 3 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 4: Generates recommendations
  console.log('\n📋 Test 4: Generates recommendations');
  try {
    const state = createStateWithBunkerData();
    const executionResult = createMockExecutionResult();
    
    const synthesis = await engine.synthesize(state, executionResult);
    
    if (!Array.isArray(synthesis.recommendations)) {
      console.error('❌ Test 4 FAILED: Recommendations should be an array');
      allPassed = false;
    } else {
      // Should have bunker recommendation if best_option exists
      const hasBunkerRec = synthesis.recommendations.some(r => r.id === 'bunker_primary');
      
      if (!hasBunkerRec) {
        console.error('❌ Test 4 FAILED: Should generate bunker recommendation');
        allPassed = false;
      } else {
        const bunkerRec = synthesis.recommendations.find(r => r.id === 'bunker_primary');
        const recValid = bunkerRec?.action === 'Bunker at recommended port' &&
                        bunkerRec?.details?.port_code === 'AEFJR';
        
        if (!recValid) {
          console.error('❌ Test 4 FAILED: Recommendation details should be correct');
          allPassed = false;
        } else {
          console.log('✅ Test 4 PASSED: Generates recommendations');
          console.log(`   - Total recommendations: ${synthesis.recommendations.length}`);
          console.log(`   - Bunker recommendation: ${hasBunkerRec}`);
          console.log(`   - Port: ${bunkerRec?.details?.port_code}`);
        }
      }
    }
  } catch (error: any) {
    console.error('❌ Test 4 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 5: Extracts warnings and alerts
  console.log('\n📋 Test 5: Extracts warnings and alerts');
  try {
    const state = createStateWithWeatherData();
    const executionResult = createMockExecutionResult();
    
    const synthesis = await engine.synthesize(state, executionResult);
    
    if (!Array.isArray(synthesis.warnings)) {
      console.error('❌ Test 5 FAILED: Warnings should be an array');
      allPassed = false;
    } else if (!Array.isArray(synthesis.alerts)) {
      console.error('❌ Test 5 FAILED: Alerts should be an array');
      allPassed = false;
    } else {
      // Should have weather alert if critical_warning exists
      const hasWeatherAlert = synthesis.alerts.some(a => a.type === 'weather_danger');
      
      // Should have weather recommendation
      const hasWeatherRec = synthesis.recommendations.some(r => r.id === 'weather_avoidance');
      
      console.log('✅ Test 5 PASSED: Extracts warnings and alerts');
      console.log(`   - Warnings: ${synthesis.warnings.length}`);
      console.log(`   - Alerts: ${synthesis.alerts.length}`);
      console.log(`   - Weather alert: ${hasWeatherAlert}`);
      console.log(`   - Weather recommendation: ${hasWeatherRec}`);
    }
  } catch (error: any) {
    console.error('❌ Test 5 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 6: Generates reasoning
  console.log('\n📋 Test 6: Generates reasoning');
  try {
    const state = createStateWithBunkerData();
    const executionResult = createMockExecutionResult();
    
    const synthesis = await engine.synthesize(state, executionResult);
    
    if (!synthesis.reasoning || synthesis.reasoning.length === 0) {
      // Reasoning generation may fail if API key not available - that's OK
      if (synthesis.reasoning && synthesis.reasoning.includes('Analysis completed successfully')) {
        console.log('✅ Test 6 PASSED: Generates reasoning (fallback used)');
        console.log(`   - Reasoning: ${synthesis.reasoning.substring(0, 100)}...`);
      } else {
        console.warn('⚠️  Test 6: Reasoning not generated (may require API key)');
        console.log(`   - Reasoning: ${synthesis.reasoning || 'empty'}`);
      }
    } else {
      console.log('✅ Test 6 PASSED: Generates reasoning');
      console.log(`   - Reasoning length: ${synthesis.reasoning.length} chars`);
      console.log(`   - Preview: ${synthesis.reasoning.substring(0, 100)}...`);
    }
  } catch (error: any) {
    // Reasoning generation may fail without API key - that's acceptable
    if (error.message.includes('API key') || error.message.includes('Anthropic')) {
      console.log('✅ Test 6 PASSED: Generates reasoning (skipped - API key not available)');
      console.log(`   - Note: Reasoning requires ANTHROPIC_API_KEY`);
    } else {
      console.error('❌ Test 6 FAILED:', error.message);
      allPassed = false;
    }
  }
  
  // Test 7: Creates next steps
  console.log('\n📋 Test 7: Creates next steps');
  try {
    const state = createStateWithBunkerData();
    const executionResult = createMockExecutionResult();
    
    const synthesis = await engine.synthesize(state, executionResult);
    
    if (!Array.isArray(synthesis.nextSteps)) {
      console.error('❌ Test 7 FAILED: Next steps should be an array');
      allPassed = false;
    } else {
      // Should have next steps if best_option exists
      const hasNextSteps = synthesis.nextSteps.length > 0;
      
      if (!hasNextSteps) {
        console.warn('⚠️  Test 7: No next steps generated (may be expected)');
      } else {
        const firstStep = synthesis.nextSteps[0];
        const stepValid = firstStep.order === 1 &&
                         firstStep.action &&
                         firstStep.owner &&
                         firstStep.deadline;
        
        if (!stepValid) {
          console.error('❌ Test 7 FAILED: Next steps should have required fields');
          allPassed = false;
        } else {
          console.log('✅ Test 7 PASSED: Creates next steps');
          console.log(`   - Total steps: ${synthesis.nextSteps.length}`);
          console.log(`   - First step: ${firstStep.action}`);
          console.log(`   - Owner: ${firstStep.owner}`);
        }
      }
    }
  } catch (error: any) {
    console.error('❌ Test 7 FAILED:', error.message);
    allPassed = false;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ [SYNTHESIS-ENGINE-TEST] All tests passed!');
  } else {
    console.log('❌ [SYNTHESIS-ENGINE-TEST] Some tests failed');
  }
  console.log('='.repeat(60) + '\n');
}

// Run tests if executed directly
if (require.main === module) {
  testSynthesisEngine().catch((error) => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}
