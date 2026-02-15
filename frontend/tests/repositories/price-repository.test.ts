/**
 * Price Repository Unit Tests
 * 
 * Tests for PriceRepository covering:
 * - getLatestPrices with cache, DB, and fallback
 * - getPriceHistory date filtering and sorting
 * - getAveragePrices calculation
 * - addPrice with validation and cache invalidation
 * - Price validation
 */

import { PriceRepository } from '@/lib/repositories/price-repository';
import { RedisCache } from '@/lib/repositories/cache-client';
import { FuelPrice, PriceQuery } from '@/lib/repositories/types';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock dependencies
jest.mock('@/lib/repositories/cache-client');
jest.mock('@supabase/supabase-js');
jest.mock('fs/promises');

describe('PriceRepository', () => {
  let priceRepository: PriceRepository;
  let mockCache: jest.Mocked<RedisCache>;
  /** Chainable Supabase-style mock (typed as any for .from().select().order() etc.) */
  let mockDb: any;

  const mockPrice: FuelPrice = {
    id: 'price-1',
    portCode: 'SGSIN',
    fuelType: 'VLSFO',
    priceUSD: 650,
    date: '2025-01-26',
    source: 'market_feed',
    updatedAt: new Date('2025-01-26T10:00:00Z'),
  };

  const mockJsonPrice = {
    port_code: 'SGSIN',
    fuel_type: 'VLSFO',
    price_per_mt: 650,
    currency: 'USD',
    last_updated: '2025-01-26T10:00:00.000Z',
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
      in: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn(),
    } as any;

    priceRepository = new PriceRepository(mockCache, mockDb);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('getLatestPrices', () => {
    const query: PriceQuery = {
      portCode: 'SGSIN',
      fuelTypes: ['VLSFO', 'MGO'],
    };

    it('should return prices from cache on cache hit', async () => {
      const cachedPrices = { VLSFO: 650, MGO: 820 };
      mockCache.get.mockResolvedValue(cachedPrices);

      const result = await priceRepository.getLatestPrices(query);

      expect(result).toEqual(cachedPrices);
      expect(mockCache.get).toHaveBeenCalledWith('fuelsense:prices:SGSIN:latest');
    });

    it('should filter cached prices to requested fuel types', async () => {
      const cachedPrices = { VLSFO: 650, MGO: 820, LSFO: 600 };
      mockCache.get.mockResolvedValue(cachedPrices);

      const result = await priceRepository.getLatestPrices({
        portCode: 'SGSIN',
        fuelTypes: ['VLSFO'],
      });

      expect(result).toEqual({ VLSFO: 650 });
      expect(result.LSFO).toBeUndefined();
    });

    it('should query database and cache result on cache miss', async () => {
      mockCache.get.mockResolvedValue(null);
      mockDb.order.mockResolvedValue({
        data: [mockPrice],
        error: null,
      });

      const result = await priceRepository.getLatestPrices(query);

      expect(result.VLSFO).toBe(650);
      expect(mockDb.from).toHaveBeenCalledWith('fuel_prices');
      expect(mockDb.eq).toHaveBeenCalledWith('portCode', 'SGSIN');
      expect(mockDb.in).toHaveBeenCalledWith('fuelType', ['VLSFO', 'MGO']);
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should return latest price when multiple prices exist', async () => {
      mockCache.get.mockResolvedValue(null);
      const olderPrice = {
        ...mockPrice,
        date: '2025-01-25',
        priceUSD: 640,
      };
      mockDb.order.mockResolvedValue({
        data: [mockPrice, olderPrice],
        error: null,
      });

      const result = await priceRepository.getLatestPrices({
        portCode: 'SGSIN',
        fuelTypes: ['VLSFO'],
      });

      expect(result.VLSFO).toBe(650); // Latest price
    });

    it('should fallback to JSON when DB fails', async () => {
      mockCache.get.mockResolvedValue(null);
      mockDb.order.mockRejectedValue(new Error('DB error'));

      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      mockReadFile.mockResolvedValue(JSON.stringify([mockJsonPrice]));

      const result = await priceRepository.getLatestPrices(query);

      expect(result.VLSFO).toBe(650);
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should return empty object when no prices found', async () => {
      mockCache.get.mockResolvedValue(null);
      mockDb.order.mockResolvedValue({
        data: [],
        error: null,
      });
      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const result = await priceRepository.getLatestPrices(query);

      expect(result).toEqual({});
    });
  });

  describe('getPriceHistory', () => {
    it('should return price history sorted by date descending', async () => {
      const prices = [
        { ...mockPrice, date: '2025-01-24', priceUSD: 640 },
        { ...mockPrice, date: '2025-01-26', priceUSD: 650 },
        { ...mockPrice, date: '2025-01-25', priceUSD: 645 },
      ];

      mockDb.order.mockResolvedValue({
        data: prices,
        error: null,
      });

      const result = await priceRepository.getPriceHistory('SGSIN', 'VLSFO', 7);

      expect(result.length).toBe(3);
      expect(result[0].date).toBe('2025-01-26'); // Most recent first
      expect(result[0].priceUSD).toBe(650);
    });

    it('should filter by date range', async () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);

      mockDb.order.mockResolvedValue({
        data: [mockPrice],
        error: null,
      });

      await priceRepository.getPriceHistory('SGSIN', 'VLSFO', 7);

      expect(mockDb.gte).toHaveBeenCalled();
    });

    it('should fallback to JSON when DB fails', async () => {
      mockDb.order.mockRejectedValue(new Error('DB error'));

      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      mockReadFile.mockResolvedValue(JSON.stringify([mockJsonPrice]));

      const result = await priceRepository.getPriceHistory('SGSIN', 'VLSFO', 7);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should return empty array on error', async () => {
      mockDb.order.mockRejectedValue(new Error('DB error'));
      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      mockReadFile.mockRejectedValue(new Error('File error'));

      const result = await priceRepository.getPriceHistory('SGSIN', 'VLSFO', 7);

      expect(result).toEqual([]);
    });
  });

  describe('getAveragePrices', () => {
    it('should calculate average prices correctly', async () => {
      mockCache.get.mockResolvedValue(null);
      const prices = [
        { fuelType: 'VLSFO', priceUSD: 640 },
        { fuelType: 'VLSFO', priceUSD: 650 },
        { fuelType: 'VLSFO', priceUSD: 660 },
        { fuelType: 'MGO', priceUSD: 800 },
        { fuelType: 'MGO', priceUSD: 820 },
      ];

      mockDb.order.mockResolvedValue({
        data: prices,
        error: null,
      });

      const result = await priceRepository.getAveragePrices('SGSIN', 7);

      expect(result.VLSFO).toBeCloseTo(650, 1); // (640+650+660)/3
      expect(result.MGO).toBe(810); // (800+820)/2
    });

    it('should return cached averages when available', async () => {
      const cachedAverages = { VLSFO: 650, MGO: 810 };
      mockCache.get.mockResolvedValue(cachedAverages);

      const result = await priceRepository.getAveragePrices('SGSIN', 7);

      expect(result).toEqual(cachedAverages);
      expect(mockDb.from).not.toHaveBeenCalled();
    });

    it('should cache averages with 6-hour TTL', async () => {
      mockCache.get.mockResolvedValue(null);
      mockDb.order.mockResolvedValue({
        data: [{ fuelType: 'VLSFO', priceUSD: 650 }],
        error: null,
      });

      await priceRepository.getAveragePrices('SGSIN', 7);

      expect(mockCache.set).toHaveBeenCalledWith(
        'fuelsense:prices:SGSIN:avg:7',
        expect.any(Object),
        21600 // 6 hours
      );
    });

    it('should fallback to JSON when DB fails', async () => {
      mockCache.get.mockResolvedValue(null);
      mockDb.order.mockRejectedValue(new Error('DB error'));

      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      mockReadFile.mockResolvedValue(JSON.stringify([mockJsonPrice]));

      const result = await priceRepository.getAveragePrices('SGSIN', 7);

      expect(result.VLSFO).toBe(650);
    });
  });

  describe('addPrice', () => {
    const newPrice: Omit<FuelPrice, 'id'> = {
      portCode: 'SGSIN',
      fuelType: 'VLSFO',
      priceUSD: 650,
      date: '2025-01-26',
      source: 'market_feed',
      updatedAt: new Date(),
    };

    it('should insert price and invalidate cache', async () => {
      mockDb.single.mockResolvedValue({
        data: { ...newPrice, id: 'price-123' },
        error: null,
      });

      const result = await priceRepository.addPrice(newPrice);

      expect(result.id).toBe('price-123');
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockCache.delete).toHaveBeenCalledWith('fuelsense:prices:SGSIN:latest');
    });

    it('should reject invalid prices (too low)', async () => {
      const invalidPrice = { ...newPrice, priceUSD: 50 };

      await expect(priceRepository.addPrice(invalidPrice)).rejects.toThrow(
        'Invalid price'
      );
    });

    it('should reject invalid prices (too high)', async () => {
      const invalidPrice = { ...newPrice, priceUSD: 2000 };

      await expect(priceRepository.addPrice(invalidPrice)).rejects.toThrow(
        'Invalid price'
      );
    });

    it('should accept valid prices at boundaries', async () => {
      mockDb.single.mockResolvedValue({
        data: { ...newPrice, id: 'price-123', priceUSD: 100 },
        error: null,
      });

      const minPrice = { ...newPrice, priceUSD: 100 };
      await expect(priceRepository.addPrice(minPrice)).resolves.toBeDefined();

      mockDb.single.mockResolvedValue({
        data: { ...newPrice, id: 'price-124', priceUSD: 1500 },
        error: null,
      });

      const maxPrice = { ...newPrice, priceUSD: 1500 };
      await expect(priceRepository.addPrice(maxPrice)).resolves.toBeDefined();
    });

    it('should handle database errors', async () => {
      mockDb.single.mockRejectedValue(new Error('DB error'));

      await expect(priceRepository.addPrice(newPrice)).rejects.toThrow();
    });
  });

  describe('price validation', () => {
    it('should validate prices between $100 and $1500', () => {
      const validatePrice = priceRepository['validatePrice'].bind(priceRepository);

      expect(validatePrice(100)).toBe(true);
      expect(validatePrice(1500)).toBe(true);
      expect(validatePrice(650)).toBe(true);
      expect(validatePrice(50)).toBe(false);
      expect(validatePrice(2000)).toBe(false);
    });
  });

  describe('cache invalidation', () => {
    it('should invalidate latest prices cache for port', async () => {
      await priceRepository['invalidateCache']('SGSIN');

      expect(mockCache.delete).toHaveBeenCalledWith('fuelsense:prices:SGSIN:latest');
      expect(mockCache.clear).toHaveBeenCalled();
    });

    it('should invalidate all price caches when no port specified', async () => {
      await priceRepository['invalidateCache']();

      expect(mockCache.clear).toHaveBeenCalledWith('fuelsense:prices:*');
    });
  });

  describe('cache TTL', () => {
    it('should use 1-hour TTL for prices', () => {
      const ttl = priceRepository['getCacheTTL']();
      expect(ttl).toBe(3600); // 1 hour
    });
  });

  describe('error handling', () => {
    it('should handle cache errors gracefully', async () => {
      mockCache.get.mockRejectedValue(new Error('Cache error'));
      mockDb.order.mockResolvedValue({
        data: [mockPrice],
        error: null,
      });

      const result = await priceRepository.getLatestPrices({
        portCode: 'SGSIN',
        fuelTypes: ['VLSFO'],
      });

      expect(result).toBeDefined();
    });

    it('should handle database errors gracefully', async () => {
      mockCache.get.mockResolvedValue(null);
      mockDb.order.mockRejectedValue(new Error('Database error'));

      const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
      mockReadFile.mockResolvedValue(JSON.stringify([mockJsonPrice]));

      const result = await priceRepository.getLatestPrices({
        portCode: 'SGSIN',
        fuelTypes: ['VLSFO'],
      });

      expect(result).toBeDefined();
    });
  });
});
