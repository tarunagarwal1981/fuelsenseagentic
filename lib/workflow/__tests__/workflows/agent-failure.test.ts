/**
 * Integration Tests for Workflow with Agent Failure
 * 
 * Tests that workflows handle agent failures gracefully.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { workflowEngine } from '../../workflow-engine';
import { ExecutionPlan } from '../../../agents/orchestrator';
import { AgentRegistry } from '../../../registry/agent-registry';
import { registerMockAgents, createMockAgentRegistration, mockFailingAgent } from '../helpers/mock-agents';
import { createInitialWorkflowState } from '../fixtures/test-data';

describe('Workflow with Agent Failure', () => {
  beforeEach(() => {
    AgentRegistry.clear();
    registerMockAgents();
  });

  afterEach(() => {
    AgentRegistry.clear();
  });

  it('should handle agent failure gracefully and continue to next agent', async () => {
    // Register a failing agent
    AgentRegistry.register(createMockAgentRegistration(
      'failing_agent',
      mockFailingAgent,
      ['test_output'],
      { required: [], optional: [] }
    ));

    const executionPlan: ExecutionPlan = {
      workflow: 'test_workflow',
      agent_sequence: [
        {
          agent_name: 'route_calculator',
          description: 'Calculate route',
          required_parameters: ['origin_port', 'destination_port'],
        },
        {
          agent_name: 'failing_agent',
          description: 'This will fail',
          required_parameters: [],
        },
        {
          agent_name: 'finalizer',
          description: 'Finalize report',
          required_parameters: [],
        },
      ],
    };

    const initialState = createInitialWorkflowState({
      origin_port: 'SGSIN',
      destination_port: 'NLRTM',
    });

    const result = await workflowEngine.execute({
      execution_plan: executionPlan,
      initial_state: initialState,
    });

    // Workflow should continue to next agent
    expect(result.final_state.route_data).toBeDefined();
    
    // Error should be recorded in state
    expect(result.final_state.errors.length).toBeGreaterThan(0);
    expect(result.final_state.errors.some(e => e.message.includes('Mock agent failure'))).toBe(true);
    
    // Warning should be recorded
    expect(result.final_state.warnings.length).toBeGreaterThan(0);
    expect(result.final_state.warnings.some(w => w.message.includes('failed after'))).toBe(true);
    
    // Partial results should be returned
    expect(result.final_state.agent_history.length).toBe(3);
    expect(result.final_state.agent_history[0].success).toBe(true); // route_calculator succeeded
    expect(result.final_state.agent_history[1].success).toBe(false); // failing_agent failed
    expect(result.final_state.agent_history[2].success).toBe(true); // finalizer succeeded
    
    // Metrics should reflect failures
    expect(result.metrics.failed_calls).toBe(1);
    expect(result.metrics.successful_calls).toBe(2);
  });

  it('should retry failed agents before giving up', async () => {
    let callCount = 0;
    const retryingAgent = async (state: any) => {
      callCount++;
      if (callCount < 3) {
        throw new Error('Temporary failure');
      }
      return { test_output: 'success' };
    };

    AgentRegistry.register(createMockAgentRegistration(
      'retrying_agent',
      retryingAgent,
      ['test_output'],
      { required: [], optional: [] }
    ));

    const executionPlan: ExecutionPlan = {
      workflow: 'test_workflow',
      agent_sequence: [
        {
          agent_name: 'retrying_agent',
          description: 'This will retry',
          required_parameters: [],
        },
      ],
    };

    const initialState = createInitialWorkflowState();

    const result = await workflowEngine.execute({
      execution_plan: executionPlan,
      initial_state: initialState,
    });

    // Should succeed after retries
    expect(callCount).toBe(3); // Initial call + 2 retries
    expect(result.final_state.agent_history[0].success).toBe(true);
    expect(result.metrics.successful_calls).toBe(1);
  });

  it('should record error details in agent history', async () => {
    AgentRegistry.register(createMockAgentRegistration(
      'failing_agent',
      mockFailingAgent,
      ['test_output'],
      { required: [], optional: [] }
    ));

    const executionPlan: ExecutionPlan = {
      workflow: 'test_workflow',
      agent_sequence: [
        {
          agent_name: 'failing_agent',
          description: 'This will fail',
          required_parameters: [],
        },
      ],
    };

    const initialState = createInitialWorkflowState();

    const result = await workflowEngine.execute({
      execution_plan: executionPlan,
      initial_state: initialState,
    });

    // Agent history should contain error details
    const failedCall = result.final_state.agent_history.find(h => !h.success);
    expect(failedCall).toBeDefined();
    expect(failedCall?.error).toBeDefined();
    expect(failedCall?.error).toContain('Mock agent failure');
  });
});

