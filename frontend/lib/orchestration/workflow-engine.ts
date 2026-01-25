/**
 * Workflow Engine
 *
 * Deterministic execution of execution plans.
 * Executes agents in order without additional LLM calls.
 */

import type {
  ExecutionPlan,
  PlanStage,
  PlanExecutionResult,
  StageExecutionResult,
} from '@/lib/types/execution-plan';
import type { MultiAgentState } from '@/lib/multi-agent/state';
import { AgentRegistry } from '@/lib/registry/agent-registry';
import { recordAgentExecution } from '@/lib/multi-agent/monitoring';
import { extractCorrelationId } from '@/lib/utils/correlation';
import { logAgentExecution } from '@/lib/monitoring/axiom-logger';

// ============================================================================
// Types
// ============================================================================

interface ExecutionOptions {
  /** Continue executing even if a non-required stage fails */
  continueOnError?: boolean;
  /** Enable parallel execution of compatible stages */
  enableParallel?: boolean;
  /** Callback for stage completion */
  onStageComplete?: (result: StageExecutionResult) => void;
  /** Callback for stage start */
  onStageStart?: (stage: PlanStage) => void;
}

// ============================================================================
// Workflow Engine Class
// ============================================================================

export class WorkflowEngine {
  /**
   * Execute an execution plan
   */
  async execute(
    plan: ExecutionPlan,
    initialState: MultiAgentState,
    options: ExecutionOptions = {}
  ): Promise<PlanExecutionResult> {
    const startTime = Date.now();
    const correlationId = extractCorrelationId(initialState);

    console.log(`\n🚀 [WORKFLOW-ENGINE] Executing plan ${plan.planId}`);
    console.log(`   Workflow: ${plan.workflowId}`);
    console.log(`   Stages: ${plan.stages.length}`);

    const result: PlanExecutionResult = {
      planId: plan.planId,
      success: true,
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 0,
      stagesCompleted: [],
      stagesFailed: [],
      stagesSkipped: [],
      stageResults: [],
      finalState: { ...initialState },
      costs: {
        llmCalls: 0,
        apiCalls: 0,
        actualCostUSD: 0,
      },
      errors: [],
    };

    // Group stages by order for execution
    const stagesByOrder = this.groupStagesByOrder(plan.stages);
    const orders = Array.from(stagesByOrder.keys()).sort((a, b) => a - b);

    // Execute stages in order
    for (const order of orders) {
      const stages = stagesByOrder.get(order)!;

      if (options.enableParallel && stages.length > 1 && stages.some(s => s.canRunInParallel)) {
        // Execute parallel stages
        await this.executeParallelStages(
          stages,
          result,
          plan,
          options
        );
      } else {
        // Execute sequential stages
        for (const stage of stages) {
          const stageResult = await this.executeStage(
            stage,
            result.finalState,
            plan,
            options
          );

          result.stageResults.push(stageResult);

          if (stageResult.status === 'success') {
            result.stagesCompleted.push(stage.stageId);
          } else if (stageResult.status === 'failed') {
            result.stagesFailed.push(stage.stageId);
            result.errors.push({
              stageId: stage.stageId,
              agentId: stage.agentId,
              error: stageResult.error || 'Unknown error',
              timestamp: new Date(),
              recoverable: !stage.required,
            });

            // Stop if required stage fails and not continuing on error
            if (stage.required && !options.continueOnError) {
              result.success = false;
              break;
            }
          } else if (stageResult.status === 'skipped') {
            result.stagesSkipped.push(stage.stageId);
          }
        }
      }

      // Check if we should stop execution
      if (!result.success && !options.continueOnError) {
        break;
      }
    }

    // Finalize result
    result.completedAt = new Date();
    result.durationMs = Date.now() - startTime;

    // Compute comparison to estimates
    result.vsEstimates = {
      durationDiffMs: result.durationMs - plan.estimates.estimatedDurationMs,
      costDiffUSD: result.costs.actualCostUSD - plan.estimates.estimatedCostUSD,
      accuracyPercent: Math.round(
        (1 - Math.abs(result.durationMs - plan.estimates.estimatedDurationMs) / 
          plan.estimates.estimatedDurationMs) * 100
      ),
    };

    console.log(`\n✅ [WORKFLOW-ENGINE] Plan execution complete`);
    console.log(`   Duration: ${result.durationMs}ms (est: ${plan.estimates.estimatedDurationMs}ms)`);
    console.log(`   Completed: ${result.stagesCompleted.length}/${plan.stages.length}`);
    console.log(`   Failed: ${result.stagesFailed.length}`);
    console.log(`   Skipped: ${result.stagesSkipped.length}`);

    return result;
  }

  /**
   * Group stages by execution order
   */
  private groupStagesByOrder(stages: PlanStage[]): Map<number, PlanStage[]> {
    const groups = new Map<number, PlanStage[]>();
    for (const stage of stages) {
      const existing = groups.get(stage.order) || [];
      existing.push(stage);
      groups.set(stage.order, existing);
    }
    return groups;
  }

  /**
   * Execute a single stage
   */
  private async executeStage(
    stage: PlanStage,
    currentState: any,
    plan: ExecutionPlan,
    options: ExecutionOptions
  ): Promise<StageExecutionResult> {
    const startTime = Date.now();
    const correlationId = currentState.correlation_id;

    console.log(`\n▶️  [WORKFLOW-ENGINE] Executing stage: ${stage.stageId}`);
    console.log(`   Agent: ${stage.agentName}`);

    // Notify stage start
    options.onStageStart?.(stage);

    // Check skip conditions
    if (this.shouldSkipStage(stage, currentState)) {
      console.log(`⏭️  [WORKFLOW-ENGINE] Skipping stage: ${stage.stageId} (conditions met)`);
      return {
        stageId: stage.stageId,
        agentId: stage.agentId,
        status: 'skipped',
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 0,
        producedFields: [],
      };
    }

    // Check continue conditions
    if (!this.shouldContinueStage(stage, currentState)) {
      console.log(`⏭️  [WORKFLOW-ENGINE] Skipping stage: ${stage.stageId} (continue conditions not met)`);
      return {
        stageId: stage.stageId,
        agentId: stage.agentId,
        status: 'skipped',
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 0,
        producedFields: [],
      };
    }

    try {
      // Get agent node function from registry
      const agentRegistry = AgentRegistry.getInstance();
      const agent = agentRegistry.getById(stage.agentId);

      if (!agent) {
        throw new Error(`Agent ${stage.agentId} not found`);
      }

      if (!agent.nodeFunction) {
        throw new Error(`Agent ${stage.agentId} has no nodeFunction`);
      }

      // Log execution start
      logAgentExecution(stage.agentId, correlationId, 0, 'started', {
        stageId: stage.stageId,
        order: stage.order,
      });

      // Execute the agent node function
      const stateUpdate = await agent.nodeFunction(currentState);

      // Merge state update
      Object.assign(currentState, stateUpdate);

      const duration = Date.now() - startTime;

      // Log execution complete
      recordAgentExecution(stage.agentId, duration, true);
      logAgentExecution(stage.agentId, correlationId, duration, 'success', {
        stageId: stage.stageId,
      });

      console.log(`✅ [WORKFLOW-ENGINE] Stage complete: ${stage.stageId} (${duration}ms)`);

      const result: StageExecutionResult = {
        stageId: stage.stageId,
        agentId: stage.agentId,
        status: 'success',
        startedAt: new Date(startTime),
        completedAt: new Date(),
        durationMs: duration,
        producedFields: stage.provides.filter((f) => currentState[f] !== undefined),
      };

      // Notify stage complete
      options.onStageComplete?.(result);

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;

      // Log execution failure
      recordAgentExecution(stage.agentId, duration, false);
      logAgentExecution(stage.agentId, correlationId, duration, 'failed', {
        stageId: stage.stageId,
        error: error.message,
      });

      console.error(`❌ [WORKFLOW-ENGINE] Stage failed: ${stage.stageId}`, error.message);

      const result: StageExecutionResult = {
        stageId: stage.stageId,
        agentId: stage.agentId,
        status: 'failed',
        startedAt: new Date(startTime),
        completedAt: new Date(),
        durationMs: duration,
        producedFields: [],
        error: error.message,
      };

      // Notify stage complete
      options.onStageComplete?.(result);

      return result;
    }
  }

  /**
   * Execute stages in parallel
   */
  private async executeParallelStages(
    stages: PlanStage[],
    result: PlanExecutionResult,
    plan: ExecutionPlan,
    options: ExecutionOptions
  ): Promise<void> {
    console.log(`\n⚡ [WORKFLOW-ENGINE] Executing ${stages.length} stages in parallel`);

    const promises = stages.map((stage) =>
      this.executeStage(stage, result.finalState, plan, options)
    );

    const stageResults = await Promise.all(promises);

    for (const stageResult of stageResults) {
      result.stageResults.push(stageResult);

      const stage = stages.find((s) => s.stageId === stageResult.stageId)!;

      if (stageResult.status === 'success') {
        result.stagesCompleted.push(stageResult.stageId);
      } else if (stageResult.status === 'failed') {
        result.stagesFailed.push(stageResult.stageId);
        result.errors.push({
          stageId: stageResult.stageId,
          agentId: stageResult.agentId,
          error: stageResult.error || 'Unknown error',
          timestamp: new Date(),
          recoverable: !stage.required,
        });

        if (stage.required) {
          result.success = false;
        }
      } else if (stageResult.status === 'skipped') {
        result.stagesSkipped.push(stageResult.stageId);
      }
    }
  }

  /**
   * Check if stage should be skipped
   */
  private shouldSkipStage(stage: PlanStage, state: any): boolean {
    if (!stage.skipConditions) {
      return false;
    }

    const { stateChecks, predicate } = stage.skipConditions;

    // Check state field conditions
    if (stateChecks) {
      for (const [field, condition] of Object.entries(stateChecks)) {
        if (typeof condition === 'object' && condition !== null) {
          // Handle { exists: true } condition
          if ('exists' in condition && condition.exists === true) {
            if (state[field] !== undefined && state[field] !== null) {
              return true; // Skip if field exists
            }
          }
        } else {
          // Direct value comparison
          if (state[field] === condition) {
            return true;
          }
        }
      }
    }

    // Evaluate predicate if provided
    if (predicate) {
      try {
        // Create a safe evaluation context
        const evalFn = new Function('state', `return ${predicate}`);
        return evalFn(state) === true;
      } catch (error) {
        console.warn(`⚠️ [WORKFLOW-ENGINE] Failed to evaluate skip predicate: ${error}`);
      }
    }

    return false;
  }

  /**
   * Check if stage should continue (not skip)
   */
  private shouldContinueStage(stage: PlanStage, state: any): boolean {
    if (!stage.continueConditions) {
      return true; // No conditions, always continue
    }

    const { stateChecks, predicate } = stage.continueConditions;

    // Check state field conditions (all must match)
    if (stateChecks) {
      for (const [field, condition] of Object.entries(stateChecks)) {
        if (typeof condition === 'object' && condition !== null) {
          if ('exists' in condition && condition.exists === true) {
            if (state[field] === undefined || state[field] === null) {
              return false; // Don't continue if required field missing
            }
          }
        } else {
          if (state[field] !== condition) {
            return false;
          }
        }
      }
    }

    // Evaluate predicate if provided
    if (predicate) {
      try {
        const evalFn = new Function('state', `return ${predicate}`);
        return evalFn(state) === true;
      } catch (error) {
        console.warn(`⚠️ [WORKFLOW-ENGINE] Failed to evaluate continue predicate: ${error}`);
        return true; // Default to continue on error
      }
    }

    return true;
  }

  /**
   * Get the next stage to execute based on current progress
   */
  getNextStage(plan: ExecutionPlan, completedStages: string[]): PlanStage | null {
    const completedSet = new Set(completedStages);

    for (const stage of plan.stages) {
      if (completedSet.has(stage.stageId)) {
        continue;
      }

      // Check all dependencies are complete
      const depsComplete = stage.dependsOn.every((dep) => completedSet.has(dep));
      if (depsComplete) {
        return stage;
      }
    }

    return null;
  }

  /**
   * Check if plan execution is complete
   */
  isPlanComplete(plan: ExecutionPlan, completedStages: string[]): boolean {
    const completedSet = new Set(completedStages);
    return plan.stages.every((stage) => completedSet.has(stage.stageId));
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let engineInstance: WorkflowEngine | null = null;

export function getWorkflowEngine(): WorkflowEngine {
  if (!engineInstance) {
    engineInstance = new WorkflowEngine();
  }
  return engineInstance;
}
