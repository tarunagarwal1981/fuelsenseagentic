/**
 * Hull Performance Agent Definition
 *
 * Analyzes vessel hull performance: fouling, excess power, speed loss,
 * fuel consumption excess, trends, and condition-based recommendations.
 * Uses Hull Performance Engine data with optional vessel/noon context.
 *
 * ## Capabilities
 * - **hull_analysis**: Fetch and analyze hull performance metrics
 * - **fouling_detection**: Condition (Good/Average/Poor) and recommendations
 *
 * ## Input Requirements
 * - **vessel** / **vessel_identifiers**: IMO or vessel name (from entity extraction or vessel_info_agent)
 * - **correlation_id**: Request correlation ID
 *
 * ## Output Structure
 * - **hull_performance**: HullPerformanceAnalysis (condition, metrics, trends, baseline)
 * - **hull_performance_charts**: Data for charting (trend_data, baseline_curves)
 *
 * ## Example Queries
 * - "How is the hull performance of MV Pacific Star?"
 * - "Show hull condition and excess fuel for IMO 9123456"
 * - "Hull performance trend for the last 90 days"
 */

import type { AgentDefinition } from '@/lib/types/agent-registry';
import { hullPerformanceAgentNode } from '@/lib/multi-agent/agents/hull-performance-agent';

export const hullPerformanceAgent: AgentDefinition = {
  // Identity
  id: 'hull_performance_agent',
  name: 'Hull Performance Monitor',
  description:
    'Analyzes vessel hull performance by fetching data from Hull Performance Engine. Detects hull fouling, calculates excess power consumption, tracks performance degradation trends, and provides condition-based recommendations. Supports single vessel analysis, time-based filtering, and baseline comparisons.',
  version: '1.0.0',

  // Type (specialist = domain expert; deterministic workflow when no LLM)
  type: 'specialist',

  // LLM – optional for future natural-language summarization
  llm: undefined,

  // Domain & capabilities (aligned with INTENT_CAPABILITY_MAP hull_performance)
  domain: ['hull_performance', 'vessel_monitoring', 'technical_performance'],
  capabilities: ['hull_analysis', 'fouling_detection'],
  intents: [
    'hull_performance',
    'hull_condition',
    'hull_fouling',
    'excess_power',
    'speed_loss',
    'performance_degradation',
    'hull_cleaning',
  ],

  // Contract: consumes vessel context, produces hull analysis
  produces: {
    stateFields: ['hull_performance', 'hull_performance_charts'],
    messageTypes: ['hull_performance_analyzed', 'hull_performance_error'],
  },
  consumes: {
    required: ['messages'],
    optional: ['vessel', 'vessel_identifiers', 'correlation_id'],
  },

  // Tools (fetch_hull_performance required; vessel/noon for context)
  tools: {
    required: ['fetch_hull_performance'],
    optional: ['fetch_vessel_specs', 'fetch_noon_report'],
  },

  // Dependencies (vessel_info_agent provides vessel context; entity extraction validates vessel)
  dependencies: {
    upstream: ['vessel_info_agent'],
    downstream: ['finalize'],
  },

  // Execution (10s max, 3 retries with backoff)
  execution: {
    canRunInParallel: true,
    maxExecutionTimeMs: 10000,
    retryPolicy: {
      maxRetries: 3,
      backoffMs: 1000,
    },
  },

  // Implementation
  implementation: 'lib/multi-agent/agents/hull-performance-agent.ts',
  nodeFunction: hullPerformanceAgentNode,

  // Monitoring
  metrics: {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    avgExecutionTimeMs: 0,
  },

  // Access (planned = not yet wired; set enabled: true when node is implemented)
  enabled: true,

  // Metadata
  createdAt: new Date(),
  updatedAt: new Date(),
  deprecated: false,
};
