/**
 * Configuration Manager
 *
 * Singleton manager for all FuelSense 360 configurations.
 * Provides centralized access to agent, tool, workflow, business rules,
 * and feature flag configurations loaded from YAML files.
 */

import {
  loadAllYAMLFromDirectory,
  loadYAML,
  watchYAMLDirectory,
  stopAllWatchers,
} from './yaml-loader';
import type {
  AgentConfig,
  ToolConfig,
  WorkflowConfig,
  BusinessRule,
  BusinessRulesConfig,
  FeatureFlag,
  FeatureFlagsConfig,
  FuelSenseConfig,
  DataPolicyConfig,
} from '@/lib/types/config';

// ============================================================================
// Configuration Manager
// ============================================================================

export class ConfigManager {
  private static instance: ConfigManager;
  private configs: Map<string, any> = new Map();
  private loaded: boolean = false;
  private cleanupFunctions: Array<() => void> = [];

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Check if configurations have been loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  // ==========================================================================
  // Load Methods
  // ==========================================================================

  /**
   * Load all configurations from YAML files
   */
  async loadAll(): Promise<void> {
    console.log('📦 [CONFIG-MANAGER] Loading all configurations...');
    const startTime = Date.now();

    try {
      await Promise.all([
        this.loadAgentConfigs(),
        this.loadToolConfigs(),
        this.loadWorkflowConfigs(),
        this.loadBusinessRules(),
        this.loadFeatureFlags(),
        this.loadDataPolicies(),
      ]);

      this.loaded = true;
      const duration = Date.now() - startTime;
      console.log(`✅ [CONFIG-MANAGER] All configurations loaded in ${duration}ms`);
      this.logSummary();
    } catch (error: any) {
      console.error('❌ [CONFIG-MANAGER] Failed to load configurations:', error.message);
      throw error;
    }
  }

  /**
   * Load agent configurations
   */
  async loadAgentConfigs(): Promise<void> {
    const configs = loadAllYAMLFromDirectory<any>('agents');

    configs.forEach((rawConfig, id) => {
      // Normalize YAML format to AgentConfig format
      const config = this.normalizeAgentConfig(rawConfig);
      this.configs.set(`agent:${config.id || id}`, config);
    });

    console.log(`   🤖 Agents: ${configs.size} loaded`);
  }

  /**
   * Load tool configurations
   */
  async loadToolConfigs(): Promise<void> {
    const configs = loadAllYAMLFromDirectory<ToolConfig>('tools');

    configs.forEach((config, id) => {
      this.configs.set(`tool:${config.id || id}`, config);
    });

    console.log(`   🔧 Tools: ${configs.size} loaded`);
  }

  /**
   * Load workflow configurations
   */
  async loadWorkflowConfigs(): Promise<void> {
    const configs = loadAllYAMLFromDirectory<any>('workflows');

    configs.forEach((rawConfig, id) => {
      // Normalize YAML format to WorkflowConfig format
      const config = this.normalizeWorkflowConfig(rawConfig);
      this.configs.set(`workflow:${config.id || id}`, config);
    });

    console.log(`   🔄 Workflows: ${configs.size} loaded`);
  }

  /**
   * Load business rules
   */
  async loadBusinessRules(): Promise<void> {
    try {
      // Load rules from business-rules directory
      const ruleFiles = loadAllYAMLFromDirectory<BusinessRule | BusinessRulesConfig>(
        'business-rules'
      );

      let ruleCount = 0;
      ruleFiles.forEach((content, filename) => {
        // Handle both single rule and rules array format
        if ('rules' in content && Array.isArray(content.rules)) {
          // Multiple rules in one file
          content.rules.forEach((rule: BusinessRule) => {
            this.configs.set(`rule:${rule.id}`, rule);
            ruleCount++;
          });
        } else if ('id' in content) {
          // Single rule file
          this.configs.set(`rule:${content.id}`, content);
          ruleCount++;
        }
      });

      console.log(`   📋 Business rules: ${ruleCount} loaded`);
    } catch (error) {
      console.log(`   📋 Business rules: 0 loaded (directory may not exist)`);
    }
  }

  /**
   * Load feature flags
   */
  async loadFeatureFlags(): Promise<void> {
    try {
      // Try to load from YAML first
      const flagFiles = loadAllYAMLFromDirectory<FeatureFlagsConfig | FeatureFlag>(
        'feature-flags'
      );

      let flagCount = 0;
      flagFiles.forEach((content, filename) => {
        // Handle both single flag and flags array format
        if ('features' in content && Array.isArray(content.features)) {
          content.features.forEach((flag: FeatureFlag) => {
            this.configs.set(`feature:${flag.id}`, flag);
            flagCount++;
          });
        } else if ('id' in content) {
          this.configs.set(`feature:${content.id}`, content);
          flagCount++;
        }
      });

      console.log(`   🚩 Feature flags: ${flagCount} loaded`);
    } catch (error) {
      console.log(`   🚩 Feature flags: 0 loaded (directory may not exist)`);
    }
  }

  /**
   * Load data-policy configurations (domain-specific data sources)
   */
  async loadDataPolicies(): Promise<void> {
    try {
      const policyFiles = loadAllYAMLFromDirectory<DataPolicyConfig>('data-policies');
      policyFiles.forEach((content, id) => {
        const policyId = content?.id ?? id;
        this.configs.set(`data-policy:${policyId}`, content);
      });
      console.log(`   📂 Data policies: ${policyFiles.size} loaded`);
    } catch (error) {
      console.log(`   📂 Data policies: 0 loaded (directory may not exist)`);
    }
  }

  // ==========================================================================
  // Normalization Helpers
  // ==========================================================================

  /**
   * Normalize raw YAML agent config to AgentConfig format
   */
  private normalizeAgentConfig(raw: any): AgentConfig {
    return {
      id: raw.id || raw.agent_id,
      name: raw.name || raw.agent_name,
      description: raw.description,
      type: this.normalizeAgentType(raw.type || raw.agent_type),
      llm: raw.llm,
      domain: raw.domain || [],
      capabilities: raw.capabilities || [],
      intents: raw.intents || [],
      tools: {
        required: raw.tools?.required || raw.tools || [],
        optional: raw.tools?.optional || [],
      },
      dependencies: {
        upstream: raw.dependencies?.upstream || raw.dependencies || [],
        downstream: raw.dependencies?.downstream || [],
      },
      execution: {
        type: raw.execution?.type,
        canRunInParallel: raw.execution?.canRunInParallel ?? false,
        maxExecutionTimeMs: raw.execution?.maxExecutionTimeMs || raw.execution?.max_duration_ms || 30000,
        retryPolicy: {
          maxRetries: raw.execution?.retryPolicy?.maxRetries || raw.execution?.retry_strategy?.max_retries || 3,
          backoffMs: raw.execution?.retryPolicy?.backoffMs || 1000,
          backoffType: raw.execution?.retry_strategy?.backoff || 'exponential',
        },
        costPerCall: raw.execution?.cost_per_call,
      },
      produces: raw.produces
        ? { stateFields: Array.isArray(raw.produces) ? raw.produces : raw.produces.stateFields || [] }
        : undefined,
      consumes: raw.consumes,
      validation: raw.validation
        ? {
            preExecution: raw.validation.pre_execution || raw.validation.preExecution,
            postExecution: raw.validation.post_execution || raw.validation.postExecution,
          }
        : undefined,
      humanApproval: raw.human_approval || raw.humanApproval,
      enabled: raw.enabled ?? (raw.status === 'available'),
      featureFlag: raw.featureFlag,
      dataPolicy: raw.dataPolicy,
      metadata: raw.metadata
        ? {
            version: raw.metadata.version,
            lastUpdated: raw.metadata.last_updated || raw.metadata.lastUpdated,
            maintainer: raw.metadata.maintainer,
            documentation: raw.metadata.documentation,
          }
        : undefined,
    };
  }

  /**
   * Normalize agent type string
   */
  private normalizeAgentType(type: string): AgentConfig['type'] {
    const typeMap: Record<string, AgentConfig['type']> = {
      deterministic: 'specialist',
      llm: 'supervisor',
      hybrid: 'coordinator',
      supervisor: 'supervisor',
      specialist: 'specialist',
      coordinator: 'coordinator',
      finalizer: 'finalizer',
    };
    return typeMap[type] || 'specialist';
  }

  /**
   * Normalize raw YAML workflow config to WorkflowConfig format
   */
  private normalizeWorkflowConfig(raw: any): WorkflowConfig {
    return {
      id: raw.id || raw.workflow_id,
      name: raw.name || raw.workflow_name,
      description: raw.description,
      queryTypes: raw.queryTypes || raw.query_types || [],
      intentPatterns: raw.intentPatterns || raw.intent_patterns,
      stages: (raw.stages || raw.steps || []).map((stage: any, index: number) => ({
        id: stage.id || stage.step_id,
        agentId: stage.agentId || stage.agent_id,
        order: stage.order ?? index + 1,
        required: stage.required ?? true,
        skipIf: stage.skipIf || stage.skip_if,
        parallelWith: stage.parallelWith || stage.parallel_with,
      })),
      execution: {
        maxTotalTimeMs: raw.execution?.maxTotalTimeMs || raw.execution?.max_total_time_ms || 120000,
        allowParallelStages: raw.execution?.allowParallelStages ?? raw.execution?.allow_parallel_stages ?? false,
        continueOnError: raw.execution?.continueOnError ?? raw.execution?.continue_on_error ?? true,
      },
      requiredInputs: raw.requiredInputs || raw.required_inputs || [],
      finalOutputs: raw.finalOutputs || raw.final_outputs || [],
      enabled: raw.enabled ?? true,
      metadata: raw.metadata,
    };
  }

  // ==========================================================================
  // Get Methods
  // ==========================================================================

  /**
   * Get a configuration by key
   */
  get<T>(key: string): T | undefined {
    return this.configs.get(key);
  }

  /**
   * Get agent configuration by ID
   */
  getAgentConfig(agentId: string): AgentConfig | undefined {
    return this.get<AgentConfig>(`agent:${agentId}`);
  }

  /**
   * Get all agent configurations
   */
  getAllAgentConfigs(): AgentConfig[] {
    const agents: AgentConfig[] = [];
    this.configs.forEach((value, key) => {
      if (key.startsWith('agent:')) {
        agents.push(value);
      }
    });
    return agents;
  }

  /**
   * Get tool configuration by ID
   */
  getToolConfig(toolId: string): ToolConfig | undefined {
    return this.get<ToolConfig>(`tool:${toolId}`);
  }

  /**
   * Get all tool configurations
   */
  getAllToolConfigs(): ToolConfig[] {
    const tools: ToolConfig[] = [];
    this.configs.forEach((value, key) => {
      if (key.startsWith('tool:')) {
        tools.push(value);
      }
    });
    return tools;
  }

  /**
   * Get workflow configuration by ID
   */
  getWorkflowConfig(workflowId: string): WorkflowConfig | undefined {
    return this.get<WorkflowConfig>(`workflow:${workflowId}`);
  }

  /**
   * Get data-policy configuration by ID (domain-specific data sources)
   */
  getDataPolicy(policyId: string): DataPolicyConfig | undefined {
    return this.get<DataPolicyConfig>(`data-policy:${policyId}`);
  }

  /**
   * Get all workflow configurations
   */
  getAllWorkflowConfigs(): WorkflowConfig[] {
    const workflows: WorkflowConfig[] = [];
    this.configs.forEach((value, key) => {
      if (key.startsWith('workflow:')) {
        workflows.push(value);
      }
    });
    return workflows;
  }

  /**
   * Get business rule by ID
   */
  getBusinessRule(ruleId: string): BusinessRule | undefined {
    return this.get<BusinessRule>(`rule:${ruleId}`);
  }

  /**
   * Get all business rules
   */
  getAllBusinessRules(): BusinessRule[] {
    const rules: BusinessRule[] = [];
    this.configs.forEach((value, key) => {
      if (key.startsWith('rule:')) {
        rules.push(value);
      }
    });
    return rules;
  }

  /**
   * Get business rules by category
   */
  getBusinessRulesByCategory(category: string): BusinessRule[] {
    return this.getAllBusinessRules().filter((rule) => rule.category === category);
  }

  /**
   * Check if a feature is enabled
   */
  isFeatureEnabled(featureId: string, userId?: string): boolean {
    const flag = this.get<FeatureFlag>(`feature:${featureId}`);

    if (!flag) {
      return false;
    }

    // Check if disabled for specific user
    if (userId && flag.disabledFor?.includes(userId)) {
      return false;
    }

    // Check if enabled for specific user
    if (userId && flag.enabledFor?.includes(userId)) {
      return true;
    }

    // Check rollout percentage
    if (flag.rolloutPercentage !== undefined && flag.rolloutPercentage < 100) {
      // Use userId for consistent rollout, or random if no userId
      const hash = userId ? this.hashString(userId + featureId) : Math.random() * 100;
      return hash < flag.rolloutPercentage && flag.enabled;
    }

    // Check expiration
    if (flag.expiresAt) {
      const expirationDate = new Date(flag.expiresAt);
      if (new Date() > expirationDate) {
        return false;
      }
    }

    // Check dependencies
    if (flag.dependencies) {
      for (const depId of flag.dependencies) {
        if (!this.isFeatureEnabled(depId, userId)) {
          return false;
        }
      }
    }

    return flag.enabled;
  }

  /**
   * Get feature flag by ID
   */
  getFeatureFlag(featureId: string): FeatureFlag | undefined {
    return this.get<FeatureFlag>(`feature:${featureId}`);
  }

  /**
   * Get all feature flags
   */
  getAllFeatureFlags(): FeatureFlag[] {
    const flags: FeatureFlag[] = [];
    this.configs.forEach((value, key) => {
      if (key.startsWith('feature:')) {
        flags.push(value);
      }
    });
    return flags;
  }

  // ==========================================================================
  // Hot Reload
  // ==========================================================================

  /**
   * Enable hot reload for development
   */
  enableHotReload(): void {
    if (process.env.NODE_ENV !== 'development') {
      console.log('⏭️  [CONFIG-MANAGER] Hot reload only available in development');
      return;
    }

    console.log('🔥 [CONFIG-MANAGER] Enabling hot reload...');

    // Watch agents directory
    const unwatchAgents = watchYAMLDirectory<any>('agents', (id, data) => {
      if (data) {
        const config = this.normalizeAgentConfig(data);
        this.configs.set(`agent:${config.id || id}`, config);
        console.log(`🔄 [CONFIG-MANAGER] Agent config updated: ${id}`);
      } else {
        this.configs.delete(`agent:${id}`);
        console.log(`🗑️  [CONFIG-MANAGER] Agent config removed: ${id}`);
      }
    });
    this.cleanupFunctions.push(unwatchAgents);

    // Watch tools directory
    const unwatchTools = watchYAMLDirectory<ToolConfig>('tools', (id, data) => {
      if (data) {
        this.configs.set(`tool:${data.id || id}`, data);
        console.log(`🔄 [CONFIG-MANAGER] Tool config updated: ${id}`);
      } else {
        this.configs.delete(`tool:${id}`);
        console.log(`🗑️  [CONFIG-MANAGER] Tool config removed: ${id}`);
      }
    });
    this.cleanupFunctions.push(unwatchTools);

    // Watch workflows directory
    const unwatchWorkflows = watchYAMLDirectory<any>('workflows', (id, data) => {
      if (data) {
        const config = this.normalizeWorkflowConfig(data);
        this.configs.set(`workflow:${config.id || id}`, config);
        console.log(`🔄 [CONFIG-MANAGER] Workflow config updated: ${id}`);
      } else {
        this.configs.delete(`workflow:${id}`);
        console.log(`🗑️  [CONFIG-MANAGER] Workflow config removed: ${id}`);
      }
    });
    this.cleanupFunctions.push(unwatchWorkflows);

    console.log('✅ [CONFIG-MANAGER] Hot reload enabled');
  }

  /**
   * Disable hot reload and cleanup watchers
   */
  disableHotReload(): void {
    this.cleanupFunctions.forEach((cleanup) => cleanup());
    this.cleanupFunctions = [];
    stopAllWatchers();
    console.log('🛑 [CONFIG-MANAGER] Hot reload disabled');
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Clear all loaded configurations
   */
  clear(): void {
    this.configs.clear();
    this.loaded = false;
    console.log('🗑️  [CONFIG-MANAGER] All configurations cleared');
  }

  /**
   * Reload all configurations
   */
  async reload(): Promise<void> {
    console.log('🔄 [CONFIG-MANAGER] Reloading all configurations...');
    this.clear();
    await this.loadAll();
  }

  /**
   * Get configuration summary
   */
  getSummary(): Record<string, number> {
    let agents = 0;
    let tools = 0;
    let workflows = 0;
    let rules = 0;
    let features = 0;

    this.configs.forEach((_, key) => {
      if (key.startsWith('agent:')) agents++;
      else if (key.startsWith('tool:')) tools++;
      else if (key.startsWith('workflow:')) workflows++;
      else if (key.startsWith('rule:')) rules++;
      else if (key.startsWith('feature:')) features++;
    });

    return { agents, tools, workflows, rules, features };
  }

  /**
   * Log configuration summary
   */
  private logSummary(): void {
    const summary = this.getSummary();
    console.log('📊 [CONFIG-MANAGER] Summary:');
    console.log(`   Agents: ${summary.agents}`);
    console.log(`   Tools: ${summary.tools}`);
    console.log(`   Workflows: ${summary.workflows}`);
    console.log(`   Business Rules: ${summary.rules}`);
    console.log(`   Feature Flags: ${summary.features}`);
  }

  /**
   * Simple hash function for consistent rollout
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash % 100);
  }

  /**
   * Get full configuration object
   */
  getFullConfig(): FuelSenseConfig {
    const agents = new Map<string, AgentConfig>();
    const tools = new Map<string, ToolConfig>();
    const workflows = new Map<string, WorkflowConfig>();
    const businessRules = new Map<string, BusinessRule>();
    const featureFlags = new Map<string, FeatureFlag>();

    this.configs.forEach((value, key) => {
      const [type, id] = key.split(':');
      switch (type) {
        case 'agent':
          agents.set(id, value);
          break;
        case 'tool':
          tools.set(id, value);
          break;
        case 'workflow':
          workflows.set(id, value);
          break;
        case 'rule':
          businessRules.set(id, value);
          break;
        case 'feature':
          featureFlags.set(id, value);
          break;
      }
    });

    return {
      agents,
      tools,
      workflows,
      businessRules,
      featureFlags,
      metadata: {
        loadedAt: new Date(),
        configVersion: '1.0.0',
      },
    };
  }
}

// Export singleton instance getter
export function getConfigManager(): ConfigManager {
  return ConfigManager.getInstance();
}
