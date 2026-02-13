/**
 * Hull Performance Agent Node Unit Tests
 *
 * Tests for hullPerformanceAgentNode:
 * - State updates on success (hull_performance, agent_status, messages)
 * - Validation: throws when vessel_identifiers missing or empty
 * - Tool failure: returns failed state with agent_errors
 * - Mock tool execution
 */

import { hullPerformanceAgentNode } from '@/lib/multi-agent/agents/hull-performance-agent';
import type { MultiAgentState } from '@/lib/multi-agent/state';

jest.mock('@/lib/tools/hull-performance', () => ({
  executeFetchHullPerformanceTool: jest.fn(),
}));

jest.mock('@/lib/monitoring/axiom-logger', () => ({
  logAgentExecution: jest.fn(),
}));

jest.mock('@/lib/utils/correlation', () => ({
  extractCorrelationId: jest.fn(() => 'test-correlation-id'),
}));

const mockExecuteFetchHullPerformanceTool = jest.requireMock('@/lib/tools/hull-performance')
  .executeFetchHullPerformanceTool as jest.Mock;

function mockAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    vessel: { imo: '9123456', name: 'MV Test' },
    hull_condition: 'GOOD' as const,
    condition_indicator: '🟢' as const,
    condition_message: 'Hull in good condition',
    latest_metrics: {
      report_date: '2025-01-15',
      excess_power_pct: 10,
      speed_loss_pct: 2,
      excess_fuel_consumption_pct: 5,
      excess_fuel_consumption_mtd: 1.5,
      actual_consumption: 28,
      predicted_consumption: 26,
      actual_speed: 14,
    },
    component_breakdown: { hull_power_loss: 10, engine_power_loss: 1, propeller_power_loss: 0.5 },
    cii_impact: { hull_impact: 0.5, engine_impact: 0.1, propeller_impact: 0.1, total_impact: 0.7 },
    trend_data: [],
    analysis_period: { days: 90, start_date: '2024-10-01', end_date: '2025-01-15', total_records: 10 },
    metadata: { fetched_at: new Date().toISOString(), data_source: 'api', cache_hit: false },
    ...overrides,
  };
}

describe('hullPerformanceAgentNode', () => {
  const baseState: MultiAgentState = {
    messages: [],
    vessel_identifiers: { names: ['MV Test'], imos: ['9123456'] },
    agent_status: {},
    agent_errors: {},
  } as MultiAgentState;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls tool with vessel from state and updates state on success', async () => {
    mockExecuteFetchHullPerformanceTool.mockResolvedValue({
      success: true,
      data: mockAnalysis(),
    });

    const result = await hullPerformanceAgentNode(baseState);

    expect(mockExecuteFetchHullPerformanceTool).toHaveBeenCalledWith(
      {
        vessel_identifier: { imo: '9123456', name: 'MV Test' },
        time_period: expect.any(Object),
      },
      { correlationId: 'test-correlation-id' }
    );
    expect(result).toEqual(
      expect.objectContaining({
        hull_performance: expect.objectContaining({
          vessel: { imo: '9123456', name: 'MV Test' },
          hull_condition: 'GOOD',
          latest_metrics: expect.any(Object),
        }),
        agent_status: expect.objectContaining({
          hull_performance_agent: 'success',
        }),
      })
    );
    expect(result!.messages).toBeDefined();
    expect(result!.messages!.length).toBeGreaterThan(0);
    const lastMsg = result!.messages![result!.messages!.length - 1];
    const content = typeof lastMsg?.content === 'string' ? lastMsg.content : (lastMsg as any)?.kwargs?.content;
    expect(content).toContain('Hull performance analysis complete');
  });

  it('uses first vessel when multiple identifiers present', async () => {
    mockExecuteFetchHullPerformanceTool.mockResolvedValue({ success: true, data: mockAnalysis() });

    const state: MultiAgentState = {
      ...baseState,
      vessel_identifiers: { names: ['First', 'Second'], imos: ['111', '222'] },
    } as MultiAgentState;

    await hullPerformanceAgentNode(state);

    expect(mockExecuteFetchHullPerformanceTool).toHaveBeenCalledWith(
      expect.objectContaining({
        vessel_identifier: { imo: '111', name: 'First' },
      }),
      expect.any(Object)
    );
  });

  it('returns failed state when vessel_identifiers is missing', async () => {
    const state = { ...baseState, vessel_identifiers: undefined } as MultiAgentState;

    const result = await hullPerformanceAgentNode(state);

    expect(result.agent_status?.hull_performance_agent).toBe('failed');
    expect(result.agent_errors?.hull_performance_agent?.error).toContain('No vessel identifiers found');
    expect(mockExecuteFetchHullPerformanceTool).not.toHaveBeenCalled();
  });

  it('returns failed state when vessel_identifiers are empty', async () => {
    const state: MultiAgentState = {
      ...baseState,
      vessel_identifiers: { names: [], imos: [] },
    } as MultiAgentState;

    const result = await hullPerformanceAgentNode(state);

    expect(result.agent_status?.hull_performance_agent).toBe('failed');
    expect(result.agent_errors?.hull_performance_agent?.error).toContain('Vessel identifiers are empty');
    expect(mockExecuteFetchHullPerformanceTool).not.toHaveBeenCalled();
  });

  it('returns failed state when tool returns success: false', async () => {
    mockExecuteFetchHullPerformanceTool.mockResolvedValue({
      success: false,
      error: 'No data available',
    });

    const result = await hullPerformanceAgentNode(baseState);

    expect(result.agent_status?.hull_performance_agent).toBe('failed');
    expect(result.agent_errors?.hull_performance_agent?.error).toContain('No data available');
  });

  it('returns failed state with agent_errors when tool throws', async () => {
    mockExecuteFetchHullPerformanceTool.mockRejectedValue(new Error('Network error'));

    const result = await hullPerformanceAgentNode(baseState);

    expect(result).toEqual(
      expect.objectContaining({
        agent_status: expect.objectContaining({
          hull_performance_agent: 'failed',
        }),
        agent_errors: expect.objectContaining({
          hull_performance_agent: expect.objectContaining({
            error: 'Network error',
          }),
        }),
      })
    );
  });
});
