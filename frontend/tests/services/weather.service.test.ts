/**
 * Weather Service Unit Tests
 * 
 * Tests for WeatherService covering:
 * - fetchMarineWeather with caching
 * - calculateWeatherImpact multipliers
 * - checkPortWeatherSafety validation
 * - Error handling
 */

import { WeatherService } from './weather.service';
import { RedisCache } from '@/lib/repositories/cache-client';
import { OpenMeteoAPIClient } from './open-meteo-api-client';
import { PortRepository } from '@/lib/repositories/port-repository';
import { MarineWeather, WeatherImpact, PortWeatherSafety } from './types';
import { Port } from '@/lib/repositories/types';

// Mock dependencies
jest.mock('@/lib/repositories/cache-client');
jest.mock('./open-meteo-api-client');
jest.mock('@/lib/repositories/port-repository');

describe('WeatherService', () => {
  let weatherService: WeatherService;
  let mockCache: jest.Mocked<RedisCache>;
  let mockOpenMeteoAPI: jest.Mocked<OpenMeteoAPIClient>;
  let mockPortRepo: jest.Mocked<PortRepository>;

  const mockWeather: MarineWeather = {
    waveHeight: 2.0,
    windSpeed: 15,
    windDirection: 180,
    seaState: 'Moderate',
    datetime: new Date('2025-01-26T12:00:00Z'),
  };

  const mockPort: Port = {
    id: 'SGSIN',
    code: 'SGSIN',
    name: 'Singapore',
    country: 'SG',
    coordinates: [1.2897, 103.8501],
    bunkerCapable: true,
    fuelsAvailable: ['VLSFO', 'MGO'],
    timezone: 'Asia/Singapore',
  };

  beforeEach(() => {
    // Create mocks
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
    } as any;

    mockOpenMeteoAPI = {
      fetchMarine: jest.fn(),
    } as any;

    mockPortRepo = {
      findByCode: jest.fn(),
    } as any;

    weatherService = new WeatherService(
      mockCache,
      mockOpenMeteoAPI,
      mockPortRepo
    );

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('fetchMarineWeather', () => {
    const params = {
      latitude: 1.2897,
      longitude: 103.8501,
      date: new Date('2025-01-26T12:00:00Z'),
    };

    it('should return cached weather on cache hit', async () => {
      mockCache.get.mockResolvedValue(mockWeather);

      const result = await weatherService.fetchMarineWeather(params);

      expect(result).toEqual(mockWeather);
      expect(mockCache.get).toHaveBeenCalled();
      expect(mockOpenMeteoAPI.fetchMarine).not.toHaveBeenCalled();
    });

    it('should fetch from API and cache result on cache miss', async () => {
      mockCache.get.mockResolvedValue(null);
      mockOpenMeteoAPI.fetchMarine.mockResolvedValue({
        waveHeight: 2.0,
        windSpeed: 15,
        windDirection: 180,
        seaState: 'Moderate',
      });

      const result = await weatherService.fetchMarineWeather(params);

      expect(result.waveHeight).toBe(2.0);
      expect(mockOpenMeteoAPI.fetchMarine).toHaveBeenCalledWith({
        latitude: params.latitude,
        longitude: params.longitude,
        date: params.date,
      });
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining('fuelsense:weather:'),
        expect.any(Object),
        900 // 15 minutes
      );
    });

    it('should use rounded coordinates for cache key', async () => {
      mockCache.get.mockResolvedValue(null);
      mockOpenMeteoAPI.fetchMarine.mockResolvedValue({
        waveHeight: 2.0,
        windSpeed: 15,
        windDirection: 180,
        seaState: 'Moderate',
      });

      await weatherService.fetchMarineWeather({
        latitude: 1.2897,
        longitude: 103.8501,
        date: new Date('2025-01-26T12:00:00Z'),
      });

      // Cache key should use rounded coordinates
      const cacheCall = mockCache.set.mock.calls[0];
      expect(cacheCall[0]).toContain('fuelsense:weather:1,104:');
    });
  });

  describe('calculateWeatherImpact', () => {
    it('should return multiplier 1.0 for calm conditions', async () => {
      const calmWeather: MarineWeather = {
        waveHeight: 1.0,
        windSpeed: 10,
        windDirection: 180,
        seaState: 'Slight',
        datetime: new Date(),
      };

      const result = await weatherService.calculateWeatherImpact({
        weather: calmWeather,
        vesselType: 'Container Ship',
        speed: 14,
      });

      expect(result.multiplier).toBeCloseTo(1.0, 2);
      expect(result.safetyRating).toBe('safe');
    });

    it('should apply wave height multiplier for rough conditions', async () => {
      const roughWeather: MarineWeather = {
        waveHeight: 4.0, // 3-5m range
        windSpeed: 10,
        windDirection: 180,
        seaState: 'Rough',
        datetime: new Date(),
      };

      const result = await weatherService.calculateWeatherImpact({
        weather: roughWeather,
        vesselType: 'Container Ship',
        speed: 14,
      });

      expect(result.multiplier).toBeCloseTo(1.15, 2); // Wave height multiplier
      expect(result.safetyRating).toBe('caution');
    });

    it('should apply multiple multipliers for severe conditions', async () => {
      const severeWeather: MarineWeather = {
        waveHeight: 6.0, // >5m
        windSpeed: 25, // >20 knots
        windDirection: 180,
        seaState: 'High',
        datetime: new Date(),
      };

      const result = await weatherService.calculateWeatherImpact({
        weather: severeWeather,
        vesselType: 'Container Ship',
        speed: 14,
      });

      // Wave height: 1.3, Wind speed: 1.1, High wind: 1.05
      expect(result.multiplier).toBeGreaterThan(1.3);
      expect(result.safetyRating).toBe('unsafe');
    });

    it('should return appropriate recommendation', async () => {
      const unsafeWeather: MarineWeather = {
        waveHeight: 6.0,
        windSpeed: 35,
        windDirection: 180,
        seaState: 'High',
        datetime: new Date(),
      };

      const result = await weatherService.calculateWeatherImpact({
        weather: unsafeWeather,
        vesselType: 'Container Ship',
        speed: 14,
      });

      expect(result.recommendation).toContain('Severe weather');
    });
  });

  describe('checkPortWeatherSafety', () => {
    it('should return safe when conditions are favorable', async () => {
      mockPortRepo.findByCode.mockResolvedValue(mockPort);
      mockCache.get.mockResolvedValue(null);
      mockOpenMeteoAPI.fetchMarine.mockResolvedValue({
        waveHeight: 1.5,
        windSpeed: 15,
        windDirection: 180,
        seaState: 'Moderate',
      });

      const result = await weatherService.checkPortWeatherSafety({
        portCode: 'SGSIN',
        date: new Date('2025-01-26T12:00:00Z'),
      });

      expect(result.isSafe).toBe(true);
      expect(result.restrictions).toEqual([]);
      expect(result.recommendation).toContain('suitable for bunkering');
    });

    it('should return unsafe when wave height is too high', async () => {
      mockPortRepo.findByCode.mockResolvedValue(mockPort);
      mockCache.get.mockResolvedValue(null);
      mockOpenMeteoAPI.fetchMarine.mockResolvedValue({
        waveHeight: 3.0, // >= 2.5m
        windSpeed: 15,
        windDirection: 180,
        seaState: 'Rough',
      });

      const result = await weatherService.checkPortWeatherSafety({
        portCode: 'SGSIN',
        date: new Date('2025-01-26T12:00:00Z'),
      });

      expect(result.isSafe).toBe(false);
      expect(result.restrictions).toContain('High waves');
    });

    it('should return unsafe when wind speed is too high', async () => {
      mockPortRepo.findByCode.mockResolvedValue(mockPort);
      mockCache.get.mockResolvedValue(null);
      mockOpenMeteoAPI.fetchMarine.mockResolvedValue({
        waveHeight: 1.5,
        windSpeed: 30, // >= 25 knots
        windDirection: 180,
        seaState: 'Moderate',
      });

      const result = await weatherService.checkPortWeatherSafety({
        portCode: 'SGSIN',
        date: new Date('2025-01-26T12:00:00Z'),
      });

      expect(result.isSafe).toBe(false);
      expect(result.restrictions).toContain('Strong winds');
    });

    it('should throw error when port not found', async () => {
      mockPortRepo.findByCode.mockResolvedValue(null);

      await expect(
        weatherService.checkPortWeatherSafety({
          portCode: 'INVALID',
          date: new Date('2025-01-26T12:00:00Z'),
        })
      ).rejects.toThrow('Port INVALID not found');
    });
  });

  describe('error handling', () => {
    it('should handle cache errors gracefully', async () => {
      mockCache.get.mockRejectedValue(new Error('Cache error'));
      mockOpenMeteoAPI.fetchMarine.mockResolvedValue({
        waveHeight: 2.0,
        windSpeed: 15,
        windDirection: 180,
        seaState: 'Moderate',
      });

      const result = await weatherService.fetchMarineWeather({
        latitude: 1.2897,
        longitude: 103.8501,
        date: new Date('2025-01-26T12:00:00Z'),
      });

      expect(result).toBeDefined();
    });

    it('should handle API errors', async () => {
      mockCache.get.mockResolvedValue(null);
      mockOpenMeteoAPI.fetchMarine.mockRejectedValue(new Error('API error'));

      await expect(
        weatherService.fetchMarineWeather({
          latitude: 1.2897,
          longitude: 103.8501,
          date: new Date('2025-01-26T12:00:00Z'),
        })
      ).rejects.toThrow();
    });
  });
});
