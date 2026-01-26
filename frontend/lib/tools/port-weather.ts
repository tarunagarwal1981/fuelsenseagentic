/**
 * Port Weather Tool
 * 
 * Thin wrapper around WeatherService that checks if bunker ports have safe weather conditions.
 * Uses the service layer for weather fetching and safety evaluation.
 * 
 * The tool:
 * - Validates input parameters
 * - Delegates to WeatherService for weather fetching and safety checks
 * - Formats output for agent consumption
 */

import { z } from 'zod';
import { ServiceContainer } from '@/lib/repositories/service-container';

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
 * Main execute function for port weather check
 * 
 * This function:
 * 1. Validates input parameters using Zod
 * 2. Gets WeatherService from ServiceContainer
 * 3. Checks port weather safety using WeatherService
 * 4. Formats output for agent consumption
 * 
 * @param input - Port weather check parameters
 * @returns Array of port weather analyses
 * @throws PortWeatherError - If validation fails or service calls fail
 */
export async function checkPortWeather(
  input: PortWeatherInput
): Promise<PortWeatherOutput[]> {
  try {
    // Validate input using Zod schema
    const validatedInput = portWeatherInputSchema.parse(input);

    const { bunker_ports } = validatedInput;

    // Handle edge case: empty ports (shouldn't happen due to validation)
    if (bunker_ports.length === 0) {
      return [];
    }

    // Get service from container
    const container = ServiceContainer.getInstance();
    const weatherService = container.getWeatherService();

    const batchStartTime = Date.now();
    console.log(`🌊 [PORT-WEATHER] Processing ${bunker_ports.length} ports`);

    const results: PortWeatherOutput[] = [];

    // Process each port
    for (const port of bunker_ports) {
      const {
        port_code,
        port_name,
        estimated_arrival,
        bunkering_duration_hours = 8,
      } = port;

      try {
        // Check port weather safety using service
        const safety = await weatherService.checkPortWeatherSafety({
          portCode: port_code,
          date: new Date(estimated_arrival),
        });

        // Map service output to tool output format
        const weather = safety.weather;
        const maxWaveHeight = weather.waveHeight;
        const maxWindSpeed = weather.windSpeed;
        const avgWaveHeight = weather.waveHeight; // Service provides single point, use as avg
        const avgWindSpeed = weather.windSpeed;

        // Classify risk based on service safety rating
        let risk: 'Low' | 'Medium' | 'High' = 'Low';
        if (safety.isSafe) {
          if (maxWaveHeight < 1.2 && maxWindSpeed < 20) {
            risk = 'Low';
          } else {
            risk = 'Medium';
          }
        } else {
          risk = 'High';
        }

        // Classify conditions
        let conditions = 'Good';
        if (!safety.isSafe) {
          conditions = 'Unsafe';
        } else if (maxWaveHeight < 0.8 && maxWindSpeed < 15) {
          conditions = 'Excellent';
        } else if (maxWaveHeight < 1.2 && maxWindSpeed < 20) {
          conditions = 'Good';
        } else {
          conditions = 'Marginal';
        }

        results.push({
          port_code,
          port_name,
          bunkering_feasible: safety.isSafe,
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
          recommendation: safety.recommendation,
        });
      } catch (error) {
        // For errors, return a result indicating failure
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

    const totalTime = Date.now() - batchStartTime;
    console.log(`⏱️ [PORT-WEATHER] Total port weather fetch time: ${totalTime}ms`);

    return results;
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      throw new PortWeatherError(
        `Input validation failed: ${error.issues.map((e) => e.message).join(', ')}`,
        'VALIDATION_ERROR'
      );
    }

    // Re-throw PortWeatherError as-is
    if (error instanceof PortWeatherError) {
      throw error;
    }

    // Handle unexpected errors
    throw new PortWeatherError(
      `Unexpected error during port weather check: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'UNEXPECTED_ERROR'
    );
  }
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

