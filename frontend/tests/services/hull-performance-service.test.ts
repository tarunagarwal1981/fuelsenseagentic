/**
 * Hull Performance Service Unit Tests
 *
 * Tests for HullPerformanceService:
 * - analyzeVesselPerformance: full analysis shape, null on no data
 * - Hull condition determination (GOOD / AVERAGE / POOR from excess power %)
 * - Trend data transformation, latest metrics, component breakdown
 * - Baseline curves when includeBaseline is true
 */

import { HullPerformanceService } from '@/lib/services/hull-performance-service';
import { HullPerformanceRepository } from '@/lib/repositories/hull-performance-repository';
import {
  buildMockHullPerformanceResponse,
  buildMockBaselineCurves,
  generateTestCorrelationId,
} from '@/tests/utils/hull-performance-test-utils';

jest.mock('@/lib/monitoring/axiom-logger', () => ({
  logCustomEvent: jest.fn(),
  logError: jest.fn(),
}));

describe('HullPerformanceService', () => {
  let service: HullPerformanceService;
  let mockRepo: jest.Mocked<Pick<HullPerformanceRepository, 'getVesselPerformanceData' | 'getVesselBaselineCurves'>>;

  let correlationId: string;

  beforeEach(() => {
    correlationId = generateTestCorrelationId();
    mockRepo = {
      getVesselPerformanceData: jest.fn(),
      getVesselBaselineCurves: jest.fn(),
    };
    service = new HullPerformanceService(correlationId, mockRepo as unknown as HullPerformanceRepository);
    jest.clearAllMocks();
  });

  describe('analyzeVesselPerformance', () => {
    it('returns null when repository returns success: false', async () => {
      mockRepo.getVesselPerformanceData.mockResolvedValue({
        success: false,
        data: [],
        metadata: {
          total_records: 0,
          date_range: { start: '2025-01-01', end: '2025-01-15' },
          cache_hit: false,
          source: 'api',
        },
        error: 'API error',
      });

      const result = await service.analyzeVesselPerformance({ imo: '9123456' });

      expect(result).toBeNull();
    });

    it('returns null when no records', async () => {
      mockRepo.getVesselPerformanceData.mockResolvedValue({
        success: true,
        data: [],
        metadata: {
          total_records: 0,
          date_range: { start: '2025-01-01', end: '2025-01-15' },
          cache_hit: false,
          source: 'api',
        },
      });

      const result = await service.analyzeVesselPerformance({ imo: '9123456' });

      expect(result).toBeNull();
    });

    it('returns analysis with GOOD condition when excess power <= 15%', async () => {
      const record = buildMockHullPerformanceResponse({ vessel_imo: 9123456, hull_roughness_power_loss: 10 });
      mockRepo.getVesselPerformanceData.mockResolvedValue({
        success: true,
        data: [record],
        metadata: {
          total_records: 1,
          date_range: { start: '2025-01-01', end: '2025-01-15' },
          cache_hit: false,
          source: 'api',
        },
      });

      const result = await service.analyzeVesselPerformance({ imo: '9123456' });

      expect(result).not.toBeNull();
      expect(result!.hull_condition).toBe('GOOD');
      expect(result!.condition_indicator).toBe('🟢');
      expect(result!.condition_message).toContain('good condition');
    });

    it('returns analysis with AVERAGE condition when excess power 15–25%', async () => {
      const record = buildMockHullPerformanceResponse({ vessel_imo: 9123456, hull_roughness_power_loss: 20 });
      mockRepo.getVesselPerformanceData.mockResolvedValue({
        success: true,
        data: [record],
        metadata: {
          total_records: 1,
          date_range: { start: '2025-01-01', end: '2025-01-15' },
          cache_hit: false,
          source: 'api',
        },
      });

      const result = await service.analyzeVesselPerformance({ imo: '9123456' });

      expect(result).not.toBeNull();
      expect(result!.hull_condition).toBe('AVERAGE');
      expect(result!.condition_indicator).toBe('🟡');
      expect(result!.condition_message).toContain('fouling');
    });

    it('returns analysis with POOR condition when excess power >= 25%', async () => {
      const record = buildMockHullPerformanceResponse({ vessel_imo: 9123456, hull_roughness_power_loss: 30 });
      mockRepo.getVesselPerformanceData.mockResolvedValue({
        success: true,
        data: [record],
        metadata: {
          total_records: 1,
          date_range: { start: '2025-01-01', end: '2025-01-15' },
          cache_hit: false,
          source: 'api',
        },
      });

      const result = await service.analyzeVesselPerformance({ imo: '9123456' });

      expect(result).not.toBeNull();
      expect(result!.hull_condition).toBe('POOR');
      expect(result!.condition_indicator).toBe('🔴');
      expect(result!.condition_message).toContain('cleaning');
    });

    it('transforms trend data with date ascending and correct field mapping', async () => {
      const r1 = buildMockHullPerformanceResponse({ id: 1, vessel_imo: 9123456, report_date: '2025-01-10T00:00:00Z', hull_roughness_power_loss: 8 });
      const r2 = buildMockHullPerformanceResponse({ id: 2, vessel_imo: 9123456, report_date: '2025-01-15T00:00:00Z', hull_roughness_power_loss: 10 });
      mockRepo.getVesselPerformanceData.mockResolvedValue({
        success: true,
        data: [r2, r1],
        metadata: {
          total_records: 2,
          date_range: { start: '2025-01-01', end: '2025-01-15' },
          cache_hit: false,
          source: 'api',
        },
      });

      const result = await service.analyzeVesselPerformance({ imo: '9123456' });

      expect(result!.trend_data).toHaveLength(2);
      expect(result!.trend_data![0].date).toBe('2025-01-10');
      expect(result!.trend_data![1].date).toBe('2025-01-15');
      expect(result!.trend_data![0].excess_power_pct).toBe(8);
      expect(result!.trend_data![0].consumption).toBe(r1.consumption);
      expect(result!.trend_data![0].predicted_consumption).toBe(r1.predicted_consumption);
      expect(result!.trend_data![0].speed).toBe(r1.speed);
    });

    it('uses last 6 months from last report date for chart when no user period specified', async () => {
      const base = new Date('2025-06-15T00:00:00Z');
      const records: ReturnType<typeof buildMockHullPerformanceResponse>[] = [];
      for (let i = 0; i < 8; i++) {
        const d = new Date(base);
        d.setMonth(d.getMonth() - i);
        records.push(
          buildMockHullPerformanceResponse({
            id: i + 1,
            vessel_imo: 9123456,
            report_date: d.toISOString().slice(0, 10) + 'T00:00:00Z',
            hull_roughness_power_loss: 10 + i,
          })
        );
      }
      mockRepo.getVesselPerformanceData.mockResolvedValue({
        success: true,
        data: records,
        metadata: {
          total_records: records.length,
          date_range: { start: '2024-10-15', end: '2025-06-15' },
          cache_hit: false,
          source: 'api',
        },
      });

      const result = await service.analyzeVesselPerformance({ imo: '9123456' });

      expect(result).not.toBeNull();
      expect(result!.trend_data!.length).toBeLessThanOrEqual(7);
      const startDate = result!.analysis_period.start_date;
      const endDate = result!.analysis_period.end_date;
      const start = new Date(startDate);
      const end = new Date(endDate);
      const monthsSpan = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      expect(monthsSpan).toBeLessThanOrEqual(6);
    });

    it('sets latest_metrics from most recent record', async () => {
      const record = buildMockHullPerformanceResponse({
        vessel_imo: 9123456,
        report_date: '2025-01-15T00:00:00Z',
        utc_date_time: '2025-01-15T00:00:00Z',
        hull_roughness_power_loss: 12,
        hull_roughness_speed_loss: 2.5,
        hull_excess_fuel_oil: 6,
        hull_excess_fuel_oil_mtd: 2,
        consumption: 30,
        predicted_consumption: 28,
        speed: 13.5,
      });
      mockRepo.getVesselPerformanceData.mockResolvedValue({
        success: true,
        data: [record],
        metadata: {
          total_records: 1,
          date_range: { start: '2025-01-01', end: '2025-01-15' },
          cache_hit: false,
          source: 'api',
        },
      });

      const result = await service.analyzeVesselPerformance({ imo: '9123456' });

      expect(result!.latest_metrics.report_date).toBe('2025-01-15T00:00:00Z');
      expect(result!.latest_metrics.excess_power_pct).toBe(12);
      expect(result!.latest_metrics.speed_loss_pct).toBe(2.5);
      expect(result!.latest_metrics.excess_fuel_consumption_pct).toBe(6);
      expect(result!.latest_metrics.excess_fuel_consumption_mtd).toBe(2);
      expect(result!.latest_metrics.actual_consumption).toBe(30);
      expect(result!.latest_metrics.predicted_consumption).toBe(28);
      expect(result!.latest_metrics.actual_speed).toBe(13.5);
    });

    it('sets component_breakdown and cii_impact from latest record', async () => {
      const record = buildMockHullPerformanceResponse({
        vessel_imo: 9123456,
        hull_roughness_power_loss: 10,
        engine_power_loss: 1,
        propeller_fouling_power_loss: 0.5,
        hull_cii_impact: 0.5,
        engine_cii_impact: 0.1,
        propeller_cii_impact: 0.1,
      });
      mockRepo.getVesselPerformanceData.mockResolvedValue({
        success: true,
        data: [record],
        metadata: {
          total_records: 1,
          date_range: { start: '2025-01-01', end: '2025-01-15' },
          cache_hit: false,
          source: 'api',
        },
      });

      const result = await service.analyzeVesselPerformance({ imo: '9123456' });

      expect(result!.component_breakdown.hull_power_loss).toBe(10);
      expect(result!.component_breakdown.engine_power_loss).toBe(1);
      expect(result!.component_breakdown.propeller_power_loss).toBe(0.5);
      expect(result!.cii_impact.hull_impact).toBe(0.5);
      expect(result!.cii_impact.engine_impact).toBe(0.1);
      expect(result!.cii_impact.propeller_impact).toBe(0.1);
      expect(result!.cii_impact.total_impact).toBe(0.7);
    });

    it('includes baseline_curves when includeBaseline is true and IMO is valid', async () => {
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const reportDateStr = fiveDaysAgo.toISOString().slice(0, 10) + 'T00:00:00Z';
      const record = buildMockHullPerformanceResponse({
        vessel_imo: 9123456,
        report_date: reportDateStr,
      });
      const allCurves = buildMockBaselineCurves(9123456).map((c) =>
        c.load_type === 'Laden' ? { ...c, load_type: 'Design' as const } : c
      );
      mockRepo.getVesselPerformanceData.mockResolvedValue({
        success: true,
        data: [record],
        metadata: {
          total_records: 1,
          date_range: { start: '2025-01-01', end: '2025-01-15' },
          cache_hit: false,
          source: 'api',
        },
      });
      mockRepo.getVesselBaselineCurves.mockResolvedValueOnce(allCurves);

      const result = await service.analyzeVesselPerformance(
        { imo: '9123456' },
        { days: 90, includeBaseline: true }
      );

      expect(result!.baseline_curves).toBeDefined();
      expect(result!.baseline_curves!.laden.length).toBeGreaterThan(0);
      expect(result!.baseline_curves!.laden[0]).toMatchObject({ speed: expect.any(Number), consumption: expect.any(Number), power: expect.any(Number) });
      expect(result!.baseline_curves!.ballast.length).toBeGreaterThan(0);
      expect(result!.baseline_curves!.ballast[0]).toMatchObject({ speed: expect.any(Number), consumption: expect.any(Number), power: expect.any(Number) });
      expect(mockRepo.getVesselBaselineCurves).toHaveBeenCalledWith(9123456);
    });

    it('sets analysis_period and metadata from repository response', async () => {
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const reportDateStr = fiveDaysAgo.toISOString().slice(0, 10) + 'T00:00:00Z';
      const record = buildMockHullPerformanceResponse({
        vessel_imo: 9123456,
        report_date: reportDateStr,
      });
      mockRepo.getVesselPerformanceData.mockResolvedValue({
        success: true,
        data: [record],
        metadata: {
          total_records: 1,
          date_range: { start: '2025-01-01', end: '2025-01-15' },
          cache_hit: true,
          source: 'cache',
        },
      });

      const result = await service.analyzeVesselPerformance({ imo: '9123456' }, { days: 14 });

      expect(result!.analysis_period.total_records).toBe(1);
      expect(result!.analysis_period.start_date).toBe(fiveDaysAgo.toISOString().slice(0, 10));
      expect(result!.analysis_period.end_date).toBe(fiveDaysAgo.toISOString().slice(0, 10));
      expect(result!.metadata.cache_hit).toBe(true);
      expect(result!.metadata.data_source).toBe('cache');
    });
  });
});
