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
import { logAgentExecution } from '@/lib/monitoring/axiom-logger';
import { extractCorrelationId } from '@/lib/utils/correlation';

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

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch hull performance data');
    }

    const displayName = vesselId.name || vesselId.imo || 'vessel';

    // 4. Update state
    const updatedState: Partial<MultiAgentState> = {
      hull_performance: result.data ?? null,
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

    // 5. Log success
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
