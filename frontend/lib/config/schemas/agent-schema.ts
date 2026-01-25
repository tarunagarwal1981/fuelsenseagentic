/**
 * Agent Configuration Schema
 *
 * JSON Schema definition for validating agent YAML configurations.
 */

import type { JSONSchema } from '../yaml-loader';

export const agentConfigSchema: JSONSchema = {
  type: 'object',
  required: ['id', 'name', 'type', 'domain', 'capabilities', 'tools', 'enabled'],
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
    type: {
      type: 'string',
      enum: ['supervisor', 'specialist', 'coordinator', 'finalizer', 'deterministic', 'llm', 'hybrid'],
    },

    // LLM Configuration
    llm: {
      type: 'object',
      properties: {
        model: { type: 'string' },
        temperature: { type: 'number', minimum: 0, maximum: 2 },
        maxTokens: { type: 'integer', minimum: 100, maximum: 10000 },
        systemPromptFile: { type: 'string' },
      },
    },

    // Domain and capabilities
    domain: {
      type: 'array',
      items: { type: 'string' },
    },
    capabilities: {
      type: 'array',
      items: { type: 'string' },
    },
    intents: {
      type: 'array',
      items: { type: 'string' },
    },

    // Tools
    tools: {
      type: 'object',
      properties: {
        required: {
          type: 'array',
          items: { type: 'string' },
        },
        optional: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['required'],
    },

    // Dependencies
    dependencies: {
      type: 'object',
      properties: {
        upstream: {
          type: 'array',
          items: { type: 'string' },
        },
        downstream: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },

    // Execution
    execution: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['deterministic', 'llm', 'hybrid', 'workflow'],
        },
        canRunInParallel: { type: 'boolean' },
        maxExecutionTimeMs: { type: 'integer', minimum: 1000, maximum: 300000 },
        retryPolicy: {
          type: 'object',
          properties: {
            maxRetries: { type: 'integer', minimum: 0, maximum: 10 },
            backoffMs: { type: 'integer', minimum: 100, maximum: 60000 },
            backoffType: { type: 'string', enum: ['linear', 'exponential'] },
          },
          required: ['maxRetries', 'backoffMs'],
        },
        costPerCall: { type: 'number', minimum: 0 },
      },
    },

    // Contract
    produces: {
      type: 'object',
      properties: {
        stateFields: {
          type: 'array',
          items: { type: 'string' },
        },
        messageTypes: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
    consumes: {
      type: 'object',
      properties: {
        required: {
          type: 'array',
          items: { type: 'string' },
        },
        optional: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },

    // Validation
    validation: {
      type: 'object',
      properties: {
        preExecution: {
          type: 'array',
          items: { type: 'string' },
        },
        postExecution: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },

    // Human approval
    humanApproval: {
      type: 'object',
      properties: {
        required: { type: 'boolean' },
        threshold: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            operator: { type: 'string', enum: ['<', '>', '<=', '>=', '==', '!='] },
            value: { type: 'number' },
          },
          required: ['field', 'operator', 'value'],
        },
      },
      required: ['required'],
    },

    // Status
    enabled: { type: 'boolean' },
    featureFlag: { type: 'string' },

    // Metadata
    metadata: {
      type: 'object',
      properties: {
        version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
        lastUpdated: { type: 'string' },
        maintainer: { type: 'string' },
        documentation: { type: 'string' },
      },
    },
  },
};

// Legacy format schema (for backward compatibility)
export const legacyAgentConfigSchema: JSONSchema = {
  type: 'object',
  required: ['agent_id', 'agent_name', 'agent_type'],
  properties: {
    agent_id: { type: 'string' },
    agent_name: { type: 'string' },
    agent_type: { type: 'string', enum: ['deterministic', 'llm', 'hybrid'] },
    description: { type: 'string' },
    capabilities: { type: 'array', items: { type: 'string' } },
    dependencies: { type: 'array', items: { type: 'string' } },
    tools: { type: 'array', items: { type: 'string' } },
    status: { type: 'string', enum: ['available', 'beta', 'coming_soon'] },
  },
};
