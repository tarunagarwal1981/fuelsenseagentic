/**
 * Integration Tests for Circuit Breaker Enforcement
 * 
 * Tests that circuit breakers are properly enforced.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { workflowEngine } from '../../workflow-engine';
import { ExecutionPlan } from '../../../agents/orchestrator';
import { AgentRegistry } from '../../../registry/agent-registry';
import { registerMockAgents, createMockAgentRegistration } from '../helpers/mock-agents';
import { createInitialWorkflowState } from '../fixtures/test-data';

describe('Workflow Circuit Breaker', () => {
  beforeEach(() => {
    AgentRegistry.clear();
    registerMockAgents();
  });

  afterEach(() => {
    AgentRegistry.clear();
  });

  it('should enforce max agent calls limit', async () => {
    // Create a plan with more than 15 agents (circuit breaker limit)
    // Use unique agent names for each call to avoid hitting "max calls per agent" limit
    const agentSequence = Array.from({ length: 20 }, (_, i) => {
      // Each call uses a different agent name to avoid per-agent limit
      const agentName = `test_agent_${i}`;
      return {
        agent_name: agentName,
        description: `Agent call ${i + 1}`,
        required_parameters: [],
      };
    });
    
    // Register all 20 test agents
    for (let i = 0; i < 20; i++) {
      AgentRegistry.register(createMockAgentRegistration(
        `test_agent_${i}`,
        async () => ({ test_output: 'success' }),
        ['test_output'],
        { required: [], optional: [] }
      ));
    }

    const executionPlan: ExecutionPlan = {
      workflow: 'test_workflow',
      agent_sequence: agentSequence,
    };

    const initialState = createInitialWorkflowState({
      origin_port: 'SGSIN',
      destination_port: 'NLRTM',
    });

    const result = await workflowEngine.execute({
      execution_plan: executionPlan,
      initial_state: initialState,
    });

    // Should fail due to circuit breaker
    expect(result.status).toBe('failed');
    expect(result.error?.message).toContain('Maximum agent calls exceeded');
    expect(result.final_state.agent_history.length).toBeLessThanOrEqual(15);
  });

  it('should enforce max calls per agent limit', async () => {
    // Create a plan that calls the same agent more than 3 times
    const executionPlan: ExecutionPlan = {
      workflow: 'test_workflow',
      agent_sequence: [
        {
          agent_name: 'route_calculator',
          description: 'Call 1',
          required_parameters: ['origin_port', 'destination_port'],
        },
        {
          agent_name: 'route_calculator',
          description: 'Call 2',
          required_parameters: ['origin_port', 'destination_port'],
        },
        {
          agent_name: 'route_calculator',
          description: 'Call 3',
          required_parameters: ['origin_port', 'destination_port'],
        },
        {
          agent_name: 'route_calculator',
          description: 'Call 4 - should trigger circuit breaker',
          required_parameters: ['origin_port', 'destination_port'],
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

    // Should fail due to max calls per agent limit
    expect(result.status).toBe('failed');
    expect(result.error?.message).toContain('Maximum calls per agent exceeded');
  });

  it('should provide clear circuit breaker reason', async () => {
    // Create a plan that exceeds max agent calls
    // Use unique agent names for each call to avoid hitting "max calls per agent" limit
    const agentSequence = Array.from({ length: 20 }, (_, i) => {
      // Each call uses a different agent name to avoid per-agent limit
      const agentName = `test_agent_${i}`;
      return {
        agent_name: agentName,
        description: `Agent call ${i + 1}`,
        required_parameters: [],
      };
    });
    
    // Register all 20 test agents
    for (let i = 0; i < 20; i++) {
      AgentRegistry.register(createMockAgentRegistration(
        `test_agent_${i}`,
        async () => ({ test_output: 'success' }),
        ['test_output'],
        { required: [], optional: [] }
      ));
    }

    const executionPlan: ExecutionPlan = {
      workflow: 'test_workflow',
      agent_sequence: agentSequence,
    };

    const initialState = createInitialWorkflowState({
      origin_port: 'SGSIN',
      destination_port: 'NLRTM',
    });

    const result = await workflowEngine.execute({
      execution_plan: executionPlan,
      initial_state: initialState,
    });

    // Error message should clearly explain what limit was hit
    expect(result.error?.message).toContain('Maximum agent calls exceeded');
    expect(result.error?.message).toContain('15');
    
    // Warning should also be recorded
    expect(result.final_state.warnings.some(w => 
      w.message.includes('Circuit breaker triggered')
    )).toBe(true);
  });

  it('should check circuit breakers before each agent call', async () => {
    // Create a plan that will complete successfully (10 calls < 15 limit)
    // Use unique agent names to avoid hitting "max calls per agent" limit
    const agentSequence = Array.from({ length: 10 }, (_, i) => {
      const agentName = `test_agent_${i}`;
      return {
        agent_name: agentName,
        description: `Agent call ${i + 1}`,
        required_parameters: [],
      };
    });
    
    // Register all 10 test agents
    for (let i = 0; i < 10; i++) {
      AgentRegistry.register(createMockAgentRegistration(
        `test_agent_${i}`,
        async () => ({ test_output: 'success' }),
        ['test_output'],
        { required: [], optional: [] }
      ));
    }

    const executionPlan: ExecutionPlan = {
      workflow: 'test_workflow',
      agent_sequence: agentSequence,
    };

    const initialState = createInitialWorkflowState();

    const result = await workflowEngine.execute({
      execution_plan: executionPlan,
      initial_state: initialState,
    });

    // Should complete successfully (10 calls < 15 limit)
    expect(result.status).toBe('completed');
    expect(result.final_state.agent_history.length).toBe(10);
  });
});

