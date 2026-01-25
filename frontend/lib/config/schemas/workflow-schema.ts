/**
 * Workflow Configuration Schema
 *
 * JSON Schema definition for validating workflow YAML configurations.
 */

import type { JSONSchema } from '../yaml-loader';

export const workflowConfigSchema: JSONSchema = {
  type: 'object',
  required: ['id', 'name', 'stages', 'execution', 'enabled'],
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

    // Query matching
    queryTypes: {
      type: 'array',
      items: { type: 'string' },
    },
    intentPatterns: {
      type: 'array',
      items: { type: 'string' },
    },

    // Stages
    stages: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'agentId', 'order'],
        properties: {
          id: { type: 'string' },
          agentId: { type: 'string' },
          order: { type: 'integer', minimum: 1 },
          required: { type: 'boolean' },
          skipIf: { type: 'object' },
          parallelWith: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },

    // Execution
    execution: {
      type: 'object',
      required: ['maxTotalTimeMs'],
      properties: {
        maxTotalTimeMs: { type: 'integer', minimum: 1000, maximum: 600000 },
        allowParallelStages: { type: 'boolean' },
        continueOnError: { type: 'boolean' },
      },
    },

    // Contract
    requiredInputs: {
      type: 'array',
      items: { type: 'string' },
    },
    finalOutputs: {
      type: 'array',
      items: { type: 'string' },
    },

    // Status
    enabled: { type: 'boolean' },

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
