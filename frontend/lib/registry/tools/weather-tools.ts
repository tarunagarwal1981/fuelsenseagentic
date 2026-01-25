/**
 * Weather Tools Definitions
 * 
 * Tool definitions for weather forecasting, consumption analysis, and port weather checks.
 * These tools are used by the weather_agent.
 */

import type { ToolDefinition } from '@/lib/types/tool-registry';
import { executeMarineWeatherTool } from '@/lib/tools/marine-weather';
import { executeWeatherConsumptionTool } from '@/lib/tools/weather-consumption';
import { executePortWeatherTool } from '@/lib/tools/port-weather';

/**
 * Fetch Marine Weather Tool Definition
 * 
 * Fetches marine weather forecast from Open-Meteo API for vessel positions.
 */
export const fetchMarineWeatherTool: ToolDefinition = {
  // Identity
  id: 'fetch_marine_weather',
  name: 'Marine Weather Fetcher',
  description: 'Fetch marine weather forecast from Open-Meteo API for vessel positions. Fetches weather data for multiple positions efficiently, batches API calls by grouping positions into 6-hour windows, returns wave height, wind speed, wind direction, and sea state, and provides forecast confidence (high for 0-16 days, medium for 16+ days).',
  version: '1.0.0',
  
  // Classification
  category: 'weather',
  domain: ['weather_analysis', 'bunker_planning', 'voyage_planning'],
  
  // Schema
  inputSchema: {
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
  outputSchema: {
    type: 'object',
    properties: {
      forecasts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            position: {
              type: 'object',
              properties: {
                lat: { type: 'number' },
                lon: { type: 'number' },
              },
            },
            datetime: { type: 'string' },
            weather: {
              type: 'object',
              properties: {
                wave_height_m: { type: 'number' },
                wind_speed_knots: { type: 'number' },
                wind_direction_deg: { type: 'number' },
                sea_state: { type: 'string' },
              },
            },
            forecast_confidence: { type: 'string' },
          },
        },
        description: 'Array of weather forecasts',
      },
    },
  },
  
  // Operational Metadata
  cost: 'api_call',
  avgLatencyMs: 3000,
  maxLatencyMs: 15000,
  reliability: 0.95,
  
  // Dependencies
  dependencies: {
    external: ['open_meteo_api'],
    internal: ['calculate_weather_timeline'],
  },
  
  // Access Control
  agentIds: ['weather_agent'],
  requiresAuth: false,
  rateLimit: {
    calls: 50,
    windowMs: 60000, // 50 calls per minute
  },
  
  // Implementation
  implementation: executeMarineWeatherTool,
  
  // Monitoring
  metrics: {
    totalCalls: 0,
    successCalls: 0,
    failureCalls: 0,
  },
  
  // Metadata
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date(),
  deprecated: false,
};

/**
 * Calculate Weather Consumption Tool Definition
 * 
 * Calculates fuel consumption adjusted for weather conditions.
 */
export const calculateWeatherConsumptionTool: ToolDefinition = {
  // Identity
  id: 'calculate_weather_consumption',
  name: 'Weather Consumption Calculator',
  description: 'Calculate fuel consumption adjusted for weather conditions along a voyage. Accounts for wave height impact on fuel consumption, accounts for wind direction relative to vessel heading, calculates weather-adjusted consumption and additional fuel needed, generates weather alerts for severe conditions, and provides voyage weather summary.',
  version: '1.0.0',
  
  // Classification
  category: 'weather',
  domain: ['weather_analysis', 'bunker_planning', 'fuel_consumption'],
  
  // Schema
  inputSchema: {
    type: 'object',
    properties: {
      weather_data: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            datetime: { type: 'string' },
            weather: {
              type: 'object',
              properties: {
                wave_height_m: { type: 'number' },
                wind_speed_knots: { type: 'number' },
                wind_direction_deg: { type: 'number' },
                sea_state: { type: 'string' },
              },
            },
            position: {
              type: 'object',
              properties: {
                lat: { type: 'number' },
                lon: { type: 'number' },
              },
            },
          },
          required: ['datetime', 'weather'],
        },
        description: 'Array of weather data points from fetch_marine_weather',
      },
      base_consumption_mt: {
        type: 'number',
        description: 'Base fuel consumption estimate in metric tons',
      },
      vessel_heading_deg: {
        type: 'number',
        description: 'Average vessel heading in degrees (0-360)',
      },
      fuel_type_breakdown: {
        type: 'object',
        properties: {
          VLSFO: { type: 'number' },
          LSGO: { type: 'number' },
        },
        description: 'Optional breakdown by fuel type',
      },
    },
    required: ['weather_data', 'base_consumption_mt', 'vessel_heading_deg'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      base_consumption_mt: { type: 'number' },
      weather_adjusted_consumption_mt: { type: 'number' },
      additional_fuel_needed_mt: { type: 'number' },
      consumption_increase_percent: { type: 'number' },
      breakdown_by_fuel_type: {
        type: 'object',
        properties: {
          VLSFO: { type: 'number' },
          LSGO: { type: 'number' },
        },
      },
      weather_alerts: {
        type: 'array',
        items: { type: 'object' },
      },
      voyage_weather_summary: { type: 'object' },
    },
  },
  
  // Operational Metadata
  cost: 'free',
  avgLatencyMs: 100,
  maxLatencyMs: 1000,
  reliability: 1.0,
  
  // Dependencies
  dependencies: {
    external: [],
    internal: ['fetch_marine_weather'],
  },
  
  // Access Control
  agentIds: ['weather_agent'],
  requiresAuth: false,
  
  // Implementation
  implementation: executeWeatherConsumptionTool,
  
  // Monitoring
  metrics: {
    totalCalls: 0,
    successCalls: 0,
    failureCalls: 0,
  },
  
  // Metadata
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date(),
  deprecated: false,
};

/**
 * Check Bunker Port Weather Tool Definition
 * 
 * Checks if bunker ports have safe weather conditions for bunkering.
 */
export const checkBunkerPortWeatherTool: ToolDefinition = {
  // Identity
  id: 'check_bunker_port_weather',
  name: 'Port Weather Checker',
  description: 'Check if bunker ports have safe weather conditions for bunkering operations. Fetches weather forecasts for port locations, evaluates conditions during the bunkering window, classifies weather risk (Low, Medium, High), determines bunkering feasibility, and optionally finds next safe window if current is unsafe.',
  version: '1.0.0',
  
  // Classification
  category: 'weather',
  domain: ['bunker_planning', 'weather_analysis', 'safety'],
  
  // Schema
  inputSchema: {
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
              description: 'Bunkering duration in hours (optional, default: 8)',
            },
          },
          required: ['port_code', 'port_name', 'lat', 'lon', 'estimated_arrival'],
        },
        description: 'Array of bunker ports to check',
      },
    },
    required: ['bunker_ports'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      assessments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            port_code: { type: 'string' },
            port_name: { type: 'string' },
            bunkering_feasible: { type: 'boolean' },
            weather_risk: { type: 'string' },
            weather_during_bunkering: {
              type: 'object',
              properties: {
                arrival_time: { type: 'string' },
                bunkering_window_hours: { type: 'number' },
                avg_wave_height_m: { type: 'number' },
                max_wave_height_m: { type: 'number' },
                avg_wind_speed_kt: { type: 'number' },
                max_wind_speed_kt: { type: 'number' },
                conditions: { type: 'string' },
              },
            },
            recommendation: { type: 'string' },
            next_good_window: {
              type: 'object',
              properties: {
                start: { type: 'string' },
                end: { type: 'string' },
              },
            },
          },
        },
        description: 'Array of port weather assessments',
      },
    },
  },
  
  // Operational Metadata
  cost: 'api_call',
  avgLatencyMs: 2000,
  maxLatencyMs: 10000,
  reliability: 0.95,
  
  // Dependencies
  dependencies: {
    external: ['open_meteo_api'],
    internal: ['find_bunker_ports'],
  },
  
  // Access Control
  agentIds: ['weather_agent', 'bunker_agent'],
  requiresAuth: false,
  rateLimit: {
    calls: 50,
    windowMs: 60000, // 50 calls per minute
  },
  
  // Implementation
  implementation: executePortWeatherTool,
  
  // Monitoring
  metrics: {
    totalCalls: 0,
    successCalls: 0,
    failureCalls: 0,
  },
  
  // Metadata
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date(),
  deprecated: false,
};
