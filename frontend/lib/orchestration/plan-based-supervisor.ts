/**
 * Plan-Based Supervisor
 *
 * Generates complete execution plan in a SINGLE LLM call,
 * then executes deterministically without additional LLM calls.
 *
 * Reduces LLM calls from 5+ per query to 2 (plan + finalize).
 * Expected: 60% cost reduction, 2-3x speed improvement.
 */

import type { MultiAgentState } from '@/lib/multi-agent/state';
import type { ExecutionPlan } from '@/lib/types/execution-plan';
import { ExecutionPlanGenerator, getPlanGenerator } from './plan-generator';
import { PlanValidator, getPlanValidator } from './plan-validator';
import { extractCorrelationId } from '@/lib/utils/correlation';
import { logAgentExecution } from '@/lib/monitoring/axiom-logger';
import { recordAgentExecution } from '@/lib/multi-agent/monitoring';

// ============================================================================
// Plan-Based Supervisor
// ============================================================================

/**
 * Plan-Based Supervisor Node
 *
 * This supervisor:
 * 1. Generates a complete execution plan in ONE LLM call
 * 2. Validates the plan
 * 3. Returns the plan and the first agent to execute
 *
 * The workflow engine then executes the plan deterministically.
 */
export async function planBasedSupervisor(
  state: MultiAgentState
): Promise<Partial<MultiAgentState>> {
  const startTime = Date.now();
  const correlationId = extractCorrelationId(state);

  console.log('\n🎯 [PLAN-SUPERVISOR] Generating execution plan...');
  logAgentExecution('supervisor', correlationId, 0, 'started', {
    mode: 'plan_based',
    messageCount: state.messages.length,
  });

  try {
    // Extract user query from messages
    const userQuery = extractUserQuery(state);

    if (!userQuery) {
      console.error('❌ [PLAN-SUPERVISOR] No user query found in messages');
      return createErrorResponse(state, 'No user query found');
    }

    console.log(`📝 [PLAN-SUPERVISOR] Query: "${userQuery.substring(0, 100)}..."`);

    // Generate execution plan (SINGLE LLM CALL)
    const generator = getPlanGenerator();
    const plan = await generator.generatePlan(userQuery, state, {
      enableParallelExecution: true,
      includeOptionalAgents: true,
      contextOverrides: {
        correlationId,
        priority: 'normal',
      },
    });

    // Validate plan
    const validator = getPlanValidator();
    const validation = validator.validate(plan, state);

    if (!validation.valid) {
      console.error('❌ [PLAN-SUPERVISOR] Plan validation failed:', validation.errors);
      logAgentExecution('supervisor', correlationId, Date.now() - startTime, 'failed', {
        errors: validation.errors,
      });

      return {
        next_agent: 'finalize',
        execution_plan: null,
        agent_errors: {
          ...state.agent_errors,
          supervisor: {
            error: `Plan validation failed: ${validation.errors.join(', ')}`,
            timestamp: Date.now(),
          },
        },
      };
    }

    if (validation.warnings.length > 0) {
      console.warn('⚠️ [PLAN-SUPERVISOR] Plan warnings:', validation.warnings);
    }

    // Log plan details
    const duration = Date.now() - startTime;
    console.log(`\n✅ [PLAN-SUPERVISOR] Execution plan created in ${duration}ms:`);
    console.log(`   Plan ID: ${plan.planId}`);
    console.log(`   Query Type: ${plan.queryType}`);
    console.log(`   Workflow: ${plan.workflowId}`);
    console.log(`   Stages: ${plan.stages.length}`);
    plan.stages.forEach((stage, i) => {
      console.log(`     ${i + 1}. ${stage.agentName} (${stage.agentId})`);
    });
    console.log(`   Estimated cost: $${plan.estimates.estimatedCostUSD.toFixed(4)}`);
    console.log(`   Estimated duration: ${plan.estimates.estimatedDurationMs}ms`);
    console.log(`   LLM calls: ${plan.estimates.llmCalls} (vs 5+ in legacy)`);

    // Record metrics
    recordAgentExecution('supervisor', duration, true);
    logAgentExecution('supervisor', correlationId, duration, 'success', {
      mode: 'plan_based',
      planId: plan.planId,
      workflowId: plan.workflowId,
      stageCount: plan.stages.length,
      estimatedCost: plan.estimates.estimatedCostUSD,
    });

    // Get first stage to execute
    const firstStage = plan.stages[0];
    if (!firstStage) {
      console.error('❌ [PLAN-SUPERVISOR] Plan has no stages');
      return createErrorResponse(state, 'Plan has no stages');
    }

    // Build execution plan state
    const executionPlanState = {
      planId: plan.planId,
      queryType: plan.queryType,
      workflowId: plan.workflowId,
      stages: plan.stages.map((s) => ({
        stageId: s.stageId,
        agentId: s.agentId,
        order: s.order,
        required: s.required,
      })),
      currentStageIndex: 0,
      completedStages: [],
      failedStages: [],
    };

    // Build agent context from plan
    const agentContext = buildAgentContext(plan, state);

    return {
      next_agent: firstStage.agentId,
      execution_plan: executionPlanState,
      workflow_stage: 0,
      agent_context: agentContext,
      // Store full plan in state for reference (optional)
      agent_overrides: {
        _execution_plan: plan as any,
      },
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('❌ [PLAN-SUPERVISOR] Failed to generate plan:', error.message);

    recordAgentExecution('supervisor', duration, false);
    logAgentExecution('supervisor', correlationId, duration, 'failed', {
      error: error.message,
    });

    return createErrorResponse(state, error.message);
  }
}

/**
 * Extract user query from messages
 */
function extractUserQuery(state: MultiAgentState): string | null {
  // Find the last human message
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];
    if (msg._getType && msg._getType() === 'human') {
      return typeof msg.content === 'string' ? msg.content : String(msg.content);
    }
    // Fallback for messages without _getType
    if ((msg as any).type === 'human' || (msg as any).role === 'user') {
      return typeof msg.content === 'string' ? msg.content : String(msg.content);
    }
  }

  // Fallback to first message
  if (state.messages.length > 0) {
    const firstMsg = state.messages[0];
    return typeof firstMsg.content === 'string' ? firstMsg.content : String(firstMsg.content);
  }

  return null;
}

/**
 * Create error response state
 */
function createErrorResponse(
  state: MultiAgentState,
  errorMessage: string
): Partial<MultiAgentState> {
  return {
    next_agent: 'finalize',
    execution_plan: null,
    needs_clarification: false,
    agent_errors: {
      ...state.agent_errors,
      supervisor: {
        error: errorMessage,
        timestamp: Date.now(),
      },
    },
  };
}

/**
 * Build agent context from execution plan
 */
function buildAgentContext(
  plan: ExecutionPlan,
  state: MultiAgentState
): MultiAgentState['agent_context'] {
  const context: MultiAgentState['agent_context'] = {
    finalize: {
      complexity: 'medium',
      needs_weather_analysis: plan.stages.some((s) => s.agentId === 'weather_agent'),
      needs_bunker_analysis: plan.stages.some((s) => s.agentId === 'bunker_agent'),
    },
  };

  // Add context for each agent in the plan
  for (const stage of plan.stages) {
    switch (stage.agentId) {
      case 'route_agent':
        context.route_agent = {
          needs_weather_timeline: plan.stages.some((s) => s.agentId === 'weather_agent'),
          needs_port_info: plan.stages.some((s) => s.agentId === 'bunker_agent'),
          required_tools: stage.toolsNeeded,
          task_description: stage.taskDescription || 'Calculate route',
          priority: stage.priority || 'critical',
        };
        break;

      case 'weather_agent':
        context.weather_agent = {
          needs_consumption: plan.stages.some((s) => s.agentId === 'bunker_agent'),
          needs_port_weather: plan.stages.some((s) => s.agentId === 'bunker_agent') &&
            !!state.bunker_ports,
          required_tools: stage.toolsNeeded,
          task_description: stage.taskDescription || 'Analyze weather',
          priority: stage.priority || 'important',
        };
        break;

      case 'bunker_agent':
        context.bunker_agent = {
          needs_weather_consumption: plan.stages.some((s) => s.agentId === 'weather_agent'),
          needs_port_weather: true,
          required_tools: stage.toolsNeeded,
          task_description: stage.taskDescription || 'Plan bunkering',
          priority: stage.priority || 'critical',
        };
        break;

      case 'compliance_agent':
        context.compliance_agent = {
          required_tools: stage.toolsNeeded,
          task_description: stage.taskDescription || 'Check compliance',
          priority: stage.priority || 'important',
        };
        break;
    }
  }

  return context;
}

// ============================================================================
// Plan Execution Router
// ============================================================================

/**
 * Get next agent based on execution plan
 * Called after each agent completes to determine the next step
 */
export function getNextAgentFromPlan(
  state: MultiAgentState
): string {
  const plan = state.execution_plan;

  if (!plan) {
    console.log('⚠️ [PLAN-ROUTER] No execution plan, routing to finalize');
    return 'finalize';
  }

  const currentIndex = state.workflow_stage || 0;
  const nextIndex = currentIndex + 1;

  if (nextIndex >= plan.stages.length) {
    console.log('✅ [PLAN-ROUTER] All stages complete, routing to finalize');
    return 'finalize';
  }

  const nextStage = plan.stages[nextIndex];
  console.log(`➡️ [PLAN-ROUTER] Next stage: ${nextStage.agentId} (${nextIndex + 1}/${plan.stages.length})`);

  return nextStage.agentId;
}

/**
 * Update execution plan state after stage completion
 */
export function updatePlanProgress(
  state: MultiAgentState,
  completedAgentId: string,
  success: boolean
): Partial<MultiAgentState> {
  const plan = state.execution_plan;

  if (!plan) {
    return {};
  }

  const currentIndex = state.workflow_stage || 0;
  const completedStages = [...(plan.completedStages || [])];
  const failedStages = [...(plan.failedStages || [])];

  if (success) {
    const stageId = plan.stages[currentIndex]?.stageId;
    if (stageId && !completedStages.includes(stageId)) {
      completedStages.push(stageId);
    }
  } else {
    const stageId = plan.stages[currentIndex]?.stageId;
    if (stageId && !failedStages.includes(stageId)) {
      failedStages.push(stageId);
    }
  }

  return {
    workflow_stage: currentIndex + 1,
    execution_plan: {
      ...plan,
      currentStageIndex: currentIndex + 1,
      completedStages,
      failedStages,
    },
    next_agent: getNextAgentFromPlan({
      ...state,
      workflow_stage: currentIndex + 1,
    }),
  };
}
