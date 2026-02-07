/**
 * Vessel Information Agent Node
 *
 * Fetches vessel data from FuelSense APIs (VesselDetails, Datalogs, VesselPerformanceModel).
 * Uses intent-based branching from routing_metadata (set by supervisor).
 *
 * Intent handlers:
 * - vessel_list | vessel_count | vessel_info | fleet_inventory → handleVesselList
 * - noon_report → handleNoonReport
 * - consumption_profile → handleConsumptionProfile
 *
 * Fallback: When routing_metadata is missing, defaults to vessel_list (safe default).
 * Uses VesselDetailsClient for vessel master data and vessel performance tools for noon reports/consumption profiles.
 */

import { AIMessage } from '@langchain/core/messages';
import type { MultiAgentState } from './state';
import { VesselDetailsClient } from '@/lib/clients/vessel-details-client';
import { extractCorrelationId } from '@/lib/utils/correlation';
import { logAgentExecution } from '@/lib/monitoring/axiom-logger';
import type { VesselBasicInfo, NoonReportData, ConsumptionProfile } from '@/lib/types/vessel-performance';
import { getVesselPerformanceToolExecutors } from './tools';
import { AgentRegistry } from './registry';

const vesselDetailsClient = new VesselDetailsClient();
const vesselToolExecutors = getVesselPerformanceToolExecutors();

// ============================================================================
// Intent Handlers
// ============================================================================

/**
 * Handle vessel list/count/info: getAll or single vessel lookup when identifiers present.
 * @param limit - Max vessels to fetch (default 100). Use 50 for unknown-intent fallback.
 */
async function handleVesselList(
  state: MultiAgentState,
  cid: string,
  startTime: number,
  limit: number = 100
): Promise<Partial<MultiAgentState>> {
  const identifiers = state.vessel_identifiers;
  const imo = identifiers?.imos?.[0];
  const name = identifiers?.names?.[0];

  // Single vessel lookup when identifiers present
  if (imo || name) {
    console.log(`🔍 [VESSEL-INFO-AGENT] Looking up vessel: ${imo || name}`);
    const spec = imo
      ? await vesselDetailsClient.getByIMO(imo)
      : await vesselDetailsClient.getByName(name!);
    if (spec) {
      const vessels: VesselBasicInfo[] = [spec];
      console.log(`✅ [VESSEL-INFO-AGENT] Found: ${spec.name} (${spec.imo})`);
      const elapsed = Date.now() - startTime;
      logAgentExecution('vessel_info_agent', cid, elapsed, 'success', {
        output: { vessel_name: spec.name, imo: spec.imo },
      });
      return {
        vessel_specs: vessels,
        agent_status: { ...(state.agent_status || {}), vessel_info_agent: 'success' },
        messages: [
          ...state.messages,
          new AIMessage({
            content: `[VESSEL-INFO-AGENT] Found vessel: ${spec.name} (IMO ${spec.imo}), ${spec.type}, ${spec.dwt} DWT`,
          }),
        ],
      };
    }
    // Single lookup failed - fall through to getAll
  }

  // Vessel count/list: fetch all (or fallback when single lookup failed)
  console.log(`📊 [VESSEL-INFO-AGENT] Fetching vessel list from VesselDetails API (limit=${limit})...`);
  const vessels = await vesselDetailsClient.getAll(limit);

  const typeCount: Record<string, number> = {};
  for (const v of vessels) {
    const t = v.type || 'Unknown';
    typeCount[t] = (typeCount[t] || 0) + 1;
  }

  const summary = `Found ${vessels.length} vessels. Types: ${Object.entries(typeCount)
    .map(([t, c]) => `${t} (${c})`)
    .join(', ')}`;

  console.log(`✅ [VESSEL-INFO-AGENT] ${summary}`);

  const elapsed = Date.now() - startTime;
  logAgentExecution('vessel_info_agent', cid, elapsed, 'success', {
    output: { vessel_count: vessels.length, type_count: Object.keys(typeCount).length },
  });

  return {
    vessel_specs: vessels,
    agent_status: { ...(state.agent_status || {}), vessel_info_agent: 'success' },
    messages: [
      ...state.messages,
      new AIMessage({
        content: `[VESSEL-INFO-AGENT] ${summary}`,
      }),
    ],
  };
}

/**
 * Handle noon report: fetch latest noon report for vessel by identifiers.
 */
async function handleNoonReport(
  state: MultiAgentState,
  cid: string,
  startTime: number
): Promise<Partial<MultiAgentState>> {
  const identifiers = state.vessel_identifiers;
  const imo = identifiers?.imos?.[0];
  const name = identifiers?.names?.[0];

  if (!imo && !name) {
    console.warn('⚠️ [VESSEL-INFO-AGENT] Noon report intent but no vessel identifiers');
    return {
      vessel_specs: await vesselDetailsClient.getAll(50),
      agent_status: { ...(state.agent_status || {}), vessel_info_agent: 'success' },
      messages: [
        ...state.messages,
        new AIMessage({
          content: '[VESSEL-INFO-AGENT] No vessel identifier for noon report. Showing vessel list.',
        }),
      ],
    };
  }

  console.log(`📋 [VESSEL-INFO-AGENT] Fetching noon report for: ${imo || name}`);
  const result = await vesselToolExecutors.fetchNoonReport({
    vessel_identifiers: { imo, name: name || undefined },
  }) as { success: boolean; data?: unknown; error?: string; message?: string };

  if (result.success && result.data) {
    const noonReports: NoonReportData[] = [result.data as NoonReportData];
    const elapsed = Date.now() - startTime;
    logAgentExecution('vessel_info_agent', cid, elapsed, 'success', {
      output: { noon_report_fetched: true },
    });
    return {
      noon_reports: noonReports,
      agent_status: { ...(state.agent_status || {}), vessel_info_agent: 'success' },
      messages: [
        ...state.messages,
        new AIMessage({
          content: `[VESSEL-INFO-AGENT] Fetched noon report for ${imo || name}`,
        }),
      ],
    };
  }

  const errMsg = result.error || result.message || 'No noon report found';
  console.warn(`⚠️ [VESSEL-INFO-AGENT] Noon report: ${errMsg}`);
  return {
    agent_status: { ...(state.agent_status || {}), vessel_info_agent: 'success' },
    messages: [
      ...state.messages,
      new AIMessage({
        content: `[VESSEL-INFO-AGENT] ${errMsg}`,
      }),
    ],
  };
}

/**
 * Handle consumption profile: fetch consumption profile for vessel by IMO.
 */
async function handleConsumptionProfile(
  state: MultiAgentState,
  cid: string,
  startTime: number
): Promise<Partial<MultiAgentState>> {
  const identifiers = state.vessel_identifiers;
  const imo = identifiers?.imos?.[0];
  const name = identifiers?.names?.[0];

  if (!imo && !name) {
    console.warn('⚠️ [VESSEL-INFO-AGENT] Consumption profile intent but no vessel identifiers');
    return {
      vessel_specs: await vesselDetailsClient.getAll(50),
      agent_status: { ...(state.agent_status || {}), vessel_info_agent: 'success' },
      messages: [
        ...state.messages,
        new AIMessage({
          content: '[VESSEL-INFO-AGENT] No vessel identifier for consumption profile. Showing vessel list.',
        }),
      ],
    };
  }

  // Consumption profile requires IMO - resolve name to IMO if needed
  let resolvedImo = imo;
  if (!resolvedImo && name) {
    const spec = await vesselDetailsClient.getByName(name);
    resolvedImo = spec?.imo;
  }

  if (!resolvedImo) {
    return {
      agent_status: { ...(state.agent_status || {}), vessel_info_agent: 'success' },
      messages: [
        ...state.messages,
        new AIMessage({
          content: '[VESSEL-INFO-AGENT] Could not resolve vessel IMO for consumption profile.',
        }),
      ],
    };
  }

  console.log(`⛽ [VESSEL-INFO-AGENT] Fetching consumption profile for IMO ${resolvedImo}`);
  const result = await vesselToolExecutors.fetchConsumptionProfile({ imo: resolvedImo }) as {
    success: boolean;
    data?: Array<unknown>;
    error?: string;
    message?: string;
  };

  if (result.success && result.data && result.data.length > 0) {
    const elapsed = Date.now() - startTime;
    logAgentExecution('vessel_info_agent', cid, elapsed, 'success', {
      output: { consumption_profiles_count: result.data.length },
    });
    return {
      consumption_profiles: result.data as ConsumptionProfile[],
      agent_status: { ...(state.agent_status || {}), vessel_info_agent: 'success' },
      messages: [
        ...state.messages,
        new AIMessage({
          content: `[VESSEL-INFO-AGENT] Fetched ${result.data.length} consumption profile(s) for IMO ${resolvedImo}`,
        }),
      ],
    };
  }

  const errMsg = result.error || result.message || 'No consumption profiles found';
  console.warn(`⚠️ [VESSEL-INFO-AGENT] Consumption profile: ${errMsg}`);
  return {
    agent_status: { ...(state.agent_status || {}), vessel_info_agent: 'success' },
    messages: [
      ...state.messages,
      new AIMessage({ content: `[VESSEL-INFO-AGENT] ${errMsg}` }),
    ],
  };
}

// ============================================================================
// Main Agent Node
// ============================================================================

/**
 * Vessel Info Agent Node
 *
 * Fetches vessel data using intent-based branching from routing_metadata.
 * When routing_metadata is missing (e.g. legacy flows), defaults to vessel_list.
 */
export async function vesselInfoAgentNode(
  state: MultiAgentState
): Promise<Partial<MultiAgentState>> {
  const cid = extractCorrelationId(state);
  logAgentExecution('vessel_info_agent', cid, 0, 'started', {
    input: { message_count: state.messages?.length ?? 0 },
  });

  console.log('\n🚢 [VESSEL-INFO-AGENT] Starting vessel info retrieval...');
  const startTime = Date.now();

  try {
    const lastUserMessage = state.messages
      ?.filter((m) => m._getType() === 'human')
      .pop();
    const userQuery = (lastUserMessage?.content?.toString() || '').trim();

    if (!userQuery) {
      console.warn('⚠️ [VESSEL-INFO-AGENT] No user query found');
      return {
        agent_status: { ...(state.agent_status || {}), vessel_info_agent: 'failed' },
        agent_errors: {
          ...(state.agent_errors || {}),
          vessel_info_agent: {
            error: 'No user query to process',
            timestamp: Date.now(),
          },
        },
        messages: [
          ...state.messages,
          new AIMessage({ content: '[VESSEL-INFO-AGENT] No query found.' }),
        ],
      };
    }

    // Get intent from routing metadata (from supervisor)
    const intent =
      state.routing_metadata?.matched_intent ||
      (state.routing_metadata?.extracted_params?.intent as string | undefined) ||
      'vessel_list'; // safe default when routing_metadata missing

    const normalizedIntent = String(intent).toLowerCase().replace(/\s+/g, '_');

    console.log(`📋 [VESSEL-INFO-AGENT] Intent: ${normalizedIntent} (from routing_metadata)`);

    // Branch on intent instead of query patterns
    switch (normalizedIntent) {
      case 'vessel_list':
      case 'vessel_count':
      case 'vessel_info':
      case 'fleet_inventory':
      case 'list_vessels':
      case 'vessel_details':
      case 'show_vessel':
        return await handleVesselList(state, cid, startTime);

      case 'noon_report':
      case 'noon_report_fetch':
      case 'get_rob':
      case 'vessel_status':
        return await handleNoonReport(state, cid, startTime);

      case 'consumption_profile':
        return await handleConsumptionProfile(state, cid, startTime);

      default:
        // Fallback to vessel list with getAll(50) for unknown intents
        console.log('⚠️ [VESSEL-INFO-AGENT] Unknown intent, defaulting to vessel list (getAll 50)');
        return await handleVesselList(state, cid, startTime, 50);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('❌ [VESSEL-INFO-AGENT] Error:', errMsg);
    const elapsed = Date.now() - startTime;
    logAgentExecution('vessel_info_agent', cid, elapsed, 'failed', {
      error: errMsg,
    });
    return {
      agent_status: { ...(state.agent_status || {}), vessel_info_agent: 'failed' },
      agent_errors: {
        ...(state.agent_errors || {}),
        vessel_info_agent: { error: errMsg, timestamp: Date.now() },
      },
      messages: [
        ...state.messages,
        new AIMessage({
          content: `[VESSEL-INFO-AGENT] Error: ${errMsg}`,
        }),
      ],
    };
  }
}

// Register with multi-agent AgentRegistry for supervisor routing
AgentRegistry.registerAgent({
  agent_name: 'vessel_info_agent',
  description:
    'Fetches vessel data: vessel count/list, vessel specs, noon reports, consumption profiles. Uses intent-based branching from routing_metadata. Uses VesselDetailsClient and vessel performance tools (fetch_noon_report, fetch_consumption_profile).',
  available_tools: [
    {
      tool_name: 'fetch_noon_report',
      description: 'Fetch latest noon report',
      when_to_use: ['User asks for noon report, ROB, position'],
      when_not_to_use: ['No vessel identifier'],
      prerequisites: ['vessel_identifiers'],
      produces: ['noon_reports'],
    },
    {
      tool_name: 'fetch_vessel_specs',
      description: 'Fetch vessel master data',
      when_to_use: ['User asks for vessel specs, type, DWT'],
      when_not_to_use: ['No vessel identifier'],
      prerequisites: ['vessel_identifiers'],
      produces: ['vessel_specs'],
    },
    {
      tool_name: 'fetch_consumption_profile',
      description: 'Fetch consumption profiles',
      when_to_use: ['User asks for consumption profile, fuel consumption'],
      when_not_to_use: ['No vessel identifier'],
      prerequisites: ['vessel_identifiers'],
      produces: ['consumption_profiles'],
    },
  ],
  prerequisites: ['messages'],
  outputs: ['vessel_specs', 'noon_reports', 'consumption_profiles'],
  is_deterministic: true,
  workflow_steps: [
    'Read intent from routing_metadata (vessel_list, noon_report, consumption_profile)',
    'Call appropriate handler: handleVesselList, handleNoonReport, handleConsumptionProfile',
    'Populate state with results',
  ],
});
