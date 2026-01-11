/**
 * Integration Tests for Bunker Planning Workflow
 * 
 * Tests the complete bunker planning workflow from orchestrator to final result.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { workflowEngine } from '../../workflow-engine';
import { ExecutionPlan } from '../../../agents/orchestrator';
import { AgentRegistry } from '../../../registry/agent-registry';
import { registerMockAgents } from '../helpers/mock-agents';
import { createInitialWorkflowState } from '../fixtures/test-data';

describe('Bunker Planning Workflow', () => {
  beforeEach(() => {
    // Clear registry and register mock agents
    AgentRegistry.clear();
    registerMockAgents();
  });

  afterEach(() => {
    // Clean up
    AgentRegistry.clear();
  });

  it('should complete full bunker planning workflow', async () => {
    const executionPlan: ExecutionPlan = {
      workflow: 'bunker_planning',
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
          agent_name: 'safety_validator',
          description: 'Validate safety',
          required_parameters: ['bunker_analysis'],
        },
        {
          agent_name: 'finalizer',
          description: 'Finalize report',
          required_parameters: [],
        },
      ],
    };

    const initialState = createInitialWorkflowState({
      query: 'Find cheapest bunker from Singapore to Rotterdam',
      origin_port: 'SGSIN',
      destination_port: 'NLRTM',
    });

    const result = await workflowEngine.execute({
      execution_plan: executionPlan,
      initial_state: initialState,
    });

    // Validate workflow completed successfully
    expect(result.status).toBe('completed');
    
    // Validate all required state data is present
    expect(result.final_state.route_data).toBeDefined();
    expect(result.final_state.route_data?.origin).toBe('SGSIN');
    expect(result.final_state.route_data?.destination).toBe('NLRTM');
    
    expect(result.final_state.weather_data).toBeDefined();
    expect(result.final_state.weather_data?.risk_level).toBeDefined();
    
    expect(result.final_state.bunker_analysis).toBeDefined();
    expect(result.final_state.bunker_analysis?.recommended_port).toBeDefined();
    expect(result.final_state.bunker_analysis?.recommended_port?.code).toBe('AEDXB');
    
    // Validate safety validation passed
    expect(result.final_state.agent_history.length).toBe(5);
    expect(result.final_state.agent_history.every(h => h.success)).toBe(true);
    
    // Validate metrics
    expect(result.metrics.total_agent_calls).toBe(5);
    expect(result.metrics.successful_calls).toBe(5);
    expect(result.metrics.failed_calls).toBe(0);
    expect(result.metrics.average_call_duration_ms).toBeGreaterThan(0);
  });

  it('should handle missing route data gracefully', async () => {
    const executionPlan: ExecutionPlan = {
      workflow: 'bunker_planning',
      agent_sequence: [
        {
          agent_name: 'weather_analyzer',
          description: 'Analyze weather',
          required_parameters: ['route_data'],
        },
      ],
    };

    const initialState = createInitialWorkflowState({
      // No route_data provided
    });

    const result = await workflowEngine.execute({
      execution_plan: executionPlan,
      initial_state: initialState,
    });

    // Should fail due to missing required input
    expect(result.status).toBe('failed');
    expect(result.error?.message).toContain('Missing required inputs');
  });
});

