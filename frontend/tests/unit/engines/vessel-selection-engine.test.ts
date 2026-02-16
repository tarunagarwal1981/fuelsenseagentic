/**
 * Vessel Selection Engine & Parser Unit Tests
 *
 * Tests for:
 * - VesselSelectionEngine.analyzeVessel (vessel needing bunker, sufficient ROB, invalid vessel, missing voyage)
 * - VesselSelectionEngine.compareVessels (2/3 vessel, all need bunker, constraints)
 * - VesselSelectionEngine.rankVessels (ranking algorithm, scores, tie-breaking)
 * - VesselSelectionEngine.calculateFeasibilityScore, generateComparisonMatrix
 * - VesselSelectionQueryParser (vessel names, voyage details, query detection, edge cases)
 *
 * Run with: npx tsx tests/unit/engines/vessel-selection-engine.test.ts
 */

import { VesselSelectionEngine } from '@/lib/engines/vessel-selection-engine';
import { VesselSelectionQueryParser } from '@/lib/utils/vessel-selection-parser';
import type { VesselAnalysisResult } from '@/lib/types/vessel-selection';

// ============================================================================
// Mock vessel-service and ServiceContainer
// ============================================================================

const mockVesselProfile = (name: string, robVlsfo: number, robLsmgo: number) => ({
  vessel_name: name,
  vessel_data: null,
  initial_rob: { VLSFO: robVlsfo, LSMGO: robLsmgo },
  capacity: { VLSFO: 2000, LSMGO: 200 },
  consumption_vlsfo_per_day: 30,
  consumption_lsmgo_per_day: 3,
  operational_speed: 14,
  fouling_factor: 1.0,
});

const mockGetVesselData = jest.fn();
const mockGetVesselProfile = jest.fn();
const mockGetDefaultVesselProfile = jest.fn();
const mockGetVesselForVoyagePlanning = jest.fn();
const mockProjectROBAtCurrentVoyageEnd = jest.fn();

jest.mock('@/lib/services/vessel-service', () => ({
  getVesselData: (...args: unknown[]) => mockGetVesselData(...args),
  getVesselProfile: (...args: unknown[]) => mockGetVesselProfile(...args),
  getDefaultVesselProfile: () => mockGetDefaultVesselProfile(),
}));

jest.mock('@/lib/repositories/service-container', () => ({
  ServiceContainer: {
    getInstance: () => ({
      getVesselService: () => ({
        getVesselForVoyagePlanning: mockGetVesselForVoyagePlanning,
        projectROBAtCurrentVoyageEnd: mockProjectROBAtCurrentVoyageEnd,
      }),
    }),
  },
}));

// ============================================================================
// Test Data
// ============================================================================

const nextVoyage = {
  origin: 'SGSIN',
  destination: 'NLRTM',
  departure_date: '2025-03-15',
  speed: 14,
};

const routeData = {
  origin_port_code: 'SGSIN',
  destination_port_code: 'NLRTM',
  distance_nm: 11250,
  estimated_hours: 672,
  route_type: 'sea',
  waypoints: [] as { lat: number; lon: number }[],
};

const bunkerAnalysis = {
  best_option: {
    port_code: 'AEFJR',
    port_name: 'Fujairah',
    total_cost_usd: 38000,
    fuel_cost_usd: 35000,
    deviation_cost_usd: 3000,
    distance_from_route_nm: 45,
  },
};

// ============================================================================
// VesselSelectionEngine.analyzeVessel
// ============================================================================

describe('VesselSelectionEngine.analyzeVessel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetVesselData.mockReturnValue(null);
    mockGetVesselProfile.mockReturnValue(null);
    mockGetDefaultVesselProfile.mockReturnValue(mockVesselProfile('Default (no vessel specified)', 850, 100));
    mockGetVesselForVoyagePlanning.mockResolvedValue(null);
    mockProjectROBAtCurrentVoyageEnd.mockResolvedValue(null);
  });

  it('should analyze vessel with sufficient ROB (can proceed without bunker)', async () => {
    // Voyage needs ~1005 VLSFO, ~101 LSMGO (11250nm at 14kt, 30/3 per day). Use 1200/150.
    const profile = mockVesselProfile('MV Pacific Star', 1200, 150);
    mockGetVesselProfile.mockReturnValue(profile);

    const result = await VesselSelectionEngine.analyzeVessel({
      vessel_name: 'MV Pacific Star',
      next_voyage: nextVoyage,
      route_data: routeData,
    });

    expect(result.vessel_name).toBe('MV Pacific Star');
    expect(result.can_proceed_without_bunker).toBe(true);
    expect(result.bunker_plan).toBeUndefined();
    expect(result.total_voyage_cost).toBe(0);
    expect(result.risks).not.toContain('Requires bunkering before next voyage');
  });

  it('should analyze vessel needing bunker and generate bunker plan', async () => {
    const profile = mockVesselProfile('MV Low ROB', 100, 20);
    mockGetVesselProfile.mockReturnValue(profile);

    const result = await VesselSelectionEngine.analyzeVessel({
      vessel_name: 'MV Low ROB',
      next_voyage: nextVoyage,
      route_data: routeData,
      bunker_analysis: bunkerAnalysis,
    });

    expect(result.can_proceed_without_bunker).toBe(false);
    expect(result.bunker_plan).toBeDefined();
    expect(result.bunker_plan?.port_name).toBe('Fujairah');
    expect(result.bunker_plan?.total_cost_usd).toBe(38000);
    expect(result.total_voyage_cost).toBeGreaterThan(0);
    expect(result.risks).toContain('Requires bunkering before next voyage');
  });

  it('should handle invalid vessel name with default profile fallback', async () => {
    mockGetVesselProfile.mockReturnValue(null);
    mockGetDefaultVesselProfile.mockReturnValue(mockVesselProfile('Default (no vessel specified)', 850, 100));

    const result = await VesselSelectionEngine.analyzeVessel({
      vessel_name: 'MV Nonexistent XYZ',
      next_voyage: nextVoyage,
      route_data: routeData,
    });

    expect(result.vessel_name).toBe('MV Nonexistent XYZ');
    expect(result.vessel_profile.vessel_name).toBe('Default (no vessel specified)');
    expect(result.projected_rob_at_start.VLSFO).toBe(850);
    expect(result.projected_rob_at_start.LSMGO).toBe(100);
  });

  it('should handle missing voyage data (empty origin/destination)', async () => {
    mockGetVesselProfile.mockReturnValue(mockVesselProfile('MV Test', 500, 50));

    const result = await VesselSelectionEngine.analyzeVessel({
      vessel_name: 'MV Test',
      next_voyage: { origin: '', destination: '' },
      route_data: routeData,
    });

    expect(result).toBeDefined();
    expect(result.vessel_name).toBe('MV Test');
    expect(result.next_voyage_requirements.VLSFO).toBeGreaterThanOrEqual(0);
  });

  it('should calculate feasibility score correctly', async () => {
    const profile = mockVesselProfile('MV Good ROB', 1000, 150);
    mockGetVesselProfile.mockReturnValue(profile);

    const result = await VesselSelectionEngine.analyzeVessel({
      vessel_name: 'MV Good ROB',
      next_voyage: nextVoyage,
      route_data: routeData,
    });

    expect(result.feasibility_score).toBeGreaterThanOrEqual(0);
    expect(result.feasibility_score).toBeLessThanOrEqual(100);
    if (result.can_proceed_without_bunker) {
      expect(result.feasibility_score).toBeGreaterThan(50);
    }
  });
});

// ============================================================================
// VesselSelectionEngine.compareVessels
// ============================================================================

describe('VesselSelectionEngine.compareVessels', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetVesselData.mockReturnValue(null);
    mockGetVesselProfile.mockImplementation((name: string) => {
      if (name.includes('Pacific')) return mockVesselProfile(name, 900, 120);
      if (name.includes('Atlantic')) return mockVesselProfile(name, 100, 20);
      if (name.includes('Ocean')) return mockVesselProfile(name, 800, 90);
      return null;
    });
    mockGetDefaultVesselProfile.mockReturnValue(mockVesselProfile('Unknown', 850, 100));
    mockGetVesselForVoyagePlanning.mockResolvedValue(null);
    mockProjectROBAtCurrentVoyageEnd.mockResolvedValue(null);
  });

  it('should compare 2 vessels and return rankings', async () => {
    const result = await VesselSelectionEngine.compareVessels({
      vessel_names: ['MV Pacific Star', 'MV Atlantic Trader'],
      next_voyage: nextVoyage,
      route_data: routeData,
      bunker_analysis: bunkerAnalysis,
    });

    expect(result.vessels_analyzed).toHaveLength(2);
    expect(result.rankings).toHaveLength(2);
    expect(result.recommended_vessel).toBeDefined();
    expect(result.analysis_summary).toContain('Compared');
    expect(result.comparison_matrix).toBeDefined();
    expect(Object.keys(result.comparison_matrix)).toHaveLength(2);
  });

  it('should compare 3 vessels', async () => {
    const result = await VesselSelectionEngine.compareVessels({
      vessel_names: ['MV Pacific Star', 'MV Atlantic Trader', 'MV Ocean Glory'],
      next_voyage: nextVoyage,
      route_data: routeData,
      bunker_analysis: bunkerAnalysis,
    });

    expect(result.vessels_analyzed).toHaveLength(3);
    expect(result.rankings).toHaveLength(3);
    expect(result.rankings[0].rank).toBe(1);
    expect(result.rankings[1].rank).toBe(2);
    expect(result.rankings[2].rank).toBe(3);
  });

  it('should apply exclude_vessels constraint', async () => {
    const result = await VesselSelectionEngine.compareVessels({
      vessel_names: ['MV Pacific Star', 'MV Atlantic Trader', 'MV Ocean Glory'],
      next_voyage: nextVoyage,
      constraints: { exclude_vessels: ['MV Atlantic Trader'] },
      route_data: routeData,
    });

    expect(result.vessels_analyzed).toHaveLength(2);
    expect(result.vessels_analyzed.map((v: VesselAnalysisResult) => v.vessel_name)).not.toContain(
      'MV Atlantic Trader'
    );
  });

  it('should apply max_bunker_cost constraint', async () => {
    mockGetVesselProfile.mockReturnValue(mockVesselProfile('MV Low ROB', 50, 10));

    const result = await VesselSelectionEngine.compareVessels({
      vessel_names: ['MV A', 'MV B'],
      next_voyage: nextVoyage,
      route_data: routeData,
      bunker_analysis: bunkerAnalysis,
      constraints: { max_bunker_cost: 200000 },
    });

    // All vessels should be within budget (or filter would have removed them)
    expect(result.vessels_analyzed.length).toBeGreaterThan(0);
    expect(result.vessels_analyzed.every((v: VesselAnalysisResult) => v.total_voyage_cost <= 200000)).toBe(
      true
    );
  });

  it('should throw when vessel_names is empty', async () => {
    await expect(
      VesselSelectionEngine.compareVessels({
        vessel_names: [],
        next_voyage: nextVoyage,
      })
    ).rejects.toThrow('vessel_names');
  });

  it('should throw when next_voyage has no origin/destination', async () => {
    await expect(
      VesselSelectionEngine.compareVessels({
        vessel_names: ['MV A'],
        next_voyage: { origin: '', destination: '' },
      })
    ).rejects.toThrow('origin');
  });
});

// ============================================================================
// VesselSelectionEngine.rankVessels
// ============================================================================

describe('VesselSelectionEngine.rankVessels', () => {
  const createAnalysis = (
    name: string,
    canProceed: boolean,
    cost: number,
    deviation?: number
  ): VesselAnalysisResult =>
    ({
      vessel_name: name,
      vessel_profile: mockVesselProfile(name, 500, 50),
      current_voyage_end_port: 'SGSIN',
      current_voyage_end_eta: new Date(),
      projected_rob_at_start: { VLSFO: 500, LSMGO: 50 },
      next_voyage_requirements: { VLSFO: 400, LSMGO: 40 },
      can_proceed_without_bunker: canProceed,
      bunker_plan: canProceed ? undefined : { port_name: 'Fujairah', deviation_nm: deviation ?? 50 } as any,
      total_voyage_cost: cost,
      cost_breakdown: {} as any,
      feasibility_score: 70,
      risks: [],
    }) as VesselAnalysisResult;

  it('should rank vessel with sufficient ROB first', () => {
    const analyses = [
      createAnalysis('MV Needs Bunker', false, 100000, 45),
      createAnalysis('MV Sufficient ROB', true, 0),
    ];

    const rankings = VesselSelectionEngine.rankVessels(analyses);

    expect(rankings[0].vessel_name).toBe('MV Sufficient ROB');
    expect(rankings[0].rank).toBe(1);
    expect(rankings[0].recommendation_reason).toContain('No bunkering');
  });

  it('should rank by total cost when all need bunker', () => {
    const analyses = [
      createAnalysis('MV High Cost', false, 150000, 80),
      createAnalysis('MV Low Cost', false, 80000, 30),
      createAnalysis('MV Mid Cost', false, 120000, 50),
    ];

    const rankings = VesselSelectionEngine.rankVessels(analyses);

    expect(rankings[0].vessel_name).toBe('MV Low Cost');
    expect(rankings[0].rank).toBe(1);
    expect(rankings[1].vessel_name).toBe('MV Mid Cost');
    expect(rankings[2].vessel_name).toBe('MV High Cost');
  });

  it('should apply tie-breaker by deviation when costs are equal', () => {
    const analyses = [
      createAnalysis('MV High Dev', false, 100000, 60),
      createAnalysis('MV Low Dev', false, 100000, 20),
    ];

    const rankings = VesselSelectionEngine.rankVessels(analyses);

    expect(rankings[0].vessel_name).toBe('MV Low Dev');
  });

  it('should return empty array for empty input', () => {
    const rankings = VesselSelectionEngine.rankVessels([]);
    expect(rankings).toEqual([]);
  });

  it('should include score and recommendation_reason for each ranking', () => {
    const analyses = [createAnalysis('MV Single', true, 0)];
    const rankings = VesselSelectionEngine.rankVessels(analyses);

    expect(rankings[0].score).toBeGreaterThanOrEqual(0);
    expect(rankings[0].recommendation_reason).toBeDefined();
    expect(rankings[0].recommendation_reason.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// VesselSelectionEngine.calculateFeasibilityScore & generateComparisonMatrix
// ============================================================================

describe('VesselSelectionEngine calculateFeasibilityScore & generateComparisonMatrix', () => {
  const createAnalysis = (name: string, canProceed: boolean, risks: string[]): VesselAnalysisResult =>
    ({
      vessel_name: name,
      vessel_profile: mockVesselProfile(name, 500, 50),
      current_voyage_end_port: 'SGSIN',
      current_voyage_end_eta: new Date(),
      projected_rob_at_start: { VLSFO: 500, LSMGO: 50 },
      next_voyage_requirements: { VLSFO: 400, LSMGO: 40 },
      can_proceed_without_bunker: canProceed,
      bunker_plan: undefined,
      total_voyage_cost: 0,
      cost_breakdown: {} as any,
      feasibility_score: 0,
      risks,
    }) as VesselAnalysisResult;

  it('should calculate higher feasibility for vessel with sufficient ROB', () => {
    const withROB = createAnalysis('A', true, []);
    const withoutROB = createAnalysis('B', false, ['Requires bunkering']);

    const scoreWith = VesselSelectionEngine.calculateFeasibilityScore(withROB);
    const scoreWithout = VesselSelectionEngine.calculateFeasibilityScore(withoutROB);

    expect(scoreWith).toBeGreaterThan(scoreWithout);
  });

  it('should return feasibility score between 0 and 100', () => {
    const analysis = createAnalysis('X', true, []);
    const score = VesselSelectionEngine.calculateFeasibilityScore(analysis);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('should generate comparison matrix with expected keys', () => {
    const analyses = [
      createAnalysis('MV A', true, []),
      createAnalysis('MV B', false, ['Requires bunkering']),
    ];

    const matrix = VesselSelectionEngine.generateComparisonMatrix(analyses);

    expect(Object.keys(matrix)).toHaveLength(2);
    expect(matrix['MV A']).toBeDefined();
    expect(matrix['MV B']).toBeDefined();
    expect(matrix['MV A'].projected_rob_vlsfo).toBe(500);
    expect(matrix['MV A'].can_proceed_without_bunker).toBe(true);
    expect(matrix['MV B'].can_proceed_without_bunker).toBe(false);
  });
});

// ============================================================================
// VesselSelectionQueryParser
// ============================================================================

describe('VesselSelectionQueryParser', () => {
  // Suppress console.log during parser tests
  const originalLog = console.log;
  beforeEach(() => {
    console.log = jest.fn();
  });
  afterEach(() => {
    console.log = originalLog;
  });

  describe('extractVesselNames', () => {
    it('should extract comma-separated vessel names with MV prefix', () => {
      const result = VesselSelectionQueryParser.extractVesselNames(
        'Compare MV Pacific Star, MV Atlantic Trader'
      );
      expect(result).toContain('MV Pacific Star');
      expect(result).toContain('MV Atlantic Trader');
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('should extract "and" separated vessel names', () => {
      const result = VesselSelectionQueryParser.extractVesselNames(
        'Compare OCEAN PRIDE and ATLANTIC STAR for voyage'
      );
      expect(result).toContain('OCEAN PRIDE');
      expect(result).toContain('ATLANTIC STAR');
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('should extract from "between X and Y" pattern', () => {
      const result = VesselSelectionQueryParser.extractVesselNames(
        'Select vessel between TITAN and ATHENA'
      );
      expect(result).toContain('TITAN');
      expect(result).toContain('ATHENA');
    });

    it('should return empty array for empty query', () => {
      const result = VesselSelectionQueryParser.extractVesselNames('');
      expect(result).toEqual([]);
    });

    it('should return empty array for query with no vessel names', () => {
      const result = VesselSelectionQueryParser.extractVesselNames('What is the weather today?');
      expect(result).toEqual([]);
    });
  });

  describe('extractNextVoyageDetails', () => {
    it('should extract from "from X to Y" pattern', () => {
      const result = VesselSelectionQueryParser.extractNextVoyageDetails(
        'from Singapore to Rotterdam'
      );
      expect(result).not.toBeNull();
      expect(result?.origin).toBe('Singapore');
      expect(result?.destination).toBe('Rotterdam');
    });

    it('should extract from "X to Y" pattern', () => {
      const result = VesselSelectionQueryParser.extractNextVoyageDetails(
        'Singapore to Rotterdam'
      );
      expect(result).not.toBeNull();
      expect(result?.origin).toBe('Singapore');
      expect(result?.destination).toBe('Rotterdam');
    });

    it('should extract UN/LOCODE style ports', () => {
      const result = VesselSelectionQueryParser.extractNextVoyageDetails(
        'SGSIN to NLRTM'
      );
      expect(result).not.toBeNull();
      expect(result?.origin).toBe('SGSIN');
      expect(result?.destination).toBe('NLRTM');
    });

    it('should extract departure date', () => {
      const result = VesselSelectionQueryParser.extractNextVoyageDetails(
        'from Singapore to Rotterdam departing 2025-03-15'
      );
      expect(result?.departure_date).toBe('2025-03-15');
    });

    it('should extract speed', () => {
      const result = VesselSelectionQueryParser.extractNextVoyageDetails(
        'Singapore to Rotterdam at 14 knots'
      );
      expect(result?.speed).toBe(14);
    });

    it('should return null for empty query', () => {
      const result = VesselSelectionQueryParser.extractNextVoyageDetails('');
      expect(result).toBeNull();
    });
  });

  describe('isVesselSelectionQuery', () => {
    it('should return true for "compare vessels"', () => {
      expect(VesselSelectionQueryParser.isVesselSelectionQuery('Compare vessels for next voyage')).toBe(true);
    });

    it('should return true for "which vessel"', () => {
      expect(VesselSelectionQueryParser.isVesselSelectionQuery('Which vessel is best?')).toBe(true);
    });

    it('should return true for "best ship"', () => {
      expect(VesselSelectionQueryParser.isVesselSelectionQuery('Best ship for this route')).toBe(true);
    });

    it('should return true for "select vessel"', () => {
      expect(VesselSelectionQueryParser.isVesselSelectionQuery('Select vessel for voyage')).toBe(true);
    });

    it('should return false for non-vessel query', () => {
      expect(VesselSelectionQueryParser.isVesselSelectionQuery("What's the weather in Singapore?")).toBe(false);
    });

    it('should return false for empty query', () => {
      expect(VesselSelectionQueryParser.isVesselSelectionQuery('')).toBe(false);
    });
  });

  describe('parseVesselSelectionQuery', () => {
    it('should return full VesselSelectionInput for valid query', () => {
      const result = VesselSelectionQueryParser.parseVesselSelectionQuery(
        'Compare vessels between Pacific Star and Atlantic Trader from Singapore to Rotterdam'
      );
      expect(result).not.toBeNull();
      expect(result?.vessel_names).toBeDefined();
      expect(result?.vessel_names.length).toBeGreaterThanOrEqual(2);
      expect(result?.next_voyage).toBeDefined();
      expect(result?.next_voyage.origin).toBe('Singapore');
      expect(result?.next_voyage.destination).toBe('Rotterdam');
    });

    it('should return null for non-vessel-selection query', () => {
      const result = VesselSelectionQueryParser.parseVesselSelectionQuery(
        'What are the bunker prices at Singapore?'
      );
      expect(result).toBeNull();
    });

    it('should return null for vessel selection query with no vessel names', () => {
      const result = VesselSelectionQueryParser.parseVesselSelectionQuery(
        'Compare vessels for Singapore to Rotterdam'
      );
      expect(result).toBeNull();
    });

    it('should return null for empty query', () => {
      const result = VesselSelectionQueryParser.parseVesselSelectionQuery('');
      expect(result).toBeNull();
    });
  });
});
