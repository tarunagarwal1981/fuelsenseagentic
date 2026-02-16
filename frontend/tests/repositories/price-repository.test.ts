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
let mockBunkerGetByPortName: jest.Mock;
jest.mock('@/lib/clients/bunker-pricing-client', () => ({
  BunkerPricingClient: jest.fn().mockImplementation(() => ({
    getByPortName: (...args: unknown[]) => (mockBunkerGetByPortName ?? jest.fn().mockResolvedValue([]))(...args),
  })),
}));

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

  /** Chain for getPriceHistory: .gte().order().order() - gte returns this, then .order() returns orderChain, then .order() returns Promise */
  let orderChain: { order: jest.Mock };
  /** Returned by gte: thenable for getAveragePrices, and has .order() for getPriceHistory */
  let gteReturn: { order: jest.Mock; then: (resolve: (v: any) => void) => void; catch: (fn: (e: any) => void) => void };

  beforeEach(() => {
    // Create mocks
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
    } as any;

    orderChain = { order: jest.fn().mockResolvedValue({ data: [], error: null }) };
    gteReturn = {
      order: jest.fn().mockReturnValue(orderChain),
      then: (resolve: (v: any) => void) => resolve({ data: [], error: null }),
      catch: (_fn: (e: any) => void) => gteReturn,
    };
    mockDb = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnValue(gteReturn),
      order: jest.fn().mockReturnValue(orderChain),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn(),
    } as any;

    priceRepository = new PriceRepository(mockCache, mockDb);

    mockBunkerGetByPortName = jest.fn().mockResolvedValue([]);
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

    it('should use BunkerPricing API on cache miss when portName provided and cache result', async () => {
      mockCache.get.mockResolvedValue(null);
      mockBunkerGetByPortName.mockResolvedValue([
        { portCode: 'SGSIN', portName: 'Singapore', fuelType: 'VLSFO', priceUSD: 650, date: '2025-01-26', updatedAt: new Date('2025-01-26') },
        { portCode: 'SGSIN', portName: 'Singapore', fuelType: 'MGO', priceUSD: 820, date: '2025-01-26', updatedAt: new Date('2025-01-26') },
      ]);

      const result = await priceRepository.getLatestPrices({
        portName: 'Singapore',
        fuelTypes: ['VLSFO', 'MGO'],
      });

      expect(result.VLSFO).toBe(650);
      expect(result.MGO).toBe(820);
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should return latest price when API returns multiple dates', async () => {
      mockCache.get.mockResolvedValue(null);
      mockBunkerGetByPortName.mockResolvedValue([
        { portCode: 'SGSIN', portName: 'Singapore', fuelType: 'VLSFO', priceUSD: 640, date: '2025-01-25', updatedAt: new Date('2025-01-25') },
        { portCode: 'SGSIN', portName: 'Singapore', fuelType: 'VLSFO', priceUSD: 650, date: '2025-01-26', updatedAt: new Date('2025-01-26') },
      ]);

      const result = await priceRepository.getLatestPrices({
        portName: 'Singapore',
        fuelTypes: ['VLSFO'],
      });

      expect(result.VLSFO).toBe(650);
    });

    it('should return empty object when cache miss and BunkerPricing API returns no data', async () => {
      mockCache.get.mockResolvedValue(null);
      const result = await priceRepository.getLatestPrices(query);
      expect(result).toEqual({});
    });

    it('should return empty object when no prices found', async () => {
      mockCache.get.mockResolvedValue(null);
      orderChain.order.mockResolvedValue({
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
        { ...mockPrice, date: '2025-01-26', priceUSD: 650 },
        { ...mockPrice, date: '2025-01-25', priceUSD: 645 },
        { ...mockPrice, date: '2025-01-24', priceUSD: 640 },
      ];

      orderChain.order.mockResolvedValue({
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

      orderChain.order.mockResolvedValue({
        data: [mockPrice],
        error: null,
      });

      await priceRepository.getPriceHistory('SGSIN', 'VLSFO', 7);

      expect(mockDb.gte).toHaveBeenCalled();
    });

    it('should return empty array when DB fails (no JSON fallback for getPriceHistory)', async () => {
      orderChain.order.mockRejectedValue(new Error('DB error'));

      const result = await priceRepository.getPriceHistory('SGSIN', 'VLSFO', 7);

      expect(result).toEqual([]);
    });

    it('should return empty array on error', async () => {
      orderChain.order.mockRejectedValue(new Error('DB error'));
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
      mockDb.gte.mockResolvedValue({ data: prices, error: null });

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
      mockDb.gte.mockResolvedValue({
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

    it('should return empty object when DB fails (no JSON fallback for getAveragePrices)', async () => {
      mockCache.get.mockResolvedValue(null);
      mockDb.gte.mockRejectedValue(new Error('DB error'));

      const result = await priceRepository.getAveragePrices('SGSIN', 7);

      expect(result).toEqual({});
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
      orderChain.order.mockResolvedValue({
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
      orderChain.order.mockRejectedValue(new Error('Database error'));

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
