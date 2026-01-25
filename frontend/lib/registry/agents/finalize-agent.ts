/**
 * Finalize Agent Definition
 * 
 * Synthesizes results from all agents into a comprehensive
 * recommendation for the user.
 */

import type { AgentDefinition } from '@/lib/types/agent-registry';
import { finalizeNode } from '@/lib/multi-agent/agent-nodes';

export const finalizeAgent: AgentDefinition = {
  // Identity
  id: 'finalize',
  name: 'Finalize Agent',
  description: 'Synthesizes results from all specialist agents into a comprehensive, actionable recommendation for the user. Uses LLM for natural language generation and formatting.',
  version: '1.0.0',
  
  // Type
  type: 'finalizer',
  
  // LLM Config - Uses LLM for synthesis
  llm: {
    model: 'claude-sonnet-4-5',
    temperature: 0.5,
    maxTokens: 4000,
    systemPrompt: 'You are a maritime fuel management expert synthesizing analysis results into clear recommendations.',
  },
  
  // Domain
  domain: ['synthesis', 'recommendation', 'reporting'],
  capabilities: [
    'synthesize_results',
    'generate_recommendation',
    'format_response',
    'handle_clarification',
    'summarize_analysis',
  ],
  intents: [
    'finalize',
    'summarize',
    'recommend',
  ],
  
  // Contract
  produces: {
    stateFields: ['final_recommendation', 'formatted_response'],
    messageTypes: ['recommendation', 'clarification_question', 'error'],
  },
  consumes: {
    required: ['messages'],
    optional: [
      'route_data',
      'vessel_timeline',
      'weather_forecast',
      'weather_consumption',
      'compliance_data',
      'bunker_analysis',
      'port_weather_status',
      'needs_clarification',
      'clarification_question',
    ],
  },
  
  // Tools
  tools: {
    required: [],
    optional: [],
  },
  
  // Dependencies
  dependencies: {
    upstream: ['supervisor', 'route_agent', 'weather_agent', 'bunker_agent', 'compliance_agent'],
    downstream: [], // Terminal node
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
  nodeFunction: finalizeNode,
  
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
