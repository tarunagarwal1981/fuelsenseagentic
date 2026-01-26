/**
 * Vessel Repository Unit Tests
 * 
 * Tests for VesselRepository covering:
 * - findByName with cache, DB, and fallback
 * - findByIMO lookup
 * - getConsumptionAtSpeed interpolation
 * - validateCapacity checks
 */

import { VesselRepository } from '@/lib/repositories/vessel-repository';
import { RedisCache } from '@/lib/repositories/cache-client';
import { SupabaseClient } from '@supabase/supabase-js';
import { VesselProfile } from '@/lib/repositories/types';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock dependencies
jest.mock('@/lib/repositories/cache-client');
jest.mock('@supabase/supabase-js');
jest.mock('fs/promises');

describe('VesselRepository', () => {
  let vesselRepository: VesselRepository;
  let mockCache: jest.Mocked<RedisCache>;
  let mockDb: jest.Mocked<SupabaseClient>;

  const mockVessel: VesselProfile = {
    id: 'vessel_001',
    name: 'MV Pacific Star',
    imo: 'IMO9234567',
    vesselType: 'Container Ship',
    dwt: 50000,
    specs: {
      fuelCapacity: {
        total: 2200,
        vlsfo: 2000,
        mgo: 200,
      },
      speed: {
        design: 16,
        eco: 12,
      },
    },
    consumption: {
      atSea: [
        { speed: 12, vlsfo: 24, mgo: 2.8 },
        { speed: 14, vlsfo: 30, mgo: 3 },
        { speed: 16, vlsfo: 38, mgo: 3.2 },
      ],
      inPort: {
        vlsfo: 0,
        mgo: 0.5,
      },
    },
  };

  const mockJsonVessel = {
    vessel_id: 'vessel_001',
    imo: 'IMO9234567',
    vessel_type: 'Container Ship',
    dwt: 50000,
    tank_capacity: {
      VLSFO: 2000,
      LSMGO: 200,
      total: 2200,
    },
    consumption_profile: {
      speed_12_knots: {
        main_engine_vlsfo_mt_per_day: 24,
        auxiliary_lsmgo_mt_per_day: 2.8,
        total_mt_per_day: 26.8,
      },
      speed_14_knots: {
        main_engine_vlsfo_mt_per_day: 30,
        auxiliary_lsmgo_mt_per_day: 3,
        total_mt_per_day: 33,
      },
      speed_16_knots: {
        main_engine_vlsfo_mt_per_day: 38,
        auxiliary_lsmgo_mt_per_day: 3.2,
        total_mt_per_day: 41.2,
      },
    },
    operational_speed_knots: 14,
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
    } as any;

    vesselRepository = new VesselRepository(mockCache, mockDb);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('findByName', () => {
    it('should return vessel from cache on cache hit', async () => {
      mockCache.get.mockResolvedValue(mockVessel);

      const result = await vesselRepository.findByName('MV Pacific Star');

      expect(result).toEqual(mockVessel);
      expect(mockCache.get).toHaveBeenCalledWith(
        'fuelsense:vessels:name:mv pacific star'
      );
      expect(mockDb.from).not.toHaveBeenCalled();
    });

    it('should query database and cache result on cache miss', async () => {
      mockCache.get.mockResolvedValue(null);
      mockDb.single.mockResolvedValue({
        data: mockVessel,
        error: null,
      });

      const result = await vesselRepository.findByName('MV Pacific Star');

      expect(result).toEqual(mockVessel);
      expect(mockDb.from).toHaveBeenCalledWith('vessels');
      expect(mockDb.ilike).toHaveBeenCalledWith('name', 'MV Pacific Star');
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should be case-insensitive in fallback', async () => {
      mockCache.get.mockResolvedValue(null);
      mockDb.single.mockRejectedValue(new Error('DB error'));

      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      mockReadFile.mockResolvedValue(
        JSON.stringify({ 'MV Pacific Star': mockJsonVessel })
      );

      const result = await vesselRepository.findByName('mv pacific star');

      expect(result).toBeTruthy();
      expect(result?.name).toBe('MV Pacific Star');
    });

    it('should return null when vessel not found', async () => {
      mockCache.get.mockResolvedValue(null);
      mockDb.single.mockResolvedValue({
        data: null,
        error: null,
      });
      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      mockReadFile.mockResolvedValue(JSON.stringify({}));

      const result = await vesselRepository.findByName('NonExistent Vessel');

      expect(result).toBeNull();
    });
  });

  describe('findByIMO', () => {
    it('should return vessel from cache on cache hit', async () => {
      mockCache.get.mockResolvedValue(mockVessel);

      const result = await vesselRepository.findByIMO('IMO9234567');

      expect(result).toEqual(mockVessel);
      expect(mockCache.get).toHaveBeenCalledWith('fuelsense:vessels:imo:IMO9234567');
    });

    it('should query database by IMO', async () => {
      mockCache.get.mockResolvedValue(null);
      mockDb.single.mockResolvedValue({
        data: mockVessel,
        error: null,
      });

      const result = await vesselRepository.findByIMO('IMO9234567');

      expect(result).toEqual(mockVessel);
      expect(mockDb.eq).toHaveBeenCalledWith('imo', 'IMO9234567');
    });

    it('should fallback to JSON when DB fails', async () => {
      mockCache.get.mockResolvedValue(null);
      mockDb.single.mockRejectedValue(new Error('DB error'));

      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      mockReadFile.mockResolvedValue(
        JSON.stringify({ 'MV Pacific Star': mockJsonVessel })
      );

      const result = await vesselRepository.findByIMO('IMO9234567');

      expect(result).toBeTruthy();
      expect(result?.imo).toBe('IMO9234567');
    });
  });

  describe('getConsumptionAtSpeed', () => {
    beforeEach(() => {
      jest.spyOn(vesselRepository, 'findById').mockResolvedValue(mockVessel);
    });

    it('should return exact consumption for known speed', async () => {
      const result = await vesselRepository.getConsumptionAtSpeed('vessel_001', 14);

      expect(result.vlsfo).toBe(30);
      expect(result.mgo).toBe(3);
    });

    it('should interpolate consumption for speed between known points', async () => {
      // Speed 13 is between 12 and 14
      const result = await vesselRepository.getConsumptionAtSpeed('vessel_001', 13);

      // Linear interpolation: (24 + 30) / 2 = 27 for VLSFO
      // But more accurately: 24 + (30-24) * (13-12)/(14-12) = 24 + 3 = 27
      expect(result.vlsfo).toBeCloseTo(27, 1);
      expect(result.mgo).toBeCloseTo(2.9, 1);
    });

    it('should use minimum consumption for speed below minimum', async () => {
      const result = await vesselRepository.getConsumptionAtSpeed('vessel_001', 10);

      expect(result.vlsfo).toBe(24); // Minimum speed consumption
      expect(result.mgo).toBe(2.8);
    });

    it('should use maximum consumption for speed above maximum', async () => {
      const result = await vesselRepository.getConsumptionAtSpeed('vessel_001', 18);

      expect(result.vlsfo).toBe(38); // Maximum speed consumption
      expect(result.mgo).toBe(3.2);
    });

    it('should throw error when vessel not found', async () => {
      jest.spyOn(vesselRepository, 'findById').mockResolvedValue(null);

      await expect(
        vesselRepository.getConsumptionAtSpeed('nonexistent', 14)
      ).rejects.toThrow('Vessel nonexistent not found');
    });

    it('should fallback to in-port consumption when no at-sea data', async () => {
      const vesselWithoutAtSea: VesselProfile = {
        ...mockVessel,
        consumption: {
          atSea: [],
          inPort: { vlsfo: 0, mgo: 0.5 },
        },
      };
      jest.spyOn(vesselRepository, 'findById').mockResolvedValue(vesselWithoutAtSea);

      const result = await vesselRepository.getConsumptionAtSpeed('vessel_001', 14);

      expect(result).toEqual({ vlsfo: 0, mgo: 0.5 });
    });
  });

  describe('validateCapacity', () => {
    beforeEach(() => {
      jest.spyOn(vesselRepository, 'findById').mockResolvedValue(mockVessel);
    });

    it('should return true for valid ROB values', async () => {
      const result = await vesselRepository.validateCapacity('vessel_001', 1000, 100);

      expect(result).toBe(true);
    });

    it('should return false when VLSFO exceeds capacity', async () => {
      const result = await vesselRepository.validateCapacity('vessel_001', 2500, 100);

      expect(result).toBe(false);
    });

    it('should return false when MGO exceeds capacity', async () => {
      const result = await vesselRepository.validateCapacity('vessel_001', 1000, 300);

      expect(result).toBe(false);
    });

    it('should return false when total ROB exceeds total capacity', async () => {
      // Individual capacities OK, but total exceeds
      const result = await vesselRepository.validateCapacity('vessel_001', 1500, 800);

      expect(result).toBe(false);
    });

    it('should return false for negative ROB values', async () => {
      const result = await vesselRepository.validateCapacity('vessel_001', -100, 100);

      expect(result).toBe(false);
    });

    it('should return false when vessel not found', async () => {
      jest.spyOn(vesselRepository, 'findById').mockResolvedValue(null);

      const result = await vesselRepository.validateCapacity('nonexistent', 1000, 100);

      expect(result).toBe(false);
    });

    it('should accept values at capacity limits', async () => {
      const result = await vesselRepository.validateCapacity('vessel_001', 2000, 200);

      expect(result).toBe(true);
    });
  });

  describe('findById', () => {
    it('should return vessel from cache', async () => {
      mockCache.get.mockResolvedValue(mockVessel);

      const result = await vesselRepository.findById('vessel_001');

      expect(result).toEqual(mockVessel);
      expect(mockCache.get).toHaveBeenCalledWith('fuelsense:vessels:vessel_001');
    });

    it('should query database on cache miss', async () => {
      mockCache.get.mockResolvedValue(null);
      mockDb.single.mockResolvedValue({
        data: mockVessel,
        error: null,
      });

      const result = await vesselRepository.findById('vessel_001');

      expect(result).toEqual(mockVessel);
      expect(mockDb.eq).toHaveBeenCalledWith('id', 'vessel_001');
    });

    it('should fallback to JSON when DB fails', async () => {
      mockCache.get.mockResolvedValue(null);
      mockDb.single.mockRejectedValue(new Error('DB error'));

      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      mockReadFile.mockResolvedValue(
        JSON.stringify({ 'MV Pacific Star': mockJsonVessel })
      );

      const result = await vesselRepository.findById('vessel_001');

      expect(result).toBeTruthy();
      expect(result?.id).toBe('vessel_001');
    });
  });

  describe('cache TTL', () => {
    it('should use 24-hour TTL for vessels', () => {
      const ttl = vesselRepository['getCacheTTL']();
      expect(ttl).toBe(86400); // 24 hours
    });
  });

  describe('error handling', () => {
    it('should handle cache errors gracefully', async () => {
      mockCache.get.mockRejectedValue(new Error('Cache error'));
      mockDb.single.mockResolvedValue({
        data: mockVessel,
        error: null,
      });

      const result = await vesselRepository.findByName('MV Pacific Star');

      expect(result).toBeDefined();
    });

    it('should handle database errors gracefully', async () => {
      mockCache.get.mockResolvedValue(null);
      mockDb.single.mockRejectedValue(new Error('Database error'));

      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      mockReadFile.mockResolvedValue(
        JSON.stringify({ 'MV Pacific Star': mockJsonVessel })
      );

      const result = await vesselRepository.findByName('MV Pacific Star');

      expect(result).toBeDefined();
    });
  });
});
