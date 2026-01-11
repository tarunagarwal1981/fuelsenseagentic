/**
 * Mock Agent Implementations for Testing
 * 
 * Provides mock agent executors that return predictable results
 * for integration testing of workflows.
 */

import { AgentRegistration, AgentExecutor } from '../../../registry/agent-registry';
import { WorkflowState } from '../../workflow-engine';
import {
  sampleRouteData,
  sampleWeatherData,
  sampleBunkerAnalysis,
  sampleCIIRating,
  sampleETSCost,
} from '../fixtures/test-data';

/**
 * Mock route calculator agent
 */
export const mockRouteCalculatorAgent: AgentExecutor = async (state: WorkflowState) => {
  // Simulate some processing time
  await new Promise(resolve => setTimeout(resolve, 10));
  
  return {
    route_data: sampleRouteData,
    duration_ms: 10,
  };
};

/**
 * Mock weather analyzer agent
 */
export const mockWeatherAnalyzerAgent: AgentExecutor = async (state: WorkflowState) => {
  await new Promise(resolve => setTimeout(resolve, 10));
  
  if (!state.route_data) {
    throw new Error('Route data required for weather analysis');
  }
  
  return {
    weather_data: sampleWeatherData,
    duration_ms: 10,
  };
};

/**
 * Mock bunker planner agent
 */
export const mockBunkerPlannerAgent: AgentExecutor = async (state: WorkflowState) => {
  await new Promise(resolve => setTimeout(resolve, 20));
  
  if (!state.route_data) {
    throw new Error('Route data required for bunker planning');
  }
  
  return {
    bunker_analysis: sampleBunkerAnalysis,
    duration_ms: 20,
  };
};

/**
 * Mock safety validator agent
 */
export const mockSafetyValidatorAgent: AgentExecutor = async (state: WorkflowState) => {
  await new Promise(resolve => setTimeout(resolve, 10));
  
  if (!state.bunker_analysis) {
    throw new Error('Bunker analysis required for safety validation');
  }
  
  return {
    safety_validation: {
      risk_level: 'LOW',
      passed: true,
      warnings: [],
    },
    duration_ms: 10,
  };
};

/**
 * Mock CII calculator agent
 */
export const mockCIICalculatorAgent: AgentExecutor = async (state: WorkflowState) => {
  await new Promise(resolve => setTimeout(resolve, 15));
  
  if (!state.route_data) {
    throw new Error('Route data required for CII calculation');
  }
  
  return {
    cii_rating: sampleCIIRating,
    duration_ms: 15,
  };
};

/**
 * Mock ETS calculator agent
 */
export const mockETSCalculatorAgent: AgentExecutor = async (state: WorkflowState) => {
  await new Promise(resolve => setTimeout(resolve, 15));
  
  if (!state.route_data) {
    throw new Error('Route data required for ETS calculation');
  }
  
  return {
    eu_ets_cost: sampleETSCost,
    duration_ms: 15,
  };
};

/**
 * Mock finalizer agent
 */
export const mockFinalizerAgent: AgentExecutor = async (state: WorkflowState) => {
  await new Promise(resolve => setTimeout(resolve, 10));
  
  return {
    final_report: {
      summary: 'Workflow completed successfully',
      recommendations: ['Proceed with recommended bunker port'],
      risk_assessment: 'LOW',
    },
    duration_ms: 10,
  };
};

/**
 * Mock orchestrator agent
 */
export const mockOrchestratorAgent: AgentExecutor = async (state: WorkflowState) => {
  await new Promise(resolve => setTimeout(resolve, 10));
  
  return {
    execution_plan: {
      workflow: 'bunker_planning',
      agent_sequence: [
        { agent_name: 'route_calculator', description: 'Calculate route', required_parameters: ['origin_port', 'destination_port'] },
        { agent_name: 'weather_analyzer', description: 'Analyze weather', required_parameters: ['route_data'] },
        { agent_name: 'bunker_planner', description: 'Plan bunkers', required_parameters: ['route_data', 'weather_data'] },
        { agent_name: 'safety_validator', description: 'Validate safety', required_parameters: ['bunker_analysis'] },
        { agent_name: 'finalizer', description: 'Finalize report', required_parameters: [] },
      ],
    },
    duration_ms: 10,
  };
};

/**
 * Mock agent that fails
 */
export const mockFailingAgent: AgentExecutor = async (state: WorkflowState) => {
  await new Promise(resolve => setTimeout(resolve, 10));
  throw new Error('Mock agent failure');
};

/**
 * Mock agent that fails after delay
 */
export const mockSlowFailingAgent: AgentExecutor = async (state: WorkflowState) => {
  await new Promise(resolve => setTimeout(resolve, 100));
  throw new Error('Slow mock agent failure');
};

/**
 * Create mock agent registration
 */
export function createMockAgentRegistration(
  id: string,
  executor: AgentExecutor,
  produces: string[] = [],
  consumes: { required: string[]; optional: string[] } = { required: [], optional: [] }
): AgentRegistration {
  return {
    id,
    name: `Mock ${id}`,
    type: 'deterministic',
    description: `Mock agent for testing: ${id}`,
    produces,
    consumes,
    available_tools: [],
    config_file: `config/agents/${id}.yaml`,
    implementation: `lib/agents/${id}`,
    executor,
  };
}

/**
 * Register all mock agents for testing
 */
export function registerMockAgents(): void {
  const { AgentRegistry } = require('../../../registry/agent-registry');
  
  AgentRegistry.register(createMockAgentRegistration(
    'route_calculator',
    mockRouteCalculatorAgent,
    ['route_data'],
    { required: ['origin_port', 'destination_port'], optional: [] }
  ));
  
  AgentRegistry.register(createMockAgentRegistration(
    'weather_analyzer',
    mockWeatherAnalyzerAgent,
    ['weather_data'],
    { required: ['route_data'], optional: [] }
  ));
  
  AgentRegistry.register(createMockAgentRegistration(
    'bunker_planner',
    mockBunkerPlannerAgent,
    ['bunker_analysis'],
    { required: ['route_data', 'weather_data'], optional: [] }
  ));
  
  AgentRegistry.register(createMockAgentRegistration(
    'safety_validator',
    mockSafetyValidatorAgent,
    ['safety_validation'],
    { required: ['bunker_analysis'], optional: [] }
  ));
  
  AgentRegistry.register(createMockAgentRegistration(
    'cii_calculator',
    mockCIICalculatorAgent,
    ['cii_rating'],
    { required: ['route_data'], optional: [] }
  ));
  
  AgentRegistry.register(createMockAgentRegistration(
    'ets_calculator',
    mockETSCalculatorAgent,
    ['eu_ets_cost'],
    { required: ['route_data'], optional: [] }
  ));
  
  AgentRegistry.register(createMockAgentRegistration(
    'finalizer',
    mockFinalizerAgent,
    ['final_report'],
    { required: [], optional: [] }
  ));
  
  AgentRegistry.register(createMockAgentRegistration(
    'orchestrator',
    mockOrchestratorAgent,
    ['execution_plan'],
    { required: ['query'], optional: [] }
  ));
}

