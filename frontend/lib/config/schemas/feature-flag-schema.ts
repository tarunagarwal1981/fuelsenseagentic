/**
 * Feature Flag Configuration Schema
 *
 * JSON Schema definition for validating feature flag YAML configurations.
 */

import type { JSONSchema } from '../yaml-loader';

export const featureFlagSchema: JSONSchema = {
  type: 'object',
  required: ['id', 'name', 'enabled'],
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

    // Status
    enabled: { type: 'boolean' },

    // Rollout
    rolloutPercentage: {
      type: 'integer',
      minimum: 0,
      maximum: 100,
    },

    // User targeting
    enabledFor: {
      type: 'array',
      items: { type: 'string' },
    },
    disabledFor: {
      type: 'array',
      items: { type: 'string' },
    },

    // Expiration
    expiresAt: { type: 'string' },

    // Dependencies
    dependencies: {
      type: 'array',
      items: { type: 'string' },
    },
  },
};

// Schema for a file containing multiple feature flags
export const featureFlagsFileSchema: JSONSchema = {
  type: 'object',
  required: ['features'],
  properties: {
    features: {
      type: 'array',
      items: featureFlagSchema,
    },
  },
};
