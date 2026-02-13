/**
 * Hull Performance Tools Definitions
 *
 * Tool definitions for fetching hull performance analysis (condition, metrics, trends).
 * Used by Hull Performance agent.
 */

import type { ToolDefinition } from '@/lib/types/tool-registry';
import { executeFetchHullPerformanceTool } from '@/lib/tools/hull-performance/fetch-hull-performance';

/**
 * Fetch Hull Performance Tool Definition
 *
 * Fetches hull performance metrics, condition analysis, component breakdown, and trends.
 */
export const fetchHullPerformanceTool: ToolDefinition = {
  // Identity
  id: 'fetch_hull_performance',
  name: 'Hull Performance Data Fetcher',
  description:
    'Fetches hull performance metrics including excess power %, speed loss %, fuel consumption excess, and performance trends. Returns hull condition analysis (Good/Average/Poor), component breakdown, CII impact, and historical trends for charting. Use when user asks about hull performance, vessel condition, fuel consumption trends, or performance degradation.',
  version: '1.0.0',

  // Classification
  category: 'vessel',
  domain: ['vessel_performance', 'hull_monitoring', 'technical_performance'],

  // Schema (JSON Schema aligned with fetchHullPerformanceInputSchema)
  inputSchema: {
    type: 'object',
    properties: {
      vessel_identifier: {
        type: 'object',
        description: 'Vessel identification - provide IMO and/or vessel name',
        properties: {
          imo: {
            type: 'string',
            description: 'IMO number (7 digits)',
          },
          name: {
            type: 'string',
            description: 'Vessel name',
          },
        },
        required: [],
      },
      time_period: {
        type: 'object',
        description: 'Optional time window for analysis',
        properties: {
          days: {
            type: 'number',
            description: 'Last N days (default 90)',
          },
          start_date: {
            type: 'string',
            description: 'ISO date string',
          },
          end_date: {
            type: 'string',
            description: 'ISO date string',
          },
        },
        required: [],
      },
    },
    required: ['vessel_identifier'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the fetch succeeded',
      },
      data: {
        type: 'object',
        description: 'Full HullPerformanceAnalysis when success is true',
        properties: {
          vessel: {
            type: 'object',
            properties: {
              imo: { type: 'string' },
              name: { type: 'string' },
            },
          },
          hull_condition: {
            type: 'string',
            enum: ['GOOD', 'AVERAGE', 'POOR'],
          },
          condition_indicator: { type: 'string' },
          condition_message: { type: 'string' },
          latest_metrics: { type: 'object' },
          component_breakdown: { type: 'object' },
          cii_impact: { type: 'object' },
          trend_data: { type: 'array' },
          baseline_curves: { type: 'object' },
          analysis_period: { type: 'object' },
          metadata: { type: 'object' },
        },
      },
      error: {
        type: 'string',
        description: 'Error message when success is false',
      },
      message: {
        type: 'string',
        description: 'Human-readable message',
      },
    },
    required: [],
  },

  // Operational
  cost: 'api_call',
  avgLatencyMs: 1500,
  maxLatencyMs: 5000,
  reliability: 0.95,

  // Dependencies
  dependencies: {
    external: ['hull_performance_api'],
    internal: ['redis_cache'],
  },

  // Access Control
  agentIds: ['hull_performance_agent'],
  requiresAuth: false,

  // Implementation
  implementation: executeFetchHullPerformanceTool,

  // Monitoring
  metrics: {
    totalCalls: 0,
    successCalls: 0,
    failureCalls: 0,
  },

  // Metadata
  createdAt: new Date(),
  updatedAt: new Date(),
  deprecated: false,
};
