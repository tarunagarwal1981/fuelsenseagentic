/**
 * Multi-Agent Node Implementations
 * 
 * Implements 5 agent nodes for the multi-agent LangGraph system:
 * 1. Supervisor Agent - Routes to appropriate agent
 * 2. Route Agent - Calculates route and vessel timeline
 * 3. Weather Agent - Analyzes weather impact
 * 4. Bunker Agent - Finds best bunker option
 * 5. Finalize Node - Synthesizes final recommendation
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { MultiAgentState, AgentContext } from './state';
import { tool } from '@langchain/core/tools';
import {
  withTimeout,
  TIMEOUTS,
  getCachedRoute,
  cacheRoute,
  recordAgentTime,
  recordToolCallTime,
  trimMessageHistory,
  validateMessagePairs,
  validateMessagesForAnthropicAPI,
} from './optimizations';
import {
  recordAgentExecution,
  recordToolCall,
} from './monitoring';
import { extractCorrelationId } from '@/lib/utils/correlation';
import { logAgentExecution, logError, logToolCall } from '@/lib/monitoring/axiom-logger';
import {
  logVesselComparison,
  logVesselAnalysis,
  logVesselRecommendation,
  logVesselSelectionError,
  logVesselSelectionStep,
} from '@/lib/monitoring/agent-metrics';
import { sanitizeToolInput, sanitizeToolOutput } from '@/lib/monitoring/sanitize';
import { sanitizeMarkdownForDisplay } from '@/lib/utils/markdown-sanitizer';
import { analyzeQueryIntent, generateAgentContext } from './intent-analyzer';
import { LLMFactory } from './llm-factory';
import { AgentRegistry, zodSchemaToJsonSchema } from './registry';
import { generateExecutionPlan, type SupervisorPlan } from './supervisor-planner';
import { isFallbackResponse } from '@/lib/resilience/fallback-strategies';
import { planBasedSupervisor } from '@/lib/orchestration/plan-based-supervisor';

// Import tool execute functions
import { executeRouteCalculatorTool } from '@/lib/tools/route-calculator';
import { executeWeatherTimelineTool } from '@/lib/tools/weather-timeline';
import { executeMarineWeatherTool } from '@/lib/tools/marine-weather';
import { executeWeatherConsumptionTool } from '@/lib/tools/weather-consumption';
import { executePortWeatherTool } from '@/lib/tools/port-weather';
import { executePortFinderTool } from '@/lib/tools/port-finder';
import { executePriceFetcherTool } from '@/lib/tools/price-fetcher';
import { executeBunkerAnalyzerTool } from '@/lib/tools/bunker-analyzer';
import { complianceAgentNode } from './compliance-agent-node';
import {
  calculateROBForVoyage,
  formatROBSafetyStatus,
  type VesselROBProfile,
} from './helpers/rob-calculator';
import {
  getVesselProfile,
  getDefaultVesselProfile,
  listAllVessels,
  type VesselProfile,
} from '@/lib/services/vessel-service';
import { VesselSelectionEngine } from '@/lib/engines/vessel-selection-engine';
import { VesselSelectionQueryParser } from '@/lib/utils/vessel-selection-parser';
import { AgentRegistry as CapabilityAgentRegistry } from '@/lib/registry/agent-registry';
import { INTENT_CAPABILITY_MAP } from '@/lib/registry/agents';
import { SafetyValidators } from './safety-validators';
import type { ECAConsumptionOutput, RouteSegment as ECARouteSegment } from '@/lib/engines/eca-consumption-engine';
import type { ROBTrackingOutput } from '@/lib/engines/rob-tracking-engine';
import type { ECAZoneValidatorOutput } from '@/lib/tools/eca-zone-validator';
import { planMultiPortBunker, needsMultiPortBunkering } from '@/lib/engines/multi-port-bunker-planner';
import type { MultiBunkerAnalysis } from './state';
import { formatResponse, formatMapOverlays } from '../formatters/response-formatter';
import { render as templateRender } from '../formatters/template-renderer';
import { generateSynthesis } from './synthesis/synthesis-engine';
import { AutoSynthesisEngine, type AutoSynthesisResult } from './synthesis/auto-synthesis-engine';
import { ContextAwareTemplateSelector } from '@/lib/formatters/context-aware-template-selector';
import { getTemplateLoader } from '@/lib/config/template-loader';
import { generateLLMResponse } from './llm-response-generator';
import { classifyQueryPattern } from './query-pattern-classifier';
import { analyzeQueryStructure } from './llm-content-architect';
import { renderWithStructure } from '@/lib/formatters/dynamic-template-renderer';
import type { SynthesizedResponse, ViewConfig } from '@/lib/synthesis';
import type { FormattedResponse } from '../formatters/response-formatter';
import { isFeatureEnabled } from '@/lib/config/feature-flags';
import type { Port } from '@/lib/types';
import type { MatchedComponent } from '@/lib/types/component-registry';
import { detectBunkerQuerySubtype } from '@/lib/types/bunker-agent';
import type {
  BunkerConstraints,
  BunkerPortOption,
  BunkerPricing,
  BunkerRequirement,
  FleetComparisonParams,
  RelaxedConstraints,
  VesselComparison,
  VesselContext,
  VoyageTarget,
} from '@/lib/types/bunker';
import { interrupt, isGraphInterrupt } from '@langchain/langgraph';
import { bunkerDataService } from '@/lib/services/bunker-data-service';
import { resolveVesselIdentifier } from '@/lib/services/vessel-identifier-service';
import { getRobFromDatalogs } from '@/lib/services/rob-from-datalogs-service';
import {
  buildVesselSpecsFromPerformance,
  getTankCapacityDefault,
} from '@/lib/services/vessel-specs-from-performance';
import { getConfigManager } from '@/lib/config/config-manager';
import type { BunkerHITLResume } from '@/lib/types/bunker-agent';
import type { PriceFetcherOutput, PriceData } from '@/lib/tools/price-fetcher';
import { calculateBunkerRequirement } from '@/lib/engines/rob-calculator';
import { compareVesselsForVoyage } from '@/lib/engines/fleet-optimizer';
import { extractBunkerConstraints } from '@/lib/utils/constraint-extractor';
import {
  validatePortAgainstConstraints,
  rankByConstraintMatch,
  relaxConstraintsOnce,
  type PortWithPricing,
} from '@/lib/utils/constraint-bunker-helpers';
import {
  shouldConsiderMultiPort,
  optimizeMultiPortBunkering,
  attachSavingsVsSingle,
} from '@/lib/engines/multi-port-optimizer';

// Import tool schemas
import { routeCalculatorInputSchema } from '@/lib/tools/route-calculator';
import { weatherTimelineInputSchema } from '@/lib/tools/weather-timeline';
import { marineWeatherInputSchema } from '@/lib/tools/marine-weather';
import { weatherConsumptionInputSchema } from '@/lib/tools/weather-consumption';
import { portWeatherInputSchema } from '@/lib/tools/port-weather';
import { portFinderInputSchema } from '@/lib/tools/port-finder';
import { priceFetcherInputSchema } from '@/lib/tools/price-fetcher';
import { bunkerAnalyzerInputSchema } from '@/lib/tools/bunker-analyzer';
import { ecaZoneValidatorInputSchema } from '@/lib/tools/eca-zone-validator';
import { fetchHullPerformanceInputSchema } from '@/lib/tools/hull-performance/fetch-hull-performance';

// Import weather agent tools from tools.ts
import {
  fetchMarineWeatherTool,
  createFetchMarineWeatherTool,
  calculateWeatherConsumptionTool,
  checkPortWeatherTool,
} from './tools';

// ============================================================================
// Circuit Breaker Helper
// ============================================================================

/**
 * Count how many times each agent has been called
 * Used for circuit breaker to prevent infinite loops
 */
/**
 * Circuit breaker helper: Check if agent has exceeded max calls and apply circuit breaker
 */
function applyCircuitBreaker(
  nextAgent: string,
  state: MultiAgentState,
  defaultReturn: Partial<MultiAgentState>
): Partial<MultiAgentState> {
  // Initialize call counts if not present
  const callCounts = state.agent_call_counts || {
    route_agent: 0,
    weather_agent: 0,
    bunker_agent: 0,
    entity_extractor: 0,
  };

  // CIRCUIT BREAKER: Prevent infinite loops
  const MAX_AGENT_CALLS = 3;
  const currentCallCount = callCounts[nextAgent] || 0;

  console.log(`🔄 [SUPERVISOR-CIRCUIT-BREAKER]`, {
    next_agent: nextAgent,
    current_count: currentCallCount,
    max_allowed: MAX_AGENT_CALLS,
    will_trigger: currentCallCount >= MAX_AGENT_CALLS
  });

  if (currentCallCount >= MAX_AGENT_CALLS) {
    console.error(`🚨 [SUPERVISOR] Circuit breaker triggered!`, {
      agent: nextAgent,
      calls: currentCallCount,
      forcing_finalize: true,
      reason: "Agent called too many times without completing"
    });
    
    return {
      next_agent: "finalize",
      messages: [
        new HumanMessage({
          content: `Circuit breaker activated: ${nextAgent} exceeded ${MAX_AGENT_CALLS} attempts. Forcing completion with partial results.`,
          name: "supervisor_circuit_breaker"
        })
      ],
      agent_call_counts: callCounts,
      ...defaultReturn
    };
  }

  // Increment counter for next agent
  const updatedCounts = { ...callCounts };
  updatedCounts[nextAgent] = currentCallCount + 1;

  console.log(`🎯 [SUPERVISOR] Routing to ${nextAgent} (attempt ${updatedCounts[nextAgent]}/${MAX_AGENT_CALLS})`);

  // Return with updated counts - apply safety validation before returning
  const result = {
    ...defaultReturn,
    agent_call_counts: updatedCounts,
  };
  return applySafetyValidation(state, result);
}

/**
 * Apply safety validators before returning supervisor routing decision.
 * Overrides next_agent if critical maritime safety rules are violated.
 *
 * CASCADING: Re-validates after each override so dependency chains are resolved.
 * Example: vessel_selection → bunker_agent → route_agent (bunker needs route first)
 */
function applySafetyValidation(
  state: MultiAgentState,
  update: Partial<MultiAgentState>
): Partial<MultiAgentState> {
  let merged = { ...state, ...update };
  const overrideReasons: string[] = [];
  const MAX_CASCADE_DEPTH = 5; // Prevent infinite loops from validator bugs

  for (let i = 0; i < MAX_CASCADE_DEPTH; i++) {
    const safetyCheck = SafetyValidators.validateAll(merged);
    if (safetyCheck.valid) break;
    if (!safetyCheck.required_agent) break;

    // Prevent infinite loop: same override (validator returning same agent)
    if (safetyCheck.required_agent === merged.next_agent) {
      console.warn(`⚠️ [SUPERVISOR] Safety cascade stalled at ${merged.next_agent}`);
      break;
    }

    overrideReasons.push(safetyCheck.reason ?? 'Unknown');
    console.warn(
      `⚠️ [SUPERVISOR] Safety validation failed, redirecting to ${safetyCheck.required_agent}`
    );
    console.warn(`   Reason: ${safetyCheck.reason}`);
    merged = { ...merged, next_agent: safetyCheck.required_agent };
  }

  if (merged.next_agent !== update.next_agent) {
    return {
      ...update,
      next_agent: merged.next_agent,
      messages: [
        ...(Array.isArray(update.messages) ? update.messages : []),
        new HumanMessage(
          `[SAFETY VALIDATOR] ${overrideReasons[overrideReasons.length - 1] ?? 'Safety redirect'}`
        ),
      ],
    };
  }
  return update;
}

/** Build supervisor return to finalize with bunker error context (no re-route to bunker). */
function buildBunkerErrorFinalizeReturn(
  state: MultiAgentState,
  agentContext: AgentContext
): Partial<MultiAgentState> {
  const hasBunkerError = state.agent_errors?.bunker_agent;
  const finalizeContext: AgentContext['finalize'] = {
    ...agentContext.finalize,
    error_mode: true,
    error_type: 'bunker_timeout',
    error_message: hasBunkerError?.error ?? 'Bunker agent failed',
    partial_data_available: !!state.route_data,
  };
  return {
    next_agent: 'finalize',
    agent_context: { ...agentContext, finalize: finalizeContext },
    messages: [],
  };
}

function countAgentCalls(messages: any[]): Record<string, number> {
  const counts: Record<string, number> = {
    route_agent: 0,
    weather_agent: 0,
    bunker_agent: 0,
  };

  for (const msg of messages) {
    if (msg instanceof AIMessage) {
      const content = msg.content?.toString() || '';
      if (content.includes('[ROUTE-AGENT]')) counts.route_agent++;
      if (content.includes('[WEATHER-AGENT]')) counts.weather_agent++;
      if (content.includes('[BUNKER-AGENT]')) counts.bunker_agent++;
      if (content.includes('[ENTITY-EXTRACTOR]')) counts.entity_extractor = (counts.entity_extractor || 0) + 1;
    }
  }

  return counts;
}

// ============================================================================
// Cached Routes Helper
// ============================================================================

/**
 * Cached routes data cache - loaded once at module initialization
 */
interface CachedRoute {
  id: string;
  origin_port_code: string;
  destination_port_code: string;
  origin_name: string;
  destination_name: string;
  description: string;
  distance_nm: number;
  estimated_hours: number;
  route_type: string;
  waypoints: Array<{ lat: number; lon: number }>;
  cached_at: string;
  popularity: 'high' | 'medium' | 'low';
}

interface CachedRoutesData {
  routes: CachedRoute[];
  collected_at?: string;
  total_routes?: number;
}

let cachedRoutesCache: CachedRoutesData | null = null;

/**
 * Loads cached routes data from the cached-routes.json file
 * Caches the data for subsequent lookups
 * Works in both Node.js and Edge runtime
 */
async function loadCachedRoutes(): Promise<CachedRoutesData> {
  if (cachedRoutesCache) {
    return cachedRoutesCache;
  }

  try {
    // Use dynamic import for JSON file (works with resolveJsonModule in tsconfig)
    const routesModule = await import('@/lib/data/cached-routes.json');
    // JSON imports return the data directly, not as default export
    const routes = routesModule.default || routesModule;
    
    cachedRoutesCache = routes as CachedRoutesData;
    return cachedRoutesCache;
  } catch (error) {
    console.error('❌ [ROUTE-AGENT] Failed to load cached routes:', error);
    throw new Error(`Failed to load cached routes: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================================================
// LLM Configuration
// ============================================================================

// Validate API key is present (skip in test mode and during build)
// During build, NEXT_PHASE is set to 'phase-production-build'
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || process.env.NEXT_PHASE === 'phase-development-build';
if (!process.env.ANTHROPIC_API_KEY && process.env.NODE_ENV !== 'test' && !isBuildTime) {
  throw new Error(
    'ANTHROPIC_API_KEY environment variable is not set. Please configure it in Netlify environment variables.'
  );
}

// NOTE: All agents now use LLMFactory.getLLMForAgent() for tiered model selection
// This allows Route/Weather agents to use GPT-4o-mini (cheaper) while keeping
// Bunker/Finalize on Claude Haiku 4.5 (reliable). The baseLLM below is kept for
// backward compatibility but is no longer used.
// 
// Tiered Strategy:
// - Route/Weather: GPT-4o-mini (if OPENAI_API_KEY set) or Claude Haiku 4.5 (fallback)
// - Bunker/Finalize: Claude Haiku 4.5 (always)
const MODEL = process.env.LLM_MODEL || 'claude-haiku-4-5-20251001';

// Unused - kept for reference only. All agents use LLMFactory now.
// const baseLLM = new ChatAnthropic({
//   model: MODEL,
//   temperature: 0,
//   apiKey: process.env.ANTHROPIC_API_KEY,
// });

// ============================================================================
// Tool Definitions
// ============================================================================

// Route Agent Tools
const calculateRouteTool = tool(
  async (input: any) => {
    console.log('🗺️ [ROUTE-AGENT] Executing calculate_route');
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cached = getCachedRoute(input.origin_port_code, input.destination_port_code);
      if (cached) {
      const duration = Date.now() - startTime;
      recordToolCallTime('calculate_route', duration);
      recordToolCall('calculate_route', duration, true);
      return cached;
      }

      // Execute with timeout
      const result = await withTimeout(
        executeRouteCalculatorTool(input),
        TIMEOUTS.ROUTE_CALCULATION,
        'Route calculation timed out'
      );

      // Cache the result
      cacheRoute(input.origin_port_code, input.destination_port_code, result);

      const duration = Date.now() - startTime;
      recordToolCallTime('calculate_route', duration);
      recordToolCall('calculate_route', duration, true);
      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      recordToolCall('calculate_route', duration, false);
      console.error('❌ [ROUTE-AGENT] Route calculation error:', error.message);
      throw error;
    }
  },
  {
    name: 'calculate_route',
    description:
      'Calculate the maritime route between two ports. Returns distance, estimated time, waypoints, and route type.',
    schema: routeCalculatorInputSchema,
  }
);

const calculateWeatherTimelineTool = tool(
  async (input: any) => {
    console.log('⏱️ [ROUTE-AGENT] Executing calculate_weather_timeline');
    const startTime = Date.now();
    
    try {
      const result = await withTimeout(
        executeWeatherTimelineTool(input),
        TIMEOUTS.AGENT,
        'Weather timeline calculation timed out'
      );
      
      const duration = Date.now() - startTime;
      recordToolCallTime('calculate_weather_timeline', duration);
      return result;
    } catch (error: any) {
      console.error('❌ [ROUTE-AGENT] Weather timeline error:', error.message);
      throw error;
    }
  },
  {
    name: 'calculate_weather_timeline',
    description:
      'Calculate vessel position at regular intervals along a route. Returns positions with datetime and distance.',
    schema: weatherTimelineInputSchema,
  }
);

// Weather Agent Tools are now imported from './tools'
// Removed local definitions to use the canonical ones from tools.ts

// Bunker Agent Tools
const findBunkerPortsTool = tool(
  async (input) => {
    console.log('🔍 [BUNKER-AGENT] Executing find_bunker_ports');
    try {
      return await executePortFinderTool(input);
    } catch (error: any) {
      console.error('❌ [BUNKER-AGENT] Port finder error:', error.message);
      throw error;
    }
  },
  {
    name: 'find_bunker_ports',
    description:
      'Find bunker ports along a maritime route within a specified deviation distance. Requires route waypoints from calculate_route.',
    schema: portFinderInputSchema,
  }
);

const getFuelPricesTool = tool(
  async (input) => {
    console.log('💰 [BUNKER-AGENT] Executing get_fuel_prices');
    try {
      return await executePriceFetcherTool(input);
    } catch (error: any) {
      console.error('❌ [BUNKER-AGENT] Price fetcher error:', error.message);
      throw error;
    }
  },
  {
    name: 'get_fuel_prices',
    description:
      'Fetch current fuel prices for specified ports. Returns prices for VLSFO, LSGO, and MGO with freshness indicators.',
    schema: priceFetcherInputSchema,
  }
);

const analyzeBunkerOptionsTool = tool(
  async (input) => {
    console.log('📊 [BUNKER-AGENT] Executing analyze_bunker_options');
    try {
      return await executeBunkerAnalyzerTool(input);
    } catch (error: any) {
      console.error('❌ [BUNKER-AGENT] Bunker analyzer error:', error.message);
      throw error;
    }
  },
  {
    name: 'analyze_bunker_options',
    description:
      'Analyze and rank bunker port options based on total cost (fuel cost + deviation cost). Returns ranked recommendations.',
    schema: bunkerAnalyzerInputSchema,
  }
);

// ============================================================================
// Logging helpers
// ============================================================================

function summarizeInputForLog(state: MultiAgentState): Record<string, unknown> {
  return {
    has_route_data: !!state.route_data,
    has_vessel_timeline: !!state.vessel_timeline,
    has_weather_forecast: !!state.weather_forecast,
    has_weather_consumption: !!state.weather_consumption,
    has_bunker_ports: !!state.bunker_ports,
    has_bunker_analysis: !!state.bunker_analysis,
    message_count: state.messages?.length ?? 0,
    next_agent: state.next_agent || '(empty)',
  };
}

// ============================================================================
// Capability-Based Routing Helpers
// ============================================================================
// These helpers enable the Supervisor to discover agents dynamically based on
// capabilities and intent. Uses the Agent Registry (AgentDefinition) for
// capability metadata, not the tool registry (AgentRegistryEntry).

/**
 * Get agents that can fulfill a capability
 *
 * @param capability - Capability needed (e.g., 'vessel_lookup')
 * @returns Array of agent IDs that have this capability
 */
function getAgentsWithCapability(capability: string): string[] {
  const registry = CapabilityAgentRegistry.getInstance();
  const agents = registry.getByCapability(capability);
  const enabled = agents.filter((a) => a.enabled).map((a) => a.id);
  if (enabled.length > 0) {
    console.log(`   [CAPABILITY-ROUTING] Found ${enabled.length} agent(s) for '${capability}': ${enabled.join(', ')}`);
  }
  return enabled;
}

/**
 * Get capabilities needed for a user intent
 *
 * @param intent - User intent (e.g., 'vessel_information')
 * @returns Array of capabilities needed
 */
function getCapabilitiesForIntent(intent: string): string[] {
  const capabilities = INTENT_CAPABILITY_MAP[intent] || [];
  if (capabilities.length > 0) {
    console.log(`   [CAPABILITY-ROUTING] Intent '${intent}' requires capabilities: ${capabilities.join(', ')}`);
  }
  return capabilities;
}

/**
 * Find best agent for current state and intent
 *
 * Uses registry to discover which agent can handle the query
 * based on:
 * 1. Capabilities needed
 * 2. Data already available in state
 * 3. Agent dependencies
 *
 * @param state - Current multi-agent state
 * @param intent - User intent
 * @returns Agent ID to route to, or null if unclear
 */
function findBestAgentForIntent(
  state: MultiAgentState,
  intent: string
): string | null {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[CAPABILITY-ROUTING] Finding best agent for intent: ${intent}`);
  console.log(`${'─'.repeat(60)}`);

  // Get capabilities needed for this intent
  const neededCapabilities = getCapabilitiesForIntent(intent);

  if (neededCapabilities.length === 0) {
    console.warn(`⚠️ [SUPERVISOR] Unknown intent: ${intent}`);
    return null;
  }

  // Find agents that have these capabilities
  const candidateAgents: string[] = [];
  neededCapabilities.forEach((capability) => {
    const agents = getAgentsWithCapability(capability);
    agents.forEach((agentId) => {
      if (!candidateAgents.includes(agentId)) {
        candidateAgents.push(agentId);
      }
    });
  });

  if (candidateAgents.length === 0) {
    console.warn(
      `⚠️ [SUPERVISOR] No agents found for capabilities: ${neededCapabilities.join(', ')}`
    );
    return null;
  }

  console.log(
    `   [CAPABILITY-ROUTING] Candidate agents: ${candidateAgents.join(', ')}`
  );

  // Filter by agents whose data requirements are already met
  const registry = CapabilityAgentRegistry.getInstance();
  const viableAgents = candidateAgents.filter((agentId) => {
    const agent = registry.getById(agentId);
    if (!agent) return false;

    const required = agent.consumes?.required || [];
    const allMet = required.every(
      (field) => state[field as keyof MultiAgentState] != null
    );

    if (required.length > 0) {
      const metStr = allMet ? '✅' : '❌';
      console.log(
        `   [CAPABILITY-ROUTING] ${agentId} prerequisites (${required.join(', ')}): ${metStr}`
      );
    }
    return allMet || required.length === 0;
  });

  // Only return agents whose prerequisites are met (viable).
  // When no viable agents, return null so caller uses default (e.g. route_agent).
  const result = viableAgents[0] ?? null;
  if (result) {
    console.log(
      `   [CAPABILITY-ROUTING] Selected agent: ${result} (${viableAgents.length} viable, ${candidateAgents.length} total)`
    );
  }
  console.log(`${'─'.repeat(60)}\n`);

  return result;
}

/**
 * Map QueryIntent (from analyzeQueryIntent) to INTENT_CAPABILITY_MAP key
 *
 * Used for capability-based fallback when mapping user query to routing intent.
 */
function mapQueryIntentToCapabilityIntent(
  intent: import('./intent-analyzer').QueryIntent,
  userQuery: string
): string {
  if (intent.needs_vessel_selection) return 'vessel_selection';
  if (intent.needs_bunker) return 'bunker_planning';
  if (intent.needs_weather) return 'weather_analysis';
  if (intent.needs_route) return 'route_planning';

  // Vessel info / ROB queries (not captured by QueryIntent flags)
  const q = userQuery.toLowerCase();
  if (
    /vessel|ship|imo|rob|noon report|consumption profile/.test(q) &&
    !/compare|which vessel|best ship|select vessel/.test(q)
  ) {
    return 'vessel_information';
  }
  if (/rob|remaining.*fuel|fuel.*sufficient|enough fuel/.test(q)) {
    return 'rob_projection';
  }

  return 'bunker_planning'; // default for maritime queries
}

/**
 * Map QueryIntent to component-registry query_type (for finalize component matching).
 */
function mapIntentToRegistryQueryType(
  intent: import('./intent-analyzer').QueryIntent
): 'bunker_planning' | 'route_calculation' | 'weather_analysis' | 'compliance_check' {
  if (intent.needs_bunker) return 'bunker_planning';
  if (intent.needs_weather) return 'weather_analysis';
  if (intent.needs_route) return 'route_calculation';
  return 'route_calculation';
}

// ============================================================================
// Agent Node Implementations
// ============================================================================

/**
 * Supervisor Agent Node
 *
 * Decides which agent to delegate to next based on available state data.
 * Routes to: route_agent → weather_agent → bunker_agent → finalize
 *
 * Implements graceful degradation: if an agent fails, skip to next step.
 *
 * AGENTIC MODE: When USE_AGENTIC_SUPERVISOR=true, uses ReAct pattern for
 * intelligent reasoning-based routing instead of hard-coded rules.
 */
export async function supervisorAgentNode(
  state: MultiAgentState
): Promise<Partial<MultiAgentState>> {
  console.log('🔍 [DEBUG-SUPERVISOR] Entry');
  console.log('🔍 [DEBUG-SUPERVISOR] State keys:', Object.keys(state));
  console.log('🔍 [DEBUG-SUPERVISOR] Messages count:', state.messages.length);
  
  const cid = extractCorrelationId(state);
  console.log('🔍 [DEBUG-SUPERVISOR] Correlation ID:', cid);
  
  logAgentExecution('supervisor', cid, 0, 'started', { input: summarizeInputForLog(state) });

  // ========================================================================
  // SHARED VESSEL EXTRACTION (all modes – Agentic, Plan, Legacy)
  // ========================================================================
  const userMsg = state.messages.find((m) => m instanceof HumanMessage);
  const userQueryForExtraction =
    userMsg
      ? typeof userMsg.content === 'string'
        ? userMsg.content
        : String(userMsg.content)
      : state.messages[0]?.content?.toString() || '';
  let extractionUpdate: Partial<MultiAgentState> = {};
  if (userQueryForExtraction) {
    const parsed = VesselSelectionQueryParser.parseVesselSelectionQuery(userQueryForExtraction);
    if (parsed && parsed.vessel_names.length >= 2) {
      extractionUpdate = { vessel_names: parsed.vessel_names };
      const hasValidVoyageInState =
        !!state.next_voyage_details?.origin && !!state.next_voyage_details?.destination;
      if (
        !hasValidVoyageInState &&
        (parsed.next_voyage.origin || parsed.next_voyage.destination)
      ) {
        extractionUpdate.next_voyage_details = parsed.next_voyage;
      }
    }
  }
  const mergeExtraction = <T extends Partial<MultiAgentState>>(result: T): T => {
    let base = { ...extractionUpdate, ...result } as T;
    const params = (result as Partial<MultiAgentState>).routing_metadata?.extracted_params;
    if (params) {
      if (typeof params.origin_port === 'string' && typeof params.destination_port === 'string') {
        const prev = base.next_voyage_details;
        base = {
          ...base,
          next_voyage_details: {
            ...(prev && typeof prev === 'object' ? prev : {}),
            origin: params.origin_port,
            destination: params.destination_port,
            ...(typeof params.date === 'string' && params.date ? { departure_date: params.date } : {}),
          },
        } as T;
      }
      if (Array.isArray(params.vessel_names) && params.vessel_names.length >= 1) {
        base = { ...base, vessel_names: params.vessel_names } as T;
      }
    }
    return base;
  };

  // ========================================================================
  // PLAN-BASED SUPERVISOR MODE (NEW - Single LLM Call)
  // ========================================================================
  // Enables: 60% cost reduction, 2-3x speed improvement
  // Set USE_PLAN_BASED_SUPERVISOR=true to enable
  const USE_PLAN_BASED_SUPERVISOR = process.env.USE_PLAN_BASED_SUPERVISOR === 'true';
  
  if (USE_PLAN_BASED_SUPERVISOR) {
    console.log('\n🎯 [SUPERVISOR] Using PLAN-BASED mode (single LLM call)...');
    
    try {
      const result = await planBasedSupervisor(state);
      return applySafetyValidation(state, mergeExtraction(result));
    } catch (error) {
      logError(extractCorrelationId(state), error, { agent: 'supervisor' });
      console.error('❌ [SUPERVISOR] Plan-based supervisor failed, falling back to legacy:', error);
      // Fall through to legacy logic
    }
  }

  // ========================================================================
  // AGENTIC SUPERVISOR MODE (ReAct Pattern)
  // ========================================================================
  const USE_AGENTIC_SUPERVISOR = process.env.USE_AGENTIC_SUPERVISOR === 'true';
  
  if (USE_AGENTIC_SUPERVISOR) {
    console.log('\n🧠 [SUPERVISOR] Using AGENTIC mode (ReAct pattern)...');
    
    try {
      // Dynamic import to avoid circular dependencies
      const { reasoningSupervisor } = await import('./agentic-supervisor');
      const result = await reasoningSupervisor(state);
      return applySafetyValidation(state, mergeExtraction(result));
    } catch (error) {
      logError(extractCorrelationId(state), error, { agent: 'supervisor' });
      console.error('❌ [SUPERVISOR] Agentic supervisor failed, falling back to legacy:', error);
      // Fall through to legacy logic
    }
  }
  
  // ========================================================================
  // LEGACY SUPERVISOR MODE (Original Logic)
  // ========================================================================
  console.log("\n🎯 [SUPERVISOR] Node: Making routing decision...");
  
  // ========================================================================
  // Degradation Detection (NEW)
  // ========================================================================
  // Check for fallback responses in state data and set degraded mode
  let degradedMode = state.degraded_mode || false;
  const missingData: string[] = [...(state.missing_data || [])];
  
  // Check route data for degradation
  if (state.route_data && isFallbackResponse(state.route_data)) {
    degradedMode = true;
    if (!missingData.includes('route_data')) {
      missingData.push('route_data');
    }
    logError(cid, new Error('[DEGRADATION] Route data is degraded'), {
      agent: 'supervisor',
      degradation_type: 'route_data',
      reason: (state.route_data as any)._degradation_reason || 'unknown',
    });
  }
  
  // Check bunker ports for degradation
  if (state.bunker_ports && Array.isArray(state.bunker_ports) && state.bunker_ports.length > 0) {
    const firstPort = state.bunker_ports[0] as any;
    if (isFallbackResponse(firstPort) || firstPort._degraded) {
      degradedMode = true;
      if (!missingData.includes('bunker_ports')) {
        missingData.push('bunker_ports');
      }
      logError(cid, new Error('[DEGRADATION] Bunker ports data is degraded'), {
        agent: 'supervisor',
        degradation_type: 'bunker_ports',
      });
    }
  }
  
  // Check port prices for degradation
  if (state.port_prices && isFallbackResponse(state.port_prices)) {
    degradedMode = true;
    if (!missingData.includes('port_prices')) {
      missingData.push('port_prices');
    }
    logError(cid, new Error('[DEGRADATION] Port prices data is degraded'), {
      agent: 'supervisor',
      degradation_type: 'port_prices',
      reason: (state.port_prices as any)._degradation_reason || 'unknown',
    });
  }
  
  // Check bunker analysis for degradation
  if (state.bunker_analysis && isFallbackResponse(state.bunker_analysis)) {
    degradedMode = true;
    if (!missingData.includes('bunker_analysis')) {
      missingData.push('bunker_analysis');
    }
    logError(cid, new Error('[DEGRADATION] Bunker analysis is degraded'), {
      agent: 'supervisor',
      degradation_type: 'bunker_analysis',
      reason: (state.bunker_analysis as any)._degradation_reason || 'unknown',
    });
  }
  
  // Log current state
  console.log("📊 [SUPERVISOR] Current state:");
  console.log(`   - Route data: ${state.route_data ? '✅' : '❌'} ${(state.route_data as any)?._degraded ? '(degraded)' : ''}`);
  console.log(`   - Vessel timeline: ${state.vessel_timeline ? '✅' : '❌'}`);
  console.log(`   - Weather forecast: ${state.weather_forecast ? '✅' : '❌'}`);
  console.log(`   - Weather consumption: ${state.weather_consumption ? '✅' : '❌'}`);
  console.log(`   - Port weather: ${state.port_weather_status ? '✅' : '❌'}`);
  console.log(`   - Bunker ports: ${state.bunker_ports ? '✅' : '❌'} ${(state.bunker_ports as any)?._degraded ? '(degraded)' : ''}`);
  console.log(`   - Port prices: ${state.port_prices ? '✅' : '❌'} ${(state.port_prices as any)?._degraded ? '(degraded)' : ''}`);
  console.log(`   - Bunker analysis: ${state.bunker_analysis ? '✅' : '❌'} ${(state.bunker_analysis as any)?._degraded ? '(degraded)' : ''}`);
  if (degradedMode) {
    console.log(`   ⚠️ Degraded mode: YES (missing: ${missingData.join(', ')})`);
  }

  // Get user query to analyze intent FIRST (before loop detection)
  const userMessage = state.messages.find((msg) => msg instanceof HumanMessage);
  const userQuery = userMessage 
    ? (typeof userMessage.content === 'string' ? userMessage.content : String(userMessage.content))
    : state.messages[0]?.content?.toString() || 'Plan bunker route';

  // ========================================================================
  // Vessel Selection Query Detection (priority - before other routing)
  // Prefer LLM-extracted vessel_names and origin/destination when present.
  // ========================================================================
  const isVesselSelection = VesselSelectionQueryParser.isVesselSelectionQuery(userQuery);
  if (isVesselSelection) {
    const params = state.routing_metadata?.extracted_params;
    const llmVesselNames = Array.isArray(params?.vessel_names) ? params.vessel_names : [];
    const hasLLMVoyage =
      typeof params?.origin_port === 'string' && typeof params?.destination_port === 'string';

    if (llmVesselNames.length >= 2 && hasLLMVoyage) {
      console.log(`🎯 [SUPERVISOR] Detected vessel selection query for ${llmVesselNames.length} vessels (from LLM extraction)`);
      const voyage = {
        origin: params!.origin_port!,
        destination: params!.destination_port!,
      };
      const voyageDesc = `${voyage.origin} to ${voyage.destination}`;
      const vesselSelectionUpdate = {
        ...state,
        vessel_names: llmVesselNames,
        next_voyage_details: voyage,
        next_agent: 'vessel_selection_agent' as const,
        messages: [
          ...state.messages,
          new HumanMessage(`Comparing ${llmVesselNames.join(', ')} for ${voyageDesc}`),
        ],
      };
      return applySafetyValidation(state, mergeExtraction(vesselSelectionUpdate));
    }

    const vesselInput = VesselSelectionQueryParser.parseVesselSelectionQuery(userQuery);
    if (
      vesselInput &&
      vesselInput.vessel_names.length > 1 &&
      vesselInput.next_voyage.origin &&
      vesselInput.next_voyage.destination
    ) {
      console.log(`🎯 [SUPERVISOR] Detected vessel selection query for ${vesselInput.vessel_names.length} vessels (from parser)`);

      const voyage = vesselInput.next_voyage;
      const voyageDesc = `${voyage.origin} to ${voyage.destination}`;

      const vesselSelectionUpdate = {
        ...state,
        vessel_names: vesselInput.vessel_names,
        next_voyage_details: voyage,
        next_agent: 'vessel_selection_agent' as const,
        messages: [
          ...state.messages,
          new HumanMessage(`Comparing ${vesselInput.vessel_names.join(', ')} for ${voyageDesc}`),
        ],
      };
      return applySafetyValidation(state, mergeExtraction(vesselSelectionUpdate));
    }
  }

  // ========================================================================
  // Vessel Selection Intent & Extraction (for later routing when not early-returned)
  // Prefer LLM-extracted vessel_names and origin/destination; use parser as fallback.
  // ========================================================================
  const hasVesselSelectionIntent = isVesselSelection;

  const routingParams = state.routing_metadata?.extracted_params;
  let extractedVesselNames: string[] =
    state.vessel_names ??
    (Array.isArray(routingParams?.vessel_names) && routingParams.vessel_names.length > 0
      ? routingParams.vessel_names
      : []);
  let extractedNextVoyage: { origin: string; destination: string; departure_date?: string; speed?: number } | undefined =
    state.next_voyage_details ??
    (typeof routingParams?.origin_port === 'string' && typeof routingParams?.destination_port === 'string'
      ? { origin: routingParams.origin_port, destination: routingParams.destination_port }
      : undefined);

  if (hasVesselSelectionIntent && (extractedVesselNames.length === 0 || !extractedNextVoyage?.origin)) {
    const parsed = VesselSelectionQueryParser.parseVesselSelectionQuery(userQuery);
    if (parsed) {
      if (extractedVesselNames.length === 0 && parsed.vessel_names.length > 0) {
        extractedVesselNames = parsed.vessel_names;
      }
      if (!extractedNextVoyage?.origin && (parsed.next_voyage.origin || parsed.next_voyage.destination)) {
        extractedNextVoyage = parsed.next_voyage;
      }
      if (extractedVesselNames.length > 0) {
        console.log('🎯 [SUPERVISOR] Vessel selection intent detected. Extracted vessel names:', extractedVesselNames);
      }
    }
  }

  if (hasVesselSelectionIntent && !extractedNextVoyage?.origin && state.route_data) {
    extractedNextVoyage = {
      origin: state.route_data.origin_port_code ?? state.route_data.origin_port_name ?? '',
      destination: state.route_data.destination_port_code ?? state.route_data.destination_port_name ?? '',
    };
    console.log('🎯 [SUPERVISOR] Using route_data for next_voyage_details:', extractedNextVoyage);
  }
  if (hasVesselSelectionIntent && !extractedNextVoyage?.origin && state.port_overrides) {
    extractedNextVoyage = {
      origin: state.port_overrides.origin ?? '',
      destination: state.port_overrides.destination ?? '',
    };
    console.log('🎯 [SUPERVISOR] Using port_overrides for next_voyage_details:', extractedNextVoyage);
  }

  // ========================================================================
  // Circuit Breaker Check (NEW)
  // ========================================================================
  const agentCallCounts = countAgentCalls(state.messages);
  console.log('📊 [SUPERVISOR] Agent call counts:', agentCallCounts);

  // Check if we're stuck in a loop with any agent
  for (const [agent, count] of Object.entries(agentCallCounts)) {
    if (count >= 3) {
      console.error(
        `❌ [SUPERVISOR] Circuit breaker: ${agent} called ${count} times without progress`
      );
      
      // Mark this agent as failed
      if (!state.agent_status) state.agent_status = {};
      state.agent_status[agent] = 'failed';
      
      if (!state.agent_errors) state.agent_errors = {};
      state.agent_errors[agent] = {
        error: `Circuit breaker triggered: ${agent} called ${count} times without completing`,
        timestamp: Date.now(),
      };
    }
  }
  
  // ========================================================================
  // Registry-Based Planning (NEW)
  // ========================================================================
  const USE_REGISTRY_PLANNING = process.env.USE_REGISTRY_PLANNING !== 'false';
  let executionPlan: SupervisorPlan | null = null;
  let planningSource: 'registry_llm' | 'legacy_keywords' = 'legacy_keywords';
  
  // Check if we already have an execution plan in state (avoid regenerating)
  // Only generate plan on first call (when no agents have run yet)
  const hasAgentProgress = state.route_data || state.weather_forecast || state.bunker_analysis;
  const shouldGeneratePlan = !hasAgentProgress && USE_REGISTRY_PLANNING;
  
  if (shouldGeneratePlan) {
    try {
      console.log('📋 [SUPERVISOR] Calling generateExecutionPlan...');
      const availableAgents = AgentRegistry.getAllAgents();
      
      // Log tool binding info for LLM planning
      const toolsForBinding = AgentRegistry.getToolsForLLMBinding();
      console.log(`🔧 [SUPERVISOR] Registry has ${toolsForBinding.length} tools for LLM binding`);
      if (toolsForBinding.length > 0) {
        console.log(`   Tools: ${toolsForBinding.map(t => t.function.name).join(', ')}`);
      }
      
      // Log deterministic agents (they won't have tool bindings)
      const deterministicAgents = availableAgents
        .filter(a => AgentRegistry.isDeterministicAgent(a.agent_name))
        .map(a => a.agent_name);
      if (deterministicAgents.length > 0) {
        console.log(`   Deterministic agents (no tool binding): ${deterministicAgents.join(', ')}`);
      }
      
      executionPlan = await generateExecutionPlan(userQuery, state, availableAgents);
      planningSource = 'registry_llm';
      console.log('✅ [SUPERVISOR] Execution plan generated successfully');
      console.log('✅ [SUPERVISOR] Generated execution plan:', {
        agents: executionPlan.execution_order,
        reasoning: executionPlan.reasoning.substring(0, 100),
        estimated_time: executionPlan.estimated_total_time
      });
    } catch (error) {
      console.error('❌ [SUPERVISOR] generateExecutionPlan failed:', error);
      console.error('   Error details:', error instanceof Error ? error.message : String(error));
      console.error('   Stack:', error instanceof Error ? error.stack : 'no stack');
      // Fall back to legacy routing
      executionPlan = null;
      planningSource = 'legacy_keywords';
    }
  }
  
  // Analyze intent (needed for both paths)
  const intent = analyzeQueryIntent(userQuery);

  // Persist original intent for finalize component matching (legacy path; agentic sets it on first pass)
  const legacyOriginalIntentUpdate =
    !state.original_intent ? { original_intent: mapIntentToRegistryQueryType(intent) } : {};

  // Build agent context from plan OR legacy
  let agentContext: import('./state').AgentContext;
  
  if (executionPlan) {
    // Build context from execution plan
    agentContext = {
      route_agent: executionPlan.execution_order.includes('route_agent') ? {
        needs_weather_timeline: intent.needs_weather || intent.needs_bunker,
        needs_port_info: intent.needs_bunker,
        required_tools: executionPlan.agent_tool_assignments['route_agent'] || [],
        task_description: executionPlan.reasoning,
        priority: 'critical' as const,
        // Pass resolved UN/LOCODE codes AND coordinates (if available) or extracted names (as fallback)
        port_overrides: executionPlan.resolved_codes?.origin || executionPlan.resolved_codes?.destination ? {
          origin: executionPlan.resolved_codes.origin,
          destination: executionPlan.resolved_codes.destination,
          origin_coordinates: executionPlan.resolved_codes.origin_coordinates,
          destination_coordinates: executionPlan.resolved_codes.destination_coordinates,
        } : executionPlan.extracted_entities ? {
          origin: executionPlan.extracted_entities.origin,
          destination: executionPlan.extracted_entities.destination,
        } : undefined,
        vessel_speed: executionPlan.extracted_entities?.vessel_speed,
        departure_date: executionPlan.extracted_entities?.departure_date,
      } : undefined,
      weather_agent: executionPlan.execution_order.includes('weather_agent') ? {
        needs_consumption: intent.needs_bunker,
        needs_port_weather: intent.needs_bunker && !!state.bunker_ports && state.bunker_ports.length > 0,
        required_tools: (() => {
          // Get tools from execution plan
          const planTools = executionPlan.agent_tool_assignments['weather_agent'] || [];
          // If consumption is needed, ensure both fetch_marine_weather and calculate_weather_consumption are included
          if (intent.needs_bunker) {
            const toolsSet = new Set(planTools);
            // Include fetch_marine_weather if weather forecast is missing
            if (!state.weather_forecast) {
              toolsSet.add('fetch_marine_weather');
            }
            // Always include calculate_weather_consumption when consumption is needed and not yet calculated
            if (!state.weather_consumption) {
              toolsSet.add('calculate_weather_consumption');
            }
            return Array.from(toolsSet);
          }
          return planTools;
        })(),
        task_description: executionPlan.reasoning,
        priority: intent.needs_bunker ? 'critical' as const : 'important' as const
      } : undefined,
      bunker_agent: executionPlan.execution_order.includes('bunker_agent') ? {
        needs_weather_consumption: intent.needs_weather && intent.needs_bunker,
        needs_port_weather: intent.needs_bunker,
        required_tools: executionPlan.agent_tool_assignments['bunker_agent'] || [],
        task_description: executionPlan.reasoning,
        priority: 'critical' as const,
        fuel_types: executionPlan.extracted_entities?.fuel_types,
        bunker_ports: executionPlan.resolved_codes?.bunker_ports || executionPlan.extracted_entities?.bunker_ports,
      } : undefined,
      finalize: {
        complexity: intent.complexity,
        needs_weather_analysis: intent.needs_weather,
        needs_bunker_analysis: intent.needs_bunker,
      }
    };
    
    // Log extracted entities and resolved codes if available
    if (executionPlan.extracted_entities) {
      console.log('🎯 [SUPERVISOR] Using extracted entities:', {
        query_type: executionPlan.extracted_entities.query_type,
        origin: executionPlan.extracted_entities.origin,
        destination: executionPlan.extracted_entities.destination,
        vessel_speed: executionPlan.extracted_entities.vessel_speed,
        fuel_types: executionPlan.extracted_entities.fuel_types?.length || 0,
      });
    }
    
    if (executionPlan.resolved_codes && (executionPlan.resolved_codes.origin || executionPlan.resolved_codes.destination)) {
      console.log('✅ [SUPERVISOR] Using resolved port codes (UN/LOCODE):', {
        origin: executionPlan.resolved_codes.origin,
        destination: executionPlan.resolved_codes.destination,
      });
    }
  } else {
    // Legacy path: use existing generateAgentContext
    const legacyContext = generateAgentContext(intent, state);
    // Add required_tools as empty arrays for backwards compatibility
    agentContext = {
      route_agent: legacyContext.route_agent ? {
        ...legacyContext.route_agent,
        required_tools: [],
        task_description: '',
        priority: 'critical' as const
      } : undefined,
      weather_agent: legacyContext.weather_agent ? {
        ...legacyContext.weather_agent,
        required_tools: [],
        task_description: '',
        priority: 'important' as const
      } : undefined,
      bunker_agent: legacyContext.bunker_agent ? {
        ...legacyContext.bunker_agent,
        required_tools: [],
        task_description: '',
        priority: 'critical' as const
      } : undefined,
      finalize: legacyContext.finalize
    };
  }
  
  // Log planning metrics
  const cacheHit = executionPlan !== null && planningSource === 'registry_llm';
  console.log('📊 [SUPERVISOR-METRICS]', {
    planning_source: planningSource,
    agents_planned: executionPlan?.execution_order.length || 0,
    total_tools_assigned: executionPlan 
      ? Object.values(executionPlan.agent_tool_assignments)
          .reduce((sum, tools) => sum + tools.length, 0)
      : 0,
    estimated_time: executionPlan?.estimated_total_time,
    cache_hit: cacheHit
  });

  // Log message count for debugging
  const messageCount = state.messages.length;
  console.log(`📊 [SUPERVISOR] Message count: ${messageCount}`);
  
  // Check for weather agent stuck in loop (many messages, weather agent failed, no weather data)
  const weatherAgentFailedStatus = state.agent_status?.weather_agent === 'failed';
  const hasWeatherData = state.weather_forecast || state.weather_consumption;
  const queryNeedsWeather = intent.needs_weather;
  
  // If weather agent failed and we have many messages, force finalize
  if (messageCount > 15 && weatherAgentFailedStatus && !hasWeatherData && queryNeedsWeather) {
    console.log("⚠️ [SUPERVISOR] Weather agent failed loop detected (15+ messages, agent failed) - forcing finalize");
    return {
      ...legacyOriginalIntentUpdate,
      next_agent: "finalize",
      agent_context: agentContext,
      messages: [],
    };
  }
  
  // Safety check: prevent infinite loops with higher limit
  // Multi-agent flow needs ~10-30 messages for complex queries
  if (messageCount > 60) {  // Increased from 25 to 60
    console.error('❌ [SUPERVISOR] Hard limit reached (60+ messages) - forcing finalize');
    return {
      ...legacyOriginalIntentUpdate,
      next_agent: "finalize",
      agent_context: agentContext,
      messages: [],
    };
  }

  // Bunker agent error recovery: if bunker failed 2+ times, route to finalize with error (no re-route to bunker)
  const bunkerCallCount = state.agent_call_counts?.bunker_agent ?? 0;
  const hasBunkerError = state.agent_errors?.bunker_agent;
  if (hasBunkerError && bunkerCallCount >= 2) {
    console.error('🚨 [SUPERVISOR] Bunker agent failed 2+ times, routing to finalize with error');
    return { ...legacyOriginalIntentUpdate, ...buildBunkerErrorFinalizeReturn(state, agentContext) };
  }

  // Additional check: If we have 40+ messages but NO progress, something is stuck
  if (messageCount > 40) {
    // Check if we have ANY data
    const hasRoute = !!state.route_data;
    const hasWeather = !!state.weather_forecast || !!state.weather_consumption;
    const hasBunker = !!state.bunker_analysis;
    const hasAnyProgress = hasRoute || hasWeather || hasBunker;
    
    if (!hasAnyProgress) {
      console.error('❌ [SUPERVISOR] 40+ messages with ZERO progress - system stuck!');
      console.error('📊 [SUPERVISOR] Debugging: route=', hasRoute, ', weather=', hasWeather, ', bunker=', hasBunker);
      console.error('📊 [SUPERVISOR] Agent status:', state.agent_status);
      console.error('📊 [SUPERVISOR] Last 5 messages:', state.messages.slice(-5).map(m => m.constructor.name));
      
      return {
        ...legacyOriginalIntentUpdate,
        next_agent: "finalize",
        agent_context: agentContext,
        messages: [],
        final_recommendation: "⚠️ SYSTEM ERROR: Multi-agent workflow failed to make progress after 40 iterations. This typically indicates a routing or tool execution issue. Please try again or use the manual workflow.",
      };
    }
  }
  
  // Early detection: If we have 10+ messages and weather is needed but missing, likely stuck
  // (This catches stuck weather agent earlier)
  if (messageCount >= 10 && state.route_data && !state.weather_forecast && !state.weather_consumption) {
    // Check if query needs weather
    const queryLower = userQuery.toLowerCase();
    const queryNeedsWeatherCheck = ['weather', 'forecast', 'consumption', 'conditions', 'wind', 'wave'].some(k => queryLower.includes(k));
    const queryNeedsBunkerCheck = ['bunker', 'fuel', 'port', 'price', 'cheapest'].some(k => queryLower.includes(k));
    
    if (queryNeedsWeatherCheck && !queryNeedsBunkerCheck) {
      console.log("⚠️ [SUPERVISOR] Early detection: Weather stuck (10+ messages, no weather data) - finalizing");
      return {
        ...legacyOriginalIntentUpdate,
        next_agent: "finalize",
        agent_context: agentContext,
        messages: [],
      };
    }
  }
  
  console.log('🔍 [SUPERVISOR] Intent analysis:', {
    needs_route: intent.needs_route,
    needs_weather: intent.needs_weather,
    needs_bunker: intent.needs_bunker,
    complexity: intent.complexity,
  });
  
  console.log('📋 [SUPERVISOR] Agent context:', {
    route_agent: agentContext.route_agent,
    weather_agent: agentContext.weather_agent,
    bunker_agent: agentContext.bunker_agent,
    finalize: agentContext.finalize,
  });
  
  // Use intent for routing decisions
  // For route-only queries: route is complete if route_data exists (vessel_timeline not needed)
  // For weather/bunker queries: route is complete if both route_data AND vessel_timeline exist
  const routeCompleteForQuery = state.route_data && (
    !agentContext.route_agent?.needs_weather_timeline || state.vessel_timeline
  );
  const needsRoute = intent.needs_route && !routeCompleteForQuery;
  const needsWeather = intent.needs_weather;
  const needsBunker = intent.needs_bunker;

  // ========================================================================
  // Comprehensive State Analysis Logging
  // ========================================================================
  const hasRoute = !!state.route_data;
  const hasTimeline = !!state.vessel_timeline;
  const hasWeather = !!state.weather_forecast;
  const hasBunker = !!state.bunker_analysis;
  
  console.log('═'.repeat(80));
  console.log('📊 [SUPERVISOR] Complete State Analysis:');
  console.log('─'.repeat(80));
  console.log('📦 Data Available:');
  console.log(`   • Route: ${hasRoute ? '✅' : '❌'} ${state.route_data ? `(${state.route_data.distance_nm} nm)` : ''}`);
  console.log(`   • Timeline: ${hasTimeline ? '✅' : '❌'} ${state.vessel_timeline ? `(${state.vessel_timeline.length} positions)` : ''}`);
  console.log(`   • Weather Forecast: ${hasWeather ? '✅' : '❌'} ${state.weather_forecast ? `(${state.weather_forecast.length} points)` : ''}`);
  console.log(`   • Weather Consumption: ${state.weather_consumption ? '✅' : '❌'}`);
  console.log(`   • Bunker Analysis: ${hasBunker ? '✅' : '❌'}`);
  console.log('─'.repeat(80));
  console.log('🎯 Query Requirements:');
  console.log(`   • Needs Route: ${needsRoute ? '✅' : '❌'}`);
  console.log(`   • Needs Weather: ${needsWeather ? '✅' : '❌'}`);
  console.log(`   • Needs Bunker: ${needsBunker ? '✅' : '❌'}`);
  console.log('─'.repeat(80));
  console.log('🔄 Agent Status:');
  if (state.agent_status && Object.keys(state.agent_status).length > 0) {
    Object.entries(state.agent_status).forEach(([agent, status]) => {
      const icon = status === 'success' ? '✅' : status === 'failed' ? '❌' : '⏳';
      console.log(`   • ${agent}: ${icon} ${status}`);
    });
  } else {
    console.log('   • No agents executed yet');
  }
  console.log('═'.repeat(80));

  // NEW LOGIC: Check if weather agent is stuck
  // Better detection: If route is complete, weather is needed, but weather data doesn't exist
  // AND we've been through supervisor multiple times, we're likely stuck
  // Use routeCompleteForQuery which considers context (vessel_timeline only needed if weather/bunker analysis required)
  const weatherNeededButMissing = needsWeather && !state.weather_forecast && !state.weather_consumption;
  
  // Count how many times we've likely tried weather_agent by checking message patterns
  // Look for AIMessages from weather_agent (they'll have tool_calls or empty content)
  const weatherAgentAttempts = state.messages.filter(m => {
    if (m instanceof AIMessage) {
      // Check if this looks like a weather agent response (has tool_calls or is empty)
      const hasToolCalls = m.tool_calls && m.tool_calls.length > 0;
      const isEmpty = !m.content || (Array.isArray(m.content) && m.content.length === 0) || m.content === '[]';
      // If it's an AIMessage with tool_calls for weather tools, or empty response, likely weather_agent
      if (hasToolCalls && m.tool_calls) {
        const toolNames = m.tool_calls.map((tc: any) => tc.name || '').join(',');
        return toolNames.includes('fetch_marine_weather') || toolNames.includes('calculate_weather_consumption');
      }
      // Empty responses after route is complete are likely failed weather_agent attempts
      if (isEmpty && routeCompleteForQuery) {
        return true;
      }
    }
    return false;
  }).length;
  
  // Also check agent_status for weather_agent failures
  const weatherAgentFailedStatus2 = state.agent_status?.weather_agent === 'failed';
  const weatherAgentPartial = state.weather_agent_partial === true;
  
  // If weather is needed but we've tried multiple times with no progress, or agent failed
  if (routeCompleteForQuery && weatherNeededButMissing && (weatherAgentAttempts >= 3 || weatherAgentFailedStatus2)) {
    // If weather was needed but agent is stuck, check if we should skip or finalize
    if (needsWeather && !needsBunker) {
      // User only asked for weather, not bunker - finalize with what we have
      console.log(`⚠️ [SUPERVISOR] Weather agent stuck (${weatherAgentAttempts} attempts${weatherAgentFailedStatus2 ? ', agent failed' : ''}) - finalizing with route data only`);
      const intent = analyzeQueryIntent(userQuery);
      const agentContext = generateAgentContext(intent, state);
      return {
        ...legacyOriginalIntentUpdate,
        next_agent: "finalize",
        agent_context: agentContext,
        messages: [],
      };
    } else if (needsBunker) {
      // User asked for bunker too - skip weather and go to bunker
      console.log(`⚠️ [SUPERVISOR] Weather agent stuck (${weatherAgentAttempts} attempts${weatherAgentFailedStatus2 ? ', agent failed' : ''}) - skipping to bunker`);
      
      // Always use execution plan's tool assignments if available, otherwise fall back to legacy
      let agentContext = state.agent_context;
      
      // Bunker agent is now deterministic - doesn't need tool assignments
      // Ensure agentContext exists and has bunker_agent
      if (!agentContext) {
        const intent = analyzeQueryIntent(userQuery);
        agentContext = generateAgentContext(intent, state);
      }
      
      // Set bunker agent context (no tools needed - deterministic workflow)
      if (!agentContext.bunker_agent) {
        agentContext.bunker_agent = {
          needs_weather_consumption: true,
          needs_port_weather: executionPlan?.agent_tool_assignments['bunker_agent']?.includes('check_bunker_port_weather') || false,
          required_tools: [], // Deterministic - no tools needed
          task_description: executionPlan?.agent_tool_assignments['bunker_agent'] 
            ? `Execute bunker workflow: ${executionPlan.agent_tool_assignments['bunker_agent'].join(', ')}`
            : 'Execute bunker analysis workflow',
          priority: 'critical' as const
        };
      } else {
        // Ensure required_tools is empty (deterministic workflow)
        agentContext.bunker_agent.required_tools = [];
        // Update needs_port_weather from execution plan if available
        if (executionPlan?.agent_tool_assignments['bunker_agent']?.includes('check_bunker_port_weather')) {
          agentContext.bunker_agent.needs_port_weather = true;
        }
      }
      
      if (hasBunkerError) {
        console.warn('⚠️ [SUPERVISOR] Blocking re-route to bunker_agent after failure');
        return buildBunkerErrorFinalizeReturn(state, agentContext);
      }
      return applyCircuitBreaker("bunker_agent", state, mergeExtraction({
        ...legacyOriginalIntentUpdate,
        next_agent: "bunker_agent",
        agent_context: agentContext,
        messages: [],
      }));
    } else {
      // Neither weather nor bunker needed - shouldn't happen, but finalize
      console.log("⚠️ [SUPERVISOR] Weather agent stuck but not needed - finalizing");
      const intent = analyzeQueryIntent(userQuery);
      const agentContext = generateAgentContext(intent, state);
      return {
        ...legacyOriginalIntentUpdate,
        next_agent: "finalize",
        agent_context: agentContext,
        messages: [],
      };
    }
  }
  
  // If weather agent has partial data, we can proceed
  if (weatherAgentPartial && needsWeather && state.weather_forecast) {
    // Weather agent has partial data, continue to next step if needed
    if (needsBunker && !state.bunker_analysis) {
      if (hasBunkerError) {
        console.warn('⚠️ [SUPERVISOR] Blocking re-route to bunker_agent after failure');
        return { ...legacyOriginalIntentUpdate, ...buildBunkerErrorFinalizeReturn(state, agentContext) };
      }
      console.log('🎯 [SUPERVISOR] Weather partial, bunker needed → bunker_agent');
      return applyCircuitBreaker("bunker_agent", state, mergeExtraction({
        ...legacyOriginalIntentUpdate,
        next_agent: "bunker_agent",
        agent_context: agentContext,
        messages: [],
      }));
    } else {
      console.log('🎯 [SUPERVISOR] Weather partial, all requested work done → finalize');
      return {
        ...legacyOriginalIntentUpdate,
        next_agent: "finalize",
        agent_context: agentContext,
        messages: [],
      };
    }
  }
  
  // Log intent analysis
  console.log('🔍 [SUPERVISOR] Query intent analysis:');
  console.log(`   - Needs route: ${needsRoute}`);
  console.log(`   - Needs weather: ${needsWeather}`);
  console.log(`   - Needs bunker: ${needsBunker}`);
  console.log(`   - Query: "${userQuery.substring(0, 100)}"`);
  
  // ========================================================================
  // Data Validation Helper: Check if agent prerequisites are met
  // ========================================================================
  function validateAgentPrerequisites(agentName: string): { valid: boolean; missing: string[] } {
    const agent = AgentRegistry.getAgent(agentName);
    if (!agent) {
      console.warn(`⚠️ [SUPERVISOR] Agent ${agentName} not found in registry`);
      return { valid: false, missing: ['agent_not_registered'] };
    }
    
    const missing: string[] = [];
    
    // Check prerequisites based on agent type
    for (const prereq of agent.prerequisites) {
      let hasPrereq = false;
      
      // Map prerequisite names to state fields
      if (prereq === 'origin_port' || prereq === 'destination_port') {
        // Check if ports can be extracted from query or state
        hasPrereq = !!userQuery || !!state.route_data;
      } else if (prereq === 'route_data') {
        hasPrereq = !!state.route_data;
      } else if (prereq === 'vessel_timeline') {
        hasPrereq = !!state.vessel_timeline;
      } else if (prereq === 'vessel_speed') {
        // Vessel speed can be extracted from query or has default
        hasPrereq = true; // Always available (default or from query)
      } else if (prereq === 'weather_forecast') {
        hasPrereq = !!state.weather_forecast;
      } else if (prereq === 'bunker_ports') {
        hasPrereq = !!state.bunker_ports && state.bunker_ports.length > 0;
      } else if (prereq === 'messages') {
        hasPrereq = !!(state.messages && state.messages.length > 0);
      } else {
        // Unknown prerequisite - assume valid for now
        hasPrereq = true;
      }
      
      if (!hasPrereq) {
        missing.push(prereq);
      }
    }
    
    return { valid: missing.length === 0, missing };
  }
  
  // ========================================================================
  // Prefer Execution Plan if Available
  // ========================================================================
  if (executionPlan && executionPlan.execution_order.length > 0) {
    // Find first agent in execution order that hasn't completed its work
    for (const agentName of executionPlan.execution_order) {
      // REMOVED: tools.length check - if agent is in execution plan, it should run
      // Tools are metadata, not execution requirements. Deterministic agents don't need tools.
      
      // DATA VALIDATION: Check prerequisites before routing
      const validation = validateAgentPrerequisites(agentName);
      if (!validation.valid) {
        console.warn(`⚠️ [SUPERVISOR] Cannot route to ${agentName} - missing prerequisites: ${validation.missing.join(', ')}`);
        // Skip this agent and try next one
        continue;
      }
      
      // Check if agent has failed - if so, skip to next agent
      if (state.agent_status?.[agentName] === 'failed') {
        console.warn(`⚠️ [SUPERVISOR] ${agentName} has failed, skipping to next agent in plan`);
        continue;
      }
      
      // Check if agent's work is already done
      const routeAgentDone = agentName === 'route_agent' && routeCompleteForQuery;
      const complianceAgentDone = agentName === 'compliance_agent' && state.compliance_data;
      const entityExtractorDone = agentName === 'entity_extractor' &&
        (state.agent_status?.entity_extractor === 'success' || !!state.vessel_identifiers);
      const weatherAgentDone = agentName === 'weather_agent' && 
        state.weather_forecast && 
        (!needsBunker || state.weather_consumption);
      
      // Bunker agent is only done if it has actual analysis data with recommendations
      const bunkerAgentDone = agentName === 'bunker_agent' && 
        state.bunker_analysis && 
        state.bunker_analysis.recommendations && 
        Array.isArray(state.bunker_analysis.recommendations) && 
        state.bunker_analysis.recommendations.length > 0 &&
        state.bunker_analysis.best_option;
      
      const agentDone = routeAgentDone || complianceAgentDone || entityExtractorDone || weatherAgentDone || bunkerAgentDone;
      
      // Debug logging for bunker_agent to diagnose issues
      if (agentName === 'bunker_agent') {
        console.log(`🔍 [SUPERVISOR] Checking bunker_agent completion:`, {
          has_bunker_analysis: !!state.bunker_analysis,
          type: typeof state.bunker_analysis,
          is_null: state.bunker_analysis === null,
          is_undefined: state.bunker_analysis === undefined,
          has_recommendations: !!(state.bunker_analysis as any)?.recommendations,
          recommendations_length: Array.isArray((state.bunker_analysis as any)?.recommendations) 
            ? (state.bunker_analysis as any).recommendations.length 
            : 'not an array',
          has_best_option: !!(state.bunker_analysis as any)?.best_option,
          bunker_analysis_keys: state.bunker_analysis ? Object.keys(state.bunker_analysis) : 'N/A',
          agentDone: bunkerAgentDone,
        });
      }
      
      if (!agentDone) {
        console.log(`🎯 [SUPERVISOR] Using execution plan: routing to ${agentName} (prerequisites validated)`);
        
        // Prepare state update
        const stateUpdate: any = {
          next_agent: agentName,
          agent_context: agentContext,
          messages: [],
        };
        
        // If we have resolved port codes and routing to route_agent, set port_overrides in state
        if (agentName === 'route_agent' && executionPlan.resolved_codes && 
            (executionPlan.resolved_codes.origin || executionPlan.resolved_codes.destination)) {
          stateUpdate.port_overrides = {
            origin: executionPlan.resolved_codes.origin,
            destination: executionPlan.resolved_codes.destination,
            origin_coordinates: executionPlan.resolved_codes.origin_coordinates,
            destination_coordinates: executionPlan.resolved_codes.destination_coordinates,
          };
          console.log('🎯 [SUPERVISOR] Setting state.port_overrides:', stateUpdate.port_overrides);
        }
        
        return stateUpdate;
      }
    }
    
    // All agents in plan are done, finalize
    console.log('🎯 [SUPERVISOR] Execution plan complete → finalize');
    return {
      ...legacyOriginalIntentUpdate,
      next_agent: "finalize",
      agent_context: agentContext,
      messages: [],
    };
  }
  
  // ========================================================================
  // STANDALONE PORT WEATHER - Direct routing without route calculation
  // ========================================================================
  
  // Check if this is a standalone port weather query (no route needed)
  if (intent.weather_type === 'port_weather' && intent.weather_port) {
    console.log('🌤️ [SUPERVISOR] Standalone port weather query detected');
    console.log(`   Port: ${intent.weather_port}`);
    console.log(`   Date: ${intent.weather_date || 'not specified'}`);
    
    // Skip to weather agent if not already done
    if (!state.standalone_port_weather && state.agent_status?.weather_agent !== 'success') {
      console.log('🎯 [SUPERVISOR] Decision: Standalone port weather → weather_agent (direct)');
      return {
        ...legacyOriginalIntentUpdate,
        next_agent: 'weather_agent',
        agent_context: agentContext,
        messages: [],
      };
    }
    
    // Weather done, finalize
    if (state.standalone_port_weather || state.agent_status?.weather_agent === 'success') {
      console.log('🎯 [SUPERVISOR] Decision: Port weather complete → finalize');
      return {
        ...legacyOriginalIntentUpdate,
        next_agent: 'finalize',
        agent_context: agentContext,
        messages: [],
      };
    }
    
    // Weather agent failed
    if (state.agent_status?.weather_agent === 'failed') {
      console.log('⚠️ [SUPERVISOR] Port weather failed → finalize with error');
      return {
        ...legacyOriginalIntentUpdate,
        next_agent: 'finalize',
        agent_context: agentContext,
        messages: [],
      };
    }
  }
  
  // ========================================================================
  // DETERMINISTIC DECISION LOGIC - Based on actual needs, not fixed sequence
  // (Legacy fallback when execution plan is not available)
  // ========================================================================
  
  // 1. If route is needed and not available, get route first
  // BUT: Check if route_agent has already failed - if so, finalize with error instead of retrying
  if (needsRoute && !routeCompleteForQuery) {
    // Check if route_agent has already failed - if so, finalize with error instead of retrying
    if (state.agent_status?.route_agent === 'failed') {
      console.log('⚠️ [SUPERVISOR] Route needed but route_agent has failed - finalizing with error');
      return {
        ...legacyOriginalIntentUpdate,
        next_agent: "finalize",
        agent_context: agentContext,
        messages: [],
      };
    }
    
    // DATA VALIDATION: Check prerequisites before routing
    const validation = validateAgentPrerequisites('route_agent');
    if (!validation.valid) {
      console.warn(`⚠️ [SUPERVISOR] Cannot route to route_agent - missing prerequisites: ${validation.missing.join(', ')}`);
      // Try to finalize with error
      return {
        ...legacyOriginalIntentUpdate,
        next_agent: "finalize",
        agent_context: agentContext,
        messages: [],
      };
    }
    
    console.log('🎯 [SUPERVISOR] Decision: Route needed but missing → route_agent (prerequisites validated)');
    return applyCircuitBreaker("route_agent", state, mergeExtraction({
      ...legacyOriginalIntentUpdate,
      next_agent: "route_agent",
      agent_context: agentContext,
      messages: [],
    }));
  }
  
  // 2. If route is complete (for this query type), check what else is needed based on query intent
  if (routeCompleteForQuery) {
    // Check if compliance check is needed
    const needsCompliance = 
      state.route_data?.waypoints && 
      state.route_data.waypoints.length > 0 && 
      !state.compliance_data &&
      state.agent_status?.route_agent === 'success';

    if (needsCompliance) {
      console.log('🎯 [SUPERVISOR] Decision: Route complete → compliance_agent for ECA zone validation');
      return {
        ...legacyOriginalIntentUpdate,
        next_agent: 'compliance_agent' as const,
        agent_context: {
          ...agentContext,
          compliance_agent: {
            required_tools: [],
            task_description: 'Validate ECA zone crossings and calculate MGO requirements',
            priority: 'critical' as const
          }
        },
        messages: [],
      };
    }

    // Priority 1: Weather is needed and not done
    // For simple route weather queries, we only need weather_forecast (not consumption)
    // Consumption is only needed for bunker planning
    const needsWeatherForecast = needsWeather && !state.weather_forecast;
    const needsWeatherConsumption = needsBunker && needsWeather && !state.weather_consumption && state.weather_forecast;
    
    if (needsWeatherForecast || needsWeatherConsumption) {
      // Check if weather_agent has failed
      if (state.agent_status?.weather_agent === 'failed') {
        console.warn('⚠️ [SUPERVISOR] Weather agent failed, skipping to next step');
        
        // Skip to bunker if needed, otherwise finalize
        if (needsBunker && !state.bunker_analysis) {
          if (hasBunkerError) {
            console.warn('⚠️ [SUPERVISOR] Blocking re-route to bunker_agent after failure');
            return buildBunkerErrorFinalizeReturn(state, agentContext);
          }
          console.log('🎯 [SUPERVISOR] Decision: Skip failed weather, go to bunker');
          return applyCircuitBreaker("bunker_agent", state, mergeExtraction({
            ...legacyOriginalIntentUpdate,
            next_agent: 'bunker_agent',
            agent_context: agentContext,
            messages: [],
          }));
        } else {
          console.log('🎯 [SUPERVISOR] Decision: Skip failed weather, finalize with partial data');
          return {
            ...legacyOriginalIntentUpdate,
            next_agent: 'finalize',
            agent_context: agentContext,
            messages: [],
          };
        }
      }
      
      // DATA VALIDATION: Check prerequisites before routing
      const validation = validateAgentPrerequisites('weather_agent');
      if (!validation.valid) {
        console.warn(`⚠️ [SUPERVISOR] Cannot route to weather_agent - missing prerequisites: ${validation.missing.join(', ')}`);
        // Skip weather agent, try next priority
      } else {
        console.log('🎯 [SUPERVISOR] Decision: Weather needed and not done → weather_agent (prerequisites validated)');
        return applyCircuitBreaker("weather_agent", state, mergeExtraction({
          ...legacyOriginalIntentUpdate,
          next_agent: "weather_agent",
          agent_context: agentContext,
          messages: [],
        }));
      }
    }
    
    // Priority 2: Weather forecast is complete - check if we need consumption or can finalize
    if (needsWeather && state.weather_forecast) {
      // If only weather was requested (no bunker), we're done - finalize
      if (!needsBunker) {
        console.log('🎯 [SUPERVISOR] Decision: Weather forecast complete, no bunker needed → finalize');
        return {
          ...legacyOriginalIntentUpdate,
          next_agent: "finalize",
          agent_context: agentContext,
          messages: [],
        };
      }
      
      // If bunker is also needed, check if consumption is needed
      if (needsBunker && !state.weather_consumption) {
        // Check if weather_agent has failed
        if (state.agent_status?.weather_agent === 'failed') {
          console.warn('⚠️ [SUPERVISOR] Weather agent failed, skipping consumption calculation and going to bunker');
          if (hasBunkerError) {
            console.warn('⚠️ [SUPERVISOR] Blocking re-route to bunker_agent after failure');
            return buildBunkerErrorFinalizeReturn(state, agentContext);
          }
          // Skip weather consumption, go directly to bunker
          return applySafetyValidation(state, mergeExtraction({
            ...legacyOriginalIntentUpdate,
            next_agent: 'bunker_agent',
            agent_context: agentContext,
            messages: [],
          }));
        }
        
        // Consumption is needed for bunker planning
        console.log('🎯 [SUPERVISOR] Decision: Weather forecast complete, consumption needed for bunker → weather_agent');
        return applyCircuitBreaker("weather_agent", state, mergeExtraction({
          ...legacyOriginalIntentUpdate,
          next_agent: "weather_agent",
          agent_context: agentContext,
          messages: [],
        }));
      }
      
      // Weather and consumption complete, bunker needed
      if (needsBunker && state.weather_consumption && !state.bunker_analysis) {
        // Check if bunker_agent has failed
        if (state.agent_status?.bunker_agent === 'failed') {
          console.warn('⚠️ [SUPERVISOR] Bunker agent failed, finalizing with available data');
          return {
            ...legacyOriginalIntentUpdate,
            next_agent: 'finalize',
            agent_context: agentContext,
            messages: [],
          };
        }
        
        // DATA VALIDATION: Check prerequisites before routing
        const validation = validateAgentPrerequisites('bunker_agent');
        if (!validation.valid) {
          console.warn(`⚠️ [SUPERVISOR] Cannot route to bunker_agent - missing prerequisites: ${validation.missing.join(', ')}`);
          // Skip bunker agent, finalize with available data
        } else {
          if (hasBunkerError) {
            console.warn('⚠️ [SUPERVISOR] Blocking re-route to bunker_agent after failure');
            return { ...legacyOriginalIntentUpdate, ...buildBunkerErrorFinalizeReturn(state, agentContext) };
          }
          console.log('🎯 [SUPERVISOR] Decision: Weather complete, bunker needed → bunker_agent (prerequisites validated)');
          return applyCircuitBreaker("bunker_agent", state, mergeExtraction({
            ...legacyOriginalIntentUpdate,
            next_agent: "bunker_agent",
            agent_context: agentContext,
            messages: [],
          }));
        }
      }
    }
    
    // Priority 3: Bunker is needed (and weather was not needed or is complete)
    if (needsBunker && !state.bunker_analysis) {
      // Only delegate to bunker if weather was not needed, or weather is complete
      const weatherNotNeeded = !needsWeather;
      // For bunker planning, we need both forecast and consumption
      const weatherComplete = !needsWeather || (state.weather_forecast && state.weather_consumption);
      
      if (weatherNotNeeded || weatherComplete) {
        // Check if bunker_agent has failed
        if (state.agent_status?.bunker_agent === 'failed') {
          console.warn('⚠️ [SUPERVISOR] Bunker agent failed, finalizing with available data');
          return {
            ...legacyOriginalIntentUpdate,
            next_agent: 'finalize',
            agent_context: agentContext,
            messages: [],
          };
        }
        
        // DATA VALIDATION: Check prerequisites before routing
        const validation = validateAgentPrerequisites('bunker_agent');
        if (!validation.valid) {
          console.warn(`⚠️ [SUPERVISOR] Cannot route to bunker_agent - missing prerequisites: ${validation.missing.join(', ')}`);
          // Skip bunker agent, finalize with available data
        } else {
          if (hasBunkerError) {
            console.warn('⚠️ [SUPERVISOR] Blocking re-route to bunker_agent after failure');
            return { ...legacyOriginalIntentUpdate, ...buildBunkerErrorFinalizeReturn(state, agentContext) };
          }
          console.log('🎯 [SUPERVISOR] Decision: Bunker needed and not done → bunker_agent (prerequisites validated)');
          return applyCircuitBreaker("bunker_agent", state, mergeExtraction({
            ...legacyOriginalIntentUpdate,
          next_agent: "bunker_agent",
          agent_context: agentContext,
          messages: [],
          }));
        }
      }
    }
    
    // Priority 4: Check if all requested work is complete
    // For simple weather queries, weather_forecast is enough (no consumption needed)
    // For bunker queries, we need both weather_forecast and weather_consumption
    const weatherComplete = !needsWeather || 
      (needsBunker ? (state.weather_forecast && state.weather_consumption) : state.weather_forecast);
    // For bunker queries, check if we have either bunker_analysis OR port_prices
    // (some queries only need prices, not full analysis)
    const bunkerComplete = !needsBunker || state.bunker_analysis || 
      (state.port_prices && state.port_prices.prices_by_port && Object.keys(state.port_prices.prices_by_port).length > 0);
    
    if (weatherComplete && bunkerComplete) {
      // Vessel Selection: If user wants to compare multiple vessels
      const vesselNames = state.vessel_names ?? extractedVesselNames;
      console.log('🎯 [SUPERVISOR] Pre-finalize check: vessel_comparison_analysis=', !!state.vessel_comparison_analysis, ', vessel_names=', vesselNames?.length ?? 0, vesselNames);

      if (
        !state.vessel_comparison_analysis &&
        vesselNames &&
        vesselNames.length > 1
      ) {
        console.log('🎯 [SUPERVISOR] Routing to vessel_selection_agent for multi-vessel comparison');
        const vesselSelectionUpdate = {
          ...legacyOriginalIntentUpdate,
          next_agent: 'vessel_selection_agent' as const,
          vessel_names: vesselNames,
          next_voyage_details: state.next_voyage_details ?? extractedNextVoyage,
          agent_context: agentContext,
          messages: [
            ...state.messages,
            new HumanMessage('Comparing vessels for voyage selection'),
          ],
          degraded_mode: degradedMode,
          missing_data: missingData,
        };
        return applySafetyValidation(state, mergeExtraction(vesselSelectionUpdate));
      }

      if (vesselNames && vesselNames.length <= 1) {
        console.log('🎯 [SUPERVISOR] Skipping vessel_selection: only 1 vessel or none');
      }
      if (state.vessel_comparison_analysis) {
        console.log('🎯 [SUPERVISOR] Skipping vessel_selection: comparison already done');
      }
      console.log('🎯 [SUPERVISOR] Decision: All requested work complete → finalize');
      return mergeExtraction({
        ...legacyOriginalIntentUpdate,
        next_agent: "finalize",
        agent_context: agentContext,
        messages: [],
        degraded_mode: degradedMode,
        missing_data: missingData,
      });
    }
    
    // If we reach here, route exists but something is still needed
    // This shouldn't happen, but if it does, finalize with what we have
    console.log('🎯 [SUPERVISOR] Decision: Route complete, finalizing with available data');
    return mergeExtraction({
      ...legacyOriginalIntentUpdate,
      next_agent: "finalize",
      agent_context: agentContext,
      messages: [],
      degraded_mode: degradedMode,
      missing_data: missingData,
    });
  }
  
  // 4. Ultimate fallback: Get route (but check if route_agent has failed)
  if (state.agent_status?.route_agent === 'failed') {
    console.log('⚠️ [SUPERVISOR] Fallback: Route agent has failed - finalizing with error');
    return {
      ...legacyOriginalIntentUpdate,
      next_agent: "finalize",
      agent_context: agentContext,
      messages: [],
    };
  }

  // 4b. Capability-based fallback for novel/unknown query patterns
  // Uses registry to discover best agent - safety net without removing deterministic routing
  const capabilityIntent = mapQueryIntentToCapabilityIntent(intent, userQuery);
  const suggestedAgent = findBestAgentForIntent(state, capabilityIntent);
  if (suggestedAgent) {
    console.log(
      `🎯 [SUPERVISOR] Capability resolver suggests: ${suggestedAgent} (intent: ${capabilityIntent})`
    );
    return applyCircuitBreaker(suggestedAgent, state, mergeExtraction({
      ...legacyOriginalIntentUpdate,
      next_agent: suggestedAgent,
      agent_context: agentContext,
      messages: [],
    }));
  }

  // 4c. Ultimate fallback: route_agent when capability resolver has no suggestion
  console.log('🎯 [SUPERVISOR] Decision: Fallback → route_agent');
  return applyCircuitBreaker("route_agent", state, mergeExtraction({
    ...legacyOriginalIntentUpdate,
    next_agent: "route_agent",
    agent_context: agentContext,
    messages: [],
  }));
}

/**
 * Route Agent Node
 * 
 * Calculates route and vessel timeline using route calculator and weather timeline tools.
 */
/**
 * Extract route data from tool results
 */
function extractRouteDataFromMessages(messages: any[]): { route_data?: any; vessel_timeline?: any } {
  const result: { route_data?: any; vessel_timeline?: any } = {};

  // Look for ToolMessages with route data
  for (const msg of messages) {
    if (msg instanceof ToolMessage) {
      try {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        const toolResult = JSON.parse(content);
        
        // Check if this is route data
        if (toolResult.distance_nm && toolResult.waypoints && toolResult.origin_port_code) {
          result.route_data = toolResult;
          console.log('📦 [ROUTE-AGENT] Extracted route_data from tool result');
        }
        
        // Check if this is vessel timeline
        if (Array.isArray(toolResult) && toolResult.length > 0 && toolResult[0].lat && toolResult[0].datetime) {
          result.vessel_timeline = toolResult;
          console.log('📦 [ROUTE-AGENT] Extracted vessel_timeline from tool result');
        }
      } catch (e) {
        // Not JSON, skip
      }
    }
  }

  return result;
}

// ============================================================================
// Utility Functions for Deterministic Workflows
// ============================================================================

/**
 * Extract vessel specifications from user query and state
 */
function extractVesselSpecsFromQuery(query: string, state: MultiAgentState): any {
  // Try to extract from query
  const vlsfoMatch = query.match(/(\d+)\s*(?:MT|tons?|tonnes?)\s+(?:of\s+)?VLSFO/i);
  const lsgoMatch = query.match(/(\d+)\s*(?:MT|tons?|tonnes?)\s+(?:of\s+)?(?:LSGO|MGO|LSMGO)/i);
  
    return {
    fuel_capacity_mt: {
      VLSFO: vlsfoMatch ? parseInt(vlsfoMatch[1]) : 650,
      LSGO: lsgoMatch ? parseInt(lsgoMatch[1]) : 80,
    },
    consumption_rate_mt_per_day: {
      VLSFO: 35,
      LSGO: 3,
    },
  };
}

/**
 * Extract fuel requirements from user message
 * Distinguishes between total bunker quantities and daily consumption rates
 */
function extractFuelRequirements(message: string): {
  fuel_types: string[];
  quantities: { [key: string]: number };  // Total bunker quantities (MT)
  consumption_rates: { [key: string]: number };  // Daily consumption rates (MT/day)
  total_quantity: number;
} {
  const fuelTypes: string[] = [];
  const quantities: { [key: string]: number } = {};  // Total quantities
  const consumptionRates: { [key: string]: number } = {};  // Daily rates
  let totalQuantity = 0;
  
  const lower = message.toLowerCase();
  
  // Patterns for TOTAL bunker quantities (bunker, load, take)
  const bunkerQuantityPatterns = [
    { type: 'VLSFO', regex: /(?:bunker|load|take)\s+(\d+(?:\.\d+)?)\s*(?:mt|tons?)?\s*vlsfo/i },
    { type: 'LSGO', regex: /(?:bunker|load|take)\s+(\d+(?:\.\d+)?)\s*(?:mt|tons?)?\s*lsgo/i },
    { type: 'MGO', regex: /(?:bunker|load|take)\s+(\d+(?:\.\d+)?)\s*(?:mt|tons?)?\s*mgo/i },
    // Also match "X MT VLSFO" when NOT followed by "/day"
    { type: 'VLSFO', regex: /(\d+(?:\.\d+)?)\s*mt\s*vlsfo(?!\s*\/?\s*day)/i },
    { type: 'LSGO', regex: /(\d+(?:\.\d+)?)\s*mt\s*lsgo(?!\s*\/?\s*day)/i },
    { type: 'MGO', regex: /(\d+(?:\.\d+)?)\s*mt\s*mgo(?!\s*\/?\s*day)/i },
  ];
  
  // Patterns for DAILY consumption rates
  const consumptionRatePatterns = [
    { type: 'VLSFO', regex: /(?:consuming|consumption)\s+(\d+(?:\.\d+)?)\s*mt\/?\s*day\s*vlsfo/i },
    { type: 'LSGO', regex: /(?:consuming|consumption)\s+(\d+(?:\.\d+)?)\s*mt\/?\s*day\s*lsgo/i },
    { type: 'MGO', regex: /(?:consuming|consumption)\s+(\d+(?:\.\d+)?)\s*mt\/?\s*day\s*mgo/i },
    { type: 'VLSFO', regex: /(\d+(?:\.\d+)?)\s*mt\/day\s*vlsfo/i },
    { type: 'LSGO', regex: /(\d+(?:\.\d+)?)\s*mt\/day\s*lsgo/i },
    { type: 'MGO', regex: /(\d+(?:\.\d+)?)\s*mt\/day\s*mgo/i },
  ];
  
  // Extract total quantities
  for (const pattern of bunkerQuantityPatterns) {
    const match = message.match(pattern.regex);
    if (match) {
      const quantity = parseFloat(match[1]);
      if (!fuelTypes.includes(pattern.type)) {
        fuelTypes.push(pattern.type);
      }
      quantities[pattern.type] = (quantities[pattern.type] || 0) + quantity;
      totalQuantity += quantity;
    }
  }
  
  // Extract consumption rates (separate from quantities)
  for (const pattern of consumptionRatePatterns) {
    const match = message.match(pattern.regex);
    if (match) {
      const rate = parseFloat(match[1]);
      if (!fuelTypes.includes(pattern.type)) {
        fuelTypes.push(pattern.type);
      }
      consumptionRates[pattern.type] = (consumptionRates[pattern.type] || 0) + rate;
      // Don't add to totalQuantity - these are rates, not quantities
    }
  }
  
  // Default to VLSFO if nothing found
  if (fuelTypes.length === 0) {
    fuelTypes.push('VLSFO');
    quantities['VLSFO'] = 0;
  }
  
  return { 
    fuel_types: fuelTypes, 
    quantities,  // Total bunker quantities only
    consumption_rates: consumptionRates,  // Daily consumption rates
    total_quantity: totalQuantity 
  };
}

/**
 * Extract vessel name from user message for ROB lookup.
 * Tries known vessel names from API when available, then "MV X" / "MV X Y" pattern.
 */
async function extractVesselNameFromQuery(query: string): Promise<string | null> {
  const known = await listAllVessels();
  for (const name of known) {
    if (query.includes(name)) return name;
  }
  const mvMatch = query.match(/\b(MV\s+[A-Za-z]+(?:\s+[A-Za-z]+)?)\b/i);
  if (mvMatch) return mvMatch[1];
  return null;
}

/**
 * Route Agent Node - DETERMINISTIC WORKFLOW (No LLM)
 * 
 * Executes route calculation workflow without LLM decision-making.
 * Flow:
 * 1. Check if route_data exists → if not, calculate route
 * 2. Check if vessel_timeline exists → if not, calculate timeline
 * 3. Return success
 */
export async function routeAgentNode(
  state: MultiAgentState
): Promise<Partial<MultiAgentState>> {
  const cid = extractCorrelationId(state);
  logAgentExecution('route_agent', cid, 0, 'started', { input: summarizeInputForLog(state) });

  console.log('\n🗺️ [ROUTE-WORKFLOW] Starting deterministic workflow...');
  
  const startTime = Date.now();
  
  try {
    // ========================================================================
    // SUPERVISOR CONTEXT VALIDATION
    // ========================================================================
    
    const agentContext = state.agent_context?.route_agent;
    if (agentContext) {
      console.log(`📋 [ROUTE-WORKFLOW] Context from supervisor:`);
      console.log(`   Priority: ${agentContext.priority}`);
      console.log(`   Task: ${agentContext.task_description}`);
      console.log(`   Needs weather timeline: ${agentContext.needs_weather_timeline}`);
    }
    
    // ========================================================================
    // STEP 1: Calculate Route (if missing)
    // ========================================================================
    
    if (!state.route_data) {
      console.log('📍 [ROUTE-WORKFLOW] Route data missing - calculating route...');
      
      let origin: string | undefined;
      let destination: string | undefined;
      let originCoords: [number, number] | undefined;
      let destCoords: [number, number] | undefined;
      
      // Get user query (needed for extraction fallback)
      const userMessage = state.messages.find(msg => msg instanceof HumanMessage);
      const userQuery = userMessage?.content?.toString() || '';
      
      // ======================================================================
      // STEP 1: Get port NAMES from any source (may be names like "Singapore")
      // ======================================================================
      const originFromAI = state.routing_metadata?.extracted_params?.origin_port;
      const destFromAI = state.routing_metadata?.extracted_params?.destination_port;
      let originName = (typeof originFromAI === 'string' ? originFromAI : undefined)
        ?? state.agent_context?.route_agent?.port_overrides?.origin
        ?? state.port_overrides?.origin;
      let destName = (typeof destFromAI === 'string' ? destFromAI : undefined)
        ?? state.agent_context?.route_agent?.port_overrides?.destination
        ?? state.port_overrides?.destination;
      
      if (originName) console.log(`📋 [ROUTE-WORKFLOW] Origin candidate: "${originName}"`);
      if (destName) console.log(`📋 [ROUTE-WORKFLOW] Destination candidate: "${destName}"`);
      
      // If we don't have both from metadata/overrides, extract from user query
      if (!originName || !destName) {
        const { ServiceContainer } = await import('@/lib/repositories/service-container');
        const portResolutionService = ServiceContainer.getInstance().getPortResolutionService();
        const fromQuery = await portResolutionService.resolvePortsFromQuery(userQuery);
        if (fromQuery.origin && !originName) originName = fromQuery.origin;
        if (fromQuery.destination && !destName) destName = fromQuery.destination;
        if (fromQuery.origin && fromQuery.destination) {
          origin = fromQuery.origin;
          destination = fromQuery.destination;
          originCoords = fromQuery.origin_coordinates;
          destCoords = fromQuery.destination_coordinates;
          console.log(`✅ [PORT-RESOLUTION] Resolved from query: ${origin} → ${destination}`);
        }
      }
      
      // ======================================================================
      // STEP 2: Resolve names → UN/LOCODE + coordinates (REQUIRED for SeaRoute API)
      // ======================================================================
      // Port names like "Singapore" or "Fujairah" must be converted to codes (SGSIN, AEFJR)
      // before route calculation. Zod validation requires 5-char UN/LOCODE.
      const isValidUnLoCode = (s: string) => /^[A-Z0-9]{5}$/.test(String(s).replace(/\s/g, '').toUpperCase());
      
      if (originName && destName && (!origin || !destination)) {
        const needsResolution = !isValidUnLoCode(originName) || !isValidUnLoCode(destName);
        if (needsResolution) {
          console.log('🔄 [ROUTE-WORKFLOW] Resolving port names via PortResolutionService...');
          const { ServiceContainer } = await import('@/lib/repositories/service-container');
          const portResolutionService = ServiceContainer.getInstance().getPortResolutionService();
          const resolved = await portResolutionService.resolvePortsByName(originName, destName);
          if (resolved.origin) {
            origin = resolved.origin;
            originCoords = resolved.origin_coordinates;
            console.log(`   Origin: "${originName}" → ${origin} ${originCoords ? `[${originCoords[0]}, ${originCoords[1]}]` : ''}`);
          }
          if (resolved.destination) {
            destination = resolved.destination;
            destCoords = resolved.destination_coordinates;
            console.log(`   Destination: "${destName}" → ${destination} ${destCoords ? `[${destCoords[0]}, ${destCoords[1]}]` : ''}`);
          }
        } else {
          origin = String(originName).replace(/\s/g, '').toUpperCase().slice(0, 5);
          destination = String(destName).replace(/\s/g, '').toUpperCase().slice(0, 5);
          // Resolve coordinates for valid codes
          const { ServiceContainer } = await import('@/lib/repositories/service-container');
          const portResolutionService = ServiceContainer.getInstance().getPortResolutionService();
          const oCoord = await portResolutionService.getCoordinatesForPort(origin);
          const dCoord = await portResolutionService.getCoordinatesForPort(destination);
          if (oCoord) originCoords = [oCoord.lat, oCoord.lon];
          if (dCoord) destCoords = [dCoord.lat, dCoord.lon];
        }
      }
      
      // Use coordinates from port_overrides only if we don't have them from resolution
      if (!originCoords && state.port_overrides?.origin_coordinates) {
        originCoords = state.port_overrides.origin_coordinates as [number, number];
      }
      if (!destCoords && state.port_overrides?.destination_coordinates) {
        destCoords = state.port_overrides.destination_coordinates as [number, number];
      }
      if (!originCoords && state.agent_context?.route_agent?.port_overrides?.origin_coordinates) {
        originCoords = state.agent_context.route_agent.port_overrides.origin_coordinates as [number, number];
      }
      if (!destCoords && state.agent_context?.route_agent?.port_overrides?.destination_coordinates) {
        destCoords = state.agent_context.route_agent.port_overrides.destination_coordinates as [number, number];
      }
      
      // Validate we have enough data: EITHER code OR coordinates for each port
      // Coordinates are sufficient for SeaRoute API - codes are nice-to-have for validation/caching
      const hasOriginData = (origin && String(origin).trim()) || originCoords;
      const hasDestData = (destination && String(destination).trim()) || destCoords;

      if (!hasOriginData) {
        const errorMsg = `Could not resolve origin port "${originName || 'unknown'}" - no valid code or coordinates found in database. Try using a major port like Singapore, Rotterdam, or Fujairah.`;
        console.error(`❌ [PORT-EXTRACTION] ${errorMsg}`);
        throw new Error(errorMsg);
      }
      if (!hasDestData) {
        const errorMsg = `Could not resolve destination port "${destName || 'unknown'}" - no valid code or coordinates found in database. Try using a major port like Singapore, Rotterdam, or Fujairah.`;
        console.error(`❌ [PORT-EXTRACTION] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // When we have coordinates but no code (e.g. Fujairah with empty unLocode), use placeholders for route input
      const resolvedOrigin = (origin && String(origin).trim()) || (originCoords ? 'WPI_0' : '');
      const resolvedDest = (destination && String(destination).trim()) || (destCoords ? 'WPI_1' : '');
      origin = resolvedOrigin || origin;
      destination = resolvedDest || destination;

      if (typeof origin !== 'string' || typeof destination !== 'string') {
        throw new Error('Port resolution failed: origin and destination must be set');
      }

      // Log what we're using for routing
      if (originCoords && destCoords) {
        console.log(`✅ [ROUTE-WORKFLOW] Using coordinate-based routing`);
        console.log(`   Origin: ${originName} → [${originCoords[0]}, ${originCoords[1]}]`);
        console.log(`   Destination: ${destName} → [${destCoords[0]}, ${destCoords[1]}]`);
      } else if (origin && destination) {
        console.log(`✅ [ROUTE-WORKFLOW] Using code-based routing`);
        console.log(`   Origin: ${origin}, Destination: ${destination}`);
      }
      
      console.log(`📍 [ROUTE-WORKFLOW] Calculating route: ${origin} → ${destination}`);
      
      // Validate route before calculation
      try {
        const { validateRoute } = await import('@/lib/utils/route-validator');
        const { PortLogger } = await import('@/lib/utils/debug-logger');
        const validation = await validateRoute(origin, destination, userQuery, userQuery);
        
        PortLogger.logValidation(validation);
        
        if (!validation.valid || validation.warnings.length > 0) {
          console.warn(`⚠️ [ROUTE-WORKFLOW] Route validation warnings:`, validation.warnings);
          if (validation.suggestions) {
            console.warn(`💡 [ROUTE-WORKFLOW] Suggestions:`, validation.suggestions);
          }
        } else {
          console.log(`✅ [ROUTE-WORKFLOW] Route validated successfully`);
        }
      } catch (validationError) {
        const { PortLogger } = await import('@/lib/utils/debug-logger');
        PortLogger.logError('route-validation', validationError);
        console.warn(`⚠️ [ROUTE-WORKFLOW] Route validation failed:`, validationError);
        // Continue with route calculation even if validation fails
      }
      
      // Try primary API, with fallback to cached routes
      const routeInput = { 
        origin_port_code: origin, 
        destination_port_code: destination, 
        vessel_speed_knots: 14,
        origin_coordinates: originCoords,
        destination_coordinates: destCoords,
      };
      
      // Log coordinate availability (SeaRoute API prefers coordinates for reliable routing)
      if (routeInput.origin_coordinates && routeInput.destination_coordinates) {
        console.log(`✅ [ROUTE-SERVICE] Calling SeaRoute API with coordinates: origin=[${routeInput.origin_coordinates[0]}, ${routeInput.origin_coordinates[1]}], dest=[${routeInput.destination_coordinates[0]}, ${routeInput.destination_coordinates[1]}]`);
      }
      
      const t0Route = Date.now();
      logToolCall('calculate_route', extractCorrelationId(state), sanitizeToolInput(routeInput), undefined, 0, 'started');
      try {
        const routeResult = await executeRouteCalculatorTool(routeInput);
        logToolCall('calculate_route', extractCorrelationId(state), sanitizeToolInput(routeInput), sanitizeToolOutput(routeResult), Date.now() - t0Route, 'success');
        console.log(`✅ [ROUTE-WORKFLOW] Route calculated: ${routeResult.distance_nm} nm`);
        
        // Validate route after calculation with actual distance
        try {
          const { validateRoute } = await import('@/lib/utils/route-validator');
          const { PortLogger } = await import('@/lib/utils/debug-logger');
          const postValidation = await validateRoute(
            origin,
            destination,
            userQuery,
            userQuery,
            routeResult.distance_nm
          );
          
          PortLogger.logValidation(postValidation);
          
          if (postValidation.warnings.length > 0) {
            console.warn(`⚠️ [ROUTE-WORKFLOW] Post-calculation validation warnings:`, postValidation.warnings);
          }
        } catch (validationError) {
          const { PortLogger } = await import('@/lib/utils/debug-logger');
          PortLogger.logError('post-route-validation', validationError);
          // Ignore validation errors after calculation
        }
        
        // Update state with route data
        state = {
          ...state,
          route_data: routeResult,
        };
        
        // Stream route data to frontend
        console.log('📤 [STREAM] Sending route data');
        
      } catch (error: any) {
        logToolCall('calculate_route', extractCorrelationId(state), sanitizeToolInput(routeInput), { error: error.message }, Date.now() - t0Route, 'failed');
        console.warn(`⚠️ [ROUTE-WORKFLOW] Primary route API failed: ${error.message}`);
        console.log('🔄 [ROUTE-WORKFLOW] Attempting fallback to cached routes...');
        
        // Try cached route
        const cachedRoute = getCachedRoute(origin, destination);
        
      if (cachedRoute) {
          console.log(`✅ [ROUTE-WORKFLOW] Using cached route: ${cachedRoute.distance_nm} nm`);
          state = {
            ...state,
            route_data: {
              ...cachedRoute,
              _from_cache: true,
            },
          };
        } else {
          // No fallback available - fail gracefully
          throw new Error(`Route calculation failed and no cached route available for ${origin} → ${destination}`);
        }
      }
  } else {
      console.log('✅ [ROUTE-WORKFLOW] Route data already exists - skipping calculation');
    }
    
    // ========================================================================
    // STEP 2: Calculate Vessel Timeline (if missing)
    // ========================================================================
    
    const needsWeatherTimeline = agentContext?.needs_weather_timeline ?? false;
    
    if (needsWeatherTimeline && !state.vessel_timeline) {
      console.log('⏱️ [ROUTE-WORKFLOW] Vessel timeline missing - calculating timeline...');
      
      if (!state.route_data) {
        throw new Error('Cannot calculate timeline without route data');
      }
      
      // Extract departure date from query (default to now)
      const userMessage = state.messages.find(msg => msg instanceof HumanMessage);
      const userQuery = userMessage?.content?.toString() || '';
      const dateMatch = userQuery.match(/(?:december|dec)\s+(\d+)/i);
      const departureTime = dateMatch 
        ? `2024-12-${dateMatch[1].padStart(2, '0')}T08:00:00Z`
        : new Date().toISOString();
      
      const timelineInput = { waypoints: state.route_data.waypoints, vessel_speed_knots: 14, departure_datetime: departureTime, sampling_interval_hours: 12 };
      const t0Timeline = Date.now();
      logToolCall('calculate_weather_timeline', extractCorrelationId(state), sanitizeToolInput(timelineInput), undefined, 0, 'started');
      const timelineResult = await executeWeatherTimelineTool(timelineInput);
      logToolCall('calculate_weather_timeline', extractCorrelationId(state), sanitizeToolInput(timelineInput), sanitizeToolOutput(timelineResult), Date.now() - t0Timeline, 'success');
      console.log(`✅ [ROUTE-WORKFLOW] Timeline calculated: ${timelineResult.length} positions`);
      
      // Update state with timeline
      state = {
        ...state,
        vessel_timeline: timelineResult,
      };
    } else if (state.vessel_timeline) {
      console.log('✅ [ROUTE-WORKFLOW] Vessel timeline already exists - skipping calculation');
    }
    
    // ========================================================================
    // SUCCESS - Mark agent as complete
    // ========================================================================
    
    const duration = Date.now() - startTime;
    console.log(`✅ [ROUTE-WORKFLOW] Complete in ${duration}ms`);
    
    // Record metrics
    recordAgentExecution('route_agent', duration, true);
    logAgentExecution('route_agent', extractCorrelationId(state), duration, 'success', {});

    // Log if we used overrides for debugging
    if (state.port_overrides) {
      console.log('🎯 [ROUTE-WORKFLOW] Successfully used supervisor port overrides');
    }
    
    return {
      route_data: state.route_data,
      vessel_timeline: state.vessel_timeline,
      agent_status: { 
        ...(state.agent_status || {}), 
        route_agent: 'success' 
      },
      // Clear port_overrides after successful use to prevent pollution in future calls
      port_overrides: undefined,
      messages: [
        new AIMessage({
          content: '',
          additional_kwargs: {
            route_update: state.route_data,
            timeline_update: state.vessel_timeline,
          }
        })
      ],
    };
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logError(extractCorrelationId(state), error, { agent: 'route_agent' });
    console.error(`❌ [ROUTE-WORKFLOW] Error after ${duration}ms:`, error.message);
    
    // Log state context for debugging
    if (state.port_overrides) {
      console.error(`🔍 [ROUTE-WORKFLOW] Port overrides were present:`, state.port_overrides);
    }
    console.error(`🔍 [ROUTE-WORKFLOW] Recovery attempts: ${state.recovery_attempts || 0}`);
    
    // Record error metrics
    recordAgentExecution('route_agent', duration, false);
    logAgentExecution('route_agent', extractCorrelationId(state), duration, 'failed', {});

    return {
      agent_status: { 
        ...(state.agent_status || {}), 
        route_agent: 'failed' 
      },
      agent_errors: {
        ...(state.agent_errors || {}),
        route_agent: {
          error: `Route calculation failed: ${error.message}`,
          timestamp: Date.now(),
        },
      },
    };
  }
}

/**
 * Extract weather data from tool results
 */
function extractWeatherDataFromMessages(messages: any[]): { 
  weather_forecast?: any; 
  weather_consumption?: any; 
  port_weather_status?: any 
} {
  const result: { 
    weather_forecast?: any; 
    weather_consumption?: any; 
    port_weather_status?: any 
  } = {};

  // First, find all AIMessages with weather tool calls to get their tool_call_ids
  const weatherToolCallIds = new Set<string>();
  for (const msg of messages) {
    if (msg instanceof AIMessage && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.name === 'fetch_marine_weather' || tc.name === 'calculate_weather_consumption' || tc.name === 'check_bunker_port_weather') {
          if (tc.id) {
            weatherToolCallIds.add(tc.id);
            console.log(`🔍 [WEATHER-AGENT] Found weather tool call: ${tc.name} with id: ${tc.id}`);
          }
        }
      }
    }
  }
  
  // Look for ToolMessages with weather data
  // Check messages in reverse order (most recent first) to find weather tool results quickly
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg instanceof ToolMessage) {
      try {
        // Check tool name to identify which tool this result is from
        // ToolMessage has a tool_call_id that matches the AIMessage's tool_use id
        const toolCallId = (msg as any).tool_call_id || (msg as any).name || 'unknown';
        const isWeatherTool = weatherToolCallIds.has(toolCallId);
        console.log(`🔍 [WEATHER-AGENT] Found ToolMessage at index ${i}, tool_call_id: ${toolCallId}, is_weather_tool: ${isWeatherTool}, content type: ${typeof msg.content}`);
        
        // Handle both string and object content (LangGraph may serialize automatically)
        let toolResult: any;
        if (typeof msg.content === 'string') {
          try {
            toolResult = JSON.parse(msg.content);
          } catch (e) {
            // If parsing fails, might be a plain string - check if it's an error message
            if (msg.content.includes('error') || msg.content.includes('Error')) {
              console.warn(`⚠️ [WEATHER-AGENT] Tool returned error: ${msg.content}`);
              continue;
            }
            console.warn(`⚠️ [WEATHER-AGENT] Failed to parse ToolMessage content as JSON: ${e}`);
            continue;
          }
        } else {
          toolResult = msg.content;
        }
        
        // Log structure for debugging (only for arrays or objects, skip if already found)
        if (!result.weather_forecast && Array.isArray(toolResult) && toolResult.length > 0) {
          console.log(`🔍 [WEATHER-AGENT] Tool result is array with ${toolResult.length} elements`);
          if (toolResult.length > 0) {
            const first = toolResult[0];
            console.log(`🔍 [WEATHER-AGENT] First element keys: ${Object.keys(first || {}).join(', ')}`);
            console.log(`🔍 [WEATHER-AGENT] First element has forecast_confidence: ${'forecast_confidence' in (first || {})}`);
          }
        } else if (!result.weather_consumption && toolResult && typeof toolResult === 'object' && !Array.isArray(toolResult)) {
          console.log(`🔍 [WEATHER-AGENT] Tool result is object with keys: ${Object.keys(toolResult).join(', ')}`);
        }
        
        // Check if this is weather forecast (array with forecast_confidence)
        // This is the PRIMARY check - weather forecast is an array of objects with forecast_confidence
        if (Array.isArray(toolResult) && toolResult.length > 0) {
          const first = toolResult[0];
          if (first && typeof first === 'object' && 'forecast_confidence' in first) {
            result.weather_forecast = toolResult;
            console.log(`✅ [WEATHER-AGENT] Extracted weather_forecast from tool result (${toolResult.length} points)`);
            // Don't continue - keep checking for other weather data
          }
        }
        
        // Check if this is weather consumption (object with consumption_increase_percent)
        if (toolResult && typeof toolResult === 'object' && !Array.isArray(toolResult) && 'consumption_increase_percent' in toolResult) {
          result.weather_consumption = toolResult;
          console.log('✅ [WEATHER-AGENT] Extracted weather_consumption from tool result');
        }
        
        // Check if this is port weather status (array with bunkering_feasible)
        if (Array.isArray(toolResult) && toolResult.length > 0 && 'bunkering_feasible' in toolResult[0]) {
          result.port_weather_status = toolResult;
          console.log('✅ [WEATHER-AGENT] Extracted port_weather_status from tool result');
        }
      } catch (e) {
        console.warn(`⚠️ [WEATHER-AGENT] Error processing ToolMessage at index ${i}: ${e}`);
      }
    }
  }

  return result;
}

/**
 * Weather Agent Node
 * 
 * Analyzes weather impact using marine weather, consumption, and port weather tools.
 * Now self-aware: tracks attempts and returns early if stuck.
 */
/**
 * Weather Agent Node - DETERMINISTIC WORKFLOW (No LLM)
 * 
 * Executes weather analysis workflow without LLM decision-making.
 * Flow:
 * 1. Check prerequisites (vessel_timeline required)
 * 2. Check if weather_forecast exists → if not, fetch weather
 * 3. Check if weather_consumption exists → if not, calculate consumption
 * 4. Return success
 */
export async function weatherAgentNode(
  state: MultiAgentState
): Promise<Partial<MultiAgentState>> {
  const cid = extractCorrelationId(state);
  logAgentExecution('weather_agent', cid, 0, 'started', { input: summarizeInputForLog(state) });

  console.log('\n🌊 [WEATHER-WORKFLOW] Starting deterministic workflow...');
  
  const startTime = Date.now();
  
  try {
    // ========================================================================
    // PARAMETER EXTRACTION PRIORITY
    // ========================================================================
    // 1. routing_metadata.extracted_params (from AI - HIGHEST PRIORITY)
    // 2. agent_context (from supervisor)
    // 3. Legacy extraction from query (FALLBACK ONLY)
    // ========================================================================
    const portFromAI =
      typeof state.routing_metadata?.extracted_params?.port === 'string'
        ? state.routing_metadata.extracted_params.port
        : undefined;
    const dateFromAI =
      typeof state.routing_metadata?.extracted_params?.date === 'string'
        ? state.routing_metadata.extracted_params.date
        : undefined;
    const portFromContext = state.agent_context?.weather_agent?.port;
    const dateFromContext = state.agent_context?.weather_agent?.date;

    console.log(`📋 [WEATHER-WORKFLOW] Parameter sources:`, {
      port: portFromAI ? 'AI' : portFromContext ? 'context' : 'legacy',
      date: dateFromAI ? 'AI' : dateFromContext ? 'context' : 'legacy',
    });

    // PRIORITY 2: Fallback to intent analyzer for backward compatibility
    const userMessage = state.messages.find(msg => msg instanceof HumanMessage);
    const userQuery = (userMessage?.content?.toString() || '').trim();
    const { classifyWeatherQuery } = await import('./intent-analyzer');
    const weatherClass = classifyWeatherQuery(userQuery);

    // Merge params: AI > context > legacy
    const finalPort = portFromAI || portFromContext || weatherClass.port;
    const finalDate = dateFromAI || dateFromContext || weatherClass.date;

    if (!portFromAI && !portFromContext && weatherClass.port) {
      console.warn('⚠️ [WEATHER-WORKFLOW] Falling back to legacy extraction for port');
    }
    if (!dateFromAI && !dateFromContext && weatherClass.date) {
      console.warn('⚠️ [WEATHER-WORKFLOW] Falling back to legacy extraction for date');
    }

    console.log(`🌤️ [WEATHER-WORKFLOW] Final params:`, {
      port: finalPort,
      date: finalDate,
    });

    // ========================================================================
    // MODE: STANDALONE PORT WEATHER (no route needed)
    // ========================================================================
    // Trust routing_metadata when it says port_weather; otherwise use regex
    const isStandalone =
      finalPort &&
      (state.routing_metadata?.matched_intent === 'port_weather' ||
        (weatherClass.type === 'port_weather' && !weatherClass.needsRoute));

    if (isStandalone) {
      console.log('🌤️ [WEATHER-WORKFLOW] Mode: Standalone port weather');
      console.log(`   Port: ${finalPort}`);
      console.log(`   Date: ${finalDate || 'not specified'}`);

      return await handleStandalonePortWeather(state, finalPort, finalDate, startTime);
    }
    
    // ========================================================================
    // MODE: ROUTE-BASED WEATHER (requires vessel_timeline)
    // ========================================================================
    
    console.log('🌊 [WEATHER-WORKFLOW] Mode: Route-based weather');
    
    // ========================================================================
    // SUPERVISOR CONTEXT VALIDATION
    // ========================================================================
    
    const agentContext = state.agent_context?.weather_agent;
    if (agentContext) {
      console.log(`📋 [WEATHER-WORKFLOW] Context from supervisor:`);
      console.log(`   Priority: ${agentContext.priority}`);
      console.log(`   Task: ${agentContext.task_description}`);
      console.log(`   Needs consumption: ${agentContext.needs_consumption}`);
      console.log(`   Needs port weather: ${agentContext.needs_port_weather}`);
    }
    
    // ========================================================================
    // PREREQUISITE CHECK: Vessel Timeline Required (for route weather only)
    // ========================================================================
    
    if (!state.vessel_timeline || state.vessel_timeline.length === 0) {
      console.error('❌ [WEATHER-WORKFLOW] Missing prerequisite: vessel_timeline');
      return {
        agent_status: { 
          ...(state.agent_status || {}), 
          weather_agent: 'failed' 
        },
        agent_errors: {
          ...(state.agent_errors || {}),
          weather_agent: {
            error: 'Cannot fetch weather without vessel timeline. Route agent must run first.',
            timestamp: Date.now(),
          },
        },
      };
    }
  
    console.log(`✅ [WEATHER-WORKFLOW] Prerequisite met: vessel_timeline (${state.vessel_timeline.length} positions)`);
    
    // ========================================================================
    // STEP 1: Fetch Marine Weather (if missing)
    // ========================================================================
    
    if (!state.weather_forecast) {
      console.log('🌡️ [WEATHER-WORKFLOW] Weather forecast missing - fetching marine weather...');
      const weatherInput = { positions: state.vessel_timeline.map((pos: any) => ({ lat: pos.lat, lon: pos.lon, datetime: pos.datetime })) };
      const t0Weather = Date.now();
      logToolCall('fetch_marine_weather', extractCorrelationId(state), sanitizeToolInput(weatherInput), undefined, 0, 'started');
      const weatherResult = await executeMarineWeatherTool(weatherInput);
      logToolCall('fetch_marine_weather', extractCorrelationId(state), sanitizeToolInput(weatherInput), sanitizeToolOutput(weatherResult), Date.now() - t0Weather, 'success');
      console.log(`✅ [WEATHER-WORKFLOW] Weather fetched: ${weatherResult.length} forecast points`);
      
      // Update state with weather forecast
      state = {
        ...state,
        weather_forecast: weatherResult,
      };
      
      // Stream weather data to frontend
      console.log('📤 [STREAM] Sending weather forecast');
      
    } else {
      console.log('✅ [WEATHER-WORKFLOW] Weather forecast already exists - skipping fetch');
    }
    
    // ========================================================================
    // STEP 2: Calculate Weather Consumption (if missing)
    // ========================================================================
    
    const needsConsumption = agentContext?.needs_consumption ?? false;
    
    if (needsConsumption && !state.weather_consumption) {
      console.log('⚡ [WEATHER-WORKFLOW] Weather consumption missing - calculating...');
      
      if (!state.weather_forecast) {
        throw new Error('Cannot calculate consumption without weather forecast');
      }
      
      // Extract vessel specs from user query
      const userMessage = state.messages.find(msg => msg instanceof HumanMessage);
      const userQuery = userMessage?.content?.toString() || '';
      const vesselSpecs = extractVesselSpecsFromQuery(userQuery, state);
      
      // Calculate base consumption from vessel specs
      const baseConsumptionMt = (vesselSpecs.fuel_capacity_mt.VLSFO || 650) * 0.5; // Rough estimate
      
      const consumptionInput = {
        weather_data: state.weather_forecast.map((w: any) => ({ datetime: w.datetime || w.position?.datetime, weather: w.weather || w.position?.weather })),
        base_consumption_mt: baseConsumptionMt,
        vessel_heading_deg: 90,
        fuel_type_breakdown: vesselSpecs.fuel_capacity_mt,
      };
      const t0Consumption = Date.now();
      logToolCall('calculate_weather_consumption', extractCorrelationId(state), sanitizeToolInput(consumptionInput), undefined, 0, 'started');
      const consumptionResult = await executeWeatherConsumptionTool(consumptionInput);
      logToolCall('calculate_weather_consumption', extractCorrelationId(state), sanitizeToolInput(consumptionInput), sanitizeToolOutput(consumptionResult), Date.now() - t0Consumption, 'success');
      console.log(`✅ [WEATHER-WORKFLOW] Consumption calculated: ${consumptionResult.consumption_increase_percent}% increase`);
      
      // Update state with consumption data
      state = {
        ...state,
        weather_consumption: consumptionResult,
      };
      
      // Stream consumption data to frontend
      console.log('📤 [STREAM] Sending weather consumption');
      
    } else if (state.weather_consumption) {
      console.log('✅ [WEATHER-WORKFLOW] Weather consumption already exists - skipping calculation');
    }
    
    // ========================================================================
    // SUCCESS - Mark agent as complete
    // ========================================================================
    
    const duration = Date.now() - startTime;
    console.log(`✅ [WEATHER-WORKFLOW] Complete in ${duration}ms`);
    
    // Record metrics
    recordAgentExecution('weather_agent', duration, true);
    logAgentExecution('weather_agent', extractCorrelationId(state), duration, 'success', {});

    return {
      weather_forecast: state.weather_forecast,
      weather_consumption: state.weather_consumption,
      agent_status: { 
        ...(state.agent_status || {}), 
        weather_agent: 'success' 
      },
      messages: [
        new AIMessage({
          content: '',
          additional_kwargs: {
            weather_update: state.weather_forecast,
            consumption_update: state.weather_consumption,
          }
        })
      ],
    };
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logError(extractCorrelationId(state), error, { agent: 'weather_agent' });
    console.error(`❌ [WEATHER-WORKFLOW] Error after ${duration}ms:`, error.message);
    
    // Record error metrics
    recordAgentExecution('weather_agent', duration, false);
    logAgentExecution('weather_agent', extractCorrelationId(state), duration, 'failed', {});

        return {
      agent_status: { 
        ...(state.agent_status || {}), 
        weather_agent: 'failed' 
      },
          agent_errors: {
            ...(state.agent_errors || {}),
            weather_agent: {
          error: error.message,
              timestamp: Date.now(),
            },
          },
    };
  }
}

/**
 * Handle standalone port weather queries (no route required)
 * Fetches weather data for a single port location
 */
async function handleStandalonePortWeather(
  state: MultiAgentState,
  portName: string,
  targetDateStr: string | undefined,
  startTime: number
): Promise<Partial<MultiAgentState>> {
  try {
    console.log(`🌤️ [WEATHER-WORKFLOW] Fetching port weather for: ${portName}`);
    
    // Step 1: Resolve port to coordinates
    const { extractPortsFromQuery } = await import('@/lib/utils/port-lookup');
    const portsData = await import('@/lib/data/ports.json');
    
    // Try to find the port
    // Define a simple port type for this function
    let portInfo: { port_code: string; name: string; coordinates: { lat: number; lon: number } } | null = null;
    
    // Try to find in static data first
    const staticPort = portsData.default.find((p: any) => 
      p.name.toLowerCase().includes(portName.toLowerCase()) ||
      p.port_code.toLowerCase() === portName.toLowerCase()
    );
    
    if (staticPort && staticPort.coordinates) {
      portInfo = {
        port_code: staticPort.port_code,
        name: staticPort.name,
        coordinates: staticPort.coordinates,
      };
    }
    
    // If not found in static data, try port resolver
    if (!portInfo) {
      const { resolvePortCode } = await import('@/lib/utils/port-resolver');
      const resolved = await resolvePortCode(portName);
      if (resolved) {
        portInfo = {
          port_code: resolved.port_code,
          name: portName,
          coordinates: resolved.coordinates,
        };
      }
    }
    
    if (!portInfo) {
      console.error(`❌ [WEATHER-WORKFLOW] Could not find port: ${portName}`);
      return {
        agent_status: { 
          ...(state.agent_status || {}), 
          weather_agent: 'failed' 
        },
        agent_errors: {
          ...(state.agent_errors || {}),
          weather_agent: {
            error: `Could not find port: ${portName}. Please specify a valid port name or code.`,
            timestamp: Date.now(),
          },
        },
      };
    }
    
    console.log(`✅ [WEATHER-WORKFLOW] Port found: ${portInfo.port_code} (${portInfo.name})`);
    console.log(`   Coordinates: ${portInfo.coordinates.lat}°N, ${portInfo.coordinates.lon}°E`);
    
    // Step 2: Parse target date
    let targetDate = new Date();
    if (targetDateStr) {
      // Remove ordinal suffixes (st, nd, rd, th)
      const cleaned = targetDateStr.replace(/(\d+)(st|nd|rd|th)/gi, '$1');
      const parsed = new Date(cleaned);
      if (!isNaN(parsed.getTime())) {
        targetDate = parsed;
      } else {
        console.warn(`⚠️ [WEATHER-WORKFLOW] Could not parse date: "${targetDateStr}", using today`);
      }
    }
    
    console.log(`📅 [WEATHER-WORKFLOW] Target date: ${targetDate.toISOString().split('T')[0]}`);
    
    // Step 3: Fetch marine weather for port location
    // Create a single position for weather lookup
    const position = {
      lat: portInfo.coordinates.lat,
      lon: portInfo.coordinates.lon,
      datetime: targetDate.toISOString(),
    };
    
    const portWeatherInput = { positions: [position] };
    const t0Port = Date.now();
    logToolCall('fetch_marine_weather', extractCorrelationId(state), sanitizeToolInput(portWeatherInput), undefined, 0, 'started');
    const weatherResult = await executeMarineWeatherTool(portWeatherInput);
    logToolCall('fetch_marine_weather', extractCorrelationId(state), sanitizeToolInput(portWeatherInput), sanitizeToolOutput(weatherResult), Date.now() - t0Port, 'success');
    if (!weatherResult || weatherResult.length === 0) {
      throw new Error('Failed to fetch weather data for port');
    }
    
    console.log(`✅ [WEATHER-WORKFLOW] Weather data retrieved for ${portInfo.name}`);
    
    // Step 4: Format port weather response
    const weatherPoint = weatherResult[0];
    const standalonePortWeather = {
      port_code: portInfo.port_code,
      port_name: portInfo.name,
      coordinates: portInfo.coordinates,
      target_date: targetDate.toISOString(),
      forecast: {
        wave_height: weatherPoint.weather?.wave_height_m,
        wind_speed_10m: weatherPoint.weather?.wind_speed_knots,
        wind_direction: weatherPoint.weather?.wind_direction_deg,
        sea_state: weatherPoint.weather?.sea_state,
        conditions: weatherPoint.weather?.sea_state || 'Unknown',
      },
    };
    
    const duration = Date.now() - startTime;
    console.log(`✅ [WEATHER-WORKFLOW] Standalone port weather complete in ${duration}ms`);
    
    // Record metrics
    recordAgentExecution('weather_agent', duration, true);
    logAgentExecution('weather_agent', extractCorrelationId(state), duration, 'success', {});

    return {
      standalone_port_weather: standalonePortWeather,
      agent_status: { 
        ...(state.agent_status || {}), 
        weather_agent: 'success' 
      },
      messages: [
        new AIMessage({
          content: '',
          additional_kwargs: {
            standalone_port_weather: standalonePortWeather,
          }
        })
      ],
    };
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logError(extractCorrelationId(state), error, { agent: 'weather_agent' });
    console.error(`❌ [WEATHER-WORKFLOW] Port weather error after ${duration}ms:`, error.message);
    
    recordAgentExecution('weather_agent', duration, false);
    logAgentExecution('weather_agent', extractCorrelationId(state), duration, 'failed', {});

    return {
      agent_status: { 
        ...(state.agent_status || {}), 
        weather_agent: 'failed' 
      },
      agent_errors: {
        ...(state.agent_errors || {}),
        weather_agent: {
          error: error.message,
          timestamp: Date.now(),
        },
      },
    };
  }
}

/**
 * Convert BunkerPricing[] from bunkerDataService to PriceFetcherOutput for the analyzer.
 */
function bunkerPricingToPriceFetcherOutput(pricings: BunkerPricing[]): PriceFetcherOutput {
  const prices_by_port: Record<string, PriceData[]> = {};
  const now = Date.now();
  for (const p of pricings) {
    const pricePerMT =
      typeof p.pricePerMT === 'number' && Number.isFinite(p.pricePerMT)
        ? p.pricePerMT
        : Number((p as { price_usd_per_mt?: number | string }).price_usd_per_mt) || 0;
    const lastUpdated = p.lastUpdated ? new Date(p.lastUpdated).getTime() : now;
    const hoursSinceUpdate = (now - lastUpdated) / (1000 * 60 * 60);
    const is_fresh = hoursSinceUpdate < 24;
    const entry: PriceData = {
      price: {
        fuel_type: p.fuelType,
        price_per_mt: pricePerMT,
        currency: p.currency ?? 'USD',
      },
      is_fresh,
      hours_since_update: Math.round(hoursSinceUpdate * 10) / 10,
      formatted_price: `${p.currency ?? 'USD'} ${pricePerMT.toFixed(2)}/MT`,
    };
    const primaryKey = p.portCode && p.portCode.trim() !== '' ? p.portCode.trim() : (p.port || 'unknown');
    if (!prices_by_port[primaryKey]) prices_by_port[primaryKey] = [];
    prices_by_port[primaryKey].push(entry);
    if (p.portCode && p.portCode.trim() !== '' && p.port && p.port.trim() !== '' && p.port.trim() !== primaryKey) {
      if (!prices_by_port[p.port.trim()]) prices_by_port[p.port.trim()] = [];
      prices_by_port[p.port.trim()].push(entry);
    }
  }
  const total_prices = pricings.length;
  const ports_with_prices = Object.keys(prices_by_port).length;
  return {
    prices_by_port,
    total_prices,
    ports_with_prices,
    ports_not_found: [],
    stale_price_warnings: [],
  };
}

/**
 * Extract bunker data from tool results
 */
function extractBunkerDataFromMessages(messages: any[]): { 
  bunker_ports?: any; 
  port_prices?: any; 
  bunker_analysis?: any 
} {
  const result: any = {};
  
  // Find all ToolMessages related to bunker tools
  const bunkerToolNames = ['find_bunker_ports', 'get_fuel_prices', 'analyze_bunker_options'];
  
  console.log(`🔍 [BUNKER-AGENT] Extracting bunker data from ${messages.length} messages`);
  
  // Search backwards through messages to find most recent tool results
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    
    if (msg instanceof ToolMessage) {
      try {
        const toolName = msg.name;
        if (!toolName || !bunkerToolNames.includes(toolName)) {
          continue;
        }
        
        // Parse tool result (may be JSON string or object)
        let toolResult: any;
        try {
          const content = typeof msg.content === 'string' ? msg.content : String(msg.content);
          toolResult = JSON.parse(content);
        } catch {
          // If not JSON, use as-is
          toolResult = msg.content;
        }
        
        console.log(`🔍 [BUNKER-AGENT] Found tool result for ${toolName}`);
        
        // Extract find_bunker_ports result
        if (toolName === 'find_bunker_ports' && toolResult && !result.bunker_ports) {
          if (toolResult.ports && Array.isArray(toolResult.ports)) {
            result.bunker_ports = toolResult.ports;
            console.log(`✅ [BUNKER-AGENT] Extracted bunker_ports: ${toolResult.ports.length} ports`);
          }
        }
        
        // Extract get_fuel_prices result
        if (toolName === 'get_fuel_prices' && toolResult && !result.port_prices) {
          if (toolResult.prices_by_port || (Array.isArray(toolResult) && toolResult.length > 0)) {
            result.port_prices = toolResult;
            console.log(`✅ [BUNKER-AGENT] Extracted port_prices`);
          }
        }
        
        // Extract analyze_bunker_options result
        if (toolName === 'analyze_bunker_options' && toolResult && !result.bunker_analysis) {
          if (toolResult.recommendations && Array.isArray(toolResult.recommendations)) {
            result.bunker_analysis = toolResult;
            console.log(`✅ [BUNKER-AGENT] Extracted bunker_analysis: ${toolResult.recommendations.length} recommendations`);
          }
        }
      } catch (e) {
        console.warn(`⚠️ [BUNKER-AGENT] Error processing ToolMessage at index ${i}: ${e}`);
      }
    }
  }

  return result;
}

/**
 * Build ECA-aware route segments from compliance_data for the ECA Consumption Engine.
 * Uses switching_points when available; otherwise splits route into non-ECA + ECA by distance.
 */
function buildECASegmentsFromCompliance(
  route: { origin_port_code: string; destination_port_code: string; distance_nm: number },
  ecaZones: ECAZoneValidatorOutput | null,
  _speedKnots: number
): ECARouteSegment[] {
  if (!ecaZones?.has_eca_zones || (ecaZones.total_eca_distance_nm ?? 0) <= 0) {
    return [
      {
        segment_id: 'seg_0',
        from: route.origin_port_code,
        to: route.destination_port_code,
        distance_nm: route.distance_nm,
        is_eca: false,
      },
    ];
  }

  const sp = ecaZones.fuel_requirements?.switching_points ?? [];
  if (sp.length > 0) {
    const sorted = [...sp].sort(
      (a, b) => (a.distance_from_origin_nm ?? a.time_from_start_hours * 14) - (b.distance_from_origin_nm ?? b.time_from_start_hours * 14)
    );
    const segs: ECARouteSegment[] = [];
    let prevDist = 0;
    let inEca = false;
    for (let i = 0; i < sorted.length; i++) {
      const d = sorted[i].distance_from_origin_nm ?? sorted[i].time_from_start_hours * 14;
      const dist = Math.max(0, Math.min(d - prevDist, route.distance_nm - prevDist));
      if (dist > 0) {
        segs.push({
          segment_id: `seg_${i}`,
          from: i === 0 ? route.origin_port_code : `Boundary ${i}`,
          to: i === sorted.length - 1 ? route.destination_port_code : `Boundary ${i + 1}`,
          distance_nm: dist,
          is_eca: inEca,
          eca_zone_name: inEca ? ecaZones.eca_zones_crossed?.[0]?.zone_name : undefined,
        });
      }
      inEca = sorted[i].action === 'SWITCH_TO_MGO';
      prevDist = d;
    }
    const lastDist = Math.max(0, route.distance_nm - prevDist);
    if (lastDist > 0) {
      segs.push({
        segment_id: `seg_${sorted.length}`,
        from: `Boundary ${sorted.length}`,
        to: route.destination_port_code,
        distance_nm: lastDist,
        is_eca: inEca,
        eca_zone_name: inEca ? ecaZones.eca_zones_crossed?.[0]?.zone_name : undefined,
      });
    }
    return segs.length > 0 ? segs : [{
      segment_id: 'seg_0',
      from: route.origin_port_code,
      to: route.destination_port_code,
      distance_nm: route.distance_nm,
      is_eca: false,
    }];
  }

  const nonEca = Math.max(0, route.distance_nm - ecaZones.total_eca_distance_nm);
  const eca = ecaZones.total_eca_distance_nm;
  const zoneName = ecaZones.eca_zones_crossed?.[0]?.zone_name;
  return [
    { segment_id: 'seg_0', from: route.origin_port_code, to: 'ECA entry', distance_nm: nonEca, is_eca: false },
    { segment_id: 'seg_1', from: 'ECA entry', to: route.destination_port_code, distance_nm: eca, is_eca: true, eca_zone_name: zoneName },
  ];
}

/**
 * Bunker Agent Node - DETERMINISTIC WORKFLOW (No LLM)
 * 
 * Executes bunker analysis workflow without LLM decision-making.
 * Flow:
 * 1. Find ports along route (if needed)
 * 2. Check weather safety (if user requested)
 * 3. Get fuel prices (always)
 * 4. Analyze and rank options (always)
 * 
 * This is a deterministic workflow - no LLM decisions needed.
 */

/**
 * Vessel-specific bunker workflow: uses vessel specs and current ROB to calculate
 * fuel requirement, validates tank capacity, finds ports, fetches pricing, ranks options.
 */
/** Returns true if the string looks like an IMO (7 digits). */
function looksLikeIMO(id: string): boolean {
  return /^\d{7}$/.test(String(id).trim());
}

async function handleVesselSpecific(state: MultiAgentState): Promise<Partial<MultiAgentState>> {
  console.log('🔀 [BUNKER-WORKFLOW] Vessel-specific workflow');

  const vesselIds = [
    ...(state.vessel_identifiers?.imos ?? []),
    ...(state.vessel_identifiers?.names ?? []),
  ].filter(Boolean);
  if (vesselIds.length === 0) {
    console.log('   No vessel identifiers; falling back to simple port-to-port');
    return await handleSimplePortToPort(state);
  }
  const vesselId = vesselIds[0];
  const policy = getConfigManager().getDataPolicy('bunker');

  // Resolve name to IMO via vessel_details API when policy says vessel_details_api (Option A)
  let imo: string = vesselId;
  let vesselName: string = vesselId;
  if (!looksLikeIMO(vesselId) && policy?.vessel_identifier_source === 'vessel_details_api') {
    const resolved = await resolveVesselIdentifier({ name: vesselId }, policy);
    if (resolved.imo) {
      imo = resolved.imo;
      vesselName = resolved.vessel?.name ?? resolved.name ?? vesselId;
      console.log(`   Resolved vessel "${vesselId}" to IMO ${imo}`);
    }
  } else if (looksLikeIMO(vesselId)) {
    imo = String(vesselId).trim();
  }

  if (!state.route_data?.waypoints?.length) {
    return {
      agent_status: { ...(state.agent_status || {}), bunker_agent: 'failed' },
      agent_errors: {
        bunker_agent: {
          error: 'Route data is required for vessel-specific bunker planning. Please calculate route first.',
          timestamp: Date.now(),
        },
      },
      messages: [
        ...state.messages,
        new AIMessage({
          content: JSON.stringify({
            type: 'bunker_workflow_complete',
            message: 'Route data is required for vessel-specific bunker planning.',
            subtype: 'VESSEL_SPECIFIC',
          }),
        }),
      ],
    };
  }

  const route = state.route_data;
  const waypoints = route.waypoints.map((wp: { lat: number; lon: number } | [number, number]) =>
    Array.isArray(wp) ? { lat: wp[0], lon: wp[1] } : { lat: wp.lat, lon: wp.lon }
  );

  // Vessel specs: from vessel_performance_model when policy says so (with HITL for speed/load), else bunker API
  let vesselSpecs: Awaited<ReturnType<typeof bunkerDataService.fetchVesselSpecs>>;
  let speedKnots: number = 14;
  let bunkerLoadCondition: 'ballast' | 'laden' | undefined;
  const usePerformanceModel = policy?.consumption_source === 'vessel_performance_model';

  if (usePerformanceModel) {
    let speed = state.bunker_analysis_speed;
    let loadCondition = state.bunker_analysis_load_condition;
    if (speed == null || loadCondition == null) {
      const missing: ('speed' | 'load_condition')[] = [];
      if (speed == null) missing.push('speed');
      if (loadCondition == null) missing.push('load_condition');
      const interruptPayload = {
        type: 'bunker_analysis_input' as const,
        missing,
        question:
          'Please provide sailing speed (knots) and load condition (ballast or laden) for bunker analysis.',
      };
      const resumeValue = interrupt(interruptPayload) as BunkerHITLResume;
      speed = resumeValue.speed;
      loadCondition = resumeValue.load_condition;
    }
    speedKnots = speed;
    bunkerLoadCondition = loadCondition;
    const built = await buildVesselSpecsFromPerformance(
      imo,
      vesselName,
      speed,
      loadCondition,
      policy
    );
    if (!built) {
      return {
        agent_status: { ...(state.agent_status || {}), bunker_agent: 'failed' },
        agent_errors: {
          bunker_agent: {
            error: 'No consumption data available for this vessel from the performance model.',
            timestamp: Date.now(),
          },
        },
        messages: [
          ...state.messages,
          new AIMessage({
            content: JSON.stringify({
              type: 'bunker_workflow_complete',
              message: 'No consumption data available for this vessel.',
              subtype: 'VESSEL_SPECIFIC',
            }),
          }),
        ],
      };
    }
    vesselSpecs = built;
  } else {
    let specsFromApi: Awaited<ReturnType<typeof bunkerDataService.fetchVesselSpecs>> | null = null;
    try {
      specsFromApi = await bunkerDataService.fetchVesselSpecs(imo);
    } catch {
      try {
        specsFromApi = await bunkerDataService.fetchVesselSpecs(vesselId);
      } catch {
        specsFromApi = null;
      }
    }
    const hasUsableSpecs =
      specsFromApi &&
      typeof (specsFromApi as { consumptionRate?: number }).consumptionRate === 'number' &&
      (specsFromApi as { consumptionRate: number }).consumptionRate > 0 &&
      typeof (specsFromApi as { tankCapacity?: number }).tankCapacity === 'number' &&
      (specsFromApi as { tankCapacity: number }).tankCapacity > 0;
    if (hasUsableSpecs) {
      vesselSpecs = specsFromApi!;
    } else {
      // Fallback: bunker API failed or returned unusable specs — use HITL + performance model so user can still get analysis
      console.log('🔀 [BUNKER-WORKFLOW] Vessel specs unavailable from API; using HITL + performance model');
      let speed = state.bunker_analysis_speed;
      let loadCondition = state.bunker_analysis_load_condition;
      if (speed == null || loadCondition == null) {
        const missing: ('speed' | 'load_condition')[] = [];
        if (speed == null) missing.push('speed');
        if (loadCondition == null) missing.push('load_condition');
        const interruptPayload = {
          type: 'bunker_analysis_input' as const,
          missing,
          question:
            'Please provide sailing speed (knots) and load condition (ballast or laden) for bunker analysis.',
        };
        const resumeValue = interrupt(interruptPayload) as BunkerHITLResume;
        speed = resumeValue.speed;
        loadCondition = resumeValue.load_condition;
      }
      speedKnots = speed;
      bunkerLoadCondition = loadCondition;
      const built = await buildVesselSpecsFromPerformance(imo, vesselName, speed, loadCondition, policy ?? undefined);
      if (!built) {
        return {
          agent_status: { ...(state.agent_status || {}), bunker_agent: 'failed' },
          agent_errors: {
            bunker_agent: {
              error: 'No consumption data available for this vessel from the performance model.',
              timestamp: Date.now(),
            },
          },
          messages: [
            ...state.messages,
            new AIMessage({
              content: JSON.stringify({
                type: 'bunker_workflow_complete',
                message: 'No consumption data available for this vessel.',
                subtype: 'VESSEL_SPECIFIC',
              }),
            }),
          ],
        };
      }
      vesselSpecs = built;
    }
  }

  // ROB: from datalogs when policy says rob_source datalogs, else bunker API
  let currentROB: { totalROB: number; vesselId: string; timestamp: string; robVLSFO?: number; robLSMGO?: number; robMGO?: number };
  if (policy?.rob_source === 'datalogs') {
    const datalogsRob = await getRobFromDatalogs(imo, policy);
    if (datalogsRob) {
      const totalROB = Object.values(datalogsRob).reduce((a, b) => a + b, 0);
      currentROB = {
        vesselId: imo,
        timestamp: new Date().toISOString(),
        totalROB,
        robVLSFO: datalogsRob.VLSFO,
        robLSMGO: datalogsRob.LSMGO,
        robMGO: datalogsRob.MDO,
      };
    } else {
      currentROB = { vesselId: imo, timestamp: new Date().toISOString(), totalROB: 0 };
    }
  } else {
    try {
      currentROB = await bunkerDataService.fetchCurrentROB(imo);
    } catch {
      currentROB = await bunkerDataService.fetchCurrentROB(vesselId);
    }
  }

  // ROB at start of voyage is the single input for voyage calculations. When we have a departure
  // date, project current ROB to that date and use it for bunker requirement and tank checks.
  let robForCalculation = currentROB.totalROB;
  const departureDateRaw = state.next_voyage_details?.departure_date;
  if (departureDateRaw && route?.distance_nm != null && vesselSpecs?.consumptionRate != null) {
    const departureDate = typeof departureDateRaw === 'string' ? new Date(departureDateRaw) : departureDateRaw;
    const now = new Date();
    if (departureDate.getTime() > now.getTime()) {
      const daysToDeparture = (departureDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      robForCalculation = Math.max(
        0,
        currentROB.totalROB - vesselSpecs.consumptionRate * daysToDeparture
      );
      console.log(`🔀 [BUNKER-WORKFLOW] Using ROB at start of voyage: ${robForCalculation.toFixed(1)} MT (current ${currentROB.totalROB.toFixed(1)} MT, ${daysToDeparture.toFixed(0)} days to departure)`);
    }
  }

  const weatherFactor =
    state.weather_consumption?.consumption_increase_percent != null
      ? 1 + state.weather_consumption.consumption_increase_percent / 100
      : 1.1;
  const bunkerRequirement = calculateBunkerRequirement({
    currentROB: robForCalculation,
    vesselConsumption: vesselSpecs.consumptionRate,
    routeDistance: route.distance_nm,
    routeEstimatedHours: route.estimated_hours,
    weatherFactor,
    safetyMargin: 0.15,
    speedKnots,
  });

  const tankCapacity = vesselSpecs.tankCapacity;
  const robAfterBunkering = Math.min(
    robForCalculation + bunkerRequirement.bunkerQuantity,
    tankCapacity
  );
  const exceedsCapacity = robForCalculation + bunkerRequirement.bunkerQuantity > tankCapacity;
  const tankValidation = exceedsCapacity
    ? 'split_or_multi_port'
    : robAfterBunkering >= tankCapacity * 0.95
      ? 'near_full'
      : 'ok';

  const portFinderInput = {
    route_waypoints: waypoints,
    max_deviation_nm: 150,
  };
  const bunkerPortsResult = await withTimeout(
    executePortFinderTool(portFinderInput),
    TIMEOUTS.PORT_FINDER,
    'Port finder timed out'
  );
  const portsArray = Array.isArray(bunkerPortsResult)
    ? bunkerPortsResult
    : (bunkerPortsResult?.ports ?? []);

  const requiredFuelType = 'VLSFO';
  const compatiblePorts = portsArray.filter((p: any) => {
    const fuels = p.port?.fuel_capabilities ?? p.port?.fuelsAvailable ?? [];
    return fuels.some((f: string) => f.toUpperCase().includes(requiredFuelType) || f === requiredFuelType);
  });
  const portsToUse = compatiblePorts.length > 0 ? compatiblePorts : portsArray;

  if (portsToUse.length === 0) {
    const analysisSummary = [
      `Vessel: ${vesselSpecs.vesselName}`,
      `${robForCalculation !== currentROB.totalROB ? 'ROB at start of voyage' : 'Current ROB'}: ${robForCalculation.toFixed(1)} MT`,
      `Voyage consumption: ${bunkerRequirement.voyageFuelConsumption.toFixed(1)} MT`,
      `Bunker required: ${bunkerRequirement.bunkerQuantity.toFixed(1)} MT`,
      `Tank capacity: ${tankCapacity} MT`,
      ...(usePerformanceModel && policy?.tank_capacity_note ? [policy.tank_capacity_note] : []),
      'No bunker ports found within 150 nm of the route.',
    ].join('\n');
    const vesselContext: VesselContext = {
      vessel_id: imo,
      vessel_name: vesselSpecs.vesselName,
      current_rob: robForCalculation,
      tank_capacity: tankCapacity,
    };
    const emptyAnalysis = buildVesselSpecificBunkerAnalysis({
      vesselContext,
      bunkerRequirement,
      recommendedPorts: [],
      tankValidation,
      analysisSummary,
    });
    return {
      bunker_ports: [],
      port_prices: bunkerPricingToPriceFetcherOutput([]),
      bunker_analysis: emptyAnalysis as any,
      agent_status: { ...(state.agent_status || {}), bunker_agent: 'success' },
      messages: [
        ...state.messages,
        new AIMessage({
          content: JSON.stringify({
            type: 'bunker_workflow_complete',
            subtype: 'VESSEL_SPECIFIC',
            message: 'No bunker ports found along route.',
            rob_summary: { current_rob: robForCalculation, required: bunkerRequirement.bunkerQuantity },
            fuel_requirement: bunkerRequirement,
            tank_validation: tankValidation,
            ports_found: 0,
          }),
        }),
      ],
    };
  }

  const portCodesOrNames = portsToUse
    .map((p: any) =>
      (p.port?.port_code && String(p.port.port_code).trim()) ||
      (p.port?.name && String(p.port.name).trim()) ||
      p.port?.port_code ||
      p.port?.name ||
      ''
    )
    .filter(Boolean);
  const fuelTypes = [requiredFuelType];
  const pricings = await bunkerDataService.fetchBunkerPricing(portCodesOrNames, fuelTypes);
  const port_prices = bunkerPricingToPriceFetcherOutput(pricings);

  const bunkerQuantityMt = Math.min(bunkerRequirement.bunkerQuantity, tankCapacity - robForCalculation);
  const analyzerInput = {
    bunker_ports: portsToUse,
    port_prices,
    fuel_quantity_mt: Math.max(100, Math.max(0, bunkerQuantityMt)),
    fuel_type: 'VLSFO' as const,
    vessel_speed_knots: state.bunker_analysis_speed ?? 14,
    vessel_consumption_mt_per_day: vesselSpecs.consumptionRate,
    port_weather: [],
  };
  let bunkerAnalysis: any = null;
  try {
    bunkerAnalysis = await withTimeout(
      executeBunkerAnalyzerTool(analyzerInput),
      TIMEOUTS.AGENT,
      'Bunker analyzer timed out'
    );
  } catch (err: any) {
    console.warn('[BUNKER-WORKFLOW] handleVesselSpecific analyzer error:', err?.message);
  }

  const robBefore = robForCalculation;
  const recommendedPorts = (bunkerAnalysis?.recommendations ?? []).slice(0, 3).map((rec: any, idx: number) => ({
    port_code: rec.port_code,
    port_name: rec.port_name,
    total_cost_usd: rec.total_cost_usd ?? rec.total_cost ?? 0,
    bunker_quantity_mt: bunkerQuantityMt,
    rob_before_mt: robBefore,
    rob_after_mt: Math.min(robBefore + bunkerQuantityMt, tankCapacity),
    deviation_nm: rec.distance_from_route_nm ?? 0,
  }));

  const analysisSummaryParts = [
    `Vessel: ${vesselSpecs.vesselName}`,
    `Current ROB: ${robBefore.toFixed(1)} MT`,
    `Voyage consumption: ${bunkerRequirement.voyageFuelConsumption.toFixed(1)} MT (weather factor ${bunkerRequirement.weatherFactorApplied})`,
    `Required fuel (incl. ${(bunkerRequirement.safetyMarginApplied * 100).toFixed(0)}% safety): ${bunkerRequirement.requiredFuel.toFixed(1)} MT`,
    `Bunker quantity: ${bunkerRequirement.bunkerQuantity.toFixed(1)} MT`,
    `Tank capacity: ${tankCapacity} MT`,
    ...(usePerformanceModel && policy?.tank_capacity_note ? [policy.tank_capacity_note] : []),
    exceedsCapacity
      ? 'Single port cannot supply full quantity; consider split or multi-port bunkering.'
      : tankValidation === 'near_full'
        ? 'Tank will be near full after bunkering.'
        : 'Tank capacity OK.',
    `Ports evaluated: ${portsToUse.length}`,
    bunkerAnalysis?.best_option
      ? `Best option: ${bunkerAnalysis.best_option.port_name} ($${bunkerAnalysis.best_option.total_cost_usd?.toFixed(2) ?? 'N/A'})`
      : '',
  ];
  const vesselContext: VesselContext = {
    vessel_id: imo,
    vessel_name: vesselSpecs.vesselName,
    current_rob: robBefore,
    tank_capacity: tankCapacity,
    rob_after_bunkering: Math.min(robBefore + bunkerQuantityMt, tankCapacity),
  };

  let fullAnalysis = bunkerAnalysis
    ? buildVesselSpecificBunkerAnalysis({
        vesselContext,
        bunkerRequirement,
        recommendedPorts,
        tankValidation,
        analysisSummary: analysisSummaryParts.filter(Boolean).join('\n'),
        baseAnalysis: bunkerAnalysis,
      })
    : buildVesselSpecificBunkerAnalysis({
        vesselContext,
        bunkerRequirement,
        recommendedPorts,
        tankValidation,
        analysisSummary: analysisSummaryParts.filter(Boolean).join('\n'),
      });

  const singlePortBestCost = fullAnalysis.best_option?.total_cost_usd ?? 0;
  const vesselPortOptions: BunkerPortOption[] = (bunkerAnalysis?.recommendations ?? []).map((r: any) => ({
    port_code: r.port_code,
    port_name: r.port_name,
    price_per_mt: bunkerQuantityMt > 0 ? (r.total_cost_usd ?? r.fuel_cost_usd ?? 0) / bunkerQuantityMt : 0,
    deviation_nm: r.distance_from_route_nm ?? 0,
  })).filter((o: BunkerPortOption) => o.price_per_mt > 0);

  const voyageDurationDaysV = (route.estimated_hours || 0) / 24;
  if (
    shouldConsiderMultiPort(
      { bunkerQuantity: bunkerRequirement.bunkerQuantity, requiredFuel: bunkerRequirement.requiredFuel },
      { tankCapacity },
      vesselPortOptions,
      voyageDurationDaysV
    )
  ) {
    const multiPortStrategyV = optimizeMultiPortBunkering({
      totalFuelRequired: bunkerRequirement.bunkerQuantity,
      tankCapacity,
      currentROB: robBefore,
      availablePorts: vesselPortOptions,
      route: { distance_nm: route.distance_nm, estimated_hours: route.estimated_hours },
      deviationCostPerNm: 2,
    });
    if (multiPortStrategyV && singlePortBestCost > 0) {
      const withSavings = attachSavingsVsSingle(multiPortStrategyV, singlePortBestCost);
      const useMultiV = withSavings.total_cost < singlePortBestCost;
      fullAnalysis.strategy = useMultiV ? 'MULTI_PORT' : 'SINGLE_PORT';
      fullAnalysis.multi_port_available = true;
      fullAnalysis.multi_port_strategy = withSavings;
      fullAnalysis.single_vs_multi_comparison = {
        single_port_cost: singlePortBestCost,
        multi_port_cost: withSavings.total_cost,
        savings: singlePortBestCost - withSavings.total_cost,
        recommended: useMultiV ? 'MULTI_PORT' : 'SINGLE_PORT',
      };
    }
  }

  const vesselMessagePayload: Record<string, unknown> = {
    type: 'bunker_workflow_complete',
    subtype: 'VESSEL_SPECIFIC',
    message: 'Vessel-specific bunker analysis complete.',
    rob_summary: { current_rob: robBefore, required: bunkerRequirement.bunkerQuantity, rob_after: vesselContext.rob_after_bunkering },
    fuel_requirement: bunkerRequirement,
    tank_validation: tankValidation,
    ports_found: portsToUse.length,
    recommendations_count: fullAnalysis.recommendations?.length ?? 0,
    best_port: fullAnalysis.best_option?.port_name ?? null,
  };
  if (fullAnalysis.multi_port_strategy) {
    vesselMessagePayload.multi_port_considered = true;
    vesselMessagePayload.recommended_strategy = fullAnalysis.single_vs_multi_comparison?.recommended ?? 'SINGLE_PORT';
    vesselMessagePayload.single_vs_multi = fullAnalysis.single_vs_multi_comparison?.savings != null
      ? (fullAnalysis.single_vs_multi_comparison.savings > 0
          ? `Multi-port saves $${fullAnalysis.single_vs_multi_comparison.savings.toFixed(0)}.`
          : 'Single port remains best.')
      : undefined;
  }

  const stateUpdate: Partial<MultiAgentState> = {
    bunker_ports: portsToUse as any,
    port_prices,
    bunker_analysis: fullAnalysis as any,
    agent_status: { ...(state.agent_status || {}), bunker_agent: 'success' },
    messages: [
      ...state.messages,
      new AIMessage({
        content: JSON.stringify(vesselMessagePayload),
      }),
    ],
  };
  if (imo !== vesselId && state.vessel_identifiers) {
    const existingImos = state.vessel_identifiers.imos ?? [];
    if (!existingImos.includes(imo)) {
      stateUpdate.vessel_identifiers = {
        ...state.vessel_identifiers,
        imos: [imo, ...existingImos],
        names: state.vessel_identifiers.names ?? [],
      };
    }
  }
  if (usePerformanceModel && speedKnots != null && bunkerLoadCondition != null) {
    stateUpdate.bunker_analysis_speed = speedKnots;
    stateUpdate.bunker_analysis_load_condition = bunkerLoadCondition;
  }
  return stateUpdate;
}

/** Build vessel-specific bunker analysis object (recommendations + vessel fields). */
function buildVesselSpecificBunkerAnalysis(params: {
  vesselContext: VesselContext;
  bunkerRequirement: BunkerRequirement;
  recommendedPorts: Array<{
    port_code: string;
    port_name: string;
    total_cost_usd: number;
    bunker_quantity_mt: number;
    rob_before_mt: number;
    rob_after_mt: number;
    deviation_nm: number;
  }>;
  tankValidation: string;
  analysisSummary: string;
  baseAnalysis?: any;
}): any {
  const recs = params.baseAnalysis?.recommendations ?? params.recommendedPorts.map((p, i) => ({
    port_code: p.port_code,
    port_name: p.port_name,
    distance_from_route_nm: p.deviation_nm,
    fuel_cost_usd: p.total_cost_usd,
    deviation_cost_usd: 0,
    total_cost_usd: p.total_cost_usd,
    rank: i + 1,
  }));
  const best = recs[0];
  const worst = recs[recs.length - 1] ?? best;
  const maxSavings = (worst?.total_cost_usd ?? 0) - (best?.total_cost_usd ?? 0);
  return {
    query_type: 'VESSEL_SPECIFIC' as const,
    vessel_context: params.vesselContext,
    fuel_requirement: params.bunkerRequirement,
    recommended_ports: params.recommendedPorts,
    analysis_timestamp: new Date().toISOString(),
    recommendations: recs,
    best_option: best ?? {
      port_code: '',
      port_name: 'None',
      distance_from_route_nm: 0,
      fuel_cost_usd: 0,
      deviation_cost_usd: 0,
      total_cost_usd: 0,
      rank: 1,
    },
    worst_option: worst ?? {
      port_code: '',
      port_name: 'None',
      distance_from_route_nm: 0,
      fuel_cost_usd: 0,
      deviation_cost_usd: 0,
      total_cost_usd: 0,
      rank: 1,
    },
    max_savings_usd: Math.max(0, maxSavings),
    analysis_summary: params.analysisSummary,
  };
}

/**
 * Fleet comparison workflow: compare multiple vessels for a target voyage,
 * score by laycan, ballast cost, bunker positioning, ROB; set vessel_comparison_analysis
 * and bunker_analysis for the recommended vessel.
 */
async function handleFleetComparison(state: MultiAgentState): Promise<Partial<MultiAgentState>> {
  console.log('🔀 [BUNKER-WORKFLOW] Fleet comparison workflow');

  const vesselIds = [
    ...(state.vessel_identifiers?.imos ?? []),
    ...(state.vessel_identifiers?.names ?? []),
  ].filter(Boolean);
  if (vesselIds.length < 2) {
    console.log('   Fewer than 2 vessels; routing to vessel-specific');
    return await handleVesselSpecific(state);
  }

  if (!state.route_data?.waypoints?.length) {
    return {
      agent_status: { ...(state.agent_status || {}), bunker_agent: 'failed' },
      messages: [
        ...state.messages,
        new AIMessage({
          content: JSON.stringify({
            type: 'bunker_workflow_complete',
            subtype: 'FLEET_COMPARISON',
            message: 'Route data is required for fleet comparison. Please calculate route first.',
          }),
        }),
      ],
    };
  }

  const route = state.route_data;
  const waypoints = route.waypoints.map((wp: { lat: number; lon: number } | [number, number]) =>
    Array.isArray(wp) ? { lat: wp[0], lon: wp[1] } : { lat: wp.lat, lon: wp.lon }
  );
  const originCoordinates =
    route.origin_coordinates && 'lat' in route.origin_coordinates
      ? route.origin_coordinates
      : waypoints[0]
        ? { lat: waypoints[0].lat, lon: waypoints[0].lon }
        : undefined;

  const vesselDataPromises = vesselIds.map((id) =>
    Promise.all([
      bunkerDataService.fetchVesselSpecs(id),
      bunkerDataService.fetchCurrentROB(id),
    ])
  );
  const vesselData = await Promise.all(vesselDataPromises);

  const vessels: FleetComparisonParams['vessels'] = vesselData.map(([specs, rob], i) => ({
    vesselId: vesselIds[i],
    vesselName: specs.vesselName,
    currentROB: rob.totalROB,
    consumptionRate: specs.consumptionRate,
    tankCapacity: specs.tankCapacity,
    currentPosition: specs.currentPosition ?? (typeof rob.location === 'object' && rob.location && 'lat' in rob.location ? rob.location as { lat: number; lon: number } : undefined),
  }));

  const origin = route.origin_port_name ?? route.origin_port_code ?? 'Origin';
  const destination = route.destination_port_name ?? route.destination_port_code ?? 'Destination';
  const portsForPrice = [route.origin_port_code, route.destination_port_code, origin, destination].filter(Boolean) as string[];
  const pricings = await bunkerDataService.fetchBunkerPricing(portsForPrice.length ? portsForPrice : [origin], ['VLSFO']);
  const averagePricePerMT =
    pricings.length > 0
      ? pricings.reduce((s, p) => s + p.pricePerMT, 0) / pricings.length
      : 500;

  const voyage: VoyageTarget = {
    origin,
    destination,
    distance_nm: route.distance_nm,
    estimated_hours: route.estimated_hours,
    origin_coordinates: originCoordinates,
  };

  const weatherFactor =
    state.weather_consumption?.consumption_increase_percent != null
      ? 1 + state.weather_consumption.consumption_increase_percent / 100
      : 1.1;

  const comparisons = compareVesselsForVoyage({
    vessels,
    voyage,
    averagePricePerMT,
    weatherFactor,
    safetyMargin: 0.15,
    speedKnots: 14,
  });

  const best = comparisons[0];
  const analysisSummaryParts = [
    `Compared ${comparisons.length} vessels for ${origin} → ${destination}.`,
    `Best choice: ${best.vessel_name} (suitability ${best.suitability_score}/100).`,
    best.laycan_compliance === 'MEETS'
      ? 'Laycan: meets window.'
      : best.laycan_compliance === 'TIGHT'
        ? 'Laycan: tight; consider schedule.'
        : 'Laycan: misses; not recommended.',
    `Total cost estimate: $${best.total_cost.toFixed(0)} (ballast $${best.ballast_fuel_cost.toFixed(0)}, voyage bunker $${best.voyage_bunker_cost.toFixed(0)}).`,
    comparisons.length > 1
      ? `Next best: ${comparisons[1].vessel_name} (score ${comparisons[1].suitability_score}).`
      : '',
  ];
  const comparisonMatrix: Record<string, unknown> = {};
  for (const c of comparisons) {
    comparisonMatrix[c.vessel_id] = {
      suitability_score: c.suitability_score,
      total_cost: c.total_cost,
      laycan_compliance: c.laycan_compliance,
      recommendation: c.recommendation,
    };
  }

  const vesselComparisonAnalysis = {
    comparison_type: 'FLEET_FOR_VOYAGE' as const,
    vessels_analyzed: comparisons,
    rankings: comparisons,
    recommended_vessel: best.vessel_name,
    analysis_summary: analysisSummaryParts.filter(Boolean).join(' '),
    comparison_matrix: comparisonMatrix,
    target_voyage: {
      origin,
      destination,
      laycan: voyage.laycan_start && voyage.laycan_end
        ? `${voyage.laycan_start}–${voyage.laycan_end}`
        : undefined,
    },
    vessel_comparisons: comparisons,
    recommended_vessel_detail: best,
    analysis_timestamp: new Date().toISOString(),
  };

  const syntheticState: MultiAgentState = {
    ...state,
    vessel_identifiers: { imos: [best.vessel_id], names: [] },
  };
  const bunkerResult = await handleVesselSpecific(syntheticState);

  const whyBest =
    best.recommendation === 'BEST CHOICE'
      ? `Best suitability (${best.suitability_score}/100): laycan ${best.laycan_compliance}, total cost $${best.total_cost.toFixed(0)}.`
      : best.recommendation;

  return {
    ...bunkerResult,
    vessel_comparison_analysis: vesselComparisonAnalysis as any,
    vessel_rankings: comparisons as any,
    recommended_vessel: best.vessel_name,
    agent_status: { ...(state.agent_status || {}), bunker_agent: 'success' },
    messages: [
      ...state.messages,
      new AIMessage({
        content: JSON.stringify({
          type: 'bunker_workflow_complete',
          subtype: 'FLEET_COMPARISON',
          message: 'Fleet comparison complete.',
          vessels_analyzed: comparisons.length,
          best_vessel: best.vessel_name,
          why_best: whyBest,
          suitability_score: best.suitability_score,
          total_cost_estimate: best.total_cost,
          bunker_strategy_recommended: bunkerResult.bunker_analysis
            ? `Bunker plan for ${best.vessel_name}: see bunker_analysis.`
            : 'See bunker_analysis for recommended vessel.',
        }),
      }),
    ],
  };
}

/** Default bunker port codes when no route (evaluate by region/global). */
const DEFAULT_BUNKER_PORT_CODES = ['SGSIN', 'NLRTM', 'AEFJR', 'FJR', 'GIGIB', 'USHOU', 'EGPSD', 'AEJEA'];

/**
 * Constraint-first workflow: extract constraints, find candidate ports,
 * filter and rank by constraint match, optionally relax and re-filter.
 */
async function handleConstraintFirst(state: MultiAgentState): Promise<Partial<MultiAgentState>> {
  console.log('🔀 [BUNKER-WORKFLOW] Constraint-first workflow');

  const userMessage = state.messages?.find((m) => m instanceof HumanMessage);
  const query = userMessage?.content?.toString() ?? '';
  const constraints = extractBunkerConstraints(query, state);
  const fuelTypes = constraints.fuelTypes.length ? constraints.fuelTypes : ['VLSFO'];

  let candidatePorts: PortWithPricing[] = [];
  let portsEvaluated = 0;

  if (state.route_data?.waypoints?.length) {
    const route = state.route_data;
    const waypoints = route.waypoints.map((wp: { lat: number; lon: number } | [number, number]) =>
      Array.isArray(wp) ? { lat: wp[0], lon: wp[1] } : { lat: wp.lat, lon: wp.lon }
    );
    const bunkerPortsResult = await withTimeout(
      executePortFinderTool({ route_waypoints: waypoints, max_deviation_nm: 200 }),
      TIMEOUTS.PORT_FINDER,
      'Port finder timed out'
    );
    const portsArray = Array.isArray(bunkerPortsResult) ? bunkerPortsResult : (bunkerPortsResult?.ports ?? []);
    const portCodesOrNames = portsArray
      .map((p: any) =>
        (p.port?.port_code && String(p.port.port_code).trim()) ||
        (p.port?.name && String(p.port.name).trim()) ||
        ''
      )
      .filter(Boolean);
    const pricings = await bunkerDataService.fetchBunkerPricing(
      portCodesOrNames.length ? portCodesOrNames : [route.origin_port_code, route.destination_port_code].filter(Boolean),
      fuelTypes
    );
    for (const p of pricings) {
      const found = portsArray.find(
        (x: any) =>
          (x.port?.port_code === p.port || x.port?.name === p.port) ||
          (x.port?.port_code === p.port?.trim() || x.port?.name === p.port?.trim())
      );
      candidatePorts.push({
        port: p.port,
        portCode: p.port,
        fuelType: p.fuelType,
        pricePerMT: p.pricePerMT,
        availableQuantityMT: p.availableQuantity,
        distanceFromRouteNm: found?.distance_from_route_nm,
      });
    }
    if (candidatePorts.length === 0 && pricings.length > 0) {
      candidatePorts = pricings.map((p) => ({
        port: p.port,
        fuelType: p.fuelType,
        pricePerMT: p.pricePerMT,
        availableQuantityMT: p.availableQuantity,
      }));
    }
    portsEvaluated = portsArray.length || candidatePorts.length;
  } else {
    const pricings = await bunkerDataService.fetchBunkerPricing(
      DEFAULT_BUNKER_PORT_CODES,
      fuelTypes
    );
    candidatePorts = pricings.map((p) => ({
      port: p.port,
      portCode: p.port,
      fuelType: p.fuelType,
      pricePerMT: p.pricePerMT,
      availableQuantityMT: p.availableQuantity,
    }));
    portsEvaluated = candidatePorts.length;
  }

  let effectiveConstraints: BunkerConstraints = constraints;
  let relaxedRecord: RelaxedConstraints = {};
  let validOptions = candidatePorts.filter((port) =>
    validatePortAgainstConstraints(port, effectiveConstraints, state.route_data ?? undefined).valid
  );

  if (validOptions.length === 0) {
    const { relaxed, relaxedRecord: rec } = relaxConstraintsOnce(constraints);
    effectiveConstraints = relaxed;
    relaxedRecord = rec;
    validOptions = candidatePorts.filter((port) =>
      validatePortAgainstConstraints(port, effectiveConstraints, state.route_data ?? undefined).valid
    );
  }

  const rankedOptions = rankByConstraintMatch(validOptions, effectiveConstraints);
  const top5 = rankedOptions.slice(0, 5);
  const best = top5[0];
  const worst = top5[top5.length - 1] ?? best;
  const maxSavings = best && worst ? Math.max(0, (worst.pricePerMT - best.pricePerMT) * (constraints.maxQuantityMT ?? 1000)) : 0;

  const recommendations = top5.map((p, i) => ({
    port_code: p.portCode ?? p.port,
    port_name: p.port,
    distance_from_route_nm: p.distanceFromRouteNm ?? 0,
    fuel_cost_usd: (constraints.maxQuantityMT ?? 0) * p.pricePerMT,
    deviation_cost_usd: 0,
    total_cost_usd: (constraints.maxQuantityMT ?? 0) * p.pricePerMT,
    rank: i + 1,
  }));

  const analysisSummaryParts = [
    `Constraints: ${constraints.fuelTypes.join(', ')}${constraints.maxQuantityMT != null ? `, max ${constraints.maxQuantityMT} MT` : ''}${constraints.priceCeilingPerMT != null ? `, under $${constraints.priceCeilingPerMT}/MT` : ''}.`,
    `Ports evaluated: ${portsEvaluated}.`,
    `Ports meeting constraints: ${validOptions.length}.`,
    Object.keys(relaxedRecord).length > 0
      ? `Some constraints were relaxed to find options: ${JSON.stringify(relaxedRecord)}.`
      : null,
    best ? `Best option: ${best.port} at $${best.pricePerMT.toFixed(2)}/MT.` : 'No options found.',
  ].filter(Boolean);

  const bunkerAnalysis = {
    query_type: 'CONSTRAINT_FIRST' as const,
    constraints_specified: constraints,
    ports_evaluated: portsEvaluated,
    ports_meeting_constraints: validOptions.length,
    constraints_relaxed: Object.keys(relaxedRecord).length > 0 ? relaxedRecord : undefined,
    recommended_ports: top5.map((p) => ({
      port_code: p.portCode ?? p.port,
      port_name: p.port,
      total_cost_usd: (constraints.maxQuantityMT ?? 0) * p.pricePerMT,
      bunker_quantity_mt: constraints.maxQuantityMT ?? 0,
      rob_before_mt: 0,
      rob_after_mt: constraints.maxQuantityMT ?? 0,
      deviation_nm: p.distanceFromRouteNm ?? 0,
    })),
    analysis_timestamp: new Date().toISOString(),
    recommendations,
    best_option: recommendations[0] ?? {
      port_code: '',
      port_name: 'None',
      distance_from_route_nm: 0,
      fuel_cost_usd: 0,
      deviation_cost_usd: 0,
      total_cost_usd: 0,
      rank: 1,
    },
    worst_option: recommendations[recommendations.length - 1] ?? recommendations[0] ?? {
      port_code: '',
      port_name: 'None',
      distance_from_route_nm: 0,
      fuel_cost_usd: 0,
      deviation_cost_usd: 0,
      total_cost_usd: 0,
      rank: 1,
    },
    max_savings_usd: maxSavings,
    analysis_summary: analysisSummaryParts.join(' '),
  };

  const relaxedExplain =
    Object.keys(relaxedRecord).length > 0
      ? ' Constraints were relaxed to find options; see constraints_relaxed in analysis.'
      : '';

  return {
    bunker_ports: rankedOptions.length ? (state.route_data ? [] : []) : [],
    port_prices: bunkerPricingToPriceFetcherOutput(
      rankedOptions.map((p) => ({
        port: p.port,
        fuelType: p.fuelType,
        pricePerMT: p.pricePerMT,
        currency: 'USD',
        lastUpdated: new Date().toISOString(),
        availableQuantity: p.availableQuantityMT,
      }))
    ),
    bunker_analysis: bunkerAnalysis as any,
    agent_status: { ...(state.agent_status || {}), bunker_agent: 'success' },
    messages: [
      ...state.messages,
      new AIMessage({
        content: JSON.stringify({
          type: 'bunker_workflow_complete',
          subtype: 'CONSTRAINT_FIRST',
          message: 'Constraint-first bunker analysis complete.',
          constraints_detected: {
            fuelTypes: constraints.fuelTypes,
            maxQuantityMT: constraints.maxQuantityMT,
            priceCeilingPerMT: constraints.priceCeilingPerMT,
            preferredPorts: constraints.preferredPorts,
            avoidPorts: constraints.avoidPorts,
          },
          ports_evaluated: portsEvaluated,
          ports_meeting_constraints: validOptions.length,
          constraints_relaxed: Object.keys(relaxedRecord).length > 0 ? relaxedRecord : undefined,
          recommendation: best
            ? `${best.port} at $${best.pricePerMT.toFixed(2)}/MT${relaxedExplain}`
            : 'No ports met all constraints. Try relaxing quantity, price, or time.',
          tradeoffs: validOptions.length > 1 ? `Top ${top5.length} options ranked by constraint match.` : undefined,
        }),
      }),
    ],
  };
}

/**
 * Simple port-to-port workflow: find bunker ports along route, fetch pricing via bunkerDataService,
 * analyze and rank options, set bunker_analysis.
 */
async function handleSimplePortToPort(state: MultiAgentState): Promise<Partial<MultiAgentState>> {
  const route = state.route_data!;
  const waypoints = route.waypoints.map((wp: { lat: number; lon: number } | [number, number]) =>
    Array.isArray(wp) ? { lat: wp[0], lon: wp[1] } : { lat: wp.lat, lon: wp.lon }
  );

  const portFinderInput = {
    route_waypoints: waypoints,
    max_deviation_nm: 150,
  };
  const bunkerPortsResult = await withTimeout(
    executePortFinderTool(portFinderInput),
    TIMEOUTS.PORT_FINDER,
    'Port finder timed out'
  );
  const portsArray = Array.isArray(bunkerPortsResult) ? bunkerPortsResult : (bunkerPortsResult?.ports ?? []);
  if (portsArray.length === 0) {
    const total_ports_found = (bunkerPortsResult as any)?.total_ports_found ?? 0;
    return {
      bunker_ports: [],
      port_prices: bunkerPricingToPriceFetcherOutput([]),
      bunker_analysis: null,
      agent_status: { ...(state.agent_status || {}), bunker_agent: 'success' },
      messages: [
        ...state.messages,
        new AIMessage({
          content: JSON.stringify({
            type: 'bunker_workflow_complete',
            message: total_ports_found === 0
              ? 'No bunker ports found within 150 nm of the route.'
              : 'No port list returned; check port finder.',
            ports_found: 0,
          }),
        }),
      ],
    };
  }

  const portCodesOrNames = portsArray.map((p: any) =>
    (p.port?.port_code && String(p.port.port_code).trim()) || (p.port?.name && String(p.port.name).trim()) || p.port?.port_code || p.port?.name || ''
  ).filter(Boolean);
  const fuelTypes = ['VLSFO'];
  const pricings = await bunkerDataService.fetchBunkerPricing(portCodesOrNames, fuelTypes);
  const port_prices = bunkerPricingToPriceFetcherOutput(pricings);

  const vp = getDefaultVesselProfile();
  const consumptionVlsfo = (vp.consumption_vlsfo_per_day ?? 35) * (vp.fouling_factor ?? 1);
  const voyageDurationDays = (route.estimated_hours || 0) / 24;
  const vlsfoRequired = Math.max(0, Math.ceil(voyageDurationDays * consumptionVlsfo * 1.15));

  const analyzerInput = {
    bunker_ports: portsArray,
    port_prices,
    fuel_quantity_mt: Math.max(100, vlsfoRequired),
    fuel_type: 'VLSFO' as const,
    vessel_speed_knots: 14,
    vessel_consumption_mt_per_day: consumptionVlsfo,
    port_weather: [],
  };
  let bunkerAnalysis: any = null;
  try {
    bunkerAnalysis = await withTimeout(
      executeBunkerAnalyzerTool(analyzerInput),
      TIMEOUTS.AGENT,
      'Bunker analyzer timed out'
    );
  } catch (err: any) {
    console.warn('[BUNKER-WORKFLOW] handleSimplePortToPort analyzer error:', err?.message);
  }

  const recommendationsCount = bunkerAnalysis?.recommendations?.length ?? 0;
  const bestPort = bunkerAnalysis?.recommendations?.[0]?.port_name ?? 'Unknown';
  const singlePortBestCost = bunkerAnalysis?.best_option?.total_cost_usd ?? 0;

  let multiPortStrategy: import('@/lib/types/bunker-agent').MultiPortStrategy | null = null;
  const tankCapacityVlsfo = (vp.capacity?.VLSFO ?? 2000) + (vp.capacity?.LSMGO ?? 0);
  const currentROBVlsfo = (vp.initial_rob?.VLSFO ?? 0) + (vp.initial_rob?.LSMGO ?? 0);
  const portOptions: BunkerPortOption[] = (bunkerAnalysis?.recommendations ?? []).map((r: any) => ({
    port_code: r.port_code,
    port_name: r.port_name,
    price_per_mt: r.fuel_cost_usd > 0 && vlsfoRequired > 0 ? r.fuel_cost_usd / vlsfoRequired : r.fuel_cost_usd,
    deviation_nm: r.distance_from_route_nm ?? 0,
  })).filter((o: BunkerPortOption) => o.price_per_mt > 0);

  if (
    bunkerAnalysis &&
    shouldConsiderMultiPort(
      { bunkerQuantity: vlsfoRequired, requiredFuel: vlsfoRequired },
      { tankCapacity: tankCapacityVlsfo },
      portOptions,
      voyageDurationDays
    )
  ) {
    multiPortStrategy = optimizeMultiPortBunkering({
      totalFuelRequired: vlsfoRequired,
      tankCapacity: tankCapacityVlsfo,
      currentROB: currentROBVlsfo,
      availablePorts: portOptions,
      route: { distance_nm: route.distance_nm, estimated_hours: route.estimated_hours },
      deviationCostPerNm: 2,
    });
    if (multiPortStrategy && singlePortBestCost > 0) {
      multiPortStrategy = attachSavingsVsSingle(multiPortStrategy, singlePortBestCost);
    }
  }

  const useMultiPort = multiPortStrategy != null && multiPortStrategy.total_cost < singlePortBestCost;
  if (bunkerAnalysis) {
    bunkerAnalysis.strategy = useMultiPort ? 'MULTI_PORT' : 'SINGLE_PORT';
    bunkerAnalysis.multi_port_available = multiPortStrategy != null;
    if (multiPortStrategy) {
      bunkerAnalysis.multi_port_strategy = multiPortStrategy;
      bunkerAnalysis.single_vs_multi_comparison = {
        single_port_cost: singlePortBestCost,
        multi_port_cost: multiPortStrategy.total_cost,
        savings: singlePortBestCost - multiPortStrategy.total_cost,
        recommended: useMultiPort ? 'MULTI_PORT' : 'SINGLE_PORT',
      };
    }
  }

  const messagePayload: Record<string, unknown> = {
    type: 'bunker_workflow_complete',
    ports_found: portsArray.length,
    prices_fetched: port_prices.ports_with_prices,
    recommendations: recommendationsCount,
    recommended_port: bestPort,
    subtype: 'SIMPLE_PORT_TO_PORT',
  };
  if (multiPortStrategy != null) {
    messagePayload.multi_port_considered = true;
    messagePayload.multi_port_savings = multiPortStrategy.savings_vs_single_port;
    messagePayload.recommended_strategy = useMultiPort ? 'MULTI_PORT' : 'SINGLE_PORT';
    messagePayload.single_vs_multi = useMultiPort
      ? `Multi-port saves $${multiPortStrategy.savings_vs_single_port.toFixed(0)} vs best single port.`
      : 'Single port remains best option.';
  }

  return {
    bunker_ports: portsArray as any,
    port_prices,
    bunker_analysis: bunkerAnalysis ?? null,
    agent_status: { ...(state.agent_status || {}), bunker_agent: 'success' },
    messages: [
      ...state.messages,
      new AIMessage({
        content: JSON.stringify(messagePayload),
      }),
    ],
  };
}

export async function bunkerAgentNode(
  state: MultiAgentState
): Promise<Partial<MultiAgentState>> {
  const cid = extractCorrelationId(state);
  logAgentExecution('bunker_agent', cid, 0, 'started', { input: summarizeInputForLog(state) });

  console.log('\n⚓ [BUNKER-WORKFLOW] Starting deterministic workflow...');
  const startTime = Date.now();
  
  // Declare variables at function scope so they're accessible in catch block
  let bunkerPorts: any = null;
  let portPrices: any = null;
  let portWeather: any = null;
  let robTrackingResult: any = null;
  let robSafetyStatus: any = null;
  let ecaConsumptionResult: any = null;
  let ecaSummaryResult: any = null;
  let vp: any = null;
  let resolvedVesselName: string | null = null;
  
  try {
    // ========================================================================
    // Check prerequisites
    // ========================================================================
    
    if (!state.route_data?.waypoints || state.route_data.waypoints.length === 0) {
      console.error('❌ [BUNKER-WORKFLOW] Missing route waypoints - cannot find ports');
      return {
        agent_status: { 
          ...(state.agent_status || {}), 
          bunker_agent: 'failed' 
        },
        agent_errors: {
          bunker_agent: {
            error: 'Route data is required to find bunker ports. Please calculate route first.',
            timestamp: Date.now(),
          },
        },
        messages: [
          ...state.messages,
          new AIMessage({
            content: 'Error: Route data is required to find bunker ports. Please calculate route first.',
          }),
        ],
      };
    }
    
    console.log('✅ [BUNKER-WORKFLOW] Prerequisite met: route_data (waypoints available)');

    // ========================================================================
    // Detect bunker query subtype and route to appropriate workflow
    // ========================================================================
    const querySubtype = detectBunkerQuerySubtype(state);
    const subtypeMessage = new SystemMessage({
      content: `[BUNKER AGENT] Query subtype detected: ${querySubtype}`,
    });
    const stateWithSubtype = {
      ...state,
      messages: [...state.messages, subtypeMessage],
    };

    switch (querySubtype) {
      case 'SIMPLE_PORT_TO_PORT':
        return await handleSimplePortToPort(stateWithSubtype);
      case 'VESSEL_SPECIFIC':
        return await handleVesselSpecific(stateWithSubtype);
      case 'FLEET_COMPARISON':
        return await handleFleetComparison(stateWithSubtype);
      case 'CONSTRAINT_FIRST':
        return await handleConstraintFirst(stateWithSubtype);
    }

  } catch (error: any) {
    if (isGraphInterrupt(error)) {
      throw error;
    }
    const duration = Date.now() - startTime;
    logError(extractCorrelationId(state), error, { agent: 'bunker_agent' });
    console.error(`❌ [BUNKER-WORKFLOW] Error after ${duration}ms:`, error.message);

    // Record error metrics
    recordAgentExecution('bunker_agent', duration, false);
    logAgentExecution('bunker_agent', extractCorrelationId(state), duration, 'failed', {});

    // Return partial outputs if available (ports, rob_tracking, etc.)
    const partialOutputs: Partial<MultiAgentState> = {};
    if (bunkerPorts) {
      partialOutputs.bunker_ports = Array.isArray(bunkerPorts) ? bunkerPorts : (bunkerPorts?.ports ?? []);
    }
    if (portPrices) {
      partialOutputs.port_prices = portPrices;
    }
    if (robTrackingResult) {
      partialOutputs.rob_tracking = robTrackingResult;
      partialOutputs.rob_waypoints = robTrackingResult.waypoints;
      partialOutputs.rob_safety_status = robSafetyStatus;
    }
    if (ecaConsumptionResult) {
      partialOutputs.eca_consumption = ecaConsumptionResult;
      partialOutputs.eca_summary = ecaSummaryResult;
    }
    if (vp) {
      partialOutputs.vessel_profile = vp;
      partialOutputs.vessel_name = resolvedVesselName ?? (vp?.vessel_name ?? null);
    }

    if (portWeather) {
      partialOutputs.port_weather_status = portWeather;
    }

    return {
      ...partialOutputs,
      agent_status: {
        ...(state.agent_status || {}),
        bunker_agent: 'failed',
      },
      agent_errors: {
        ...(state.agent_errors || {}),
        bunker_agent: {
          error: error.message,
          timestamp: Date.now(),
        },
      },
      messages: [
        ...state.messages,
        new AIMessage({
          content: `Bunker workflow encountered an error: ${error.message}. The system will continue with available data.`,
        }),
      ],
    };
  }
}


/**
 * Finalize Node
 * 
 * Synthesizes final recommendation from all agent data.
 * No tools, just LLM synthesis.
 */
/**
 * Format synthesis into progressive disclosure structure
 * 
 * UX Pattern: F-Pattern + Progressive Disclosure
 * - Level 1 (0-5 sec): One-line summary + critical decision + warnings
 * - Level 2 (5-30 sec): Expandable action items and risks
 * - Level 3 (30+ sec): Technical details (handled by template)
 * 
 * Design Principles:
 * - Nielsen Norman Group: F-pattern reading (top-left → horizontal → vertical)
 * - Miller's Law: Max 7±2 items in working memory
 * - Inverted Pyramid: Most important first
 * 
 * NO LLM CALL - Uses direct formatting for speed (~0.1s vs 20-30s)
 */
function formatSynthesisAsNarrative(state: MultiAgentState): string {
  const parts: string[] = [];
  const synthesis = state.synthesized_insights;
  
  // ============================================================================
  // LEVEL 1: THE 5-SECOND ANSWER (Above the fold, always visible)
  // ============================================================================
  
  // --- ONE-LINE VOYAGE SUMMARY ---
  if (state.route_data) {
    const origin = (state.route_data.origin_port_name ?? state.route_data.origin_port_code) || 'Origin';
    const dest = (state.route_data.destination_port_name ?? state.route_data.destination_port_code) || 'Destination';
    const distance = state.route_data.distance_nm.toFixed(0);
    const days = Math.floor((state.route_data.estimated_hours || 0) / 24);
    const weatherPct = state.weather_consumption?.consumption_increase_percent;
    
    let voyageLine = `**${origin} → ${dest}**: ${distance} nm, ${days} days`;
    if (weatherPct && weatherPct > 0) {
      voyageLine += `, +${weatherPct.toFixed(1)}% weather`;
    }
    parts.push(voyageLine + '\n');
  }
  
  // --- CRITICAL DECISION BLOCK ---
  const criticals: string[] = [];
  
  // Multi-port requirement (most critical - affects entire voyage plan)
  if (state.multi_bunker_plan?.required && state.multi_bunker_plan.best_plan) {
    const plan = state.multi_bunker_plan.best_plan;
    const stops = plan.stops.map(s => s.port_name).join(' + ');
    const totalCostK = (plan.total_cost_usd / 1000).toFixed(0);
    
    criticals.push('🚨 **MULTI-STOP REQUIRED**');
    criticals.push(`${stops} = **$${totalCostK}K**`);
  } else if (state.bunker_analysis?.best_option) {
    // Single-stop bunker (simpler decision)
    const best = state.bunker_analysis.best_option;
    const costK = ((best.total_cost_usd || 0) / 1000).toFixed(0);
    
    criticals.push(`🏆 **${best.port_name}** = **$${costK}K**`);
  }
  
  // Safety margin warning (high priority - regulatory/safety issue)
  if (state.rob_safety_status && !state.rob_safety_status.overall_safe) {
    const minDays = state.rob_safety_status.minimum_rob_days?.toFixed(1) || 'N/A';
    criticals.push(`⚠️ ${minDays} days safety margin (need 3.0 minimum)`);
  }
  
  // Synthesis-based critical risks (from LLM analysis)
  if (synthesis?.critical_risks && synthesis.critical_risks.length > 0) {
    // Show only first critical risk in Level 1 (rest in expandable)
    const topRisk = synthesis.critical_risks[0];
    if (topRisk.severity === 'critical') {
      criticals.push(`⚠️ ${topRisk.risk}`);
    }
  }
  
  if (criticals.length > 0) {
    parts.push(criticals.join('\n'));
    parts.push(''); // Blank line for spacing
  }
  
  // --- DEPARTURE ROB (Key operational context) ---
  if (state.rob_waypoints && state.rob_waypoints.length > 0) {
    const departure = state.rob_waypoints[0];
    if (departure.rob_after_action) {
      const vlsfo = departure.rob_after_action.VLSFO?.toFixed(0) || '0';
      const lsmgo = departure.rob_after_action.LSMGO?.toFixed(0) || '0';
      parts.push(`📊 **Departure ROB**: ${vlsfo} MT VLSFO, ${lsmgo} MT LSMGO`);
    }
  }
  
  // ============================================================================
  // LEVEL 2: NEXT STEPS (5-30 seconds, concise action items)
  // ============================================================================
  
  // Strategic priorities from synthesis (limit to top 2 for scannability)
  if (synthesis?.strategic_priorities && synthesis.strategic_priorities.length > 0) {
    parts.push('\n**Next Steps**:');
    synthesis.strategic_priorities.slice(0, 2).forEach((p, i) => {
      const urgencyIcon = p.urgency === 'immediate' ? '🔴' : 
                          p.urgency === 'today' ? '🟡' : '🟢';
      parts.push(`${i + 1}. ${urgencyIcon} ${p.action}`);
    });
    
    // Indicate if there are more items
    if (synthesis.strategic_priorities.length > 2) {
      parts.push(`   _+ ${synthesis.strategic_priorities.length - 2} more action items_`);
    }
  }
  
  // ============================================================================
  // LEVEL 3+: Everything else handled by template expandable cards
  // (Multi-port details, weather impact, ECA compliance, alternatives, etc.)
  // ============================================================================
  
  return parts.join('\n');
}

/**
 * Format a structured bunker planning summary (voyage, ROB, speed, consumption calc, best port).
 * Used as the intro text for bunker_planning hybrid responses. No LLM call.
 */
function formatBunkerPlanningSummary(state: MultiAgentState): string {
  const lines: string[] = [];
  const route = state.route_data;
  const analysis = state.bunker_analysis;
  const fuelReq = analysis?.fuel_requirement;
  const weatherConsumption = state.weather_consumption;
  const speedKnots = state.bunker_analysis_speed ?? 14;

  // --- Voyage ---
  if (route) {
    const origin = (route.origin_port_name ?? route.origin_port_code) || 'Origin';
    const dest = (route.destination_port_name ?? route.destination_port_code) || 'Destination';
    const distanceNm = route.distance_nm?.toFixed(0) ?? '—';
    const days = route.estimated_hours != null ? route.estimated_hours / 24 : null;
    const daysRounded = days != null ? Math.round(days) : null;
    lines.push(`**Next voyage:** ${origin} → ${dest}`);
    lines.push(`**Total distance:** ${distanceNm} nm${daysRounded != null ? ` · ~${daysRounded} days at ${speedKnots} knots` : ''}`);
  }

  // --- Current ROB ---
  const vc = analysis?.vessel_context;
  if (vc?.current_rob != null) {
    let robStr = `**Current ROB:** ${vc.current_rob.toFixed(0)} MT`;
    if (state.rob_waypoints?.[0]?.rob_after_action) {
      const ra = state.rob_waypoints[0].rob_after_action;
      const vlsfo = 'VLSFO' in ra ? (ra as { VLSFO?: number }).VLSFO : undefined;
      const lsmgo = 'LSMGO' in ra ? (ra as { LSMGO?: number }).LSMGO : undefined;
      if (vlsfo != null || lsmgo != null) {
        const tokens = [];
        if (vlsfo != null) tokens.push(`${vlsfo.toFixed(0)} MT VLSFO`);
        if (lsmgo != null) tokens.push(`${lsmgo.toFixed(0)} MT LSMGO`);
        robStr = `**Current ROB:** ${tokens.join(', ')}`;
      }
    }
    lines.push(robStr);
  }

  lines.push(`**Speed for next voyage:** ${speedKnots} knots`);

  // --- Consumption calculation (vessel model, days × rate, weather, safety) ---
  if (fuelReq && route?.estimated_hours != null && route.estimated_hours > 0) {
    const voyageDays = route.estimated_hours / 24;
    const weatherFactor = fuelReq.weatherFactorApplied;
    const baseNoWeather =
      weatherFactor > 0
        ? fuelReq.voyageFuelConsumption / weatherFactor
        : fuelReq.voyageFuelConsumption;
    const consumptionPerDay = baseNoWeather / voyageDays;
    const weatherPct =
      weatherConsumption?.consumption_increase_percent != null
        ? weatherConsumption.consumption_increase_percent
        : (weatherFactor - 1) * 100;
    const totalExpected = fuelReq.requiredFuel ?? fuelReq.voyageFuelConsumption * (1 + (fuelReq.safetyMarginApplied ?? 0.15));

    lines.push('');
    lines.push('**Total consumption calculation:**');
    lines.push(
      `At **${speedKnots} knots**, vessel consumption **${consumptionPerDay.toFixed(1)} MT/day** (from vessel model).`
    );
    const daysRounded = Math.round(voyageDays);
    lines.push(
      `Voyage **${daysRounded} days** × ${consumptionPerDay.toFixed(1)} MT/day = **${baseNoWeather.toFixed(0)} MT** base.`
    );
    if (weatherPct > 0) {
      lines.push(`× weather adjustment **+${weatherPct.toFixed(1)}%** (forecast) = **${fuelReq.voyageFuelConsumption.toFixed(0)} MT**.`);
    } else if (weatherFactor !== 1) {
      lines.push(`× weather factor **${weatherFactor.toFixed(2)}** = **${fuelReq.voyageFuelConsumption.toFixed(0)} MT**.`);
    }
    const safetyPct = ((fuelReq.safetyMarginApplied ?? 0.15) * 100).toFixed(0);
    lines.push(`+ **${safetyPct}%** safety margin → **${totalExpected.toFixed(0)} MT** total required.`);
  }

  // --- Best bunker option ---
  const best = analysis?.best_option;
  if (best) {
    lines.push('');
    const portName = best.port_name ?? best.port_code ?? '—';
    const deviationNm = best.distance_from_route_nm != null ? best.distance_from_route_nm.toFixed(0) : '—';
    const costUsd = best.total_cost_usd ?? best.fuel_cost_usd;
    const costStr = costUsd != null ? `$${costUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—';
    lines.push(`**Best bunker option:** ${portName} — ${deviationNm} nm deviation, ${costStr} total.`);
  }

  return lines.join('\n\n');
}

/**
 * Format vessel comparison summary (recommended vessel, rankings).
 * Used as intro text for vessel_selection hybrid responses.
 */
function formatVesselComparisonSummary(state: MultiAgentState): string {
  const vc = state.vessel_comparison_analysis;
  if (!vc?.vessels_analyzed?.length) return '';
  const lines: string[] = [];
  const recommended = vc.recommended_vessel;
  const rankings = vc.rankings ?? [];
  if (recommended) {
    lines.push(`**Recommended vessel:** ${recommended}`);
  }
  if (rankings.length > 0) {
    lines.push('');
    lines.push('**Rankings:**');
    (rankings as Array<{ rank?: number; vessel_name?: string; recommendation_reason?: string; total_cost_usd?: number }>)
      .slice(0, 5)
      .forEach((r, i) => {
        const rank = r.rank ?? i + 1;
        const name = r.vessel_name ?? '—';
        const reason = r.recommendation_reason ?? '';
        const cost = r.total_cost_usd != null ? ` · $${r.total_cost_usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '';
        lines.push(`${rank}. **${name}**${cost}${reason ? ` — ${reason}` : ''}`);
      });
  }
  if (vc.analysis_summary) {
    lines.push('');
    lines.push(vc.analysis_summary);
  }
  return lines.join('\n\n');
}

/**
 * Generate clarification response for agentic supervisor
 * Called when needs_clarification is true
 */
function generateClarificationResponse(state: MultiAgentState): string {
  const question = state.clarification_question || 'Could you please provide more details about your request?';
  
  // Get user's original query for context
  const userMessage = state.messages.find(msg => msg instanceof HumanMessage);
  const originalQuery = userMessage 
    ? (typeof userMessage.content === 'string' ? userMessage.content : String(userMessage.content))
    : '';
  
  // Build context-aware response
  const parts: string[] = [];
  
  parts.push('## ❓ Clarification Needed\n');
  parts.push(question);
  parts.push('\n');
  
  // Add context about what we understood
  if (originalQuery) {
    parts.push('\n**What I understood from your request:**');
    parts.push(`> "${originalQuery.substring(0, 200)}${originalQuery.length > 200 ? '...' : ''}"\n`);
  }
  
  // Add available data context
  const availableData: string[] = [];
  if (state.route_data) {
    availableData.push(`Route: ${(state.route_data.origin_port_name ?? state.route_data.origin_port_code)} → ${(state.route_data.destination_port_name ?? state.route_data.destination_port_code)}`);
  }
  if (state.weather_forecast) {
    availableData.push('Weather forecast available');
  }
  if (state.bunker_ports && state.bunker_ports.length > 0) {
    availableData.push(`${state.bunker_ports.length} bunker ports identified`);
  }
  
  if (availableData.length > 0) {
    parts.push('\n**Data I have so far:**');
    availableData.forEach(item => parts.push(`- ${item}`));
  }
  
  // Add reasoning context if available
  if (state.current_thought) {
    parts.push('\n**My analysis:**');
    parts.push(`_${state.current_thought.substring(0, 300)}${state.current_thought.length > 300 ? '...' : ''}_`);
  }
  
  // Add helpful suggestions
  parts.push('\n\n**You can help by:**');
  parts.push('- Providing specific port codes (e.g., SGSIN for Singapore, NLRTM for Rotterdam)');
  parts.push('- Specifying fuel types and quantities needed');
  parts.push('- Indicating your departure date or timeframe');
  
  return parts.join('\n');
}

/**
 * Generate legacy text output using synthesis data
 * NO LLM CALL - Uses direct formatting for speed
 */
async function generateLegacyTextOutput(state: MultiAgentState): Promise<string> {
  console.log('📝 [LEGACY-OUTPUT] Formatting synthesis data (no LLM call)');
  
  // Strategy 1: Use synthesis if available (preferred)
  if (state.synthesized_insights) {
    console.log('✅ [LEGACY-OUTPUT] Using synthesis-based narrative');
    const narrative = formatSynthesisAsNarrative(state);
    
    // Append compliance summary if available
    let complianceSummary = '';
    if (state.compliance_data?.eca_zones) {
      const ecaData = state.compliance_data.eca_zones;
      if (ecaData.has_eca_zones) {
        complianceSummary = '\n\n⚖️ **REGULATORY COMPLIANCE:**\n';
        complianceSummary += `ECA Zones Crossed: ${ecaData.eca_zones_crossed?.length || 0}\n`;
        complianceSummary += `Total ECA Distance: ${ecaData.total_eca_distance_nm?.toFixed(1) || 0} nm\n`;
        if (ecaData.fuel_requirements?.mgo_with_safety_margin_mt) {
          complianceSummary += `MGO Required: ${ecaData.fuel_requirements.mgo_with_safety_margin_mt} MT\n`;
        }
      }
    }
    
    // Append ROB tracking if available
    let robSummary = '';
    if (state.rob_tracking && state.rob_waypoints && state.rob_waypoints.length > 0) {
      robSummary = '\n\n### ⛽ ROB Tracking\n\n';
      if (state.rob_safety_status) {
        if (state.rob_safety_status.overall_safe) {
          robSummary += '✅ **Safe Voyage**: Sufficient fuel throughout journey\n';
          robSummary += `• Minimum safety margin: ${state.rob_safety_status.minimum_rob_days?.toFixed(1) || 'N/A'} days\n`;
        } else {
          robSummary += '⚠️ **WARNING**: Safety concerns detected\n';
          state.rob_safety_status.violations?.forEach((v) => {
            robSummary += `• ${v}\n`;
          });
        }
      }
    }
    
    return narrative + complianceSummary + robSummary;
  }
  
  // Strategy 2: Basic bunker summary (fallback - no synthesis)
  if (state.bunker_analysis?.best_option) {
    console.log('ℹ️ [LEGACY-OUTPUT] Using basic bunker summary (no synthesis)');
    const best = state.bunker_analysis.best_option;
    const parts: string[] = [];
    
    parts.push(`🏆 **Recommended Bunker Port**: ${best.port_name} (${best.port_code})\n`);
    const totalCost = best.total_cost_usd || 0;
    parts.push(`**Total Cost**: $${totalCost.toLocaleString()}`);
    
    if (state.route_data) {
      const origin = (state.route_data.origin_port_name ?? state.route_data.origin_port_code) || 'Origin';
      const dest = (state.route_data.destination_port_name ?? state.route_data.destination_port_code) || 'Destination';
      parts.push(`\n📍 **Route**: ${origin} → ${dest}`);
      parts.push(`**Distance**: ${state.route_data.distance_nm.toFixed(0)} nm\n`);
    }
    
    if (state.multi_bunker_plan?.required) {
      parts.push('\n⚠️ Multi-port bunkering required due to vessel capacity constraints.');
      parts.push('See detailed plan above.\n');
    }
    
    return parts.join('\n');
  }
  
  // Strategy 2.5: Vessel info response (fleet count/list from vessel_info_agent)
  if (state.vessel_specs && Array.isArray(state.vessel_specs) && state.vessel_specs.length > 0) {
    console.log('ℹ️ [LEGACY-OUTPUT] Using vessel info summary');
    const vessels = state.vessel_specs;
    const count = vessels.length;

    // Group by type if available
    const byType: Record<string, number> = {};
    vessels.forEach((v: { vessel_type?: string; type?: string }) => {
      const t = (v.vessel_type ?? v.type ?? 'Unknown').toUpperCase();
      byType[t] = (byType[t] ?? 0) + 1;
    });

    let output = `🚢 **Fleet Summary**\n\n`;
    output += `**Total vessels:** ${count}\n\n`;
    if (Object.keys(byType).length > 0) {
      output += `**By type:**\n`;
      Object.entries(byType)
        .sort(([, a], [, b]) => b - a)
        .forEach(([type, n]) => {
          output += `• ${type}: ${n} vessel${n !== 1 ? 's' : ''}\n`;
        });
    }

    // Show sample if few vessels
    if (count <= 10) {
      output += `\n**Vessels:**\n`;
      vessels.slice(0, 10).forEach((v: { vessel_name?: string; name?: string; imo?: string; vessel_type?: string }) => {
        const name = v.vessel_name ?? v.name ?? 'Unknown';
        const imo = v.imo ? ` (IMO ${v.imo})` : '';
        const type = v.vessel_type ? ` - ${v.vessel_type}` : '';
        output += `• ${name}${imo}${type}\n`;
      });
    }

    return output;
  }

  // Strategy 3: Route-only response
  if (state.route_data) {
    console.log('ℹ️ [LEGACY-OUTPUT] Using route-only summary');
    const origin = (state.route_data.origin_port_name ?? state.route_data.origin_port_code) || 'Origin';
    const dest = (state.route_data.destination_port_name ?? state.route_data.destination_port_code) || 'Destination';
    const hours = state.route_data.estimated_hours || 0;
    return `📍 Route calculated: ${origin} → ${dest}\n` +
           `Distance: ${state.route_data.distance_nm.toFixed(0)} nautical miles\n` +
           `Estimated duration: ${Math.floor(hours / 24)}d ${Math.floor(hours % 24)}h`;
  }
  
  // Strategy 4: Generic completion message
  console.warn('⚠️ [LEGACY-OUTPUT] No synthesis or bunker data - using generic message');
  return 'Analysis completed. Please check the structured response for details.';
}

/**
 * Vessel Selection Agent Node
 *
 * Compares vessels for voyage planning, projects ROB at voyage end,
 * checks feasibility, calculates bunker requirements per vessel,
 * and ranks vessels by cost.
 *
 * Deterministic workflow - uses VesselService, BunkerService.
 * No LLM tool-calling.
 */
export async function vesselSelectionAgentNode(
  state: MultiAgentState
): Promise<Partial<MultiAgentState>> {
  const cid = extractCorrelationId(state);
  logAgentExecution('vessel_selection_agent', cid, 0, 'started', {
    input: summarizeInputForLog(state),
  });

  console.log('\n🚢 [VESSEL-SELECTION-AGENT] Starting vessel comparison analysis...');
  const startTime = Date.now();

  const vesselCount = state.vessel_names?.length ?? 0;
  const voyageDetails = state.next_voyage_details;
  console.log(`🚢 [VESSEL-SELECTION-AGENT] Input: ${vesselCount} vessel(s), voyage: ${voyageDetails?.origin ?? 'N/A'} → ${voyageDetails?.destination ?? 'N/A'}`);

  try {
    // ========================================================================
    // Validate inputs
    // ========================================================================

    if (!state.vessel_names || state.vessel_names.length === 0) {
      console.error('❌ [VESSEL-SELECTION-AGENT] Missing vessel_names array - cannot compare vessels');
      const duration = Date.now() - startTime;
      logVesselSelectionError({
        correlation_id: cid,
        error_type: 'invalid_input',
        error_message: 'Vessel names are required for vessel comparison. Please specify vessels to compare.',
      });
      recordAgentExecution('vessel_selection_agent', duration, false);
      logAgentExecution('vessel_selection_agent', cid, duration, 'failed', {});
      return {
        agent_status: {
          ...(state.agent_status || {}),
          vessel_selection_agent: 'failed',
        },
        agent_errors: {
          ...(state.agent_errors || {}),
          vessel_selection_agent: {
            error: 'Vessel names are required for vessel comparison. Please specify vessels to compare.',
            timestamp: Date.now(),
          },
        },
        messages: [
          ...state.messages,
          new AIMessage({
            content: 'Error: Vessel names are required for vessel comparison. Please specify vessels to compare.',
          }),
        ],
      };
    }

    if (!state.next_voyage_details || !state.next_voyage_details.origin || !state.next_voyage_details.destination) {
      console.error('❌ [VESSEL-SELECTION-AGENT] Missing next_voyage_details (origin, destination)');
      const duration = Date.now() - startTime;
      logVesselSelectionError({
        correlation_id: cid,
        error_type: 'invalid_input',
        error_message: 'Next voyage details (origin and destination) are required for vessel comparison.',
      });
      recordAgentExecution('vessel_selection_agent', duration, false);
      logAgentExecution('vessel_selection_agent', cid, duration, 'failed', {});
      return {
        agent_status: {
          ...(state.agent_status || {}),
          vessel_selection_agent: 'failed',
        },
        agent_errors: {
          ...(state.agent_errors || {}),
          vessel_selection_agent: {
            error: 'Next voyage details (origin and destination) are required for vessel comparison.',
            timestamp: Date.now(),
          },
        },
        messages: [
          ...state.messages,
          new AIMessage({
            content: 'Error: Next voyage details (origin and destination) are required for vessel comparison.',
          }),
        ],
      };
    }

    console.log('✅ [VESSEL-SELECTION-AGENT] Prerequisites met: vessel_names and next_voyage_details');

    // ========================================================================
    // Step 2: Parallel vessel analysis
    // ========================================================================

    const nextVoyage = {
      origin: state.next_voyage_details.origin,
      destination: state.next_voyage_details.destination,
      departure_date: state.next_voyage_details.departure_date,
      speed: state.next_voyage_details.speed,
    };

    const analysisStart = Date.now();
    const analysisResults = await Promise.allSettled(
      state.vessel_names.map((vesselName) =>
        (async () => {
          const start = Date.now();
          const result = await VesselSelectionEngine.analyzeVessel({
            vessel_name: vesselName,
            next_voyage: nextVoyage,
            route_data: state.route_data ?? undefined,
            bunker_analysis: state.bunker_analysis ?? undefined,
          });
          return { result, duration_ms: Date.now() - start };
        })()
      )
    );
    const analysisDuration = Date.now() - analysisStart;
    logVesselSelectionStep('analysis', analysisDuration);

    const analyses: import('@/lib/types/vessel-selection').VesselAnalysisResult[] = [];
    const defaultProfile = getDefaultVesselProfile();

    for (let i = 0; i < analysisResults.length; i++) {
      const settled = analysisResults[i];
      const vesselName = state.vessel_names[i];

      if (settled.status === 'fulfilled') {
        const { result, duration_ms } = settled.value;
        analyses.push(result);
        logVesselAnalysis({
          correlation_id: cid,
          vessel_name: vesselName,
          duration_ms,
          can_proceed_without_bunker: result.can_proceed_without_bunker,
          total_voyage_cost: result.total_voyage_cost,
          feasibility_score: result.feasibility_score,
          success: true,
        });
        console.log(`✅ [VESSEL-SELECTION-AGENT] Analyzed ${vesselName}: cost=$${result.total_voyage_cost.toFixed(0)}, can_proceed=${result.can_proceed_without_bunker}`);
      } else {
        const errMsg = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
        console.error(`❌ [VESSEL-SELECTION-AGENT] Failed to analyze ${vesselName}:`, errMsg);
        logVesselSelectionError({
          correlation_id: cid,
          error_type: 'failed_analysis',
          vessel_name: vesselName,
          error_message: errMsg,
        });
        analyses.push({
          vessel_name: vesselName,
          vessel_profile: defaultProfile,
          current_voyage_end_port: nextVoyage.origin,
          current_voyage_end_eta: new Date(),
          projected_rob_at_start: defaultProfile.initial_rob,
          next_voyage_requirements: { VLSFO: 0, LSMGO: 0 },
          can_proceed_without_bunker: false,
          total_voyage_cost: Number.POSITIVE_INFINITY,
          cost_breakdown: {
            base_fuel_cost: 0,
            bunker_fuel_cost: 0,
            bunker_port_fees: 0,
            deviation_cost: 0,
            time_cost: 0,
            total_cost: Number.POSITIVE_INFINITY,
          },
          feasibility_score: 0,
          risks: [`Analysis failed: ${errMsg}`],
        });
        logVesselAnalysis({
          correlation_id: cid,
          vessel_name: vesselName,
          duration_ms: 0,
          can_proceed_without_bunker: false,
          total_voyage_cost: Number.POSITIVE_INFINITY,
          feasibility_score: 0,
          success: false,
        });
      }
    }

    if (analyses.length === 0) {
      throw new Error('No vessel analyses completed successfully');
    }

    // ========================================================================
    // Step 3: Rank & compare
    // ========================================================================

    const rankStart = Date.now();
    const rankings = VesselSelectionEngine.rankVessels(analyses);
    const comparisonMatrix = VesselSelectionEngine.generateComparisonMatrix(analyses);
    const recommendedVessel = rankings[0]?.vessel_name ?? state.vessel_names[0];
    logVesselSelectionStep('ranking', Date.now() - rankStart);

    const costs = analyses.map((a) => a.total_voyage_cost).filter((c) => Number.isFinite(c) && c < Number.POSITIVE_INFINITY);
    const costSavingsUsd = costs.length >= 2 ? Math.max(...costs) - Math.min(...costs) : 0;

    const duration = Date.now() - startTime;
    logVesselComparison({
      correlation_id: cid,
      vessel_count: analyses.length,
      recommended_vessel: recommendedVessel,
      total_execution_time_ms: duration,
      origin: nextVoyage.origin,
      destination: nextVoyage.destination,
      cost_savings_usd: costSavingsUsd > 0 ? costSavingsUsd : undefined,
    });

    const topRanking = rankings[0];
    if (topRanking) {
      const topAnalysis = analyses.find((a) => a.vessel_name === topRanking.vessel_name);
      logVesselRecommendation({
        correlation_id: cid,
        vessel_name: topRanking.vessel_name,
        rank: topRanking.rank,
        score: topRanking.score,
        recommendation_reason: topRanking.recommendation_reason,
        total_cost_usd: topAnalysis?.total_voyage_cost,
      });
    }

    console.log(`📊 [VESSEL-SELECTION-AGENT] Ranked ${rankings.length} vessel(s). Recommended: ${recommendedVessel}`);

    // ========================================================================
    // Step 4: Build state updates
    // ========================================================================

    const perVesselBunkerPlans: Record<string, unknown> = {};
    const vesselFeasibilityMatrix: Record<string, 'feasible' | 'marginal' | 'infeasible'> = {};

    for (const a of analyses) {
      if (a.bunker_plan) {
        perVesselBunkerPlans[a.vessel_name] = a.bunker_plan;
      }
      vesselFeasibilityMatrix[a.vessel_name] =
        a.feasibility_score >= 80 ? 'feasible' : a.feasibility_score >= 50 ? 'marginal' : 'infeasible';
    }

    const vesselRankingsForState = rankings.map((r) => {
      const analysis = analyses.find((a) => a.vessel_name === r.vessel_name);
      return {
        rank: r.rank,
        vessel_name: r.vessel_name,
        score: r.score,
        recommendation_reason: r.recommendation_reason,
        total_cost_usd: analysis?.total_voyage_cost ?? 0,
        feasibility: vesselFeasibilityMatrix[r.vessel_name] ?? 'infeasible',
      };
    });

    const analysisSummary = `Compared ${analyses.length} vessel(s). Recommended: ${recommendedVessel} (${rankings[0]?.recommendation_reason ?? 'best cost/feasibility'}).`;

    console.log(`📊 [VESSEL-SELECTION-AGENT] Analysis complete: ${vesselRankingsForState.length} vessel(s) ranked`);
    recordAgentTime('vessel_selection_agent', duration);
    recordAgentExecution('vessel_selection_agent', duration, true);
    logAgentExecution('vessel_selection_agent', cid, duration, 'success', {});

    const messageContent = {
      type: 'vessel_selection_complete',
      vessels_analyzed: analyses.length,
      recommended_vessel: recommendedVessel,
      rankings_count: vesselRankingsForState.length,
      analysis_summary: analysisSummary,
      comparison_matrix: comparisonMatrix,
      top_3: vesselRankingsForState.slice(0, 3).map((r) => ({
        rank: r.rank,
        vessel: r.vessel_name,
        reason: r.recommendation_reason,
      })),
    };

    const vesselComparisonAnalysisForState = analyses.map((a) => ({
      vessel_name: a.vessel_name,
      projected_rob: a.projected_rob_at_start,
      bunker_plan: a.bunker_plan,
      total_cost_usd: a.total_voyage_cost,
      feasibility: vesselFeasibilityMatrix[a.vessel_name],
      planning_data: a,
    }));

    const vesselComparisonAnalysisAggregate = {
      vessels_analyzed: vesselComparisonAnalysisForState,
      rankings: vesselRankingsForState,
      recommended_vessel: recommendedVessel,
      analysis_summary: analysisSummary,
      comparison_matrix: comparisonMatrix,
    };

    return {
      vessel_comparison_analysis: vesselComparisonAnalysisAggregate,
      vessel_rankings: vesselRankingsForState,
      recommended_vessel: recommendedVessel,
      per_vessel_bunker_plans: Object.keys(perVesselBunkerPlans).length > 0 ? perVesselBunkerPlans : undefined,
      vessel_feasibility_matrix: vesselFeasibilityMatrix,
      next_agent: 'finalize',
      agent_status: {
        ...(state.agent_status || {}),
        vessel_selection_agent: 'success',
      },
      messages: [
        ...state.messages,
        new AIMessage({
          content: JSON.stringify(messageContent),
        }),
      ],
    };
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logError(extractCorrelationId(state), err, { agent: 'vessel_selection_agent' });
    console.error(`❌ [VESSEL-SELECTION-AGENT] Error after ${duration}ms:`, err.message);

    recordAgentExecution('vessel_selection_agent', duration, false);
    logAgentExecution('vessel_selection_agent', cid, duration, 'failed', {});

    return {
      next_agent: 'finalize',
      agent_status: {
        ...(state.agent_status || {}),
        vessel_selection_agent: 'failed',
      },
      agent_errors: {
        ...(state.agent_errors || {}),
        vessel_selection_agent: {
          error: err.message,
          timestamp: Date.now(),
        },
      },
      messages: [
        ...state.messages,
        new AIMessage({
          content: `Vessel selection workflow encountered an error: ${err.message}. The system will continue with available data.`,
        }),
      ],
    };
  }
}

/**
 * Derive view_config from routing_metadata.matched_intent for frontend map hints.
 */
function deriveViewConfig(matchedIntent: string | undefined): ViewConfig {
  if (!matchedIntent) return { show_map: false };
  const intent = matchedIntent.toLowerCase();
  if (
    intent.includes('route_calculation') ||
    intent.includes('route_analysis') ||
    intent.includes('route') ||
    intent === 'route_only'
  ) {
    return { show_map: true, map_type: 'route' };
  }
  if (
    intent.includes('bunker') ||
    intent.includes('bunker_planning') ||
    intent.includes('bunker_requirements')
  ) {
    return { show_map: true, map_type: 'bunker_ports' };
  }
  if (
    intent.includes('port_weather') ||
    intent.includes('route_weather') ||
    intent.includes('weather')
  ) {
    return { show_map: true, map_type: 'weather' };
  }
  return { show_map: false };
}

/**
 * LLM synthesizes response when no UI component is available.
 * The LLM decides how to present the results (tables, lists, sections) based on the data and query.
 */
async function synthesizeTextOnlyResponse(
  state: MultiAgentState,
  llmConfig?: { model: string; temperature: number; max_tokens: number }
): Promise<string> {
  const modelName = llmConfig?.model || 'claude-sonnet-4-5';
  const temperature = llmConfig?.temperature ?? 0.3;
  const maxTokens = llmConfig?.max_tokens ?? 4000;

  const llm = new ChatAnthropic({
    model: modelName,
    temperature,
    maxTokens,
  });

  const relevantData = extractRelevantStateData(state);
  const firstMsg = state.messages?.[0];
  const userQuery = firstMsg?.content?.toString?.() ?? 'Unknown query';
  const queryType = state.routing_metadata?.matched_intent ?? 'general';

  const prompt = `You are assisting a maritime professional. They asked a question and our system has the answer data, but there is no dedicated UI component for this type of result. Your job is to decide how best to present the available data so the user gets a clear, useful answer.

**User's query:** "${userQuery}"

**Query type / intent:** ${queryType}

**Available data from agents (use whatever is present and relevant):**
\`\`\`json
${JSON.stringify(relevantData, null, 2)}
\`\`\`

**Instructions:**
- Decide the best way to present the results based on the data type and the query. For example:
  - Vessel list or fleet data → present as a clear list or markdown table (name, IMO, type, etc. as appropriate).
  - Hull performance or metrics → use short sections, bullet points, or a small table.
  - Weather, route, bunker, or compliance data → use sections and bullet points or tables as fits the content.
- Include all relevant information from the data; do not omit important fields.
- Use markdown: headers, **bold**, bullet points, or tables so the response is easy to scan.
- Be professional and concise. If the data is empty or missing for the query, say so briefly and suggest what the user could try next.
- Do not invent data; only present what is in the available data.`;

  try {
    const response = await llm.invoke([new HumanMessage({ content: prompt })]);
    return (response.content as string) || '';
  } catch (error) {
    console.error('[FINALIZE] LLM synthesis failed:', error);
    return `I've processed your request, but encountered an issue generating the response. Please try again.`;
  }
}

/**
 * Generate contextual text to introduce components
 */
async function generateContextualText(
  state: MultiAgentState,
  components: MatchedComponent[],
  queryType: string
): Promise<string> {
  const llm = LLMFactory.getLLMForAgent('finalize');

  const componentDescriptions = components
    .map((c) => `- ${c.component} (tier ${c.tier}): Visualizes ${c.id}`)
    .join('\n');

  const prompt = `The user will see these interactive visualizations:

${componentDescriptions}

Write 2-3 sentences introducing the results and highlighting 1-2 key insights. Don't describe what's IN the components - the user will see that. Just provide context.

Query type: ${queryType}

Keep it professional and concise. Use markdown formatting.`;

  try {
    const response = await llm.invoke([new HumanMessage({ content: prompt })]);
    return (response.content as string) || 'Here are the results for your query:';
  } catch (error) {
    console.error('[FINALIZE] Contextual text generation failed:', error);
    return 'Here are the results for your query:';
  }
}

/**
 * Extract relevant state data for LLM synthesis when no UI component is available.
 * Includes all result-bearing fields so the LLM can decide how to present them.
 */
function extractRelevantStateData(state: MultiAgentState): Record<string, unknown> {
  const relevant: Record<string, unknown> = {};

  const fieldsToExtract = [
    'route_data',
    'bunker_analysis',
    'weather_forecast',
    'weather_consumption',
    'eca_segments',
    'compliance_data',
    'vessel_consumption',
    'vessel_specs',
    'hull_performance',
    'hull_performance_charts',
    'standalone_port_weather',
    'port_prices',
    'final_recommendation',
    'agent_errors',
  ];

  for (const field of fieldsToExtract) {
    const value = state[field as keyof MultiAgentState];
    if (value !== undefined && value !== null) {
      relevant[field] = value;
    }
  }

  return relevant;
}

export async function finalizeNode(state: MultiAgentState) {
  const cid = extractCorrelationId(state);
  logAgentExecution('finalize', cid, 0, 'started', { input: summarizeInputForLog(state) });

  console.log('📝 [FINALIZE] Node: Starting finalization...');

  // Log routing metadata if available
  if (state.routing_metadata) {
    console.log('📋 [FINALIZE] Routing metadata available:', {
      method: state.routing_metadata.classification_method,
      agent: state.routing_metadata.target_agent,
      intent: state.routing_metadata.matched_intent,
      confidence: state.routing_metadata.confidence,
    });
  }

  const agentStartTime = Date.now();
  
  // ========================================================================
  // Degradation Detection and Communication
  // ========================================================================
  const isDegraded = state.degraded_mode || false;
  const missingData = state.missing_data || [];
  
  if (isDegraded) {
    console.log(`⚠️ [FINALIZE] System operating in degraded mode. Missing data: ${missingData.join(', ')}`);
    logError(cid, new Error('[DEGRADATION] Finalizing with degraded mode'), {
      agent: 'finalize',
      degraded_mode: true,
      missing_data: missingData,
    });
  }
  
  // ========================================================================
  // AGENTIC MODE: Handle Clarification Requests
  // ========================================================================
  
  if (state.needs_clarification && state.clarification_question) {
    console.log('❓ [FINALIZE] Generating clarification response');
    
    const clarificationResponse = generateClarificationResponse(state);
    
    const duration = Date.now() - agentStartTime;
    recordAgentTime('finalize', duration);
    recordAgentExecution('finalize', duration, true);
    logAgentExecution('finalize', extractCorrelationId(state), duration, 'success', {});

    return {
      final_recommendation: clarificationResponse,
      formatted_response: null,
      synthesized_insights: null,
      messages: [new AIMessage({ content: clarificationResponse })],
      needs_clarification: false, // Reset after handling
      clarification_question: null,
      agent_status: {
        ...(state.agent_status || {}),
        finalize: 'success',
      },
    };
  }
  
  // ========================================================================
  // AGENTIC MODE: Include Reasoning Chain in Response (if available)
  // ========================================================================
  
  if (state.reasoning_history && state.reasoning_history.length > 0) {
    console.log(`🧠 [FINALIZE] Reasoning chain available: ${state.reasoning_history.length} steps`);
    // Reasoning chain will be included in synthesis/formatting
  }
  
  try {
  // ========================================================================
  // HULL PERFORMANCE - Format hull analysis and chart data
  // ========================================================================

  if (state.hull_performance) {
    console.log('🛥️ [FINALIZE] Hull performance response');

    const hp = state.hull_performance as {
      vessel?: { imo: string; name: string };
      hull_condition?: string;
      condition_indicator?: string;
      condition_message?: string;
      latest_metrics?: Record<string, unknown>;
      trend_data?: Array<{
        date: string;
        excess_power_pct: number;
        speed_loss_pct: number;
        excess_fuel_mtd: number;
        consumption: number;
        predicted_consumption: number;
        speed: number;
        loading_condition: string;
      }>;
      baseline_curves?: {
        laden: Array<{ speed: number; consumption: number; power: number }>;
        ballast: Array<{ speed: number; consumption: number; power: number }>;
      };
      analysis_period?: { days: number; start_date: string; end_date: string; total_records: number };
      metadata?: { fetched_at: string; data_source: string; cache_hit: boolean };
    };

    // Chart data is already prepared by hull_performance_agent using modular chart services
    // No need to prepare charts here - just use state.hull_performance_charts

    const lm = hp.latest_metrics ?? {};
    const period = hp.analysis_period ?? { days: 0, start_date: '', end_date: '', total_records: 0 };
    const vesselLabel = hp.vessel ? `${hp.vessel.name || 'Vessel'} (IMO ${hp.vessel.imo || '—'})` : 'Vessel';

    const hullPerformanceResponse = `
## Hull Performance Analysis – ${vesselLabel}

${hp.condition_indicator ?? '🟢'} **Condition:** ${hp.hull_condition ?? '—'}  
${hp.condition_message ?? ''}

### Latest metrics (${typeof lm.report_date === 'string' ? lm.report_date : 'latest'})
| Metric | Value |
|--------|--------|
| Excess power | ${Number(lm.excess_power_pct ?? 0).toFixed(1)}% |
| Speed loss | ${Number(lm.speed_loss_pct ?? 0).toFixed(1)}% |
| Excess fuel (pct) | ${Number(lm.excess_fuel_consumption_pct ?? 0).toFixed(1)}% |
| Excess fuel (MTD) | ${Number(lm.excess_fuel_consumption_mtd ?? 0).toFixed(1)} |
| Actual consumption | ${Number(lm.actual_consumption ?? 0).toFixed(1)} MT/day |
| Predicted consumption | ${Number(lm.predicted_consumption ?? 0).toFixed(1)} MT/day |
| Actual speed | ${Number(lm.actual_speed ?? 0).toFixed(1)} kts |

### Analysis period
${period.days} days (${period.start_date} to ${period.end_date}) · ${period.total_records} records  
*Source: ${hp.metadata?.data_source ?? 'api'}${hp.metadata?.cache_hit ? ' (cached)' : ''}*

---
*Hull performance data from Hull Performance Engine. Chart data is available in the response payload for visualization.*
    `.trim();

    const agentDuration = Date.now() - agentStartTime;
    recordAgentTime('finalize', agentDuration);
    recordAgentExecution('finalize', agentDuration, true);
    logAgentExecution('finalize', extractCorrelationId(state), agentDuration, 'success', {});

    return {
      hull_performance_charts: state.hull_performance_charts ?? undefined,
      final_recommendation: sanitizeMarkdownForDisplay(hullPerformanceResponse),
      formatted_response: null,
      synthesized_insights: null,
      messages: [new AIMessage({ content: hullPerformanceResponse })],
      agent_status: {
        ...(state.agent_status || {}),
        finalize: 'success',
      },
    };
  }

  // ========================================================================
  // HULL UNAVAILABLE (circuit breaker) - show error instead of Phase 2 boilerplate
  // ========================================================================
  if (
    state.original_intent === 'hull_analysis' &&
    state.agent_context?.finalize?.error_type === 'hull_unavailable'
  ) {
    console.log('🚢 [FINALIZE] Hull unavailable (circuit breaker), returning error message');
    const hullUnavailableMessage = `Hull performance data could not be loaded after multiple attempts. Please check that the vessel name is correct and try again. If the problem persists, the hull data source may be temporarily unavailable.`;
    const agentDuration = Date.now() - agentStartTime;
    recordAgentTime('finalize', agentDuration);
    recordAgentExecution('finalize', agentDuration, true);
    logAgentExecution('finalize', extractCorrelationId(state), agentDuration, 'success', {});
    return {
      final_recommendation: hullUnavailableMessage,
      formatted_response: null,
      synthesized_insights: null,
      messages: [new AIMessage({ content: hullUnavailableMessage })],
      agent_status: {
        ...(state.agent_status || {}),
        finalize: 'success',
      },
    };
  }

  // ========================================================================
  // VESSEL INFORMATION (Phase 1) - Entity extraction only, Phase 2 coming
  // ========================================================================
    
    if (state.vessel_identifiers && !state.route_data && !state.bunker_analysis) {
      console.log('🚢 [FINALIZE] Vessel information query (Phase 1 - entity extraction only)');
      
      const ids = state.vessel_identifiers;
      const vesselList = [...(ids.names || []), ...(ids.imos || []).map((imo) => `IMO ${imo}`)].join(', ');
      const totalCount = (ids.names?.length || 0) + (ids.imos?.length || 0);
      const vesselInfoResponse = `I've identified the vessel${totalCount > 1 ? 's' : ''} **${vesselList}** in our system.

Currently, I can confirm the vessel exists and extract its identifiers. Our **Hull Performance** and **Machinery Performance** agents—with detailed noon report analysis, consumption tracking, and performance monitoring—are coming in the next development phase (Phase 2).`;
      
      const agentDuration = Date.now() - agentStartTime;
      recordAgentTime('finalize', agentDuration);
      recordAgentExecution('finalize', agentDuration, true);
      logAgentExecution('finalize', extractCorrelationId(state), agentDuration, 'success', {});

      return {
        final_recommendation: vesselInfoResponse,
        formatted_response: null,
        synthesized_insights: null,
        messages: [new AIMessage({ content: vesselInfoResponse })],
        agent_status: {
          ...(state.agent_status || {}),
          finalize: 'success',
        },
      };
    }
    
    // ========================================================================
    // STANDALONE PORT WEATHER - Direct formatting without synthesis
    // ========================================================================
    
    if (state.standalone_port_weather && !state.route_data) {
      console.log('🌤️ [FINALIZE] Standalone port weather response');
      
      const portWeather = state.standalone_port_weather;
      const targetDate = new Date(portWeather.target_date);
      
      // Format port weather response
      const portWeatherResponse = `
## Weather Forecast for ${portWeather.port_name}

📅 **Date:** ${targetDate.toLocaleDateString('en-US', { 
  weekday: 'long', 
  year: 'numeric', 
  month: 'long', 
  day: 'numeric' 
})}

📍 **Location:** ${portWeather.port_code} (${portWeather.coordinates.lat.toFixed(2)}°N, ${portWeather.coordinates.lon.toFixed(2)}°E)

### Current Conditions

${portWeather.forecast.wave_height !== undefined ? `🌊 **Wave Height:** ${portWeather.forecast.wave_height.toFixed(1)}m` : ''}
${portWeather.forecast.wind_speed_10m !== undefined ? `💨 **Wind Speed:** ${portWeather.forecast.wind_speed_10m.toFixed(0)} knots` : ''}
${portWeather.forecast.wind_direction !== undefined ? `🧭 **Wind Direction:** ${portWeather.forecast.wind_direction}°` : ''}
${portWeather.forecast.sea_state ? `🌊 **Sea State:** ${portWeather.forecast.sea_state}` : ''}
${portWeather.forecast.conditions ? `☁️ **Conditions:** ${portWeather.forecast.conditions}` : ''}

### Port Operations Assessment

${portWeather.forecast.wave_height !== undefined && portWeather.forecast.wave_height <= 1.5 
  ? '✅ **Conditions are favorable for port operations and bunkering.**'
  : portWeather.forecast.wave_height !== undefined && portWeather.forecast.wave_height <= 2.5
  ? '⚠️ **Conditions are marginal. Exercise caution for bunkering operations.**'
  : '❌ **Conditions may be challenging for port operations. Monitor closely.**'}

${portWeather.forecast.wind_speed_10m !== undefined && portWeather.forecast.wind_speed_10m > 25 
  ? '⚠️ **High winds detected. Consider weather windows for sensitive operations.**' 
  : ''}

---
*Weather data provided by Open-Meteo Marine Weather API*
      `.trim();
      
      const agentDuration = Date.now() - agentStartTime;
      recordAgentTime('finalize', agentDuration);
      recordAgentExecution('finalize', agentDuration, true);
      logAgentExecution('finalize', extractCorrelationId(state), agentDuration, 'success', {});

      console.log('✅ [FINALIZE] Port weather response generated');
      
      return {
        final_recommendation: portWeatherResponse,
        formatted_response: null,
        synthesized_insights: null,
        messages: [new AIMessage({ content: portWeatherResponse })],
        agent_status: {
          ...(state.agent_status || {}),
          finalize: 'success',
        },
      };
    }
    
    // ========================================================================
    // COMPONENT REGISTRY: Match state to renderable components
    // ========================================================================
    
    console.log('📝 [FINALIZE] Starting finalization with Component Registry...');

    const { loadComponentRegistry } = await import('@/lib/config/component-loader');
    const { ComponentMatcherService } = await import('@/lib/services/component-matcher.service');

    const registry = loadComponentRegistry();
    const matcher = new ComponentMatcherService(registry);

    // Prefer original user intent so component selection matches what the user asked for,
    // not the last internal message (e.g. safety validator text classified as route_calculation).
    const REGISTRY_QUERY_TYPES = ['bunker_planning', 'route_calculation', 'weather_analysis', 'compliance_check', 'vessel_selection'] as const;
    const intentFromUser = state.original_intent && REGISTRY_QUERY_TYPES.includes(state.original_intent as typeof REGISTRY_QUERY_TYPES[number])
      ? state.original_intent
      : null;
    let queryType =
      intentFromUser ||
      state.synthesized_insights?.query_type ||
      state.routing_metadata?.matched_intent ||
      'unknown';
    if (queryType === 'unknown' && state.bunker_analysis?.recommendations?.length) {
      queryType = 'bunker_planning';
    }
    // State-data override: vessel comparison output takes precedence over intent (state is ground truth)
    if (state.vessel_comparison_analysis?.vessels_analyzed?.length) {
      queryType = 'vessel_selection';
    }

    console.log(`[FINALIZE] Query type: ${queryType}`);

    // Match components to state
    const matchedComponents = matcher.matchComponents(state, queryType);

    console.log(`📦 [FINALIZE] Matched ${matchedComponents.length} components:`);
    matchedComponents.forEach((comp) => {
      const status = comp.canRender ? '✅' : '❌';
      const missing = comp.missingFields ? ` (missing: ${comp.missingFields.join(', ')})` : '';
      console.log(`   ${status} ${comp.component} (tier ${comp.tier})${missing}`);
    });

    // Separate renderable components
    const renderableComponents = matchedComponents.filter((c) => c.canRender);

    let finalTextOutput: string;
    let formattedResponse: {
      type: 'text_only' | 'hybrid';
      content?: string;
      text?: string;
      components: Array<{ id: string; component: string; props: Record<string, unknown>; tier: number; priority: number }>;
      query_type: string;
      mapOverlays?: unknown;
    };

    if (renderableComponents.length === 0) {
      // ======================================================================
      // NO COMPONENTS AVAILABLE - Use LLM synthesis fallback
      // ======================================================================
      console.log('🔄 [FINALIZE] No components available, using LLM synthesis...');

      finalTextOutput = await synthesizeTextOnlyResponse(state, matcher.getFallbackLLMConfig());
      formattedResponse = {
        type: 'text_only',
        content: finalTextOutput,
        components: [],
        query_type: queryType,
      };
    } else {
      // ======================================================================
      // HAS COMPONENTS - Build hybrid response (text + components)
      // ======================================================================
      console.log(`🎨 [FINALIZE] Building hybrid response with ${renderableComponents.length} components...`);

      const BUNKER_PLANNING_DISPLAY_ORDER: Record<string, number> = {
        bunker_table: 0,
        route_map: 1,
        weather_timeline: 2,
        eca_compliance: 3,
      };
      const VESSEL_SELECTION_DISPLAY_ORDER: Record<string, number> = {
        route_map: 0,
        vessel_comparison_card: 1,
        bunker_table: 2,
        weather_timeline: 3,
        eca_compliance: 4,
      };

      const componentManifest = renderableComponents.map((comp) => {
        const display_order =
          queryType === 'bunker_planning'
            ? BUNKER_PLANNING_DISPLAY_ORDER[comp.id]
            : queryType === 'vessel_selection'
              ? VESSEL_SELECTION_DISPLAY_ORDER[comp.id]
              : undefined;
        const props =
          queryType === 'bunker_planning' && comp.id === 'bunker_table'
            ? { ...comp.props, density: 'compact' as const }
            : comp.props;
        return {
          id: comp.id,
          component: comp.component,
          props,
          tier: comp.tier,
          priority: comp.priority,
          ...(display_order != null && { display_order }),
        };
      });

      if (queryType === 'bunker_planning') {
        finalTextOutput = formatBunkerPlanningSummary(state);
      } else if (queryType === 'vessel_selection') {
        finalTextOutput = formatVesselComparisonSummary(state) || await generateContextualText(state, renderableComponents, queryType);
      } else {
        finalTextOutput = await generateContextualText(state, renderableComponents, queryType);
      }

      formattedResponse = {
        type: 'hybrid',
        text: finalTextOutput,
        components: componentManifest,
        query_type: queryType,
        mapOverlays: formatMapOverlays(state),
      };
    }

    // Add degradation warning if system is in degraded mode
    if (isDegraded && missingData.length > 0) {
      const degradationWarning =
        `\n\n⚠️ **Analysis completed with limited data**\n\n` +
        `The following data components were unavailable: ${missingData.map((d) => `\`${d}\``).join(', ')}. ` +
        `Recommendations may be less accurate than usual.\n\n` +
        `**What this means:**\n` +
        `- The system attempted to retrieve data from external APIs but encountered failures\n` +
        `- Fallback strategies were used where possible (e.g., cached routes, historical prices)\n` +
        `- Some analysis may be incomplete or based on estimated data\n\n` +
        `**Recommendations:**\n` +
        `- Please try again in a few minutes - transient API issues may resolve\n` +
        `- If the issue persists, contact support with your correlation ID: \`${cid}\`\n` +
        `- For critical decisions, verify data independently\n\n` +
        `---\n\n`;

      finalTextOutput = degradationWarning + finalTextOutput;
    }

    const sanitizedOutput = sanitizeMarkdownForDisplay(finalTextOutput);

    const agentDuration = Date.now() - agentStartTime;
    recordAgentTime('finalize', agentDuration);
    recordAgentExecution('finalize', agentDuration, true);
    logAgentExecution('finalize', extractCorrelationId(state), agentDuration, 'success', {});

    console.log('✅ [FINALIZE] Node: Final recommendation generated');

    return {
      final_recommendation: sanitizedOutput,
      formatted_response: formattedResponse,
      synthesized_insights: state.synthesized_insights,
      messages: [new AIMessage({ content: sanitizedOutput })],
      agent_status: {
        ...(state.agent_status || {}),
        finalize: 'success',
      },
    };
    
  } catch (error) {
    const agentDuration = Date.now() - agentStartTime;
    logError(extractCorrelationId(state), error, { agent: 'finalize' });
    recordAgentTime('finalize', agentDuration);
    recordAgentExecution('finalize', agentDuration, false);
    logAgentExecution('finalize', extractCorrelationId(state), agentDuration, 'failed', {});
    console.error('❌ [FINALIZE] Node error:', error);
    throw error;
  }
}

// ============================================================================
// Agent Registry Registration
// ============================================================================

// Register Route Agent
AgentRegistry.registerAgent({
  agent_name: 'route_agent',
  description: 'Calculates maritime routes between ports and generates vessel position timeline for weather analysis (deterministic workflow)',
  available_tools: [
    {
      tool_name: 'calculate_route',
      description: 'Calculate maritime route between origin and destination ports',
      when_to_use: [
        'route_data is missing from state',
        'User query includes origin and destination ports',
        'Need distance, duration, or route geometry'
      ],
      when_not_to_use: [
        'route_data already exists in state',
        'No origin or destination specified'
      ],
      prerequisites: ['origin_port', 'destination_port'],
      produces: ['route_data'],
      schema: zodSchemaToJsonSchema(routeCalculatorInputSchema)
    },
    {
      tool_name: 'calculate_weather_timeline',
      description: 'Generate vessel position timeline from route for weather analysis',
      when_to_use: [
        'route_data exists but vessel_timeline is missing',
        'Need weather data along route',
        'Need bunker planning with weather considerations'
      ],
      when_not_to_use: [
        'vessel_timeline already exists',
        'route_data is missing',
        'Query does not need weather analysis'
      ],
      prerequisites: ['route_data', 'vessel_speed'],
      produces: ['vessel_timeline'],
      schema: zodSchemaToJsonSchema(weatherTimelineInputSchema)
    }
  ],
  prerequisites: ['origin_port', 'destination_port'],
  outputs: ['route_data', 'vessel_timeline']
});

// Register Compliance Agent
AgentRegistry.registerAgent({
  agent_name: 'compliance_agent',
  description: 'Validates regulatory compliance including ECA zones, EU ETS, FuelEU Maritime, and CII ratings (deterministic workflow)',
  available_tools: [
    {
      tool_name: 'validate_eca_zones',
      description: 'Check if route crosses Emission Control Areas and calculate MGO fuel requirements for compliance',
      when_to_use: [
        'route_data exists with waypoints',
        'Need to determine ECA compliance requirements',
        'Need to calculate MGO fuel quantities',
        'Bunker planning requires compliance validation'
      ],
      when_not_to_use: [
        'route_data is missing',
        'Query does not involve maritime route planning'
      ],
      prerequisites: ['route_data'],
      produces: ['compliance_data.eca_zones'],
      schema: zodSchemaToJsonSchema(ecaZoneValidatorInputSchema)
    }
  ],
  prerequisites: ['route_data'],
  outputs: ['compliance_data'],
  is_deterministic: true,
  workflow_steps: [
    'Check route_data prerequisite',
    'Extract vessel speed and consumption',
    'Execute ECA zone validator',
    'Store compliance_data in state',
    'Generate compliance summary'
  ]
});

// Register Weather Agent
AgentRegistry.registerAgent({
  agent_name: 'weather_agent',
  description: 'Fetches marine weather forecasts, calculates weather-adjusted fuel consumption, and validates bunker port weather safety (deterministic workflow)',
  available_tools: [
    {
      tool_name: 'fetch_marine_weather',
      description: 'Fetch marine weather forecast from Open-Meteo API for vessel positions along route',
      when_to_use: [
        'weather_forecast is missing from state',
        'vessel_timeline exists with positions',
        'Need weather data for fuel consumption or safety analysis'
      ],
      when_not_to_use: [
        'weather_forecast already exists',
        'vessel_timeline is missing',
        'Query does not require weather analysis'
      ],
      prerequisites: ['vessel_timeline'],
      produces: ['weather_forecast'],
      schema: zodSchemaToJsonSchema(marineWeatherInputSchema)
    },
    {
      tool_name: 'calculate_weather_consumption',
      description: 'Calculate weather-adjusted fuel consumption based on forecast',
      when_to_use: [
        'weather_forecast exists',
        'weather_consumption is missing',
        'Need accurate fuel consumption for bunker planning'
      ],
      when_not_to_use: [
        'weather_forecast is missing',
        'weather_consumption already exists',
        'Query is only about route or basic weather'
      ],
      prerequisites: ['weather_forecast', 'vessel_consumption'],
      produces: ['weather_consumption'],
      schema: zodSchemaToJsonSchema(weatherConsumptionInputSchema)
    },
    {
      tool_name: 'check_bunker_port_weather',
      description: 'Check weather safety conditions at bunker ports',
      when_to_use: [
        'bunker_ports exist in state',
        'Need to validate port safety for bunkering operations'
      ],
      when_not_to_use: [
        'bunker_ports is missing',
        'Query does not involve bunker operations'
      ],
      prerequisites: ['bunker_ports'],
      produces: ['port_weather_status'],
      schema: zodSchemaToJsonSchema(portWeatherInputSchema)
    }
  ],
  prerequisites: ['vessel_timeline'],
  outputs: ['weather_forecast', 'weather_consumption', 'port_weather_status']
});

// Register Vessel Selection Agent
AgentRegistry.registerAgent({
  agent_name: 'vessel_selection_agent',
  description:
    'Compares vessels for voyage planning, projects ROB at voyage end, checks feasibility, ranks vessels by cost. Deterministic workflow.',
  available_tools: [],
  prerequisites: ['vessel_names', 'next_voyage_details'],
  outputs: ['vessel_comparison_analysis', 'vessel_rankings', 'recommended_vessel'],
  is_deterministic: true,
  workflow_steps: [
    'Validate vessel_names and next_voyage_details',
    'Fetch vessel specs and consumption profiles',
    'Calculate route and ROB projection per vessel',
    'Rank vessels by total cost',
  ],
});

// Register Bunker Agent (DETERMINISTIC WORKFLOW)
AgentRegistry.registerAgent({
  agent_name: 'bunker_agent',
  description: 'Deterministic workflow: Finds bunker ports along route, validates weather safety, fetches fuel prices, and analyzes optimal bunkering options with cost-benefit analysis. No LLM tool-calling - executes workflow directly.',
  is_deterministic: true,
  workflow_steps: [
    '1. Find bunker ports along route (if needed)',
    '2. Check weather safety at ports (if requested)',
    '3. Fetch fuel prices for all required fuel types',
    '4. Analyze and rank options by total cost'
  ],
  available_tools: [], // No tools - calls functions directly
  /*
  // DEPRECATED: Tools are now called directly in deterministic workflow
  available_tools: [
    {
      tool_name: 'find_bunker_ports',
      description: 'Find available bunker ports along the vessel route',
      when_to_use: [
        'bunker_ports is missing from state',
        'route_data exists',
        'Need to identify where vessel can refuel'
      ],
      when_not_to_use: [
        'bunker_ports already exists',
        'route_data is missing',
        'Query does not involve bunker planning'
      ],
      prerequisites: ['route_data'],
      produces: ['bunker_ports']
    },
    {
      tool_name: 'check_bunker_port_weather',
      description: 'Check weather safety conditions at bunker ports (SHARED with weather_agent)',
      when_to_use: [
        'bunker_ports exist in state',
        'User query mentions safe bunkering, weather safety, or bunkering conditions',
        'Need to validate port weather before final recommendation'
      ],
      when_not_to_use: [
        'bunker_ports is missing',
        'Query does not mention weather or safety',
        'port_weather_status already exists in state'
      ],
      prerequisites: ['bunker_ports', 'vessel_timeline'],
      produces: ['port_weather_status']
    },
    {
      tool_name: 'get_fuel_prices',
      description: 'Fetch current fuel prices at bunker ports',
      when_to_use: [
        'bunker_ports exist',
        'fuel_prices is missing',
        'Need pricing data for bunker analysis'
      ],
      when_not_to_use: [
        'bunker_ports is missing',
        'fuel_prices already exists'
      ],
      prerequisites: ['bunker_ports'],
      produces: ['port_prices']
    },
    {
      tool_name: 'analyze_bunker_options',
      description: 'Analyze and rank bunker options based on cost, weather, and operational factors',
      when_to_use: [
        'bunker_ports and port_prices exist',
        'bunker_analysis is missing',
        'Need recommendation on optimal bunker strategy'
      ],
      when_not_to_use: [
        'bunker_ports or port_prices is missing',
        'bunker_analysis already exists'
      ],
      prerequisites: ['bunker_ports', 'port_prices', 'weather_consumption'],
      produces: ['bunker_analysis']
    }
  ],
  */
  prerequisites: ['route_data'],
  outputs: ['bunker_ports', 'port_weather_status', 'port_prices', 'bunker_analysis']
});

// Register Hull Performance Agent (deterministic: fetches hull condition, fouling, excess power via fetch_hull_performance)
AgentRegistry.registerAgent({
  agent_name: 'hull_performance_agent',
  description:
    'Fetches hull performance analysis: hull condition, fouling, excess power %, speed loss, trends. Uses fetch_hull_performance with vessel_identifier and optional time_period. Requires vessel_identifiers from entity extractor.',
  available_tools: [
    {
      tool_name: 'fetch_hull_performance',
      description: 'Fetch hull performance metrics, condition analysis, component breakdown, and trends for a vessel',
      when_to_use: [
        'User asks about hull performance, hull condition, fouling, excess power, performance trends',
        'vessel_identifiers exist in state'
      ],
      when_not_to_use: [
        'vessel_identifiers missing (run entity_extractor first)',
        'hull_performance already in state'
      ],
      prerequisites: ['vessel_identifiers'],
      produces: ['hull_performance'],
      schema: zodSchemaToJsonSchema(fetchHullPerformanceInputSchema),
    },
  ],
  prerequisites: ['vessel_identifiers'],
  outputs: ['hull_performance'],
  is_deterministic: true,
  workflow_steps: [
    'Validate vessel_identifiers in state',
    'Determine time period from query or default 90 days',
    'Call fetch_hull_performance tool',
    'Store hull_performance in state',
  ],
});

// Register Finalize Agent (synthesizes results, always last in execution)
AgentRegistry.registerAgent({
  agent_name: 'finalize',
  description: 'Synthesizes results from all specialist agents into a comprehensive, actionable recommendation. Uses LLM for natural language generation and template-based formatting. Always the terminal node in execution flow.',
  available_tools: [],
  prerequisites: ['messages'],
  outputs: ['final_recommendation', 'formatted_response', 'synthesized_insights', 'synthesized_response'],
  is_deterministic: false,
  workflow_steps: [
    'Decoupled synthesis: extract insights and recommendations from agent outputs',
    'Template formatting: select and render response template',
    'Generate structured output for UI display'
  ]
});

// Export compliance agent node
export { complianceAgentNode };

