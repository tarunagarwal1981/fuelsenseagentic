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
import { logAgentExecution, logCustomEvent, logError } from '@/lib/monitoring/axiom-logger';
import { extractCorrelationId } from '@/lib/utils/correlation';
import type { HullPerformanceAnalysis } from '@/lib/services/hull-performance-service';
import { ExcessPowerChartService, toExcessPowerChartData } from '@/lib/services/charts/excess-power-chart-service';
import { SpeedLossChartService, toSpeedLossChartData } from '@/lib/services/charts/speed-loss-chart-service';
import { SpeedConsumptionChartService } from '@/lib/services/charts/speed-consumption-chart-service';
import type { SpeedConsumptionChartData } from '@/lib/services/charts/speed-consumption-chart-service';

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

    // 3. Call hull performance tool (omit time_period when user didn't specify → service uses 180 days from vessel's last report)
    const toolInput = {
      vessel_identifier: {
        imo: vesselId.imo,
        name: vesselId.name,
      },
      ...(timePeriod != null && { time_period: timePeriod }),
    };

    const result = await executeFetchHullPerformanceTool(toolInput, {
      correlationId,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch hull performance data');
    }

    const displayName = vesselId.name || vesselId.imo || 'vessel';

    // 4. Extract chart data if analysis succeeded
    let chartData: {
      excessPower?: ReturnType<typeof toExcessPowerChartData> | null;
      speedLoss?: ReturnType<typeof toSpeedLossChartData> | null;
      speedConsumption?: SpeedConsumptionChartData | null;
    } | undefined;

    console.log('🔍 [HULL-AGENT] Checking if should extract charts:', {
      success: result.success,
      hasData: !!result.data,
      hasTrendData: !!result.data?.trend_data,
      trendDataLength: result.data?.trend_data?.length,
    });

    if (result.success && result.data) {
      try {
        console.log('✅ [HULL-AGENT] Starting chart extraction...');

        logCustomEvent(
          'hull_performance_chart_extraction_start',
          correlationId,
          { vessel_imo: result.data.vessel?.imo },
          'info'
        );

        const analysis = result.data as HullPerformanceAnalysis;
        const excessService = new ExcessPowerChartService(correlationId);
        const speedLossService = new SpeedLossChartService(correlationId);
        const speedConsumptionService = new SpeedConsumptionChartService(correlationId);

        const [excessResult, speedLossResult, speedConsumptionResult] = await Promise.all([
          Promise.resolve(excessService.extractChartData(analysis)),
          Promise.resolve(speedLossService.extractChartData(analysis)),
          speedConsumptionService.extractChartData(analysis),
        ]);

        chartData = {
          excessPower: excessResult ? toExcessPowerChartData(excessResult) : null,
          speedLoss: speedLossResult ? toSpeedLossChartData(speedLossResult) : null,
          speedConsumption: speedConsumptionResult ?? null,
        };

        console.log('📊 [HULL-AGENT] Chart extraction complete:', {
          hasChartData: !!chartData,
          excessPower: !!chartData?.excessPower,
          speedLoss: !!chartData?.speedLoss,
          speedConsumption: !!chartData?.speedConsumption,
        });

        logCustomEvent(
          'hull_performance_chart_extraction_complete',
          correlationId,
          {
            has_chart_data: !!chartData,
            has_excess_power: !!chartData?.excessPower,
            has_speed_loss: !!chartData?.speedLoss,
            has_speed_consumption: !!chartData?.speedConsumption,
            excess_power_points: chartData?.excessPower?.dataPoints?.length ?? 0,
          },
          'info'
        );
      } catch (chartError) {
        console.error('❌ [HULL-AGENT] Chart extraction failed:', chartError);
        logError(correlationId, chartError as Error, {
          agent: 'hull_performance_agent',
          step: 'chart_data_extraction',
        });
        chartData = undefined;
      }
    } else {
      console.log('⚠️ [HULL-AGENT] Skipping chart extraction - no data');
    }

    // 5. Update state – use explicit plain object so LangGraph stream serialization keeps all keys
    const chartsForState =
      chartData == null
        ? null
        : {
            excessPower: chartData.excessPower ?? null,
            speedLoss: chartData.speedLoss ?? null,
            speedConsumption: chartData.speedConsumption ?? null,
          };
    if (chartsForState) {
      const keys = Object.keys(chartsForState);
      console.log('📊 [HULL-AGENT] Returning hull_performance_charts keys:', keys);
    }
    const updatedState: Partial<MultiAgentState> = {
      hull_performance: result.data ?? null,
      ...(chartsForState != null && { hull_performance_charts: chartsForState as any }),
      agent_status: {
        ...(state.agent_status || {}),
        hull_performance_agent: 'success',
      },
      messages: [
        ...(state.messages ?? []),
        new AIMessage({
          content: `[HULL-PERFORMANCE-AGENT] Hull performance analysis complete for ${displayName}`,
        }),
      ],
    };

    // 6. Log success
    const duration = Date.now() - startTime;
    logAgentExecution('hull_performance_agent', correlationId, duration, 'success', {
      vessel: vesselId,
      hull_condition: result.data?.hull_condition,
      excess_power_pct: result.data?.latest_metrics?.excess_power_pct,
      duration_ms: duration,
    });

    return updatedState;
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
 * Extract time period from user query when explicitly mentioned.
 * When no pattern is found, returns undefined so the service uses default:
 * 180 days from the vessel's last report date.
 */
function extractTimePeriod(messages: any[]): { days: number } | undefined {
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
    const days = parseInt(daysMatch[1], 10);
    if (Number.isFinite(days) && days > 0) return { days };
  } else if (/this month|30 days/i.test(text)) {
    return { days: 30 };
  } else if (/this week|7 days/i.test(text)) {
    return { days: 7 };
  }

  return undefined;
}
