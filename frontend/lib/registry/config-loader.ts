/**
 * Configuration Loader
 * Loads YAML configuration files and provides type-safe access with Zod validation
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { parse as parseYAML } from 'yaml';
import { z } from 'zod';

// Conditional import for chokidar (only needed in development)
let chokidar: typeof import('chokidar') | null = null;
try {
  chokidar = require('chokidar');
} catch (e) {
  // chokidar not installed, hot-reload will be disabled
}

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

export interface BusinessRuleConfig {
  rule_id: string;
  rule_name: string;
  description: string;
  condition: string;
  action: string;
  priority: number;
  enabled: boolean;
}

// ============================================================================
// Zod Schemas for Configuration Validation
// ============================================================================

// Agent Config Schema
const AgentConfigSchema = z.object({
  agent_id: z.string().min(1),
  agent_name: z.string().min(1),
  agent_type: z.enum(['deterministic', 'llm', 'hybrid']),
  description: z.string(),
  capabilities: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  status: z.enum(['available', 'beta', 'coming_soon']).optional(),
  execution: z.object({
    type: z.string(),
    average_duration_ms: z.number().optional(),
    max_duration_ms: z.number().optional(),
    cost_per_call: z.number().optional(),
    retry_strategy: z.object({
      max_retries: z.number().optional(),
      backoff: z.string().optional(),
    }).optional(),
  }).optional(),
  produces: z.array(z.string()).optional(),
  consumes: z.object({
    required: z.array(z.string()).optional(),
    optional: z.array(z.string()).optional(),
  }).optional(),
  validation: z.object({
    pre_execution: z.array(z.string()).optional(),
    post_execution: z.array(z.string()).optional(),
  }).optional(),
  human_approval: z.object({
    required: z.boolean(),
    threshold: z.object({
      field: z.string(),
      operator: z.string(),
      value: z.number(),
    }).nullable().optional(),
  }).optional(),
  metadata: z.object({
    version: z.string().optional(),
    last_updated: z.string().optional(),
    maintainer: z.string().optional(),
    documentation: z.string().optional(),
  }).optional(),
});

// Workflow Config Schema
const WorkflowConfigSchema = z.object({
  workflow_id: z.string().min(1),
  workflow_name: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(
    z.object({
      step_id: z.string(),
      agent_id: z.string(),
      parallel_with: z.array(z.string()).optional(),
      conditional: z.object({
        condition: z.string(),
        true_next: z.string(),
        false_next: z.string(),
      }).optional(),
    })
  ),
});

// Feature Flag Schema
const FeatureFlagSchema = z.object({
  flags: z.record(z.string(), z.boolean()),
});

// Business Rule Schema
const BusinessRuleSchema = z.object({
  rule_id: z.string(),
  rule_name: z.string(),
  description: z.string(),
  condition: z.string(),
  action: z.string(),
  priority: z.number(),
  enabled: z.boolean(),
});

export class ConfigLoader {
  private static instance: ConfigLoader;
  private configCache: Map<string, any> = new Map();
  private configDir: string;
  private watcher?: any; // chokidar.FSWatcher
  private hotReloadEnabled: boolean;

  private constructor() {
    // Determine config directory path
    // In development: /config
    // In production: /config (same, but resolve properly)
    this.configDir = join(process.cwd(), 'config');
    this.hotReloadEnabled = process.env.NODE_ENV !== 'production' && chokidar !== null;
    
    console.log('📁 ConfigLoader initialized with directory:', this.configDir);
    
    if (this.hotReloadEnabled) {
      this.setupHotReload();
    } else if (process.env.NODE_ENV !== 'production' && !chokidar) {
      console.warn('⚠️  Hot-reload disabled: chokidar not installed. Run: npm install chokidar');
    }
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
   * Load agent configuration with Zod validation
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
      const rawConfig = parseYAML(fileContent);
      
      // VALIDATE WITH ZOD
      const validationResult = AgentConfigSchema.safeParse(rawConfig);
      
      if (!validationResult.success) {
        const errors = validationResult.error.issues.map((err: z.ZodIssue) => 
          `${err.path.join('.')}: ${err.message}`
        ).join(', ');
        throw new Error(`Agent config validation failed for ${agentId}: ${errors}`);
      }
      
      const config = validationResult.data as AgentConfig;
      this.configCache.set(cacheKey, config);
      
      console.log(`✅ Loaded and validated agent config: ${agentId}`);
      return config;
    } catch (error) {
      console.error(`❌ Error loading agent config ${agentId}:`, error);
      throw error; // Re-throw to surface validation errors
    }
  }

  /**
   * Load workflow configuration with Zod validation
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
      const rawConfig = parseYAML(fileContent);
      
      // VALIDATE WITH ZOD
      const validationResult = WorkflowConfigSchema.safeParse(rawConfig);
      
      if (!validationResult.success) {
        const errors = validationResult.error.issues.map((err: z.ZodIssue) => 
          `${err.path.join('.')}: ${err.message}`
        ).join(', ');
        throw new Error(`Workflow config validation failed for ${workflowId}: ${errors}`);
      }
      
      const config = validationResult.data as WorkflowConfig;
      this.configCache.set(cacheKey, config);
      
      console.log(`✅ Loaded and validated workflow config: ${workflowId}`);
      return config;
    } catch (error) {
      console.error(`❌ Error loading workflow config ${workflowId}:`, error);
      throw error; // Re-throw to surface validation errors
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
   * Setup file watcher for hot-reload in development
   */
  private setupHotReload(): void {
    if (!chokidar) {
      return;
    }

    console.log('🔥 [HOT-RELOAD] Enabled for config files');
    
    this.watcher = chokidar.watch(this.configDir, {
      ignored: /(^|[\/\\])\../,  // Ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      depth: 3,
    });

    this.watcher
      .on('change', (path: string) => {
        if (path.endsWith('.yaml') || path.endsWith('.yml')) {
          this.handleConfigChange(path);
        }
      })
      .on('add', (path: string) => {
        if (path.endsWith('.yaml') || path.endsWith('.yml')) {
          console.log(`🔥 [HOT-RELOAD] New config detected: ${path}`);
          this.handleConfigChange(path);
        }
      })
      .on('unlink', (path: string) => {
        if (path.endsWith('.yaml') || path.endsWith('.yml')) {
          console.log(`🔥 [HOT-RELOAD] Config deleted: ${path}`);
          this.invalidateCacheForPath(path);
        }
      })
      .on('error', (error: Error) => {
        console.error('❌ [HOT-RELOAD] Watcher error:', error);
      });
  }

  /**
   * Handle config file change
   */
  private handleConfigChange(filePath: string): void {
    console.log(`🔥 [HOT-RELOAD] Config changed: ${filePath}`);
    
    // Invalidate cache for this specific file
    this.invalidateCacheForPath(filePath);
    
    // Determine config type and trigger re-registration
    const relativePath = filePath.replace(this.configDir, '').replace(/^[\/\\]/, '');
    
    if (relativePath.startsWith('agents/')) {
      const agentId = relativePath.replace('agents/', '').replace(/\.(yaml|yml)$/, '');
      this.reloadAgent(agentId);
    } else if (relativePath.startsWith('workflows/')) {
      const workflowId = relativePath.replace('workflows/', '').replace(/\.(yaml|yml)$/, '');
      this.reloadWorkflow(workflowId);
    } else if (relativePath === 'feature-flags.yaml' || relativePath.startsWith('feature-flags/')) {
      this.reloadFeatureFlags();
    } else if (relativePath.startsWith('business-rules/')) {
      // Business rules are loaded from directory, so we reload all
      this.reloadBusinessRules();
    }
  }

  /**
   * Invalidate cache entries for a file path
   */
  private invalidateCacheForPath(filePath: string): void {
    const relativePath = filePath.replace(this.configDir, '').replace(/^[\/\\]/, '');
    
    // Find and remove all cache entries related to this file
    const keysToDelete: string[] = [];
    
    for (const key of this.configCache.keys()) {
      // Match exact file or related config type
      if (relativePath.startsWith('agents/')) {
        const agentId = relativePath.replace('agents/', '').replace(/\.(yaml|yml)$/, '');
        if (key === `agent:${agentId}`) {
          keysToDelete.push(key);
        }
      } else if (relativePath.startsWith('workflows/')) {
        const workflowId = relativePath.replace('workflows/', '').replace(/\.(yaml|yml)$/, '');
        if (key === `workflow:${workflowId}`) {
          keysToDelete.push(key);
        }
      } else if (relativePath === 'feature-flags.yaml' || relativePath.startsWith('feature-flags/')) {
        // Feature flags don't have a cache key, but we can clear related caches if needed
        if (key.startsWith('feature:')) {
          keysToDelete.push(key);
        }
      } else if (relativePath.startsWith('business-rules/')) {
        if (key.startsWith('business-rule:')) {
          keysToDelete.push(key);
        }
      }
    }
    
    keysToDelete.forEach(key => {
      this.configCache.delete(key);
      console.log(`   🗑️  Invalidated cache: ${key}`);
    });
  }

  /**
   * Reload agent configuration and re-register
   */
  private reloadAgent(agentId: string): void {
    try {
      console.log(`🔄 [HOT-RELOAD] Reloading agent: ${agentId}`);
      
      // Load fresh config (cache already invalidated)
      const config = this.loadAgentConfig(agentId);
      
      if (config) {
        console.log(`✅ [HOT-RELOAD] Agent ${agentId} reloaded successfully`);
        
        // Emit event for other systems to react
        this.emitReloadEvent('agent', agentId);
      }
    } catch (error) {
      console.error(`❌ [HOT-RELOAD] Failed to reload agent ${agentId}:`, error);
    }
  }

  /**
   * Reload workflow configuration
   */
  private reloadWorkflow(workflowId: string): void {
    try {
      console.log(`🔄 [HOT-RELOAD] Reloading workflow: ${workflowId}`);
      const config = this.loadWorkflowConfig(workflowId);
      
      if (config) {
        console.log(`✅ [HOT-RELOAD] Workflow ${workflowId} reloaded successfully`);
        this.emitReloadEvent('workflow', workflowId);
      }
    } catch (error) {
      console.error(`❌ [HOT-RELOAD] Failed to reload workflow ${workflowId}:`, error);
    }
  }

  /**
   * Reload feature flags
   */
  private reloadFeatureFlags(): void {
    try {
      console.log('🔄 [HOT-RELOAD] Reloading feature flags');
      const flags = this.loadFeatureFlags();
      console.log(`✅ [HOT-RELOAD] Feature flags reloaded:`, Object.keys(flags).length, 'flags');
      this.emitReloadEvent('feature_flags', 'all');
    } catch (error) {
      console.error('❌ [HOT-RELOAD] Failed to reload feature flags:', error);
    }
  }

  /**
   * Reload business rules
   */
  private reloadBusinessRules(): void {
    try {
      console.log('🔄 [HOT-RELOAD] Reloading business rules');
      const rules = this.loadBusinessRules();
      console.log(`✅ [HOT-RELOAD] Business rules reloaded:`, rules.length, 'rules');
      this.emitReloadEvent('business_rules', 'all');
    } catch (error) {
      console.error('❌ [HOT-RELOAD] Failed to reload business rules:', error);
    }
  }

  /**
   * Emit reload event (can be replaced with EventEmitter if needed)
   */
  private emitReloadEvent(type: string, id: string): void {
    // Placeholder for event system
    // In production, you might want to use EventEmitter or similar
    console.log(`📢 [HOT-RELOAD] Event: ${type}:${id} reloaded`);
  }

  /**
   * Clear cache (useful for testing or hot-reloading)
   */
  public clearCache(): void {
    const size = this.configCache.size;
    this.configCache.clear();
    console.log(`🧹 Cleared config cache (${size} entries)`);
  }

  /**
   * Refresh specific config manually
   */
  public refresh(configType: 'agent' | 'workflow', id: string): void {
    const cacheKey = `${configType}:${id}`;
    this.configCache.delete(cacheKey);
    console.log(`🔄 Refreshed cache for ${configType}: ${id}`);
    
    // Trigger reload
    if (configType === 'agent') {
      this.reloadAgent(id);
    } else {
      this.reloadWorkflow(id);
    }
  }

  /**
   * Cleanup watcher on shutdown
   */
  public async close(): Promise<void> {
    if (this.watcher) {
      console.log('🔥 [HOT-RELOAD] Closing file watcher');
      await this.watcher.close();
      this.watcher = undefined;
    }
  }

  /**
   * Load feature flags configuration with Zod validation
   */
  public loadFeatureFlags(): Record<string, boolean> {
    const configPath = join(this.configDir, 'feature-flags.yaml');
    
    if (!existsSync(configPath)) {
      console.warn('⚠️  Feature flags config not found, using defaults');
      return {};
    }

    try {
      const fileContent = readFileSync(configPath, 'utf-8');
      const rawConfig = parseYAML(fileContent);
      
      const validationResult = FeatureFlagSchema.safeParse(rawConfig);
      if (!validationResult.success) {
        const errors = validationResult.error.issues.map((err: z.ZodIssue) => 
          `${err.path.join('.')}: ${err.message}`
        ).join(', ');
        throw new Error(`Feature flags validation failed: ${errors}`);
      }
      
      return validationResult.data.flags as Record<string, boolean>;
    } catch (error) {
      console.error('❌ Error loading feature flags:', error);
      return {};
    }
  }

  /**
   * Load business rules configuration with Zod validation
   */
  public loadBusinessRules(): BusinessRuleConfig[] {
    const rulesDir = join(this.configDir, 'business-rules');
    
    if (!existsSync(rulesDir)) {
      console.warn('⚠️  Business rules directory not found');
      return [];
    }

    const files = readdirSync(rulesDir).filter(f => f.endsWith('.yaml'));
    const rules: BusinessRuleConfig[] = [];
    
    for (const file of files) {
      try {
        const fileContent = readFileSync(join(rulesDir, file), 'utf-8');
        const rawData = parseYAML(fileContent);
        
        // Handle different file structures:
        // 1. File with 'rules' key containing array: { rules: [...] }
        // 2. Direct array: [...]
        // 3. Single rule object: { rule_id: ..., ... }
        let rulesToValidate: any[] = [];
        
        if (rawData && typeof rawData === 'object') {
          if (Array.isArray(rawData)) {
            rulesToValidate = rawData;
          } else if (rawData.rules && Array.isArray(rawData.rules)) {
            rulesToValidate = rawData.rules;
          } else if (rawData.rule_id) {
            // Single rule object
            rulesToValidate = [rawData];
          }
        }
        
        for (const rule of rulesToValidate) {
          const validationResult = BusinessRuleSchema.safeParse(rule);
          if (!validationResult.success) {
            const errors = validationResult.error.issues.map((err: z.ZodIssue) => 
              `${err.path.join('.')}: ${err.message}`
            ).join(', ');
            console.warn(`⚠️  Skipping invalid business rule in ${file}: ${errors}`);
            continue;
          }
          
          rules.push(validationResult.data);
        }
      } catch (error) {
        console.error(`❌ Error loading business rule ${file}:`, error);
      }
    }
    
    return rules;
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
