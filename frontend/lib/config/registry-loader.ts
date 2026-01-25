/**
 * Registry Loader
 *
 * Integrates YAML configurations with the Tool, Agent, and Workflow registries.
 * Provides a unified initialization point for loading configurations.
 */

import { ConfigManager, getConfigManager } from './config-manager';
import type { AgentConfig, ToolConfig, WorkflowConfig } from '@/lib/types/config';
import type { AgentDefinition } from '@/lib/types/agent-registry';
import type { ToolDefinition } from '@/lib/types/tool-registry';

// ============================================================================
// Conversion Functions
// ============================================================================

/**
 * Convert AgentConfig (from YAML) to AgentDefinition (for registry)
 */
export function convertAgentConfigToDefinition(config: AgentConfig): Partial<AgentDefinition> {
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    version: config.metadata?.version || '1.0.0',
    type: config.type,
    llm: config.llm ? {
      model: config.llm.model,
      temperature: config.llm.temperature,
      maxTokens: config.llm.maxTokens,
      systemPrompt: config.llm.systemPromptFile,
    } : undefined,
    domain: config.domain,
    capabilities: config.capabilities,
    intents: config.intents,
    produces: config.produces ? {
      stateFields: config.produces.stateFields,
      messageTypes: config.produces.messageTypes || [],
    } : { stateFields: [], messageTypes: [] },
    consumes: config.consumes ? {
      required: config.consumes.required,
      optional: config.consumes.optional,
    } : { required: [], optional: [] },
    tools: config.tools,
    dependencies: config.dependencies,
    execution: {
      canRunInParallel: config.execution.canRunInParallel,
      maxExecutionTimeMs: config.execution.maxExecutionTimeMs,
      retryPolicy: config.execution.retryPolicy,
    },
    enabled: config.enabled,
    metrics: {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      avgExecutionTimeMs: 0,
    },
    createdAt: new Date(config.metadata?.lastUpdated || Date.now()),
    updatedAt: new Date(),
    deprecated: false,
  };
}

/**
 * Convert ToolConfig (from YAML) to partial ToolDefinition (for registry)
 * Note: Implementation function must be provided separately
 */
export function convertToolConfigToDefinition(config: ToolConfig): Partial<ToolDefinition> {
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    version: config.metadata?.version || '1.0.0',
    category: config.category,
    domain: config.domain || [],
    inputSchema: config.inputSchema || {
      type: 'object',
      properties: {},
      required: [],
    },
    outputSchema: config.outputSchema || {
      type: 'object',
      properties: {},
    },
    cost: config.cost,
    avgLatencyMs: config.avgLatencyMs,
    maxLatencyMs: config.maxLatencyMs,
    reliability: config.reliability || 0.95,
    dependencies: config.dependencies,
    agentIds: config.agentIds,
    requiresAuth: config.requiresAuth,
    rateLimit: config.rateLimit,
    metrics: {
      totalCalls: 0,
      successCalls: 0,
      failureCalls: 0,
    },
    createdAt: new Date(config.metadata?.lastUpdated || Date.now()),
    updatedAt: new Date(),
    deprecated: config.deprecated || false,
    replacedBy: config.replacedBy,
  };
}

// ============================================================================
// Initialization State
// ============================================================================

let configInitialized = false;

/**
 * Check if configurations have been initialized
 */
export function isConfigInitialized(): boolean {
  return configInitialized;
}

// ============================================================================
// Main Loader Function
// ============================================================================

/**
 * Load all configurations from YAML files
 *
 * This function loads configurations but does NOT automatically
 * register them with the registries. Use loadAndRegisterAll() for that.
 */
export async function loadConfigurations(): Promise<void> {
  const config = getConfigManager();

  if (config.isLoaded()) {
    console.log('⏭️  [REGISTRY-LOADER] Configurations already loaded');
    return;
  }

  console.log('📦 [REGISTRY-LOADER] Loading configurations from YAML...');
  const startTime = Date.now();

  try {
    await config.loadAll();
    configInitialized = true;

    const duration = Date.now() - startTime;
    console.log(`✅ [REGISTRY-LOADER] Configurations loaded in ${duration}ms`);
  } catch (error: any) {
    console.error('❌ [REGISTRY-LOADER] Failed to load configurations:', error.message);
    throw error;
  }
}

/**
 * Load configurations and optionally enable hot reload
 */
export async function initializeConfigurations(options: {
  enableHotReload?: boolean;
} = {}): Promise<void> {
  await loadConfigurations();

  if (options.enableHotReload && process.env.NODE_ENV === 'development') {
    const config = getConfigManager();
    config.enableHotReload();
  }
}

/**
 * Get configuration summary for logging
 */
export function getConfigurationSummary(): {
  agents: number;
  tools: number;
  workflows: number;
  rules: number;
  features: number;
  enabled: {
    agents: string[];
    tools: string[];
    features: string[];
  };
  disabled: {
    agents: string[];
    features: string[];
  };
} {
  const config = getConfigManager();
  const summary = config.getSummary();

  const agents = config.getAllAgentConfigs();
  const tools = config.getAllToolConfigs();
  const features = config.getAllFeatureFlags();

  return {
    agents: summary.agents,
    tools: summary.tools,
    workflows: summary.workflows,
    rules: summary.rules,
    features: summary.features,
    enabled: {
      agents: agents.filter((a) => a.enabled).map((a) => a.id),
      tools: tools.filter((t) => t.enabled).map((t) => t.id),
      features: features.filter((f) => f.enabled).map((f) => f.id),
    },
    disabled: {
      agents: agents.filter((a) => !a.enabled).map((a) => a.id),
      features: features.filter((f) => !f.enabled).map((f) => f.id),
    },
  };
}

/**
 * Verify configurations are valid and complete
 */
export function verifyConfigurations(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const config = getConfigManager();
  const errors: string[] = [];
  const warnings: string[] = [];

  // Verify agents
  const agents = config.getAllAgentConfigs();
  const agentIds = new Set(agents.map((a) => a.id));

  for (const agent of agents) {
    // Check dependencies reference valid agents
    for (const dep of agent.dependencies?.upstream || []) {
      if (!agentIds.has(dep)) {
        warnings.push(`Agent ${agent.id} has upstream dependency on unknown agent: ${dep}`);
      }
    }
    for (const dep of agent.dependencies?.downstream || []) {
      if (!agentIds.has(dep)) {
        warnings.push(`Agent ${agent.id} has downstream dependency on unknown agent: ${dep}`);
      }
    }

    // Check feature flag exists
    if (agent.featureFlag) {
      const flag = config.getFeatureFlag(agent.featureFlag);
      if (!flag) {
        warnings.push(`Agent ${agent.id} references unknown feature flag: ${agent.featureFlag}`);
      }
    }
  }

  // Verify tools
  const tools = config.getAllToolConfigs();
  const toolIds = new Set(tools.map((t) => t.id));

  for (const tool of tools) {
    // Check internal dependencies reference valid tools
    for (const dep of tool.dependencies?.internal || []) {
      if (!toolIds.has(dep)) {
        warnings.push(`Tool ${tool.id} has internal dependency on unknown tool: ${dep}`);
      }
    }
  }

  // Verify workflows
  const workflows = config.getAllWorkflowConfigs();

  for (const workflow of workflows) {
    // Check stages reference valid agents
    for (const stage of workflow.stages || []) {
      if (!agentIds.has(stage.agentId)) {
        errors.push(`Workflow ${workflow.id} stage ${stage.id} references unknown agent: ${stage.agentId}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get enabled agents based on feature flags
 */
export function getEnabledAgents(): AgentConfig[] {
  const config = getConfigManager();
  const agents = config.getAllAgentConfigs();

  return agents.filter((agent) => {
    if (!agent.enabled) return false;

    // Check feature flag if specified
    if (agent.featureFlag) {
      return config.isFeatureEnabled(agent.featureFlag);
    }

    return true;
  });
}

/**
 * Get enabled tools
 */
export function getEnabledTools(): ToolConfig[] {
  const config = getConfigManager();
  return config.getAllToolConfigs().filter((tool) => tool.enabled);
}

/**
 * Get enabled workflows
 */
export function getEnabledWorkflows(): WorkflowConfig[] {
  const config = getConfigManager();
  return config.getAllWorkflowConfigs().filter((workflow) => workflow.enabled);
}

/**
 * Get agent configuration by ID
 */
export function getAgentConfig(agentId: string): AgentConfig | undefined {
  return getConfigManager().getAgentConfig(agentId);
}

/**
 * Get tool configuration by ID
 */
export function getToolConfig(toolId: string): ToolConfig | undefined {
  return getConfigManager().getToolConfig(toolId);
}

/**
 * Get workflow configuration by ID
 */
export function getWorkflowConfig(workflowId: string): WorkflowConfig | undefined {
  return getConfigManager().getWorkflowConfig(workflowId);
}

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(featureId: string, userId?: string): boolean {
  return getConfigManager().isFeatureEnabled(featureId, userId);
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Shutdown configuration system
 */
export function shutdownConfigurations(): void {
  const config = getConfigManager();
  config.disableHotReload();
  config.clear();
  configInitialized = false;
  console.log('🛑 [REGISTRY-LOADER] Configuration system shutdown');
}
