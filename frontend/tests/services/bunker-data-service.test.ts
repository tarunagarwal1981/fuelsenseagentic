/**
 * Bunker Data Service tests.
 * - Mock API responses, correct return types, caching, error/fallback, timeout, concurrent requests.
 */

import axios from 'axios';
import { BunkerDataService, BunkerDataError } from '@/lib/services/bunker-data-service';
import type { BunkerPricing, PortCapabilities, VesselSpecs, ROBSnapshot, VesselStatus, PriceHistory } from '@/lib/types/bunker';
import { mockBunkerPricing, mockROBSnapshot, mockVesselSpecs } from '@/tests/mocks/bunker-mocks';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BunkerDataService', () => {
  let service: BunkerDataService;
  const baseURL = 'https://test-api.example.com';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BunkerDataService(baseURL);
  });

  describe('fetchBunkerPricing', () => {
    it('returns correct type (BunkerPricing[]) from array response', async () => {
      const data: BunkerPricing[] = [
        mockBunkerPricing({ port: 'SGSIN', pricePerMT: 520 }),
        mockBunkerPricing({ port: 'AEFJR', pricePerMT: 480 }),
      ];
      mockedAxios.get.mockResolvedValueOnce({ data, status: 200 });

      const result = await service.fetchBunkerPricing(['SGSIN', 'AEFJR']);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({ port: 'SGSIN', fuelType: 'VLSFO', pricePerMT: 520, currency: 'USD' });
      expect(result[1]).toMatchObject({ port: 'AEFJR', pricePerMT: 480 });
    });

    it('accepts wrapped response { data: BunkerPricing[] } and normalizes to BunkerPricing[]', async () => {
      const raw = [{ port: 'NLRTM', fuel_type: 'VLSFO', price_usd_per_mt: 550, date: '2025-01-15', currency: 'USD' }];
      mockedAxios.get.mockResolvedValueOnce({ data: { data: raw }, status: 200 });

      const result = await service.fetchBunkerPricing(['NLRTM']);

      expect(result.length).toBe(1);
      expect(result[0]).toMatchObject({ port: 'NLRTM', fuelType: 'VLSFO', pricePerMT: 550, currency: 'USD' });
      expect(result[0].lastUpdated).toBeDefined();
    });

    it('uses cache on second call (no second axios request)', async () => {
      const data: BunkerPricing[] = [mockBunkerPricing()];
      mockedAxios.get.mockResolvedValue({ data, status: 200 });

      await service.fetchBunkerPricing(['SGSIN']);
      const result2 = await service.fetchBunkerPricing(['SGSIN']);

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      expect(result2.length).toBe(1);
      expect(result2[0]).toMatchObject({ port: data[0].port, fuelType: data[0].fuelType, pricePerMT: data[0].pricePerMT });
    });

    it('throws BunkerDataError on API error', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.fetchBunkerPricing(['SGSIN'])).rejects.toThrow(BunkerDataError);
    });

    it('passes fuelTypes and dateRange in query when provided', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: [], status: 200 });

      await service.fetchBunkerPricing(
        ['SGSIN'],
        ['VLSFO', 'MGO'],
        { startDate: '2025-01-01', endDate: '2025-01-31' }
      );

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/bunker-pricing?'),
        expect.any(Object)
      );
      const url = mockedAxios.get.mock.calls[0][0];
      expect(url).toContain('fuelTypes=');
      expect(url).toContain('startDate=');
      expect(url).toContain('endDate=');
    });
  });

  describe('fetchPortCapabilities', () => {
    it('returns correct PortCapabilities type', async () => {
      const data: PortCapabilities = {
        portCode: 'SGSIN',
        availableFuelTypes: ['VLSFO', 'LSMGO', 'MGO'],
        maxSupplyRate: 200,
        berthAvailability: '24/7',
        ecaZone: false,
      };
      mockedAxios.get.mockResolvedValueOnce({ data, status: 200 });

      const result = await service.fetchPortCapabilities('SGSIN');

      expect(result).toEqual(data);
      expect(result.portCode).toBe('SGSIN');
      expect(result.availableFuelTypes).toContain('VLSFO');
    });

    it('caches and does not call API twice for same port', async () => {
      const data: PortCapabilities = { portCode: 'AEFJR', availableFuelTypes: ['VLSFO'], ecaZone: false };
      mockedAxios.get.mockResolvedValue({ data, status: 200 });

      await service.fetchPortCapabilities('AEFJR');
      await service.fetchPortCapabilities('AEFJR');

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it('throws BunkerDataError on error', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Timeout'));

      await expect(service.fetchPortCapabilities('NLRTM')).rejects.toThrow(BunkerDataError);
    });
  });

  describe('fetchVesselSpecs', () => {
    it('returns correct VesselSpecs type', async () => {
      const data: VesselSpecs = mockVesselSpecs({ vesselId: 'IMO9999999', tankCapacity: 3000 });
      mockedAxios.get.mockResolvedValueOnce({ data, status: 200 });

      const result = await service.fetchVesselSpecs('IMO9999999');

      expect(result.vesselId).toBe('IMO9999999');
      expect(result.tankCapacity).toBe(3000);
      expect(result.consumptionRate).toBeDefined();
    });

    it('throws BunkerDataError on error', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('404'));

      await expect(service.fetchVesselSpecs('IMO123')).rejects.toThrow(BunkerDataError);
    });
  });

  describe('fetchCurrentROB', () => {
    it('returns correct ROBSnapshot type', async () => {
      const data: ROBSnapshot = mockROBSnapshot({ vesselId: 'IMO888', totalROB: 1000 });
      mockedAxios.get.mockResolvedValueOnce({ data, status: 200 });

      const result = await service.fetchCurrentROB('IMO888');

      expect(result.vesselId).toBe('IMO888');
      expect(result.totalROB).toBe(1000);
      expect(result.timestamp).toBeDefined();
    });

    it('throws BunkerDataError on error', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Service unavailable'));

      await expect(service.fetchCurrentROB('IMO456')).rejects.toThrow(BunkerDataError);
    });
  });

  describe('fetchFleetStatus', () => {
    it('returns VesselStatus[] and accepts wrapped response', async () => {
      const list: VesselStatus[] = [
        { vesselId: 'IMO1', vesselName: 'V1', currentROB: 500 },
        { vesselId: 'IMO2', vesselName: 'V2', currentROB: 600 },
      ];
      mockedAxios.get.mockResolvedValueOnce({ data: { data: list }, status: 200 });

      const result = await service.fetchFleetStatus();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0].vesselId).toBe('IMO1');
    });

    it('throws BunkerDataError on error', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.fetchFleetStatus()).rejects.toThrow(BunkerDataError);
    });
  });

  describe('fetchHistoricalBunkerPrices', () => {
    it('returns PriceHistory[] with correct shape', async () => {
      const list: PriceHistory[] = [
        { date: '2025-01-01', price: 500, port: 'SGSIN', fuelType: 'VLSFO' },
        { date: '2025-01-02', price: 505, port: 'SGSIN', fuelType: 'VLSFO' },
      ];
      mockedAxios.get.mockResolvedValueOnce({ data: list, status: 200 });

      const result = await service.fetchHistoricalBunkerPrices('SGSIN', 'VLSFO', 7);

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('date');
      expect(result[0]).toHaveProperty('price');
      expect(result[0].port).toBe('SGSIN');
      expect(result[0].fuelType).toBe('VLSFO');
    });

    it('throws BunkerDataError on error', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Timeout'));

      await expect(service.fetchHistoricalBunkerPrices('AEFJR', 'MGO', 30)).rejects.toThrow(BunkerDataError);
    });
  });

  describe('error handling', () => {
    it('BunkerDataError has code and statusCode when axios provides them', () => {
      const err = new BunkerDataError('test', 'ERR_NETWORK', 500);
      expect(err.message).toBe('test');
      expect(err.code).toBe('ERR_NETWORK');
      expect(err.statusCode).toBe(500);
      expect(err.name).toBe('BunkerDataError');
    });
  });

  describe('timeout', () => {
    it('uses timeout in request config', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: [], status: 200 });

      await service.fetchBunkerPricing(['SGSIN']);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          timeout: 30000,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });
  });

  describe('concurrent requests', () => {
    it('handles concurrent fetchBunkerPricing for different params', async () => {
      mockedAxios.get
        .mockResolvedValueOnce({ data: [mockBunkerPricing({ port: 'SGSIN' })], status: 200 })
        .mockResolvedValueOnce({ data: [mockBunkerPricing({ port: 'AEFJR' })], status: 200 });

      const [r1, r2] = await Promise.all([
        service.fetchBunkerPricing(['SGSIN']),
        service.fetchBunkerPricing(['AEFJR']),
      ]);

      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      expect(r1[0].port).toBe('SGSIN');
      expect(r2[0].port).toBe('AEFJR');
    });
  });
});
