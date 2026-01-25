/**
 * Plan Executor
 *
 * Deterministic execution of execution plans WITHOUT LLM calls.
 * All routing decisions are made upfront in the plan.
 *
 * Features:
 * - Sequential and parallel execution
 * - Skip/continue conditions
 * - Error handling with retry support
 * - Circuit breaker integration
 * - Comprehensive metrics tracking
 */

import type {
  ExecutionPlan,
  PlanStage,
  PlanExecutionResult,
  StageExecutionResult,
} from '@/lib/types/execution-plan';
import type { MultiAgentState } from '@/lib/multi-agent/state';
import { AgentRegistry } from '@/lib/registry/agent-registry';
import { ToolRegistry } from '@/lib/registry/tool-registry';
import { recordAgentExecution } from '@/lib/multi-agent/monitoring';
import { extractCorrelationId } from '@/lib/utils/correlation';
import { logAgentExecution, logError } from '@/lib/monitoring/axiom-logger';

// ============================================================================
// Types
// ============================================================================

export interface ExecutorOptions {
  /** Continue executing even if a non-required stage fails */
  continueOnError?: boolean;
  /** Enable parallel execution of compatible stages */
  enableParallel?: boolean;
  /** Maximum retries per stage */
  maxRetries?: number;
  /** Callback for stage completion */
  onStageComplete?: (result: StageExecutionResult) => void;
  /** Callback for stage start */
  onStageStart?: (stage: PlanStage) => void;
  /** Callback for progress updates */
  onProgress?: (completed: number, total: number) => void;
}

interface RetryState {
  attempts: number;
  lastError?: string;
}

// ============================================================================
// Plan Executor Class
// ============================================================================

export class PlanExecutor {
  private options: ExecutorOptions;
  private retryStates: Map<string, RetryState> = new Map();

  constructor(options: ExecutorOptions = {}) {
    this.options = {
      continueOnError: true,
      enableParallel: false, // Parallel disabled by default for stability
      maxRetries: 2,
      ...options,
    };
  }

  /**
   * Execute a validated execution plan
   * NO LLM CALLS - all routing decisions are in the plan
   */
  async execute(
    plan: ExecutionPlan,
    initialState: MultiAgentState
  ): Promise<PlanExecutionResult> {
    const startTime = Date.now();
    const correlationId = extractCorrelationId(initialState) || plan.planId;

    console.log(`\n🚀 [PLAN-EXECUTOR] Starting plan execution: ${plan.planId}`);
    console.log(`   Workflow: ${plan.workflowId}`);
    console.log(`   Query Type: ${plan.queryType}`);
    console.log(`   Stages: ${plan.stages.length}`);
    console.log(`   Timeout: ${plan.context.timeout}ms`);

    // Initialize result
    const result: PlanExecutionResult = {
      planId: plan.planId,
      success: false,
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

    try {
      // Sort stages by order
      const sortedStages = [...plan.stages].sort((a, b) => a.order - b.order);

      // Group stages by parallel execution groups
      const stageGroups = this.groupStagesByParallelism(sortedStages);

      console.log(`   Stage groups: ${stageGroups.length}`);

      // Execute each group
      let groupIndex = 0;
      for (const group of stageGroups) {
        groupIndex++;

        // Check timeout
        if (Date.now() - startTime > plan.context.timeout) {
          const timeoutError = `Plan execution timeout after ${Date.now() - startTime}ms`;
          console.error(`❌ [PLAN-EXECUTOR] ${timeoutError}`);
          result.errors.push({
            stageId: 'executor',
            agentId: 'plan_executor',
            error: timeoutError,
            timestamp: new Date(),
            recoverable: false,
          });
          break;
        }

        console.log(`\n📦 [PLAN-EXECUTOR] Executing group ${groupIndex}/${stageGroups.length} (${group.length} stages)`);

        if (group.length === 1 || !this.options.enableParallel) {
          // Sequential execution
          for (const stage of group) {
            const stageResult = await this.executeStage(stage, result, correlationId, plan);
            result.stageResults.push(stageResult);
            this.updateResultFromStage(result, stage, stageResult);

            // Progress callback
            const totalCompleted = result.stagesCompleted.length + 
              result.stagesFailed.length + result.stagesSkipped.length;
            this.options.onProgress?.(totalCompleted, plan.stages.length);

            // Check for early exit on required stage failure
            if (stageResult.status === 'failed' && stage.required && !this.options.continueOnError) {
              throw new Error(`Required stage ${stage.stageId} failed: ${stageResult.error}`);
            }
          }
        } else {
          // Parallel execution
          await this.executeParallelStages(group, result, correlationId, plan);
        }

        // Check for early exit conditions
        if (this.shouldEarlyExit(plan, result.finalState)) {
          console.log(`⚡ [PLAN-EXECUTOR] Early exit triggered`);
          break;
        }
      }

      // Determine success
      result.success = result.stagesFailed.filter((stageId) => {
        const stage = plan.stages.find((s) => s.stageId === stageId);
        return stage?.required;
      }).length === 0;

    } catch (error: any) {
      console.error(`❌ [PLAN-EXECUTOR] Plan execution failed:`, error.message);
      result.success = false;
      result.errors.push({
        stageId: 'executor',
        agentId: 'plan_executor',
        error: error.message,
        timestamp: new Date(),
        recoverable: false,
      });

      logError(correlationId, error, {
        planId: plan.planId,
        component: 'plan_executor',
      });
    } finally {
      result.completedAt = new Date();
      result.durationMs = Date.now() - startTime;

      // Calculate comparison to estimates
      result.vsEstimates = {
        durationDiffMs: result.durationMs - plan.estimates.estimatedDurationMs,
        costDiffUSD: result.costs.actualCostUSD - plan.estimates.estimatedCostUSD,
        accuracyPercent: plan.estimates.estimatedDurationMs > 0
          ? Math.round((1 - Math.abs(result.durationMs - plan.estimates.estimatedDurationMs) /
              plan.estimates.estimatedDurationMs) * 100)
          : 0,
      };

      this.logExecutionSummary(plan, result, correlationId);
    }

    return result;
  }

  /**
   * Execute a single stage with retry support
   */
  private async executeStage(
    stage: PlanStage,
    result: PlanExecutionResult,
    correlationId: string,
    plan: ExecutionPlan
  ): Promise<StageExecutionResult> {
    const stageStartTime = Date.now();

    console.log(`\n▶️  [PLAN-EXECUTOR] Stage: ${stage.stageId}`);
    console.log(`   Agent: ${stage.agentName} (${stage.agentId})`);
    console.log(`   Required: ${stage.required}`);
    console.log(`   Tools: ${stage.toolsNeeded.join(', ') || 'none'}`);

    // Notify stage start
    this.options.onStageStart?.(stage);

    // Check skip conditions
    if (this.shouldSkipStage(stage, result.finalState)) {
      console.log(`⏭️  [PLAN-EXECUTOR] Skipping stage: ${stage.stageId} (skip conditions met)`);
      const skipResult: StageExecutionResult = {
        stageId: stage.stageId,
        agentId: stage.agentId,
        status: 'skipped',
        startedAt: new Date(stageStartTime),
        completedAt: new Date(),
        durationMs: 0,
        producedFields: [],
      };
      this.options.onStageComplete?.(skipResult);
      return skipResult;
    }

    // Check continue conditions
    if (!this.shouldContinueStage(stage, result.finalState)) {
      console.log(`🛑 [PLAN-EXECUTOR] Skipping stage: ${stage.stageId} (continue conditions not met)`);
      const skipResult: StageExecutionResult = {
        stageId: stage.stageId,
        agentId: stage.agentId,
        status: 'skipped',
        startedAt: new Date(stageStartTime),
        completedAt: new Date(),
        durationMs: 0,
        producedFields: [],
      };
      this.options.onStageComplete?.(skipResult);
      return skipResult;
    }

    // Get or initialize retry state
    let retryState = this.retryStates.get(stage.stageId) || { attempts: 0 };

    while (retryState.attempts <= (this.options.maxRetries || 0)) {
      try {
        // Get agent from registry
        const agentRegistry = AgentRegistry.getInstance();
        const agent = agentRegistry.getById(stage.agentId);

        if (!agent) {
          throw new Error(`Agent ${stage.agentId} not found in registry`);
        }

        if (!agent.nodeFunction) {
          throw new Error(`Agent ${stage.agentId} has no nodeFunction`);
        }

        // Prepare state with context
        const stateWithContext = {
          ...result.finalState,
          _stage_context: {
            stageId: stage.stageId,
            order: stage.order,
            tools: stage.toolsNeeded,
          },
        };

        // Log execution start
        logAgentExecution(stage.agentId, correlationId, 0, 'started', {
          stageId: stage.stageId,
          attempt: retryState.attempts + 1,
        });

        // Execute the agent node function (NO LLM CALL - agent is deterministic)
        const stateUpdate = await agent.nodeFunction(stateWithContext);

        // Merge state update into final state
        Object.assign(result.finalState, stateUpdate);

        const duration = Date.now() - stageStartTime;

        // Track costs
        this.trackStageCosts(stage, result, agent);

        // Log success
        recordAgentExecution(stage.agentId, duration, true);
        logAgentExecution(stage.agentId, correlationId, duration, 'success', {
          stageId: stage.stageId,
        });

        console.log(`✅ [PLAN-EXECUTOR] Stage ${stage.stageId} completed in ${duration}ms`);

        const successResult: StageExecutionResult = {
          stageId: stage.stageId,
          agentId: stage.agentId,
          status: 'success',
          startedAt: new Date(stageStartTime),
          completedAt: new Date(),
          durationMs: duration,
          producedFields: stage.provides.filter((f) => result.finalState[f] !== undefined),
          toolCalls: stage.toolsNeeded.map((t) => ({
            toolId: t,
            success: true,
            durationMs: 0, // Not tracked individually
          })),
        };

        this.options.onStageComplete?.(successResult);
        return successResult;

      } catch (error: any) {
        retryState.attempts++;
        retryState.lastError = error.message;
        this.retryStates.set(stage.stageId, retryState);

        const duration = Date.now() - stageStartTime;

        console.error(`❌ [PLAN-EXECUTOR] Stage ${stage.stageId} failed (attempt ${retryState.attempts}):`, error.message);

        // Check if we should retry
        if (retryState.attempts <= (this.options.maxRetries || 0)) {
          const backoffMs = Math.min(1000 * Math.pow(2, retryState.attempts - 1), 10000);
          console.log(`🔄 [PLAN-EXECUTOR] Retrying in ${backoffMs}ms...`);
          await this.sleep(backoffMs);
          continue;
        }

        // Max retries exceeded
        recordAgentExecution(stage.agentId, duration, false);
        logAgentExecution(stage.agentId, correlationId, duration, 'failed', {
          stageId: stage.stageId,
          error: error.message,
          attempts: retryState.attempts,
        });

        const failResult: StageExecutionResult = {
          stageId: stage.stageId,
          agentId: stage.agentId,
          status: 'failed',
          startedAt: new Date(stageStartTime),
          completedAt: new Date(),
          durationMs: duration,
          producedFields: [],
          error: error.message,
        };

        this.options.onStageComplete?.(failResult);
        return failResult;
      }
    }

    // Should not reach here, but return failure if we do
    return {
      stageId: stage.stageId,
      agentId: stage.agentId,
      status: 'failed',
      startedAt: new Date(stageStartTime),
      completedAt: new Date(),
      durationMs: Date.now() - stageStartTime,
      producedFields: [],
      error: retryState.lastError || 'Max retries exceeded',
    };
  }

  /**
   * Execute multiple stages in parallel
   */
  private async executeParallelStages(
    stages: PlanStage[],
    result: PlanExecutionResult,
    correlationId: string,
    plan: ExecutionPlan
  ): Promise<void> {
    console.log(`⚡ [PLAN-EXECUTOR] Executing ${stages.length} stages in parallel`);

    const promises = stages.map((stage) =>
      this.executeStage(stage, result, correlationId, plan)
    );

    const stageResults = await Promise.allSettled(promises);

    for (let i = 0; i < stageResults.length; i++) {
      const stage = stages[i];
      const settledResult = stageResults[i];

      if (settledResult.status === 'fulfilled') {
        const stageResult = settledResult.value;
        result.stageResults.push(stageResult);
        this.updateResultFromStage(result, stage, stageResult);
      } else {
        // Promise rejected
        const errorResult: StageExecutionResult = {
          stageId: stage.stageId,
          agentId: stage.agentId,
          status: 'failed',
          startedAt: new Date(),
          completedAt: new Date(),
          durationMs: 0,
          producedFields: [],
          error: settledResult.reason?.message || 'Unknown error',
        };
        result.stageResults.push(errorResult);
        this.updateResultFromStage(result, stage, errorResult);
      }
    }
  }

  /**
   * Update result based on stage execution
   */
  private updateResultFromStage(
    result: PlanExecutionResult,
    stage: PlanStage,
    stageResult: StageExecutionResult
  ): void {
    switch (stageResult.status) {
      case 'success':
        result.stagesCompleted.push(stage.stageId);
        break;
      case 'failed':
        result.stagesFailed.push(stage.stageId);
        result.errors.push({
          stageId: stage.stageId,
          agentId: stage.agentId,
          error: stageResult.error || 'Unknown error',
          timestamp: new Date(),
          recoverable: !stage.required,
        });
        break;
      case 'skipped':
        result.stagesSkipped.push(stage.stageId);
        break;
    }
  }

  /**
   * Track costs for a stage
   */
  private trackStageCosts(stage: PlanStage, result: PlanExecutionResult, agent: any): void {
    // During plan execution, NO agents should make LLM calls - all decisions are in the plan
    // Plan executor is deterministic - it executes pre-planned stages without LLM calls
    // We never track LLM calls during plan execution since all routing is predetermined
    
    // Track API calls (these are allowed during plan execution)
    const toolRegistry = ToolRegistry.getInstance();
    for (const toolId of stage.toolsNeeded) {
      const tool = toolRegistry.getById(toolId);
      if (tool?.cost === 'api_call') {
        result.costs.apiCalls++;
        result.costs.actualCostUSD += 0.001; // Estimated API cost
      } else if (tool?.cost === 'expensive') {
        result.costs.apiCalls++;
        result.costs.actualCostUSD += 0.01;
      }
    }
  }

  /**
   * Group stages by parallel execution groups
   */
  private groupStagesByParallelism(stages: PlanStage[]): PlanStage[][] {
    const groups: PlanStage[][] = [];
    let currentGroup: PlanStage[] = [];
    let currentOrder = -1;
    let currentParallelGroup: number | undefined = undefined;

    for (const stage of stages) {
      const isNewOrder = stage.order !== currentOrder;
      const isNewParallelGroup = stage.parallelGroup !== currentParallelGroup;
      const canParallel = stage.canRunInParallel && this.options.enableParallel;

      if (isNewOrder || (canParallel && isNewParallelGroup)) {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = [stage];
        currentOrder = stage.order;
        currentParallelGroup = stage.parallelGroup;
      } else if (canParallel && stage.parallelGroup === currentParallelGroup) {
        currentGroup.push(stage);
      } else {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = [stage];
        currentOrder = stage.order;
        currentParallelGroup = stage.parallelGroup;
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * Check if stage should be skipped
   */
  private shouldSkipStage(stage: PlanStage, state: any): boolean {
    if (!stage.skipConditions) return false;

    const { stateChecks, predicate } = stage.skipConditions;

    // Check state conditions
    if (stateChecks) {
      for (const [field, condition] of Object.entries(stateChecks)) {
        if (typeof condition === 'object' && condition !== null) {
          if ('exists' in condition && condition.exists === true) {
            if (state[field] !== undefined && state[field] !== null) {
              return true;
            }
          }
        } else {
          if (state[field] === condition) {
            return true;
          }
        }
      }
    }

    // Evaluate predicate
    if (predicate) {
      try {
        const evalFn = new Function('state', `return ${predicate}`);
        return evalFn(state) === true;
      } catch (error) {
        console.warn(`⚠️ [PLAN-EXECUTOR] Failed to evaluate skip predicate:`, error);
      }
    }

    return false;
  }

  /**
   * Check if stage should continue
   */
  private shouldContinueStage(stage: PlanStage, state: any): boolean {
    if (!stage.continueConditions) return true;

    const { stateChecks, predicate } = stage.continueConditions;

    // Check state conditions
    if (stateChecks) {
      for (const [field, condition] of Object.entries(stateChecks)) {
        if (typeof condition === 'object' && condition !== null) {
          if ('exists' in condition && condition.exists === true) {
            if (state[field] === undefined || state[field] === null) {
              return false;
            }
          }
        } else {
          if (state[field] !== condition) {
            return false;
          }
        }
      }
    }

    // Evaluate predicate
    if (predicate) {
      try {
        const evalFn = new Function('state', `return ${predicate}`);
        return evalFn(state) === true;
      } catch (error) {
        console.warn(`⚠️ [PLAN-EXECUTOR] Failed to evaluate continue predicate:`, error);
        return true;
      }
    }

    return true;
  }

  /**
   * Check for early exit conditions
   */
  private shouldEarlyExit(plan: ExecutionPlan, state: any): boolean {
    // Check for needs_clarification flag
    if (state.needs_clarification) {
      return true;
    }

    // Check for critical errors
    if (state.degraded_mode && (state.missing_data?.length || 0) > 3) {
      return true;
    }

    return false;
  }

  /**
   * Log execution summary
   */
  private logExecutionSummary(
    plan: ExecutionPlan,
    result: PlanExecutionResult,
    correlationId: string
  ): void {
    const statusIcon = result.success ? '✅' : '❌';
    const statusText = result.success ? 'SUCCESS' : 'FAILED';

    console.log(`\n${statusIcon} [PLAN-EXECUTOR] Execution ${statusText}`);
    console.log(`   Plan ID: ${plan.planId}`);
    console.log(`   Duration: ${result.durationMs}ms (est: ${plan.estimates.estimatedDurationMs}ms)`);
    console.log(`   Accuracy: ${result.vsEstimates?.accuracyPercent || 0}%`);
    console.log(`   Stages: ${result.stagesCompleted.length} completed, ${result.stagesFailed.length} failed, ${result.stagesSkipped.length} skipped`);
    console.log(`   Cost: $${result.costs.actualCostUSD.toFixed(4)} (est: $${plan.estimates.estimatedCostUSD.toFixed(4)})`);
    console.log(`   LLM Calls: ${result.costs.llmCalls} | API Calls: ${result.costs.apiCalls}`);

    if (result.errors.length > 0) {
      console.log(`   Errors:`);
      result.errors.forEach((e) => {
        console.log(`     - ${e.stageId}: ${e.error}`);
      });
    }
  }

  /**
   * Sleep utility for retry backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let executorInstance: PlanExecutor | null = null;

export function getPlanExecutor(options?: ExecutorOptions): PlanExecutor {
  if (!executorInstance) {
    executorInstance = new PlanExecutor(options);
  }
  return executorInstance;
}

/**
 * Create a new executor with custom options
 */
export function createPlanExecutor(options: ExecutorOptions): PlanExecutor {
  return new PlanExecutor(options);
}
