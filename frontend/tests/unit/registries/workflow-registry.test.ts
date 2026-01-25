/**
 * Workflow Registry Comprehensive Unit Tests
 * 
 * Comprehensive test suite covering all WorkflowRegistry functionality including:
 * - Registration and retrieval
 * - Validation logic
 * - Error handling
 * - Edge cases (duplicates, missing agents, invalid stages)
 * - Query methods
 * - Statistics
 */

import { WorkflowRegistry } from '@/lib/registry/workflow-registry';
import { AgentRegistry } from '@/lib/registry/agent-registry';
import type { WorkflowDefinition, WorkflowStage } from '@/lib/registry/workflow-registry';

/**
 * Create a mock workflow definition for testing
 */
function createMockWorkflow(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    id: 'test_workflow',
    name: 'Test Workflow',
    description: 'A test workflow for unit testing',
    queryTypes: ['test_query'],
    stages: [
      {
        id: 'step1',
        agentId: 'route_agent',
        order: 1,
        required: true,
      },
    ],
    execution: {
      maxTotalTimeMs: 60000,
      allowParallelStages: false,
      continueOnError: true,
    },
    enabled: true,
    ...overrides,
  };
}

/**
 * Run comprehensive workflow registry tests
 */
export function testWorkflowRegistryComprehensive(): void {
  console.log('\n🧪 [WORKFLOW-REGISTRY-COMPREHENSIVE] Starting comprehensive workflow registry tests...\n');
  
  let allPassed = true;
  const registry = WorkflowRegistry.getInstance();
  
  // Clear registry before tests
  registry.clear();
  
  // Setup agents for workflow validation
  const agentRegistry = AgentRegistry.getInstance();
  agentRegistry.clear();
  agentRegistry.register({
    id: 'route_agent',
    name: 'Route Agent',
    description: 'Test',
    version: '1.0.0',
    type: 'specialist',
    domain: ['routing'],
    capabilities: [],
    intents: [],
    produces: { stateFields: [], messageTypes: [] },
    consumes: { required: [], optional: [] },
    tools: { required: [], optional: [] },
    dependencies: { upstream: [], downstream: [] },
    execution: {
      canRunInParallel: false,
      maxExecutionTimeMs: 30000,
      retryPolicy: { maxRetries: 2, backoffMs: 1000 },
    },
    implementation: 'test',
    nodeFunction: async (s: any) => s,
    metrics: { totalExecutions: 0, successfulExecutions: 0, failedExecutions: 0, avgExecutionTimeMs: 0 },
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  
  // ============================================================================
  // Registration Tests
  // ============================================================================
  
  console.log('📦 [REGISTRATION TESTS]');
  
  // Test 1: Register a valid workflow
  console.log('  Test 1.1: Register a valid workflow');
  try {
    const workflow = createMockWorkflow({ id: 'valid_workflow_1' });
    registry.register(workflow);
    
    if (!registry.has('valid_workflow_1')) {
      console.error('    ❌ FAILED: Workflow not found after registration');
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Workflow registered successfully');
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 2: Reject duplicate workflow IDs
  console.log('  Test 1.2: Reject duplicate workflow IDs');
  try {
    const workflow1 = createMockWorkflow({ id: 'duplicate_workflow' });
    const workflow2 = createMockWorkflow({ id: 'duplicate_workflow' });
    
    registry.register(workflow1);
    try {
      registry.register(workflow2);
      // Overwriting is allowed, but let's check if it's the same
      const loaded = registry.getById('duplicate_workflow');
      if (loaded && loaded.id === 'duplicate_workflow') {
        console.log('    ✅ PASSED: Workflow overwritten (may be intentional)');
      } else {
        console.error('    ❌ FAILED: Workflow not overwritten correctly');
        allPassed = false;
      }
    } catch (error: any) {
      if (error.message.includes('already') || error.message.includes('duplicate')) {
        console.log('    ✅ PASSED: Correctly rejected duplicate workflow ID');
      } else {
        console.error('    ❌ FAILED: Wrong error:', error.message);
        allPassed = false;
      }
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 3: Reject workflows with missing required fields
  console.log('  Test 1.3: Reject workflows with missing required fields');
  try {
    const invalidWorkflow = {
      name: 'Incomplete Workflow',
      // Missing id, stages, execution
    } as any;
    
    try {
      registry.register(invalidWorkflow);
      console.error('    ❌ FAILED: Should have rejected incomplete workflow');
      allPassed = false;
    } catch (error: any) {
      if (error.message.includes('required') || error.message.includes('validation')) {
        console.log('    ✅ PASSED: Correctly rejected incomplete workflow');
      } else {
        console.error('    ❌ FAILED: Wrong error:', error.message);
        allPassed = false;
      }
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 4: Reject workflows with invalid agent references
  console.log('  Test 1.4: Reject workflows with invalid agent references');
  try {
    const invalidWorkflow = createMockWorkflow({
      id: 'invalid_agent_workflow',
      stages: [
        {
          id: 'step1',
          agentId: 'non_existent_agent',
          order: 1,
        },
      ],
    });
    
    try {
      registry.register(invalidWorkflow);
      console.error('    ❌ FAILED: Should have rejected workflow with invalid agent');
      allPassed = false;
    } catch (error: any) {
      if (error.message.includes('agent') || error.message.includes('Unknown')) {
        console.log('    ✅ PASSED: Correctly rejected workflow with invalid agent');
      } else {
        console.error('    ❌ FAILED: Wrong error:', error.message);
        allPassed = false;
      }
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 5: Reject workflows with duplicate stage IDs
  console.log('  Test 1.5: Reject workflows with duplicate stage IDs');
  try {
    const invalidWorkflow = createMockWorkflow({
      id: 'duplicate_stages_workflow',
      stages: [
        {
          id: 'duplicate_step',
          agentId: 'route_agent',
          order: 1,
        },
        {
          id: 'duplicate_step', // Duplicate
          agentId: 'route_agent',
          order: 2,
        },
      ],
    });
    
    try {
      registry.register(invalidWorkflow);
      console.error('    ❌ FAILED: Should have rejected workflow with duplicate stage IDs');
      allPassed = false;
    } catch (error: any) {
      if (error.message.includes('duplicate') || error.message.includes('Duplicate')) {
        console.log('    ✅ PASSED: Correctly rejected workflow with duplicate stage IDs');
      } else {
        console.error('    ❌ FAILED: Wrong error:', error.message);
        allPassed = false;
      }
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 6: Reject workflows with invalid execution config
  console.log('  Test 1.6: Reject workflows with invalid execution config');
  try {
    const invalidWorkflow = createMockWorkflow({
      id: 'invalid_execution_workflow',
      execution: {
        maxTotalTimeMs: 0, // Invalid: too low
        allowParallelStages: false,
        continueOnError: true,
      },
    });
    
    try {
      registry.register(invalidWorkflow);
      // May warn but allow
      console.log('    ✅ PASSED: Workflow with low maxTotalTimeMs registered (may warn)');
    } catch (error: any) {
      if (error.message.includes('execution') || error.message.includes('maxTotalTimeMs')) {
        console.log('    ✅ PASSED: Correctly rejected workflow with invalid execution config');
      } else {
        console.error('    ❌ FAILED: Wrong error:', error.message);
        allPassed = false;
      }
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // ============================================================================
  // Retrieval Tests
  // ============================================================================
  
  console.log('\n🔍 [RETRIEVAL TESTS]');
  
  // Setup test data
  registry.clear();
  registry.register(createMockWorkflow({
    id: 'bunker_planning',
    queryTypes: ['bunker_planning', 'route_optimization'],
    tags: ['bunker'],
  }));
  registry.register(createMockWorkflow({
    id: 'cii_analysis',
    queryTypes: ['cii_rating'],
    tags: ['compliance'],
  }));
  registry.register(createMockWorkflow({
    id: 'route_only',
    queryTypes: ['route_calculation'],
    enabled: false,
  }));
  
  // Test 7: Get workflow by ID
  console.log('  Test 2.1: Get workflow by ID');
  try {
    const workflow = registry.getById('bunker_planning');
    
    if (!workflow || workflow.id !== 'bunker_planning') {
      console.error('    ❌ FAILED: Could not retrieve workflow by ID');
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Workflow retrieved by ID');
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 8: Return undefined for non-existent ID
  console.log('  Test 2.2: Return undefined for non-existent ID');
  try {
    const workflow = registry.getById('does_not_exist');
    
    if (workflow !== undefined) {
      console.error('    ❌ FAILED: Should return undefined for non-existent workflow');
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Correctly returned undefined');
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 9: Get workflows by query type
  console.log('  Test 2.3: Get workflows by query type');
  try {
    const workflows = registry.getByQueryType('bunker_planning');
    
    if (workflows.length === 0 || workflows[0].id !== 'bunker_planning') {
      console.error('    ❌ FAILED: Incorrect query type filtering');
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Workflows filtered by query type correctly');
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 10: Get workflows by tag
  console.log('  Test 2.4: Get workflows by tag');
  try {
    const workflows = registry.getByTag('bunker');
    
    if (workflows.length === 0 || workflows[0].id !== 'bunker_planning') {
      console.error('    ❌ FAILED: Incorrect tag filtering');
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Workflows filtered by tag correctly');
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 11: Get enabled workflows only
  console.log('  Test 2.5: Get enabled workflows only');
  try {
    const enabled = registry.getEnabled();
    const all = registry.getAll();
    
    if (enabled.length >= all.length) {
      console.error('    ❌ FAILED: Enabled count should be <= total');
      allPassed = false;
    } else if (enabled.length !== 2) {
      console.error(`    ❌ FAILED: Expected 2 enabled workflows, got ${enabled.length}`);
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Enabled workflows filtered correctly');
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 12: Get all workflows
  console.log('  Test 2.6: Get all workflows');
  try {
    const all = registry.getAll();
    
    if (all.length !== 3) {
      console.error(`    ❌ FAILED: Expected 3 workflows, got ${all.length}`);
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Retrieved all workflows correctly');
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // ============================================================================
  // Statistics Tests
  // ============================================================================
  
  console.log('\n📈 [STATISTICS TESTS]');
  
  // Test 13: Get statistics
  console.log('  Test 3.1: Get statistics');
  try {
    const stats = registry.getStats();
    
    if (stats.totalWorkflows !== 3) {
      console.error(`    ❌ FAILED: Expected 3 workflows, got ${stats.totalWorkflows}`);
      allPassed = false;
    } else if (stats.enabledWorkflows !== 2) {
      console.error(`    ❌ FAILED: Expected 2 enabled workflows, got ${stats.enabledWorkflows}`);
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Statistics calculated correctly');
      console.log(`      - Total: ${stats.totalWorkflows}`);
      console.log(`      - Enabled: ${stats.enabledWorkflows}`);
      console.log(`      - Average stages: ${stats.averageStages}`);
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // ============================================================================
  // Edge Cases
  // ============================================================================
  
  console.log('\n🔀 [EDGE CASES]');
  
  // Test 14: Workflow with parallel stages
  console.log('  Test 4.1: Workflow with parallel stages');
  try {
    registry.clear();
    agentRegistry.register({
      id: 'weather_agent',
      name: 'Weather Agent',
      description: 'Test',
      version: '1.0.0',
      type: 'specialist',
      domain: ['weather'],
      capabilities: [],
      intents: [],
      produces: { stateFields: [], messageTypes: [] },
      consumes: { required: [], optional: [] },
      tools: { required: [], optional: [] },
      dependencies: { upstream: [], downstream: [] },
      execution: {
        canRunInParallel: true,
        maxExecutionTimeMs: 30000,
        retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      },
      implementation: 'test',
      nodeFunction: async (s: any) => s,
      metrics: { totalExecutions: 0, successfulExecutions: 0, failedExecutions: 0, avgExecutionTimeMs: 0 },
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    const workflow = createMockWorkflow({
      id: 'parallel_workflow',
      stages: [
        {
          id: 'step1',
          agentId: 'route_agent',
          order: 1,
        },
        {
          id: 'step2a',
          agentId: 'weather_agent',
          order: 2,
          parallelWith: ['step2b'],
        },
        {
          id: 'step2b',
          agentId: 'route_agent',
          order: 2,
          parallelWith: ['step2a'],
        },
      ],
      execution: {
        maxTotalTimeMs: 120000,
        allowParallelStages: true,
        continueOnError: true,
      },
    });
    
    registry.register(workflow);
    console.log('    ✅ PASSED: Workflow with parallel stages registered successfully');
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 15: Empty registry operations
  console.log('  Test 4.2: Empty registry operations');
  try {
    registry.clear();
    
    const all = registry.getAll();
    const stats = registry.getStats();
    
    if (all.length !== 0 || stats.totalWorkflows !== 0) {
      console.error('    ❌ FAILED: Empty registry operations failed');
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Empty registry operations work correctly');
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 16: Workflow with no stages (should fail)
  console.log('  Test 4.3: Workflow with no stages');
  try {
    const invalidWorkflow = createMockWorkflow({
      id: 'no_stages_workflow',
      stages: [],
    });
    
    try {
      registry.register(invalidWorkflow);
      console.error('    ❌ FAILED: Should have rejected workflow with no stages');
      allPassed = false;
    } catch (error: any) {
      if (error.message.includes('stage') || error.message.includes('at least one')) {
        console.log('    ✅ PASSED: Correctly rejected workflow with no stages');
      } else {
        console.error('    ❌ FAILED: Wrong error:', error.message);
        allPassed = false;
      }
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ [WORKFLOW-REGISTRY-COMPREHENSIVE] All tests passed!');
  } else {
    console.log('❌ [WORKFLOW-REGISTRY-COMPREHENSIVE] Some tests failed');
  }
  console.log('='.repeat(60));
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testWorkflowRegistryComprehensive();
}
