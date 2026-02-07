/**
 * Consumption Profile Fetcher Tool
 *
 * Fetches vessel fuel consumption profiles (baseline profiles):
 * - Speed, consumption (MT/day), power at different operating points
 * - Ballast vs laden consumption differences
 *
 * Uses FuelSense VesselPerformanceModelTable API (BASELINE_PROFILE_API_URL).
 * Used by Machinery Performance Agent and vessel selection.
 */

import { z } from 'zod';
import type { ConsumptionProfile } from '@/lib/types/vessel-performance';
import { ServiceContainer } from '@/lib/repositories/service-container';
import { VesselPerformanceModelClient } from '@/lib/clients/vessel-performance-model-client';

// ============================================================================
// Configuration
// ============================================================================

const vesselPerformanceModelClient = new VesselPerformanceModelClient();

/** Cache for 1 hour (profiles don't change frequently) */
const CACHE_TTL_SECONDS = 3600;

/** Cache key prefix for consumption profiles */
const CACHE_KEY_PREFIX = 'fuelsense:consumption_profile:';

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 10000;

// ============================================================================
// Input Schema
// ============================================================================

const ConsumptionProfileFetcherSchema = z.object({
  imo: z.string().describe('Vessel IMO number (7 digits)'),
  speed: z
    .number()
    .optional()
    .describe(
      'Target speed in knots - returns closest match if specified'
    ),
  weather_condition: z
    .enum(['calm', 'moderate', 'rough', 'very_rough'])
    .optional()
    .describe('Weather condition filter'),
  load_condition: z
    .enum(['ballast', 'laden', 'normal'])
    .optional()
    .describe('Cargo load condition filter'),
});

export type ConsumptionProfileFetcherInput = z.infer<
  typeof ConsumptionProfileFetcherSchema
>;

export const consumptionProfileFetcherInputSchema =
  ConsumptionProfileFetcherSchema;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate cache key for consumption profile lookup
 */
function getCacheKey(params: ConsumptionProfileFetcherInput): string {
  const parts = [
    params.imo.toLowerCase(),
    params.speed?.toString() ?? 'all',
    params.weather_condition ?? 'all',
    params.load_condition ?? 'all',
  ];
  return `${CACHE_KEY_PREFIX}${parts.join(':')}`;
}

/**
 * Validate consumption profile data structure
 */
function validateConsumptionProfile(data: unknown): data is ConsumptionProfile {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  const cons = d.consumption as Record<string, unknown> | undefined;
  return (
    typeof d.imo === 'string' &&
    typeof d.speed === 'number' &&
    typeof d.weather_condition === 'string' &&
    typeof d.load_condition === 'string' &&
    !!cons &&
    typeof cons.main_engine === 'object' &&
    typeof cons.auxiliary_engine === 'object'
  );
}

/**
 * Find closest speed profile if exact match not found
 */
function findClosestSpeedProfile(
  profiles: ConsumptionProfile[],
  targetSpeed: number
): ConsumptionProfile | null {
  if (profiles.length === 0) return null;

  return profiles.reduce((closest, profile) => {
    const closestDiff = Math.abs(closest.speed - targetSpeed);
    const currentDiff = Math.abs(profile.speed - targetSpeed);
    return currentDiff < closestDiff ? profile : closest;
  });
}

/**
 * Calculate total consumption from profile (MT/day)
 */
function calculateTotalConsumption(profile: ConsumptionProfile): number {
  const me = profile.consumption.main_engine;
  const ae = profile.consumption.auxiliary_engine;

  const meTotal =
    (me.vlsfo ?? 0) + (me.lsmgo ?? 0) + (me.hsfo ?? 0) + (me.mgo ?? 0);
  const aeTotal =
    (ae.vlsfo ?? 0) + (ae.lsmgo ?? 0) + (ae.hsfo ?? 0) + (ae.mgo ?? 0);

  return meTotal + aeTotal;
}

// ============================================================================
// Core Fetch Function
// ============================================================================

/**
 * Fetch consumption profiles from API with Redis caching
 */
export async function fetchConsumptionProfiles(
  params: ConsumptionProfileFetcherInput
): Promise<ConsumptionProfile[]> {
  // Check cache first
  const cacheKey = getCacheKey(params);
  const container = ServiceContainer.getInstance();
  const cache = container.getCache();

  const cached = await cache.get<ConsumptionProfile[]>(cacheKey);
  if (cached && Array.isArray(cached) && cached.every(validateConsumptionProfile)) {
    console.log(
      `[CONSUMPTION-PROFILE-TOOL] 📦 Cache hit for IMO ${params.imo} (${cached.length} profiles)`
    );
    return cached;
  }

  try {
    console.log(
      `[CONSUMPTION-PROFILE-TOOL] 🔍 Fetching consumption profiles for IMO ${params.imo}` +
        (params.speed ? ` at ${params.speed}kts` : '') +
        (params.weather_condition ? ` in ${params.weather_condition} conditions` : '') +
        (params.load_condition ? ` (${params.load_condition})` : '')
    );

    let profiles = await vesselPerformanceModelClient.getByIMO(params.imo);

    // Filter by load_condition if specified
    if (params.load_condition) {
      profiles = profiles.filter(
        (p) => p.load_condition === params.load_condition
      );
    }

    // Filter by weather_condition if specified
    if (params.weather_condition) {
      profiles = profiles.filter(
        (p) => p.weather_condition === params.weather_condition
      );
    }

    // Filter by speed if specified (closest match - we filter then pick in findClosestSpeedProfile)
    if (params.speed !== undefined && profiles.length > 1) {
      const closest = findClosestSpeedProfile(profiles, params.speed);
      profiles = closest ? [closest] : profiles;
    }

    const validProfiles = profiles.filter((profile) => {
      const isValid = validateConsumptionProfile(profile);
      if (!isValid) {
        console.warn(
          '[CONSUMPTION-PROFILE-TOOL] ⚠️ Invalid profile data, skipping'
        );
      }
      return isValid;
    });

    // Cache successful response
    await cache.set(cacheKey, validProfiles, CACHE_TTL_SECONDS);

    console.log(
      `[CONSUMPTION-PROFILE-TOOL] ✅ Fetched ${validProfiles.length} profile(s) for IMO ${params.imo}`
    );

    return validProfiles;
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      console.error(
        `[CONSUMPTION-PROFILE-TOOL] ⏱️ Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
      );
      throw new Error('Consumption profile API request timed out');
    }

    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[CONSUMPTION-PROFILE-TOOL] ⏹️ Request aborted');
      throw new Error('Consumption profile API request was aborted');
    }

    console.error(
      '[CONSUMPTION-PROFILE-TOOL] ❌ Error fetching profiles:',
      error
    );
    throw error;
  }
}

// ============================================================================
// Tool Output Types
// ============================================================================

export interface ConsumptionProfileWithMetadata extends ConsumptionProfile {
  total_consumption_mt_per_day: number;
}

export interface ConsumptionProfileFetcherSuccessOutput {
  success: true;
  data: ConsumptionProfileWithMetadata[];
  count: number;
  metadata: {
    imo: string;
    filters_applied: {
      speed?: number;
      weather_condition?: string;
      load_condition?: string;
    };
    recommended_profile_index: number | null;
    fetched_at: string;
  };
}

export interface ConsumptionProfileFetcherErrorOutput {
  success: false;
  error: string;
  imo: string;
  message: string;
  suggestion?: string;
}

export type ConsumptionProfileFetcherOutput =
  | ConsumptionProfileFetcherSuccessOutput
  | ConsumptionProfileFetcherErrorOutput;

// ============================================================================
// Tool Execution Function
// ============================================================================

/**
 * Execute consumption profile fetcher tool
 * Used by LangChain tool binding and ToolRegistry
 */
export async function executeConsumptionProfileFetcherTool(
  args: unknown
): Promise<ConsumptionProfileFetcherOutput> {
  const params = ConsumptionProfileFetcherSchema.parse(args);

  try {
    const profiles = await fetchConsumptionProfiles(params);

    if (profiles.length === 0) {
      return {
        success: false,
        error: 'No consumption profiles found for this vessel',
        imo: params.imo,
        message:
          'Vessel may not have consumption profile data in the database',
        suggestion:
          'Try without speed/weather/load filters for broader results',
      };
    }

    // If speed was specified and we got multiple profiles, find closest match
    let recommendedProfileIndex: number | null = null;
    if (params.speed !== undefined && profiles.length > 1) {
      const recommended = findClosestSpeedProfile(profiles, params.speed);
      if (recommended) {
        recommendedProfileIndex = profiles.indexOf(recommended);
      }
    }

    const profilesWithMetadata: ConsumptionProfileWithMetadata[] = profiles.map(
      (profile) => ({
        ...profile,
        total_consumption_mt_per_day: calculateTotalConsumption(profile),
      })
    );

    return {
      success: true,
      data: profilesWithMetadata,
      count: profiles.length,
      metadata: {
        imo: params.imo,
        filters_applied: {
          speed: params.speed,
          weather_condition: params.weather_condition,
          load_condition: params.load_condition,
        },
        recommended_profile_index: recommendedProfileIndex,
        fetched_at: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error(
      '[CONSUMPTION-PROFILE-TOOL] ❌ Tool execution error:',
      error
    );

    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Unknown error occurred',
      imo: params.imo,
      message:
        'Failed to fetch consumption profiles. API may be unavailable.',
    };
  }
}
