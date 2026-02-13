/**
 * Hull Performance Fetcher Tool
 *
 * Fetches hull performance analysis for a vessel (IMO or name):
 * - Hull condition (GOOD / AVERAGE / POOR)
 * - Latest metrics, component breakdown, CII impact
 * - Trend data and optional baseline curves
 *
 * Uses HullPerformanceService (repository + API with Redis cache).
 */

import { z } from 'zod';
import type { HullPerformanceAnalysis } from '@/lib/services/hull-performance-service';
import { HullPerformanceClient } from '@/lib/api-clients/hull-performance-client';
import { HullPerformanceRepository } from '@/lib/repositories/hull-performance-repository';
import { HullPerformanceService } from '@/lib/services/hull-performance-service';
import { ServiceContainer } from '@/lib/repositories/service-container';
import { RedisCache } from '@/lib/repositories/cache-client';
import { logCustomEvent, logError } from '@/lib/monitoring/axiom-logger';

// ============================================================================
// Input schema
// ============================================================================

const fetchHullPerformanceInputSchema = z
  .object({
    vessel_identifier: z
      .object({
        imo: z.string().optional(),
        name: z.string().optional(),
      })
      .refine((data) => data.imo || data.name, {
        message: 'Either IMO or vessel name must be provided',
      }),
    time_period: z
      .object({
        days: z.number().optional().default(90),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
      })
      .optional(),
  })
  .describe('Parameters for fetching hull performance analysis');

export type FetchHullPerformanceInput = z.infer<
  typeof fetchHullPerformanceInputSchema
>;

export { fetchHullPerformanceInputSchema };

// ============================================================================
// Output type
// ============================================================================

export interface FetchHullPerformanceOutput {
  success: boolean;
  data?: HullPerformanceAnalysis;
  error?: string;
  message?: string;
}

// ============================================================================
// Tool execution context (e.g. from agent/graph)
// ============================================================================

export interface ToolExecutionContext {
  correlationId?: string;
  threadId?: string;
  [key: string]: unknown;
}

// ============================================================================
// Core fetch function
// ============================================================================

/**
 * Fetch hull performance analysis for a vessel.
 * Validates input, initializes service (repository + client + cache), calls service.
 */
export async function fetchHullPerformance(
  input: FetchHullPerformanceInput,
  correlationId: string
): Promise<FetchHullPerformanceOutput> {
  const vesselIdentifier = {
    imo: input.vessel_identifier.imo,
    name: input.vessel_identifier.name,
  };

  const options: {
    days?: number;
    startDate?: string;
    endDate?: string;
    includeBaseline?: boolean;
  } = {};

  if (input.time_period) {
    if (input.time_period.days != null) options.days = input.time_period.days;
    if (input.time_period.start_date != null)
      options.startDate = input.time_period.start_date;
    if (input.time_period.end_date != null)
      options.endDate = input.time_period.end_date;
  }
  options.includeBaseline = true;

  const container = ServiceContainer.getInstance();
  const cache = container.getCache() as RedisCache;
  const client = new HullPerformanceClient(correlationId);
  const repository = new HullPerformanceRepository(correlationId, {
    client,
    redis: cache,
  });
  const service = new HullPerformanceService(correlationId, repository);

  const analysis = await service.analyzeVesselPerformance(
    vesselIdentifier,
    options
  );

  if (analysis == null) {
    return {
      success: false,
      error: 'No hull performance data available',
      message:
        'No records found for this vessel in the given period, or the service failed.',
    };
  }

  return {
    success: true,
    data: analysis,
  };
}

// ============================================================================
// Tool executor (for registry / agent nodes)
// ============================================================================

/**
 * Execute hull performance fetcher tool.
 * Parses input with Zod, extracts correlation ID from context, logs to Axiom, handles errors.
 */
export async function executeFetchHullPerformanceTool(
  input: unknown,
  context?: ToolExecutionContext
): Promise<FetchHullPerformanceOutput> {
  const startMs = Date.now();
  const correlationId = context?.correlationId ?? 'unknown';

  logCustomEvent(
    'hull_performance_tool_start',
    correlationId,
    {
      vessel_identifier: (input as FetchHullPerformanceInput)?.vessel_identifier,
      time_period: (input as FetchHullPerformanceInput)?.time_period,
    },
    'info'
  );

  let parsed: FetchHullPerformanceInput;

  try {
    parsed = fetchHullPerformanceInputSchema.parse(input);
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? (err.issues ?? []).map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
        : err instanceof Error
          ? err.message
          : 'Invalid input';
    const executionTimeMs = Date.now() - startMs;

    logError(
      correlationId,
      err instanceof Error ? err : new Error(message),
      {
        tool: 'fetch_hull_performance',
        vessel_identifier: (input as Record<string, unknown>)?.vessel_identifier,
        time_period: (input as Record<string, unknown>)?.time_period,
      }
    );
    logCustomEvent(
      'hull_performance_tool_error',
      correlationId,
      {
        vessel_identifier: (input as Record<string, unknown>)?.vessel_identifier,
        time_period: (input as Record<string, unknown>)?.time_period,
        execution_time_ms: executionTimeMs,
        error: message,
      },
      'error'
    );

    return {
      success: false,
      error: message,
      message: 'Invalid request. Either IMO or vessel name must be provided.',
    };
  }

  try {
    const result = await fetchHullPerformance(parsed, correlationId);
    const executionTimeMs = Date.now() - startMs;

    if (result.success) {
      logCustomEvent(
        'hull_performance_tool_success',
        correlationId,
        {
          vessel_identifier: parsed.vessel_identifier,
          time_period: parsed.time_period,
          execution_time_ms: executionTimeMs,
          record_count: result.data?.analysis_period?.total_records,
        },
        'info'
      );
    } else {
      logCustomEvent(
        'hull_performance_tool_error',
        correlationId,
        {
          vessel_identifier: parsed.vessel_identifier,
          time_period: parsed.time_period,
          execution_time_ms: executionTimeMs,
          error: result.error,
        },
        'warn'
      );
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const executionTimeMs = Date.now() - startMs;

    logError(correlationId, err instanceof Error ? err : new Error(message), {
      tool: 'fetch_hull_performance',
      vessel_identifier: parsed.vessel_identifier,
      time_period: parsed.time_period,
    });
    logCustomEvent(
      'hull_performance_tool_error',
      correlationId,
      {
        vessel_identifier: parsed.vessel_identifier,
        time_period: parsed.time_period,
        execution_time_ms: executionTimeMs,
        error: message,
      },
      'error'
    );

    return {
      success: false,
      error: message,
      message:
        'Failed to fetch hull performance. The service may be temporarily unavailable.',
    };
  }
}
