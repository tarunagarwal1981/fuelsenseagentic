/**
 * Vessel Performance Tools Definitions
 *
 * Tool definitions for noon report fetching, vessel specs, and vessel status.
 * Used by Hull and Machinery Performance agents.
 */

import type { ToolDefinition } from '@/lib/types/tool-registry';
import { executeNoonReportFetcherTool } from '@/lib/tools/vessel-performance/noon-report-fetcher';
import { executeVesselSpecFetcherTool } from '@/lib/tools/vessel-performance/vessel-spec-fetcher';
import { executeConsumptionProfileFetcherTool } from '@/lib/tools/vessel-performance/consumption-profile-fetcher';

/**
 * Fetch Noon Report Tool Definition
 *
 * Fetches latest noon report data including position, ROB, and vessel status.
 */
export const fetchNoonReportTool: ToolDefinition = {
  // Identity
  id: 'fetch_noon_report',
  name: 'Noon Report Fetcher',
  description:
    'Fetches latest noon report data for vessels including current position (lat/lon), next port and ETA, Remaining on Board (ROB) fuel quantities (VLSFO, LSMGO, etc.), current speed, weather conditions, and distance to next port. Use when you need real-time vessel position, current fuel levels (ROB), vessel route/destination information, or recent operational data.',
  version: '1.0.0',

  // Classification
  category: 'vessel',
  domain: ['vessel_performance', 'machinery_performance', 'rob_tracking'],

  // Schema - convert Zod schema to JSON Schema for registry
  inputSchema: {
    type: 'object',
    properties: {
      vessel_identifiers: {
        type: 'object',
        description: 'Vessel identification - provide IMO and/or vessel name',
        properties: {
          imo: {
            type: 'string',
            description: 'IMO number (7 digits, e.g., "9876543")',
          },
          name: {
            type: 'string',
            description: 'Vessel name (e.g., "OCEAN PRIDE")',
          },
        },
        required: [],
      },
    },
    required: ['vessel_identifiers'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the fetch succeeded',
      },
      data: {
        type: 'object',
        description: 'Noon report data when success is true',
        properties: {
          timestamp: { type: 'string' },
          imo: { type: 'string' },
          vessel_name: { type: 'string' },
          position: {
            type: 'object',
            properties: {
              latitude: { type: 'number' },
              longitude: { type: 'number' },
            },
          },
          rob: {
            type: 'object',
            properties: {
              vlsfo: { type: 'number' },
              lsmgo: { type: 'number' },
              hsfo: { type: 'number' },
              mgo: { type: 'number' },
            },
          },
          speed: { type: 'number' },
        },
      },
      metadata: {
        type: 'object',
        description: 'Report age and data quality metrics',
        properties: {
          report_age_hours: { type: 'number' },
          data_quality: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
          },
          fetched_at: { type: 'string' },
        },
      },
      error: {
        type: 'string',
        description: 'Error message when success is false',
      },
      message: {
        type: 'string',
        description: 'Human-readable message',
      },
    },
    required: [],
  },

  // Operational Metadata
  cost: 'api_call',
  avgLatencyMs: 1500,
  maxLatencyMs: 10000,
  reliability: 0.95,

  // Dependencies
  dependencies: {
    external: ['noon_report_api'],
    internal: [],
  },

  // Access Control
  agentIds: ['machinery_performance_agent', 'bunker_agent'],
  requiresAuth: false,

  // Implementation
  implementation: executeNoonReportFetcherTool,

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
 * Fetch Vessel Specs Tool Definition
 *
 * Fetches vessel master data including type, DWT, flag, and build information.
 */
export const fetchVesselSpecsTool: ToolDefinition = {
  // Identity
  id: 'fetch_vessel_specs',
  name: 'Vessel Specification Fetcher',
  description:
    'Fetches vessel master data and specifications by IMO or vessel name. Returns vessel name, IMO, type (e.g., Bulk Carrier, Container Ship, Tanker), deadweight tonnage (DWT), flag state, build year, and operator/manager when available. Use when you need basic vessel identification, type and size specifications, vessel age and flag information, or context about the vessel for analysis.',
  version: '1.0.0',

  // Classification
  category: 'vessel',
  domain: ['vessel_performance', 'machinery_performance', 'hull_performance'],

  // Schema
  inputSchema: {
    type: 'object',
    properties: {
      vessel_identifier: {
        type: 'object',
        description: 'Vessel identification - provide IMO and/or vessel name',
        properties: {
          imo: {
            type: 'string',
            description: 'IMO number (7 digits, e.g., "9876543")',
          },
          name: {
            type: 'string',
            description: 'Vessel name (e.g., "OCEAN PRIDE")',
          },
        },
        required: [],
      },
    },
    required: ['vessel_identifier'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the fetch succeeded',
      },
      data: {
        type: 'object',
        description: 'Vessel specification data when success is true',
        properties: {
          name: { type: 'string' },
          imo: { type: 'string' },
          type: { type: 'string' },
          dwt: { type: 'number' },
          flag: { type: 'string' },
          built: { type: 'number' },
          operator: { type: 'string' },
          call_sign: { type: 'string' },
        },
      },
      metadata: {
        type: 'object',
        description: 'Vessel age and fetch metadata',
        properties: {
          vessel_age_years: { type: 'number' },
          fetched_at: { type: 'string' },
        },
      },
      error: {
        type: 'string',
        description: 'Error message when success is false',
      },
      message: {
        type: 'string',
        description: 'Human-readable message',
      },
    },
    required: [],
  },

  // Operational Metadata
  cost: 'api_call',
  avgLatencyMs: 1200,
  maxLatencyMs: 10000,
  reliability: 0.95,

  // Dependencies
  dependencies: {
    external: ['vessel_master_api'],
    internal: [],
  },

  // Access Control
  agentIds: ['machinery_performance_agent', 'hull_performance_agent', 'bunker_agent'],
  requiresAuth: false,

  // Implementation
  implementation: executeVesselSpecFetcherTool,

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
 * Fetch Consumption Profile Tool Definition
 *
 * Fetches vessel fuel consumption profiles at different speeds and weather conditions.
 */
export const fetchConsumptionProfileTool: ToolDefinition = {
  // Identity
  id: 'fetch_consumption_profile',
  name: 'Consumption Profile Fetcher',
  description:
    'Fetches vessel fuel consumption profiles showing main engine and auxiliary engine consumption rates at different speeds, weather conditions (calm, moderate, rough, very rough), and load conditions (ballast, laden, normal). Use when you need to predict fuel consumption for a voyage, calculate fuel endurance, compare actual vs expected consumption, optimize vessel speed for fuel efficiency, or identify consumption anomalies.',
  version: '1.0.0',

  // Classification
  category: 'vessel',
  domain: ['vessel_performance', 'machinery_performance', 'fuel_efficiency'],

  // Schema
  inputSchema: {
    type: 'object',
    properties: {
      imo: {
        type: 'string',
        description: 'Vessel IMO number (7 digits)',
      },
      speed: {
        type: 'number',
        description: 'Target speed in knots - returns closest match if specified',
      },
      weather_condition: {
        type: 'string',
        enum: ['calm', 'moderate', 'rough', 'very_rough'],
        description: 'Weather condition filter',
      },
      load_condition: {
        type: 'string',
        enum: ['ballast', 'laden', 'normal'],
        description: 'Cargo load condition filter',
      },
    },
    required: ['imo'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the fetch succeeded',
      },
      data: {
        type: 'array',
        description: 'Array of consumption profiles with total_consumption_mt_per_day',
        items: {
          type: 'object',
          properties: {
            imo: { type: 'string' },
            speed: { type: 'number' },
            weather_condition: { type: 'string' },
            load_condition: { type: 'string' },
            consumption: {
              type: 'object',
              properties: {
                main_engine: { type: 'object' },
                auxiliary_engine: { type: 'object' },
              },
            },
            total_consumption_mt_per_day: { type: 'number' },
          },
        },
      },
      count: {
        type: 'number',
        description: 'Number of profiles returned',
      },
      metadata: {
        type: 'object',
        description: 'Filters applied and recommended profile index',
        properties: {
          imo: { type: 'string' },
          filters_applied: { type: 'object' },
          recommended_profile_index: { type: 'number', description: 'Index of closest speed match, or null' },
          fetched_at: { type: 'string' },
        },
      },
      error: {
        type: 'string',
        description: 'Error message when success is false',
      },
      message: {
        type: 'string',
        description: 'Human-readable message',
      },
      suggestion: {
        type: 'string',
        description: 'Suggestion when no profiles found',
      },
    },
    required: [],
  },

  // Operational Metadata
  cost: 'api_call',
  avgLatencyMs: 1500,
  maxLatencyMs: 10000,
  reliability: 0.95,

  // Dependencies
  dependencies: {
    external: ['consumption_profile_api'],
    internal: [],
  },

  // Access Control
  agentIds: ['machinery_performance_agent', 'hull_performance_agent', 'bunker_agent'],
  requiresAuth: false,

  // Implementation
  implementation: executeConsumptionProfileFetcherTool,

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
