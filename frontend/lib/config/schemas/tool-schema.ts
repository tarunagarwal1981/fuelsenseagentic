/**
 * Tool Configuration Schema
 *
 * JSON Schema definition for validating tool YAML configurations.
 */

import type { JSONSchema } from '../yaml-loader';

export const toolConfigSchema: JSONSchema = {
  type: 'object',
  required: ['id', 'name', 'description', 'category', 'cost', 'avgLatencyMs', 'enabled'],
  properties: {
    // Identity
    id: {
      type: 'string',
      pattern: '^[a-z][a-z0-9_]*$',
      minLength: 2,
      maxLength: 50,
    },
    name: {
      type: 'string',
      minLength: 3,
      maxLength: 100,
    },
    description: {
      type: 'string',
      maxLength: 500,
    },
    category: {
      type: 'string',
      enum: ['routing', 'weather', 'bunker', 'compliance', 'vessel', 'calculation', 'validation'],
    },
    domain: {
      type: 'array',
      items: { type: 'string' },
    },

    // Performance
    cost: {
      type: 'string',
      enum: ['free', 'api_call', 'expensive'],
    },
    avgLatencyMs: {
      type: 'integer',
      minimum: 0,
      maximum: 300000,
    },
    maxLatencyMs: {
      type: 'integer',
      minimum: 0,
      maximum: 600000,
    },
    reliability: {
      type: 'number',
      minimum: 0,
      maximum: 1,
    },

    // Dependencies
    dependencies: {
      type: 'object',
      properties: {
        external: {
          type: 'array',
          items: { type: 'string' },
        },
        internal: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },

    // Usage
    agentIds: {
      type: 'array',
      items: { type: 'string' },
    },
    requiresAuth: { type: 'boolean' },
    rateLimit: {
      type: 'object',
      properties: {
        calls: { type: 'integer', minimum: 1 },
        windowMs: { type: 'integer', minimum: 1000 },
      },
      required: ['calls', 'windowMs'],
    },

    // Schema
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['object'] },
        properties: { type: 'object' },
        required: { type: 'array', items: { type: 'string' } },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['object'] },
        properties: { type: 'object' },
      },
    },

    // Status
    enabled: { type: 'boolean' },
    deprecated: { type: 'boolean' },
    replacedBy: { type: 'string' },

    // Metadata
    metadata: {
      type: 'object',
      properties: {
        version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
        lastUpdated: { type: 'string' },
      },
    },
  },
};
