/**
 * Workflow Registry
 * 
 * Central registry for all workflows. Loads from YAML configs and provides
 * discovery and validation.
 */

import { AgentRegistry } from './agent-registry';
import { readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYAML } from 'yaml';

// ============================================================================
// Types
// ============================================================================

export interface WorkflowStage {
  id: string;
  agentId: string;
  order: number;
  required?: boolean;
  skipIf?: Record<string, any>;
  parallelWith?: string[];
}

export interface WorkflowDefinition {
  /** Workflow ID */
  id: string;
  /** Workflow name */
  name: string;
  /** Description */
  description?: string;
  /** Supported query types */
  queryTypes?: string[];
  /** Intent patterns for matching */
  intentPatterns?: string[];
  /** Workflow stages */
  stages: WorkflowStage[];
  /** Execution configuration */
  execution: {
    maxTotalTimeMs: number;
    allowParallelStages?: boolean;
    continueOnError?: boolean;
  };
  /** Required inputs */
  requiredInputs?: string[];
  /** Final outputs */
  finalOutputs?: string[];
  /** Whether workflow is enabled */
  enabled?: boolean;
  /** Metadata */
  metadata?: {
    version?: string;
    lastUpdated?: string;
  };
  /** Tags for categorization */
  tags?: string[];
}

interface WorkflowValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Workflow Registry Class
// ============================================================================

export class WorkflowRegistry {
  private static instance: WorkflowRegistry;
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private configLoader: ConfigLoader;

  private constructor() {
    this.configLoader = ConfigLoader.getInstance();
    this.loadAllWorkflows();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): WorkflowRegistry {
    if (!WorkflowRegistry.instance) {
      WorkflowRegistry.instance = new WorkflowRegistry();
    }
    return WorkflowRegistry.instance;
  }

  /**
   * Load all workflows from config directory
   */
  private loadAllWorkflows(): void {
    console.log('📚 [WORKFLOW-REGISTRY] Loading workflows...');
    
    const configDir = join(process.cwd(), 'config', 'workflows');
    
    if (!existsSync(configDir)) {
      console.warn(`⚠️  [WORKFLOW-REGISTRY] Workflows directory not found: ${configDir}`);
      return;
    }

    try {
      const files = readdirSync(configDir).filter(f => 
        f.endsWith('.yaml') || f.endsWith('.yml')
      );
      
      for (const file of files) {
        const workflowId = file.replace(/\.(yaml|yml)$/, '');
        this.loadWorkflow(workflowId);
      }
      
      console.log(`✅ [WORKFLOW-REGISTRY] Loaded ${this.workflows.size} workflows`);
    } catch (error) {
      console.error('❌ [WORKFLOW-REGISTRY] Failed to load workflows:', error);
    }
  }

  /**
   * Load single workflow from YAML file
   */
  private loadWorkflow(workflowId: string): void {
    try {
      const configPath = join(process.cwd(), 'config', 'workflows', `${workflowId}.yaml`);
      
      if (!existsSync(configPath)) {
        console.warn(`⚠️  [WORKFLOW-REGISTRY] Workflow ${workflowId} not found`);
        return;
      }

      const fileContent = readFileSync(configPath, 'utf-8');
      const rawConfig = parseYAML(fileContent);

      // Transform to WorkflowDefinition format
      const workflow: WorkflowDefinition = {
        id: rawConfig.id || rawConfig.workflow_id || workflowId,
        name: rawConfig.name || rawConfig.workflow_name || workflowId,
        description: rawConfig.description,
        queryTypes: rawConfig.queryTypes || rawConfig.query_types || [],
        intentPatterns: rawConfig.intentPatterns || rawConfig.intent_patterns || [],
        stages: (rawConfig.stages || rawConfig.steps || []).map((stage: any, index: number) => ({
          id: stage.id || stage.step_id || `step_${index + 1}`,
          agentId: stage.agentId || stage.agent_id,
          order: stage.order ?? index + 1,
          required: stage.required ?? true,
          skipIf: stage.skipIf || stage.skip_if,
          parallelWith: stage.parallelWith || stage.parallel_with || [],
        })),
        execution: {
          maxTotalTimeMs: rawConfig.execution?.maxTotalTimeMs || 
                         rawConfig.execution?.max_total_time_ms || 
                         120000,
          allowParallelStages: rawConfig.execution?.allowParallelStages ?? 
                               rawConfig.execution?.allow_parallel_stages ?? 
                               false,
          continueOnError: rawConfig.execution?.continueOnError ?? 
                          rawConfig.execution?.continue_on_error ?? 
                          true,
        },
        requiredInputs: rawConfig.requiredInputs || rawConfig.required_inputs || [],
        finalOutputs: rawConfig.finalOutputs || rawConfig.final_outputs || [],
        enabled: rawConfig.enabled ?? true,
        metadata: rawConfig.metadata,
        tags: rawConfig.tags || [],
      };

      // Validate workflow
      const validation = this.validateWorkflow(workflow);
      
      if (!validation.valid) {
        console.error(`❌ [WORKFLOW-REGISTRY] Workflow ${workflowId} validation failed:`, validation.errors);
        return;
      }

      if (validation.warnings.length > 0) {
        console.warn(`⚠️  [WORKFLOW-REGISTRY] Workflow ${workflowId} warnings:`, validation.warnings);
      }

      this.workflows.set(workflow.id, workflow);
      console.log(`   ✅ Loaded workflow: ${workflow.id} (${workflow.stages.length} stages)`);
    } catch (error) {
      console.error(`❌ [WORKFLOW-REGISTRY] Failed to load workflow ${workflowId}:`, error);
    }
  }

  /**
   * Validate workflow definition
   */
  private validateWorkflow(workflow: WorkflowDefinition): WorkflowValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    const agentRegistry = AgentRegistry.getInstance();

    // Check required fields
    if (!workflow.id) {
      errors.push('Missing id');
    }
    if (!workflow.name) {
      errors.push('Missing name');
    }
    if (!workflow.stages || workflow.stages.length === 0) {
      errors.push('Workflow must have at least one stage');
    }
    if (!workflow.execution || !workflow.execution.maxTotalTimeMs) {
      errors.push('Workflow must have execution.maxTotalTimeMs');
    }

    // Validate stages
    if (workflow.stages) {
      const stageIds = new Set<string>();
      const orders = new Set<number>();
      
      for (const stage of workflow.stages) {
        // Check duplicate stage IDs
        if (stageIds.has(stage.id)) {
          errors.push(`Duplicate stage id: ${stage.id}`);
        }
        stageIds.add(stage.id);

        // Check duplicate orders
        if (orders.has(stage.order)) {
          warnings.push(`Duplicate order ${stage.order} in stages (may be intentional for parallel execution)`);
        }
        orders.add(stage.order);

        // Check agent exists
        const agent = agentRegistry.getById(stage.agentId);
        if (!agent) {
          errors.push(`Unknown agent in stage ${stage.id}: ${stage.agentId}`);
        }

        // Validate parallel_with references
        if (stage.parallelWith && stage.parallelWith.length > 0) {
          for (const parallelId of stage.parallelWith) {
            const parallelStage = workflow.stages.find(s => s.id === parallelId);
            if (!parallelStage) {
              warnings.push(
                `Stage ${stage.id} references parallel stage ${parallelId} that does not exist`
              );
            } else if (parallelStage.order !== stage.order) {
              warnings.push(
                `Stage ${stage.id} references parallel stage ${parallelId} with different order (${parallelStage.order} vs ${stage.order})`
              );
            }
          }
        }

        // Validate order is positive
        if (stage.order < 1) {
          errors.push(`Stage ${stage.id} has invalid order: ${stage.order} (must be >= 1)`);
        }
      }
    }

    // Validate execution config
    if (workflow.execution) {
      if (workflow.execution.maxTotalTimeMs < 1000) {
        warnings.push('maxTotalTimeMs is very low (< 1 second)');
      }
      if (workflow.execution.maxTotalTimeMs > 600000) {
        warnings.push('maxTotalTimeMs is very high (> 10 minutes)');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Register workflow programmatically
   */
  public register(workflow: WorkflowDefinition): void {
    const validation = this.validateWorkflow(workflow);
    
    if (!validation.valid) {
      throw new Error(
        `Workflow validation failed: ${validation.errors.join(', ')}`
      );
    }

    this.workflows.set(workflow.id, workflow);
    console.log(`✅ [WORKFLOW-REGISTRY] Registered workflow: ${workflow.id}`);
  }

  /**
   * Get workflow by ID
   */
  public getById(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * Get workflows by query type
   */
  public getByQueryType(queryType: string): WorkflowDefinition[] {
    return Array.from(this.workflows.values()).filter(w =>
      w.queryTypes?.includes(queryType)
    );
  }

  /**
   * Get all workflows
   */
  public getAll(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Get enabled workflows only
   */
  public getEnabled(): WorkflowDefinition[] {
    return Array.from(this.workflows.values()).filter(w => w.enabled !== false);
  }

  /**
   * Get workflows by tag
   */
  public getByTag(tag: string): WorkflowDefinition[] {
    return Array.from(this.workflows.values()).filter(w =>
      w.tags?.includes(tag)
    );
  }

  /**
   * Check if workflow exists
   */
  public has(workflowId: string): boolean {
    return this.workflows.has(workflowId);
  }

  /**
   * Get workflow count
   */
  public count(): number {
    return this.workflows.size;
  }

  /**
   * Reload all workflows
   */
  public reload(): void {
    this.workflows.clear();
    this.loadAllWorkflows();
  }

  /**
   * Reload specific workflow
   */
  public reloadWorkflow(workflowId: string): void {
    this.workflows.delete(workflowId);
    this.loadWorkflow(workflowId);
  }

  /**
   * Get workflow statistics
   */
  public getStats(): {
    totalWorkflows: number;
    enabledWorkflows: number;
    byQueryType: Record<string, number>;
    averageStages: number;
    totalStages: number;
  } {
    const stats = {
      totalWorkflows: this.workflows.size,
      enabledWorkflows: 0,
      byQueryType: {} as Record<string, number>,
      averageStages: 0,
      totalStages: 0,
    };

    let totalStages = 0;

    for (const workflow of this.workflows.values()) {
      if (workflow.enabled !== false) {
        stats.enabledWorkflows++;
      }
      
      totalStages += workflow.stages.length;
      
      if (workflow.queryTypes) {
        for (const queryType of workflow.queryTypes) {
          stats.byQueryType[queryType] = (stats.byQueryType[queryType] || 0) + 1;
        }
      }
    }

    stats.totalStages = totalStages;
    stats.averageStages = this.workflows.size > 0 
      ? Math.round(totalStages / this.workflows.size) 
      : 0;

    return stats;
  }

  /**
   * Export to JSON for LLM consumption
   */
  public toJSON(): string {
    const workflows = Array.from(this.workflows.values())
      .filter(w => w.enabled !== false)
      .map(w => ({
        id: w.id,
        name: w.name,
        description: w.description,
        queryTypes: w.queryTypes || [],
        stageCount: w.stages.length,
        version: w.metadata?.version || '1.0.0',
        maxDurationMs: w.execution.maxTotalTimeMs,
      }));

    return JSON.stringify({ workflows, total: workflows.length }, null, 2);
  }

  /**
   * Clear all workflows (useful for testing)
   */
  public clear(): void {
    this.workflows.clear();
    console.log('🗑️  [WORKFLOW-REGISTRY] Cleared all workflows');
  }
}

/**
 * Get singleton instance
 */
export function getWorkflowRegistry(): WorkflowRegistry {
  return WorkflowRegistry.getInstance();
}
