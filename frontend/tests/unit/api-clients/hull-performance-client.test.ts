/**
 * Hull Performance API Client Unit Tests
 *
 * Tests for HullPerformanceClient:
 * - getHullPerformance (params, response shapes, error handling)
 * - getVesselPerformanceModel (params, response shapes, error handling)
 * - Axiom error logging with correlation ID
 */

import { HullPerformanceClient } from '@/lib/api-clients/hull-performance-client';
import { buildMockHullPerformanceResponse } from '@/tests/utils/hull-performance-test-utils';

jest.mock('@/lib/monitoring/axiom-logger', () => ({
  logError: jest.fn(),
}));

const originalFetch = globalThis.fetch;

describe('HullPerformanceClient', () => {
  let client: HullPerformanceClient;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.fn();
    (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch;
    client = new HullPerformanceClient('test-correlation-id');
  });

  afterAll(() => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  });

  describe('constructor', () => {
    it('uses HULL_PERFORMANCE_API_URL when set', () => {
      const url = 'https://hull-api.example.com';
      const prev = process.env.HULL_PERFORMANCE_API_URL;
      process.env.HULL_PERFORMANCE_API_URL = url;
      const c = new HullPerformanceClient();
      expect((c as unknown as { baseURL: string }).baseURL).toBe(url);
      process.env.HULL_PERFORMANCE_API_URL = prev;
    });

    it('strips trailing slash from baseURL', () => {
      const prev = process.env.HULL_PERFORMANCE_API_URL;
      process.env.HULL_PERFORMANCE_API_URL = 'https://api.example.com/';
      const c = new HullPerformanceClient();
      expect((c as unknown as { baseURL: string }).baseURL).toBe('https://api.example.com');
      process.env.HULL_PERFORMANCE_API_URL = prev;
    });
  });

  describe('getHullPerformance', () => {
    it('returns mapped records when API returns array', async () => {
      const raw = [
        buildMockHullPerformanceResponse({
          id: 1,
          vessel_imo: 9123456,
          vessel_name: 'MV Test',
          report_date: '2025-01-15T00:00:00Z',
          utc_date_time: '2025-01-15T12:00:00Z',
          hull_roughness_power_loss: 5.2,
          hull_roughness_speed_loss: 2.1,
          hull_excess_fuel_oil: 4.0,
          hull_excess_fuel_oil_mtd: 12.5,
          speed: 14,
          consumption: 28,
          predicted_consumption: 26,
          loading_condition: 'Laden',
        }),
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(raw),
      });

      const result = await client.getHullPerformance();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/hull-performance'),
        expect.any(Object)
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 1,
        vessel_imo: 9123456,
        vessel_name: 'MV Test',
        report_date: '2025-01-15T00:00:00Z',
        hull_roughness_power_loss: 5.2,
        loading_condition: 'Laden',
        speed: 14,
      });
    });

    it('builds query params when provided', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });

      await client.getHullPerformance({
        vessel_imo: 9123456,
        vessel_name: 'Pacific',
        start_date: '2025-01-01',
        end_date: '2025-01-31',
        limit: 10,
        offset: 0,
      });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('vessel_imo=9123456');
      expect(url).toContain('vessel_name=Pacific');
      expect(url).toContain('start_date=2025-01-01');
      expect(url).toContain('end_date=2025-01-31');
      expect(url).toContain('limit=10');
      expect(url).toContain('offset=0');
    });

    it('accepts response with { data: array }', async () => {
      const raw = [buildMockHullPerformanceResponse({ id: 2, vessel_imo: 9876543, vessel_name: 'Other' })];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: raw }),
      });

      const result = await client.getHullPerformance();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(2);
      expect(result[0].vessel_imo).toBe(9876543);
    });

    it('throws and logs when API returns non-OK', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ message: 'Server error' }),
      });

      const { logError } = await import('@/lib/monitoring/axiom-logger');

      await expect(client.getHullPerformance()).rejects.toThrow(/Hull Performance API/);
      expect(logError).toHaveBeenCalledWith(
        'test-correlation-id',
        expect.any(Error),
        expect.objectContaining({ method: 'getHullPerformance' })
      );
    });
  });

  describe('getVesselPerformanceModel', () => {
    it('returns mapped records for vessel_imo and optional load_type', async () => {
      const raw = [
        {
          id: 1,
          vessel_imo: 9123456,
          speed_kts: 14,
          me_consumption_: 28,
          me_power_kw: 5000,
          beaufort_scale: 3,
          displacement: 50000,
          load_type: 'Laden',
          deadweight: 55000,
          sfoc: 165,
          me_rpm: 85,
          sea_trial_rpm: 90,
        },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(raw),
      });

      const result = await client.getVesselPerformanceModel({ vessel_imo: 9123456, load_type: 'Laden' });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('/vessel-performance-model-table');
      expect(url).toContain('vessel_imo=9123456');
      expect(url).toContain('load_type=Laden');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 1,
        vessel_imo: 9123456,
        speed_kts: 14,
        me_consumption_: 28,
        me_power_kw: 5000,
        load_type: 'Laden',
      });
    });

    it('calls without load_type when not provided', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });
      await client.getVesselPerformanceModel({ vessel_imo: 9123456 });
      const url = mockFetch.mock.calls[0][0];
      expect(url).not.toContain('load_type=');
    });

    it('throws and logs when API returns non-OK', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({}),
      });

      const { logError } = await import('@/lib/monitoring/axiom-logger');

      await expect(
        client.getVesselPerformanceModel({ vessel_imo: 9999999 })
      ).rejects.toThrow(/Hull Performance API/);
      expect(logError).toHaveBeenCalledWith(
        'test-correlation-id',
        expect.any(Error),
        expect.objectContaining({ method: 'getVesselPerformanceModel' })
      );
    });
  });
});
