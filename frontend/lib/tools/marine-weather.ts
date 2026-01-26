/**
 * Marine Weather Tool
 * 
 * Thin wrapper around WeatherService that fetches marine weather forecasts for vessel positions.
 * Uses the service layer for weather fetching and data formatting.
 * 
 * The tool:
 * - Validates input parameters
 * - Delegates to WeatherService for weather fetching
 * - Formats output for agent consumption
 */

import { z } from 'zod';
import { Coordinates } from '@/lib/types';
import { ServiceContainer } from '@/lib/repositories/service-container';

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
 * Main execute function for marine weather forecast
 * 
 * This function:
 * 1. Validates input parameters using Zod
 * 2. Gets WeatherService from ServiceContainer
 * 3. Fetches weather for each position using WeatherService
 * 4. Formats output for agent consumption
 * 
 * @param input - Marine weather forecast parameters
 * @returns Array of weather forecasts for each position
 * @throws MarineWeatherError - If validation fails or service calls fail
 */
export async function fetchMarineWeather(
  input: MarineWeatherInput
): Promise<MarineWeatherOutput[]> {
  try {
    // Validate input using Zod schema
    const validatedInput = marineWeatherInputSchema.parse(input);

    const { positions } = validatedInput;

    // Handle edge case: empty positions (shouldn't happen due to validation)
    if (positions.length === 0) {
      return [];
    }

    // Get service from container
    const container = ServiceContainer.getInstance();
    const weatherService = container.getWeatherService();

    console.log(`🌊 [MARINE-WEATHER] Fetching weather for ${positions.length} positions`);

    const results: MarineWeatherOutput[] = [];

    // Process each position
    for (const position of positions) {
      try {
        // Fetch weather using service
        const weather = await weatherService.fetchMarineWeather({
          latitude: position.lat,
          longitude: position.lon,
          date: new Date(position.datetime),
        });

        // Determine forecast confidence based on date
        const daysFromNow = (new Date(position.datetime).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        let confidence: 'high' | 'medium' | 'low' = 'high';
        if (daysFromNow > 16) {
          confidence = 'medium';
        } else if (daysFromNow < 0) {
          confidence = 'low'; // Past date
        }

        // Classify sea state based on wave height
        let seaState = 'Calm';
        if (weather.waveHeight < 0.5) {
          seaState = 'Calm';
        } else if (weather.waveHeight < 1.25) {
          seaState = 'Slight';
        } else if (weather.waveHeight < 2.5) {
          seaState = 'Moderate';
        } else if (weather.waveHeight < 4.0) {
          seaState = 'Rough';
        } else if (weather.waveHeight < 6.0) {
          seaState = 'Very Rough';
        } else {
          seaState = 'High';
        }

        results.push({
          position: { lat: position.lat, lon: position.lon },
          datetime: position.datetime,
          weather: {
            wave_height_m: weather.waveHeight,
            wind_speed_knots: weather.windSpeed,
            wind_direction_deg: weather.windDirection,
            sea_state: seaState,
          },
          forecast_confidence: confidence,
        });
      } catch (error) {
        // For errors, return a result with low confidence
        console.error(`Error fetching weather for position ${position.lat}, ${position.lon}:`, error);
        results.push({
          position: { lat: position.lat, lon: position.lon },
          datetime: position.datetime,
          weather: {
            wave_height_m: 0,
            wind_speed_knots: 0,
            wind_direction_deg: 0,
            sea_state: 'Unknown',
          },
          forecast_confidence: 'low',
        });
      }
    }

    console.log(`✅ [MARINE-WEATHER] Fetched weather for ${results.length} positions`);
    return results;
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      throw new MarineWeatherError(
        `Input validation failed: ${error.issues.map((e) => e.message).join(', ')}`,
        'VALIDATION_ERROR'
      );
    }

    // Re-throw MarineWeatherError as-is
    if (error instanceof MarineWeatherError) {
      throw error;
    }

    // Handle unexpected errors
    throw new MarineWeatherError(
      `Unexpected error during marine weather fetch: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'UNEXPECTED_ERROR'
    );
  }
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
 * Tool execution wrapper for Claude
 * This function is called by the agent when the tool is invoked
 */
export async function executeMarineWeatherTool(
  args: unknown
): Promise<MarineWeatherOutput[]> {
  return fetchMarineWeather(args as MarineWeatherInput);
}

