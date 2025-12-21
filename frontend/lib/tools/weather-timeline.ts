/**
 * Weather Timeline Tool
 * 
 * Calculates vessel position at regular intervals along a maritime route.
 * This tool is used to generate a timeline of vessel positions for weather
 * forecasting and route analysis purposes.
 * 
 * The tool:
 * - Takes a series of waypoints defining a route
 * - Calculates positions at regular time intervals
 * - Tracks cumulative distance and datetime from departure
 * - Uses Haversine formula for accurate distance calculations
 */

import { z } from 'zod';
import { Coordinates } from '@/lib/types';

/**
 * Input parameters for weather timeline calculation
 */
export interface WeatherTimelineInput {
  /** Array of waypoint coordinates along the route */
  waypoints: Coordinates[];
  /** Vessel speed in knots (must be between 5-30 knots) */
  vessel_speed_knots: number;
  /** Departure datetime in ISO 8601 format */
  departure_datetime: string;
  /** Sampling interval in hours (optional, defaults to 12 hours) */
  sampling_interval_hours?: number;
}

/**
 * Output position at a specific point in time
 */
export interface WeatherTimelinePosition {
  /** Latitude in decimal degrees */
  lat: number;
  /** Longitude in decimal degrees */
  lon: number;
  /** Datetime at this position (ISO 8601 format) */
  datetime: string;
  /** Cumulative distance from start in nautical miles */
  distance_from_start_nm: number;
  /** Index of the route segment this position belongs to */
  segment_index: number;
}

/**
 * Output from weather timeline calculation
 */
export type WeatherTimelineOutput = WeatherTimelinePosition[];

/**
 * Zod schema for input validation
 * Validates that required fields are present and have correct types
 */
export const weatherTimelineInputSchema = z.object({
  waypoints: z
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
      })
    )
    .min(1, 'At least one waypoint is required')
    .describe('Array of waypoint coordinates along the route'),
  
  vessel_speed_knots: z
    .number()
    .min(5, 'Vessel speed must be at least 5 knots')
    .max(30, 'Vessel speed must be at most 30 knots')
    .describe('Vessel speed in knots (must be between 5-30 knots)'),
  
  departure_datetime: z
    .string()
    .datetime('Departure datetime must be in ISO 8601 format')
    .describe('Departure datetime in ISO 8601 format (e.g., 2024-12-25T08:00:00Z)'),
  
  sampling_interval_hours: z
    .number()
    .positive('Sampling interval must be positive')
    .optional()
    .default(12)
    .describe('Sampling interval in hours (optional, defaults to 12 hours)'),
});

/**
 * Error class for weather timeline calculation failures
 */
export class WeatherTimelineError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'WeatherTimelineError';
  }
}

/**
 * Calculates the distance between two coordinates using the Haversine formula
 * Returns distance in nautical miles
 * 
 * @param point1 - First coordinate point
 * @param point2 - Second coordinate point
 * @returns Distance in nautical miles
 */
function haversineDistance(point1: Coordinates, point2: Coordinates): number {
  const R = 3440.065; // Earth's radius in nautical miles
  
  const lat1Rad = (point1.lat * Math.PI) / 180;
  const lat2Rad = (point2.lat * Math.PI) / 180;
  const deltaLatRad = ((point2.lat - point1.lat) * Math.PI) / 180;
  const deltaLonRad = ((point2.lon - point1.lon) * Math.PI) / 180;
  
  const a =
    Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLonRad / 2) *
      Math.sin(deltaLonRad / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
}

/**
 * Interpolates a position between two waypoints based on the fraction of distance traveled
 * 
 * @param start - Starting waypoint
 * @param end - Ending waypoint
 * @param fraction - Fraction of distance traveled (0.0 to 1.0)
 * @returns Interpolated coordinates
 */
function interpolatePosition(
  start: Coordinates,
  end: Coordinates,
  fraction: number
): Coordinates {
  // Handle edge case where start and end are the same
  if (start.lat === end.lat && start.lon === end.lon) {
    return { lat: start.lat, lon: start.lon };
  }
  
  // Linear interpolation
  const lat = start.lat + (end.lat - start.lat) * fraction;
  const lon = start.lon + (end.lon - start.lon) * fraction;
  
  return { lat, lon };
}

/**
 * Adds hours to an ISO 8601 datetime string
 * 
 * @param datetime - ISO 8601 datetime string
 * @param hours - Number of hours to add
 * @returns New ISO 8601 datetime string
 */
function addHours(datetime: string, hours: number): string {
  const date = new Date(datetime);
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

/**
 * Main execute function for weather timeline calculation
 * 
 * This function:
 * 1. Validates input parameters using Zod
 * 2. Calculates distances between waypoints using Haversine formula
 * 3. Calculates sailing hours for each segment
 * 4. Samples positions at regular intervals along each segment
 * 5. Tracks cumulative datetime and distance from departure
 * 
 * @param input - Weather timeline calculation parameters
 * @returns Array of positions with datetime, coordinates, distance, and segment index
 * @throws WeatherTimelineError - If validation fails or calculation fails
 */
export async function calculateWeatherTimeline(
  input: WeatherTimelineInput
): Promise<WeatherTimelineOutput> {
  // Validate input using Zod schema
  const validatedInput = weatherTimelineInputSchema.parse(input);
  
  const {
    waypoints,
    vessel_speed_knots,
    departure_datetime,
    sampling_interval_hours = 12,
  } = validatedInput;
  
  // Handle edge case: single waypoint
  if (waypoints.length === 1) {
    return [
      {
        lat: waypoints[0].lat,
        lon: waypoints[0].lon,
        datetime: departure_datetime,
        distance_from_start_nm: 0,
        segment_index: 0,
      },
    ];
  }
  
  // Validate datetime format
  const departureDate = new Date(departure_datetime);
  if (isNaN(departureDate.getTime())) {
    throw new WeatherTimelineError(
      'Invalid departure datetime format. Must be valid ISO 8601 format.',
      'INVALID_DATETIME'
    );
  }
  
  const positions: WeatherTimelinePosition[] = [];
  let cumulativeDistance = 0;
  
  // Add the first waypoint (departure point)
  positions.push({
    lat: waypoints[0].lat,
    lon: waypoints[0].lon,
    datetime: departure_datetime,
    distance_from_start_nm: 0,
    segment_index: 0,
  });
  
  // Process each segment between waypoints
  for (let segmentIndex = 0; segmentIndex < waypoints.length - 1; segmentIndex++) {
    const start = waypoints[segmentIndex];
    const end = waypoints[segmentIndex + 1];
    
    // Calculate segment distance
    const segmentDistance = haversineDistance(start, end);
    
    // Calculate segment duration in hours
    const segmentHours = segmentDistance / vessel_speed_knots;
    
    // Calculate time to reach start of this segment
    const timeToSegmentStart = cumulativeDistance / vessel_speed_knots;
    
    // Calculate number of samples for this segment (excluding start and end waypoints)
    const numSamples = Math.ceil(segmentHours / sampling_interval_hours);
    
    // Generate positions along this segment
    for (let sampleIndex = 1; sampleIndex < numSamples; sampleIndex++) {
      const sampleTime = sampleIndex * sampling_interval_hours;
      
      // Skip if we've exceeded the segment duration
      if (sampleTime >= segmentHours) {
        break;
      }
      
      // Calculate fraction of segment completed
      const fraction = sampleTime / segmentHours;
      
      // Interpolate position
      const position = interpolatePosition(start, end, fraction);
      
      // Calculate distance from start of segment
      const distanceFromSegmentStart = segmentDistance * fraction;
      const totalDistance = cumulativeDistance + distanceFromSegmentStart;
      
      // Calculate datetime for this position
      const positionDatetime = addHours(departure_datetime, timeToSegmentStart + sampleTime);
      
      positions.push({
        lat: position.lat,
        lon: position.lon,
        datetime: positionDatetime,
        distance_from_start_nm: totalDistance,
        segment_index: segmentIndex,
      });
    }
    
    // Add the end waypoint of the segment
    cumulativeDistance += segmentDistance;
    const endDatetime = addHours(departure_datetime, cumulativeDistance / vessel_speed_knots);
    
    positions.push({
      lat: end.lat,
      lon: end.lon,
      datetime: endDatetime,
      distance_from_start_nm: cumulativeDistance,
      segment_index: segmentIndex,
    });
  }
  
  // Remove duplicate positions (if any) by keeping only unique datetime/position combinations
  const uniquePositions: WeatherTimelinePosition[] = [];
  const seen = new Set<string>();
  
  for (const pos of positions) {
    const key = `${pos.lat.toFixed(6)},${pos.lon.toFixed(6)},${pos.datetime}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniquePositions.push(pos);
    }
  }
  
  return uniquePositions;
}

/**
 * Tool schema for Claude (Anthropic SDK)
 * This schema is used to register the tool with Claude so it can be called by the AI agent
 */
export const weatherTimelineToolSchema = {
  name: 'calculate_weather_timeline',
  description: `Calculate vessel position at regular intervals along a maritime route.
    Returns an array of positions with coordinates, datetime, cumulative distance, and segment index.
    Useful for weather forecasting and route analysis.`,
  input_schema: {
    type: 'object',
    properties: {
      waypoints: {
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
          },
          required: ['lat', 'lon'],
        },
        description: 'Array of waypoint coordinates along the route',
      },
      vessel_speed_knots: {
        type: 'number',
        description: 'Vessel speed in knots (must be between 5-30 knots)',
      },
      departure_datetime: {
        type: 'string',
        description: 'Departure datetime in ISO 8601 format (e.g., 2024-12-25T08:00:00Z)',
      },
      sampling_interval_hours: {
        type: 'number',
        description: 'Sampling interval in hours (optional, defaults to 12 hours)',
      },
    },
    required: ['waypoints', 'vessel_speed_knots', 'departure_datetime'],
  },
} as const;

/**
 * Tool execution wrapper for Claude
 * This function is called by the agent when the tool is invoked
 */
export async function executeWeatherTimelineTool(
  args: unknown
): Promise<WeatherTimelineOutput> {
  return calculateWeatherTimeline(args as WeatherTimelineInput);
}

