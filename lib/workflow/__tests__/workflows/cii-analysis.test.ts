/**
 * Integration Tests for CII Analysis Workflow
 * 
 * Tests the complete CII analysis workflow.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { workflowEngine } from '../../workflow-engine';
import { ExecutionPlan } from '../../../agents/orchestrator';
import { AgentRegistry } from '../../../registry/agent-registry';
import { registerMockAgents } from '../helpers/mock-agents';
import { createInitialWorkflowState } from '../fixtures/test-data';

describe('CII Analysis Workflow', () => {
  beforeEach(() => {
    AgentRegistry.clear();
    registerMockAgents();
  });

  afterEach(() => {
    AgentRegistry.clear();
  });

  it('should complete CII analysis workflow', async () => {
    const executionPlan: ExecutionPlan = {
      workflow: 'cii_analysis',
      agent_sequence: [
        {
          agent_name: 'route_calculator',
          description: 'Calculate route',
          required_parameters: ['origin_port', 'destination_port'],
        },
        {
          agent_name: 'cii_calculator',
          description: 'Calculate CII rating',
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
      query: 'Calculate CII rating for route from Singapore to Rotterdam',
      query_type: 'cii_analysis',
      origin_port: 'SGSIN',
      destination_port: 'NLRTM',
    });

    const result = await workflowEngine.execute({
      execution_plan: executionPlan,
      initial_state: initialState,
    });

    // Validate workflow completed successfully
    expect(result.status).toBe('completed');
    
    // Validate CII rating is calculated
    expect(result.final_state.cii_rating).toBeDefined();
    expect(result.final_state.cii_rating?.rating).toBe('B');
    expect(result.final_state.cii_rating?.cii_value).toBe(4.2);
    
    // Validate compliance status is determined
    expect(result.final_state.cii_rating?.compliant).toBe(true);
    
    // Validate report is generated
    expect(result.final_state.agent_history.length).toBe(3);
    expect(result.metrics.successful_calls).toBe(3);
  });

  it('should require route data for CII calculation', async () => {
    const executionPlan: ExecutionPlan = {
      workflow: 'cii_analysis',
      agent_sequence: [
        {
          agent_name: 'cii_calculator',
          description: 'Calculate CII rating',
          required_parameters: ['route_data'],
        },
      ],
    };

    const initialState = createInitialWorkflowState({
      query_type: 'cii_analysis',
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

