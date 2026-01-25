/**
 * Plan Validator
 *
 * Comprehensive validation of execution plans before execution.
 * Ensures all agents, tools, and dependencies are valid.
 */

import type {
  ExecutionPlan,
  PlanStage,
  PlanValidationResult,
} from '@/lib/types/execution-plan';
import { AgentRegistry } from '@/lib/registry/agent-registry';
import { ToolRegistry } from '@/lib/registry/tool-registry';
import { getConfigManager } from '@/lib/config/config-manager';
import type { MultiAgentState } from '@/lib/multi-agent/state';

// ============================================================================
// Plan Validator Class
// ============================================================================

export class PlanValidator {
  /**
   * Comprehensive plan validation before execution
   */
  validate(
    plan: ExecutionPlan,
    currentState: Partial<MultiAgentState>
  ): PlanValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // 1. Basic plan structure validation
    this.validateStructure(plan, errors);

    // 2. Validate all agents exist and are enabled
    this.validateAgents(plan, errors, warnings);

    // 3. Validate all tools exist and are enabled
    this.validateTools(plan, errors, warnings);

    // 4. Validate dependency graph (no cycles)
    this.validateDependencyGraph(plan, errors);

    // 5. Validate stage order matches dependencies
    this.validateStageOrder(plan, errors);

    // 6. Validate required state fields
    this.validateStateRequirements(plan, currentState, errors, warnings);

    // 7. Check timeout reasonability
    this.validateTimeout(plan, warnings);

    // 8. Check for optimization opportunities
    this.findOptimizations(plan, suggestions);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };
  }

  /**
   * Validate basic plan structure
   */
  private validateStructure(plan: ExecutionPlan, errors: string[]): void {
    if (!plan.planId) {
      errors.push('Plan missing planId');
    }
    if (!plan.workflowId) {
      errors.push('Plan missing workflowId');
    }
    if (!plan.stages || !Array.isArray(plan.stages)) {
      errors.push('Plan missing stages array');
    }
    if (plan.stages.length === 0) {
      errors.push('Plan has no stages');
    }
  }

  /**
   * Validate all agents exist and are enabled
   */
  private validateAgents(
    plan: ExecutionPlan,
    errors: string[],
    warnings: string[]
  ): void {
    const agentRegistry = AgentRegistry.getInstance();
    const configManager = getConfigManager();

    for (const stage of plan.stages) {
      const agent = agentRegistry.getById(stage.agentId);

      if (!agent) {
        errors.push(`Agent '${stage.agentId}' not found in registry`);
        continue;
      }

      if (!agent.enabled) {
        errors.push(`Agent '${stage.agentId}' is disabled`);
      }

      // Check feature flags if configured
      if (configManager.isLoaded()) {
        const agentConfig = configManager.getAgentConfig(stage.agentId);
        if (agentConfig?.featureFlag) {
          const enabled = configManager.isFeatureEnabled(agentConfig.featureFlag);
          if (!enabled) {
            errors.push(
              `Agent '${stage.agentId}' requires feature flag '${agentConfig.featureFlag}' which is disabled`
            );
          }
        }
      }
    }
  }

  /**
   * Validate all tools exist and are enabled
   */
  private validateTools(
    plan: ExecutionPlan,
    errors: string[],
    warnings: string[]
  ): void {
    const toolRegistry = ToolRegistry.getInstance();

    for (const stage of plan.stages) {
      for (const toolId of stage.toolsNeeded) {
        const tool = toolRegistry.getById(toolId);

        if (!tool) {
          // Tools are optional - warn instead of error
          warnings.push(`Tool '${toolId}' for agent '${stage.agentId}' not found`);
          continue;
        }

        if (tool.deprecated) {
          warnings.push(
            `Tool '${toolId}' is deprecated` +
              (tool.replacedBy ? `, use '${tool.replacedBy}' instead` : '')
          );
        }
      }
    }
  }

  /**
   * Validate dependency graph has no cycles
   */
  private validateDependencyGraph(plan: ExecutionPlan, errors: string[]): void {
    const graph = this.buildDependencyGraph(plan.stages);
    const cycles = this.detectCycles(graph);

    if (cycles.length > 0) {
      for (const cycle of cycles) {
        errors.push(`Circular dependency detected: ${cycle.join(' -> ')}`);
      }
    }
  }

  /**
   * Build dependency graph from stages
   */
  private buildDependencyGraph(stages: PlanStage[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    for (const stage of stages) {
      graph.set(stage.stageId, stage.dependsOn);
    }
    return graph;
  }

  /**
   * Detect cycles in dependency graph using DFS
   */
  private detectCycles(graph: Map<string, string[]>): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (node: string, path: string[]): boolean => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!graph.has(neighbor)) {
          // Neighbor doesn't exist in graph - skip
          continue;
        }

        if (!visited.has(neighbor)) {
          if (dfs(neighbor, [...path])) return true;
        } else if (recStack.has(neighbor)) {
          // Cycle detected
          const cycleStart = path.indexOf(neighbor);
          cycles.push([...path.slice(cycleStart), neighbor]);
          return true;
        }
      }

      recStack.delete(node);
      return false;
    };

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    return cycles;
  }

  /**
   * Validate stage order respects dependencies
   */
  private validateStageOrder(plan: ExecutionPlan, errors: string[]): void {
    const stageOrderMap = new Map<string, number>();
    for (const stage of plan.stages) {
      stageOrderMap.set(stage.stageId, stage.order);
    }

    for (const stage of plan.stages) {
      for (const depId of stage.dependsOn) {
        const depOrder = stageOrderMap.get(depId);
        if (depOrder === undefined) {
          errors.push(
            `Stage '${stage.stageId}' depends on non-existent stage '${depId}'`
          );
        } else if (depOrder >= stage.order) {
          errors.push(
            `Stage '${stage.stageId}' (order ${stage.order}) depends on '${depId}' (order ${depOrder}) but runs before or at same time`
          );
        }
      }
    }
  }

  /**
   * Validate state requirements
   */
  private validateStateRequirements(
    plan: ExecutionPlan,
    currentState: Partial<MultiAgentState>,
    errors: string[],
    warnings: string[]
  ): void {
    // Collect all fields that will be produced during execution
    const producedFields = new Set<string>();
    for (const stage of plan.stages) {
      for (const field of stage.provides) {
        producedFields.add(field);
      }
    }

    // Check first stage requirements
    if (plan.stages.length > 0) {
      const firstStage = plan.stages[0];
      for (const required of firstStage.requires) {
        // Skip 'messages' as it's always provided
        if (required === 'messages') continue;

        const hasInState = (currentState as any)[required] !== undefined;
        const willBeProduced = producedFields.has(required);

        if (!hasInState && !willBeProduced) {
          errors.push(
            `Required field '${required}' is missing and won't be produced by any stage`
          );
        } else if (!hasInState) {
          warnings.push(
            `Field '${required}' is missing but will be produced during execution`
          );
        }
      }
    }
  }

  /**
   * Validate timeout is reasonable
   */
  private validateTimeout(plan: ExecutionPlan, warnings: string[]): void {
    if (plan.context.timeout < plan.estimates.estimatedDurationMs) {
      warnings.push(
        `Timeout (${plan.context.timeout}ms) is less than estimated duration (${plan.estimates.estimatedDurationMs}ms)`
      );
    }

    // Check for stages that might exceed timeout
    for (const stage of plan.stages) {
      if (stage.estimatedDurationMs > plan.context.timeout) {
        warnings.push(
          `Stage '${stage.stageId}' estimated duration (${stage.estimatedDurationMs}ms) exceeds plan timeout`
        );
      }
    }
  }

  /**
   * Find optimization opportunities
   */
  private findOptimizations(plan: ExecutionPlan, suggestions: string[]): void {
    // Check for missed parallel opportunities
    const stagesByOrder = new Map<number, PlanStage[]>();
    for (const stage of plan.stages) {
      const existing = stagesByOrder.get(stage.order) || [];
      existing.push(stage);
      stagesByOrder.set(stage.order, existing);
    }

    for (const [order, stages] of stagesByOrder) {
      const parallelizable = stages.filter(
        (s) => s.canRunInParallel && s.parallelGroup === undefined
      );
      if (parallelizable.length > 1) {
        suggestions.push(
          `${parallelizable.length} stages at order ${order} could run in parallel but aren't grouped`
        );
      }
    }

    // Check for unnecessary stages (all outputs already exist)
    for (const stage of plan.stages) {
      if (stage.skipConditions?.stateChecks) {
        const allOutputsExist = Object.keys(stage.skipConditions.stateChecks).length ===
          stage.provides.length;
        if (allOutputsExist) {
          suggestions.push(
            `Stage '${stage.stageId}' could be skipped - all outputs may already exist`
          );
        }
      }
    }
  }

  /**
   * Quick validation check (for runtime)
   */
  isValid(plan: ExecutionPlan): boolean {
    // Basic checks without full analysis
    if (!plan.planId || !plan.stages || plan.stages.length === 0) {
      return false;
    }

    const agentRegistry = AgentRegistry.getInstance();
    for (const stage of plan.stages) {
      const agent = agentRegistry.getById(stage.agentId);
      if (!agent || !agent.enabled) {
        return false;
      }
    }

    return true;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let validatorInstance: PlanValidator | null = null;

export function getPlanValidator(): PlanValidator {
  if (!validatorInstance) {
    validatorInstance = new PlanValidator();
  }
  return validatorInstance;
}
