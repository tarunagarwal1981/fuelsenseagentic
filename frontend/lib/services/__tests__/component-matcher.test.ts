/**
 * Component Matcher Service Tests
 *
 * Verifies:
 * 1. Match route_map when route_data exists with waypoints
 * 2. Don't match when required fields missing
 * 3. Match multiple components when state has required data
 * 4. Respect priority sorting (0 first)
 */

import { loadComponentRegistry, clearComponentRegistryCache } from '@/lib/config/component-loader';
import { ComponentMatcherService } from '../component-matcher.service';
import type { MultiAgentState } from '@/lib/multi-agent/state';

// Minimal state shape for testing - cast to MultiAgentState
function createState(overrides: Record<string, unknown>): MultiAgentState {
  return {
    messages: [],
    correlation_id: '',
    next_agent: '',
    agent_context: null,
    ...overrides,
  } as MultiAgentState;
}

describe('ComponentMatcherService', () => {
  let matcher: ComponentMatcherService;

  beforeAll(() => {
    clearComponentRegistryCache();
    const registry = loadComponentRegistry();
    matcher = new ComponentMatcherService(registry);
  });

  describe('Test 1: Match route_map when route_data exists', () => {
    it('should match route_map component with canRender: true', () => {
      const state = createState({
        route_data: {
          waypoints: [
            [1.35, 103.85],
            [51.92, 4.48],
          ],
          origin_port_code: 'SGSIN',
          destination_port_code: 'NLRTM',
        },
      });

      const matches = matcher.matchComponents(state);

      const routeMap = matches.find((m) => m.id === 'route_map');
      expect(routeMap).toBeDefined();
      expect(routeMap?.canRender).toBe(true);
      expect(routeMap?.missingFields).toBeUndefined();
      expect(routeMap?.props).toMatchObject({
        route: expect.any(Object),
        originPort: 'SGSIN',
        destinationPort: 'NLRTM',
      });
    });
  });

  describe('Test 2: Don\'t match when required fields missing', () => {
    it('should NOT match route_map when route_data is missing', () => {
      const state = createState({
        bunker_ports: [{ port_code: 'SGSIN' }],
      });

      const matches = matcher.matchComponents(state);

      const routeMap = matches.find((m) => m.id === 'route_map');
      expect(routeMap).toBeDefined();
      expect(routeMap?.canRender).toBe(false);
      expect(routeMap?.missingFields).toBeDefined();
      expect(routeMap?.missingFields).toContain('route_data.waypoints');
    });
  });

  describe('Test 3: Match multiple components', () => {
    it('should match route_map, bunker_comparison, eca_compliance when state has required data', () => {
      const state = createState({
        route_data: {
          waypoints: [[1.35, 103.85]],
          origin_port_code: 'SGSIN',
          destination_port_code: 'NLRTM',
        },
        bunker_analysis: {
          port_options: [{ port_code: 'SGSIN' }, { port_code: 'NLRTM' }],
          recommendation: 'SGSIN',
        },
        eca_segments: [{ start_nm: 0, end_nm: 100 }],
      });

      const matches = matcher.matchComponents(state);

      const routeMap = matches.find((m) => m.id === 'route_map');
      const bunkerComparison = matches.find((m) => m.id === 'bunker_comparison');
      const ecaCompliance = matches.find((m) => m.id === 'eca_compliance');

      expect(routeMap?.canRender).toBe(true);
      expect(bunkerComparison?.canRender).toBe(true);
      expect(ecaCompliance?.canRender).toBe(true);
    });
  });

  describe('Test 4: Respect priority sorting', () => {
    it('should return components sorted by priority (0 first)', () => {
      const state = createState({
        route_data: {
          waypoints: [[1.35, 103.85]],
          origin_port_code: 'SGSIN',
          destination_port_code: 'NLRTM',
        },
        bunker_analysis: {
          port_options: [{}, {}],
        },
        eca_segments: [{}],
      });

      const matches = matcher.matchComponents(state);

      const priorities = matches.map((m) => m.priority);
      const sortedPriorities = [...priorities].sort((a, b) => a - b);
      expect(priorities).toEqual(sortedPriorities);

      const routeMap = matches.find((m) => m.id === 'route_map');
      expect(routeMap?.priority).toBe(0);
      expect(matches[0].priority).toBeLessThanOrEqual(matches[matches.length - 1].priority);
    });
  });

  describe('Query type filtering', () => {
    it('should filter components by query type when specified', () => {
      const state = createState({
        route_data: {
          waypoints: [[1.35, 103.85]],
          origin_port_code: 'SGSIN',
          destination_port_code: 'NLRTM',
        },
      });

      const allMatches = matcher.matchComponents(state);
      const routeCalcMatches = matcher.matchComponents(state, 'route_calculation');

      expect(routeCalcMatches.length).toBeLessThanOrEqual(allMatches.length);
      expect(routeCalcMatches.every((m) => ['route_map'].includes(m.id))).toBe(true);
    });
  });

  describe('Fallback strategy', () => {
    it('should return fallback strategy from registry', () => {
      const strategy = matcher.getFallbackStrategy();
      expect(['llm_synthesis', 'text_only']).toContain(strategy);
    });

    it('should return LLM config when strategy is llm_synthesis', () => {
      const llmConfig = matcher.getFallbackLLMConfig();
      if (matcher.getFallbackStrategy() === 'llm_synthesis') {
        expect(llmConfig).toBeDefined();
        expect(llmConfig?.model).toBeDefined();
        expect(typeof llmConfig?.temperature).toBe('number');
        expect(typeof llmConfig?.max_tokens).toBe('number');
      }
    });
  });
});
