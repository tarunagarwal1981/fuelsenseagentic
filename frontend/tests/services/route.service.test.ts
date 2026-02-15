/**
 * Route Service Unit Tests
 * 
 * Tests for RouteService covering:
 * - calculateRoute with caching
 * - ECA zone detection
 * - Timeline calculation
 * - Error handling
 */

import { RouteService } from '@/lib/services/route.service';
import { PortRepository } from '@/lib/repositories/port-repository';
import { RedisCache } from '@/lib/repositories/cache-client';
import { SeaRouteAPIClient } from '@/lib/services/sea-route-api-client';
import type { RouteData, Waypoint } from '@/lib/services/types';
import { Port } from '@/lib/repositories/types';

// Mock dependencies
jest.mock('@/lib/repositories/port-repository');
jest.mock('@/lib/repositories/cache-client');
jest.mock('@/lib/services/sea-route-api-client');
jest.mock('@turf/turf');

describe('RouteService', () => {
  let routeService: RouteService;
  let mockPortRepo: jest.Mocked<PortRepository>;
  let mockCache: jest.Mocked<RedisCache>;
  let mockSeaRouteAPI: jest.Mocked<SeaRouteAPIClient>;

  const mockOriginPort: Port = {
    id: 'SGSIN',
    code: 'SGSIN',
    name: 'Singapore',
    country: 'SG',
    coordinates: [1.2897, 103.8501],
    bunkerCapable: true,
    fuelsAvailable: ['VLSFO', 'MGO'],
    timezone: 'Asia/Singapore',
  };

  const mockDestPort: Port = {
    id: 'NLRTM',
    code: 'NLRTM',
    name: 'Rotterdam',
    country: 'NL',
    coordinates: [51.9225, 4.4792],
    bunkerCapable: true,
    fuelsAvailable: ['VLSFO', 'MGO'],
    timezone: 'Europe/Amsterdam',
  };

  const mockAPIResponse = {
    distance: 8500,
    geometry: [
      [103.8501, 1.2897], // [lon, lat] - Singapore
      [110.0, 5.0],
      [120.0, 10.0],
      [4.4792, 51.9225], // [lon, lat] - Rotterdam
    ] as [number, number][],
    duration: 607, // hours
  };

  beforeEach(() => {
    // Create mocks
    mockPortRepo = {
      findByCode: jest.fn(),
    } as any;

    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
    } as any;

    mockSeaRouteAPI = {
      calculateRoute: jest.fn(),
    } as any;

    routeService = new RouteService(mockPortRepo, mockCache, mockSeaRouteAPI);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('calculateRoute', () => {
    const params = {
      origin: 'SGSIN',
      destination: 'NLRTM',
      speed: 14,
      departureDate: new Date('2025-01-26T00:00:00Z'),
    };

    it('should return cached route on cache hit', async () => {
      const cachedRoute: RouteData = {
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
        waypoints: [],
        totalDistanceNm: 8500,
        timeline: [],
        ecaSegments: [],
        estimatedHours: 607,
        routeType: 'direct route',
      };

      mockCache.get.mockResolvedValue(cachedRoute);

      const result = await routeService.calculateRoute(params);

      expect(result).toEqual(cachedRoute);
      expect(mockCache.get).toHaveBeenCalledWith(
        'fuelsense:route:SGSIN-NLRTM-14'
      );
      expect(mockSeaRouteAPI.calculateRoute).not.toHaveBeenCalled();
    });

    it('should calculate route when cache miss', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPortRepo.findByCode
        .mockResolvedValueOnce(mockOriginPort)
        .mockResolvedValueOnce(mockDestPort);
      mockSeaRouteAPI.calculateRoute.mockResolvedValue(mockAPIResponse);

      // Mock Turf.js
      const turf = require('@turf/turf');
      turf.booleanPointInPolygon = jest.fn().mockReturnValue(false);

      const result = await routeService.calculateRoute(params);

      expect(result.origin.port_code).toBe('SGSIN');
      expect(result.destination.port_code).toBe('NLRTM');
      expect(result.totalDistanceNm).toBe(8500);
      expect(result.waypoints.length).toBeGreaterThan(0);
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should throw error when origin port not found', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPortRepo.findByCode.mockResolvedValueOnce(null);

      await expect(routeService.calculateRoute(params)).rejects.toThrow(
        'Origin port not found'
      );
    });

    it('should throw error when destination port not found', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPortRepo.findByCode
        .mockResolvedValueOnce(mockOriginPort)
        .mockResolvedValueOnce(null);

      await expect(routeService.calculateRoute(params)).rejects.toThrow(
        'Destination port not found'
      );
    });

    it('should adjust timeline dates when using cached route with different departure', async () => {
      const cachedRoute: RouteData = {
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
        waypoints: [],
        totalDistanceNm: 8500,
        timeline: [
          {
            waypoint: {
              coordinates: [1.2897, 103.8501],
              distanceFromPreviousNm: 0,
              distanceFromStartNm: 0,
              inECA: false,
            },
            eta: new Date('2025-01-25T00:00:00Z'),
            distanceFromStartNm: 0,
          },
        ],
        ecaSegments: [],
        estimatedHours: 607,
        routeType: 'direct route',
      };

      mockCache.get.mockResolvedValue(cachedRoute);

      const newParams = {
        ...params,
        departureDate: new Date('2025-01-27T00:00:00Z'), // 2 days later
      };

      const result = await routeService.calculateRoute(newParams);

      // Timeline should be adjusted by 2 days
      const expectedDate = new Date('2025-01-27T00:00:00Z');
      expect(result.timeline[0].eta.getTime()).toBeCloseTo(expectedDate.getTime(), -3);
    });
  });

  describe('ECA zone detection', () => {
    it('should detect ECA zones for waypoints', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPortRepo.findByCode
        .mockResolvedValueOnce(mockOriginPort)
        .mockResolvedValueOnce(mockDestPort);
      mockSeaRouteAPI.calculateRoute.mockResolvedValue(mockAPIResponse);

      // Mock Turf.js to return true for some waypoints (in ECA)
      const turf = require('@turf/turf');
      turf.booleanPointInPolygon = jest
        .fn()
        .mockReturnValueOnce(false) // First waypoint
        .mockReturnValueOnce(false) // Second waypoint
        .mockReturnValueOnce(true) // Third waypoint (in ECA)
        .mockReturnValueOnce(false); // Last waypoint

      const result = await routeService.calculateRoute({
        origin: 'SGSIN',
        destination: 'NLRTM',
        speed: 14,
        departureDate: new Date('2025-01-26T00:00:00Z'),
      });

      // Check that ECA detection was applied
      expect(turf.booleanPointInPolygon).toHaveBeenCalled();
    });
  });

  describe('timeline calculation', () => {
    it('should calculate timeline correctly', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPortRepo.findByCode
        .mockResolvedValueOnce(mockOriginPort)
        .mockResolvedValueOnce(mockDestPort);
      mockSeaRouteAPI.calculateRoute.mockResolvedValue(mockAPIResponse);

      const turf = require('@turf/turf');
      turf.booleanPointInPolygon = jest.fn().mockReturnValue(false);

      const departureDate = new Date('2025-01-26T00:00:00Z');
      const result = await routeService.calculateRoute({
        origin: 'SGSIN',
        destination: 'NLRTM',
        speed: 14,
        departureDate,
      });

      expect(result.timeline.length).toBeGreaterThan(0);
      expect(result.timeline[0].eta.getTime()).toBe(departureDate.getTime());
      // Last waypoint ETA should be after first
      if (result.timeline.length > 1) {
        expect(
          result.timeline[result.timeline.length - 1].eta.getTime()
        ).toBeGreaterThan(result.timeline[0].eta.getTime());
      }
    });
  });

  describe('error handling', () => {
    it('should handle cache errors gracefully', async () => {
      mockCache.get.mockRejectedValue(new Error('Cache error'));
      mockPortRepo.findByCode
        .mockResolvedValueOnce(mockOriginPort)
        .mockResolvedValueOnce(mockDestPort);
      mockSeaRouteAPI.calculateRoute.mockResolvedValue(mockAPIResponse);

      const turf = require('@turf/turf');
      turf.booleanPointInPolygon = jest.fn().mockReturnValue(false);

      const result = await routeService.calculateRoute({
        origin: 'SGSIN',
        destination: 'NLRTM',
        speed: 14,
        departureDate: new Date('2025-01-26T00:00:00Z'),
      });

      expect(result).toBeDefined();
    });

    it('should handle API errors', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPortRepo.findByCode
        .mockResolvedValueOnce(mockOriginPort)
        .mockResolvedValueOnce(mockDestPort);
      mockSeaRouteAPI.calculateRoute.mockRejectedValue(
        new Error('API error')
      );

      await expect(
        routeService.calculateRoute({
          origin: 'SGSIN',
          destination: 'NLRTM',
          speed: 14,
          departureDate: new Date('2025-01-26T00:00:00Z'),
        })
      ).rejects.toThrow();
    });
  });
});
