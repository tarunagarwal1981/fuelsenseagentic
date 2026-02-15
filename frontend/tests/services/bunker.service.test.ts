/**
 * Bunker Service Unit Tests
 * 
 * Tests for BunkerService covering:
 * - findBunkerPorts filtering and sorting
 * - Deviation calculation accuracy
 * - analyzeBunkerOptions cost ranking
 * - Error handling
 */

import { BunkerService } from '@/lib/services/bunker.service';
import { PortRepository } from '@/lib/repositories/port-repository';
import { PriceRepository } from '@/lib/repositories/price-repository';
import { RouteService } from '@/lib/services/route.service';
import { RedisCache } from '@/lib/repositories/cache-client';
import type { RouteData, BunkerPort, BunkerOption } from '@/lib/services/types';
import { Port } from '@/lib/repositories/types';

// Mock dependencies
jest.mock('@/lib/repositories/port-repository');
jest.mock('@/lib/repositories/price-repository');
jest.mock('@/lib/services/route.service');
jest.mock('@/lib/repositories/cache-client');

describe('BunkerService', () => {
  let bunkerService: BunkerService;
  let mockPortRepo: jest.Mocked<PortRepository>;
  let mockPriceRepo: jest.Mocked<PriceRepository>;
  let mockRouteService: jest.Mocked<RouteService>;
  let mockCache: jest.Mocked<RedisCache>;

  const mockPort1: Port = {
    id: 'SGSIN',
    code: 'SGSIN',
    name: 'Singapore',
    country: 'SG',
    coordinates: [1.2897, 103.8501],
    bunkerCapable: true,
    fuelsAvailable: ['VLSFO', 'MGO'],
    timezone: 'Asia/Singapore',
  };

  const mockPort2: Port = {
    id: 'HKHKG',
    code: 'HKHKG',
    name: 'Hong Kong',
    country: 'HK',
    coordinates: [22.3193, 114.1694],
    bunkerCapable: true,
    fuelsAvailable: ['VLSFO', 'MGO'],
    timezone: 'Asia/Hong_Kong',
  };

  const mockRoute: RouteData = {
    origin: {
      port_code: 'SGSIN',
      name: 'Singapore',
      country: 'SG',
      coordinates: { lat: 1.2897, lon: 103.8501 },
      fuel_capabilities: ['VLSFO'],
    },
    destination: {
      port_code: 'NLRTM',
      name: 'Rotterdam',
      country: 'NL',
      coordinates: { lat: 51.9225, lon: 4.4792 },
      fuel_capabilities: ['VLSFO'],
    },
    waypoints: [
      {
        coordinates: [1.2897, 103.8501],
        distanceFromPreviousNm: 0,
        distanceFromStartNm: 0,
        inECA: false,
      },
      {
        coordinates: [10.0, 110.0],
        distanceFromPreviousNm: 500,
        distanceFromStartNm: 500,
        inECA: false,
      },
      {
        coordinates: [51.9225, 4.4792],
        distanceFromPreviousNm: 8000,
        distanceFromStartNm: 8500,
        inECA: false,
      },
    ],
    totalDistanceNm: 8500,
    timeline: [],
    ecaSegments: [],
    estimatedHours: 607,
    routeType: 'direct route',
  };

  beforeEach(() => {
    // Create mocks
    mockPortRepo = {
      findBunkerPorts: jest.fn(),
    } as any;

    mockPriceRepo = {
      getLatestPrices: jest.fn(),
    } as any;

    mockRouteService = {} as any;

    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
    } as any;

    bunkerService = new BunkerService(
      mockPortRepo,
      mockPriceRepo,
      mockRouteService,
      mockCache
    );

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('findBunkerPorts', () => {
    it('should return ports within deviation limit', async () => {
      mockPortRepo.findBunkerPorts.mockResolvedValue([mockPort1, mockPort2]);

      const result = await bunkerService.findBunkerPorts({
        route: mockRoute,
        maxDeviation: 200,
        fuelTypes: ['VLSFO'],
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result.every((p: BunkerPort) => p.deviation <= 200)).toBe(true);
    });

    it('should filter by fuel availability', async () => {
      const portWithoutFuel: Port = {
        ...mockPort1,
        code: 'NONBUNKER',
        fuelsAvailable: [],
      };

      mockPortRepo.findBunkerPorts.mockResolvedValue([
        mockPort1,
        portWithoutFuel,
      ]);

      const result = await bunkerService.findBunkerPorts({
        route: mockRoute,
        maxDeviation: 200,
        fuelTypes: ['VLSFO'],
      });

      expect(result.every((p: BunkerPort) => p.fuelsAvailable.includes('VLSFO'))).toBe(true);
    });

    it('should sort by deviation (closest first)', async () => {
      mockPortRepo.findBunkerPorts.mockResolvedValue([mockPort1, mockPort2]);

      const result = await bunkerService.findBunkerPorts({
        route: mockRoute,
        maxDeviation: 200,
        fuelTypes: ['VLSFO'],
      });

      if (result.length > 1) {
        for (let i = 1; i < result.length; i++) {
          expect(result[i].deviation).toBeGreaterThanOrEqual(
            result[i - 1].deviation
          );
        }
      }
    });

    it('should return empty array when no ports match criteria', async () => {
      mockPortRepo.findBunkerPorts.mockResolvedValue([]);

      const result = await bunkerService.findBunkerPorts({
        route: mockRoute,
        maxDeviation: 50,
        fuelTypes: ['VLSFO'],
      });

      expect(result).toEqual([]);
    });
  });

  describe('analyzeBunkerOptions', () => {
    const mockBunkerPorts: BunkerPort[] = [
      {
        ...mockPort1,
        deviation: 50,
      },
      {
        ...mockPort2,
        deviation: 100,
      },
    ];

    it('should rank options by total cost', async () => {
      mockPriceRepo.getLatestPrices
        .mockResolvedValueOnce({ VLSFO: 650 }) // Singapore - cheaper
        .mockResolvedValueOnce({ VLSFO: 700 }); // Hong Kong - more expensive

      const result = await bunkerService.analyzeBunkerOptions({
        ports: mockBunkerPorts,
        requiredFuel: 1000,
        currentROB: 500,
        fuelType: 'VLSFO',
      });

      expect(result.options.length).toBe(2);
      expect(result.options[0].totalCost).toBeLessThanOrEqual(
        result.options[1].totalCost
      );
    });

    it('should calculate deviation cost correctly', async () => {
      mockPriceRepo.getLatestPrices.mockResolvedValue({ VLSFO: 650 });

      const result = await bunkerService.analyzeBunkerOptions({
        ports: [
          {
            ...mockPort1,
            deviation: 10, // Small deviation
          },
          {
            ...mockPort2,
            deviation: 100, // Large deviation
          },
        ],
        requiredFuel: 1000,
        currentROB: 500,
        fuelType: 'VLSFO',
      });

      // Port with smaller deviation should have lower total cost
      expect(result.options[0].deviationCost).toBeLessThan(
        result.options[1].deviationCost
      );
    });

    it('should skip ports without price data', async () => {
      mockPriceRepo.getLatestPrices
        .mockResolvedValueOnce({ VLSFO: 650 })
        .mockResolvedValueOnce({}); // No price for second port

      const result = await bunkerService.analyzeBunkerOptions({
        ports: mockBunkerPorts,
        requiredFuel: 1000,
        currentROB: 500,
        fuelType: 'VLSFO',
      });

      expect(result.options.length).toBe(1);
    });

    it('should calculate savings correctly', async () => {
      mockPriceRepo.getLatestPrices
        .mockResolvedValueOnce({ VLSFO: 650 })
        .mockResolvedValueOnce({ VLSFO: 700 });

      const result = await bunkerService.analyzeBunkerOptions({
        ports: mockBunkerPorts,
        requiredFuel: 1000,
        currentROB: 500,
        fuelType: 'VLSFO',
      });

      if (result.options.length > 1) {
        expect(result.savings).toBeGreaterThan(0);
        expect(result.savings).toBe(
          result.options[1].totalCost - result.options[0].totalCost
        );
      }
    });

    it('should return null recommended when no options', async () => {
      mockPriceRepo.getLatestPrices.mockResolvedValue({});

      const result = await bunkerService.analyzeBunkerOptions({
        ports: mockBunkerPorts,
        requiredFuel: 1000,
        currentROB: 500,
        fuelType: 'VLSFO',
      });

      expect(result.recommended).toBeNull();
      expect(result.options.length).toBe(0);
    });
  });

  describe('deviation calculation', () => {
    it('should calculate deviation to route segments', () => {
      const port: Port = {
        ...mockPort1,
        coordinates: [5.0, 105.0], // Near the route
      };

      const deviation = bunkerService['calculateDeviation'](port, mockRoute);

      expect(deviation).toBeGreaterThanOrEqual(0);
      expect(typeof deviation).toBe('number');
    });

    it('should handle ports very close to waypoints', () => {
      const port: Port = {
        ...mockPort1,
        coordinates: [1.29, 103.85], // Very close to origin waypoint
      };

      const deviation = bunkerService['calculateDeviation'](port, mockRoute);

      expect(deviation).toBeLessThan(10); // Should be very small
    });
  });

  describe('deviation cost calculation', () => {
    it('should calculate deviation cost based on distance', () => {
      const cost1 = bunkerService['calculateDeviationCost'](10, 1000);
      const cost2 = bunkerService['calculateDeviationCost'](20, 1000);

      expect(cost2).toBeGreaterThan(cost1);
    });

    it('should account for round trip deviation', () => {
      const cost = bunkerService['calculateDeviationCost'](10, 1000);

      // Round trip = 20nm, fuel = 10 MT, price = 650
      // Expected: 10 * 650 = 6500
      expect(cost).toBeCloseTo(6500, 0);
    });
  });

  describe('error handling', () => {
    it('should handle port repository errors gracefully', async () => {
      mockPortRepo.findBunkerPorts.mockRejectedValue(
        new Error('Repository error')
      );

      await expect(
        bunkerService.findBunkerPorts({
          route: mockRoute,
          maxDeviation: 200,
          fuelTypes: ['VLSFO'],
        })
      ).rejects.toThrow();
    });

    it('should handle price repository errors gracefully', async () => {
      mockPortRepo.findBunkerPorts.mockResolvedValue([mockPort1]);
      mockPriceRepo.getLatestPrices.mockRejectedValue(
        new Error('Price error')
      );

      const result = await bunkerService.analyzeBunkerOptions({
        ports: [{ ...mockPort1, deviation: 50 }],
        requiredFuel: 1000,
        currentROB: 500,
        fuelType: 'VLSFO',
      });

      // Should skip ports with price errors
      expect(result.options.length).toBe(0);
    });
  });
});
