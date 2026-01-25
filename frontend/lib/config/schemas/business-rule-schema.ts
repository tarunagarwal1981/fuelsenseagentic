/**
 * Business Rule Configuration Schema
 *
 * JSON Schema definition for validating business rule YAML configurations.
 */

import type { JSONSchema } from '../yaml-loader';

export const businessRuleSchema: JSONSchema = {
  type: 'object',
  required: ['id', 'name', 'category', 'rule', 'enabled'],
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
      enum: ['safety', 'cost', 'compliance', 'operational'],
    },

    // Rule definition
    rule: {
      type: 'object',
      required: ['condition', 'action', 'priority'],
      properties: {
        condition: { type: 'string' },
        action: {
          type: 'string',
          enum: ['add_warning', 'block_operation', 'require_approval', 'add_info', 'modify_value'],
        },
        priority: { type: 'integer', minimum: 1, maximum: 100 },
        severity: {
          type: 'string',
          enum: ['blocking', 'warning', 'info'],
        },
      },
    },

    // Parameters
    parameters: {
      type: 'object',
      additionalProperties: true,
    },

    // Timing
    timing: {
      type: 'string',
      enum: ['pre_execution', 'post_execution', 'always'],
    },
    appliesTo: {
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
        rationale: { type: 'string' },
      },
    },
  },
};

// Schema for a file containing multiple rules
export const businessRulesFileSchema: JSONSchema = {
  type: 'object',
  required: ['rules'],
  properties: {
    rules: {
      type: 'array',
      items: businessRuleSchema,
    },
  },
};
