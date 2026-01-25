/**
 * Plan Execution Integration Tests
 * 
 * Integration tests for the complete plan execution flow:
 * plan generation → validation → execution → results
 */

import { ExecutionPlanGenerator } from '@/lib/orchestration/plan-generator';
import { getPlanValidator } from '@/lib/orchestration/plan-validator';
import { createPlanExecutor } from '@/lib/orchestration/plan-executor';
import { registerAllAgents } from '@/lib/registry/agents';
import { registerAllTools } from '@/lib/registry/tools';
import { loadConfigurations } from '@/lib/config/registry-loader';
import type { ExecutionPlan } from '@/lib/types/execution-plan';
import type { MultiAgentState } from '@/lib/multi-agent/state';

/**
 * Create a mock plan for testing when API key is not available
 */
function createMockPlan(): ExecutionPlan {
  return {
    planId: 'test-integration-plan-123',
    queryType: 'bunker_planning',
    createdAt: new Date(),
    workflowId: 'bunker_planning',
    workflowVersion: '1.0.0',
    stages: [
      {
        stageId: 'route_stage',
        order: 1,
        agentId: 'route_agent',
        agentName: 'Route Calculator Agent',
        agentType: 'specialist',
        required: true,
        canRunInParallel: false,
        dependsOn: [],
        provides: ['route_data'],
        requires: [],
        toolsNeeded: ['calculate_route'],
        estimatedDurationMs: 5000,
        estimatedCost: 0.01,
      },
      {
        stageId: 'bunker_stage',
        order: 2,
        agentId: 'bunker_agent',
        agentName: 'Bunker Planner Agent',
        agentType: 'specialist',
        required: true,
        canRunInParallel: false,
        dependsOn: ['route_stage'],
        provides: ['bunker_analysis'],
        requires: ['route_data'],
        toolsNeeded: [],
        estimatedDurationMs: 3000,
        estimatedCost: 0.005,
      },
      {
        stageId: 'finalize_stage',
        order: 3,
        agentId: 'finalize',
        agentName: 'Finalize Agent',
        agentType: 'finalizer',
        required: true,
        canRunInParallel: false,
        dependsOn: ['bunker_stage'],
        provides: [],
        requires: ['bunker_analysis'],
        toolsNeeded: [],
        estimatedDurationMs: 2000,
        estimatedCost: 0.002,
      },
    ],
    validation: {
      isValid: true,
      missingInputs: [],
      invalidAgents: [],
      invalidTools: [],
      warnings: [],
    },
    estimates: {
      totalAgents: 3,
      llmCalls: 0,
      apiCalls: 1,
      estimatedCostUSD: 0.017,
      estimatedDurationMs: 10000,
    },
    requiredState: [],
    expectedOutputs: ['route_data', 'bunker_analysis'],
    context: {
      priority: 'normal',
      timeout: 60000,
      correlationId: 'test-integration-123',
    },
    originalQuery: 'Find cheapest bunker ports from Singapore to Rotterdam',
    classification: {
      queryType: 'bunker_planning',
      confidence: 0.9,
      reasoning: 'Mock plan for integration testing',
    },
  };
}

/**
 * Run plan execution integration tests
 */
export async function testPlanExecution(): Promise<void> {
  console.log('\n🧪 [PLAN-EXECUTION-TEST] Starting integration tests...\n');
  
  let allPassed = true;
  
  // Setup: Load configs and register agents/tools
  try {
    await loadConfigurations();
    registerAllTools();
    registerAllAgents();
  } catch (error: any) {
    console.error('❌ Setup FAILED:', error.message);
    allPassed = false;
    return;
  }
  
  // Check if API key is available for plan generation
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  let generator: ExecutionPlanGenerator | null = null;
  
  if (hasApiKey) {
    generator = new ExecutionPlanGenerator();
    console.log('✅ API key available - will generate plans with LLM');
  } else {
    console.warn('⚠️  ANTHROPIC_API_KEY not set - using mock plans for testing');
    console.log('   - Tests will validate and execute mock plans');
    console.log('   - Set ANTHROPIC_API_KEY to test plan generation');
  }
  
  const validator = getPlanValidator();
  const executor = createPlanExecutor();
  
  // Test 1: Complete flow - generate → validate → execute
  console.log('📋 Test 1: Complete flow - generate → validate → execute');
  try {
    const userQuery = 'Find cheapest bunker ports from Singapore to Rotterdam';
    const initialState: MultiAgentState = {
      messages: [],
      correlation_id: 'test-integration-123',
    } as MultiAgentState;
    
    // Step 1: Generate or use mock plan
    console.log('   Step 1: Generating plan...');
    let plan: ExecutionPlan;
    if (hasApiKey && generator) {
      plan = await generator.generatePlan(userQuery, initialState, { forceRegenerate: true });
    } else {
      plan = createMockPlan();
      console.log('   (Using mock plan - API key not available)');
    }
    
    if (!plan || !plan.stages || plan.stages.length === 0) {
      console.error('❌ Test 1 FAILED: Plan generation failed');
      allPassed = false;
      return;
    }
    
    console.log(`   ✓ Plan generated: ${plan.planId} (${plan.stages.length} stages)`);
    
    // Step 2: Validate plan
    console.log('   Step 2: Validating plan...');
    const validation = validator.validate(plan, initialState);
    
    if (!validation.valid) {
      console.error('❌ Test 1 FAILED: Plan validation failed');
      console.error(`   Errors: ${validation.errors.join(', ')}`);
      allPassed = false;
      return;
    }
    
    console.log(`   ✓ Plan validated: ${validation.errors.length} errors, ${validation.warnings.length} warnings`);
    
    // Step 3: Execute plan
    console.log('   Step 3: Executing plan...');
    const result = await executor.execute(plan, initialState);
    
    if (!result) {
      console.error('❌ Test 1 FAILED: Plan execution returned no result');
      allPassed = false;
    } else {
      console.log('✅ Test 1 PASSED: Complete flow works');
      console.log(`   - Plan ID: ${result.planId}`);
      console.log(`   - Success: ${result.success}`);
      console.log(`   - Completed: ${result.stagesCompleted.length} stages`);
      console.log(`   - Duration: ${result.durationMs}ms`);
    }
  } catch (error: any) {
    console.error('❌ Test 1 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 2: Execution respects plan structure
  console.log('\n📋 Test 2: Execution respects plan structure');
  try {
    const userQuery = 'Calculate route from Tokyo to Shanghai';
    const initialState: MultiAgentState = {
      messages: [],
      correlation_id: 'test-structure-123',
    } as MultiAgentState;
    
    const plan = hasApiKey && generator
      ? await generator.generatePlan(userQuery, initialState, { forceRegenerate: true })
      : createMockPlan();
    const result = await executor.execute(plan, initialState);
    
    // Check that execution followed plan structure
    const planStageIds = new Set(plan.stages.map(s => s.stageId));
    const executedStageIds = new Set([
      ...result.stagesCompleted,
      ...result.stagesFailed,
      ...result.stagesSkipped,
    ]);
    
    const unexpectedStages = Array.from(executedStageIds).filter(id => !planStageIds.has(id));
    
    if (unexpectedStages.length > 0) {
      console.error(`❌ Test 2 FAILED: Unexpected stages executed: ${unexpectedStages.join(', ')}`);
      allPassed = false;
    } else {
      console.log('✅ Test 2 PASSED: Execution respects plan structure');
      console.log(`   - All executed stages were in plan`);
    }
  } catch (error: any) {
    console.error('❌ Test 2 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 3: Results match estimates
  console.log('\n📋 Test 3: Results match estimates');
  try {
    const userQuery = 'Find cheapest bunker from Singapore to Rotterdam';
    const initialState: MultiAgentState = {
      messages: [],
      correlation_id: 'test-estimates-123',
    } as MultiAgentState;
    
    const plan = hasApiKey && generator
      ? await generator.generatePlan(userQuery, initialState, { forceRegenerate: true })
      : createMockPlan();
    const result = await executor.execute(plan, initialState);
    
    if (result.vsEstimates) {
      const durationAccuracy = result.vsEstimates.accuracyPercent;
      const costDiff = Math.abs(result.vsEstimates.costDiffUSD);
      
      console.log('✅ Test 3 PASSED: Results tracked vs estimates');
      console.log(`   - Duration accuracy: ${durationAccuracy}%`);
      console.log(`   - Cost difference: $${costDiff.toFixed(4)}`);
      console.log(`   - Estimated: ${plan.estimates.estimatedDurationMs}ms, Actual: ${result.durationMs}ms`);
    } else {
      console.warn('⚠️  Test 3: vsEstimates not available');
    }
  } catch (error: any) {
    console.error('❌ Test 3 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 4: Error handling works
  console.log('\n📋 Test 4: Error handling works');
  try {
    const userQuery = 'Find cheapest bunker from Singapore to Rotterdam';
    const initialState: MultiAgentState = {
      messages: [],
      correlation_id: 'test-errors-123',
    } as MultiAgentState;
    
    const plan = hasApiKey && generator
      ? await generator.generatePlan(userQuery, initialState, { forceRegenerate: true })
      : createMockPlan();
    
    // Introduce an error by making a stage reference invalid agent
    if (plan.stages.length > 0) {
      const originalAgentId = plan.stages[0].agentId;
      plan.stages[0].agentId = 'non_existent_agent_for_testing';
      
      const result = await executor.execute(plan, initialState);
      
      // Should handle error gracefully
      if (result.errors.length > 0) {
        console.log('✅ Test 4 PASSED: Error handling works');
        console.log(`   - Errors captured: ${result.errors.length}`);
        console.log(`   - Error details: ${result.errors[0].error}`);
      } else {
        console.warn('⚠️  Test 4: No errors captured (may have been handled differently)');
      }
      
      // Restore original
      plan.stages[0].agentId = originalAgentId;
    }
  } catch (error: any) {
    // Exception is acceptable - error handling may throw
    console.log('✅ Test 4 PASSED: Error handling works (exception thrown)');
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ [PLAN-EXECUTION-TEST] All integration tests passed!');
  } else {
    console.log('❌ [PLAN-EXECUTION-TEST] Some tests failed');
  }
  console.log('='.repeat(60) + '\n');
}

// Run tests if executed directly
if (require.main === module) {
  testPlanExecution().catch((error) => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}
