/**
 * Fetch Hull Performance Tool Unit Tests
 *
 * Tests for fetch-hull-performance tool:
 * - Input validation (Zod schema: vessel_identifier required, time_period optional)
 * - Tool execution: success and failure paths
 * - Error handling and logging
 */

import {
  executeFetchHullPerformanceTool,
  fetchHullPerformanceInputSchema,
  type FetchHullPerformanceInput,
} from '@/lib/tools/hull-performance/fetch-hull-performance';
import {
  buildMockHullPerformanceResponse,
  generateTestCorrelationId,
} from '@/tests/utils/hull-performance-test-utils';

const mockGetHullPerformance = jest.fn();
const mockGetVesselPerformanceModel = jest.fn();
const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@/lib/api-clients/hull-performance-client', () => ({
  HullPerformanceClient: jest.fn().mockImplementation(() => ({
    getHullPerformance: mockGetHullPerformance,
    getVesselPerformanceModel: mockGetVesselPerformanceModel,
  })),
}));

jest.mock('@/lib/repositories/service-container', () => ({
  ServiceContainer: {
    getInstance: jest.fn(() => ({
      getCache: () => mockRedis,
    })),
  },
}));

jest.mock('@/lib/monitoring/axiom-logger', () => ({
  logCustomEvent: jest.fn(),
  logError: jest.fn(),
}));

describe('fetch-hull-performance tool', () => {
  let correlationId: string;

  beforeEach(() => {
    correlationId = generateTestCorrelationId();
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue(undefined);
    mockGetVesselPerformanceModel.mockResolvedValue([]);
    process.env.HULL_PERFORMANCE_SOURCE = 'api'; // use mocked API client in tests
  });

  describe('input validation (fetchHullPerformanceInputSchema)', () => {
    it('accepts valid input with imo', () => {
      const input = { vessel_identifier: { imo: '9123456' } };
      expect(() => fetchHullPerformanceInputSchema.parse(input)).not.toThrow();
      expect(fetchHullPerformanceInputSchema.parse(input).vessel_identifier.imo).toBe('9123456');
    });

    it('accepts valid input with vessel name', () => {
      const input = { vessel_identifier: { name: 'Pacific Star' } };
      expect(() => fetchHullPerformanceInputSchema.parse(input)).not.toThrow();
    });

    it('accepts time_period with days', () => {
      const input = {
        vessel_identifier: { imo: '9123456' },
        time_period: { days: 30 },
      };
      const parsed = fetchHullPerformanceInputSchema.parse(input);
      expect(parsed.time_period?.days).toBe(30);
    });

    it('rejects when both imo and name are missing', () => {
      const input = { vessel_identifier: {} };
      expect(() => fetchHullPerformanceInputSchema.parse(input)).toThrow();
    });

    it('rejects when vessel_identifier is missing', () => {
      expect(() => fetchHullPerformanceInputSchema.parse({})).toThrow();
    });
  });

  describe('executeFetchHullPerformanceTool', () => {
    it('returns success with data when service returns analysis', async () => {
      mockGetHullPerformance.mockResolvedValue([buildMockHullPerformanceResponse({ vessel_imo: 9123456, vessel_name: 'MV Test' })]);

      const result = await executeFetchHullPerformanceTool(
        {
          vessel_identifier: { imo: '9123456' },
          time_period: { days: 90 },
        },
        { correlationId }
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.vessel.imo).toBe('9123456');
      expect(result.data!.hull_condition).toBeDefined();
      expect(result.data!.latest_metrics).toBeDefined();
      expect(result.data!.trend_data).toBeDefined();
    });

    it('returns success: false when no data available', async () => {
      mockGetHullPerformance.mockResolvedValue([]);

      const result = await executeFetchHullPerformanceTool(
        { vessel_identifier: { imo: '9123456' } },
        { correlationId }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No hull performance data');
      expect(result.data).toBeUndefined();
    });

    it('returns validation error for invalid input', async () => {
      const result = await executeFetchHullPerformanceTool(
        { vessel_identifier: {} } as FetchHullPerformanceInput,
        { correlationId }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.message).toContain('IMO or vessel name');
    });

    it('uses default correlationId when context missing', async () => {
      mockGetHullPerformance.mockResolvedValue([buildMockHullPerformanceResponse({ vessel_imo: 9123456 })]);

      await executeFetchHullPerformanceTool(
        { vessel_identifier: { imo: '9123456' } },
        undefined
      );

      const { logCustomEvent } = await import('@/lib/monitoring/axiom-logger');
      expect(logCustomEvent).toHaveBeenCalledWith(
        expect.any(String),
        'unknown',
        expect.any(Object),
        expect.any(String)
      );
    });

    it('calls API with vessel name when name provided', async () => {
      mockGetHullPerformance.mockResolvedValue([buildMockHullPerformanceResponse({ vessel_name: 'Pacific Star' })]);

      const result = await executeFetchHullPerformanceTool(
        { vessel_identifier: { name: 'Pacific Star' } },
        { correlationId }
      );

      expect(result.success).toBe(true);
      expect(mockGetHullPerformance).toHaveBeenCalledWith(
        expect.objectContaining({
          vessel_name: 'Pacific Star',
        })
      );
    });
  });
});
