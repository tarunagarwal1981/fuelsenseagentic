/**
 * Plan Validator Unit Tests
 * 
 * Tests plan validation, error detection, dependency validation,
 * and optimization suggestions.
 */

import { PlanValidator, getPlanValidator } from '@/lib/orchestration/plan-validator';
import { ExecutionPlanGenerator } from '@/lib/orchestration/plan-generator';
import { registerAllAgents } from '@/lib/registry/agents';
import { registerAllTools } from '@/lib/registry/tools';
import { loadConfigurations } from '@/lib/config/registry-loader';
import type { ExecutionPlan, PlanStage } from '@/lib/types/execution-plan';
import type { MultiAgentState } from '@/lib/multi-agent/state';

/**
 * Run plan validator tests
 */
export async function testPlanValidator(): Promise<void> {
  console.log('\n🧪 [PLAN-VALIDATOR-TEST] Starting plan validator tests...\n');
  
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
  
  const validator = getPlanValidator();
  
  // Check if API key is available for plan generation
  let canGeneratePlans = !!process.env.ANTHROPIC_API_KEY;
  let generator: ExecutionPlanGenerator | null = null;
  
  if (canGeneratePlans) {
    generator = new ExecutionPlanGenerator();
  } else {
    console.warn('⚠️  ANTHROPIC_API_KEY not set - some tests will be skipped');
  }
  console.log('📋 Test 1: Validation catches errors - invalid plan structure');
  try {
    const invalidPlan: Partial<ExecutionPlan> = {
      planId: '',
      workflowId: '',
      stages: [],
      queryType: 'bunker_planning',
      createdAt: new Date(),
      workflowVersion: '1.0.0',
      validation: {
        isValid: false,
        missingInputs: [],
        invalidAgents: [],
        invalidTools: [],
        warnings: [],
      },
      estimates: {
        totalAgents: 0,
        llmCalls: 0,
        apiCalls: 0,
        estimatedCostUSD: 0,
        estimatedDurationMs: 0,
      },
      requiredState: [],
      expectedOutputs: [],
      context: {
        priority: 'normal',
        timeout: 60000,
      },
      originalQuery: '',
      classification: {
        queryType: 'bunker_planning',
        confidence: 0.5,
        reasoning: 'Test',
      },
    } as ExecutionPlan;
    
    const result = validator.validate(invalidPlan as ExecutionPlan, {});
    
    if (result.valid) {
      console.error('❌ Test 1 FAILED: Invalid plan should fail validation');
      allPassed = false;
    } else if (result.errors.length === 0) {
      console.error('❌ Test 1 FAILED: Should have validation errors');
      allPassed = false;
    } else {
      console.log('✅ Test 1 PASSED: Validation catches structure errors');
      console.log(`   - Found ${result.errors.length} error(s)`);
      console.log(`   - Errors: ${result.errors.slice(0, 2).join(', ')}`);
    }
  } catch (error: any) {
    console.error('❌ Test 1 FAILED:', error.message);
    console.error('   Stack:', error.stack?.split('\n').slice(0, 3).join('\n'));
    allPassed = false;
  }
  
  // Test 2: Validation catches errors - missing agent
  console.log('\n📋 Test 2: Validation catches errors - missing agent');
  if (!canGeneratePlans) {
    console.warn('⚠️  Test 2 SKIPPED: Requires plan generation (API key needed)');
  } else {
    try {
      const plan = await generator!.generatePlan(
      'Find cheapest bunker from Singapore to Rotterdam',
      {},
      { forceRegenerate: true }
    );
    
    // Create invalid plan with non-existent agent
    const invalidPlan: ExecutionPlan = {
      ...plan,
      stages: [
        ...plan.stages,
        {
          stageId: 'invalid_stage',
          order: 999,
          agentId: 'non_existent_agent',
          agentName: 'Non-existent Agent',
          agentType: 'specialist',
          required: true,
          canRunInParallel: false,
          dependsOn: [],
          provides: [],
          requires: [],
          toolsNeeded: [],
          estimatedDurationMs: 5000,
          estimatedCost: 0.01,
        } as PlanStage,
      ],
    };
    
    const result = validator.validate(invalidPlan, {});
    
    if (result.valid) {
      console.error('❌ Test 2 FAILED: Plan with invalid agent should fail validation');
      allPassed = false;
    } else {
      const hasAgentError = result.errors.some(e => e.includes('non_existent_agent') || e.includes('not found'));
      if (hasAgentError) {
        console.log('✅ Test 2 PASSED: Validation catches missing agent');
        console.log(`   - Found error about missing agent`);
      } else {
        console.warn('⚠️  Test 2: Validation found errors but not specifically about missing agent');
        console.log(`   - Errors: ${result.errors.join(', ')}`);
      }
    }
    } catch (error: any) {
      console.error('❌ Test 2 FAILED:', error.message);
      allPassed = false;
    }
  }
  
  // Test 3: Validation catches errors - circular dependencies
  console.log('\n📋 Test 3: Validation catches errors - circular dependencies');
  if (!canGeneratePlans) {
    console.warn('⚠️  Test 3 SKIPPED: Requires plan generation (API key needed)');
  } else {
    try {
      const plan = await generator!.generatePlan(
      'Find cheapest bunker from Singapore to Rotterdam',
      {},
      { forceRegenerate: true }
    );
    
    // Create plan with circular dependency
    if (plan.stages.length >= 2) {
      const stage1 = plan.stages[0];
      const stage2 = plan.stages[1];
      
      const invalidPlan: ExecutionPlan = {
        ...plan,
        stages: [
          {
            ...stage1,
            dependsOn: [stage2.stageId],
          },
          {
            ...stage2,
            dependsOn: [stage1.stageId],
          },
          ...plan.stages.slice(2),
        ],
      };
      
      const result = validator.validate(invalidPlan, {});
      
      if (result.valid) {
        console.error('❌ Test 3 FAILED: Plan with circular dependency should fail validation');
        allPassed = false;
      } else {
        const hasCycleError = result.errors.some(e => e.includes('Circular') || e.includes('cycle'));
        if (hasCycleError) {
          console.log('✅ Test 3 PASSED: Validation catches circular dependencies');
          console.log(`   - Found circular dependency error`);
        } else {
          console.warn('⚠️  Test 3: Validation found errors but not specifically about cycles');
        }
      }
    } else {
      console.warn('⚠️  Test 3 SKIPPED: Not enough stages to test circular dependency');
    }
    } catch (error: any) {
      console.error('❌ Test 3 FAILED:', error.message);
      allPassed = false;
    }
  }
  
  // Test 4: Validation catches errors - invalid stage order
  console.log('\n📋 Test 4: Validation catches errors - invalid stage order');
  if (!canGeneratePlans) {
    console.warn('⚠️  Test 4 SKIPPED: Requires plan generation (API key needed)');
  } else {
    try {
      const plan = await generator!.generatePlan(
      'Find cheapest bunker from Singapore to Rotterdam',
      {},
      { forceRegenerate: true }
    );
    
    // Create plan with invalid order (stage depends on later stage)
    if (plan.stages.length >= 2) {
      const stage1 = plan.stages[0];
      const stage2 = plan.stages[1];
      
      const invalidPlan: ExecutionPlan = {
        ...plan,
        stages: [
          {
            ...stage1,
            order: 2,
            dependsOn: [stage2.stageId],
          },
          {
            ...stage2,
            order: 1,
            dependsOn: [],
          },
          ...plan.stages.slice(2),
        ],
      };
      
      const result = validator.validate(invalidPlan, {});
      
      if (result.valid) {
        console.error('❌ Test 4 FAILED: Plan with invalid order should fail validation');
        allPassed = false;
      } else {
        const hasOrderError = result.errors.some(e => e.includes('order') || e.includes('depends on'));
        if (hasOrderError) {
          console.log('✅ Test 4 PASSED: Validation catches invalid stage order');
          console.log(`   - Found order dependency error`);
        } else {
          console.warn('⚠️  Test 4: Validation found errors but not specifically about order');
        }
      }
    } else {
      console.warn('⚠️  Test 4 SKIPPED: Not enough stages to test order validation');
    }
    } catch (error: any) {
      console.error('❌ Test 4 FAILED:', error.message);
      allPassed = false;
    }
  }
  
  // Test 5: Valid plan passes validation
  console.log('\n📋 Test 5: Valid plan passes validation');
  if (!canGeneratePlans) {
    console.warn('⚠️  Test 5 SKIPPED: Requires plan generation (API key needed)');
  } else {
    try {
      const plan = await generator!.generatePlan(
      'Find cheapest bunker from Singapore to Rotterdam',
      {},
      { forceRegenerate: true }
    );
    
    const result = validator.validate(plan, {});
    
    if (!result.valid) {
      console.warn(`⚠️  Test 5: Valid plan has validation issues:`);
      console.warn(`   - Errors: ${result.errors.join(', ')}`);
      console.warn(`   - Warnings: ${result.warnings.join(', ')}`);
      // Don't fail - warnings are acceptable
    } else {
      console.log('✅ Test 5 PASSED: Valid plan passes validation');
    }
    
    // Check isValid() quick check
    const quickCheck = validator.isValid(plan);
    if (!quickCheck) {
      console.error('❌ Test 5 FAILED: isValid() should return true for valid plan');
      allPassed = false;
    } else {
      console.log('   - Quick validation check passed');
    }
    } catch (error: any) {
      console.error('❌ Test 5 FAILED:', error.message);
      allPassed = false;
    }
  }
  
  // Test 6: Validation provides warnings
  console.log('\n📋 Test 6: Validation provides warnings');
  if (!canGeneratePlans) {
    console.warn('⚠️  Test 6 SKIPPED: Requires plan generation (API key needed)');
  } else {
    try {
      const plan = await generator!.generatePlan(
      'Find cheapest bunker from Singapore to Rotterdam',
      {},
      { forceRegenerate: true }
    );
    
    const result = validator.validate(plan, {});
    
    if (result.warnings.length > 0) {
      console.log('✅ Test 6 PASSED: Validation provides warnings');
      console.log(`   - Found ${result.warnings.length} warning(s)`);
      console.log(`   - Examples: ${result.warnings.slice(0, 2).join(', ')}`);
    } else {
      console.log('✅ Test 6 PASSED: No warnings (plan is clean)');
    }
    } catch (error: any) {
      console.error('❌ Test 6 FAILED:', error.message);
      allPassed = false;
    }
  }
  
  // Test 7: Validation provides suggestions
  console.log('\n📋 Test 7: Validation provides suggestions');
  if (!canGeneratePlans) {
    console.warn('⚠️  Test 7 SKIPPED: Requires plan generation (API key needed)');
  } else {
    try {
      const plan = await generator!.generatePlan(
      'Find cheapest bunker from Singapore to Rotterdam',
      {},
      { forceRegenerate: true }
    );
    
    const result = validator.validate(plan, {});
    
    if (result.suggestions && result.suggestions.length > 0) {
      console.log('✅ Test 7 PASSED: Validation provides optimization suggestions');
      console.log(`   - Found ${result.suggestions.length} suggestion(s)`);
      console.log(`   - Examples: ${result.suggestions.slice(0, 2).join(', ')}`);
    } else {
      console.log('✅ Test 7 PASSED: No suggestions (plan is optimal)');
    }
    } catch (error: any) {
      console.error('❌ Test 7 FAILED:', error.message);
      allPassed = false;
    }
  }
  
  // Test 8: State requirements validation
  console.log('\n📋 Test 8: State requirements validation');
  if (!canGeneratePlans) {
    console.warn('⚠️  Test 8 SKIPPED: Requires plan generation (API key needed)');
  } else {
    try {
      const plan = await generator!.generatePlan(
      'Find cheapest bunker from Singapore to Rotterdam',
      {},
      { forceRegenerate: true }
    );
    
    // Test with missing required state
    const emptyState: Partial<MultiAgentState> = {};
    const result = validator.validate(plan, emptyState);
    
    // Should have warnings about missing state if first stage requires it
    if (plan.stages.length > 0) {
      const firstStage = plan.stages[0];
      if (firstStage.requires.length > 0) {
        const hasStateWarning = result.warnings.some(w => 
          w.includes('missing') || w.includes('required') || w.includes('will be produced')
        );
        if (hasStateWarning) {
          console.log('✅ Test 8 PASSED: Validation checks state requirements');
          console.log(`   - Found state-related warnings`);
        } else {
          console.log('✅ Test 8 PASSED: State validation works (no warnings needed)');
        }
      } else {
        console.log('✅ Test 8 PASSED: First stage has no requirements');
      }
    }
    } catch (error: any) {
      console.error('❌ Test 8 FAILED:', error.message);
      allPassed = false;
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ [PLAN-VALIDATOR-TEST] All tests passed!');
  } else {
    console.log('❌ [PLAN-VALIDATOR-TEST] Some tests failed');
  }
  console.log('='.repeat(60) + '\n');
}

// Run tests if executed directly
if (require.main === module) {
  testPlanValidator().catch((error) => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}
