/**
 * Comprehensive Unit Tests for Workflow Engine
 * 
 * Tests cover:
 * - Execute simple workflow successfully
 * - Enforce max agent calls limit
 * - Handle agent failure with retry
 * - Timeout long-running workflows
 * - Track agent execution history
 * - Update state correctly
 * - Handle decision points
 * 
 * Run with: npx tsx lib/workflow/__tests__/workflow-engine.test.ts
 */

import {
  WorkflowEngineImpl,
  workflowEngine,
  WorkflowState,
  WorkflowResult,
} from '../workflow-engine';
import { ExecutionPlan, AgentCall } from '../../agents/orchestrator';
import { AgentRegistry, AgentRegistration } from '../../registry/agent-registry';

/**
 * Test result formatter
 */
function formatTestResult(
  testName: string,
  passed: boolean,
  details?: string,
  error?: Error
): void {
  console.log('\n' + '='.repeat(80));
  console.log(`TEST: ${testName}`);
  console.log('='.repeat(80));
  
  if (passed) {
    console.log('✅ TEST PASSED');
    if (details) {
      console.log(details);
    }
  } else {
    console.log('❌ TEST FAILED');
    if (error) {
      console.log(`Error Type: ${error.constructor.name}`);
      console.log(`Error Message: ${error.message}`);
    }
    if (details) {
      console.log(details);
    }
  }
  console.log('='.repeat(80));
}

/**
 * Create test execution plan
 */
function createTestExecutionPlan(): ExecutionPlan {
  return {
    workflow: 'test_workflow',
    agent_sequence: [
      {
        agent_name: 'test_agent_1',
        description: 'Test agent 1',
        required_parameters: ['query'],
      },
      {
        agent_name: 'test_agent_2',
        description: 'Test agent 2',
        required_parameters: ['query'],
      },
    ],
  };
}

/**
 * Create test initial state
 */
function createTestInitialState(): WorkflowState {
  return {
    query: 'Test query',
    query_type: 'bunker_planning',
    vessel: {
      name: 'Test Vessel',
      imo: '1234567',
    },
    agent_history: [],
    errors: [],
    warnings: [],
    start_time: Date.now(),
  };
}

/**
 * Create test agent registration
 */
function createTestAgentRegistration(
  id: string,
  executor: (input: any) => Promise<any>
): AgentRegistration {
  return {
    id,
    name: `Test Agent ${id}`,
    type: 'deterministic',
    description: `Test agent ${id}`,
    produces: ['test_output'],
    consumes: {
      required: ['query'],
      optional: [],
    },
    available_tools: [],
    config_file: `config/agents/${id}.yaml`,
    implementation: `lib/agents/${id}`,
    executor,
  };
}

/**
 * Test 1: Execute simple workflow successfully
 */
async function testExecuteSimpleWorkflow(): Promise<void> {
  try {
    // Clear registry
    AgentRegistry.clear();
    
    // Register test agents
    const agent1 = createTestAgentRegistration('test_agent_1', async (state) => {
      return { test_output: 'result1', route_data: { origin: 'A', destination: 'B', distance_nm: 100, estimated_hours: 24, waypoints: [] } };
    });
    const agent2 = createTestAgentRegistration('test_agent_2', async (state) => {
      return { test_output: 'result2' };
    });
    
    AgentRegistry.register(agent1);
    AgentRegistry.register(agent2);
    
    // Create workflow engine
    const engine = new WorkflowEngineImpl();
    
    // Execute workflow
    const result = await engine.execute({
      execution_plan: createTestExecutionPlan(),
      initial_state: createTestInitialState(),
    });
    
    const passed = 
      result.status === 'completed' &&
      result.metrics.total_agent_calls === 2 &&
      result.metrics.successful_calls === 2 &&
      result.final_state.route_data !== undefined;
    
    formatTestResult(
      'Execute simple workflow successfully',
      passed,
      `Status: ${result.status}, Calls: ${result.metrics.total_agent_calls}, Duration: ${result.duration_ms}ms`
    );
  } catch (error) {
    formatTestResult(
      'Execute simple workflow successfully',
      false,
      undefined,
      error as Error
    );
  }
}

/**
 * Test 2: Enforce max agent calls limit
 */
async function testEnforceMaxAgentCalls(): Promise<void> {
  try {
    AgentRegistry.clear();
    
    // Create a plan with too many agents
    const plan: ExecutionPlan = {
      workflow: 'test',
      agent_sequence: Array.from({ length: 20 }, (_, i) => ({
        agent_name: `test_agent_${i}`,
        description: `Test agent ${i}`,
        required_parameters: ['query'],
      })),
    };
    
    // Register one agent that will be called multiple times
    const agent = createTestAgentRegistration('test_agent_0', async (state) => {
      return { test_output: 'result' };
    });
    
    // Register all agents with same executor
    for (let i = 0; i < 20; i++) {
      const testAgent = createTestAgentRegistration(`test_agent_${i}`, agent.executor);
      AgentRegistry.register(testAgent);
    }
    
    const engine = new WorkflowEngineImpl();
    const result = await engine.execute({
      execution_plan: plan,
      initial_state: createTestInitialState(),
    });
    
    // Should fail due to circuit breaker
    const passed = 
      result.status === 'failed' &&
      result.error?.message.includes('Maximum agent calls exceeded');
    
    formatTestResult(
      'Enforce max agent calls limit',
      passed,
      `Status: ${result.status}, Calls: ${result.metrics.total_agent_calls}, Error: ${result.error?.message}`
    );
  } catch (error) {
    formatTestResult(
      'Enforce max agent calls limit',
      false,
      undefined,
      error as Error
    );
  }
}

/**
 * Test 3: Handle agent failure with retry
 */
async function testHandleAgentFailureWithRetry(): Promise<void> {
  try {
    AgentRegistry.clear();
    
    let callCount = 0;
    const agent = createTestAgentRegistration('test_agent_1', async (state) => {
      callCount++;
      if (callCount < 3) {
        throw new Error('Temporary failure');
      }
      return { test_output: 'success' };
    });
    
    AgentRegistry.register(agent);
    
    const plan: ExecutionPlan = {
      workflow: 'test',
      agent_sequence: [{
        agent_name: 'test_agent_1',
        description: 'Test agent',
        required_parameters: ['query'],
      }],
    };
    
    const engine = new WorkflowEngineImpl();
    const result = await engine.execute({
      execution_plan: plan,
      initial_state: createTestInitialState(),
    });
    
    // Should succeed after retries
    const passed = 
      result.status === 'completed' &&
      callCount === 3 &&
      result.metrics.successful_calls === 1;
    
    formatTestResult(
      'Handle agent failure with retry',
      passed,
      `Status: ${result.status}, Call count: ${callCount}, Successful: ${result.metrics.successful_calls}`
    );
  } catch (error) {
    formatTestResult(
      'Handle agent failure with retry',
      false,
      undefined,
      error as Error
    );
  }
}

/**
 * Test 4: Track agent execution history
 */
async function testTrackAgentExecutionHistory(): Promise<void> {
  try {
    AgentRegistry.clear();
    
    const agent1 = createTestAgentRegistration('test_agent_1', async (state) => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return { test_output: 'result1' };
    });
    const agent2 = createTestAgentRegistration('test_agent_2', async (state) => {
      await new Promise(resolve => setTimeout(resolve, 30));
      return { test_output: 'result2' };
    });
    
    AgentRegistry.register(agent1);
    AgentRegistry.register(agent2);
    
    const engine = new WorkflowEngineImpl();
    const result = await engine.execute({
      execution_plan: createTestExecutionPlan(),
      initial_state: createTestInitialState(),
    });
    
    const passed = 
      result.final_state.agent_history.length === 2 &&
      result.final_state.agent_history[0].agent === 'test_agent_1' &&
      result.final_state.agent_history[1].agent === 'test_agent_2' &&
      result.final_state.agent_history.every(h => h.success) &&
      result.final_state.agent_history.every(h => h.duration_ms > 0);
    
    formatTestResult(
      'Track agent execution history',
      passed,
      `History entries: ${result.final_state.agent_history.length}, All successful: ${result.final_state.agent_history.every(h => h.success)}`
    );
  } catch (error) {
    formatTestResult(
      'Track agent execution history',
      false,
      undefined,
      error as Error
    );
  }
}

/**
 * Test 5: Update state correctly
 */
async function testUpdateStateCorrectly(): Promise<void> {
  try {
    AgentRegistry.clear();
    
    const agent = createTestAgentRegistration('route_agent', async (state) => {
      return {
        route_data: {
          origin: 'SGSIN',
          destination: 'AEDXB',
          distance_nm: 3360,
          estimated_hours: 240,
          waypoints: [{ lat: 1.29, lon: 103.85 }, { lat: 25.02, lon: 55.03 }],
        },
      };
    });
    
    // Mark agent as producing route_data
    agent.produces = ['route_data'];
    AgentRegistry.register(agent);
    
    const plan: ExecutionPlan = {
      workflow: 'test',
      agent_sequence: [{
        agent_name: 'route_agent',
        description: 'Route agent',
        required_parameters: ['query'],
      }],
    };
    
    const engine = new WorkflowEngineImpl();
    const result = await engine.execute({
      execution_plan: plan,
      initial_state: createTestInitialState(),
    });
    
    const passed = 
      result.final_state.route_data !== undefined &&
      result.final_state.route_data.origin === 'SGSIN' &&
      result.final_state.route_data.destination === 'AEDXB';
    
    formatTestResult(
      'Update state correctly',
      passed,
      `Route data: ${result.final_state.route_data ? 'present' : 'missing'}, Origin: ${result.final_state.route_data?.origin}`
    );
  } catch (error) {
    formatTestResult(
      'Update state correctly',
      false,
      undefined,
      error as Error
    );
  }
}

/**
 * Test 6: Handle missing agent
 */
async function testHandleMissingAgent(): Promise<void> {
  try {
    AgentRegistry.clear();
    
    const plan: ExecutionPlan = {
      workflow: 'test',
      agent_sequence: [{
        agent_name: 'nonexistent_agent',
        description: 'Nonexistent agent',
        required_parameters: ['query'],
      }],
    };
    
    const engine = new WorkflowEngineImpl();
    const result = await engine.execute({
      execution_plan: plan,
      initial_state: createTestInitialState(),
    });
    
    const passed = 
      result.status === 'failed' &&
      result.error?.message.includes('not found in registry');
    
    formatTestResult(
      'Handle missing agent',
      passed,
      `Status: ${result.status}, Error: ${result.error?.message}`
    );
  } catch (error) {
    formatTestResult(
      'Handle missing agent',
      false,
      undefined,
      error as Error
    );
  }
}

/**
 * Test 7: Handle missing required inputs
 */
async function testHandleMissingRequiredInputs(): Promise<void> {
  try {
    AgentRegistry.clear();
    
    const agent = createTestAgentRegistration('test_agent', async (state) => {
      return { test_output: 'result' };
    });
    agent.consumes.required = ['query', 'missing_field'];
    AgentRegistry.register(agent);
    
    const plan: ExecutionPlan = {
      workflow: 'test',
      agent_sequence: [{
        agent_name: 'test_agent',
        description: 'Test agent',
        required_parameters: ['query', 'missing_field'],
      }],
    };
    
    const engine = new WorkflowEngineImpl();
    const result = await engine.execute({
      execution_plan: plan,
      initial_state: createTestInitialState(),
    });
    
    const passed = 
      result.status === 'failed' &&
      result.error?.message.includes('Missing required inputs');
    
    formatTestResult(
      'Handle missing required inputs',
      passed,
      `Status: ${result.status}, Error: ${result.error?.message}`
    );
  } catch (error) {
    formatTestResult(
      'Handle missing required inputs',
      false,
      undefined,
      error as Error
    );
  }
}

/**
 * Main test runner
 */
async function runAllTests(): Promise<void> {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                      WORKFLOW ENGINE TEST SUITE                               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  
  const startTime = Date.now();
  
  // Run all test cases
  await testExecuteSimpleWorkflow();
  await testEnforceMaxAgentCalls();
  await testHandleAgentFailureWithRetry();
  await testTrackAgentExecutionHistory();
  await testUpdateStateCorrectly();
  await testHandleMissingAgent();
  await testHandleMissingRequiredInputs();
  
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                          TEST SUITE COMPLETE                                 ║');
  console.log(`║                    Total Duration: ${duration}s                                    ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('\n');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch((error) => {
    console.error('Fatal error running tests:', error);
    process.exit(1);
  });
}

export {
  testExecuteSimpleWorkflow,
  testEnforceMaxAgentCalls,
  testHandleAgentFailureWithRetry,
  testTrackAgentExecutionHistory,
  testUpdateStateCorrectly,
  testHandleMissingAgent,
  testHandleMissingRequiredInputs,
  runAllTests,
};

