/**
 * Integration Tests for Combined Workflow
 * 
 * Tests complete workflow with multiple analysis types.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { workflowEngine } from '../../workflow-engine';
import { ExecutionPlan } from '../../../agents/orchestrator';
import { AgentRegistry } from '../../../registry/agent-registry';
import { registerMockAgents } from '../helpers/mock-agents';
import { createInitialWorkflowState } from '../fixtures/test-data';

describe('Combined Workflow', () => {
  beforeEach(() => {
    AgentRegistry.clear();
    registerMockAgents();
  });

  afterEach(() => {
    AgentRegistry.clear();
  });

  it('should complete workflow with multiple analysis types', async () => {
    const executionPlan: ExecutionPlan = {
      workflow: 'combined',
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
        {
          agent_name: 'cii_calculator',
          description: 'Calculate CII rating',
          required_parameters: ['route_data'],
        },
        {
          agent_name: 'ets_calculator',
          description: 'Calculate ETS cost',
          required_parameters: ['route_data'],
        },
        {
          agent_name: 'finalizer',
          description: 'Finalize report',
          required_parameters: [],
        },
      ],
    };

    const initialState = createInitialWorkflowState({
      query: 'Complete analysis: bunker planning, CII rating, and EU ETS cost',
      query_type: 'combined',
      origin_port: 'SGSIN',
      destination_port: 'NLRTM',
    });

    const result = await workflowEngine.execute({
      execution_plan: executionPlan,
      initial_state: initialState,
    });

    // Validate workflow completed successfully
    expect(result.status).toBe('completed');
    
    // Validate all analysis types complete
    expect(result.final_state.route_data).toBeDefined();
    expect(result.final_state.weather_data).toBeDefined();
    expect(result.final_state.bunker_analysis).toBeDefined();
    expect(result.final_state.cii_rating).toBeDefined();
    expect(result.final_state.eu_ets_cost).toBeDefined();
    
    // Validate state contains all required data
    expect(result.final_state.route_data?.origin).toBe('SGSIN');
    expect(result.final_state.route_data?.destination).toBe('NLRTM');
    expect(result.final_state.bunker_analysis?.recommended_port).toBeDefined();
    expect(result.final_state.cii_rating?.rating).toBe('B');
    expect(result.final_state.eu_ets_cost?.total_cost_eur).toBe(45000);
    
    // Validate final report is comprehensive
    expect(result.final_state.agent_history.length).toBe(6);
    expect(result.metrics.successful_calls).toBe(6);
    expect(result.metrics.failed_calls).toBe(0);
  });

  it('should handle partial completion if one agent fails', async () => {
    const { createMockAgentRegistration, mockFailingAgent } = require('../helpers/mock-agents');
    
    // Register a failing agent
    AgentRegistry.register(createMockAgentRegistration(
      'failing_agent',
      mockFailingAgent,
      ['test_output'],
      { required: [], optional: [] }
    ));

    const executionPlan: ExecutionPlan = {
      workflow: 'combined',
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
      query_type: 'combined',
      origin_port: 'SGSIN',
      destination_port: 'NLRTM',
    });

    const result = await workflowEngine.execute({
      execution_plan: executionPlan,
      initial_state: initialState,
    });

    // Workflow should continue despite failure
    expect(result.final_state.route_data).toBeDefined();
    expect(result.final_state.errors.length).toBeGreaterThan(0);
    expect(result.final_state.agent_history.some(h => !h.success)).toBe(true);
  });
});

