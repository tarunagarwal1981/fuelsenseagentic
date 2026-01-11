/**
 * Integration Tests for State Management
 * 
 * Tests that state is correctly updated through workflow execution.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { workflowEngine } from '../../workflow-engine';
import { ExecutionPlan } from '../../../agents/orchestrator';
import { AgentRegistry } from '../../../registry/agent-registry';
import { registerMockAgents } from '../helpers/mock-agents';
import { createInitialWorkflowState } from '../fixtures/test-data';

describe('Workflow State Management', () => {
  beforeEach(() => {
    AgentRegistry.clear();
    registerMockAgents();
  });

  afterEach(() => {
    AgentRegistry.clear();
  });

  it('should accumulate data from each agent in state', async () => {
    const executionPlan: ExecutionPlan = {
      workflow: 'test_workflow',
      agent_sequence: [
        {
          agent_name: 'route_calculator',
          description: 'Calculate route',
          required_parameters: ['origin_port', 'destination_port'],
        },
        {
          agent_name: 'weather_analyzer',
          description: 'Analyze weather',
          required_parameters: ['route_data'],
        },
        {
          agent_name: 'bunker_planner',
          description: 'Plan bunkers',
          required_parameters: ['route_data', 'weather_data'],
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

    // State should accumulate data from each agent
    expect(result.final_state.route_data).toBeDefined();
    expect(result.final_state.weather_data).toBeDefined();
    expect(result.final_state.bunker_analysis).toBeDefined();
    
    // Initial state should be preserved
    expect(result.final_state.query).toBe(initialState.query);
    expect(result.final_state.vessel.name).toBe(initialState.vessel.name);
    expect(result.final_state.origin_port).toBe(initialState.origin_port);
  });

  it('should track agent execution history', async () => {
    const executionPlan: ExecutionPlan = {
      workflow: 'test_workflow',
      agent_sequence: [
        {
          agent_name: 'route_calculator',
          description: 'Calculate route',
          required_parameters: ['origin_port', 'destination_port'],
        },
        {
          agent_name: 'weather_analyzer',
          description: 'Analyze weather',
          required_parameters: ['route_data'],
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

    // Agent history should be tracked
    expect(result.final_state.agent_history.length).toBe(2);
    expect(result.final_state.agent_history[0].agent).toBe('route_calculator');
    expect(result.final_state.agent_history[1].agent).toBe('weather_analyzer');
    
    // Each history entry should have required fields
    result.final_state.agent_history.forEach(entry => {
      expect(entry.called_at).toBeInstanceOf(Date);
      expect(entry.duration_ms).toBeGreaterThanOrEqual(0);
      expect(typeof entry.success).toBe('boolean');
    });
  });

  it('should record warnings and errors in state', async () => {
    const { createMockAgentRegistration, mockFailingAgent } = require('../helpers/mock-agents');
    
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

    // Errors should be recorded
    expect(result.final_state.errors.length).toBeGreaterThan(0);
    expect(result.final_state.errors[0]).toBeInstanceOf(Error);
    
    // Warnings should be recorded
    expect(result.final_state.warnings.length).toBeGreaterThan(0);
    expect(result.final_state.warnings[0].level).toBe('error');
    expect(result.final_state.warnings[0].message).toContain('failed');
    expect(result.final_state.warnings[0].timestamp).toBeGreaterThan(0);
    expect(result.final_state.warnings[0].source).toBe('failing_agent');
  });

  it('should preserve initial state properties', async () => {
    const executionPlan: ExecutionPlan = {
      workflow: 'test_workflow',
      agent_sequence: [
        {
          agent_name: 'route_calculator',
          description: 'Calculate route',
          required_parameters: ['origin_port', 'destination_port'],
        },
      ],
    };

    const initialState = createInitialWorkflowState({
      query: 'Custom query',
      query_type: 'custom_type',
      vessel: {
        name: 'Custom Vessel',
        imo: '9999999',
      },
      origin_port: 'CUSTOM1',
      destination_port: 'CUSTOM2',
      vessel_speed_knots: 16,
      consumption: {
        vlsfo_per_day: 40,
        lsmgo_per_day: 5,
      },
    });

    const result = await workflowEngine.execute({
      execution_plan: executionPlan,
      initial_state: initialState,
    });

    // All initial state properties should be preserved
    expect(result.final_state.query).toBe('Custom query');
    expect(result.final_state.query_type).toBe('custom_type');
    expect(result.final_state.vessel.name).toBe('Custom Vessel');
    expect(result.final_state.vessel.imo).toBe('9999999');
    expect(result.final_state.origin_port).toBe('CUSTOM1');
    expect(result.final_state.destination_port).toBe('CUSTOM2');
    expect(result.final_state.vessel_speed_knots).toBe(16);
    expect(result.final_state.consumption?.vlsfo_per_day).toBe(40);
    expect(result.final_state.consumption?.lsmgo_per_day).toBe(5);
  });

  it('should update state incrementally as agents execute', async () => {
    const executionPlan: ExecutionPlan = {
      workflow: 'test_workflow',
      agent_sequence: [
        {
          agent_name: 'route_calculator',
          description: 'Calculate route',
          required_parameters: ['origin_port', 'destination_port'],
        },
        {
          agent_name: 'weather_analyzer',
          description: 'Analyze weather',
          required_parameters: ['route_data'],
        },
        {
          agent_name: 'bunker_planner',
          description: 'Plan bunkers',
          required_parameters: ['route_data', 'weather_data'],
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

    // State should be updated incrementally
    // After route_calculator: route_data should exist
    expect(result.final_state.route_data).toBeDefined();
    
    // After weather_analyzer: weather_data should exist (and route_data still there)
    expect(result.final_state.weather_data).toBeDefined();
    expect(result.final_state.route_data).toBeDefined();
    
    // After bunker_planner: bunker_analysis should exist (and previous data still there)
    expect(result.final_state.bunker_analysis).toBeDefined();
    expect(result.final_state.route_data).toBeDefined();
    expect(result.final_state.weather_data).toBeDefined();
  });
});

