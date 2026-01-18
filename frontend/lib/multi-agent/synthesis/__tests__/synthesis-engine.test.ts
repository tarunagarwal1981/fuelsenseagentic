/**
 * Synthesis Engine Tests
 * 
 * Tests for the synthesis decision logic and engine.
 * Note: These tests focus on the decision logic (shouldRunSynthesis)
 * without requiring actual LLM calls.
 */

import { shouldRunSynthesis, generateSynthesis } from '../synthesis-engine';
import { resetSynthesisMetrics, getSynthesisMetrics } from '../synthesis-metrics';
import type { MultiAgentState } from '../../state';

// Mock the feature flags
jest.mock('../../../config/feature-flags', () => ({
  isFeatureEnabled: jest.fn((flag: string) => {
    if (flag === 'USE_SYNTHESIS') return true;
    if (flag === 'SYNTHESIS_DEBUG') return false;
    return false;
  }),
}));

// Mock the synthesis config
jest.mock('../../../config/synthesis-config-loader', () => ({
  getSynthesisConfig: jest.fn(() => ({
    enabled: true,
    min_agents_for_synthesis: 6,
    always_synthesize_combinations: [
      ['cii_agent', 'hull_agent'],
      ['bunker_agent', 'commercial_agent'],
    ],
    skip_synthesis_combinations: [
      ['route_agent'],
      ['weather_agent'],
    ],
    llm: {
      model: 'gpt-4o-mini',
      max_tokens: 1500,
      temperature: 0.3,
    },
    max_synthesis_cost_usd: 0.05,
    min_confidence_score: 0.7,
    timeout_seconds: 10,
    features: {
      executive_insight: true,
      strategic_priorities: true,
      cross_agent_connections: true,
      hidden_opportunities: true,
      risk_alerts: true,
      financial_analysis: true,
    },
  })),
}));

describe('Synthesis Engine', () => {
  beforeEach(() => {
    // Reset metrics before each test
    resetSynthesisMetrics();
    jest.clearAllMocks();
  });

  describe('shouldRunSynthesis', () => {
    test('returns false when no agents have succeeded', () => {
      const state: Partial<MultiAgentState> = {
        agent_status: {},
      };
      
      const result = shouldRunSynthesis(state as MultiAgentState);
      expect(result.run).toBe(false);
      expect(result.reason).toContain('No successful agents');
    });

    test('returns false when < 6 agents and no special combination', () => {
      const state: Partial<MultiAgentState> = {
        agent_status: {
          route_agent: 'success',
          bunker_agent: 'success',
          weather_agent: 'success',
        },
      };
      
      const result = shouldRunSynthesis(state as MultiAgentState);
      expect(result.run).toBe(false);
      expect(result.reason).toContain('Only 3 agents');
      expect(result.reason).toContain('need 6');
    });

    test('returns true when >= 6 agents', () => {
      const state: Partial<MultiAgentState> = {
        agent_status: {
          route_agent: 'success',
          bunker_agent: 'success',
          weather_agent: 'success',
          cii_agent: 'success',
          hull_agent: 'success',
          commercial_agent: 'success',
        },
      };
      
      const result = shouldRunSynthesis(state as MultiAgentState);
      expect(result.run).toBe(true);
      expect(result.agentList).toHaveLength(6);
    });

    test('returns true for hull+CII combination even if < 6 agents', () => {
      const state: Partial<MultiAgentState> = {
        agent_status: {
          hull_agent: 'success',
          cii_agent: 'success',
        },
      };
      
      const result = shouldRunSynthesis(state as MultiAgentState);
      expect(result.run).toBe(true);
      expect(result.agentList).toContain('hull_agent');
      expect(result.agentList).toContain('cii_agent');
    });

    test('returns true for bunker+commercial combination even if < 6 agents', () => {
      const state: Partial<MultiAgentState> = {
        agent_status: {
          bunker_agent: 'success',
          commercial_agent: 'success',
          route_agent: 'success',
        },
      };
      
      const result = shouldRunSynthesis(state as MultiAgentState);
      expect(result.run).toBe(true);
    });

    test('returns true for safety critical even if < 6 agents', () => {
      const state: Partial<MultiAgentState> = {
        agent_status: {
          route_agent: 'success',
          bunker_agent: 'success',
        },
        rob_safety_status: {
          overall_safe: false,
          minimum_rob_days: 1.2,
          violations: ['Low ROB at destination'],
        },
      };
      
      const result = shouldRunSynthesis(state as MultiAgentState);
      expect(result.run).toBe(true);
    });

    test('returns false when agent combination is in skip list', () => {
      const state: Partial<MultiAgentState> = {
        agent_status: {
          route_agent: 'success',
        },
      };
      
      const result = shouldRunSynthesis(state as MultiAgentState);
      expect(result.run).toBe(false);
      expect(result.reason).toContain('skip list');
    });

    test('ignores failed agents when counting', () => {
      const state: Partial<MultiAgentState> = {
        agent_status: {
          route_agent: 'success',
          bunker_agent: 'success',
          weather_agent: 'failed',
          cii_agent: 'failed',
        },
      };
      
      const result = shouldRunSynthesis(state as MultiAgentState);
      expect(result.run).toBe(false);
      expect(result.reason).toContain('Only 2 agents');
    });
  });

  describe('generateSynthesis', () => {
    test('skips synthesis when conditions not met and records metrics', async () => {
      const state: Partial<MultiAgentState> = {
        agent_status: {
          route_agent: 'success',
        },
        messages: [],
      };
      
      const result = await generateSynthesis(state as MultiAgentState);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('skipped');
      
      // Check metrics were recorded
      const metrics = getSynthesisMetrics().getMetrics();
      expect(metrics.total_synthesis_attempts).toBe(1);
      expect(metrics.total_synthesis_skipped).toBe(1);
    });

    test('records attempt metric on start', async () => {
      const state: Partial<MultiAgentState> = {
        agent_status: {},
        messages: [],
      };
      
      await generateSynthesis(state as MultiAgentState);
      
      const metrics = getSynthesisMetrics().getMetrics();
      expect(metrics.total_synthesis_attempts).toBe(1);
    });
  });

  describe('SynthesisMetrics', () => {
    test('tracks multiple attempts correctly', () => {
      const metrics = getSynthesisMetrics();
      
      metrics.recordAttempt();
      metrics.recordAttempt();
      metrics.recordAttempt();
      
      expect(metrics.getMetrics().total_synthesis_attempts).toBe(3);
    });

    test('calculates success rate correctly', () => {
      const metrics = getSynthesisMetrics();
      
      metrics.recordSuccess(0.01, 1000);
      metrics.recordSuccess(0.02, 1500);
      metrics.recordFailure();
      
      expect(metrics.getSuccessRate()).toBe(67); // 2/3 = 66.67% rounded
    });

    test('calculates average duration correctly', () => {
      const metrics = getSynthesisMetrics();
      
      metrics.recordSuccess(0.01, 1000);
      metrics.recordSuccess(0.02, 2000);
      metrics.recordSuccess(0.01, 3000);
      
      expect(metrics.getMetrics().average_duration_ms).toBe(2000);
    });

    test('tracks total cost correctly', () => {
      const metrics = getSynthesisMetrics();
      
      metrics.recordSuccess(0.01, 1000);
      metrics.recordSuccess(0.02, 1000);
      metrics.recordSuccess(0.015, 1000);
      
      expect(metrics.getMetrics().total_cost_usd).toBeCloseTo(0.045, 4);
    });

    test('reset clears all metrics', () => {
      const metrics = getSynthesisMetrics();
      
      metrics.recordAttempt();
      metrics.recordSuccess(0.01, 1000);
      metrics.recordFailure();
      metrics.recordSkipped();
      
      metrics.reset();
      
      const m = metrics.getMetrics();
      expect(m.total_synthesis_attempts).toBe(0);
      expect(m.total_synthesis_success).toBe(0);
      expect(m.total_synthesis_failures).toBe(0);
      expect(m.total_synthesis_skipped).toBe(0);
      expect(m.total_cost_usd).toBe(0);
    });
  });
});
