/**
 * Vessel Information Agent Node
 *
 * Fetches vessel data from FuelSense APIs (VesselDetails, Datalogs, VesselPerformanceModel).
 * Handles queries like:
 * - "How many vessels do we have?"
 * - "List vessels by type"
 * - "Show vessel details for X"
 * - "Last noon report for MARITIME EXPLORER"
 * - "Consumption profile of IMO 9234567"
 *
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

/**
 * Detect if query is asking for vessel count/list (e.g. "how many vessels", "list vessels")
 */
function isVesselCountOrListQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    /how many vessels?/i.test(q) ||
    /how many ships?/i.test(q) ||
    /list (all )?vessels?/i.test(q) ||
    /vessels? (and )?types?/i.test(q) ||
    /what vessels?/i.test(q) ||
    /vessel count/i.test(q) ||
    /fleet size/i.test(q)
  );
}

/**
 * Detect if query is asking for noon report (e.g. "noon report", "last noon", "ROB", "position")
 */
function isNoonReportQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    /noon report/i.test(q) ||
    /last noon/i.test(q) ||
    /\brob\b/i.test(q) ||
    /remaining on board/i.test(q) ||
    /current position/i.test(q) ||
    /vessel position/i.test(q) ||
    /when was last report/i.test(q) ||
    /latest report/i.test(q) ||
    /show me.*report/i.test(q)
  );
}

/**
 * Detect if query is asking for consumption profile (e.g. "consumption profile", "fuel consumption at speed")
 */
function isConsumptionProfileQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    /consumption profile/i.test(q) ||
    /fuel consumption/i.test(q) ||
    /consumption at speed/i.test(q) ||
    /consumption rate/i.test(q) ||
    /consumption by speed/i.test(q) ||
    /burn rate/i.test(q)
  );
}

/**
 * Vessel Info Agent Node
 *
 * Fetches vessel data from FuelSense VesselDetails API.
 * For "how many vessels" / "list vessels" queries: fetches all and populates vessel_specs.
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

    // Vessel count / list query (e.g. "how many vessels do we have?")
    if (isVesselCountOrListQuery(userQuery)) {
      console.log('📊 [VESSEL-INFO-AGENT] Fetching vessel list from VesselDetails API...');
      const vessels = await vesselDetailsClient.getAll(100);

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

    // Noon report query (e.g. "last noon report for MARITIME EXPLORER")
    const identifiers = state.vessel_identifiers;
    const imo = identifiers?.imos?.[0];
    const name = identifiers?.names?.[0];
    if ((imo || name) && isNoonReportQuery(userQuery)) {
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

    // Consumption profile query (e.g. "consumption profile of IMO 9234567")
    if ((imo || name) && isConsumptionProfileQuery(userQuery)) {
      // Consumption profile requires IMO - resolve name to IMO if needed
      let resolvedImo = imo;
      if (!resolvedImo && name) {
        const spec = await vesselDetailsClient.getByName(name);
        resolvedImo = spec?.imo;
      }
      if (resolvedImo) {
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
    }

    // Single vessel lookup (by name or IMO from vessel_identifiers)
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
    }

    // Fallback: fetch all vessels for generic vessel queries (e.g. "show me vessels")
    console.log('📊 [VESSEL-INFO-AGENT] Fallback: fetching vessel list...');
    const vessels = await vesselDetailsClient.getAll(50);
    const summary =
      vessels.length > 0
        ? `Found ${vessels.length} vessels. Sample: ${vessels.slice(0, 3).map((v) => v.name).join(', ')}`
        : 'No vessels found.';

    const elapsed = Date.now() - startTime;
    logAgentExecution('vessel_info_agent', cid, elapsed, 'success', {
      output: { vessel_count: vessels.length },
    });

    return {
      vessel_specs: vessels,
      agent_status: { ...(state.agent_status || {}), vessel_info_agent: 'success' },
      messages: [
        ...state.messages,
        new AIMessage({ content: `[VESSEL-INFO-AGENT] ${summary}` }),
      ],
    };
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
    'Fetches vessel data: vessel count/list, vessel specs, noon reports, consumption profiles. Uses VesselDetailsClient and vessel performance tools (fetch_noon_report, fetch_consumption_profile).',
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
    'Detect query intent (count/list, noon report, consumption profile, vessel lookup)',
    'Call appropriate API or tool',
    'Populate state with results',
  ],
});
