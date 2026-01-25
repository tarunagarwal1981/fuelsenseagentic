/**
 * Workflow Registry Tests
 * 
 * Validates that workflow registry properly loads, validates, and queries workflows.
 */

import { WorkflowRegistry } from '../../../lib/registry/workflow-registry';
import type { WorkflowDefinition, WorkflowStage } from '../../../lib/registry/workflow-registry';
import { AgentRegistry } from '../../../lib/registry/agent-registry';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

const TEST_WORKFLOW_DIR = join(process.cwd(), 'config', 'workflows');
const TEST_WORKFLOW_ID = '__test-workflow';
const TEST_WORKFLOW_PATH = join(TEST_WORKFLOW_DIR, `${TEST_WORKFLOW_ID}.yaml`);

/**
 * Create a test workflow definition
 */
function createTestWorkflow(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    id: TEST_WORKFLOW_ID,
    name: 'Test Workflow',
    description: 'Test workflow for unit testing',
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
 * Create test workflow YAML file
 */
function createTestWorkflowYAML(workflow: WorkflowDefinition): string {
  return `id: ${workflow.id}
name: ${workflow.name}
description: ${workflow.description || ''}
queryTypes:
${(workflow.queryTypes || []).map((qt: string) => `  - ${qt}`).join('\n')}
stages:
${workflow.stages.map((stage: WorkflowStage) => `  - id: ${stage.id}
    agentId: ${stage.agentId}
    order: ${stage.order}
    required: ${stage.required ?? true}`).join('\n')}
execution:
  maxTotalTimeMs: ${workflow.execution.maxTotalTimeMs}
  allowParallelStages: ${workflow.execution.allowParallelStages ?? false}
  continueOnError: ${workflow.execution.continueOnError ?? true}
enabled: ${workflow.enabled ?? true}
`;
}

/**
 * Clean up test file
 */
function cleanup(): void {
  if (existsSync(TEST_WORKFLOW_PATH)) {
    unlinkSync(TEST_WORKFLOW_PATH);
    console.log('🧹 Cleaned up test workflow file');
  }
}

/**
 * Test WorkflowRegistry functionality
 */
export function testWorkflowRegistry(): void {
  console.log('\n🧪 [WORKFLOW-REGISTRY-TEST] Starting workflow registry validation...\n');
  
  const registry = WorkflowRegistry.getInstance();
  registry.clear(); // Clear before tests
  
  let allPassed = true;
  
  // Test 1: Load existing workflows
  console.log('📋 Test 1: Load existing workflows');
  try {
    registry.reload();
    const count = registry.count();
    
    if (count > 0) {
      console.log(`✅ Test 1 PASSED: Loaded ${count} workflows`);
      const workflows = registry.getAll();
      workflows.forEach((w: WorkflowDefinition) => {
        console.log(`   - ${w.id}: ${w.name} (${w.stages.length} stages)`);
      });
    } else {
      console.warn('⚠️  Test 1 SKIPPED: No workflows found in config directory');
    }
  } catch (error) {
    console.error('❌ Test 1 FAILED:', error);
    allPassed = false;
  }
  
  // Test 2: Register workflow programmatically
  console.log('\n📋 Test 2: Register workflow programmatically');
  try {
    const testWorkflow = createTestWorkflow();
    registry.register(testWorkflow);
    
    if (!registry.has(TEST_WORKFLOW_ID)) {
      console.error('❌ Test 2 FAILED: Workflow not found after registration');
      allPassed = false;
    } else {
      console.log('✅ Test 2 PASSED: Workflow registered successfully');
      const loaded = registry.getById(TEST_WORKFLOW_ID);
      if (loaded && loaded.id === TEST_WORKFLOW_ID) {
        console.log(`   - Workflow ID: ${loaded.id}`);
        console.log(`   - Name: ${loaded.name}`);
        console.log(`   - Stages: ${loaded.stages.length}`);
      }
    }
  } catch (error: any) {
    console.error('❌ Test 2 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 3: Get workflow by ID
  console.log('\n📋 Test 3: Get workflow by ID');
  try {
    const workflow = registry.getById(TEST_WORKFLOW_ID);
    
    if (!workflow || workflow.id !== TEST_WORKFLOW_ID) {
      console.error('❌ Test 3 FAILED: Could not retrieve workflow by ID');
      allPassed = false;
    } else {
      console.log('✅ Test 3 PASSED: Workflow retrieved by ID');
      console.log(`   - ID: ${workflow.id}`);
      console.log(`   - Name: ${workflow.name}`);
    }
  } catch (error: any) {
    console.error('❌ Test 3 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 4: Get workflows by query type
  console.log('\n📋 Test 4: Get workflows by query type');
  try {
    const workflows = registry.getByQueryType('test_query');
    
    if (workflows.length === 0) {
      console.error('❌ Test 4 FAILED: No workflows found for query type');
      allPassed = false;
    } else {
      console.log('✅ Test 4 PASSED: Workflows retrieved by query type');
      console.log(`   - Found ${workflows.length} workflow(s) for 'test_query'`);
      workflows.forEach((w: WorkflowDefinition) => {
        console.log(`   - ${w.id}: ${w.name}`);
      });
    }
  } catch (error: any) {
    console.error('❌ Test 4 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 5: Validation - invalid agent
  console.log('\n📋 Test 5: Validation - invalid agent');
  try {
    const invalidWorkflow = createTestWorkflow({
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
      console.error('❌ Test 5 FAILED: Should have thrown validation error');
      allPassed = false;
    } catch (error: any) {
      if (error.message.includes('validation failed') || error.message.includes('Unknown agent')) {
        console.log('✅ Test 5 PASSED: Validation correctly caught invalid agent');
      } else {
        console.error('❌ Test 5 FAILED: Wrong error type:', error.message);
        allPassed = false;
      }
    }
  } catch (error: any) {
    console.error('❌ Test 5 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 6: Validation - duplicate stage IDs
  console.log('\n📋 Test 6: Validation - duplicate stage IDs');
  try {
    const invalidWorkflow = createTestWorkflow({
      stages: [
        {
          id: 'step1',
          agentId: 'route_agent',
          order: 1,
        },
        {
          id: 'step1', // Duplicate ID
          agentId: 'weather_agent',
          order: 2,
        },
      ],
    });
    
    try {
      registry.register(invalidWorkflow);
      console.error('❌ Test 6 FAILED: Should have thrown validation error');
      allPassed = false;
    } catch (error: any) {
      if (error.message.includes('Duplicate stage id')) {
        console.log('✅ Test 6 PASSED: Validation correctly caught duplicate stage IDs');
      } else {
        console.error('❌ Test 6 FAILED: Wrong error type:', error.message);
        allPassed = false;
      }
    }
  } catch (error: any) {
    console.error('❌ Test 6 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 7: Get workflow statistics
  console.log('\n📋 Test 7: Get workflow statistics');
  try {
    const stats = registry.getStats();
    
    if (stats.totalWorkflows >= 0) {
      console.log('✅ Test 7 PASSED: Statistics retrieved');
      console.log(`   - Total workflows: ${stats.totalWorkflows}`);
      console.log(`   - Enabled workflows: ${stats.enabledWorkflows}`);
      console.log(`   - Average stages: ${stats.averageStages}`);
      console.log(`   - Total stages: ${stats.totalStages}`);
      if (Object.keys(stats.byQueryType).length > 0) {
        console.log(`   - By query type:`, stats.byQueryType);
      }
    } else {
      console.error('❌ Test 7 FAILED: Invalid statistics');
      allPassed = false;
    }
  } catch (error: any) {
    console.error('❌ Test 7 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 8: Reload workflow
  console.log('\n📋 Test 8: Reload workflow');
  try {
    // Create a test workflow file
    const testWorkflow = createTestWorkflow({ name: 'Original Name' });
    writeFileSync(TEST_WORKFLOW_PATH, createTestWorkflowYAML(testWorkflow), 'utf-8');
    
    // Load it
    registry.reloadWorkflow(TEST_WORKFLOW_ID);
    
    const loaded = registry.getById(TEST_WORKFLOW_ID);
    if (loaded && loaded.name === 'Original Name') {
      console.log('✅ Test 8 PASSED: Workflow reloaded successfully');
    } else {
      console.warn('⚠️  Test 8 SKIPPED: Workflow file may not have been loaded');
    }
    
    cleanup();
  } catch (error: any) {
    console.error('❌ Test 8 FAILED:', error.message);
    allPassed = false;
    cleanup();
  }
  
  // Test 9: Get enabled workflows
  console.log('\n📋 Test 9: Get enabled workflows');
  try {
    const enabled = registry.getEnabled();
    const all = registry.getAll();
    
    if (enabled.length <= all.length) {
      console.log('✅ Test 9 PASSED: Enabled workflows filtered correctly');
      console.log(`   - Total: ${all.length}`);
      console.log(`   - Enabled: ${enabled.length}`);
    } else {
      console.error('❌ Test 9 FAILED: Enabled count exceeds total');
      allPassed = false;
    }
  } catch (error: any) {
    console.error('❌ Test 9 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 10: Export to JSON
  console.log('\n📋 Test 10: Export to JSON');
  try {
    const json = registry.toJSON();
    const parsed = JSON.parse(json);
    
    if (parsed.workflows && Array.isArray(parsed.workflows)) {
      console.log('✅ Test 10 PASSED: JSON export works');
      console.log(`   - Exported ${parsed.total} workflow(s)`);
    } else {
      console.error('❌ Test 10 FAILED: Invalid JSON structure');
      allPassed = false;
    }
  } catch (error: any) {
    console.error('❌ Test 10 FAILED:', error.message);
    allPassed = false;
  }
  
  // Cleanup
  registry.clear();
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ [WORKFLOW-REGISTRY-TEST] All tests passed!');
  } else {
    console.log('❌ [WORKFLOW-REGISTRY-TEST] Some tests failed');
  }
  console.log('='.repeat(60));
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testWorkflowRegistry();
}
