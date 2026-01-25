/**
 * Supervisor Agent Definition
 * 
 * Orchestrates the multi-agent workflow by analyzing queries,
 * determining execution plans, and routing to appropriate agents.
 */

import type { AgentDefinition } from '@/lib/types/agent-registry';
import { supervisorAgentNode } from '@/lib/multi-agent/agent-nodes';

export const supervisorAgent: AgentDefinition = {
  // Identity
  id: 'supervisor',
  name: 'Supervisor Agent',
  description: 'Orchestrates the multi-agent workflow by analyzing user queries, determining execution plans, validating prerequisites, and routing to appropriate specialist agents. Uses agentic ReAct pattern for complex reasoning.',
  version: '1.0.0',
  
  // Type
  type: 'supervisor',
  
  // LLM Config
  llm: {
    model: 'claude-sonnet-4-5',
    temperature: 0.3,
    maxTokens: 4000,
    systemPrompt: 'You are a maritime fuel management supervisor that orchestrates specialized agents.',
  },
  
  // Domain
  domain: ['orchestration', 'planning', 'routing'],
  capabilities: [
    'query_analysis',
    'intent_detection',
    'execution_planning',
    'agent_routing',
    'error_recovery',
    'clarification_handling',
  ],
  intents: [
    'analyze_query',
    'plan_execution',
    'route_to_agent',
    'handle_error',
    'request_clarification',
  ],
  
  // Contract
  produces: {
    stateFields: ['next_agent', 'agent_context', 'execution_plan', 'reasoning_history'],
    messageTypes: ['supervisor_decision', 'clarification_request', 'error'],
  },
  consumes: {
    required: ['messages'],
    optional: ['route_data', 'weather_forecast', 'bunker_analysis', 'compliance_data'],
  },
  
  // Tools - Supervisor doesn't use tools directly
  tools: {
    required: [],
    optional: [],
  },
  
  // Dependencies
  dependencies: {
    upstream: [], // Entry point - no upstream dependencies
    downstream: ['route_agent', 'compliance_agent', 'weather_agent', 'bunker_agent', 'finalize'],
  },
  
  // Execution
  execution: {
    canRunInParallel: false,
    maxExecutionTimeMs: 30000,
    retryPolicy: {
      maxRetries: 2,
      backoffMs: 1000,
    },
  },
  
  // Implementation
  implementation: 'lib/multi-agent/agent-nodes.ts',
  nodeFunction: supervisorAgentNode,
  
  // Monitoring
  metrics: {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    avgExecutionTimeMs: 0,
  },
  
  // Access
  enabled: true,
  
  // Metadata
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date(),
  deprecated: false,
};
