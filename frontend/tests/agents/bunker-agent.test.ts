/**
 * Bunker Agent integration tests.
 * - detectBunkerQuerySubtype for each query type; workflow routing; state and messages.
 */

import { HumanMessage } from '@langchain/core/messages';
import { detectBunkerQuerySubtype } from '@/lib/types/bunker-agent';
import {
  createMockState,
  assertBunkerAnalysis,
  validateStateMessages,
} from '@/tests/utils/bunker-test-utils';
import {
  mockRouteData,
  mockBunkerPricingList,
  mockVesselSpecs,
  mockROBSnapshot,
  mockAgentState,
} from '@/tests/mocks/bunker-mocks';

// Mock dependencies so we can run the node without real API/tools
const mockFetchBunkerPricing = jest.fn();
const mockFetchVesselSpecs = jest.fn();
const mockFetchCurrentROB = jest.fn();
const mockPortFinder = jest.fn();
const mockBunkerAnalyzer = jest.fn();
const mockGetDefaultVesselProfile = jest.fn();

jest.mock('@/lib/services/bunker-data-service', () => ({
  bunkerDataService: {
    fetchBunkerPricing: (...args: unknown[]) => mockFetchBunkerPricing(...args),
    fetchVesselSpecs: (...args: unknown[]) => mockFetchVesselSpecs(...args),
    fetchCurrentROB: (...args: unknown[]) => mockFetchCurrentROB(...args),
    fetchPortCapabilities: jest.fn().mockResolvedValue({ portCode: 'SGSIN', availableFuelTypes: ['VLSFO'], ecaZone: false }),
  },
}));

jest.mock('@/lib/tools/port-finder', () => ({
  executePortFinderTool: (input: unknown) => mockPortFinder(input),
}));

jest.mock('@/lib/tools/bunker-analyzer', () => ({
  executeBunkerAnalyzerTool: (input: unknown) => mockBunkerAnalyzer(input),
}));

jest.mock('@/lib/services/vessel-service', () => ({
  getDefaultVesselProfile: () => mockGetDefaultVesselProfile(),
}));

describe('bunker-agent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDefaultVesselProfile.mockReturnValue({
      consumption_vlsfo_per_day: 35,
      fouling_factor: 1,
      capacity: { VLSFO: 2000, LSMGO: 200 },
      initial_rob: { VLSFO: 500, LSMGO: 50 },
    });
  });

  describe('detectBunkerQuerySubtype', () => {
    it('SIMPLE_PORT_TO_PORT when route_data has waypoints and no vessel context', () => {
      const state = createMockState('SIMPLE_PORT_TO_PORT') as any;
      state.vessel_identifiers = undefined;
      state.messages = [];
      expect(detectBunkerQuerySubtype(state)).toBe('SIMPLE_PORT_TO_PORT');
    });

    it('VESSEL_SPECIFIC when single vessel in vessel_identifiers', () => {
      const state = createMockState('VESSEL_SPECIFIC') as any;
      state.vessel_identifiers = { imos: ['IMO9123456'], names: [] };
      state.messages = [];
      expect(detectBunkerQuerySubtype(state)).toBe('VESSEL_SPECIFIC');
    });

    it('FLEET_COMPARISON when multiple vessels in vessel_identifiers', () => {
      const state = createMockState('FLEET_COMPARISON') as any;
      state.vessel_identifiers = { imos: ['IMO1', 'IMO2'], names: [] };
      state.messages = [];
      expect(detectBunkerQuerySubtype(state)).toBe('FLEET_COMPARISON');
    });

    it('CONSTRAINT_FIRST when query mentions cheapest/budget', () => {
      const state = createMockState('CONSTRAINT_FIRST') as any;
      state.messages = [
        new HumanMessage({ content: 'Find cheapest bunker under $500 with max 100nm deviation' }),
      ];
      expect(detectBunkerQuerySubtype(state)).toBe('CONSTRAINT_FIRST');
    });

    it('CONSTRAINT_FIRST when query mentions minimum cost', () => {
      const state = {
        messages: [new HumanMessage({ content: 'Minimum cost bunkering options' })],
        route_data: mockRouteData(),
        vessel_identifiers: undefined,
      } as any;
      expect(detectBunkerQuerySubtype(state)).toBe('CONSTRAINT_FIRST');
    });

    it('falls back to SIMPLE_PORT_TO_PORT when route has waypoints and no vessel', () => {
      const state = {
        messages: [],
        route_data: mockRouteData(),
        vessel_identifiers: undefined,
      } as any;
      expect(detectBunkerQuerySubtype(state)).toBe('SIMPLE_PORT_TO_PORT');
    });
  });

  describe('workflow integration (mocked)', () => {
    it('bunkerAgentNode returns error state when route_data missing waypoints', async () => {
      const { bunkerAgentNode } = await import('@/lib/multi-agent/agent-nodes');
      const state = {
        messages: [],
        route_data: { waypoints: [], origin_port_code: 'SGSIN', destination_port_code: 'NLRTM' },
        agent_status: {},
      } as any;

      const result = await bunkerAgentNode(state);

      expect(result.agent_status?.bunker_agent).toBe('failed');
      expect(result.agent_errors?.bunker_agent).toBeDefined();
      expect(result.messages).toBeDefined();
      expect(result.messages!.length).toBeGreaterThan(0);
    });

    it('SIMPLE_PORT_TO_PORT workflow populates bunker_analysis when ports and analyzer succeed', async () => {
      mockPortFinder.mockResolvedValue({
        ports: [
          { port: { port_code: 'SGSIN', name: 'Singapore', fuel_capabilities: ['VLSFO'] }, distance_from_route_nm: 0 },
          { port: { port_code: 'AEFJR', name: 'Fujairah', fuel_capabilities: ['VLSFO'] }, distance_from_route_nm: 50 },
        ],
      });
      mockFetchBunkerPricing.mockResolvedValue(mockBunkerPricingList(['SGSIN', 'AEFJR']));
      mockBunkerAnalyzer.mockResolvedValue({
        recommendations: [
          { port_code: 'AEFJR', port_name: 'Fujairah', total_cost_usd: 250000, fuel_cost_usd: 248000, distance_from_route_nm: 50, rank: 1 },
          { port_code: 'SGSIN', port_name: 'Singapore', total_cost_usd: 260000, fuel_cost_usd: 258000, distance_from_route_nm: 0, rank: 2 },
        ],
        best_option: { port_code: 'AEFJR', port_name: 'Fujairah', total_cost_usd: 250000, fuel_cost_usd: 248000, distance_from_route_nm: 50, rank: 1 },
        worst_option: { port_code: 'SGSIN', port_name: 'Singapore', total_cost_usd: 260000, fuel_cost_usd: 260000, distance_from_route_nm: 0, rank: 2 },
        max_savings_usd: 10000,
        analysis_summary: 'Best option: Fujairah.',
      });

      const { bunkerAgentNode } = await import('@/lib/multi-agent/agent-nodes');
      const state = {
        messages: [],
        route_data: mockRouteData(),
        agent_status: {},
      } as any;

      const result = await bunkerAgentNode(state);

      expect(result.agent_status?.bunker_agent).toBe('success');
      expect(result.bunker_analysis).toBeDefined();
      assertBunkerAnalysis(result.bunker_analysis);
      expect(result.bunker_ports).toBeDefined();
      expect(result.port_prices).toBeDefined();
      validateStateMessages(result.messages, 1);
    });

    it('VESSEL_SPECIFIC workflow uses vessel specs and ROB', async () => {
      mockFetchVesselSpecs.mockResolvedValue(mockVesselSpecs({ vesselId: 'IMO9123456', tankCapacity: 2500, consumptionRate: 35 }));
      mockFetchCurrentROB.mockResolvedValue(mockROBSnapshot({ vesselId: 'IMO9123456', totalROB: 800 }));
      mockPortFinder.mockResolvedValue({
        ports: [
          { port: { port_code: 'SGSIN', name: 'Singapore', fuel_capabilities: ['VLSFO'] }, distance_from_route_nm: 0 },
        ],
      });
      mockFetchBunkerPricing.mockResolvedValue(mockBunkerPricingList(['SGSIN']));
      mockBunkerAnalyzer.mockResolvedValue({
        recommendations: [
          { port_code: 'SGSIN', port_name: 'Singapore', total_cost_usd: 200000, fuel_cost_usd: 200000, distance_from_route_nm: 0, rank: 1 },
        ],
        best_option: { port_code: 'SGSIN', port_name: 'Singapore', total_cost_usd: 200000, fuel_cost_usd: 200000, distance_from_route_nm: 0, rank: 1 },
        worst_option: { port_code: 'SGSIN', port_name: 'Singapore', total_cost_usd: 200000, fuel_cost_usd: 200000, distance_from_route_nm: 0, rank: 1 },
        max_savings_usd: 0,
        analysis_summary: 'Single option.',
      });

      const { bunkerAgentNode } = await import('@/lib/multi-agent/agent-nodes');
      const state = {
        messages: [new HumanMessage({ content: 'Bunker plan for IMO9123456' })],
        route_data: mockRouteData(),
        vessel_identifiers: { imos: ['IMO9123456'], names: [] },
        agent_status: {},
      } as any;

      const result = await bunkerAgentNode(state);

      expect(mockFetchVesselSpecs).toHaveBeenCalledWith('IMO9123456');
      expect(mockFetchCurrentROB).toHaveBeenCalledWith('IMO9123456');
      expect(result.agent_status?.bunker_agent).toBe('success');
      expect(result.bunker_analysis).toBeDefined();
      if (result.bunker_analysis && typeof result.bunker_analysis === 'object') {
        const a = result.bunker_analysis as unknown as Record<string, unknown>;
        expect(a.query_type).toBe('VESSEL_SPECIFIC');
        expect(a.vessel_context).toBeDefined();
      }
    });

    it('error handling: partial state returned when analyzer throws', async () => {
      mockPortFinder.mockResolvedValue({
        ports: [{ port: { port_code: 'SGSIN', name: 'Singapore', fuel_capabilities: ['VLSFO'] }, distance_from_route_nm: 0 }],
      });
      mockFetchBunkerPricing.mockResolvedValue(mockBunkerPricingList(['SGSIN']));
      mockBunkerAnalyzer.mockRejectedValue(new Error('Analyzer failed'));

      const { bunkerAgentNode } = await import('@/lib/multi-agent/agent-nodes');
      const state = {
        messages: [],
        route_data: mockRouteData(),
        agent_status: {},
      } as any;

      const result = await bunkerAgentNode(state);

      expect(result.agent_status?.bunker_agent).toBe('success');
      expect(result.bunker_ports).toBeDefined();
      expect(result.port_prices).toBeDefined();
    });
  });

  describe('state messages', () => {
    it('messages include subtype detection and workflow completion', async () => {
      mockPortFinder.mockResolvedValue({ ports: [] });
      mockFetchBunkerPricing.mockResolvedValue([]);

      const { bunkerAgentNode } = await import('@/lib/multi-agent/agent-nodes');
      const state = {
        messages: [new HumanMessage({ content: 'Bunker options Singapore to Rotterdam' })],
        route_data: mockRouteData(),
        agent_status: {},
      } as any;

      const result = await bunkerAgentNode(state);

      validateStateMessages(result.messages, 2);
      const contents = (result.messages as { content?: string }[]).map((m) =>
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      );
      const hasSubtype = contents.some((c) => c.includes('Query subtype') || c.includes('SIMPLE_PORT_TO_PORT'));
      const hasComplete = contents.some((c) => c.includes('bunker_workflow_complete') || c.includes('ports_found'));
      expect(hasSubtype || hasComplete).toBe(true);
    });
  });

  describe('bunker_analysis structure', () => {
    it('analysis has recommendations, best_option, analysis_summary when present', async () => {
      mockPortFinder.mockResolvedValue({
        ports: [
          { port: { port_code: 'SGSIN', name: 'Singapore', fuel_capabilities: ['VLSFO'] }, distance_from_route_nm: 0 },
        ],
      });
      mockFetchBunkerPricing.mockResolvedValue(mockBunkerPricingList(['SGSIN']));
      mockBunkerAnalyzer.mockResolvedValue({
        recommendations: [
          { port_code: 'SGSIN', port_name: 'Singapore', total_cost_usd: 100000, fuel_cost_usd: 100000, distance_from_route_nm: 0, rank: 1 },
        ],
        best_option: { port_code: 'SGSIN', port_name: 'Singapore', total_cost_usd: 100000, fuel_cost_usd: 100000, distance_from_route_nm: 0, rank: 1 },
        worst_option: { port_code: 'SGSIN', port_name: 'Singapore', total_cost_usd: 100000, fuel_cost_usd: 100000, distance_from_route_nm: 0, rank: 1 },
        max_savings_usd: 0,
        analysis_summary: 'Summary text.',
      });

      const { bunkerAgentNode } = await import('@/lib/multi-agent/agent-nodes');
      const state = {
        messages: [],
        route_data: mockRouteData(),
        agent_status: {},
      } as any;

      const result = await bunkerAgentNode(state);

      expect(result.bunker_analysis).toBeDefined();
      assertBunkerAnalysis(result.bunker_analysis);
      const a = result.bunker_analysis as Record<string, unknown>;
      expect(a.best_option).toBeDefined();
      expect(a.analysis_summary).toBe('Summary text.');
    });
  });
});
