/**
 * Hull Performance Repository Unit Tests
 *
 * Tests for HullPerformanceRepository:
 * - getVesselPerformanceData: cache hit/miss, API fallback, date range
 * - getLatestPerformance: returns most recent record
 * - getVesselBaselineCurves: cache hit/miss, API fallback
 * - Error handling and structured response (no throw)
 */

import { HullPerformanceRepository } from '@/lib/repositories/hull-performance-repository';
import { HullPerformanceClient } from '@/lib/api-clients/hull-performance-client';
import { RedisCache } from '@/lib/repositories/cache-client';
import type { HullPerformanceRecord } from '@/lib/api-clients/hull-performance-client';
import {
  buildMockHullPerformanceResponse,
  buildMockBaselineCurves,
  generateTestCorrelationId,
} from '@/tests/utils/hull-performance-test-utils';

jest.mock('@/lib/monitoring/axiom-logger', () => ({
  logCustomEvent: jest.fn(),
  logError: jest.fn(),
}));

describe('HullPerformanceRepository', () => {
  let repo: HullPerformanceRepository;
  let mockClient: jest.Mocked<Pick<HullPerformanceClient, 'getHullPerformance' | 'getVesselPerformanceModel'>>;
  let mockRedis: jest.Mocked<Pick<RedisCache, 'get' | 'set'>>;

  let correlationId: string;

  beforeEach(() => {
    correlationId = generateTestCorrelationId();
    mockClient = {
      getHullPerformance: jest.fn(),
      getVesselPerformanceModel: jest.fn(),
    };
    mockRedis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
    };

    repo = new HullPerformanceRepository(correlationId, {
      client: mockClient as unknown as HullPerformanceClient,
      redis: mockRedis as unknown as RedisCache,
    });
    jest.clearAllMocks();
  });

  describe('getVesselPerformanceData', () => {
    it('returns cached data on cache hit', async () => {
      const cachedData = [buildMockHullPerformanceResponse({ id: 1, vessel_imo: 9123456 })];
      mockRedis.get.mockResolvedValue({
        data: cachedData,
        date_range: { start: '2024-10-01', end: '2025-01-15' },
      });

      const result = await repo.getVesselPerformanceData(
        { imo: '9123456' },
        { days: 90 }
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(cachedData);
      expect(result.metadata?.cache_hit).toBe(true);
      expect(result.metadata?.source).toBe('cache');
      expect(result.metadata?.total_records).toBe(1);
      expect(mockClient.getHullPerformance).not.toHaveBeenCalled();
    });

    it('calls API and caches on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);
      const apiData = [buildMockHullPerformanceResponse({ id: 2, vessel_imo: 9123456 })];
      mockClient.getHullPerformance.mockResolvedValue(apiData);

      const result = await repo.getVesselPerformanceData(
        { imo: '9123456' },
        { days: 30 }
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(apiData);
      expect(result.metadata?.cache_hit).toBe(false);
      expect(result.metadata?.source).toBe('api');
      expect(mockClient.getHullPerformance).toHaveBeenCalledWith(
        expect.objectContaining({
          vessel_imo: 9123456,
          start_date: expect.any(String),
          end_date: expect.any(String),
          limit: 5000,
        })
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('hull_perf:imo:9123456'),
        expect.objectContaining({ data: apiData }),
        expect.any(Number)
      );
    });

    it('uses vessel name when imo not provided', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockClient.getHullPerformance.mockResolvedValue([]);

      await repo.getVesselPerformanceData(
        { name: 'Pacific Star' },
        { days: 90 }
      );

      expect(mockClient.getHullPerformance).toHaveBeenCalledWith(
        expect.objectContaining({ vessel_name: 'PACIFIC STAR' })
      );
      // Repo does not cache when API returns empty, so redis.set is not called here
    });

    it('returns structured error on API failure without throwing', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockClient.getHullPerformance.mockRejectedValue(new Error('Network error'));

      const result = await repo.getVesselPerformanceData({ imo: '9123456' });

      expect(result.success).toBe(false);
      expect(result.data).toEqual([]);
      expect(result.error).toContain('Network error');
      expect(result.metadata?.cache_hit).toBe(false);
      expect(result.metadata?.total_records).toBe(0);
    });

    it('uses default 90 days when no date range provided', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockClient.getHullPerformance.mockResolvedValue([]);

      await repo.getVesselPerformanceData({ imo: '9123456' });

      const call = mockClient.getHullPerformance.mock.calls[0]?.[0];
      expect(call).toBeDefined();
      const start = new Date((call as { start_date: string }).start_date).getTime();
      const end = new Date((call as { end_date: string }).end_date).getTime();
      const days = (end - start) / (24 * 60 * 60 * 1000);
      expect(days).toBeGreaterThanOrEqual(89);
      expect(days).toBeLessThanOrEqual(91);
    });

    it('uses start_date and end_date when provided', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockClient.getHullPerformance.mockResolvedValue([]);

      await repo.getVesselPerformanceData(
        { imo: '9123456' },
        { startDate: '2025-01-01', endDate: '2025-01-31' }
      );

      expect(mockClient.getHullPerformance).toHaveBeenCalledWith(
        expect.objectContaining({
          start_date: '2025-01-01',
          end_date: '2025-01-31',
        })
      );
    });
  });

  describe('getLatestPerformance', () => {
    it('returns most recent record by report_date', async () => {
      const older = buildMockHullPerformanceResponse({ id: 1, report_date: '2025-01-01T00:00:00Z' });
      const newer = buildMockHullPerformanceResponse({ id: 2, report_date: '2025-01-15T00:00:00Z' });
      mockRedis.get.mockResolvedValue(null);
      mockClient.getHullPerformance.mockResolvedValue([older, newer]);

      const result = await repo.getLatestPerformance({ imo: '9123456' });

      expect(result).not.toBeNull();
      expect(result!.id).toBe(2);
      expect(result!.report_date).toBe('2025-01-15T00:00:00Z');
    });

    it('returns null when no data', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockClient.getHullPerformance.mockResolvedValue([]);

      const result = await repo.getLatestPerformance({ imo: '9123456' });

      expect(result).toBeNull();
    });

    it('returns null when getVesselPerformanceData fails', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockClient.getHullPerformance.mockRejectedValue(new Error('API error'));

      const result = await repo.getLatestPerformance({ imo: '9123456' });

      expect(result).toBeNull();
    });
  });

  describe('getVesselBaselineCurves', () => {
    it('returns cached baseline on cache hit', async () => {
      const allCurves = buildMockBaselineCurves(9123456);
      const cached = allCurves.filter((c) => c.load_type === 'Laden').slice(0, 1);
      mockRedis.get.mockResolvedValue(cached);

      const result = await repo.getVesselBaselineCurves(9123456, 'Laden');

      expect(result).toEqual(cached);
      expect(mockClient.getVesselPerformanceModel).not.toHaveBeenCalled();
    });

    it('calls API and caches on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);
      const apiData = buildMockBaselineCurves(9123456).filter((c) => c.load_type === 'Laden');
      mockClient.getVesselPerformanceModel.mockResolvedValue(apiData);

      const result = await repo.getVesselBaselineCurves(9123456, 'Laden');

      expect(result).toEqual(apiData);
      expect(mockClient.getVesselPerformanceModel).toHaveBeenCalledWith({
        vessel_imo: 9123456,
        load_type: 'Laden',
      });
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('hull_baseline:9123456'),
        apiData,
        expect.any(Number)
      );
    });

    it('returns empty array on API failure without throwing', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockClient.getVesselPerformanceModel.mockRejectedValue(new Error('Timeout'));

      const result = await repo.getVesselBaselineCurves(9123456);

      expect(result).toEqual([]);
    });
  });
});
