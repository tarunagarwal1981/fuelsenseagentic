/**
 * Orchestrator Tools
 * 
 * Tools used by the Orchestrator Agent to:
 * - Validate vessel names
 * - Check feature availability
 * - Extract query parameters
 */

import { z } from 'zod';

// ============================================================================
// VALIDATE VESSEL NAME TOOL
// ============================================================================

/**
 * Input for vessel name validation
 */
export interface ValidateVesselNameInput {
  /** Vessel name to validate */
  vessel_name: string;
  /** Optional IMO number */
  imo_number?: string;
}

/**
 * Output from vessel name validation
 */
export interface ValidateVesselNameOutput {
  /** Whether vessel was found in database */
  found: boolean;
  /** Vessel name (normalized) */
  vessel_name: string | null;
  /** IMO number if found */
  imo_number: string | null;
  /** Available vessel data if found */
  available_data?: {
    speed_knots?: number;
    consumption_vlsfo_per_day?: number;
    consumption_lsmgo_per_day?: number;
    rob_vlsfo?: number;
    rob_lsmgo?: number;
    tank_capacity_vlsfo?: number;
    tank_capacity_lsmgo?: number;
  };
}

/**
 * Tool schema for validate_vessel_name
 */
export const validateVesselNameToolSchema = {
  name: 'validate_vessel_name',
  description: 'Validate if a vessel name exists in the database and retrieve available vessel data. Returns vessel information if found, including any available speed, consumption, ROB, or tank capacity data.',
  input_schema: {
    type: 'object',
    properties: {
      vessel_name: {
        type: 'string',
        description: 'The vessel name to validate (e.g., "MV Evergreen", "CMA CGM Marco Polo")',
      },
      imo_number: {
        type: 'string',
        description: 'Optional IMO number for more precise identification',
      },
    },
    required: ['vessel_name'],
  },
} as const;

/**
 * Execute validate_vessel_name tool
 * 
 * TODO: Integrate with actual vessel database
 * For now, returns mock data for testing
 */
export async function executeValidateVesselNameTool(
  input: unknown
): Promise<ValidateVesselNameOutput> {
  const params = input as ValidateVesselNameInput;
  const { vessel_name, imo_number } = params;

  // Normalize vessel name (remove common prefixes, trim)
  const normalizedName = vessel_name
    .trim()
    .replace(/^(MV|MS|M\/V|M\/S)\s+/i, '')
    .replace(/^SS\s+/i, '');

  // TODO: Query actual vessel database
  // For now, return mock data for known vessels
  const knownVessels: Record<string, ValidateVesselNameOutput> = {
    'evergreen': {
      found: true,
      vessel_name: 'MV Evergreen',
      imo_number: 'IMO1234567',
      available_data: {
        speed_knots: 14,
        consumption_vlsfo_per_day: 30,
        consumption_lsmgo_per_day: 5,
      },
    },
    'cma cgm marco polo': {
      found: true,
      vessel_name: 'CMA CGM Marco Polo',
      imo_number: 'IMO9876543',
      available_data: {
        speed_knots: 16,
        consumption_vlsfo_per_day: 35,
        consumption_lsmgo_per_day: 3,
      },
    },
  };

  const lookupKey = normalizedName.toLowerCase();
  const vessel = knownVessels[lookupKey];

  if (vessel) {
    return {
      ...vessel,
      vessel_name: vessel.vessel_name,
    };
  }

  // Vessel not found
  return {
    found: false,
    vessel_name: null,
    imo_number: null,
  };
}

// ============================================================================
// CHECK FEATURE AVAILABILITY TOOL
// ============================================================================

/**
 * Input for feature availability check
 */
export interface CheckFeatureAvailabilityInput {
  /** Feature name to check */
  feature_name: string;
}

/**
 * Output from feature availability check
 */
export interface CheckFeatureAvailabilityOutput {
  /** Whether feature is available */
  available: boolean;
  /** Feature name */
  feature_name: string;
  /** Optional message about feature status */
  message?: string;
  /** Alternative features if this one is not available */
  alternatives?: string[];
}

/**
 * Tool schema for check_feature_availability
 */
export const checkFeatureAvailabilityToolSchema = {
  name: 'check_feature_availability',
  description: 'Check if a requested feature is available in the system. Returns availability status and any alternative features if the requested feature is not available.',
  input_schema: {
    type: 'object',
    properties: {
      feature_name: {
        type: 'string',
        description: 'The feature name to check (e.g., "bunker_planning", "cii_analysis", "eu_ets")',
        enum: ['bunker_planning', 'cii_analysis', 'eu_ets', 'combined'],
      },
    },
    required: ['feature_name'],
  },
} as const;

/**
 * Execute check_feature_availability tool
 */
export async function executeCheckFeatureAvailabilityTool(
  input: unknown
): Promise<CheckFeatureAvailabilityOutput> {
  const params = input as CheckFeatureAvailabilityInput;
  const { feature_name } = params;

  // TODO: Check actual feature flags/config
  // For now, all features are available
  const availableFeatures = ['bunker_planning', 'cii_analysis', 'eu_ets', 'combined'];

  if (availableFeatures.includes(feature_name)) {
    return {
      available: true,
      feature_name,
      message: `Feature "${feature_name}" is available`,
    };
  }

  return {
    available: false,
    feature_name,
    message: `Feature "${feature_name}" is not currently available`,
    alternatives: availableFeatures.filter(f => f !== feature_name),
  };
}

// ============================================================================
// EXTRACT QUERY PARAMETERS TOOL
// ============================================================================

/**
 * Input for query parameter extraction
 */
export interface ExtractQueryParametersInput {
  /** User query text */
  query: string;
  /** Conversation history (optional) */
  conversation_history?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

/**
 * Output from query parameter extraction
 */
export interface ExtractQueryParametersOutput {
  /** Extracted vessel name */
  vessel_name: string | null;
  /** Extracted IMO number */
  imo_number: string | null;
  /** Extracted speed in knots */
  speed_knots: number | null;
  /** Extracted consumption (VLSFO) in MT/day */
  consumption_vlsfo_per_day: number | null;
  /** Extracted consumption (LSMGO) in MT/day */
  consumption_lsmgo_per_day: number | null;
  /** Extracted ROB (VLSFO) in MT */
  rob_vlsfo: number | null;
  /** Extracted ROB (LSMGO) in MT */
  rob_lsmgo: number | null;
  /** Extracted tank capacity (VLSFO) in MT */
  tank_capacity_vlsfo: number | null;
  /** Extracted tank capacity (LSMGO) in MT */
  tank_capacity_lsmgo: number | null;
  /** Extracted origin port code */
  origin_port_code: string | null;
  /** Extracted destination port code */
  destination_port_code: string | null;
  /** Confidence level (0-1) */
  confidence: number;
}

/**
 * Tool schema for extract_query_parameters
 */
export const extractQueryParametersToolSchema = {
  name: 'extract_query_parameters',
  description: 'Extract structured parameters from a user query. Identifies vessel name, speed, consumption rates, ROB, tank capacities, and port codes. Returns null for parameters not found in the query.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The user query text to analyze',
      },
      conversation_history: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            role: {
              type: 'string',
              enum: ['user', 'assistant'],
            },
            content: {
              type: 'string',
            },
          },
          required: ['role', 'content'],
        },
        description: 'Optional conversation history for context',
      },
    },
    required: ['query'],
  },
} as const;

/**
 * Execute extract_query_parameters tool
 * 
 * This is a simple regex-based extractor. In production, this would
 * be handled by the LLM itself through structured output.
 */
export async function executeExtractQueryParametersTool(
  input: unknown
): Promise<ExtractQueryParametersOutput> {
  const params = input as ExtractQueryParametersInput;
  const { query } = params;

  // Simple regex-based extraction (LLM will do better)
  const result: ExtractQueryParametersOutput = {
    vessel_name: null,
    imo_number: null,
    speed_knots: null,
    consumption_vlsfo_per_day: null,
    consumption_lsmgo_per_day: null,
    rob_vlsfo: null,
    rob_lsmgo: null,
    tank_capacity_vlsfo: null,
    tank_capacity_lsmgo: null,
    origin_port_code: null,
    destination_port_code: null,
    confidence: 0.5,
  };

  // Extract vessel name (look for common patterns)
  const vesselNameMatch = 
    query.match(/(?:MV|MS|M\/V|M\/S|SS)\s+([A-Za-z0-9\s]+)/i) ||
    query.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:vessel|ship)/i) ||
    query.match(/(?:for|vessel|ship)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i) ||
    query.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)(?:\s+from|\s+to|\s+at|\s+consuming|$)/i);
  if (vesselNameMatch) {
    result.vessel_name = vesselNameMatch[1].trim();
  }

  // Extract IMO number
  const imoMatch = query.match(/IMO[:\s]*(\d{7})/i);
  if (imoMatch) {
    result.imo_number = imoMatch[1];
  }

  // Extract speed
  const speedMatch = query.match(/(\d+(?:\.\d+)?)\s*knots?/i);
  if (speedMatch) {
    result.speed_knots = parseFloat(speedMatch[1]);
  }

  // Extract consumption
  const vlsfoConsumptionMatch = query.match(/(\d+(?:\.\d+)?)\s*MT\/day\s*VLSFO/i);
  if (vlsfoConsumptionMatch) {
    result.consumption_vlsfo_per_day = parseFloat(vlsfoConsumptionMatch[1]);
  }

  const lsmgoConsumptionMatch = query.match(/(\d+(?:\.\d+)?)\s*MT\/day\s*LSMGO/i);
  if (lsmgoConsumptionMatch) {
    result.consumption_lsmgo_per_day = parseFloat(lsmgoConsumptionMatch[1]);
  }

  // Extract ROB
  const robVlsfoMatch = query.match(/(\d+(?:\.\d+)?)\s*MT\s*VLSFO/i);
  if (robVlsfoMatch && query.toLowerCase().includes('rob')) {
    result.rob_vlsfo = parseFloat(robVlsfoMatch[1]);
  }

  const robLsmgoMatch = query.match(/(\d+(?:\.\d+)?)\s*MT\s*LSMGO/i);
  if (robLsmgoMatch && query.toLowerCase().includes('rob')) {
    result.rob_lsmgo = parseFloat(robLsmgoMatch[1]);
  }

  // Extract tank capacity
  const capacityVlsfoMatch = query.match(/(\d+(?:\.\d+)?)\s*MT\s*(?:tank\s*)?capacity\s*VLSFO/i);
  if (capacityVlsfoMatch) {
    result.tank_capacity_vlsfo = parseFloat(capacityVlsfoMatch[1]);
  }

  const capacityLsmgoMatch = query.match(/(\d+(?:\.\d+)?)\s*MT\s*(?:tank\s*)?capacity\s*LSMGO/i);
  if (capacityLsmgoMatch) {
    result.tank_capacity_lsmgo = parseFloat(capacityLsmgoMatch[1]);
  }

  // Extract port codes (UNLOCODE format)
  const portCodeMatch = query.match(/([A-Z]{2}[A-Z0-9]{3})/g);
  if (portCodeMatch && portCodeMatch.length >= 2) {
    result.origin_port_code = portCodeMatch[0];
    result.destination_port_code = portCodeMatch[1];
  }

  return result;
}

