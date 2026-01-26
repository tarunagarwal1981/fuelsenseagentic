/**
 * Weather Consumption Tool
 * 
 * Thin wrapper around WeatherService that calculates fuel consumption adjusted for weather conditions.
 * Uses the service layer for weather impact calculation.
 * 
 * The tool:
 * - Validates input parameters
 * - Delegates to WeatherService for weather impact calculation
 * - Formats output for agent consumption
 */

import { z } from 'zod';
import { Coordinates, FuelType } from '@/lib/types';
import { ServiceContainer } from '@/lib/repositories/service-container';

/**
 * Weather data point from marine weather tool
 */
export interface WeatherDataPoint {
  /** Datetime in ISO 8601 format */
  datetime: string;
  /** Weather conditions */
  weather: {
    /** Wave height in meters */
    wave_height_m: number;
    /** Wind speed in knots */
    wind_speed_knots: number;
    /** Wind direction in degrees (0-360) */
    wind_direction_deg: number;
    /** Sea state classification */
    sea_state: string;
  };
  /** Optional position coordinates for alerts */
  position?: Coordinates;
}

/**
 * Input parameters for weather consumption calculation
 */
export interface WeatherConsumptionInput {
  /** Array of weather data points along the voyage */
  weather_data: WeatherDataPoint[];
  /** Base fuel consumption estimate for the voyage in metric tons */
  base_consumption_mt: number;
  /** Average vessel heading in degrees (0-360) */
  vessel_heading_deg: number;
  /** Optional breakdown by fuel type */
  fuel_type_breakdown?: {
    VLSFO?: number;
    LSGO?: number;
  };
}

/**
 * Weather alert for severe conditions
 */
export interface WeatherAlert {
  /** Location coordinates (if available) */
  location?: Coordinates;
  /** Datetime of the alert */
  datetime: string;
  /** Alert severity level */
  severity: 'warning' | 'severe';
  /** Human-readable description */
  description: string;
  /** Wave height in meters */
  wave_height_m: number;
  /** Wind speed in knots */
  wind_speed_knots: number;
}

/**
 * Fuel type breakdown
 */
export interface FuelTypeBreakdown {
  /** Base consumption */
  base: number;
  /** Weather-adjusted consumption */
  adjusted: number;
}

/**
 * Voyage weather summary
 */
export interface VoyageWeatherSummary {
  /** Average wave height in meters */
  avg_wave_height_m: number;
  /** Maximum wave height in meters */
  max_wave_height_m: number;
  /** Average weather multiplier */
  avg_multiplier: number;
  /** Date/time of worst conditions */
  worst_conditions_date: string;
}

/**
 * Output from weather consumption calculation
 */
export interface WeatherConsumptionOutput {
  /** Base consumption estimate */
  base_consumption_mt: number;
  /** Weather-adjusted consumption */
  weather_adjusted_consumption_mt: number;
  /** Additional fuel needed due to weather */
  additional_fuel_needed_mt: number;
  /** Consumption increase as percentage */
  consumption_increase_percent: number;
  /** Optional breakdown by fuel type */
  breakdown_by_fuel_type?: {
    VLSFO?: FuelTypeBreakdown;
    LSGO?: FuelTypeBreakdown;
  };
  /** Weather alerts for severe conditions */
  weather_alerts: WeatherAlert[];
  /** Voyage weather summary */
  voyage_weather_summary: VoyageWeatherSummary;
}

/**
 * Zod schema for input validation
 */
export const weatherConsumptionInputSchema = z.object({
  weather_data: z
    .array(
      z.object({
        datetime: z.string().datetime('Datetime must be in ISO 8601 format'),
        weather: z.object({
          wave_height_m: z.number().min(0, 'Wave height must be non-negative'),
          wind_speed_knots: z.number().min(0, 'Wind speed must be non-negative'),
          wind_direction_deg: z
            .number()
            .min(0, 'Wind direction must be between 0 and 360')
            .max(360, 'Wind direction must be between 0 and 360'),
          sea_state: z.string(),
        }),
        position: z
          .object({
            lat: z.number(),
            lon: z.number(),
          })
          .optional(),
      })
    )
    .min(1, 'At least one weather data point is required'),
  
  base_consumption_mt: z
    .number()
    .positive('Base consumption must be positive'),
  
  vessel_heading_deg: z
    .number()
    .min(0, 'Vessel heading must be between 0 and 360')
    .max(360, 'Vessel heading must be between 0 and 360'),
  
  fuel_type_breakdown: z
    .object({
      VLSFO: z.number().positive().optional(),
      LSGO: z.number().positive().optional(),
    })
    .optional(),
});

/**
 * Error class for weather consumption calculation failures
 */
export class WeatherConsumptionError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'WeatherConsumptionError';
  }
}


/**
 * Generates weather alerts for severe conditions
 * 
 * @param weatherData - Array of weather data points
 * @returns Array of weather alerts
 */
function generateWeatherAlerts(
  weatherData: WeatherDataPoint[]
): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];

  for (const data of weatherData) {
    const { wave_height_m, wind_speed_knots, wind_direction_deg } = data.weather;
    let severity: 'warning' | 'severe' | null = null;
    let description = '';

    // Check for severe wave conditions
    if (wave_height_m > 6.0) {
      severity = 'severe';
      description = `Severe wave conditions: ${wave_height_m.toFixed(2)}m waves (${data.weather.sea_state})`;
    } else if (wave_height_m > 4.0) {
      severity = 'warning';
      description = `Rough wave conditions: ${wave_height_m.toFixed(2)}m waves (${data.weather.sea_state})`;
    }

    // Check for severe wind conditions
    if (wind_speed_knots > 34) {
      severity = 'severe';
      description = `Severe wind conditions: ${wind_speed_knots.toFixed(1)}kt winds`;
    } else if (wind_speed_knots > 27) {
      if (severity !== 'severe') {
        severity = 'warning';
        description = `Strong wind conditions: ${wind_speed_knots.toFixed(1)}kt winds`;
      } else {
        description += ` and ${wind_speed_knots.toFixed(1)}kt winds`;
      }
    }

    if (severity) {
      alerts.push({
        location: data.position,
        datetime: data.datetime,
        severity,
        description,
        wave_height_m,
        wind_speed_knots,
      });
    }
  }

  return alerts;
}


/**
 * Main execute function for weather consumption calculation
 * 
 * This function:
 * 1. Validates input parameters using Zod
 * 2. Gets WeatherService from ServiceContainer
 * 3. Calculates weather impact for each data point using WeatherService
 * 4. Computes average multiplier across voyage
 * 5. Applies multiplier to base consumption
 * 6. Generates weather alerts
 * 7. Calculates fuel type breakdowns if provided
 * 8. Returns comprehensive consumption analysis
 * 
 * @param input - Weather consumption calculation parameters
 * @returns Weather-adjusted consumption analysis
 * @throws WeatherConsumptionError - If validation fails or calculation fails
 */
export async function calculateWeatherConsumption(
  input: WeatherConsumptionInput
): Promise<WeatherConsumptionOutput> {
  try {
    // Validate input using Zod schema
    const validatedInput = weatherConsumptionInputSchema.parse(input);

    const {
      weather_data,
      base_consumption_mt,
      vessel_heading_deg,
      fuel_type_breakdown,
    } = validatedInput;

    // Handle edge case: empty weather data (shouldn't happen due to validation)
    if (weather_data.length === 0) {
      throw new WeatherConsumptionError(
        'Weather data array is empty',
        'EMPTY_WEATHER_DATA'
      );
    }

    // Get service from container
    const container = ServiceContainer.getInstance();
    const weatherService = container.getWeatherService();

    // Calculate weather impact multipliers for each data point
    const multipliers: number[] = [];
    for (const dataPoint of weather_data) {
      const impact = await weatherService.calculateWeatherImpact({
        weather: {
          waveHeight: dataPoint.weather.wave_height_m,
          windSpeed: dataPoint.weather.wind_speed_knots,
          windDirection: dataPoint.weather.wind_direction_deg,
          seaState: dataPoint.weather.sea_state || 'Moderate',
          datetime: new Date(dataPoint.datetime),
        },
        vesselType: 'container', // Default vessel type
        speed: 14, // Default speed
      });
      multipliers.push(impact.multiplier);
    }

    // Calculate average multiplier
    const avgMultiplier =
      multipliers.reduce((sum, m) => sum + m, 0) / multipliers.length;

    // Calculate adjusted consumption
    const weatherAdjustedConsumption = base_consumption_mt * avgMultiplier;
    const additionalFuelNeeded = weatherAdjustedConsumption - base_consumption_mt;
    const consumptionIncreasePercent =
      (additionalFuelNeeded / base_consumption_mt) * 100;

    // Generate weather alerts
    const weatherAlerts = generateWeatherAlerts(weather_data);

    // Calculate voyage weather summary
    const waveHeights = weather_data.map((d) => d.weather.wave_height_m);
    const avgWaveHeight =
      waveHeights.reduce((sum, h) => sum + h, 0) / waveHeights.length;
    const maxWaveHeight = Math.max(...waveHeights);

    // Find worst conditions (highest multiplier)
    let worstConditionsDate = weather_data[0]!.datetime;
    let worstMultiplier = multipliers[0] || 1.0;
    for (let i = 0; i < multipliers.length; i++) {
      if (multipliers[i]! > worstMultiplier) {
        worstMultiplier = multipliers[i]!;
        worstConditionsDate = weather_data[i]!.datetime;
      }
    }

    const voyageWeatherSummary: VoyageWeatherSummary = {
      avg_wave_height_m: avgWaveHeight,
      max_wave_height_m: maxWaveHeight,
      avg_multiplier: avgMultiplier,
      worst_conditions_date: worstConditionsDate,
    };

    // Calculate fuel type breakdown if provided
    let breakdownByFuelType:
      | {
          VLSFO?: FuelTypeBreakdown;
          LSGO?: FuelTypeBreakdown;
        }
      | undefined;

    if (fuel_type_breakdown) {
      breakdownByFuelType = {};

      if (fuel_type_breakdown.VLSFO !== undefined) {
        breakdownByFuelType.VLSFO = {
          base: fuel_type_breakdown.VLSFO,
          adjusted: fuel_type_breakdown.VLSFO * avgMultiplier,
        };
      }

      if (fuel_type_breakdown.LSGO !== undefined) {
        breakdownByFuelType.LSGO = {
          base: fuel_type_breakdown.LSGO,
          adjusted: fuel_type_breakdown.LSGO * avgMultiplier,
        };
      }
    }

    return {
      base_consumption_mt,
      weather_adjusted_consumption_mt: weatherAdjustedConsumption,
      additional_fuel_needed_mt: additionalFuelNeeded,
      consumption_increase_percent: consumptionIncreasePercent,
      breakdown_by_fuel_type: breakdownByFuelType,
      weather_alerts: weatherAlerts,
      voyage_weather_summary: voyageWeatherSummary,
    };
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      throw new WeatherConsumptionError(
        `Input validation failed: ${error.issues.map((e) => e.message).join(', ')}`,
        'VALIDATION_ERROR'
      );
    }

    // Re-throw WeatherConsumptionError as-is
    if (error instanceof WeatherConsumptionError) {
      throw error;
    }

    // Handle unexpected errors
    throw new WeatherConsumptionError(
      `Unexpected error during weather consumption calculation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'UNEXPECTED_ERROR'
    );
  }
}

/**
 * Tool schema for Claude (Anthropic SDK)
 * This schema is used to register the tool with Claude so it can be called by the AI agent
 */
export const weatherConsumptionToolSchema = {
  name: 'calculate_weather_consumption',
  description: `Calculate fuel consumption adjusted for weather conditions along a voyage.
    Accounts for wave height and wind direction impacts on fuel consumption.
    Returns adjusted consumption, additional fuel needed, weather alerts, and voyage summary.
    Provides breakdown by fuel type if specified.`,
  input_schema: {
    type: 'object',
    properties: {
      weather_data: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            datetime: {
              type: 'string',
              description: 'Datetime in ISO 8601 format',
            },
            weather: {
              type: 'object',
              properties: {
                wave_height_m: {
                  type: 'number',
                  description: 'Wave height in meters',
                },
                wind_speed_knots: {
                  type: 'number',
                  description: 'Wind speed in knots',
                },
                wind_direction_deg: {
                  type: 'number',
                  description: 'Wind direction in degrees (0-360)',
                },
                sea_state: {
                  type: 'string',
                  description: 'Sea state classification',
                },
              },
              required: ['wave_height_m', 'wind_speed_knots', 'wind_direction_deg', 'sea_state'],
            },
            position: {
              type: 'object',
              properties: {
                lat: { type: 'number' },
                lon: { type: 'number' },
              },
              description: 'Optional position coordinates',
            },
          },
          required: ['datetime', 'weather'],
        },
        description: 'Array of weather data points along the voyage',
      },
      base_consumption_mt: {
        type: 'number',
        description: 'Base fuel consumption estimate for the voyage in metric tons',
      },
      vessel_heading_deg: {
        type: 'number',
        description: 'Average vessel heading in degrees (0-360)',
      },
      fuel_type_breakdown: {
        type: 'object',
        properties: {
          VLSFO: { type: 'number', description: 'VLSFO consumption in MT' },
          LSGO: { type: 'number', description: 'LSGO consumption in MT' },
        },
        description: 'Optional breakdown by fuel type',
      },
    },
    required: ['weather_data', 'base_consumption_mt', 'vessel_heading_deg'],
  },
} as const;

/**
 * Tool execution wrapper for Claude
 * This function is called by the agent when the tool is invoked
 */
export async function executeWeatherConsumptionTool(
  args: unknown
): Promise<WeatherConsumptionOutput> {
  return calculateWeatherConsumption(args as WeatherConsumptionInput);
}

