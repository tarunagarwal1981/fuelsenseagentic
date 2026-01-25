/**
 * Execution Plan Type Definitions
 *
 * Comprehensive type definitions for the execution plan-based orchestration system.
 * Enables single LLM call planning with deterministic execution.
 */

// ============================================================================
// Query Classification
// ============================================================================

export type QueryType =
  | 'bunker_planning'
  | 'route_calculation'
  | 'weather_analysis'
  | 'cii_rating'
  | 'eu_ets'
  | 'compliance'
  | 'cost_analysis'
  | 'vessel_performance'
  | 'general_inquiry';

export interface QueryClassification {
  /** Primary query type */
  queryType: QueryType;
  /** Confidence level (0-1) */
  confidence: number;
  /** LLM's reasoning for classification */
  reasoning: string;
  /** Secondary intents detected */
  secondaryIntents?: string[];
  /** Extracted entities from query */
  extractedEntities?: {
    origin?: string;
    destination?: string;
    vesselName?: string;
    fuelTypes?: string[];
    fuelQuantity?: number;
    departureDate?: string;
  };
}

// ============================================================================
// Plan Stage
// ============================================================================

export interface StageSkipConditions {
  /** State fields to check - skip if all match */
  stateChecks: Record<string, any>;
  /** Optional JS expression for complex conditions */
  predicate?: string;
}

export interface StageContinueConditions {
  /** State fields to check - only run if all match */
  stateChecks: Record<string, any>;
  /** Optional JS expression for complex conditions */
  predicate?: string;
}

export interface PlanStage {
  // Stage Identity
  /** Unique stage identifier (e.g., 'route_calculation') */
  stageId: string;
  /** Execution sequence order (1, 2, 3...) */
  order: number;

  // Agent
  /** Agent ID from registry (e.g., 'route_agent') */
  agentId: string;
  /** Human-readable agent name */
  agentName: string;
  /** Agent type for routing */
  agentType: 'supervisor' | 'specialist' | 'coordinator' | 'finalizer';

  // Execution Control
  /** If true, plan fails if this stage fails */
  required: boolean;
  /** Can execute simultaneously with other stages */
  canRunInParallel: boolean;
  /** Stages with same group number run together */
  parallelGroup?: number;

  // Dependencies
  /** Stage IDs that must complete before this stage */
  dependsOn: string[];
  /** State fields this stage produces */
  provides: string[];
  /** State fields this stage requires */
  requires: string[];

  // Conditions
  /** Conditions to skip this stage */
  skipConditions?: StageSkipConditions;
  /** Conditions required to run this stage */
  continueConditions?: StageContinueConditions;

  // Tools
  /** Tools this agent will use */
  toolsNeeded: string[];

  // Estimates
  /** Estimated execution time in milliseconds */
  estimatedDurationMs: number;
  /** Estimated cost in USD */
  estimatedCost: number;

  // Context
  /** Additional context for the agent */
  agentContext?: Record<string, any>;
  /** Task description for the agent */
  taskDescription?: string;
  /** Priority level */
  priority?: 'critical' | 'important' | 'optional';
}

// ============================================================================
// Execution Plan
// ============================================================================

export interface PlanValidation {
  /** Whether plan is valid for execution */
  isValid: boolean;
  /** Required state fields missing from initial state */
  missingInputs: string[];
  /** Agents referenced but not in registry */
  invalidAgents: string[];
  /** Tools referenced but not available */
  invalidTools: string[];
  /** Non-blocking warnings */
  warnings: string[];
}

export interface PlanEstimates {
  /** Total number of agents to execute */
  totalAgents: number;
  /** Number of LLM calls expected */
  llmCalls: number;
  /** Number of external API calls expected */
  apiCalls: number;
  /** Estimated total cost in USD */
  estimatedCostUSD: number;
  /** Estimated total duration in milliseconds */
  estimatedDurationMs: number;
}

export interface ExecutionContext {
  /** User identifier */
  userId?: string;
  /** Session identifier */
  sessionId?: string;
  /** Correlation ID for tracing */
  correlationId?: string;
  /** Execution priority */
  priority: 'low' | 'normal' | 'high';
  /** Maximum execution time in milliseconds */
  timeout: number;
  /** Optional metadata */
  metadata?: Record<string, any>;
}

export interface ExecutionPlan {
  // Identity
  /** Unique plan identifier (UUID) */
  planId: string;
  /** Classified query type */
  queryType: QueryType;
  /** Plan creation timestamp */
  createdAt: Date;

  // Workflow Selection
  /** Workflow ID from registry */
  workflowId: string;
  /** Workflow version */
  workflowVersion: string;

  // Agent Execution Sequence
  /** Ordered list of stages to execute */
  stages: PlanStage[];

  // Validation Status
  /** Validation results */
  validation: PlanValidation;

  // Estimated Costs
  /** Cost and duration estimates */
  estimates: PlanEstimates;

  // State Requirements
  /** State fields needed to start execution */
  requiredState: string[];
  /** State fields plan will produce */
  expectedOutputs: string[];

  // Execution Context
  /** Execution parameters */
  context: ExecutionContext;

  // Query Info
  /** Original user query */
  originalQuery: string;
  /** Classification details */
  classification: QueryClassification;

  // Parallel Execution Groups
  /** Groups of stages that can run in parallel */
  parallelGroups?: Array<{
    groupId: number;
    stageIds: string[];
  }>;
}

// ============================================================================
// Execution Results
// ============================================================================

export interface StageExecutionResult {
  /** Stage ID */
  stageId: string;
  /** Agent ID */
  agentId: string;
  /** Execution status */
  status: 'success' | 'failed' | 'skipped' | 'timeout';
  /** Start timestamp */
  startedAt: Date;
  /** Completion timestamp */
  completedAt: Date;
  /** Duration in milliseconds */
  durationMs: number;
  /** State fields produced */
  producedFields: string[];
  /** Error message if failed */
  error?: string;
  /** Tool calls made */
  toolCalls?: Array<{
    toolId: string;
    success: boolean;
    durationMs: number;
  }>;
}

export interface PlanExecutionResult {
  /** Plan ID */
  planId: string;
  /** Overall success status */
  success: boolean;
  /** Start timestamp */
  startedAt: Date;
  /** Completion timestamp */
  completedAt: Date;
  /** Total duration in milliseconds */
  durationMs: number;

  // Stage Results
  /** Stages that completed successfully */
  stagesCompleted: string[];
  /** Stages that failed */
  stagesFailed: string[];
  /** Stages that were skipped */
  stagesSkipped: string[];
  /** Detailed results per stage */
  stageResults: StageExecutionResult[];

  // Final State
  /** Final state after execution */
  finalState: any;

  // Actual Costs
  /** Actual costs incurred */
  costs: {
    llmCalls: number;
    apiCalls: number;
    actualCostUSD: number;
  };

  // Errors
  /** Errors encountered during execution */
  errors: Array<{
    stageId: string;
    agentId: string;
    error: string;
    timestamp: Date;
    recoverable: boolean;
  }>;

  // Comparison to Estimates
  /** How actual compared to estimates */
  vsEstimates?: {
    durationDiffMs: number;
    costDiffUSD: number;
    accuracyPercent: number;
  };
}

// ============================================================================
// Plan Generation Options
// ============================================================================

export interface PlanGenerationOptions {
  /** Force regeneration even if cached */
  forceRegenerate?: boolean;
  /** Include optional agents */
  includeOptionalAgents?: boolean;
  /** Enable parallel execution where possible */
  enableParallelExecution?: boolean;
  /** Maximum stages to include */
  maxStages?: number;
  /** Exclude specific agents */
  excludeAgents?: string[];
  /** Override context */
  contextOverrides?: Partial<ExecutionContext>;
}

// ============================================================================
// Validation Results
// ============================================================================

export interface PlanValidationResult {
  /** Whether plan is valid */
  valid: boolean;
  /** Blocking errors */
  errors: string[];
  /** Non-blocking warnings */
  warnings: string[];
  /** Suggestions for improvement */
  suggestions?: string[];
}
