/**
 * Plan Progress Tracking Tests
 *
 * Verifies updatePlanProgress and getNextAgentFromPlan work correctly
 * before Phase 1 plan-first integration. Catches integration issues early.
 */

import { updatePlanProgress, getNextAgentFromPlan } from '@/lib/orchestration/plan-based-supervisor';
import type { MultiAgentState } from '@/lib/multi-agent/state';

// ============================================================================
// Mock State Helpers
// ============================================================================

function createMockExecutionPlan() {
  return {
    planId: 'test-plan-123',
    queryType: 'bunker_planning',
    workflowId: 'bunker_planning',
    stages: [
      { stageId: 'route_agent_stage', agentId: 'route_agent', order: 1, required: true },
      { stageId: 'bunker_agent_stage', agentId: 'bunker_agent', order: 2, required: true },
      { stageId: 'finalize_stage', agentId: 'finalize', order: 3, required: true },
    ],
    currentStageIndex: 0,
    completedStages: [] as string[],
    failedStages: [] as string[],
  };
}

function createMockState(overrides: Partial<MultiAgentState> = {}): MultiAgentState {
  const execution_plan = createMockExecutionPlan();
  return {
    messages: [],
    execution_plan,
    workflow_stage: 0,
    ...overrides,
  } as MultiAgentState;
}

// ============================================================================
// updatePlanProgress Tests
// ============================================================================

describe('updatePlanProgress', () => {
  it('increments workflow_stage on success', () => {
    const mockState = createMockState();
    const updated = updatePlanProgress(mockState, 'route_agent', true);

    expect(updated.workflow_stage).toBe(1);
  });

  it('adds stageId to completedStages on success', () => {
    const mockState = createMockState();
    const updated = updatePlanProgress(mockState, 'route_agent', true);

    expect(updated.execution_plan?.completedStages).toContain('route_agent_stage');
  });

  it('returns next_agent as bunker_agent after route_agent completes', () => {
    const mockState = createMockState();
    const updated = updatePlanProgress(mockState, 'route_agent', true);

    expect(updated.next_agent).toBe('bunker_agent');
  });

  it('returns next_agent as finalize after bunker_agent completes', () => {
    const mockState = createMockState({ workflow_stage: 1 });
    const plan = createMockExecutionPlan();
    plan.completedStages = ['route_agent_stage'];
    const stateWithProgress = {
      ...mockState,
      execution_plan: plan,
    };
    const updated = updatePlanProgress(stateWithProgress, 'bunker_agent', true);

    expect(updated.next_agent).toBe('finalize');
  });

  it('returns empty when no execution_plan', () => {
    const mockState = createMockState({ execution_plan: null });
    const updated = updatePlanProgress(mockState, 'route_agent', true);

    expect(updated).toEqual({});
  });

  it('adds stageId to failedStages on failure', () => {
    const mockState = createMockState();
    const updated = updatePlanProgress(mockState, 'route_agent', false);

    expect(updated.execution_plan?.failedStages).toContain('route_agent_stage');
    expect(updated.workflow_stage).toBe(1);
  });
});

// ============================================================================
// getNextAgentFromPlan Tests
// ============================================================================

describe('getNextAgentFromPlan', () => {
  it('returns first agent when workflow_stage is 0', () => {
    const mockState = createMockState();
    const next = getNextAgentFromPlan(mockState);

    expect(next).toBe('route_agent');
  });

  it('returns bunker_agent when workflow_stage is 1', () => {
    const mockState = createMockState({ workflow_stage: 1 });
    const next = getNextAgentFromPlan(mockState);

    expect(next).toBe('bunker_agent');
  });

  it('returns finalize when all stages complete', () => {
    const mockState = createMockState({ workflow_stage: 3 });
    const next = getNextAgentFromPlan(mockState);

    expect(next).toBe('finalize');
  });

  it('returns finalize when no execution_plan', () => {
    const mockState = createMockState({ execution_plan: null });
    const next = getNextAgentFromPlan(mockState);

    expect(next).toBe('finalize');
  });
});
