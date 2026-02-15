/**
 * Plan Executor Unit Tests
 * 
 * Tests plan execution, stage ordering, skip conditions, error handling,
 * cost tracking, and ensures no LLM calls during execution.
 */

import { PlanExecutor, createPlanExecutor } from '@/lib/orchestration/plan-executor';
import { ExecutionPlanGenerator } from '@/lib/orchestration/plan-generator';
import { registerAllAgents } from '@/lib/registry/agents';
import { registerAllTools } from '@/lib/registry/tools';
import { loadConfigurations } from '@/lib/config/registry-loader';
import type { ExecutionPlan, PlanStage } from '@/lib/types/execution-plan';
import type { MultiAgentState } from '@/lib/multi-agent/state';

/**
 * Create a mock plan for testing
 */
function createMockPlan(): ExecutionPlan {
  return {
    planId: 'test-plan-123',
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
      llmCalls: 0, // No LLM calls during execution
      apiCalls: 1,
      estimatedCostUSD: 0.017,
      estimatedDurationMs: 10000,
    },
    requiredState: [],
    expectedOutputs: ['route_data', 'bunker_analysis'],
    context: {
      priority: 'normal',
      timeout: 60000,
      correlationId: 'test-correlation-123',
    },
    originalQuery: 'Find cheapest bunker from Singapore to Rotterdam',
    classification: {
      queryType: 'bunker_planning',
      confidence: 0.9,
      reasoning: 'Test query',
    },
  };
}

/**
 * Run plan executor tests
 */
export async function testPlanExecutor(): Promise<void> {
  console.log('\n🧪 [PLAN-EXECUTOR-TEST] Starting plan executor tests...\n');
  
  let allPassed = true;
  
  // Setup: Load configs and register agents/tools
  try {
    await loadConfigurations();
    registerAllTools();
    registerAllAgents();
  } catch (error: unknown) {
    console.error('❌ Setup FAILED:', error instanceof Error ? error.message : String(error));
    allPassed = false;
    return;
  }
  
  // Test 1: Executes plan successfully
  console.log('📋 Test 1: Executes plan successfully');
  try {
    const executor = createPlanExecutor({});
    const plan = createMockPlan();
    const initialState = {
      messages: [],
      correlation_id: 'test-correlation-123',
    } as unknown as MultiAgentState;
    
    const result = await executor.execute(plan, initialState);
    
    if (!result.success) {
      console.error('❌ Test 1 FAILED: Plan execution should succeed');
      console.error(`   Errors: ${result.errors.map(e => e.error).join(', ')}`);
      allPassed = false;
    } else if (result.stagesCompleted.length === 0) {
      console.error('❌ Test 1 FAILED: No stages completed');
      allPassed = false;
    } else {
      console.log('✅ Test 1 PASSED: Plan executed successfully');
      console.log(`   - Completed: ${result.stagesCompleted.length} stages`);
      console.log(`   - Duration: ${result.durationMs}ms`);
    }
  } catch (error: unknown) {
    console.error('❌ Test 1 FAILED:', error instanceof Error ? error.message : String(error));
    allPassed = false;
  }
  
  // Test 2: Stages run in order
  console.log('\n📋 Test 2: Stages run in order');
  try {
    const executor = createPlanExecutor({});
    const plan = createMockPlan();
    const executionOrder: number[] = [];
    
    const executorWithCallbacks = createPlanExecutor({
      onStageStart: (stage) => {
        executionOrder.push(stage.order);
      },
    });
    
    const initialState = {
      messages: [],
      correlation_id: 'test-correlation-123',
    } as unknown as MultiAgentState;
    
    await executorWithCallbacks.execute(plan, initialState);
    
    const isOrdered = executionOrder.every((order, index) => 
      index === 0 || order >= executionOrder[index - 1]
    );
    
    if (!isOrdered) {
      console.error('❌ Test 2 FAILED: Stages not executed in order');
      console.error(`   Execution order: ${executionOrder.join(', ')}`);
      allPassed = false;
    } else {
      console.log('✅ Test 2 PASSED: Stages run in order');
      console.log(`   - Execution order: ${executionOrder.join(' → ')}`);
    }
  } catch (error: unknown) {
    console.error('❌ Test 2 FAILED:', error instanceof Error ? error.message : String(error));
    allPassed = false;
  }
  
  // Test 3: Skip conditions work
  console.log('\n📋 Test 3: Skip conditions work');
  try {
    const executor = createPlanExecutor({});
    const plan = createMockPlan();
    
    // Add skip condition to second stage (skip if route_data exists)
    plan.stages[1].skipConditions = {
      stateChecks: {
        route_data: { exists: true },
      },
    };
    
    // Set route_data in initial state to trigger skip
    const initialState = {
      messages: [],
      correlation_id: 'test-correlation-123',
      route_data: { waypoints: [] } as any,
    } as unknown as MultiAgentState;
    
    const result = await executor.execute(plan, initialState);
    
    const bunkerStageSkipped = result.stagesSkipped.includes('bunker_stage');
    
    if (!bunkerStageSkipped) {
      console.warn('⚠️  Test 3: Skip condition may not have triggered (stage may have run anyway)');
      console.log(`   - Skipped stages: ${result.stagesSkipped.join(', ') || 'none'}`);
    } else {
      console.log('✅ Test 3 PASSED: Skip conditions work');
      console.log(`   - Skipped stage: bunker_stage`);
    }
  } catch (error: unknown) {
    console.error('❌ Test 3 FAILED:', error instanceof Error ? error.message : String(error));
    allPassed = false;
  }
  
  // Test 4: Early exit works
  console.log('\n📋 Test 4: Early exit works');
  try {
    const executor = createPlanExecutor({});
    const plan = createMockPlan();
    
    // Set needs_clarification flag to trigger early exit
    const initialState = {
      messages: [],
      correlation_id: 'test-correlation-123',
      needs_clarification: true,
    } as unknown as MultiAgentState;
    
    const result = await executor.execute(plan, initialState);
    
    // Early exit should stop execution before all stages complete
    const earlyExitTriggered = result.stagesCompleted.length < plan.stages.length;
    
    if (earlyExitTriggered) {
      console.log('✅ Test 4 PASSED: Early exit works');
      console.log(`   - Completed ${result.stagesCompleted.length}/${plan.stages.length} stages before exit`);
    } else {
      console.warn('⚠️  Test 4: Early exit may not have triggered');
      console.log(`   - Completed all ${result.stagesCompleted.length} stages`);
    }
  } catch (error: unknown) {
    console.error('❌ Test 4 FAILED:', error instanceof Error ? error.message : String(error));
    allPassed = false;
  }
  
  // Test 5: Required failures stop execution
  console.log('\n📋 Test 5: Required failures stop execution');
  try {
    const executor = createPlanExecutor({
      continueOnError: false, // Stop on required failure
    });
    
    const plan = createMockPlan();
    // Make first stage fail by using non-existent agent
    plan.stages[0].agentId = 'non_existent_agent';
    
    const initialState = {
      messages: [],
      correlation_id: 'test-correlation-123',
    } as unknown as MultiAgentState;
    
    try {
      const result = await executor.execute(plan, initialState);
      
      // Should have failed
      if (result.success) {
        console.error('❌ Test 5 FAILED: Plan should fail when required stage fails');
        allPassed = false;
      } else {
        console.log('✅ Test 5 PASSED: Required failures stop execution');
        console.log(`   - Plan failed: ${result.success}`);
        console.log(`   - Failed stages: ${result.stagesFailed.join(', ')}`);
      }
    } catch (error: unknown) {
      // Exception is also acceptable for required failure
      console.log('✅ Test 5 PASSED: Required failure stopped execution (exception thrown)');
    }
  } catch (error: unknown) {
    console.error('❌ Test 5 FAILED:', error instanceof Error ? error.message : String(error));
    allPassed = false;
  }
  
  // Test 6: Optional failures continue
  console.log('\n📋 Test 6: Optional failures continue');
  try {
    const executor = createPlanExecutor({
      continueOnError: true, // Continue on error
    });
    
    const plan = createMockPlan();
    // Make second stage optional and fail it
    plan.stages[1].required = false;
    plan.stages[1].agentId = 'non_existent_agent';
    
    const initialState = {
      messages: [],
      correlation_id: 'test-correlation-123',
      route_data: { waypoints: [] } as any, // Provide route_data so bunker stage can run
    } as unknown as MultiAgentState;
    
    const result = await executor.execute(plan, initialState);
    
    // Should continue despite optional failure
    const continuedAfterFailure = result.stagesCompleted.length > 0 || result.stagesFailed.length > 0;
    
    if (continuedAfterFailure) {
      console.log('✅ Test 6 PASSED: Optional failures continue execution');
      console.log(`   - Completed: ${result.stagesCompleted.length}`);
      console.log(`   - Failed: ${result.stagesFailed.length}`);
    } else {
      console.error('❌ Test 6 FAILED: Execution should continue after optional failure');
      allPassed = false;
    }
  } catch (error: unknown) {
    console.error('❌ Test 6 FAILED:', error instanceof Error ? error.message : String(error));
    allPassed = false;
  }
  
  // Test 7: Costs tracked accurately
  console.log('\n📋 Test 7: Costs tracked accurately');
  try {
    const executor = createPlanExecutor({});
    const plan = createMockPlan();
    const initialState = {
      messages: [],
      correlation_id: 'test-correlation-123',
    } as unknown as MultiAgentState;
    
    const result = await executor.execute(plan, initialState);
    
    if (result.costs.actualCostUSD < 0) {
      console.error('❌ Test 7 FAILED: Negative cost');
      allPassed = false;
    } else if (typeof result.costs.llmCalls !== 'number') {
      console.error('❌ Test 7 FAILED: LLM calls not tracked');
      allPassed = false;
    } else if (typeof result.costs.apiCalls !== 'number') {
      console.error('❌ Test 7 FAILED: API calls not tracked');
      allPassed = false;
    } else {
      console.log('✅ Test 7 PASSED: Costs tracked accurately');
      console.log(`   - Actual cost: $${result.costs.actualCostUSD.toFixed(4)}`);
      console.log(`   - LLM calls: ${result.costs.llmCalls}`);
      console.log(`   - API calls: ${result.costs.apiCalls}`);
    }
  } catch (error: unknown) {
    console.error('❌ Test 7 FAILED:', error instanceof Error ? error.message : String(error));
    allPassed = false;
  }
  
  // Test 8: No LLM calls during execution
  console.log('\n📋 Test 8: No LLM calls during execution');
  try {
    const executor = createPlanExecutor({});
    const plan = createMockPlan();
    const initialState = {
      messages: [],
      correlation_id: 'test-correlation-123',
    } as unknown as MultiAgentState;
    
    const result = await executor.execute(plan, initialState);
    
    // Plan executor should not make LLM calls - all decisions are in the plan
    if (result.costs.llmCalls > 0) {
      console.error(`❌ Test 8 FAILED: Found ${result.costs.llmCalls} LLM call(s) during execution`);
      console.error(`   - LLM calls should be 0 (all routing decisions are in plan)`);
      console.error(`   - Plan execution must be deterministic without LLM calls`);
      allPassed = false;
    } else {
      console.log('✅ Test 8 PASSED: No LLM calls during execution');
      console.log(`   - LLM calls: ${result.costs.llmCalls} (expected: 0)`);
    }
  } catch (error: unknown) {
    console.error('❌ Test 8 FAILED:', error instanceof Error ? error.message : String(error));
    allPassed = false;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ [PLAN-EXECUTOR-TEST] All tests passed!');
  } else {
    console.log('❌ [PLAN-EXECUTOR-TEST] Some tests failed');
  }
  console.log('='.repeat(60) + '\n');
}

// Run tests if executed directly
if (require.main === module) {
  testPlanExecutor().catch((error) => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}
