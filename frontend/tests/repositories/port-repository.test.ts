/**
 * Port Repository Unit Tests
 * 
 * Tests for PortRepository covering:
 * - findByCode with cache, DB, and fallback
 * - findBunkerPorts filtering
 * - findNearby distance calculations
 * - searchByName case-insensitive search
 * - Cache hit rate and TTL
 */

import { PortRepository } from '@/lib/repositories/port-repository';
import { RedisCache } from '@/lib/repositories/cache-client';
import { Port } from '@/lib/repositories/types';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock dependencies
jest.mock('@/lib/repositories/cache-client');
jest.mock('@supabase/supabase-js');
jest.mock('fs/promises');

describe('PortRepository', () => {
  let portRepository: PortRepository;
  let mockCache: jest.Mocked<RedisCache>;
  /** Chainable Supabase-style mock (typed as any for .from().select().eq() etc.) */
  let mockDb: any;

  const mockPort: Port = {
    id: 'SGSIN',
    code: 'SGSIN',
    name: 'Singapore',
    country: 'SG',
    coordinates: [1.2897, 103.8501],
    bunkerCapable: true,
    fuelsAvailable: ['VLSFO', 'MGO', 'LSGO'],
    timezone: 'Asia/Singapore',
  };

  const mockJsonPort = {
    port_code: 'SGSIN',
    name: 'Singapore',
    country: 'SG',
    coordinates: {
      lat: 1.2897,
      lon: 103.8501,
    },
    fuel_capabilities: ['VLSFO', 'MGO', 'LSGO'],
  };

  beforeEach(() => {
    // Create mocks
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
    } as any;

    mockDb = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      single: jest.fn(),
      limit: jest.fn().mockReturnThis(),
    } as any;

    portRepository = new PortRepository(mockCache);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('findByCode', () => {
    it('should return port from cache on cache hit', async () => {
      mockCache.get.mockResolvedValue(mockPort);

      const result = await portRepository.findByCode('SGSIN');

      expect(result).toEqual(mockPort);
      expect(mockCache.get).toHaveBeenCalledWith('fuelsense:ports:SGSIN');
      expect(mockDb.from).not.toHaveBeenCalled();
    });

    it('should query database and cache result on cache miss', async () => {
      mockCache.get.mockResolvedValue(null);
      mockDb.single.mockResolvedValue({
        data: mockPort,
        error: null,
      });

      const result = await portRepository.findByCode('SGSIN');

      expect(result).toEqual(mockPort);
      expect(mockDb.from).toHaveBeenCalledWith('ports');
      expect(mockDb.select).toHaveBeenCalledWith('*');
      expect(mockDb.eq).toHaveBeenCalledWith('code', 'SGSIN');
      expect(mockCache.set).toHaveBeenCalledWith(
        'fuelsense:ports:SGSIN',
        mockPort,
        86400
      );
    });

    it('should fallback to JSON file when DB fails', async () => {
      mockCache.get.mockResolvedValue(null);
      mockDb.single.mockRejectedValue(new Error('DB error'));

      // Mock fs.readFile to return JSON data
      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      mockReadFile.mockResolvedValue(JSON.stringify([mockJsonPort]));

      const result = await portRepository.findByCode('SGSIN');

      expect(result).toBeTruthy();
      expect(result?.code).toBe('SGSIN');
      expect(result?.name).toBe('Singapore');
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should return null when port not found', async () => {
      mockCache.get.mockResolvedValue(null);
      mockDb.single.mockResolvedValue({
        data: null,
        error: null,
      });
      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const result = await portRepository.findByCode('INVALID');

      expect(result).toBeNull();
    });
  });

  describe('findBunkerPorts', () => {
    const bunkerPorts: Port[] = [
      mockPort,
      {
        ...mockPort,
        code: 'AEFJR',
        id: 'AEFJR',
        name: 'Fujairah',
        bunkerCapable: true,
      },
    ];

    const nonBunkerPort: Port = {
      ...mockPort,
      code: 'NONBUNKER',
      id: 'NONBUNKER',
      bunkerCapable: false,
      fuelsAvailable: [],
    };

    it('should return bunker ports from cache', async () => {
      mockCache.get.mockResolvedValue(bunkerPorts);

      const result = await portRepository.findBunkerPorts();

      expect(result).toEqual(bunkerPorts);
      expect(mockCache.get).toHaveBeenCalledWith('fuelsense:ports:bunker:all');
    });

    it('should query database for bunker-capable ports', async () => {
      mockCache.get.mockResolvedValue(null);
      mockDb.eq.mockResolvedValue({
        data: bunkerPorts,
        error: null,
      });

      const result = await portRepository.findBunkerPorts();

      expect(result).toEqual(bunkerPorts);
      expect(mockDb.eq).toHaveBeenCalledWith('bunkerCapable', true);
      expect(mockCache.set).toHaveBeenCalledWith(
        'fuelsense:ports:bunker:all',
        bunkerPorts,
        43200 // 12 hours
      );
    });

    it('should filter bunker ports from fallback JSON', async () => {
      mockCache.get.mockResolvedValue(null);
      mockDb.eq.mockRejectedValue(new Error('DB error'));

      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      mockReadFile.mockResolvedValue(
        JSON.stringify([
          mockJsonPort,
          {
            port_code: 'NONBUNKER',
            name: 'Non-Bunker Port',
            country: 'XX',
            coordinates: { lat: 0, lon: 0 },
            fuel_capabilities: [],
          },
        ])
      );

      const result = await portRepository.findBunkerPorts();

      expect(result.length).toBeGreaterThan(0);
      expect(result.every((p) => p.bunkerCapable)).toBe(true);
    });
  });

  describe('findNearby', () => {
    const testLat = 1.2897;
    const testLon = 103.8501;
    const radiusNm = 50;

    const nearbyPort: Port = {
      ...mockPort,
      code: 'MYTPP',
      id: 'MYTPP',
      name: 'Port Klang',
      coordinates: [3.0, 101.4], // ~150nm from Singapore
    };

    const farPort: Port = {
      ...mockPort,
      code: 'USNYC',
      id: 'USNYC',
      name: 'New York',
      coordinates: [40.7128, -74.006], // Very far
    };

    it('should find ports within radius', async () => {
      // Mock findAll to return test ports (legacy API; cast for test)
      jest.spyOn(portRepository as any, 'findAll').mockResolvedValue([
        mockPort,
        nearbyPort,
        farPort,
      ]);

      const result = await portRepository.findNearby(testLat, testLon, radiusNm);

      // Should include Singapore (distance = 0) and nearby ports
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((p) => p.code === 'SGSIN')).toBe(true);
    });

    it('should sort results by distance', async () => {
      jest.spyOn(portRepository as any, 'findAll').mockResolvedValue([
        farPort,
        nearbyPort,
        mockPort,
      ]);

      const result = await portRepository.findNearby(testLat, testLon, 200);

      expect(result[0].code).toBe('SGSIN'); // Closest
      expect(result[result.length - 1].code).toBe('USNYC'); // Farthest
    });

    it('should return empty array when no ports in radius', async () => {
      jest.spyOn(portRepository as any, 'findAll').mockResolvedValue([farPort]);

      const result = await portRepository.findNearby(testLat, testLon, 10);

      expect(result).toEqual([]);
    });
  });

  describe('searchByName', () => {
    const searchPorts: Port[] = [
      mockPort,
      {
        ...mockPort,
        code: 'SGHKG',
        id: 'SGHKG',
        name: 'Hong Kong',
      },
    ];

    it('should search case-insensitively', async () => {
      mockDb.limit.mockResolvedValue({
        data: [mockPort],
        error: null,
      });

      const result = await (portRepository as any).searchByName('singapore');

      expect(result).toBeTruthy();
      expect(mockDb.ilike).toHaveBeenCalledWith('name', '%singapore%');
    });

    it('should limit results to 20', async () => {
      mockDb.limit.mockResolvedValue({
        data: searchPorts,
        error: null,
      });

      await (portRepository as any).searchByName('port');

      expect(mockDb.limit).toHaveBeenCalledWith(20);
    });

    it('should fallback to in-memory search when DB fails', async () => {
      mockDb.limit.mockRejectedValue(new Error('DB error'));
      jest.spyOn(portRepository as any, 'findAll').mockResolvedValue(searchPorts);

      const result = await (portRepository as any).searchByName('singapore');

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name.toLowerCase()).toContain('singapore');
    });

    it('should return empty array for empty query', async () => {
      const result = await (portRepository as any).searchByName('   ');

      expect(result).toEqual([]);
      expect(mockDb.from).not.toHaveBeenCalled();
    });
  });

  describe('cache TTL', () => {
    it('should use 24-hour TTL for ports', () => {
      const ttl = (portRepository as any)['getCacheTTL']();
      expect(ttl).toBe(86400); // 24 hours
    });
  });

  describe('Haversine distance calculation', () => {
    it('should calculate distance correctly', () => {
      // Singapore to Port Klang (approximately 150nm)
      const distance = (portRepository as any)['calculateDistance'](
        [1.2897, 103.8501], // Singapore
        [3.0, 101.4] // Port Klang
      );

      expect(distance).toBeGreaterThan(140);
      expect(distance).toBeLessThan(160);
    });

    it('should return 0 for same coordinates', () => {
      const distance = (portRepository as any)['calculateDistance'](
        [1.2897, 103.8501],
        [1.2897, 103.8501]
      );

      expect(distance).toBeCloseTo(0, 1);
    });
  });

  describe('error handling', () => {
    it('should handle cache errors gracefully', async () => {
      mockCache.get.mockRejectedValue(new Error('Cache error'));
      mockDb.single.mockResolvedValue({
        data: mockPort,
        error: null,
      });

      const result = await portRepository.findByCode('SGSIN');

      expect(result).toEqual(mockPort);
    });

    it('should handle database errors gracefully', async () => {
      mockCache.get.mockResolvedValue(null);
      mockDb.single.mockRejectedValue(new Error('Database error'));

      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      mockReadFile.mockResolvedValue(JSON.stringify([mockJsonPort]));

      const result = await portRepository.findByCode('SGSIN');

      expect(result).toBeTruthy();
    });
  });
});
