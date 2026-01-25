/**
 * Bunker Tools Definitions
 * 
 * Tool definitions for bunker port finding, price fetching, and analysis.
 * These tools are used by the bunker_agent.
 */

import type { ToolDefinition } from '@/lib/types/tool-registry';
import { executePortFinderTool } from '@/lib/tools/port-finder';
import { executePriceFetcherTool } from '@/lib/tools/price-fetcher';
import { executeBunkerAnalyzerTool } from '@/lib/tools/bunker-analyzer';

/**
 * Find Bunker Ports Tool Definition
 * 
 * Finds bunker ports along a maritime route within a specified deviation distance.
 */
export const findBunkerPortsTool: ToolDefinition = {
  // Identity
  id: 'find_bunker_ports',
  name: 'Bunker Port Finder',
  description: 'Find bunker ports along a maritime route within a specified deviation distance. Calculates distances from route waypoints to available ports, uses Haversine formula for accurate distance calculations, returns ports sorted by distance from route, and includes port capabilities and fuel types.',
  version: '1.0.0',
  
  // Classification
  category: 'bunker',
  domain: ['bunker_planning', 'port_analysis'],
  
  // Schema
  inputSchema: {
    type: 'object',
    properties: {
      route_waypoints: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            lat: {
              type: 'number',
              description: 'Latitude in decimal degrees (-90 to 90)',
            },
            lon: {
              type: 'number',
              description: 'Longitude in decimal degrees (-180 to 180)',
            },
          },
          required: ['lat', 'lon'],
        },
        description: 'Array of waypoint coordinates from calculate_route result',
      },
      max_deviation_nm: {
        type: 'number',
        description: 'Maximum deviation distance in nautical miles (default: 150)',
      },
    },
    required: ['route_waypoints'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      ports: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            port: {
              type: 'object',
              properties: {
                port_code: { type: 'string' },
                name: { type: 'string' },
                country: { type: 'string' },
                coordinates: {
                  type: 'object',
                  properties: {
                    lat: { type: 'number' },
                    lon: { type: 'number' },
                  },
                },
                fuel_capabilities: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
            distance_from_route_nm: { type: 'number' },
            nearest_waypoint_index: { type: 'number' },
            nearest_waypoint: {
              type: 'object',
              properties: {
                lat: { type: 'number' },
                lon: { type: 'number' },
              },
            },
          },
        },
        description: 'Array of found ports with distance information',
      },
      waypoints_analyzed: { type: 'number' },
      max_deviation_nm: { type: 'number' },
      total_ports_found: { type: 'number' },
    },
  },
  
  // Operational Metadata
  cost: 'free',
  avgLatencyMs: 200,
  maxLatencyMs: 2000,
  reliability: 1.0,
  
  // Dependencies
  dependencies: {
    external: [],
    internal: ['calculate_route'],
  },
  
  // Access Control
  agentIds: ['bunker_agent'],
  requiresAuth: false,
  
  // Implementation
  implementation: executePortFinderTool,
  
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
 * Get Fuel Prices Tool Definition
 * 
 * Fetches current fuel prices for specified ports.
 */
export const getFuelPricesTool: ToolDefinition = {
  // Identity
  id: 'get_fuel_prices',
  name: 'Fuel Price Fetcher',
  description: 'Fetch current fuel prices for specified ports. Retrieves prices for VLSFO, LSGO, and MGO fuel types, includes price freshness indicators, returns prices in USD per metric ton, and handles multiple ports in a single call.',
  version: '1.0.0',
  
  // Classification
  category: 'bunker',
  domain: ['bunker_planning', 'price_analysis'],
  
  // Schema
  inputSchema: {
    type: 'object',
    properties: {
      port_codes: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Array of port codes in UNLOCODE format (e.g., ["SGSIN", "NLRTM"])',
      },
      fuel_types: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['VLSFO', 'LSGO', 'MGO'],
        },
        description: 'Optional array of fuel types to fetch (default: all types)',
      },
    },
    required: ['port_codes'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      prices_by_port: {
        type: 'object',
        additionalProperties: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              price: {
                type: 'object',
                properties: {
                  port_code: { type: 'string' },
                  fuel_type: { type: 'string' },
                  price_per_mt: { type: 'number' },
                  currency: { type: 'string' },
                  last_updated: { type: 'string' },
                },
              },
              is_fresh: { type: 'boolean' },
            },
          },
        },
        description: 'Object mapping port codes to price arrays',
      },
    },
  },
  
  // Operational Metadata
  cost: 'free',
  avgLatencyMs: 50,
  maxLatencyMs: 500,
  reliability: 1.0,
  
  // Dependencies
  dependencies: {
    external: [],
    internal: ['find_bunker_ports'],
  },
  
  // Access Control
  agentIds: ['bunker_agent'],
  requiresAuth: false,
  
  // Implementation
  implementation: executePriceFetcherTool,
  
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
 * Analyze Bunker Options Tool Definition
 * 
 * Analyzes and ranks bunker port options based on total cost.
 */
export const analyzeBunkerOptionsTool: ToolDefinition = {
  // Identity
  id: 'analyze_bunker_options',
  name: 'Bunker Options Analyzer',
  description: 'Analyze and rank bunker port options based on total cost (fuel cost + deviation cost). Calculates total cost including fuel cost and deviation cost, ranks ports by total cost (cheapest first), calculates potential savings vs worst option, and provides detailed cost breakdown for each option.',
  version: '1.0.0',
  
  // Classification
  category: 'bunker',
  domain: ['bunker_planning', 'cost_optimization'],
  
  // Schema
  inputSchema: {
    type: 'object',
    properties: {
      bunker_ports: {
        type: 'array',
        items: {
          type: 'object',
        },
        description: 'Array of found ports from find_bunker_ports',
      },
      port_prices: {
        type: 'object',
        description: 'Price data from get_fuel_prices',
      },
      fuel_quantity_mt: {
        type: 'number',
        description: 'Fuel quantity needed in metric tons',
      },
      fuel_type: {
        type: 'string',
        enum: ['VLSFO', 'LSGO', 'MGO'],
        description: 'Optional fuel type (default: VLSFO)',
      },
      vessel_speed_knots: {
        type: 'number',
        description: 'Optional vessel speed for deviation time calculation (default: 14)',
      },
      vessel_consumption_mt_per_day: {
        type: 'number',
        description: 'Optional consumption for deviation fuel cost (default: 35)',
      },
    },
    required: ['bunker_ports', 'port_prices', 'fuel_quantity_mt'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      recommendations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            port_code: { type: 'string' },
            port_name: { type: 'string' },
            distance_from_route_nm: { type: 'number' },
            fuel_cost_usd: { type: 'number' },
            deviation_cost_usd: { type: 'number' },
            total_cost_usd: { type: 'number' },
            rank: { type: 'number' },
            savings_vs_worst_usd: { type: 'number' },
          },
        },
        description: 'Array of ranked recommendations',
      },
      best_option: { type: 'object' },
      worst_option: { type: 'object' },
      max_savings_usd: { type: 'number' },
      analysis_summary: { type: 'string' },
    },
  },
  
  // Operational Metadata
  cost: 'free',
  avgLatencyMs: 150,
  maxLatencyMs: 1000,
  reliability: 1.0,
  
  // Dependencies
  dependencies: {
    external: [],
    internal: ['find_bunker_ports', 'get_fuel_prices'],
  },
  
  // Access Control
  agentIds: ['bunker_agent'],
  requiresAuth: false,
  
  // Implementation
  implementation: executeBunkerAnalyzerTool,
  
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
