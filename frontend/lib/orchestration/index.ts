/**
 * Orchestration Module Index
 *
 * Exports all orchestration components for execution plan-based workflow.
 */

// Types
export type {
  ExecutionPlan,
  PlanStage,
  QueryType,
  QueryClassification,
  PlanValidation,
  PlanEstimates,
  ExecutionContext,
  PlanExecutionResult,
  StageExecutionResult,
  PlanGenerationOptions,
  PlanValidationResult,
  StageSkipConditions,
  StageContinueConditions,
} from '@/lib/types/execution-plan';

// Plan Generator
export {
  ExecutionPlanGenerator,
  getPlanGenerator,
} from './plan-generator';

// Plan Validator
export {
  PlanValidator,
  getPlanValidator,
} from './plan-validator';

// Workflow Engine
export {
  WorkflowEngine,
  getWorkflowEngine,
} from './workflow-engine';

// Plan-Based Supervisor
export {
  planBasedSupervisor,
  getNextAgentFromPlan,
  updatePlanProgress,
} from './plan-based-supervisor';

// Plan Executor
export {
  PlanExecutor,
  getPlanExecutor,
  createPlanExecutor,
} from './plan-executor';
export type { ExecutorOptions } from './plan-executor';

// Plan Monitor
export {
  PlanMonitor,
  getPlanMonitor,
} from './plan-monitor';
export type {
  PlanMetrics,
  StageMetrics,
  AggregateMetrics,
} from './plan-monitor';
