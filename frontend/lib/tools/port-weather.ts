/**
 * Port Weather Tool
 * 
 * Checks if bunker ports have safe weather conditions for bunkering operations.
 * This tool fetches weather forecasts for port locations and evaluates whether
 * conditions are suitable for safe bunkering operations.
 * 
 * The tool:
 * - Fetches weather forecasts from Open-Meteo API
 * - Evaluates conditions during the bunkering window
 * - Classifies weather risk and conditions
 * - Optionally finds next safe window if current is unsafe
 */

import { z } from 'zod';
import { Coordinates } from '@/lib/types';

/**
 * Input bunker port information
 */
export interface BunkerPortInput {
  /** Port code (UNLOCODE format) */
  port_code: string;
  /** Port name */
  port_name: string;
  /** Latitude in decimal degrees */
  lat: number;
  /** Longitude in decimal degrees */
  lon: number;
  /** Estimated arrival datetime in ISO 8601 format */
  estimated_arrival: string;
  /** Bunkering duration in hours (optional, defaults to 8) */
  bunkering_duration_hours?: number;
}

/**
 * Input parameters for port weather check
 */
export interface PortWeatherInput {
  /** Array of bunker ports to check */
  bunker_ports: BunkerPortInput[];
}

/**
 * Weather conditions during bunkering window
 */
export interface WeatherDuringBunkering {
  /** Arrival time */
  arrival_time: string;
  /** Bunkering window duration in hours */
  bunkering_window_hours: number;
  /** Average wave height in meters */
  avg_wave_height_m: number;
  /** Maximum wave height in meters */
  max_wave_height_m: number;
  /** Average wind speed in knots */
  avg_wind_speed_kt: number;
  /** Maximum wind speed in knots */
  max_wind_speed_kt: number;
  /** Conditions classification */
  conditions: string;
}

/**
 * Next good window for bunkering
 */
export interface NextGoodWindow {
  /** Window start datetime */
  starts_at: string;
  /** Window duration in hours */
  duration_hours: number;
}

/**
 * Output for a bunker port
 */
export interface PortWeatherOutput {
  /** Port code */
  port_code: string;
  /** Port name */
  port_name: string;
  /** Whether bunkering is feasible */
  bunkering_feasible: boolean;
  /** Weather risk level */
  weather_risk: 'Low' | 'Medium' | 'High';
  /** Weather conditions during bunkering */
  weather_during_bunkering: WeatherDuringBunkering;
  /** Human-readable recommendation */
  recommendation: string;
  /** Optional next good window if current is unsafe */
  next_good_window?: NextGoodWindow;
}

/**
 * Zod schema for input validation
 */
export const portWeatherInputSchema = z.object({
  bunker_ports: z
    .array(
      z.object({
        port_code: z.string().min(1, 'Port code is required'),
        port_name: z.string().min(1, 'Port name is required'),
        lat: z
          .number()
          .min(-90, 'Latitude must be between -90 and 90')
          .max(90, 'Latitude must be between -90 and 90'),
        lon: z
          .number()
          .min(-180, 'Longitude must be between -180 and 180')
          .max(180, 'Longitude must be between -180 and 180'),
        estimated_arrival: z
          .string()
          .datetime('Estimated arrival must be in ISO 8601 format'),
        bunkering_duration_hours: z
          .number()
          .positive('Bunkering duration must be positive')
          .max(48, 'Bunkering duration cannot exceed 48 hours')
          .optional()
          .default(8),
      })
    )
    .min(1, 'At least one bunker port is required'),
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
 * Error class for port weather check failures
 */
export class PortWeatherError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'PortWeatherError';
  }
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
 * Calls Open-Meteo Marine API with retry logic
 * 
 * @param lat - Latitude
 * @param lon - Longitude
 * @param retries - Number of retry attempts (default: 3)
 * @returns Weather data from API
 */
async function callOpenMeteoApi(
  lat: number,
  lon: number,
  retries: number = 3
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
      const response = await fetch(`${baseUrl}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new PortWeatherError(
          `Open-Meteo API error: ${response.status} ${response.statusText} - ${errorText}`,
          'API_ERROR',
          response.status
        );
      }

      const data = await response.json() as OpenMeteoResponse;

      // Validate response structure
      if (!data || !data.hourly) {
        throw new PortWeatherError(
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
        throw new PortWeatherError(
          'Invalid response format: missing required hourly arrays',
          'INVALID_RESPONSE'
        );
      }

      return data;
    } catch (error) {
      lastError = error as Error;

      // Don't retry on validation errors
      if (error instanceof PortWeatherError && error.code === 'INVALID_RESPONSE') {
        throw error;
      }

      // Exponential backoff: wait 1s, 2s, 4s
      if (attempt < retries - 1) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        await sleep(backoffMs);
      }
    }
  }

  // All retries failed
  if (lastError instanceof PortWeatherError) {
    throw lastError;
  }

  throw new PortWeatherError(
    `Failed to fetch weather data after ${retries} attempts: ${lastError?.message || 'Unknown error'}`,
    'RETRY_EXHAUSTED'
  );
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
 * Gets weather data for a time range from API response
 * 
 * @param apiResponse - API response data
 * @param startTime - Start datetime (ISO 8601)
 * @param endTime - End datetime (ISO 8601)
 * @returns Array of weather data points in the time range
 */
function getWeatherForTimeRange(
  apiResponse: OpenMeteoResponse,
  startTime: string,
  endTime: string
): Array<{ time: string; wave_height: number; wind_speed: number }> {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const times = apiResponse.hourly.time;
  const weatherData: Array<{ time: string; wave_height: number; wind_speed: number }> = [];

  for (let i = 0; i < times.length; i++) {
    const timeDate = new Date(times[i]);
    if (timeDate >= start && timeDate <= end) {
      weatherData.push({
        time: times[i],
        wave_height: apiResponse.hourly.wave_height[i] ?? 0,
        wind_speed: convertToKnots(apiResponse.hourly.wind_speed_10m[i] ?? 0),
      });
    }
  }

  return weatherData;
}

/**
 * Classifies weather conditions
 * 
 * @param avgWaveHeight - Average wave height in meters
 * @param maxWaveHeight - Maximum wave height in meters
 * @param avgWindSpeed - Average wind speed in knots
 * @param maxWindSpeed - Maximum wind speed in knots
 * @returns Conditions classification
 */
function classifyConditions(
  avgWaveHeight: number,
  maxWaveHeight: number,
  avgWindSpeed: number,
  maxWindSpeed: number
): string {
  // Check if unsafe (exceeds limits)
  if (maxWaveHeight > 1.5 || maxWindSpeed > 25) {
    return 'Unsafe';
  }

  // Check for excellent conditions
  if (avgWaveHeight < 0.8 && avgWindSpeed < 15) {
    return 'Excellent';
  }

  // Check for good conditions
  if (avgWaveHeight < 1.2 && avgWindSpeed < 20) {
    return 'Good';
  }

  // Check for marginal conditions
  if (avgWaveHeight <= 1.5 && avgWindSpeed <= 25) {
    return 'Marginal';
  }

  // Should not reach here, but return unsafe as fallback
  return 'Unsafe';
}

/**
 * Classifies weather risk level
 * 
 * @param maxWaveHeight - Maximum wave height in meters
 * @param maxWindSpeed - Maximum wind speed in knots
 * @returns Risk level
 */
function classifyRisk(
  maxWaveHeight: number,
  maxWindSpeed: number
): 'Low' | 'Medium' | 'High' {
  // High risk: exceeds limits
  if (maxWaveHeight > 1.5 || maxWindSpeed > 25) {
    return 'High';
  }

  // Medium risk: approaching limits
  if (maxWaveHeight >= 1.2 || maxWindSpeed >= 20) {
    return 'Medium';
  }

  // Low risk: well within limits
  return 'Low';
}

/**
 * Finds next good window for bunkering
 * 
 * @param apiResponse - API response data
 * @param startSearchTime - Time to start searching from (ISO 8601)
 * @param durationHours - Required window duration in hours
 * @param maxSearchHours - Maximum hours to search ahead (default: 48)
 * @returns Next good window or undefined if not found
 */
function findNextGoodWindow(
  apiResponse: OpenMeteoResponse,
  startSearchTime: string,
  durationHours: number,
  maxSearchHours: number = 48
): NextGoodWindow | undefined {
  const start = new Date(startSearchTime);
  const endSearch = new Date(start);
  endSearch.setHours(endSearch.getHours() + maxSearchHours);

  const times = apiResponse.hourly.time;
  const maxWaveHeight = 1.5;
  const maxWindSpeed = 25;

  // Search for a window where all conditions are safe
  for (let i = 0; i < times.length; i++) {
    const windowStart = new Date(times[i]);
    if (windowStart < start) continue;
    if (windowStart > endSearch) break;

    // Check if we have enough data points for the required duration
    const requiredPoints = Math.ceil(durationHours);
    if (i + requiredPoints >= times.length) break;

    // Check all hours in this window
    let allSafe = true;
    for (let j = 0; j < requiredPoints; j++) {
      const idx = i + j;
      if (idx >= times.length) {
        allSafe = false;
        break;
      }

      const waveHeight = apiResponse.hourly.wave_height[idx] ?? 0;
      const windSpeed = convertToKnots(apiResponse.hourly.wind_speed_10m[idx] ?? 0);

      if (waveHeight > maxWaveHeight || windSpeed > maxWindSpeed) {
        allSafe = false;
        break;
      }
    }

    if (allSafe) {
      return {
        starts_at: times[i],
        duration_hours: durationHours,
      };
    }
  }

  return undefined;
}

/**
 * Main execute function for port weather check
 * 
 * This function:
 * 1. Validates input parameters using Zod
 * 2. Fetches weather forecasts from Open-Meteo API
 * 3. Evaluates conditions during bunkering window
 * 4. Classifies risk and conditions
 * 5. Optionally finds next good window if current is unsafe
 * 6. Returns comprehensive port weather analysis
 * 
 * @param input - Port weather check parameters
 * @returns Array of port weather analyses
 * @throws PortWeatherError - If validation fails or API calls fail
 */
export async function checkPortWeather(
  input: PortWeatherInput
): Promise<PortWeatherOutput[]> {
  // Validate input using Zod schema
  const validatedInput = portWeatherInputSchema.parse(input);

  const { bunker_ports } = validatedInput;

  // Handle edge case: empty ports (shouldn't happen due to validation)
  if (bunker_ports.length === 0) {
    return [];
  }

  const results: PortWeatherOutput[] = [];

  // Process each port
  for (const port of bunker_ports) {
    const {
      port_code,
      port_name,
      lat,
      lon,
      estimated_arrival,
      bunkering_duration_hours = 8,
    } = port;

    try {
      // Fetch weather forecast
      const apiResponse = await callOpenMeteoApi(lat, lon);

      // Calculate bunkering window
      const arrivalTime = new Date(estimated_arrival);
      const endTime = new Date(arrivalTime);
      endTime.setHours(endTime.getHours() + bunkering_duration_hours);

      // Get weather data for bunkering window
      const windowWeather = getWeatherForTimeRange(
        apiResponse,
        arrivalTime.toISOString(),
        endTime.toISOString()
      );

      // If no data in window, use closest available data
      let weatherData = windowWeather;
      if (weatherData.length === 0) {
        // Find closest time point
        const arrivalTimestamp = arrivalTime.getTime();
        let closestIdx = 0;
        let minDiff = Infinity;

        for (let i = 0; i < apiResponse.hourly.time.length; i++) {
          const timeDate = new Date(apiResponse.hourly.time[i]);
          const diff = Math.abs(timeDate.getTime() - arrivalTimestamp);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = i;
          }
        }

        weatherData = [
          {
            time: apiResponse.hourly.time[closestIdx],
            wave_height: apiResponse.hourly.wave_height[closestIdx] ?? 0,
            wind_speed: convertToKnots(apiResponse.hourly.wind_speed_10m[closestIdx] ?? 0),
          },
        ];
      }

      // Calculate statistics
      const waveHeights = weatherData.map((d) => d.wave_height);
      const windSpeeds = weatherData.map((d) => d.wind_speed);

      const avgWaveHeight =
        waveHeights.reduce((sum, h) => sum + h, 0) / waveHeights.length;
      const maxWaveHeight = Math.max(...waveHeights);
      const avgWindSpeed =
        windSpeeds.reduce((sum, s) => sum + s, 0) / windSpeeds.length;
      const maxWindSpeed = Math.max(...windSpeeds);

      // Classify conditions and risk
      const conditions = classifyConditions(
        avgWaveHeight,
        maxWaveHeight,
        avgWindSpeed,
        maxWindSpeed
      );
      const risk = classifyRisk(maxWaveHeight, maxWindSpeed);

      // Determine feasibility (both limits must be satisfied)
      const bunkeringFeasible = maxWaveHeight <= 1.5 && maxWindSpeed <= 25;

      // Generate recommendation
      let recommendation = '';
      if (bunkeringFeasible) {
        if (conditions === 'Excellent') {
          recommendation = `Excellent conditions for bunkering. Safe to proceed.`;
        } else if (conditions === 'Good') {
          recommendation = `Good conditions for bunkering. Safe to proceed.`;
        } else {
          recommendation = `Marginal conditions. Bunkering is feasible but monitor conditions closely.`;
        }
      } else {
        recommendation = `Unsafe conditions detected. Bunkering not recommended. Max wave height: ${maxWaveHeight.toFixed(2)}m (limit: 1.5m), Max wind speed: ${maxWindSpeed.toFixed(1)}kt (limit: 25kt).`;
      }

      // Find next good window if current is unsafe
      let nextGoodWindow: NextGoodWindow | undefined;
      if (!bunkeringFeasible) {
        nextGoodWindow = findNextGoodWindow(
          apiResponse,
          estimated_arrival,
          bunkering_duration_hours
        );
        if (nextGoodWindow) {
          recommendation += ` Next safe window available starting ${new Date(nextGoodWindow.starts_at).toLocaleString()}.`;
        } else {
          recommendation += ` No safe window found in next 48 hours.`;
        }
      }

      results.push({
        port_code,
        port_name,
        bunkering_feasible: bunkeringFeasible,
        weather_risk: risk,
        weather_during_bunkering: {
          arrival_time: estimated_arrival,
          bunkering_window_hours: bunkering_duration_hours,
          avg_wave_height_m: avgWaveHeight,
          max_wave_height_m: maxWaveHeight,
          avg_wind_speed_kt: avgWindSpeed,
          max_wind_speed_kt: maxWindSpeed,
          conditions,
        },
        recommendation,
        next_good_window: nextGoodWindow,
      });
    } catch (error) {
      // If API call fails, return error result
      if (error instanceof PortWeatherError) {
        throw error;
      }

      // For other errors, return a result indicating failure
      results.push({
        port_code,
        port_name,
        bunkering_feasible: false,
        weather_risk: 'High',
        weather_during_bunkering: {
          arrival_time: estimated_arrival,
          bunkering_window_hours: bunkering_duration_hours,
          avg_wave_height_m: 0,
          max_wave_height_m: 0,
          avg_wind_speed_kt: 0,
          max_wind_speed_kt: 0,
          conditions: 'Unknown',
        },
        recommendation: `Unable to fetch weather data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  return results;
}

/**
 * Tool schema for Claude (Anthropic SDK)
 * This schema is used to register the tool with Claude so it can be called by the AI agent
 */
export const portWeatherToolSchema = {
  name: 'check_port_weather',
  description: `Check if bunker ports have safe weather conditions for bunkering operations.
    Evaluates wave height and wind speed during the bunkering window.
    Returns feasibility assessment, weather risk, conditions classification, and recommendations.
    Optionally finds next safe window if current conditions are unsafe.`,
  input_schema: {
    type: 'object',
    properties: {
      bunker_ports: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            port_code: {
              type: 'string',
              description: 'Port code in UNLOCODE format',
            },
            port_name: {
              type: 'string',
              description: 'Port name',
            },
            lat: {
              type: 'number',
              description: 'Latitude in decimal degrees',
            },
            lon: {
              type: 'number',
              description: 'Longitude in decimal degrees',
            },
            estimated_arrival: {
              type: 'string',
              description: 'Estimated arrival datetime in ISO 8601 format',
            },
            bunkering_duration_hours: {
              type: 'number',
              description: 'Bunkering duration in hours (optional, defaults to 8)',
            },
          },
          required: ['port_code', 'port_name', 'lat', 'lon', 'estimated_arrival'],
        },
        description: 'Array of bunker ports to check',
      },
    },
    required: ['bunker_ports'],
  },
} as const;

/**
 * Tool execution wrapper for Claude
 * This function is called by the agent when the tool is invoked
 */
export async function executePortWeatherTool(
  args: unknown
): Promise<PortWeatherOutput[]> {
  return checkPortWeather(args as PortWeatherInput);
}

