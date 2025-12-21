/**
 * Weather Consumption Tool
 * 
 * Calculates fuel consumption adjusted for weather conditions along a voyage.
 * This tool accounts for the impact of wave height and wind direction on fuel
 * consumption, providing accurate fuel planning for maritime operations.
 * 
 * The tool:
 * - Calculates weather impact multipliers based on wave height and wind direction
 * - Applies time-weighted adjustments across the voyage
 * - Generates weather alerts for severe conditions
 * - Provides detailed consumption breakdowns
 */

import { z } from 'zod';
import { Coordinates, FuelType } from '@/lib/types';

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
 * Calculates wave height impact multiplier
 * 
 * @param waveHeightM - Wave height in meters
 * @returns Multiplier factor
 */
function getWaveHeightMultiplier(waveHeightM: number): number {
  if (waveHeightM < 0.5) {
    return 1.0; // Calm
  } else if (waveHeightM < 1.25) {
    return 1.05; // Slight
  } else if (waveHeightM < 2.5) {
    return 1.10; // Moderate
  } else if (waveHeightM < 4.0) {
    return 1.20; // Rough
  } else if (waveHeightM < 6.0) {
    return 1.35; // Very Rough
  } else {
    return 1.50; // High/Storm
  }
}

/**
 * Calculates wind direction impact multiplier relative to vessel heading
 * 
 * @param windDirectionDeg - Wind direction in degrees (0-360)
 * @param vesselHeadingDeg - Vessel heading in degrees (0-360)
 * @returns Multiplier factor
 */
function getWindDirectionMultiplier(
  windDirectionDeg: number,
  vesselHeadingDeg: number
): number {
  // Calculate relative wind angle (0° = head wind, 180° = tail wind)
  let relativeAngle = Math.abs(windDirectionDeg - vesselHeadingDeg);
  
  // Normalize to 0-180 range
  if (relativeAngle > 180) {
    relativeAngle = 360 - relativeAngle;
  }
  
  // Following wind: within 45° aft (135-180° relative)
  if (relativeAngle >= 135) {
    return 0.95;
  }
  
  // Head wind: within 45° forward (0-45° relative)
  if (relativeAngle <= 45) {
    return 1.15;
  }
  
  // Beam wind: 45-135° relative
  return 1.0;
}

/**
 * Calculates combined weather multiplier
 * 
 * @param waveHeightM - Wave height in meters
 * @param windDirectionDeg - Wind direction in degrees
 * @param vesselHeadingDeg - Vessel heading in degrees
 * @returns Combined multiplier
 */
function calculateWeatherMultiplier(
  waveHeightM: number,
  windDirectionDeg: number,
  vesselHeadingDeg: number
): number {
  const waveMultiplier = getWaveHeightMultiplier(waveHeightM);
  const windMultiplier = getWindDirectionMultiplier(windDirectionDeg, vesselHeadingDeg);
  return waveMultiplier * windMultiplier;
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
 * Calculates time-weighted average multiplier across voyage
 * Assumes equal time weighting for each data point
 * 
 * @param weatherData - Array of weather data points
 * @param vesselHeadingDeg - Vessel heading in degrees
 * @returns Average multiplier
 */
function calculateAverageMultiplier(
  weatherData: WeatherDataPoint[],
  vesselHeadingDeg: number
): number {
  if (weatherData.length === 0) {
    return 1.0;
  }

  let totalMultiplier = 0;
  for (const data of weatherData) {
    const multiplier = calculateWeatherMultiplier(
      data.weather.wave_height_m,
      data.weather.wind_direction_deg,
      vesselHeadingDeg
    );
    totalMultiplier += multiplier;
  }

  return totalMultiplier / weatherData.length;
}

/**
 * Main execute function for weather consumption calculation
 * 
 * This function:
 * 1. Validates input parameters using Zod
 * 2. Calculates weather multipliers for each data point
 * 3. Computes average multiplier across voyage
 * 4. Applies multiplier to base consumption
 * 5. Generates weather alerts
 * 6. Calculates fuel type breakdowns if provided
 * 7. Returns comprehensive consumption analysis
 * 
 * @param input - Weather consumption calculation parameters
 * @returns Weather-adjusted consumption analysis
 * @throws WeatherConsumptionError - If validation fails or calculation fails
 */
export async function calculateWeatherConsumption(
  input: WeatherConsumptionInput
): Promise<WeatherConsumptionOutput> {
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

  // Calculate average multiplier
  const avgMultiplier = calculateAverageMultiplier(weather_data, vessel_heading_deg);

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
  let worstConditionsDate = weather_data[0].datetime;
  let worstMultiplier = calculateWeatherMultiplier(
    weather_data[0].weather.wave_height_m,
    weather_data[0].weather.wind_direction_deg,
    vessel_heading_deg
  );

  for (const data of weather_data) {
    const multiplier = calculateWeatherMultiplier(
      data.weather.wave_height_m,
      data.weather.wind_direction_deg,
      vessel_heading_deg
    );
    if (multiplier > worstMultiplier) {
      worstMultiplier = multiplier;
      worstConditionsDate = data.datetime;
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

