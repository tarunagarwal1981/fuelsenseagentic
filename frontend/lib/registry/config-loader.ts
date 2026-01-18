/**
 * Configuration Loader
 * Loads YAML configuration files and provides type-safe access
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYAML } from 'yaml';

export interface AgentConfig {
  agent_id: string;
  agent_name: string;
  agent_type: 'deterministic' | 'llm' | 'hybrid';
  description: string;
  capabilities?: string[];
  dependencies?: string[];
  tools?: string[];
  status?: 'available' | 'beta' | 'coming_soon';
  // Extended fields for complete configuration
  execution?: {
    type: string;
    average_duration_ms?: number;
    max_duration_ms?: number;
    cost_per_call?: number;
    retry_strategy?: {
      max_retries?: number;
      backoff?: string;
    };
  };
  produces?: string[];
  consumes?: {
    required?: string[];
    optional?: string[];
  };
  validation?: {
    pre_execution?: string[];
    post_execution?: string[];
  };
  human_approval?: {
    required: boolean;
    threshold?: {
      field: string;
      operator: string;
      value: number;
    } | null;
  };
  metadata?: {
    version?: string;
    last_updated?: string;
    maintainer?: string;
    documentation?: string;
  };
}

export interface WorkflowConfig {
  workflow_id: string;
  workflow_name: string;
  description?: string;
  steps: Array<{
    step_id: string;
    agent_id: string;
    parallel_with?: string[];
    conditional?: {
      condition: string;
      true_next: string;
      false_next: string;
    };
  }>;
}

export interface ValidationRule {
  rule_id: string;
  rule_name: string;
  description: string;
  condition: string;
  error_message: string;
  severity: 'blocking' | 'warning' | 'info';
  enforced_by: string[];
  check_timing: 'pre_execution' | 'post_execution';
}

export interface ValidationRulesConfig {
  rules: ValidationRule[];
}

export class ConfigLoader {
  private static instance: ConfigLoader;
  private configCache: Map<string, any> = new Map();
  private configDir: string;

  private constructor() {
    // Determine config directory path
    // In development: /config
    // In production: /config (same, but resolve properly)
    this.configDir = join(process.cwd(), 'config');
    console.log('📁 ConfigLoader initialized with directory:', this.configDir);
  }

  /**
   * Singleton instance
   */
  public static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  /**
   * Load agent configuration
   */
  public loadAgentConfig(agentId: string): AgentConfig | null {
    const cacheKey = `agent:${agentId}`;
    
    // Check cache first
    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey);
    }

    const configPath = join(this.configDir, 'agents', `${agentId}.yaml`);
    
    if (!existsSync(configPath)) {
      console.warn(`⚠️  Agent config not found: ${configPath}`);
      return null;
    }

    try {
      const fileContent = readFileSync(configPath, 'utf-8');
      const config = parseYAML(fileContent) as AgentConfig;
      
      // Validate required fields
      if (!config.agent_id || !config.agent_name || !config.agent_type) {
        throw new Error(`Invalid agent config: missing required fields in ${configPath}`);
      }

      // Cache the config
      this.configCache.set(cacheKey, config);
      
      console.log(`✅ Loaded agent config: ${agentId}`);
      return config;
    } catch (error) {
      console.error(`❌ Error loading agent config ${agentId}:`, error);
      return null;
    }
  }

  /**
   * Load workflow configuration
   */
  public loadWorkflowConfig(workflowId: string): WorkflowConfig | null {
    const cacheKey = `workflow:${workflowId}`;
    
    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey);
    }

    const configPath = join(this.configDir, 'workflows', `${workflowId}.yaml`);
    
    if (!existsSync(configPath)) {
      console.warn(`⚠️  Workflow config not found: ${configPath}`);
      return null;
    }

    try {
      const fileContent = readFileSync(configPath, 'utf-8');
      const config = parseYAML(fileContent) as WorkflowConfig;
      
      if (!config.workflow_id || !config.workflow_name) {
        throw new Error(`Invalid workflow config: missing required fields in ${configPath}`);
      }

      // Steps is required for full workflow, but allow minimal configs for now
      if (!config.steps) {
        console.warn(`⚠️  Workflow config ${workflowId} missing 'steps' field (will be required in future)`);
        // Set empty steps array for now
        config.steps = [];
      }

      this.configCache.set(cacheKey, config);
      console.log(`✅ Loaded workflow config: ${workflowId}`);
      return config;
    } catch (error) {
      console.error(`❌ Error loading workflow config ${workflowId}:`, error);
      return null;
    }
  }

  /**
   * Load validation rules configuration
   */
  public loadValidationRules(): ValidationRulesConfig | null {
    const cacheKey = 'validation:core-rules';
    
    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey);
    }

    const configPath = join(this.configDir, 'validation-rules', 'core-rules.yaml');
    
    if (!existsSync(configPath)) {
      console.warn(`⚠️  Validation rules not found: ${configPath}`);
      return null;
    }

    try {
      const fileContent = readFileSync(configPath, 'utf-8');
      const config = parseYAML(fileContent) as ValidationRulesConfig;
      
      if (!config.rules || !Array.isArray(config.rules)) {
        throw new Error(`Invalid validation rules config: rules must be an array`);
      }

      this.configCache.set(cacheKey, config);
      console.log(`✅ Loaded validation rules: ${config.rules.length} rules`);
      return config;
    } catch (error) {
      console.error(`❌ Error loading validation rules:`, error);
      return null;
    }
  }

  /**
   * Clear cache (useful for testing or hot-reloading)
   */
  public clearCache(): void {
    this.configCache.clear();
    console.log('🗑️  Config cache cleared');
  }

  /**
   * Get all cached config keys (for debugging)
   */
  public getCachedKeys(): string[] {
    return Array.from(this.configCache.keys());
  }
}

// Export singleton instance
export const configLoader = ConfigLoader.getInstance();
