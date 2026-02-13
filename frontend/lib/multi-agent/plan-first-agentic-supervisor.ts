/**
 * Plan-First Agentic Supervisor
 *
 * Generates a complete execution plan on the FIRST supervisor call,
 * then routes deterministically from the plan. Uses ReAct recovery when agents fail.
 *
 * Key difference from plan-based-supervisor: Used within agentic mode (USE_AGENTIC_SUPERVISOR).
 * Plan generation happens on first call; subsequent calls use getNextAgentFromPlan (no LLM).
 */

import type { MultiAgentState } from './state';
import type { ExecutionPlan } from '@/lib/types/execution-plan';
import { getPlanGenerator } from '@/lib/orchestration/plan-generator';
import { getPlanValidator } from '@/lib/orchestration/plan-validator';
import { getNextAgentFromPlan } from '@/lib/orchestration/plan-based-supervisor';

// ============================================================================
// Helpers
// ============================================================================

function extractUserQuery(state: MultiAgentState): string | null {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];
    if (msg._getType && msg._getType() === 'human') {
      return typeof msg.content === 'string' ? msg.content : String(msg.content);
    }
    if ((msg as any).type === 'human' || (msg as any).role === 'user') {
      return typeof msg.content === 'string' ? msg.content : String(msg.content);
    }
  }
  if (state.messages.length > 0) {
    const firstMsg = state.messages[0];
    return typeof firstMsg.content === 'string' ? firstMsg.content : String(firstMsg.content);
  }
  return null;
}

function isPlanComplete(state: MultiAgentState): boolean {
  if (!state.execution_plan) return false;
  const plan = state.execution_plan;
  const currentStage = state.workflow_stage ?? 0;
  return (
    currentStage >= plan.stages.length ||
    (plan.completedStages?.length ?? 0) >= plan.stages.length
  );
}

function buildExecutionPlanState(plan: ExecutionPlan) {
  return {
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
    completedStages: [] as string[],
    failedStages: [] as string[],
  };
}

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
          needs_port_weather:
            plan.stages.some((s) => s.agentId === 'bunker_agent') && !!state.bunker_ports,
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

/**
 * Plan-First Agentic Supervisor
 *
 * 1. If no execution_plan: Generate plan, validate, store, return first agent
 * 2. If plan complete: Return finalize
 * 3. If plan exists and mid-execution: Check agent failure → ReAct recovery or getNextAgentFromPlan
 */
export async function planFirstAgenticSupervisor(
  state: MultiAgentState
): Promise<Partial<MultiAgentState>> {
  // ========================================================================
  // Case 1: No plan - FIRST supervisor call, generate plan
  // ========================================================================
  if (!state.execution_plan) {
    const userQuery = extractUserQuery(state);
    if (!userQuery) {
      console.error('❌ [PLAN-FIRST-SUPERVISOR] No user query found');
      return { next_agent: 'finalize' };
    }

    console.log('📋 [PLAN-FIRST-SUPERVISOR] First call - generating execution plan...');

    try {
      const generator = getPlanGenerator();
      const plan = await generator.generatePlan(userQuery, state, {
        enableParallelExecution: true,
        includeOptionalAgents: true,
      });

      const validator = getPlanValidator();
      const validation = validator.validate(plan, state);

      if (!validation.valid) {
        console.warn('⚠️ [PLAN-FIRST-SUPERVISOR] Plan validation failed, falling back to reasoning supervisor');
        const { reasoningSupervisor } = await import('./agentic-supervisor');
        return reasoningSupervisor(state);
      }

      const executionPlanState = buildExecutionPlanState(plan);
      const firstStage = plan.stages[0];
      if (!firstStage) {
        return { next_agent: 'finalize' };
      }

      console.log(`✅ [PLAN-FIRST-SUPERVISOR] Plan created: ${plan.workflowId}, ${plan.stages.length} stages`);

      return {
        next_agent: firstStage.agentId,
        execution_plan: executionPlanState,
        original_intent: plan.queryType,
        workflow_stage: 0,
        agent_context: buildAgentContext(plan, state),
      };
    } catch (error: any) {
      console.error('❌ [PLAN-FIRST-SUPERVISOR] Plan generation failed:', error.message);
      const { reasoningSupervisor } = await import('./agentic-supervisor');
      return reasoningSupervisor(state);
    }
  }

  // ========================================================================
  // Case 2: Plan complete - route to finalize
  // ========================================================================
  if (isPlanComplete(state)) {
    console.log('✅ [PLAN-FIRST-SUPERVISOR] Plan complete → finalize');
    return { next_agent: 'finalize' };
  }

  // ========================================================================
  // Case 3: Plan exists, mid-execution - check for agent failure
  // ========================================================================
  const plan = state.execution_plan;
  const lastCompletedIndex = Math.max(0, (state.workflow_stage ?? 1) - 1);
  const lastAgentId = plan.stages[lastCompletedIndex]?.agentId;

  if (lastAgentId && state.agent_status?.[lastAgentId] === 'failed') {
    console.log(`🔄 [PLAN-FIRST-SUPERVISOR] Agent ${lastAgentId} failed - invoking ReAct recovery`);
    const { reasoningSupervisor } = await import('./agentic-supervisor');
    return reasoningSupervisor(state);
  }

  const nextAgent = getNextAgentFromPlan(state);
  console.log(`➡️ [PLAN-FIRST-SUPERVISOR] Routing to ${nextAgent}`);
  return { next_agent: nextAgent };
}
