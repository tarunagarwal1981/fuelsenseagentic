/**
 * Hull Performance Agent Node
 *
 * Deterministic LangGraph node that fetches hull performance data via
 * fetch_hull_performance tool and updates state for the Finalize Agent.
 * No LLM calls.
 */

import { AIMessage } from '@langchain/core/messages';
import type { MultiAgentState } from '../state';
import { executeFetchHullPerformanceTool } from '@/lib/tools/hull-performance';
import { logAgentExecution, logError } from '@/lib/monitoring/axiom-logger';
import { extractCorrelationId } from '@/lib/utils/correlation';
import type { HullPerformanceChartData } from '@/lib/services/hull-performance-service';
import { HullPerformanceService } from '@/lib/services/hull-performance-service';
import { HullPerformanceRepository } from '@/lib/repositories/hull-performance-repository';
import { HullPerformanceClient, type IHullPerformanceDataSource } from '@/lib/api-clients/hull-performance-client';
import { HullPerformanceDbClient } from '@/lib/api-clients/hull-performance-db-client';
import { ServiceContainer } from '@/lib/repositories/service-container';
import { RedisCache } from '@/lib/repositories/cache-client';

// ============================================================================
// Agent Node
// ============================================================================

export async function hullPerformanceAgentNode(
  state: MultiAgentState
): Promise<Partial<MultiAgentState>> {
  const startTime = Date.now();
  const correlationId = extractCorrelationId(state);

  try {
    logAgentExecution('hull_performance_agent', correlationId, 0, 'started', {
      vessel: state.vessel_identifiers,
    });

    // 1. Resolve vessel identifiers: state.vessel_identifiers or agent_overrides (recovery)
    let ids: { names?: string[]; imos?: string[] };
    const fromState = state.vessel_identifiers;
    const hasFromState =
      fromState &&
      ((fromState.names?.length ?? 0) > 0 || (fromState.imos?.length ?? 0) > 0);

    if (hasFromState) {
      ids = fromState;
    } else {
      const overrides = state.agent_overrides?.hull_performance_agent as
        | { vessel_name?: string; name?: string; imo?: string; imos?: string[] }
        | undefined;
      if (overrides) {
        const name =
          typeof overrides.vessel_name === 'string'
            ? overrides.vessel_name
            : typeof overrides.name === 'string'
              ? overrides.name
              : undefined;
        const imo =
          typeof overrides.imo === 'string'
            ? overrides.imo
            : Array.isArray(overrides.imos) && overrides.imos.length > 0
              ? overrides.imos[0]
              : undefined;
        if (name || imo) {
          ids = {
            names: name ? [name] : [],
            imos: imo ? [imo] : [],
          };
        } else {
          ids = { names: [], imos: [] };
        }
      } else {
        ids = { names: [], imos: [] };
      }
    }

    // Fallback: single vessel from vessel_specs (e.g. vessel_info_agent returned one vessel)
    let hasVessel = (ids.names?.length ?? 0) > 0 || (ids.imos?.length ?? 0) > 0;
    if (!hasVessel && state.vessel_specs?.length === 1) {
      const spec = state.vessel_specs[0] as { name?: string; imo?: string };
      const specName = typeof spec?.name === 'string' ? spec.name : undefined;
      const specImo = typeof spec?.imo === 'string' ? spec.imo : undefined;
      if (specName || specImo) {
        ids = {
          names: specName ? [specName] : [],
          imos: specImo ? [specImo] : [],
        };
        hasVessel = true;
      }
    }

    if (!hasVessel) {
      throw new Error(
        state.vessel_identifiers
          ? 'Vessel identifiers are empty. Entity extractor should populate names or imos.'
          : 'No vessel identifiers found in state. Entity extractor should run first.'
      );
    }

    const vesselId = {
      imo: ids.imos?.[0],
      name: ids.names?.[0],
    };

    // 2. Determine time period from query or use default
    const timePeriod = extractTimePeriod(state.messages ?? []);

    // 3. Call hull performance tool
    const toolInput = {
      vessel_identifier: {
        imo: vesselId.imo,
        name: vesselId.name,
      },
      time_period: timePeriod,
    };

    const result = await executeFetchHullPerformanceTool(toolInput, {
      correlationId,
    });

    // Log initial results
    logAgentExecution(
      'hull_performance_agent',
      correlationId,
      Date.now() - startTime,
      result.success ? 'completed' : 'failed',
      {
        vessel: ids,
        success: result.success,
        has_data: !!result.data,
      }
    );

    // Extract chart data if analysis succeeded
    let chartData: HullPerformanceChartData | undefined;
    if (result.success && result.data) {
      try {
        const container = ServiceContainer.getInstance();
        const cache = container.getCache() as RedisCache;
        const useDb = process.env.HULL_PERFORMANCE_SOURCE === 'db';

        const client: IHullPerformanceDataSource = useDb
          ? new HullPerformanceDbClient(correlationId)
          : new HullPerformanceClient(correlationId);

        const repository = new HullPerformanceRepository(correlationId, {
          client,
          redis: cache,
        });

        const service = new HullPerformanceService(correlationId, repository);

        chartData = await service.extractChartData(result.data);

        logAgentExecution(
          'hull_performance_agent',
          correlationId,
          0,
          'chart_data_extracted',
          {
            has_chart_data: !!chartData,
            has_excess_power: !!chartData?.excessPower,
            has_speed_loss: !!chartData?.speedLoss,
            has_speed_consumption: !!chartData?.speedConsumption,
            excess_power_points: chartData?.excessPower?.dataPoints?.length ?? 0,
          }
        );
      } catch (chartError) {
        logError(correlationId, chartError as Error, {
          agent: 'hull_performance_agent',
          step: 'chart_data_extraction',
        });
        chartData = undefined;
      }
    }

    // Return state update with both analysis and chart data
    return {
      hull_performance: result.data ?? null,
      hull_performance_charts: chartData ?? null,
      agent_status: {
        ...(state.agent_status || {}),
        hull_performance_agent: result.success ? 'success' : 'failed',
      },
      messages: [
        ...(state.messages ?? []),
        new AIMessage({
          content: result.success
            ? chartData
              ? 'Hull performance analysis complete with interactive trend charts'
              : 'Hull performance analysis complete (summary only)'
            : result.error || 'Failed to fetch hull performance',
        }),
      ],
    };
  } catch (error) {
    const errMessage =
      error instanceof Error ? error.message : String(error);
    const duration = Date.now() - startTime;

    console.warn('[HULL-PERFORMANCE-AGENT] Failed:', errMessage);

    logAgentExecution('hull_performance_agent', correlationId, duration, 'failed', {
      error: errMessage,
      duration_ms: duration,
    });

    return {
      agent_status: {
        ...(state.agent_status || {}),
        hull_performance_agent: 'failed',
      },
      agent_errors: {
        ...(state.agent_errors || {}),
        hull_performance_agent: {
          error: errMessage,
          timestamp: Date.now(),
        },
      },
    };
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract time period from user query.
 * Looks for patterns like "last 30 days", "this month", etc.
 */
function extractTimePeriod(messages: any[]): { days: number } {
  let days = 90;

  const lastMessage =
    (messages.length > 0 && messages[messages.length - 1]) || null;
  const content =
    typeof lastMessage?.content === 'string'
      ? lastMessage.content
      : Array.isArray(lastMessage?.content)
        ? (lastMessage.content as any[]).find((p: any) => p?.type === 'text')
            ?.text ?? ''
        : '';
  const text = String(content || '');

  const daysMatch = text.match(/last\s+(\d+)\s+days?/i);
  if (daysMatch) {
    days = parseInt(daysMatch[1], 10) || 90;
  } else if (/this month|30 days/i.test(text)) {
    days = 30;
  } else if (/this week|7 days/i.test(text)) {
    days = 7;
  }

  return { days };
}
