/**
 * Routing Tools Definitions
 * 
 * Tool definitions for route calculation and weather timeline generation.
 * These tools are used by the route_agent.
 */

import type { ToolDefinition } from '@/lib/types/tool-registry';
import { executeRouteCalculatorTool } from '@/lib/tools/route-calculator';
import { executeWeatherTimelineTool } from '@/lib/tools/weather-timeline';

/**
 * Calculate Route Tool Definition
 * 
 * Calculates optimal maritime route between two ports using SeaRoute API.
 */
export const calculateRouteTool: ToolDefinition = {
  // Identity
  id: 'calculate_route',
  name: 'Route Calculator',
  description: 'Calculate the optimal maritime route between two ports using the Maritime Route API. Calculates distance in nautical miles, estimates voyage time in hours, returns waypoint coordinates along the route, and identifies route type (e.g., "via Suez Canal", "direct route").',
  version: '1.0.0',
  
  // Classification
  category: 'routing',
  domain: ['bunker_planning', 'voyage_planning'],
  
  // Schema
  inputSchema: {
    type: 'object',
    properties: {
      origin_port_code: {
        type: 'string',
        description: 'Origin port code in UNLOCODE format (e.g., SGSIN for Singapore)',
      },
      destination_port_code: {
        type: 'string',
        description: 'Destination port code in UNLOCODE format (e.g., NLRTM for Rotterdam)',
      },
      vessel_speed_knots: {
        type: 'number',
        description: 'Optional vessel speed in knots (default: 14)',
      },
    },
    required: ['origin_port_code', 'destination_port_code'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      distance_nm: {
        type: 'number',
        description: 'Distance in nautical miles',
      },
      estimated_hours: {
        type: 'number',
        description: 'Estimated travel time in hours',
      },
      waypoints: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            lat: { type: 'number' },
            lon: { type: 'number' },
          },
        },
        description: 'Array of waypoint coordinates along the route',
      },
      route_type: {
        type: 'string',
        description: 'Description of route type',
      },
      origin_port_code: {
        type: 'string',
        description: 'Origin port code',
      },
      destination_port_code: {
        type: 'string',
        description: 'Destination port code',
      },
    },
    required: [],
  },
  
  // Operational Metadata
  cost: 'api_call',
  avgLatencyMs: 2000,
  maxLatencyMs: 10000,
  reliability: 0.98,
  
  // Dependencies
  dependencies: {
    external: ['maritime_route_api'],
    internal: [],
  },
  
  // Access Control
  agentIds: ['route_agent'],
  requiresAuth: false,
  rateLimit: {
    calls: 100,
    windowMs: 60000, // 100 calls per minute
  },
  
  // Implementation
  implementation: executeRouteCalculatorTool,
  
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
 * Calculate Weather Timeline Tool Definition
 * 
 * Calculates vessel position at regular intervals along a route.
 */
export const calculateWeatherTimelineTool: ToolDefinition = {
  // Identity
  id: 'calculate_weather_timeline',
  name: 'Weather Timeline Calculator',
  description: 'Calculate vessel position at regular intervals along a maritime route. Takes waypoints from route calculation, generates positions at regular time intervals, tracks cumulative distance and datetime from departure, and uses Haversine formula for accurate distance calculations.',
  version: '1.0.0',
  
  // Classification
  category: 'routing',
  domain: ['bunker_planning', 'voyage_planning', 'weather_analysis'],
  
  // Schema
  inputSchema: {
    type: 'object',
    properties: {
      waypoints: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            lat: { type: 'number', description: 'Latitude in decimal degrees' },
            lon: { type: 'number', description: 'Longitude in decimal degrees' },
          },
          required: ['lat', 'lon'],
        },
        description: 'Array of waypoint coordinates from calculate_route result',
      },
      vessel_speed_knots: {
        type: 'number',
        description: 'Vessel speed in knots (5-30 knots)',
      },
      departure_datetime: {
        type: 'string',
        description: 'Departure datetime in ISO 8601 format (e.g., "2024-12-25T08:00:00Z")',
      },
      sampling_interval_hours: {
        type: 'number',
        description: 'Optional sampling interval in hours (default: 12)',
      },
    },
    required: ['waypoints', 'vessel_speed_knots', 'departure_datetime'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      positions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            lat: { type: 'number' },
            lon: { type: 'number' },
            datetime: { type: 'string' },
            distance_from_start_nm: { type: 'number' },
            segment_index: { type: 'number' },
          },
        },
        description: 'Array of positions with coordinates, datetime, cumulative distance, and segment index',
      },
    },
    required: [],
  },
  
  // Operational Metadata
  cost: 'free',
  avgLatencyMs: 50,
  maxLatencyMs: 500,
  reliability: 1.0,
  
  // Dependencies
  dependencies: {
    external: [],
    internal: ['calculate_route'],
  },
  
  // Access Control
  agentIds: ['route_agent'],
  requiresAuth: false,
  
  // Implementation
  implementation: executeWeatherTimelineTool,
  
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
