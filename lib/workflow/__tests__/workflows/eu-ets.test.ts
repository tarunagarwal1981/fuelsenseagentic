/**
 * Integration Tests for EU ETS Cost Workflow
 * 
 * Tests the complete EU ETS cost calculation workflow.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { workflowEngine } from '../../workflow-engine';
import { ExecutionPlan } from '../../../agents/orchestrator';
import { AgentRegistry } from '../../../registry/agent-registry';
import { registerMockAgents } from '../helpers/mock-agents';
import { createInitialWorkflowState } from '../fixtures/test-data';

describe('EU ETS Cost Workflow', () => {
  beforeEach(() => {
    AgentRegistry.clear();
    registerMockAgents();
  });

  afterEach(() => {
    AgentRegistry.clear();
  });

  it('should complete EU ETS cost calculation workflow', async () => {
    const executionPlan: ExecutionPlan = {
      workflow: 'eu_ets',
      agent_sequence: [
        {
          agent_name: 'route_calculator',
          description: 'Calculate route',
          required_parameters: ['origin_port', 'destination_port'],
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
      query: 'Calculate EU ETS cost for route from Singapore to Rotterdam',
      query_type: 'eu_ets',
      origin_port: 'SGSIN',
      destination_port: 'NLRTM',
    });

    const result = await workflowEngine.execute({
      execution_plan: executionPlan,
      initial_state: initialState,
    });

    // Validate workflow completed successfully
    expect(result.status).toBe('completed');
    
    // Validate ETS cost is calculated
    expect(result.final_state.eu_ets_cost).toBeDefined();
    expect(result.final_state.eu_ets_cost?.total_cost_eur).toBe(45000);
    
    // Validate CO2 emissions are determined
    expect(result.final_state.eu_ets_cost?.co2_emissions_tons).toBe(1500);
    
    // Validate cost breakdown is provided
    expect(result.final_state.eu_ets_cost?.cost_per_ton_eur).toBe(30);
    
    // Validate metrics
    expect(result.metrics.successful_calls).toBe(3);
    expect(result.final_state.agent_history.length).toBe(3);
  });

  it('should require route data for ETS calculation', async () => {
    const executionPlan: ExecutionPlan = {
      workflow: 'eu_ets',
      agent_sequence: [
        {
          agent_name: 'ets_calculator',
          description: 'Calculate ETS cost',
          required_parameters: ['route_data'],
        },
      ],
    };

    const initialState = createInitialWorkflowState({
      query_type: 'eu_ets',
      // No route_data provided
    });

    const result = await workflowEngine.execute({
      execution_plan: executionPlan,
      initial_state: initialState,
    });

    // Should fail due to missing route data
    expect(result.status).toBe('failed');
    expect(result.error?.message).toContain('Missing required inputs');
  });
});

