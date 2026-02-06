/**
 * Vessel Specification Fetcher Tool
 *
 * Fetches vessel master data including:
 * - Vessel name and IMO
 * - Vessel type (Bulk Carrier, Container Ship, etc.)
 * - Deadweight tonnage (DWT)
 * - Flag state
 * - Build year
 * - Operator/manager (if available)
 *
 * Used by both Hull and Machinery Performance agents for vessel context.
 */

import { z } from 'zod';
import type { VesselBasicInfo } from '@/lib/types/vessel-performance';
import { ServiceContainer } from '@/lib/repositories/service-container';

// ============================================================================
// Configuration
// ============================================================================

const VESSEL_MASTER_API_ENDPOINT =
  process.env.VESSEL_MASTER_API_URL || 'https://api.example.com/v1/vessels';

const VESSEL_MASTER_API_KEY = process.env.VESSEL_MASTER_API_KEY;

/** Cache for 24 hours (vessel specs are static) */
const CACHE_TTL_SECONDS = 86400;

/** Cache key prefix for vessel specs */
const CACHE_KEY_PREFIX = 'fuelsense:vessel_spec:';

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 10000;

// ============================================================================
// Input Schema
// ============================================================================

const VesselSpecFetcherSchema = z
  .object({
    vessel_identifier: z
      .object({
        imo: z
          .string()
          .optional()
          .describe('IMO number (7 digits, e.g., "9876543")'),
        name: z
          .string()
          .optional()
          .describe('Vessel name (e.g., "OCEAN PRIDE")'),
      })
      .refine(
        (data) => data.imo || data.name,
        'At least one identifier (IMO or vessel name) must be provided'
      ),
  })
  .describe('Parameters for fetching vessel specifications');

export type VesselSpecFetcherInput = z.infer<typeof VesselSpecFetcherSchema>;

export const vesselSpecFetcherInputSchema = VesselSpecFetcherSchema;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate cache key for vessel spec lookup
 */
function getCacheKey(imo?: string, name?: string): string {
  const identifier = (imo || name || 'unknown').replace(/\s+/g, '_').toLowerCase();
  return `${CACHE_KEY_PREFIX}${identifier}`;
}

/**
 * Validate vessel spec data structure
 */
function validateVesselSpec(data: unknown): data is VesselBasicInfo {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.name === 'string' &&
    typeof d.imo === 'string' &&
    typeof d.type === 'string' &&
    typeof d.dwt === 'number' &&
    typeof d.flag === 'string' &&
    typeof d.built === 'number'
  );
}

// ============================================================================
// Core Fetch Function
// ============================================================================

/**
 * Fetch vessel specifications from API with Redis caching
 */
export async function fetchVesselSpecs(
  vessel_identifier: VesselSpecFetcherInput['vessel_identifier']
): Promise<VesselBasicInfo | null> {
  const { imo, name } = vessel_identifier;

  // Check cache first
  const cacheKey = getCacheKey(imo, name);
  const container = ServiceContainer.getInstance();
  const cache = container.getCache();

  const cached = await cache.get<VesselBasicInfo>(cacheKey);
  if (cached && validateVesselSpec(cached)) {
    console.log(
      `[VESSEL-SPEC-TOOL] 📦 Cache hit for ${imo || name} (${cached.name})`
    );
    return cached;
  }

  try {
    // Build query parameters
    const params = new URLSearchParams();
    if (imo) params.append('imo', imo);
    if (name) params.append('name', name);

    const url = `${VESSEL_MASTER_API_ENDPOINT}?${params.toString()}`;

    console.log(
      `[VESSEL-SPEC-TOOL] 🔍 Fetching vessel specs for: ${imo || name}`
    );

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (VESSEL_MASTER_API_KEY) {
      headers['Authorization'] = `Bearer ${VESSEL_MASTER_API_KEY}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    // Handle 404 - vessel not found
    if (response.status === 404) {
      console.warn(
        `[VESSEL-SPEC-TOOL] ⚠️ Vessel not found: ${imo || name}`
      );
      return null;
    }

    if (!response.ok) {
      throw new Error(
        `API returned ${response.status}: ${response.statusText}`
      );
    }

    const data = (await response.json()) as VesselBasicInfo;

    if (!validateVesselSpec(data)) {
      throw new Error('Invalid vessel specification data structure from API');
    }

    // Cache successful response
    await cache.set(cacheKey, data, CACHE_TTL_SECONDS);

    console.log(
      `[VESSEL-SPEC-TOOL] ✅ Fetched specs for ${data.name} (${data.imo}) - ` +
        `Type: ${data.type}, DWT: ${data.dwt}, Built: ${data.built}`
    );

    return data;
  } catch (error) {
    // Handle timeout
    if (error instanceof Error && error.name === 'TimeoutError') {
      console.error(
        `[VESSEL-SPEC-TOOL] ⏱️ Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
      );
      throw new Error('Vessel specification API request timed out');
    }

    // Handle abort
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[VESSEL-SPEC-TOOL] ⏹️ Request aborted');
      throw new Error('Vessel specification API request was aborted');
    }

    console.error('[VESSEL-SPEC-TOOL] ❌ Error fetching vessel specs:', error);
    throw error;
  }
}

// ============================================================================
// Tool Output Types
// ============================================================================

export interface VesselSpecFetcherSuccessOutput {
  success: true;
  data: VesselBasicInfo;
  metadata: {
    vessel_age_years: number;
    fetched_at: string;
  };
}

export interface VesselSpecFetcherErrorOutput {
  success: false;
  error: string;
  vessel_identifier: VesselSpecFetcherInput['vessel_identifier'];
  message: string;
}

export type VesselSpecFetcherOutput =
  | VesselSpecFetcherSuccessOutput
  | VesselSpecFetcherErrorOutput;

// ============================================================================
// Tool Execution Function
// ============================================================================

/**
 * Execute vessel spec fetcher tool
 * Used by LangChain tool binding and ToolRegistry
 */
export async function executeVesselSpecFetcherTool(
  args: unknown
): Promise<VesselSpecFetcherOutput> {
  const validated = VesselSpecFetcherSchema.parse(args);
  const { vessel_identifier } = validated;

  try {
    const specs = await fetchVesselSpecs(vessel_identifier);

    if (!specs) {
      return {
        success: false,
        error: 'Vessel not found in master database',
        vessel_identifier,
        message: 'The vessel may not be registered or IMO/name is incorrect',
      };
    }

    const vesselAgeYears = new Date().getFullYear() - specs.built;

    return {
      success: true,
      data: specs,
      metadata: {
        vessel_age_years: vesselAgeYears,
        fetched_at: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('[VESSEL-SPEC-TOOL] ❌ Tool execution error:', error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Unknown error occurred',
      vessel_identifier,
      message:
        'Failed to fetch vessel specifications. API may be unavailable or vessel not found.',
    };
  }
}
