/**
 * Noon Report Fetcher Tool
 *
 * Fetches latest noon report data for vessels including:
 * - Current position (lat/lon)
 * - Next port and ETA
 * - Remaining On Board (ROB) fuel quantities
 * - Current speed
 * - Weather conditions (if available)
 *
 * Used by Machinery Performance Agent for real-time vessel status.
 */

import { z } from 'zod';
import type { NoonReportData } from '@/lib/types/vessel-performance';
import { ServiceContainer } from '@/lib/repositories/service-container';

// ============================================================================
// Configuration
// ============================================================================

const NOON_REPORT_API_ENDPOINT =
  process.env.NOON_REPORT_API_URL || 'https://api.example.com/v1/noon-reports';

const NOON_REPORT_API_KEY = process.env.NOON_REPORT_API_KEY;

/** Cache TTL: 30 minutes (noon reports don't change frequently) */
const CACHE_TTL_SECONDS = 1800;

/** Cache key prefix for noon reports */
const CACHE_KEY_PREFIX = 'fuelsense:noon_report:';

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 10000;

// ============================================================================
// Input Schema
// ============================================================================

const NoonReportFetcherSchema = z
  .object({
    vessel_identifiers: z
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
  .describe('Parameters for fetching noon report');

export type NoonReportFetcherInput = z.infer<typeof NoonReportFetcherSchema>;

export const noonReportFetcherInputSchema = NoonReportFetcherSchema;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate cache key for noon report lookup
 */
function getCacheKey(imo?: string, name?: string): string {
  const identifier = (imo || name || 'unknown').replace(/\s+/g, '_').toLowerCase();
  return `${CACHE_KEY_PREFIX}${identifier}`;
}

/**
 * Calculate age of noon report in hours
 */
function calculateReportAge(timestamp: string): number {
  const reportTime = new Date(timestamp);
  const now = new Date();
  return (now.getTime() - reportTime.getTime()) / (1000 * 60 * 60);
}

/**
 * Assess data quality based on report age
 */
function assessDataQuality(reportAgeHours: number): 'high' | 'medium' | 'low' {
  if (reportAgeHours < 6) return 'high';
  if (reportAgeHours < 24) return 'medium';
  return 'low';
}

/**
 * Validate noon report data structure
 */
function validateNoonReport(data: unknown): data is NoonReportData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  const pos = d.position as Record<string, unknown> | undefined;
  const rob = d.rob as Record<string, unknown> | undefined;
  return (
    typeof d.imo === 'string' &&
    typeof d.vessel_name === 'string' &&
    !!pos &&
    typeof pos.latitude === 'number' &&
    typeof pos.longitude === 'number' &&
    !!rob &&
    typeof rob.vlsfo === 'number' &&
    typeof rob.lsmgo === 'number' &&
    typeof d.speed === 'number'
  );
}

// ============================================================================
// Core Fetch Function
// ============================================================================

/**
 * Fetch noon report from API with Redis caching
 */
export async function fetchNoonReport(
  vessel_identifiers: NoonReportFetcherInput['vessel_identifiers']
): Promise<NoonReportData | null> {
  const { imo, name } = vessel_identifiers;

  // Check cache first
  const cacheKey = getCacheKey(imo, name);
  const container = ServiceContainer.getInstance();
  const cache = container.getCache();

  const cached = await cache.get<NoonReportData>(cacheKey);
  if (cached && validateNoonReport(cached)) {
    const reportAge = calculateReportAge(cached.timestamp);
    console.log(
      `[NOON-REPORT-TOOL] 📦 Cache hit for ${imo || name} (age: ${reportAge.toFixed(1)}h)`
    );
    return cached;
  }

  try {
    // Build query parameters
    const params = new URLSearchParams();
    if (imo) params.append('imo', imo);
    if (name) params.append('vessel_name', name);
    params.append('latest', 'true');

    const url = `${NOON_REPORT_API_ENDPOINT}?${params.toString()}`;

    console.log(
      `[NOON-REPORT-TOOL] 🔍 Fetching noon report for: ${imo || name}`
    );

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (NOON_REPORT_API_KEY) {
      headers['Authorization'] = `Bearer ${NOON_REPORT_API_KEY}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    // Handle 404 - vessel not found
    if (response.status === 404) {
      console.warn(
        `[NOON-REPORT-TOOL] ⚠️ No noon report found for: ${imo || name}`
      );
      return null;
    }

    if (!response.ok) {
      throw new Error(
        `API returned ${response.status}: ${response.statusText}`
      );
    }

    const data = (await response.json()) as NoonReportData;

    if (!validateNoonReport(data)) {
      throw new Error('Invalid noon report data structure from API');
    }

    // Cache successful response
    await cache.set(cacheKey, data, CACHE_TTL_SECONDS);

    const reportAge = calculateReportAge(data.timestamp);
    const quality = assessDataQuality(reportAge);

    console.log(
      `[NOON-REPORT-TOOL] ✅ Fetched noon report for ${data.vessel_name} (${data.imo}) - ` +
        `Age: ${reportAge.toFixed(1)}h, Quality: ${quality}`
    );

    return data;
  } catch (error) {
    // Handle timeout
    if (error instanceof Error && error.name === 'TimeoutError') {
      console.error(
        `[NOON-REPORT-TOOL] ⏱️ Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
      );
      throw new Error('Noon report API request timed out');
    }

    // Handle abort (e.g., user cancelled)
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[NOON-REPORT-TOOL] ⏹️ Request aborted');
      throw new Error('Noon report API request was aborted');
    }

    console.error('[NOON-REPORT-TOOL] ❌ Error fetching noon report:', error);
    throw error;
  }
}

// ============================================================================
// Tool Output Types
// ============================================================================

export interface NoonReportFetcherSuccessOutput {
  success: true;
  data: NoonReportData;
  metadata: {
    report_age_hours: number;
    data_quality: 'high' | 'medium' | 'low';
    fetched_at: string;
    from_cache?: boolean;
  };
}

export interface NoonReportFetcherErrorOutput {
  success: false;
  error: string;
  vessel_identifiers: NoonReportFetcherInput['vessel_identifiers'];
  message: string;
}

export type NoonReportFetcherOutput =
  | NoonReportFetcherSuccessOutput
  | NoonReportFetcherErrorOutput;

// ============================================================================
// Tool Execution Function
// ============================================================================

/**
 * Execute noon report fetcher tool
 * Used by LangChain tool binding and ToolRegistry
 */
export async function executeNoonReportFetcherTool(
  args: unknown
): Promise<NoonReportFetcherOutput> {
  const validated = NoonReportFetcherSchema.parse(args);
  const { vessel_identifiers } = validated;

  try {
    const report = await fetchNoonReport(vessel_identifiers);

    if (!report) {
      return {
        success: false,
        error: 'No noon report found for this vessel',
        vessel_identifiers,
        message:
          'Vessel may not exist or has not submitted a recent noon report',
      };
    }

    const reportAgeHours = calculateReportAge(report.timestamp);
    const dataQuality = assessDataQuality(reportAgeHours);

    return {
      success: true,
      data: report,
      metadata: {
        report_age_hours: reportAgeHours,
        data_quality: dataQuality,
        fetched_at: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('[NOON-REPORT-TOOL] ❌ Tool execution error:', error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Unknown error occurred',
      vessel_identifiers,
      message:
        'Failed to fetch noon report. API may be unavailable or vessel not found.',
    };
  }
}
