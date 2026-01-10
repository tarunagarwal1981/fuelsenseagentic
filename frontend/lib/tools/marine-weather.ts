/**
 * Marine Weather Tool
 * 
 * Fetches marine weather forecast from Open-Meteo API for vessel positions.
 * This tool provides wave height, wind speed, wind direction, and sea state
 * classifications for maritime route planning and safety assessment.
 * 
 * The tool:
 * - Fetches weather data from Open-Meteo Marine API
 * - Batches API calls by grouping positions into 6-hour windows
 * - Converts wind speed from m/s to knots
 * - Classifies sea state based on wave height
 * - Handles forecast confidence (high for 0-16 days, medium for 16+ days)
 * - Implements retry logic with exponential backoff
 */

import { z } from 'zod';
import { Coordinates } from '@/lib/types';
import { getCachedWeather, cacheWeather } from '@/lib/multi-agent/optimizations';

// Circuit breaker constants
const MAX_CONSECUTIVE_FAILURES = 5;
const CIRCUIT_BREAKER_THRESHOLD = 0.5; // 50% failure rate

/**
 * Input position for weather forecast
 */
export interface WeatherPosition {
  /** Latitude in decimal degrees */
  lat: number;
  /** Longitude in decimal degrees */
  lon: number;
  /** Datetime in ISO 8601 format */
  datetime: string;
}

/**
 * Input parameters for marine weather forecast
 */
export interface MarineWeatherInput {
  /** Array of positions with coordinates and datetime */
  positions: WeatherPosition[];
}

/**
 * Weather data for a specific position
 */
export interface WeatherData {
  /** Wave height in meters */
  wave_height_m: number;
  /** Wind speed in knots */
  wind_speed_knots: number;
  /** Wind direction in degrees (0-360) */
  wind_direction_deg: number;
  /** Sea state classification */
  sea_state: string;
}

/**
 * Output for a specific position
 */
export interface MarineWeatherOutput {
  /** Position coordinates */
  position: Coordinates;
  /** Datetime for this forecast */
  datetime: string;
  /** Weather data */
  weather: WeatherData;
  /** Forecast confidence level */
  forecast_confidence: 'high' | 'medium' | 'low';
}

/**
 * Zod schema for input validation
 */
export const marineWeatherInputSchema = z.object({
  positions: z
    .array(
      z.object({
        lat: z
          .number()
          .min(-90, 'Latitude must be between -90 and 90')
          .max(90, 'Latitude must be between -90 and 90'),
        lon: z
          .number()
          .min(-180, 'Longitude must be between -180 and 180')
          .max(180, 'Longitude must be between -180 and 180'),
        datetime: z
          .string()
          .datetime('Datetime must be in ISO 8601 format'),
      })
    )
    .min(1, 'At least one position is required')
    .describe('Array of positions with coordinates and datetime'),
});

/**
 * Open-Meteo API response structure
 */
interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  hourly_units: {
    time: string;
    wave_height: string;
    wind_speed_10m: string;
    wind_direction_10m: string;
  };
  hourly: {
    time: string[];
    wave_height: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
  };
}

/**
 * Error class for marine weather forecast failures
 */
export class MarineWeatherError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'MarineWeatherError';
  }
}

/**
 * Sea state classification based on wave height
 * 
 * @param waveHeightM - Wave height in meters
 * @returns Sea state classification string
 */
function classifySeaState(waveHeightM: number): string {
  if (waveHeightM < 0.5) {
    return 'Calm';
  } else if (waveHeightM < 1.25) {
    return 'Slight';
  } else if (waveHeightM < 2.5) {
    return 'Moderate';
  } else if (waveHeightM < 4.0) {
    return 'Rough';
  } else if (waveHeightM < 6.0) {
    return 'Very Rough';
  } else {
    return 'High';
  }
}

/**
 * Converts wind speed from m/s to knots
 * 
 * @param windSpeedMs - Wind speed in meters per second
 * @returns Wind speed in knots
 */
function convertToKnots(windSpeedMs: number): number {
  return windSpeedMs * 1.944;
}

/**
 * Calculates days from a reference datetime
 * 
 * @param datetime - ISO 8601 datetime string
 * @param referenceDatetime - Reference datetime (default: now)
 * @returns Number of days (can be negative if in the past)
 */
function daysFromReference(
  datetime: string,
  referenceDatetime: string = new Date().toISOString()
): number {
  const date = new Date(datetime);
  const reference = new Date(referenceDatetime);
  const diffMs = date.getTime() - reference.getTime();
  return diffMs / (1000 * 60 * 60 * 24);
}

/**
 * Groups positions into 6-hour time windows for batch API calls
 * 
 * @param positions - Array of positions to group
 * @returns Map of grouped positions by location and time window
 */
function groupPositionsByTimeWindow(
  positions: WeatherPosition[]
): Map<string, WeatherPosition[]> {
  const groups = new Map<string, WeatherPosition[]>();

  for (const position of positions) {
    const date = new Date(position.datetime);
    // Round down to nearest 6-hour window
    const hours = date.getUTCHours();
    const windowHour = Math.floor(hours / 6) * 6;
    const windowDate = new Date(date);
    windowDate.setUTCHours(windowHour, 0, 0, 0);

    // Create key: lat,lon,windowTime
    const key = `${position.lat.toFixed(2)},${position.lon.toFixed(2)},${windowDate.toISOString()}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(position);
  }

  return groups;
}

/**
 * Sleeps for a specified number of milliseconds
 * 
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls Open-Meteo Marine API with retry logic and exponential backoff
 * 
 * @param lat - Latitude
 * @param lon - Longitude
 * @param targetDatetime - Target datetime for forecast
 * @param retries - Number of retry attempts (default: 2)
 * @returns Weather data from API
 */
async function callOpenMeteoApiWithRetry(
  lat: number,
  lon: number,
  targetDatetime: string,
  retries: number = 2,
  stats?: { apiCalls: number; retries: number; failures: number }
): Promise<OpenMeteoResponse> {
  const baseUrl = 'https://marine-api.open-meteo.com/v1/marine';
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    hourly: 'wave_height,wind_speed_10m,wind_direction_10m',
    forecast_days: '16',
    timezone: 'UTC',
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Track API call
      if (stats && attempt === 0) {
        stats.apiCalls++;
      }
      
      const response = await fetch(`${baseUrl}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new MarineWeatherError(
          `Open-Meteo API error: ${response.status} ${response.statusText} - ${errorText}`,
          'API_ERROR',
          response.status
        );
      }

      const data = await response.json() as OpenMeteoResponse;

      // Validate response structure
      if (!data || !data.hourly) {
        throw new MarineWeatherError(
          'Invalid response format: missing hourly data',
          'INVALID_RESPONSE'
        );
      }

      if (
        !Array.isArray(data.hourly.time) ||
        !Array.isArray(data.hourly.wave_height) ||
        !Array.isArray(data.hourly.wind_speed_10m) ||
        !Array.isArray(data.hourly.wind_direction_10m)
      ) {
        throw new MarineWeatherError(
          'Invalid response format: missing required hourly arrays',
          'INVALID_RESPONSE'
        );
      }

      return data;
    } catch (error) {
      lastError = error as Error;

      // Don't retry on validation errors
      if (error instanceof MarineWeatherError && error.code === 'INVALID_RESPONSE') {
        if (stats) {
          stats.failures++;
        }
        throw error;
      }

      // Exponential backoff: wait 500ms, 1000ms, etc.
      if (attempt < retries - 1) {
        if (stats) {
          stats.retries++;
        }
        const backoffMs = Math.pow(2, attempt) * 500;
        console.log(`⏳ [WEATHER] Retry attempt ${attempt + 1} of ${retries}, waiting ${backoffMs}ms before retry...`);
        await sleep(backoffMs);
      }
    }
  }

  // All retries failed
  if (stats) {
    stats.failures++;
  }

  // All retries failed
  if (lastError instanceof MarineWeatherError) {
    throw lastError;
  }

  throw new MarineWeatherError(
    `Failed to fetch weather data after ${retries} attempts: ${lastError?.message || 'Unknown error'}`,
    'RETRY_EXHAUSTED'
  );
}

/**
 * Gets weather data for a specific datetime from API response
 * 
 * @param apiResponse - API response data
 * @param targetDatetime - Target datetime to find
 * @returns Weather data for the target datetime, or null if not found
 */
function getWeatherForDatetime(
  apiResponse: OpenMeteoResponse,
  targetDatetime: string
): { wave_height: number; wind_speed: number; wind_direction: number } | null {
  const targetDate = new Date(targetDatetime);
  const times = apiResponse.hourly.time;

  // Find closest time match (within 1 hour)
  for (let i = 0; i < times.length; i++) {
    const timeDate = new Date(times[i]);
    const diffHours = Math.abs(
      (targetDate.getTime() - timeDate.getTime()) / (1000 * 60 * 60)
    );

    if (diffHours <= 1) {
      return {
        wave_height: apiResponse.hourly.wave_height[i] ?? 0,
        wind_speed: apiResponse.hourly.wind_speed_10m[i] ?? 0,
        wind_direction: apiResponse.hourly.wind_direction_10m[i] ?? 0,
      };
    }
  }

  return null;
}

/**
 * Validate and sanitize weather data
 * Returns validated data with quality flags
 */
interface WeatherDataQuality {
  data: WeatherData;
  confidence: 'high' | 'medium' | 'low' | 'unavailable';
  issues: string[];
  warnings: string[];
}

function validateWeatherData(rawData: WeatherData): WeatherDataQuality {
  const issues: string[] = [];
  const warnings: string[] = [];
  let confidence: 'high' | 'medium' | 'low' | 'unavailable' = 'high';
  
  const validatedData = { ...rawData };
  
  // Validate wind speed
  if (
    validatedData.wind_speed_knots === null || 
    validatedData.wind_speed_knots === undefined || 
    validatedData.wind_speed_knots === 0
  ) {
    issues.push('Wind speed data unavailable');
    validatedData.wind_speed_knots = 0;
    confidence = 'medium';
  } else if (validatedData.wind_speed_knots < 0 || validatedData.wind_speed_knots > 100) {
    issues.push(`Unrealistic wind speed: ${validatedData.wind_speed_knots} kts`);
    validatedData.wind_speed_knots = 0;
    confidence = 'low';
  }
  
  // Validate wave height
  if (
    validatedData.wave_height_m === null || 
    validatedData.wave_height_m === undefined || 
    validatedData.wave_height_m < 0
  ) {
    issues.push('Wave height data unavailable');
    validatedData.wave_height_m = 0;
    confidence = 'medium';
  } else if (validatedData.wave_height_m > 20) {
    issues.push(`Unrealistic wave height: ${validatedData.wave_height_m}m`);
    validatedData.wave_height_m = 0;
    confidence = 'low';
  }
  
  // Validate wind direction
  if (validatedData.wind_direction_deg !== null && validatedData.wind_direction_deg !== undefined) {
    if (validatedData.wind_direction_deg < 0 || validatedData.wind_direction_deg > 360) {
      warnings.push(`Unusual wind direction: ${validatedData.wind_direction_deg}°`);
      confidence = 'medium';
    }
  }
  
  // Overall confidence assessment
  if (issues.length >= 2) {
    confidence = 'low';
  }
  
  if (issues.length >= 3 || (validatedData.wind_speed_knots === 0 && validatedData.wave_height_m === 0)) {
    confidence = 'unavailable';
  }
  
  return {
    data: validatedData,
    confidence,
    issues,
    warnings
  };
}

/**
 * Estimate typical weather conditions when actual data unavailable
 * Based on season, location, and historical patterns
 */
function estimateWeatherConditions(
  latitude: number,
  longitude: number,
  date: Date
): WeatherData {
  // Get month for seasonal patterns
  const month = date.getMonth(); // 0-11
  
  // Determine region
  const region = getRegion(latitude, longitude);
  
  // Seasonal patterns (simplified)
  const seasonalPatterns: Record<string, any> = {
    'indian_ocean': {
      monsoon_months: [5, 6, 7, 8, 9], // June-October
      typical_wind: 15,
      typical_waves: 2.0,
      monsoon_wind: 25,
      monsoon_waves: 3.5
    },
    'north_atlantic': {
      winter_months: [11, 0, 1, 2], // Dec-Mar
      typical_wind: 18,
      typical_waves: 2.5,
      winter_wind: 30,
      winter_waves: 4.0
    },
    'mediterranean': {
      typical_wind: 12,
      typical_waves: 1.5
    },
    'south_china_sea': {
      typhoon_months: [6, 7, 8, 9], // July-October
      typical_wind: 14,
      typical_waves: 1.8,
      typhoon_wind: 35,
      typhoon_waves: 5.0
    },
    'default': {
      typical_wind: 15,
      typical_waves: 2.0
    }
  };
  
  const pattern = seasonalPatterns[region] || seasonalPatterns.default;
  
  // Check if in severe season
  const isSevereSeason = 
    (region === 'indian_ocean' && pattern.monsoon_months?.includes(month)) ||
    (region === 'north_atlantic' && pattern.winter_months?.includes(month)) ||
    (region === 'south_china_sea' && pattern.typhoon_months?.includes(month));
  
  const windSpeed = isSevereSeason 
    ? (pattern.monsoon_wind || pattern.winter_wind || pattern.typhoon_wind || pattern.typical_wind)
    : pattern.typical_wind;
  
  const waveHeight = isSevereSeason 
    ? (pattern.monsoon_waves || pattern.winter_waves || pattern.typhoon_waves || pattern.typical_waves)
    : pattern.typical_waves;
  
  return {
    wind_speed_knots: windSpeed,
    wave_height_m: waveHeight,
    wind_direction_deg: Math.random() * 360,
    sea_state: classifySeaState(waveHeight),
  };
}

/**
 * Determine region based on latitude and longitude
 */
function getRegion(lat: number, lon: number): string {
  // Simplified region detection
  if (lat >= 0 && lat <= 30 && lon >= 40 && lon <= 100) return 'indian_ocean';
  if (lat >= 30 && lat <= 70 && lon >= -80 && lon <= 0) return 'north_atlantic';
  if (lat >= 30 && lat <= 45 && lon >= -5 && lon <= 40) return 'mediterranean';
  if (lat >= 0 && lat <= 30 && lon >= 100 && lon <= 140) return 'south_china_sea';
  return 'default';
}

/**
 * Generates historical estimate for positions beyond 16 days
 * Uses monthly averages with safety margin
 * 
 * @param lat - Latitude
 * @param lon - Longitude
 * @param datetime - Target datetime
 * @returns Estimated weather data
 */
function generateHistoricalEstimate(
  lat: number,
  lon: number,
  datetime: string
): WeatherData {
  // Simple estimation based on location and season
  // In a real implementation, this would use historical climate data
  
  // Base values vary by latitude (tropical vs temperate)
  const absLat = Math.abs(lat);
  let baseWaveHeight = 1.5; // meters
  let baseWindSpeed = 8; // m/s

  // Adjust for latitude zones
  if (absLat < 10) {
    // Tropical: generally calmer
    baseWaveHeight = 1.0;
    baseWindSpeed = 6;
  } else if (absLat > 40) {
    // High latitude: generally rougher
    baseWaveHeight = 2.5;
    baseWindSpeed = 12;
  }

  // Add seasonal variation (simplified)
  const month = new Date(datetime).getUTCMonth();
  const isWinter = month >= 10 || month <= 2; // Nov-Feb in Northern Hemisphere
  if (isWinter && lat > 0) {
    baseWaveHeight *= 1.3;
    baseWindSpeed *= 1.2;
  }

  // Add 20% safety margin to wave height
  const waveHeight = baseWaveHeight * 1.2;
  const windSpeedMs = baseWindSpeed;
  const windDirection = Math.random() * 360; // Random direction for estimate

  return {
    wave_height_m: waveHeight,
    wind_speed_knots: convertToKnots(windSpeedMs),
    wind_direction_deg: windDirection,
    sea_state: classifySeaState(waveHeight),
  };
}

/**
 * Main execute function for marine weather forecast
 * 
 * This function:
 * 1. Validates input parameters using Zod
 * 2. Groups positions by 6-hour time windows
 * 3. Fetches weather data from Open-Meteo API
 * 4. Handles positions beyond 16 days with historical estimates
 * 5. Converts units and classifies sea state
 * 6. Returns weather data for all positions
 * 
 * @param input - Marine weather forecast parameters
 * @returns Array of weather forecasts for each position
 * @throws MarineWeatherError - If validation fails or API calls fail
 */
export async function fetchMarineWeather(
  input: MarineWeatherInput
): Promise<MarineWeatherOutput[]> {
  // Validate input using Zod schema
  const validatedInput = marineWeatherInputSchema.parse(input);

  const { positions } = validatedInput;

  // Handle edge case: empty positions (shouldn't happen due to validation)
  if (positions.length === 0) {
    return [];
  }

  // Sample positions intelligently to reduce API load
  const sampledPositions = samplePositions(positions, 50);

  // Get reference datetime (use current time to determine forecast days)
  const referenceDatetime = new Date().toISOString();

  // Group positions by 6-hour windows
  const groupedPositions = groupPositionsByTimeWindow(sampledPositions);

  // Cache for API responses (key: lat,lon) - per-request cache
  const apiCache = new Map<string, OpenMeteoResponse>();

  const results: MarineWeatherOutput[] = [];

  /**
   * Process a single position to get weather data
   * This function is designed to be called in parallel batches
   */
  async function processPosition(
    position: WeatherPosition,
    stats: { apiCalls: number; cacheHits: number; retries: number; failures: number }
  ): Promise<MarineWeatherOutput> {
    const daysFromRef = daysFromReference(position.datetime, referenceDatetime);
    const isBeyond16Days = daysFromRef > 16;

    let weatherData: WeatherData;
    let confidence: 'high' | 'medium' | 'low';

    if (isBeyond16Days) {
      // Use historical estimate for positions beyond 16 days
      weatherData = generateHistoricalEstimate(
        position.lat,
        position.lon,
        position.datetime
      );
      confidence = 'medium';
    } else {
      // Check persistent cache first
      const cachedWeather = getCachedWeather(position.lat, position.lon, position.datetime);
      if (cachedWeather) {
        stats.cacheHits++;
        return {
          position: { lat: position.lat, lon: position.lon },
          datetime: position.datetime,
          weather: cachedWeather,
          forecast_confidence: 'high',
        };
      }

      // Fetch from API
      const cacheKey = `${position.lat.toFixed(2)},${position.lon.toFixed(2)}`;

      let apiResponse: OpenMeteoResponse;
      if (apiCache.has(cacheKey)) {
        stats.cacheHits++;
        apiResponse = apiCache.get(cacheKey)!;
      } else {
        try {
          apiResponse = await callOpenMeteoApiWithRetry(
            position.lat,
            position.lon,
            position.datetime,
            2,
            stats
          );
          apiCache.set(cacheKey, apiResponse);
        } catch (error) {
          // If API call fails, fall back to estimated weather conditions
          console.warn(
            `⚠️ [WEATHER] API call failed for position ${position.lat.toFixed(2)}, ${position.lon.toFixed(2)}, using estimate`
          );
          weatherData = estimateWeatherConditions(
            position.lat,
            position.lon,
            new Date(position.datetime)
          );
          confidence = 'low';
          return {
            position: { lat: position.lat, lon: position.lon },
            datetime: position.datetime,
            weather: weatherData,
            forecast_confidence: confidence,
          };
        }
      }

      // Get weather data for specific datetime
      const hourlyData = getWeatherForDatetime(apiResponse, position.datetime);

      if (!hourlyData) {
        // If exact time not found, use estimated weather conditions
        weatherData = estimateWeatherConditions(
          position.lat,
          position.lon,
          new Date(position.datetime)
        );
        confidence = 'low';
      } else {
        // Convert and classify
        const rawWeatherData: WeatherData = {
          wave_height_m: hourlyData.wave_height,
          wind_speed_knots: convertToKnots(hourlyData.wind_speed),
          wind_direction_deg: hourlyData.wind_direction,
          sea_state: classifySeaState(hourlyData.wave_height),
        };
        
        // Validate weather data
        const validation = validateWeatherData(rawWeatherData);
        
        // Log quality issues
        if (validation.issues.length > 0) {
          console.warn('⚠️ [WEATHER] Data quality issues:', validation.issues);
        }
        
        if (validation.warnings.length > 0) {
          console.warn('⚠️ [WEATHER] Warnings:', validation.warnings);
        }
        
        // If confidence is too low, use estimates
        if (validation.confidence === 'unavailable' || validation.confidence === 'low') {
          console.warn('⚠️ [WEATHER] Low confidence, using estimates');
          
          const estimated = estimateWeatherConditions(
            position.lat,
            position.lon,
            new Date(position.datetime)
          );
          
          weatherData = {
            ...estimated,
            ...validation.data,
          };
          confidence = 'low';
        } else {
          weatherData = validation.data;
          confidence = validation.confidence === 'high' ? 'high' : 'medium';
        }
        
        // Cache the weather data for future requests
        cacheWeather(position.lat, position.lon, position.datetime, weatherData);
      }
    }

    return {
      position: { lat: position.lat, lon: position.lon },
      datetime: position.datetime,
      weather: weatherData,
      forecast_confidence: confidence,
    };
  }

  // Circuit breaker tracking variables (global across all batches)
  let totalAttempts = 0;
  let successfulFetches = 0;
  let circuitBreakerTriggered = false;

  // API call statistics
  const apiStats = {
    apiCalls: 0,
    cacheHits: 0,
    retries: 0,
    failures: 0,
  };

  // Process positions in parallel batches for better performance
  // Batch size of 10 positions per batch, process 3 batches concurrently
  const BATCH_SIZE = 10;
  const CONCURRENT_BATCHES = 3;
  
  const batchStartTime = Date.now();
  console.log(`🌊 [WEATHER] Processing ${sampledPositions.length} positions (sampled from ${positions.length}) in parallel batches (batch size: ${BATCH_SIZE})`);
  
  // Split positions into batches
  const batches: WeatherPosition[][] = [];
  for (let i = 0; i < sampledPositions.length; i += BATCH_SIZE) {
    batches.push(sampledPositions.slice(i, i + BATCH_SIZE));
  }

  // Process batches with controlled concurrency
  let batchNum = 0;
  for (let i = 0; i < batches.length; i += CONCURRENT_BATCHES) {
    // Check circuit breaker before processing next batch
    if (circuitBreakerTriggered) {
      break;
    }

    // Reset consecutive failures counter for each batch group
    let consecutiveFailures = 0;

    const concurrentBatches = batches.slice(i, i + CONCURRENT_BATCHES);
    const batchStart = Date.now();
    batchNum++;
    
    // Process all positions in these batches in parallel
    const batchPromises = concurrentBatches.flatMap(batch =>
      batch.map(async (position) => {
        const result = await processPosition(position, apiStats);
        
        // Track API call success/failure for circuit breaker
        // Only track actual API call attempts (not cached, not beyond 16 days)
        const daysFromRef = daysFromReference(position.datetime, referenceDatetime);
        const isBeyond16Days = daysFromRef > 16;
        const wasPersistentlyCached = getCachedWeather(position.lat, position.lon, position.datetime) !== null;
        
        // Only track actual API call attempts (not cached, not beyond 16 days)
        // Low confidence for non-beyond-16-days positions indicates API failure
        if (!isBeyond16Days && !wasPersistentlyCached) {
          if (result.forecast_confidence === 'high') {
            // API call succeeded (or was in per-request cache, which is also success)
            consecutiveFailures = 0;
            successfulFetches++;
            totalAttempts++;
          } else if (result.forecast_confidence === 'low') {
            // API call failed - track failure
            consecutiveFailures++;
            totalAttempts++;
            
            // Check circuit breaker after each failure
            if (consecutiveFailures > MAX_CONSECUTIVE_FAILURES) {
              const successRate = totalAttempts > 0 ? (successfulFetches / totalAttempts * 100) : 0;
              console.warn('⚠️ [WEATHER] Circuit breaker triggered - too many consecutive failures');
              console.warn(`⚠️ [WEATHER] Success rate: ${successRate.toFixed(1)}% - using fallback estimates`);
              circuitBreakerTriggered = true;
            }
          }
        }
        
        return result;
      })
    );
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    const batchDuration = Date.now() - batchStart;
    console.log(`⏱️ [WEATHER] Batch ${batchNum} completed in ${batchDuration}ms`);
    
    // Break if circuit breaker triggered
    if (circuitBreakerTriggered) {
      break;
    }
    
    // Small delay between concurrent batch groups to avoid overwhelming the API
    if (i + CONCURRENT_BATCHES < batches.length) {
      await sleep(100); // 100ms delay between batch groups
    }
  }

  // If circuit breaker triggered, fill remaining results with estimates
  if (circuitBreakerTriggered && results.length < sampledPositions.length) {
    const remainingPositions = sampledPositions.slice(results.length);
    console.log(`⚠️ [WEATHER] Filling ${remainingPositions.length} remaining positions with fallback estimates`);
    
    for (const position of remainingPositions) {
      const weatherData = generateHistoricalEstimate(
        position.lat,
        position.lon,
        position.datetime
      );
      results.push({
        position: { lat: position.lat, lon: position.lon },
        datetime: position.datetime,
        weather: weatherData,
        forecast_confidence: 'low',
      });
    }
  }

  // Check completion rate for graceful degradation
  const completionRate = results.length / sampledPositions.length;
  console.log(`📊 [WEATHER] Completion rate: ${(completionRate * 100).toFixed(1)}%`);

  if (completionRate < 0.3) {
    throw new MarineWeatherError(
      'Weather data fetch failed - less than 30% coverage',
      'INSUFFICIENT_DATA'
    );
  }

  if (completionRate < 0.8) {
    console.warn('⚠️ [WEATHER] Partial weather data - some positions missing');
  }

  const totalTime = Date.now() - batchStartTime;
  console.log(`⏱️ [WEATHER] Total weather fetch time: ${totalTime}ms`);
  console.log(`📊 [WEATHER] API call statistics: Made ${apiStats.apiCalls} API calls (${apiStats.cacheHits} cached, ${apiStats.retries} retried, ${apiStats.failures} failed)`);
  console.log(`✅ [WEATHER] Completed processing ${results.length} positions`);
  return results;
}

/**
 * Tool schema for Claude (Anthropic SDK)
 * This schema is used to register the tool with Claude so it can be called by the AI agent
 */
export const marineWeatherToolSchema = {
  name: 'fetch_marine_weather',
  description: `Fetch marine weather forecast from Open-Meteo API for vessel positions.
    Returns wave height, wind speed (in knots), wind direction, and sea state classification.
    Batches API calls efficiently by grouping positions into 6-hour time windows.
    Provides high confidence forecasts for 0-16 days, medium confidence for 16+ days using historical estimates.`,
  input_schema: {
    type: 'object',
    properties: {
      positions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            lat: {
              type: 'number',
              description: 'Latitude in decimal degrees',
            },
            lon: {
              type: 'number',
              description: 'Longitude in decimal degrees',
            },
            datetime: {
              type: 'string',
              description: 'Datetime in ISO 8601 format',
            },
          },
          required: ['lat', 'lon', 'datetime'],
        },
        description: 'Array of positions with coordinates and datetime',
      },
    },
    required: ['positions'],
  },
} as const;

/**
 * Samples positions intelligently to reduce API load
 * Always keeps first, last, and evenly distributed middle points
 */
function samplePositions(positions: WeatherPosition[], maxSamples: number = 50): WeatherPosition[] {
  if (positions.length <= maxSamples) return positions;
  
  const sampled: WeatherPosition[] = [];
  
  // Always include first position
  sampled.push(positions[0]);
  
  // Calculate step size for middle positions
  const step = Math.floor((positions.length - 2) / (maxSamples - 2));
  
  // Sample middle positions
  for (let i = step; i < positions.length - 1; i += step) {
    if (sampled.length < maxSamples - 1) {
      sampled.push(positions[i]);
    }
  }
  
  // Always include last position
  sampled.push(positions[positions.length - 1]);
  
  console.log(`📊 [WEATHER] Sampled ${positions.length} positions down to ${sampled.length}`);
  return sampled;
}

/**
 * Tool execution wrapper for Claude
 * This function is called by the agent when the tool is invoked
 */
export async function executeMarineWeatherTool(
  args: unknown
): Promise<MarineWeatherOutput[]> {
  return fetchMarineWeather(args as MarineWeatherInput);
}

