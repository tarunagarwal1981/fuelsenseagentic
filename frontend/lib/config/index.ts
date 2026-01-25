/**
 * Configuration Module Index
 *
 * Re-exports all configuration utilities for easy import.
 */

// Core utilities
export {
  loadYAML,
  loadYAMLAsync,
  loadAllYAMLFromDirectory,
  loadAllYAMLFromDirectoryAsync,
  validateAgainstSchema,
  validateYAML,
  watchYAML,
  watchYAMLDirectory,
  stopAllWatchers,
  yamlExists,
  listYAMLFiles,
  getConfigDir,
} from './yaml-loader';
export type { JSONSchema, LoadYAMLOptions } from './yaml-loader';

// Configuration Manager
export { ConfigManager, getConfigManager } from './config-manager';

// Registry Loader
export {
  initializeConfigurations,
  loadConfigurations,
  getConfigurationSummary,
  verifyConfigurations,
  getEnabledAgents,
  getEnabledTools,
  getEnabledWorkflows,
  getAgentConfig,
  getToolConfig,
  getWorkflowConfig,
  isFeatureEnabled,
  isConfigInitialized,
  shutdownConfigurations,
  convertAgentConfigToDefinition,
  convertToolConfigToDefinition,
} from './registry-loader';

// Schemas
export {
  agentConfigSchema,
  legacyAgentConfigSchema,
  toolConfigSchema,
  workflowConfigSchema,
  businessRuleSchema,
  businessRulesFileSchema,
  featureFlagSchema,
  featureFlagsFileSchema,
} from './schemas';
