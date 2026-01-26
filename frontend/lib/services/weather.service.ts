/**
 * Weather Service
 * 
 * Provides marine weather fetching and impact analysis functionality.
 * Consolidates business logic from marine-weather.ts and weather-consumption.ts.
 */

import { RedisCache } from '@/lib/repositories/cache-client';
import { OpenMeteoAPIClient } from './open-meteo-api-client';
import { PortRepository } from '@/lib/repositories/port-repository';
import { MarineWeather, WeatherImpact, PortWeatherSafety } from './types';

export class WeatherService {
  constructor(
    private cache: RedisCache,
    private openMeteoAPI: OpenMeteoAPIClient,
    private portRepo: PortRepository
  ) {}

  /**
   * Fetch marine weather for a location and date
   */
  async fetchMarineWeather(params: {
    latitude: number;
    longitude: number;
    date: Date;
  }): Promise<MarineWeather> {
    // Cache key based on rounded coordinates and date
    const roundedLat = Math.round(params.latitude);
    const roundedLon = Math.round(params.longitude);
    const dateStr = params.date.toISOString().split('T')[0];
    const cacheKey = `fuelsense:weather:${roundedLat},${roundedLon}:${dateStr}`;

    // Try cache (15 minute TTL)
    try {
      const cached = await this.cache.get<MarineWeather>(cacheKey);
      if (cached) {
        console.log(`[CACHE HIT] weather:${roundedLat},${roundedLon}:${dateStr}`);
        return cached;
      }
    } catch (error) {
      console.error('[WeatherService] Cache read error:', error);
    }

    // Call Open-Meteo API
    const weatherData = await this.openMeteoAPI.fetchMarine({
      latitude: params.latitude,
      longitude: params.longitude,
      date: params.date,
    });

    const weather: MarineWeather = {
      ...weatherData,
      datetime: params.date,
    };

    // Cache result (15 min TTL)
    try {
      await this.cache.set(cacheKey, weather, 900); // 15 minutes
    } catch (error) {
      console.error('[WeatherService] Cache write error:', error);
    }

    return weather;
  }

  /**
   * Calculate weather impact on fuel consumption
   */
  async calculateWeatherImpact(params: {
    weather: MarineWeather;
    vesselType: string;
    speed: number;
  }): Promise<WeatherImpact> {
    let multiplier = 1.0;

    // Wave height impact
    // 0-3m = 1.0, 3-5m = 1.15, 5+m = 1.3
    if (params.weather.waveHeight > 5) {
      multiplier *= 1.3;
    } else if (params.weather.waveHeight > 3) {
      multiplier *= 1.15;
    }

    // Wind speed impact
    // Strong winds (>20 knots) increase consumption by 10%
    if (params.weather.windSpeed > 20) {
      multiplier *= 1.1;
    }

    // Additional wind impact for headwinds (simplified - would need vessel heading)
    // For now, assume moderate headwind impact if wind speed is high
    if (params.weather.windSpeed > 15) {
      multiplier *= 1.05; // Moderate headwind impact
    }

    return {
      multiplier,
      safetyRating: this.calculateSafetyRating(params.weather),
      recommendation: this.getWeatherRecommendation(params.weather),
    };
  }

  /**
   * Check port weather safety for bunkering operations
   */
  async checkPortWeatherSafety(params: {
    portCode: string;
    date: Date;
  }): Promise<PortWeatherSafety> {
    // Get port from repository (to get coordinates)
    const port = await this.portRepo.findByCode(params.portCode);
    if (!port) {
      throw new Error(`Port ${params.portCode} not found`);
    }

    // Fetch weather at port location
    const weather = await this.fetchMarineWeather({
      latitude: port.coordinates[0],
      longitude: port.coordinates[1],
      date: params.date,
    });

    // Determine safety for bunkering operations
    // Safe conditions: wave height < 2.5m and wind speed < 25 knots
    const isSafe = weather.waveHeight < 2.5 && weather.windSpeed < 25;

    const restrictions: string[] = [];
    if (weather.waveHeight >= 2.5) {
      restrictions.push('High waves');
    }
    if (weather.windSpeed >= 25) {
      restrictions.push('Strong winds');
    }

    const recommendation = isSafe
      ? 'Conditions suitable for bunkering'
      : 'Delay bunkering until conditions improve';

    return {
      portCode: params.portCode,
      date: params.date,
      weather,
      isSafe,
      restrictions,
      recommendation,
    };
  }

  /**
   * Calculate safety rating based on weather conditions
   */
  private calculateSafetyRating(weather: MarineWeather): 'safe' | 'caution' | 'unsafe' {
    // Unsafe: wave height > 5m or wind speed > 30 knots
    if (weather.waveHeight > 5 || weather.windSpeed > 30) {
      return 'unsafe';
    }

    // Caution: wave height > 3m or wind speed > 20 knots
    if (weather.waveHeight > 3 || weather.windSpeed > 20) {
      return 'caution';
    }

    return 'safe';
  }

  /**
   * Get weather recommendation based on conditions
   */
  private getWeatherRecommendation(weather: MarineWeather): string {
    const rating = this.calculateSafetyRating(weather);

    switch (rating) {
      case 'unsafe':
        return 'Severe weather conditions - avoid operations';
      case 'caution':
        return 'Moderate weather conditions - exercise caution';
      case 'safe':
        return 'Favorable weather conditions';
      default:
        return 'Weather conditions acceptable';
    }
  }
}
