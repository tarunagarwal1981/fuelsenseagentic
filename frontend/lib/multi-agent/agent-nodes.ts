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
import type { MultiAgentState } from './state';
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
import { analyzeQueryIntent, generateAgentContext } from './intent-analyzer';
import { LLMFactory } from './llm-factory';
import { AgentRegistry, zodSchemaToJsonSchema } from './registry';
import { generateExecutionPlan, type SupervisorPlan } from './supervisor-planner';

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
import type { ECAConsumptionOutput, RouteSegment as ECARouteSegment } from '@/lib/engines/eca-consumption-engine';
import type { ROBTrackingOutput } from '@/lib/engines/rob-tracking-engine';
import type { ECAZoneValidatorOutput } from '@/lib/tools/eca-zone-validator';
import { planMultiPortBunker, needsMultiPortBunkering } from '@/lib/engines/multi-port-bunker-planner';
import type { MultiBunkerAnalysis } from './state';
import { formatResponse } from '../formatters/response-formatter';
import { formatResponseWithTemplate, type TemplateFormattedResponse } from '../formatters/template-aware-formatter';
import { isFeatureEnabled } from '../config/feature-flags';
import { generateSynthesis } from './synthesis/synthesis-engine';
import type { FormattedResponse } from '../formatters/response-formatter';
import type { Port } from '@/lib/types';

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

// Import weather agent tools from tools.ts
import {
  fetchMarineWeatherTool,
  createFetchMarineWeatherTool,
  calculateWeatherConsumptionTool,
  checkPortWeatherTool,
} from './tools';

// Import port lookup utility
import { extractPortsFromQuery as lookupPorts } from '@/lib/utils/port-lookup'; // Now async

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

  // Return with updated counts
  return {
    ...defaultReturn,
    agent_call_counts: updatedCounts,
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
// Agent Node Implementations
// ============================================================================

/**
 * Supervisor Agent Node
 * 
 * Decides which agent to delegate to next based on available state data.
 * Routes to: route_agent → weather_agent → bunker_agent → finalize
 * 
 * Implements graceful degradation: if an agent fails, skip to next step.
 */
export async function supervisorAgentNode(
  state: MultiAgentState
): Promise<Partial<MultiAgentState>> {
  console.log("\n🎯 [SUPERVISOR] Node: Making routing decision...");
  
  // Log current state
  console.log("📊 [SUPERVISOR] Current state:");
  console.log(`   - Route data: ${state.route_data ? '✅' : '❌'}`);
  console.log(`   - Vessel timeline: ${state.vessel_timeline ? '✅' : '❌'}`);
  console.log(`   - Weather forecast: ${state.weather_forecast ? '✅' : '❌'}`);
  console.log(`   - Weather consumption: ${state.weather_consumption ? '✅' : '❌'}`);
  console.log(`   - Port weather: ${state.port_weather_status ? '✅' : '❌'}`);
  console.log(`   - Bunker ports: ${state.bunker_ports ? '✅' : '❌'}`);
  console.log(`   - Port prices: ${state.port_prices ? '✅' : '❌'}`);
  console.log(`   - Bunker analysis: ${state.bunker_analysis ? '✅' : '❌'}`);

  // Get user query to analyze intent FIRST (before loop detection)
  const userMessage = state.messages.find((msg) => msg instanceof HumanMessage);
  const userQuery = userMessage 
    ? (typeof userMessage.content === 'string' ? userMessage.content : String(userMessage.content))
    : state.messages[0]?.content?.toString() || 'Plan bunker route';
  
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
  
  if (USE_REGISTRY_PLANNING) {
    try {
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
      console.log('✅ [SUPERVISOR] Generated execution plan:', {
        agents: executionPlan.execution_order,
        reasoning: executionPlan.reasoning.substring(0, 100),
        estimated_time: executionPlan.estimated_total_time
      });
    } catch (error) {
      console.error('❌ [SUPERVISOR] Plan generation failed, using legacy routing:', error);
      // executionPlan stays null, will use legacy routing
    }
  }
  
  // Analyze intent (needed for both paths)
  const intent = analyzeQueryIntent(userQuery);
  
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
        priority: 'critical' as const
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
        priority: 'critical' as const
      } : undefined,
      finalize: {
        complexity: intent.complexity,
        needs_weather_analysis: intent.needs_weather,
        needs_bunker_analysis: intent.needs_bunker,
      }
    };
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
      next_agent: "finalize",
      agent_context: agentContext,
      messages: [],
    };
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
      
      return applyCircuitBreaker("bunker_agent", state, {
        next_agent: "bunker_agent",
        agent_context: agentContext,
        messages: [],
      });
    } else {
      // Neither weather nor bunker needed - shouldn't happen, but finalize
      console.log("⚠️ [SUPERVISOR] Weather agent stuck but not needed - finalizing");
      const intent = analyzeQueryIntent(userQuery);
      const agentContext = generateAgentContext(intent, state);
      return {
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
      console.log('🎯 [SUPERVISOR] Weather partial, bunker needed → bunker_agent');
      return applyCircuitBreaker("bunker_agent", state, {
        next_agent: "bunker_agent",
        agent_context: agentContext,
        messages: [],
      });
    } else {
      console.log('🎯 [SUPERVISOR] Weather partial, all requested work done → finalize');
      return {
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
      
      const agentDone = routeAgentDone || complianceAgentDone || weatherAgentDone || bunkerAgentDone;
      
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
        return {
          next_agent: agentName,
          agent_context: agentContext,
          messages: [],
        };
      }
    }
    
    // All agents in plan are done, finalize
    console.log('🎯 [SUPERVISOR] Execution plan complete → finalize');
    return {
      next_agent: "finalize",
      agent_context: agentContext,
      messages: [],
    };
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
        next_agent: "finalize",
        agent_context: agentContext,
        messages: [],
      };
    }
    
    console.log('🎯 [SUPERVISOR] Decision: Route needed but missing → route_agent (prerequisites validated)');
    return applyCircuitBreaker("route_agent", state, {
      next_agent: "route_agent",
      agent_context: agentContext,
      messages: [],
    });
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
          console.log('🎯 [SUPERVISOR] Decision: Skip failed weather, go to bunker');
          return applyCircuitBreaker("bunker_agent", state, {
            next_agent: 'bunker_agent',
            agent_context: agentContext,
            messages: [],
          });
        } else {
          console.log('🎯 [SUPERVISOR] Decision: Skip failed weather, finalize with partial data');
          return {
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
        return applyCircuitBreaker("weather_agent", state, {
          next_agent: "weather_agent",
          agent_context: agentContext,
          messages: [],
        });
      }
    }
    
    // Priority 2: Weather forecast is complete - check if we need consumption or can finalize
    if (needsWeather && state.weather_forecast) {
      // If only weather was requested (no bunker), we're done - finalize
      if (!needsBunker) {
        console.log('🎯 [SUPERVISOR] Decision: Weather forecast complete, no bunker needed → finalize');
        return {
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
          // Skip weather consumption, go directly to bunker
          return {
            next_agent: 'bunker_agent',
            agent_context: agentContext,
            messages: [],
          };
        }
        
        // Consumption is needed for bunker planning
        console.log('🎯 [SUPERVISOR] Decision: Weather forecast complete, consumption needed for bunker → weather_agent');
        return applyCircuitBreaker("weather_agent", state, {
          next_agent: "weather_agent",
          agent_context: agentContext,
          messages: [],
        });
      }
      
      // Weather and consumption complete, bunker needed
      if (needsBunker && state.weather_consumption && !state.bunker_analysis) {
        // Check if bunker_agent has failed
        if (state.agent_status?.bunker_agent === 'failed') {
          console.warn('⚠️ [SUPERVISOR] Bunker agent failed, finalizing with available data');
          return {
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
          console.log('🎯 [SUPERVISOR] Decision: Weather complete, bunker needed → bunker_agent (prerequisites validated)');
          return applyCircuitBreaker("bunker_agent", state, {
            next_agent: "bunker_agent",
            agent_context: agentContext,
            messages: [],
          });
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
          console.log('🎯 [SUPERVISOR] Decision: Bunker needed and not done → bunker_agent (prerequisites validated)');
          return applyCircuitBreaker("bunker_agent", state, {
            next_agent: "bunker_agent",
            agent_context: agentContext,
            messages: [],
          });
        }
      }
    }
    
    // Priority 4: Check if all requested work is complete
    // For simple weather queries, weather_forecast is enough (no consumption needed)
    // For bunker queries, we need both weather_forecast and weather_consumption
    const weatherComplete = !needsWeather || 
      (needsBunker ? (state.weather_forecast && state.weather_consumption) : state.weather_forecast);
    const bunkerComplete = !needsBunker || state.bunker_analysis;
    
    if (weatherComplete && bunkerComplete) {
      console.log('🎯 [SUPERVISOR] Decision: All requested work complete → finalize');
      return {
        next_agent: "finalize",
        agent_context: agentContext,
        messages: [],
      };
    }
    
    // If we reach here, route exists but something is still needed
    // This shouldn't happen, but if it does, finalize with what we have
    console.log('🎯 [SUPERVISOR] Decision: Route complete, finalizing with available data');
    return {
      next_agent: "finalize",
      agent_context: agentContext,
      messages: [],
    };
  }
  
  // 4. Ultimate fallback: Get route (but check if route_agent has failed)
  if (state.agent_status?.route_agent === 'failed') {
    console.log('⚠️ [SUPERVISOR] Fallback: Route agent has failed - finalizing with error');
    return {
      next_agent: "finalize",
      agent_context: agentContext,
      messages: [],
    };
  }
  console.log('🎯 [SUPERVISOR] Decision: Fallback → route_agent');
  return applyCircuitBreaker("route_agent", state, {
    next_agent: "route_agent",
    agent_context: agentContext,
    messages: [],
  });
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
 * Extract ports from query using database lookup with LLM fallback for complex queries
 * Fast, free, and accurate - searches port database, uses LLM for complex queries
 * 
 * IMPORTANT: No silent defaults - throws clear error if ports cannot be identified
 */
async function extractPortsFromQuery(query: string): Promise<{ origin: string; destination: string }> {
  const { origin, destination } = await lookupPorts(query);
  
  // If both ports found, return them
  if (origin && destination) {
    console.log(`✅ [PORT-EXTRACTION] Success: ${origin} → ${destination}`);
    return { origin, destination };
  }
  
  // If one port is missing, throw error with helpful message
  if (!origin && destination) {
    const errorMsg = `Could not identify origin port from query: "${query}". Destination found: ${destination}. Please specify origin port code (e.g., "from JPCHB to ${destination}" or use a port name like "from Singapore to ${destination}"). Common port codes: SGSIN (Singapore), NLRTM (Rotterdam), AEJEA (Jebel Ali), AEFJR (Fujairah), JPCHB (Chiba).`;
    console.error(`❌ [PORT-EXTRACTION] ${errorMsg}`);
    throw new Error(errorMsg);
  }
  
  if (origin && !destination) {
    const errorMsg = `Could not identify destination port from query: "${query}". Origin found: ${origin}. Please specify destination port code (e.g., "from ${origin} to SGSIN" or use a port name like "${origin} to Singapore"). Common port codes: SGSIN (Singapore), NLRTM (Rotterdam), AEJEA (Jebel Ali), AEFJR (Fujairah), JPCHB (Chiba).`;
    console.error(`❌ [PORT-EXTRACTION] ${errorMsg}`);
    throw new Error(errorMsg);
  }
  
  // Both missing - provide helpful error
  const errorMsg = `Could not identify origin or destination ports from query: "${query}". Please use format: "from [ORIGIN] to [DESTINATION]" or specify port codes like "SGSIN to NLRTM". Common ports: SGSIN (Singapore), NLRTM (Rotterdam), AEJEA (Jebel Ali), AEFJR (Fujairah), JPCHB (Chiba), CNSHA (Shanghai), HKHKG (Hong Kong).`;
  console.error(`❌ [PORT-EXTRACTION] ${errorMsg}`);
  throw new Error(errorMsg);
}

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
 */
function extractFuelRequirements(message: string): {
  fuel_types: string[];
  quantities: { [key: string]: number };
  total_quantity: number;
} {
  const fuelTypes: string[] = [];
  const quantities: { [key: string]: number } = {};
  let totalQuantity = 0;
  
  // Enhanced patterns to match Query 15 complexity
  const fuelPatterns = [
    { type: 'VLSFO', regex: /(\d+)\s*MT\s*VLSFO/i },
    { type: 'LSGO', regex: /(\d+)\s*MT\s*LSGO/i },
    { type: 'MGO', regex: /(\d+)\s*MT\s*MGO/i },
    { type: 'HSFO', regex: /(\d+)\s*MT\s*HSFO/i },
    // Also match "35 MT/day VLSFO" consumption patterns
    { type: 'VLSFO', regex: /(\d+)\s*MT\/day\s*VLSFO/i },
    { type: 'LSGO', regex: /(\d+)\s*MT\/day\s*LSGO/i },
  ];
  
  for (const pattern of fuelPatterns) {
    const match = message.match(pattern.regex);
    if (match) {
      const quantity = parseInt(match[1]);
      if (!fuelTypes.includes(pattern.type)) {
        fuelTypes.push(pattern.type);
      }
      quantities[pattern.type] = (quantities[pattern.type] || 0) + quantity;
      totalQuantity += quantity;
    }
  }
  
  // Default to VLSFO if nothing found
  if (fuelTypes.length === 0) {
    fuelTypes.push('VLSFO');
    quantities['VLSFO'] = 0; // Will be calculated from consumption
  }
  
  return { fuel_types: fuelTypes, quantities, total_quantity: totalQuantity };
}

/**
 * Extract vessel name from user message for ROB lookup.
 * Tries known vessel names first, then "MV X" / "MV X Y" pattern.
 */
function extractVesselNameFromQuery(query: string): string | null {
  const known = listAllVessels();
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
      
      // Extract origin and destination from user query
      const userMessage = state.messages.find(msg => msg instanceof HumanMessage);
      const userQuery = userMessage?.content?.toString() || '';
      
      // Extract ports using LLM (reliable, handles any format)
      const { origin, destination } = await extractPortsFromQuery(userQuery);
      
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
      try {
        // Try main API
        const routeResult = await executeRouteCalculatorTool({
          origin_port_code: origin,
          destination_port_code: destination,
          vessel_speed_knots: 14, // Default speed
        });
        
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
      
      // Execute timeline calculation tool directly
      const timelineResult = await executeWeatherTimelineTool({
        waypoints: state.route_data.waypoints,
        vessel_speed_knots: 14, // Default speed
        departure_datetime: departureTime,
        sampling_interval_hours: 12,
      });
      
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
    
    return {
      route_data: state.route_data,
      vessel_timeline: state.vessel_timeline,
      agent_status: { 
        ...(state.agent_status || {}), 
        route_agent: 'success' 
      },
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
    console.error(`❌ [ROUTE-WORKFLOW] Error after ${duration}ms:`, error.message);
    
    // Record error metrics
    recordAgentExecution('route_agent', duration, false);
    
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
  console.log('\n🌊 [WEATHER-WORKFLOW] Starting deterministic workflow...');
  
  const startTime = Date.now();
  
  try {
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
    // PREREQUISITE CHECK: Vessel Timeline Required
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
      
      // Execute marine weather tool directly
      const weatherResult = await executeMarineWeatherTool({
        positions: state.vessel_timeline.map((pos: any) => ({
          lat: pos.lat,
          lon: pos.lon,
          datetime: pos.datetime,
        })),
      });
      
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
      
      // Execute weather consumption tool directly
      const consumptionResult = await executeWeatherConsumptionTool({
        weather_data: state.weather_forecast.map((w: any) => ({
          datetime: w.datetime || w.position?.datetime,
          weather: w.weather || w.position?.weather,
        })),
        base_consumption_mt: baseConsumptionMt,
        vessel_heading_deg: 90, // Default heading (can be improved)
        fuel_type_breakdown: vesselSpecs.fuel_capacity_mt,
      });
      
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
    console.error(`❌ [WEATHER-WORKFLOW] Error after ${duration}ms:`, error.message);
    
    // Record error metrics
    recordAgentExecution('weather_agent', duration, false);
    
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
export async function bunkerAgentNode(
  state: MultiAgentState
): Promise<Partial<MultiAgentState>> {
  console.log('\n⚓ [BUNKER-WORKFLOW] Starting deterministic workflow...');
  const startTime = Date.now();
  
  try {
    // ========================================================================
    // Extract context from supervisor
    // ========================================================================
    
    const agentContext = state.agent_context?.bunker_agent;
    console.log('📋 [BUNKER-WORKFLOW] Context from supervisor:');
    console.log(`   Priority: ${agentContext?.priority || 'normal'}`);
    console.log(`   Task: ${agentContext?.task_description || 'none'}`);
    console.log(`   Needs weather safety: ${agentContext?.needs_port_weather || false}`);
    
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
    // Extract user query details
    // ========================================================================
    
    const userMessage = state.messages.find(m => m instanceof HumanMessage);
    const userQuery = userMessage?.content?.toString() || '';
    
    // Extract fuel requirements from query
    const fuelRequirements = extractFuelRequirements(userQuery);
    console.log('📊 [BUNKER-WORKFLOW] Fuel requirements:', fuelRequirements);
    
    // ========================================================================
    // Check for ECA compliance requirements
    // ========================================================================
    
    const ecaData = state.compliance_data?.eca_zones;
    const requiresMGO = ecaData?.has_eca_zones || false;
    
    // Check if user wants weather safety analysis
    const needsWeatherSafety = 
      agentContext?.needs_port_weather || 
      userQuery.toLowerCase().includes('safe') ||
      userQuery.toLowerCase().includes('weather');
    console.log(`🌊 [BUNKER-WORKFLOW] Weather safety check: ${needsWeatherSafety ? 'YES' : 'NO'}`);

    // ========================================================================
    // FUEL REQUIREMENTS CALCULATION
    // ========================================================================
    // 
    // CRITICAL: Do NOT use arbitrary fallback (like 1000 MT).
    // Calculate from actual voyage consumption after ROB tracking runs.
    // This section just captures user-specified quantities if any.
    // Actual requirements are calculated AFTER calculateROBForVoyage() below.
    //
    const userSpecifiedVlsfo = fuelRequirements.quantities['VLSFO'] || 0;
    const userSpecifiedMgo = fuelRequirements.quantities['MGO'] || fuelRequirements.quantities['LSGO'] || 0;
    
    // ECA MGO requirement (from compliance data)
    const ecaMgoRequired = ecaData?.fuel_requirements.mgo_with_safety_margin_mt || 0;
    
    if (requiresMGO && ecaMgoRequired > 0 && ecaData) {
      console.log(`🌍 [BUNKER-WORKFLOW] ECA zones detected - requires ${ecaMgoRequired.toFixed(1)} MT MGO`);
      console.log(`   Zones crossed: ${ecaData.eca_zones_crossed.length}`);
      for (const zone of ecaData.eca_zones_crossed) {
        console.log(`   - ${zone.zone_name}: ${zone.distance_in_zone_nm.toFixed(1)} nm`);
      }
    }
    
    // Safety margin constant (1.15 = 15% extra fuel for safety)
    const FUEL_SAFETY_MARGIN = 1.15;
    
    // These will be calculated after ROB tracking
    let vlsfoRequired = 0;
    let lsmgoRequired = 0;

    // === Load vessel data from database ===
    const resolvedVesselName = state.vessel_name || extractVesselNameFromQuery(userQuery);
    const vpFromDb = resolvedVesselName ? getVesselProfile(resolvedVesselName) : null;

    let vp: VesselProfile;
    let vesselNotFoundWarning: string | null = null;

    if (resolvedVesselName && !vpFromDb) {
      console.warn(`⚠️ [BUNKER-WORKFLOW] Vessel "${resolvedVesselName}" not found in database`);
      console.log('   Available vessels:', listAllVessels().join(', '));
      console.log('   📝 [BUNKER-WORKFLOW] Using default vessel profile to continue workflow');
      
      vp = getDefaultVesselProfile();
      vesselNotFoundWarning = `⚠️ **Note:** Vessel "${resolvedVesselName}" not found in database. Using default vessel assumptions. Available vessels: ${listAllVessels().join(', ')}`;
    } else {
      vp = vpFromDb ?? getDefaultVesselProfile();
      if (vpFromDb) {
        console.log(`✅ [BUNKER-WORKFLOW] Vessel profile loaded: ${vp.vessel_name}`);
      } else {
        console.log('   📝 [BUNKER-WORKFLOW] No vessel specified, using default profile');
      }
    }
    const fouling = vp.fouling_factor ?? 1;
    const consumptionVlsfo = vp.consumption_vlsfo_per_day * fouling;
    const consumptionLsmgo = vp.consumption_lsmgo_per_day * fouling;

    const vesselProfile: VesselROBProfile = {
      initial_rob: vp.initial_rob,
      capacity: vp.capacity,
      consumption_vlsfo_per_day: consumptionVlsfo,
      consumption_lsmgo_per_day: consumptionLsmgo,
    };

    console.log(`🔍 [BUNKER-WORKFLOW] Vessel: ${vp.vessel_name}`);
    if (vp.vessel_data) {
      console.log(`   Type: ${vp.vessel_data.vessel_type}, IMO: ${vp.vessel_data.imo}`);
      console.log(`   ROB: ${vp.initial_rob.VLSFO} MT VLSFO, ${vp.initial_rob.LSMGO} MT LSMGO`);
      console.log(`   Capacity: ${vp.capacity.VLSFO} MT VLSFO, ${vp.capacity.LSMGO} MT LSMGO`);
      console.log(`   Consumption: ${consumptionVlsfo.toFixed(1)} / ${consumptionLsmgo.toFixed(1)} MT/day (fouling ${fouling}x)`);
    } else {
      console.log('   Using default profile (vessel not specified or not in database)');
    }
    if (vp.initial_rob.VLSFO < 500) {
      console.warn('⚠️ [BUNKER-WORKFLOW] LOW ROB DETECTED - Urgent bunkering recommended');
    }

    const ecaSegments = buildECASegmentsFromCompliance(
      state.route_data!,
      ecaData ?? null,
      vp.operational_speed ?? 14
    );

    // ========================================================================
    // STEP 0: ROB Tracking and ECA Consumption (voyage WITHOUT bunker)
    // ========================================================================

    let robTrackingResult: ROBTrackingOutput | null = null;
    let robSafetyStatus: { overall_safe: boolean; minimum_rob_days: number; violations: string[] } | null = null;
    let ecaConsumptionResult: ECAConsumptionOutput | null = null;
    let ecaSummaryResult: {
      eca_distance_nm: number;
      eca_percentage: number;
      total_vlsfo_mt: number;
      total_lsmgo_mt: number;
      segments_in_eca: number;
    } | null = null;

    // Store ROB without bunker separately for comparison (P0-5)
    let robWithoutBunker: ROBTrackingOutput | null = null;
    
    try {
      const { rob, ecaConsumption } = calculateROBForVoyage(
        state.route_data!,
        state.weather_consumption ?? null,
        vesselProfile,
        undefined,
        undefined,
        ecaSegments
      );
      robTrackingResult = rob;
      robWithoutBunker = rob;  // Store for comparison
      robSafetyStatus = formatROBSafetyStatus(rob, consumptionVlsfo, consumptionLsmgo);
      if (ecaConsumption) {
        ecaConsumptionResult = ecaConsumption;
        ecaSummaryResult = {
          eca_distance_nm: ecaConsumption.eca_distance_nm,
          eca_percentage: ecaConsumption.eca_percentage,
          total_vlsfo_mt: ecaConsumption.total_consumption_mt.VLSFO,
          total_lsmgo_mt: ecaConsumption.total_consumption_mt.LSMGO,
          segments_in_eca: ecaConsumption.segments.filter((s) => s.is_eca).length,
        };
      }
      console.log('🔧 [BUNKER-WORKFLOW] ROB tracking (voyage without bunker):');
      console.log(`  - Final ROB: ${rob.final_rob.VLSFO} MT VLSFO, ${rob.final_rob.LSMGO} MT LSMGO`);
      console.log(`  - Minimum ROB: ${rob.minimum_rob_reached.VLSFO} MT VLSFO at ${rob.minimum_rob_location}`);
      console.log(`  - Safety: ${rob.overall_safe ? '✅ Safe' : '❌ Unsafe'}`);
      if (!rob.overall_safe) {
        console.log('⚠️ [BUNKER-WORKFLOW] Bunkering MAY be required for safe voyage');
      }
    } catch (roErr: any) {
      console.warn(`⚠️ [BUNKER-WORKFLOW] ROB tracking skipped: ${roErr?.message || roErr}`);
    }

    // ========================================================================
    // CALCULATE ACTUAL FUEL REQUIREMENTS (P0-1, P0-2, P0-3 fixes)
    // ========================================================================
    //
    // Now that we have ROB tracking results, calculate the actual fuel needed:
    // 1. Use ECA consumption if available (most accurate)
    // 2. Fall back to voyage-based calculation if ECA not available
    // 3. Calculate shortfall = consumption - current ROB
    // 4. Apply safety margin and tank capacity constraints
    //
    
    const voyageDurationDays = (state.route_data?.estimated_hours || 0) / 24;
    
    // Calculate voyage fuel consumption
    let voyageVlsfoConsumption = 0;
    let voyageLsmgoConsumption = 0;
    
    if (ecaConsumptionResult) {
      // Best case: Use ECA engine calculation (most accurate)
      voyageVlsfoConsumption = ecaConsumptionResult.total_consumption_mt.VLSFO;
      voyageLsmgoConsumption = ecaConsumptionResult.total_consumption_mt.LSMGO;
      console.log(`📊 [BUNKER-WORKFLOW] Voyage consumption (from ECA engine):`);
    } else if (voyageDurationDays > 0) {
      // Fallback: Calculate from vessel consumption rates
      voyageVlsfoConsumption = voyageDurationDays * consumptionVlsfo;
      voyageLsmgoConsumption = voyageDurationDays * consumptionLsmgo;
      console.log(`📊 [BUNKER-WORKFLOW] Voyage consumption (from vessel rates):`);
    } else {
      // Last resort: Use arbitrary minimum
      voyageVlsfoConsumption = 500; // Minimum reasonable voyage consumption
      voyageLsmgoConsumption = 50;
      console.warn(`⚠️ [BUNKER-WORKFLOW] Could not calculate voyage consumption, using minimums`);
    }
    console.log(`   - VLSFO: ${voyageVlsfoConsumption.toFixed(1)} MT`);
    console.log(`   - LSMGO: ${voyageLsmgoConsumption.toFixed(1)} MT`);
    
    // === EARLY DETECTION: Multi-port bunkering needed? ===
    const voyageConsumption = { VLSFO: voyageVlsfoConsumption, LSMGO: voyageLsmgoConsumption };
    const needsMultiPort = needsMultiPortBunkering(
      voyageConsumption,
      vp.capacity,
      vp.initial_rob,
      3, // safety margin days
      voyageDurationDays
    );
    
    if (needsMultiPort) {
      console.log(`⚠️ [BUNKER-WORKFLOW] Multi-port bunkering may be required!`);
      console.log(`   Voyage consumption: ${(voyageVlsfoConsumption + voyageLsmgoConsumption).toFixed(0)} MT total`);
      console.log(`   Vessel capacity: ${(vp.capacity.VLSFO + vp.capacity.LSMGO).toFixed(0)} MT total`);
    }
    
    // Calculate shortfall (how much more fuel is needed)
    const vlsfoShortfall = Math.max(0, voyageVlsfoConsumption - vp.initial_rob.VLSFO);
    const lsmgoShortfall = Math.max(0, voyageLsmgoConsumption - vp.initial_rob.LSMGO);
    
    // Apply safety margin
    const vlsfoWithSafety = vlsfoShortfall * FUEL_SAFETY_MARGIN;
    const lsmgoWithSafety = lsmgoShortfall * FUEL_SAFETY_MARGIN;
    
    // Apply tank capacity constraint (don't exceed available space)
    const vlsfoAvailableCapacity = vp.capacity.VLSFO - vp.initial_rob.VLSFO;
    const lsmgoAvailableCapacity = vp.capacity.LSMGO - vp.initial_rob.LSMGO;
    
    vlsfoRequired = Math.min(vlsfoWithSafety, vlsfoAvailableCapacity);
    lsmgoRequired = Math.min(lsmgoWithSafety, lsmgoAvailableCapacity);
    
    // Add ECA MGO requirement if applicable
    if (ecaMgoRequired > 0 && lsmgoRequired < ecaMgoRequired) {
      lsmgoRequired = Math.min(ecaMgoRequired, lsmgoAvailableCapacity);
    }
    
    // Override with user-specified quantities if provided
    if (userSpecifiedVlsfo > 0) {
      vlsfoRequired = Math.min(userSpecifiedVlsfo, vlsfoAvailableCapacity);
      console.log(`📊 [BUNKER-WORKFLOW] Using user-specified VLSFO quantity: ${vlsfoRequired.toFixed(0)} MT`);
    }
    if (userSpecifiedMgo > 0) {
      lsmgoRequired = Math.min(userSpecifiedMgo, lsmgoAvailableCapacity);
      console.log(`📊 [BUNKER-WORKFLOW] Using user-specified MGO quantity: ${lsmgoRequired.toFixed(0)} MT`);
    }
    
    console.log(`📊 [BUNKER-WORKFLOW] Bunker requirements calculated:`);
    console.log(`   - VLSFO needed: ${vlsfoRequired.toFixed(0)} MT (shortfall: ${vlsfoShortfall.toFixed(0)}, capacity: ${vlsfoAvailableCapacity.toFixed(0)})`);
    console.log(`   - LSMGO needed: ${lsmgoRequired.toFixed(0)} MT (shortfall: ${lsmgoShortfall.toFixed(0)}, capacity: ${lsmgoAvailableCapacity.toFixed(0)})`);
    
    // Minimum viable bunker (at least enough for 3 days safety margin)
    const minVlsfoSafety = consumptionVlsfo * 3;
    const minLsmgoSafety = consumptionLsmgo * 3;
    
    if (vlsfoRequired < minVlsfoSafety && vlsfoShortfall > 0) {
      vlsfoRequired = Math.min(minVlsfoSafety, vlsfoAvailableCapacity);
      console.log(`   ℹ️ Adjusted VLSFO to minimum safety margin: ${vlsfoRequired.toFixed(0)} MT`);
    }
    if (lsmgoRequired < minLsmgoSafety && lsmgoShortfall > 0) {
      lsmgoRequired = Math.min(minLsmgoSafety, lsmgoAvailableCapacity);
      console.log(`   ℹ️ Adjusted LSMGO to minimum safety margin: ${lsmgoRequired.toFixed(0)} MT`);
    }

    // ========================================================================
    // STEP 1: Find Bunker Ports
    // ========================================================================
    
    let bunkerPorts: any = null;
    
    if (!state.bunker_ports) {
      console.log('🔍 [BUNKER-WORKFLOW] Finding bunker ports along route...');
      
      try {
        // Include MGO in fuel types if ECA compliance requires it
        const fuelTypesForPorts = fuelRequirements.fuel_types.length > 0 
          ? [...fuelRequirements.fuel_types]
          : ['VLSFO'];
        
        if (requiresMGO && ecaMgoRequired > 0 && !fuelTypesForPorts.includes('MGO')) {
          fuelTypesForPorts.push('MGO');
          console.log(`🔍 [BUNKER-WORKFLOW] Adding MGO to port finder fuel types for ECA compliance`);
        }
        
        const portFinderInput = {
          route_waypoints: state.route_data.waypoints,
          max_deviation_nm: 150, // Standard deviation limit
          fuel_types: fuelTypesForPorts,
        };
        
        bunkerPorts = await withTimeout(
          executePortFinderTool(portFinderInput),
          TIMEOUTS.ROUTE_CALCULATION,
          'Port finder timed out'
        );
        
        console.log(`✅ [BUNKER-WORKFLOW] Found ${bunkerPorts.total_ports_found} ports within 150nm of route`);
        
        if (bunkerPorts.total_ports_found === 0) {
          console.warn('⚠️ [BUNKER-WORKFLOW] No bunker ports found along route');
          const noPortsMessage: any = {
            type: 'bunker_workflow_complete',
            message: 'No suitable bunker ports found within 150 nautical miles of the route. Consider increasing deviation limit or choosing an alternative route.',
          };
          if (vesselNotFoundWarning) {
            noPortsMessage.warning = vesselNotFoundWarning;
          }
          return {
            bunker_ports: bunkerPorts,
            rob_tracking: robTrackingResult ?? null,
            rob_waypoints: robTrackingResult?.waypoints ?? null,
            rob_safety_status: robSafetyStatus ?? null,
            eca_consumption: ecaConsumptionResult ?? null,
            eca_summary: ecaSummaryResult ?? null,
            vessel_name: resolvedVesselName || vp.vessel_name,
            vessel_profile: vp,
            agent_status: { 
              ...(state.agent_status || {}), 
              bunker_agent: 'success' 
            },
            messages: [
              ...state.messages,
              new AIMessage({
                content: JSON.stringify(noPortsMessage),
              }),
            ],
          };
        }
      } catch (error: any) {
        console.error('❌ [BUNKER-WORKFLOW] Port finder error:', error.message);
        recordAgentExecution('bunker_agent', Date.now() - startTime, false);
        throw error;
      }
    } else {
      console.log('✅ [BUNKER-WORKFLOW] Using existing bunker ports from state');
      bunkerPorts = state.bunker_ports;
    }
    
    // ========================================================================
    // STEP 2: Check Port Weather Safety (if requested)
    // ========================================================================
    
    let portWeather: any = null;
    
    if (needsWeatherSafety && !state.port_weather_status) {
      console.log('🌊 [BUNKER-WORKFLOW] Checking weather safety at bunker ports...');
      
      try {
        // Calculate estimated arrival times for each port
        const bunkerPortsWithArrival = bunkerPorts.ports.map((port: any) => {
          // Find the waypoint nearest to this port
          const nearestWaypoint = state.vessel_timeline?.[port.nearest_waypoint_index];
          
          return {
            port_code: port.port.port_code,
            port_name: port.port.name,
            lat: port.port.coordinates.lat,
            lon: port.port.coordinates.lon,
            estimated_arrival: nearestWaypoint?.datetime || new Date().toISOString(),
            bunkering_duration_hours: 8, // Standard bunkering duration
          };
        });
        
        const portWeatherInput = {
          bunker_ports: bunkerPortsWithArrival,
        };
        
        portWeather = await withTimeout(
          executePortWeatherTool(portWeatherInput),
          TIMEOUTS.WEATHER_API,
          'Port weather check timed out'
        );
        
        const safePortsCount = portWeather.filter((p: any) => p.bunkering_feasible).length;
        console.log(`✅ [BUNKER-WORKFLOW] Weather checked: ${safePortsCount}/${portWeather.length} ports have safe conditions`);
        
      } catch (error: any) {
        console.error('❌ [BUNKER-WORKFLOW] Port weather error:', error.message);
        console.warn('⚠️ [BUNKER-WORKFLOW] Continuing without weather safety data');
        // Don't fail the entire workflow - continue without weather data
      }
    } else if (state.port_weather_status) {
      console.log('✅ [BUNKER-WORKFLOW] Using existing port weather from state');
      portWeather = state.port_weather_status;
    } else {
      console.log('⏭️ [BUNKER-WORKFLOW] Skipping weather safety check (not requested)');
    }
    
    // ========================================================================
    // STEP 3: Get Fuel Prices
    // ========================================================================
    
    let portPrices: any = null;
    
    if (!state.port_prices) {
      console.log('💰 [BUNKER-WORKFLOW] Fetching fuel prices for candidate ports...');
      
      try {
        // Include MGO in fuel types if ECA compliance requires it
        const fuelTypes = fuelRequirements.fuel_types.length > 0 
          ? [...fuelRequirements.fuel_types]
          : ['VLSFO'];
        
        if (requiresMGO && ecaMgoRequired > 0 && !fuelTypes.includes('MGO')) {
          fuelTypes.push('MGO');
          console.log(`💰 [BUNKER-WORKFLOW] Adding MGO to fuel types for ECA compliance`);
        }
        
        const priceFetcherInput = {
          port_codes: bunkerPorts.ports.map((p: any) => p.port.port_code),
          fuel_types: fuelTypes,
        };
        
        portPrices = await withTimeout(
          executePriceFetcherTool(priceFetcherInput),
          TIMEOUTS.PRICE_FETCH,
          'Price fetcher timed out'
        );
        
        // Log with actual count
        const priceCount = Array.isArray(portPrices) ? portPrices.length : 0;
        console.log(`✅ [BUNKER-WORKFLOW] Fetched prices for ${priceCount} ports`);
        
      } catch (error: any) {
        console.error('❌ [BUNKER-WORKFLOW] Price fetcher error:', error.message);
        recordAgentExecution('bunker_agent', Date.now() - startTime, false);
        throw error;
      }
    } else {
      console.log('✅ [BUNKER-WORKFLOW] Using existing port prices from state');
      portPrices = state.port_prices;
    }
    
    // ========================================================================
    // STEP 4: Analyze and Rank Bunker Options
    // ========================================================================
    
    let bunkerAnalysis: any = null;
    
    if (!state.bunker_analysis) {
      console.log('📊 [BUNKER-WORKFLOW] Analyzing bunker options...');
      
      try {
        // Use vlsfoRequired/lsmgoRequired from outer scope (calculated from voyage consumption)
        // Match manual implementation parameter structure exactly
        const analyzerInput = {
          bunker_ports: bunkerPorts.ports,
          port_prices: portPrices,
          fuel_quantity_mt: vlsfoRequired,  // Use calculated VLSFO requirement
          fuel_type: 'VLSFO',
          mgo_quantity_mt: lsmgoRequired,   // Use calculated LSMGO requirement
          vessel_speed_knots: 14,                  // Default speed (route_data doesn't store speed)
          vessel_consumption_mt_per_day: consumptionVlsfo,       // Use actual vessel consumption rate
          port_weather: portWeather,               // Optional weather data
        };
        
        console.log('📊 [BUNKER-WORKFLOW] Analyzer input:', {
          ports_count: bunkerPorts.ports.length,
          prices_count: Array.isArray(portPrices) ? portPrices.length : 0,
          fuel_quantity_mt: vlsfoRequired,
          fuel_type: 'VLSFO',
          mgo_required_mt: lsmgoRequired,
          has_weather_data: !!portWeather
        });
        
        bunkerAnalysis = await withTimeout(
          executeBunkerAnalyzerTool(analyzerInput),
          TIMEOUTS.AGENT,
          'Bunker analyzer timed out'
        );
        
        const rankedCount = bunkerAnalysis?.recommendations?.length || 0;
        const bestPort = bunkerAnalysis?.recommendations?.[0];
        console.log(`✅ [BUNKER-WORKFLOW] Analysis complete: ${rankedCount} ports ranked`);
        
        if (bestPort) {
          console.log(`   Best option: ${bestPort.port_name} - Total cost: $${bestPort.total_cost?.toFixed(2) || 'N/A'}`);
        }
        
      } catch (error: any) {
        console.error('❌ [BUNKER-WORKFLOW] Bunker analyzer error:', error.message);
        recordAgentExecution('bunker_agent', Date.now() - startTime, false);
        throw error;
      }
    } else {
      console.log('✅ [BUNKER-WORKFLOW] Using existing bunker analysis from state');
      bunkerAnalysis = state.bunker_analysis;
    }
    
    // ========================================================================
    // Complete workflow
    // ========================================================================
    
    const duration = Date.now() - startTime;
    console.log(`✅ [BUNKER-WORKFLOW] Complete in ${duration}ms`);
    
    recordAgentExecution('bunker_agent', duration, true);
    
    // ========================================================================
    // CRITICAL: Extract correct values for state
    // State expects specific types, not the raw tool outputs
    // ========================================================================
    
    // Extract ports array from FoundPortsResult
    const portsArray = bunkerPorts?.ports || null;
    const portsCount = portsArray?.length || 0;
    
    // port_prices is already in correct format (PriceFetcherOutput)
    const priceData = portPrices || null;
    const pricesCount = priceData?.prices_by_port 
      ? Object.keys(priceData.prices_by_port).length 
      : 0;
    
    // bunker_analysis is already in correct format
    const analysisData = bunkerAnalysis || null;
    const recommendationsCount = analysisData?.recommendations?.length || 0;

    // === ROB with recommended bunker (when we have a best option) ===
    const bestRec = analysisData?.recommendations?.[0];
    const listForPort = portsArray ?? (Array.isArray(bunkerPorts) ? bunkerPorts : []);
    const foundForRob = (listForPort as any[])?.find((p: any) => (p?.port?.port_code ?? p?.port_code) === bestRec?.port_code);
    const portForRob = foundForRob ? (foundForRob.port ?? foundForRob) : null;

    // Store ROB with bunker separately (P0-5)
    let robWithBunkerResult: ROBTrackingOutput | null = null;
    
    if (bestRec && portForRob && typeof (portForRob as any).name === 'string' && state.route_data && vesselProfile) {
      try {
        const quantityForRob = { VLSFO: vlsfoRequired, LSMGO: lsmgoRequired };
        console.log('🔧 [BUNKER-WORKFLOW] Calculating ROB with recommended bunker...');
        console.log(`   Port: ${bestRec.port_name}`);
        console.log(`   VLSFO: ${vlsfoRequired.toFixed(0)} MT`);
        console.log(`   LSMGO: ${lsmgoRequired.toFixed(0)} MT`);
        const { rob: robWithBunker } = calculateROBForVoyage(
          state.route_data,
          state.weather_consumption ?? null,
          vesselProfile,
          portForRob as Port,
          quantityForRob,
          ecaSegments
        );
        console.log(`📊 [BUNKER-WORKFLOW] Voyage WITH bunker at ${bestRec.port_name}:`);
        console.log(`  - Final ROB: ${robWithBunker.final_rob.VLSFO} MT VLSFO, ${robWithBunker.final_rob.LSMGO} MT LSMGO`);
        console.log(`  - Safety: ${robWithBunker.overall_safe ? '✅ Safe' : '❌ Unsafe'}`);
        robWithBunkerResult = robWithBunker;
        robTrackingResult = robWithBunker;
        robSafetyStatus = formatROBSafetyStatus(robWithBunker, consumptionVlsfo, consumptionLsmgo);
      } catch (e: any) {
        console.warn(`⚠️ [BUNKER-WORKFLOW] ROB-with-bunker skipped: ${e?.message || e}`);
      }
    }
    
    // ========================================================================
    // BUILD ENHANCED ROB TRACKING STRUCTURE (P0-5)
    // ========================================================================
    // This structure provides clear comparison between with/without bunker scenarios
    // for prominent display in the response
    //
    const enhancedRobTracking: any = robTrackingResult ? {
      // Current vessel state
      vessel_name: vp.vessel_name,
      current_rob: vp.initial_rob,
      
      // Voyage consumption requirements
      voyage_consumption: {
        VLSFO: voyageVlsfoConsumption,
        LSMGO: voyageLsmgoConsumption,
        total_days: voyageDurationDays,
        distance_nm: state.route_data?.distance_nm || 0,
      },
      
      // Scenario 1: WITHOUT bunkering
      without_bunker: robWithoutBunker ? {
        final_rob: robWithoutBunker.final_rob,
        minimum_rob: robWithoutBunker.minimum_rob_reached,
        minimum_location: robWithoutBunker.minimum_rob_location,
        overall_safe: robWithoutBunker.overall_safe,
        waypoints: robWithoutBunker.waypoints,
        // Calculate when fuel runs out (if unsafe)
        days_until_empty: !robWithoutBunker.overall_safe 
          ? Math.max(0, vp.initial_rob.VLSFO / consumptionVlsfo)
          : null,
        critical_fuel: robWithoutBunker.final_rob.VLSFO < 0 ? 'VLSFO' : 
                       robWithoutBunker.final_rob.LSMGO < 0 ? 'LSMGO' : null,
      } : null,
      
      // Scenario 2: WITH recommended bunker
      with_bunker: robWithBunkerResult ? {
        final_rob: robWithBunkerResult.final_rob,
        minimum_rob: robWithBunkerResult.minimum_rob_reached,
        minimum_location: robWithBunkerResult.minimum_rob_location,
        overall_safe: robWithBunkerResult.overall_safe,
        waypoints: robWithBunkerResult.waypoints,
        bunker_port: bestRec?.port_name || null,
        bunker_quantity: {
          VLSFO: vlsfoRequired,
          LSMGO: lsmgoRequired,
        },
      } : null,
      
      // Overall safety status (based on with-bunker scenario)
      overall_safe: robWithBunkerResult?.overall_safe ?? robWithoutBunker?.overall_safe ?? false,
      
      // Flag if recommended bunker is still insufficient
      with_bunker_still_unsafe: robWithBunkerResult ? !robWithBunkerResult.overall_safe : false,
      
      // Safety margins
      safety_margins: {
        recommended_minimum_days: 3,
        recommended_minimum_rob: {
          VLSFO: consumptionVlsfo * 3,
          LSMGO: consumptionLsmgo * 3,
        },
      },
    } : null;
    
    console.log('📊 [BUNKER-WORKFLOW] Enhanced ROB tracking (P0-5):');
    if (enhancedRobTracking) {
      console.log('   Without bunker:', {
        final: enhancedRobTracking.without_bunker?.final_rob,
        safe: enhancedRobTracking.without_bunker?.overall_safe,
      });
      console.log('   With bunker:', {
        final: enhancedRobTracking.with_bunker?.final_rob,
        safe: enhancedRobTracking.with_bunker?.overall_safe,
        port: enhancedRobTracking.with_bunker?.bunker_port,
      });
    }
    
    // ========================================================================
    // MULTI-PORT BUNKER PLANNING (when single stop is insufficient)
    // ========================================================================
    let multiBunkerPlan: MultiBunkerAnalysis | null = null;
    
    // Check if multi-port is needed (capacity constraint OR single-port still unsafe)
    const withBunkerStillUnsafe = enhancedRobTracking?.with_bunker_still_unsafe ?? false;
    
    if ((needsMultiPort || withBunkerStillUnsafe) && bunkerPorts?.ports && priceData && state.route_data) {
      console.log('🔀 [BUNKER-WORKFLOW] Running multi-port bunker planning...');
      if (withBunkerStillUnsafe) {
        console.log('   Reason: Single-stop bunker leaves voyage still unsafe');
      }
      
      try {
        // Pass forceRequired=true when voyage is still unsafe after single-stop bunker
        // This ensures multi-port planning runs even if capacity check alone passes
        multiBunkerPlan = planMultiPortBunker({
          route_data: state.route_data,
          vessel_profile: vp,  // Use full VesselProfile (vp), not VesselROBProfile
          voyage_consumption: voyageConsumption,
          candidate_ports: bunkerPorts.ports,
          port_prices: priceData,
          weather_factor: state.weather_consumption?.consumption_increase_percent 
            ? 1 + (state.weather_consumption.consumption_increase_percent / 100) 
            : 1.0,
          safety_margin_days: 3,
        }, withBunkerStillUnsafe /* forceRequired */);
        
        if (multiBunkerPlan.required && multiBunkerPlan.best_plan) {
          console.log('✅ [BUNKER-WORKFLOW] Multi-port plan generated:');
          console.log(`   Best option: ${multiBunkerPlan.best_plan.stops.map(s => s.port_name).join(' → ')}`);
          console.log(`   Total cost: $${multiBunkerPlan.best_plan.total_cost_usd.toLocaleString()}`);
          console.log(`   Plans available: ${multiBunkerPlan.plans.length}`);
        } else if (multiBunkerPlan.required && !multiBunkerPlan.best_plan) {
          console.log(`⚠️ [BUNKER-WORKFLOW] Multi-port required but no valid plans found: ${multiBunkerPlan.error_message}`);
        } else {
          console.log('ℹ️ [BUNKER-WORKFLOW] Multi-port not required after detailed analysis');
        }
      } catch (err: any) {
        console.error('❌ [BUNKER-WORKFLOW] Multi-port planning error:', err.message);
        // Don't fail the whole workflow - multi-port is an enhancement
      }
    }
    
    console.log(`📊 [BUNKER-WORKFLOW] Returning to state:`);
    console.log(`   - Ports: ${portsCount} found`);
    console.log(`   - Weather: ${portWeather?.length || 0} ports checked`);
    console.log(`   - Prices: ${pricesCount} ports`);
    console.log(`   - Analysis: ${recommendationsCount} recommendations`);
    
    const messageContent: any = {
      type: 'bunker_workflow_complete',
      ports_found: portsCount,
      weather_checked: portWeather?.length || 0,
      prices_fetched: pricesCount,
      recommendations: recommendationsCount,
      recommended_port: analysisData?.recommendations?.[0]?.port_name || 'Unknown',
      rob_overall_safe: robSafetyStatus?.overall_safe,
      rob_minimum_days: robSafetyStatus?.minimum_rob_days,
      eca_percentage: ecaSummaryResult?.eca_percentage,
      vessel_name: vp.vessel_name,
      // Multi-port info
      multi_port_required: multiBunkerPlan?.required ?? false,
      multi_port_plans_count: multiBunkerPlan?.plans?.length ?? 0,
      multi_port_best_option: multiBunkerPlan?.best_plan 
        ? multiBunkerPlan.best_plan.stops.map(s => s.port_name).join(' → ')
        : null,
    };

    // Add warning if vessel not found
    if (vesselNotFoundWarning) {
      messageContent.warning = vesselNotFoundWarning;
    }
    
    // Add warning if multi-port required but no plans found
    if (multiBunkerPlan?.required && !multiBunkerPlan.best_plan) {
      messageContent.multi_port_warning = multiBunkerPlan.error_message || 'Multi-port bunkering required but no valid plans found';
    }
    
    return {
      bunker_ports: portsArray,              // ✅ FIXED: Array of ports, not full object
      port_weather_status: portWeather,       // ✅ Already correct (array)
      port_prices: priceData,                 // ✅ Already correct (PriceFetcherOutput)
      bunker_analysis: analysisData,          // ✅ Already correct (BunkerAnalysis)
      multi_bunker_plan: multiBunkerPlan,     // Multi-port bunker plan (when single stop insufficient)
      rob_tracking: enhancedRobTracking ?? robTrackingResult ?? null,  // P0-5: Enhanced ROB structure
      rob_waypoints: robTrackingResult?.waypoints ?? null,
      rob_safety_status: robSafetyStatus ?? null,
      eca_consumption: ecaConsumptionResult ?? null,
      eca_summary: ecaSummaryResult ?? null,
      vessel_name: resolvedVesselName || vp.vessel_name,
      vessel_profile: vp,
      agent_status: {
        ...(state.agent_status || {}),
        bunker_agent: 'success'
      },
      messages: [
        ...state.messages,
        new AIMessage({
          content: JSON.stringify(messageContent)
        })
      ]
    };
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`❌ [BUNKER-WORKFLOW] Error after ${duration}ms:`, error.message);
    
    // Record error metrics
    recordAgentExecution('bunker_agent', duration, false);
    
    return {
      agent_status: { 
        ...(state.agent_status || {}), 
        bunker_agent: 'failed' 
      },
      agent_errors: {
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
    const origin = state.route_data.origin_port_code || 'Origin';
    const dest = state.route_data.destination_port_code || 'Destination';
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
      const origin = state.route_data.origin_port_code || 'Origin';
      const dest = state.route_data.destination_port_code || 'Destination';
      parts.push(`\n📍 **Route**: ${origin} → ${dest}`);
      parts.push(`**Distance**: ${state.route_data.distance_nm.toFixed(0)} nm\n`);
    }
    
    if (state.multi_bunker_plan?.required) {
      parts.push('\n⚠️ Multi-port bunkering required due to vessel capacity constraints.');
      parts.push('See detailed plan above.\n');
    }
    
    return parts.join('\n');
  }
  
  // Strategy 3: Route-only response
  if (state.route_data) {
    console.log('ℹ️ [LEGACY-OUTPUT] Using route-only summary');
    const origin = state.route_data.origin_port_code || 'Origin';
    const dest = state.route_data.destination_port_code || 'Destination';
    const hours = state.route_data.estimated_hours || 0;
    return `📍 Route calculated: ${origin} → ${dest}\n` +
           `Distance: ${state.route_data.distance_nm.toFixed(0)} nautical miles\n` +
           `Estimated duration: ${Math.floor(hours / 24)}d ${Math.floor(hours % 24)}h`;
  }
  
  // Strategy 4: Generic completion message
  console.warn('⚠️ [LEGACY-OUTPUT] No synthesis or bunker data - using generic message');
  return 'Analysis completed. Please check the structured response for details.';
}

export async function finalizeNode(state: MultiAgentState) {
  console.log('📝 [FINALIZE] Node: Starting finalization...');
  
  // === DEBUG: State inspection ===
  console.log('🔍 [FINALIZE-DEBUG] State inspection:');
  console.log(`  - rob_tracking: ${state.rob_tracking ? '✅ EXISTS' : '❌ NULL/UNDEFINED'}`);
  console.log(`  - rob_waypoints: ${state.rob_waypoints ? `✅ EXISTS (${state.rob_waypoints.length} waypoints)` : '❌ NULL/UNDEFINED'}`);
  console.log(`  - rob_safety_status: ${state.rob_safety_status ? '✅ EXISTS' : '❌ NULL/UNDEFINED'}`);
  console.log(`  - eca_consumption: ${state.eca_consumption ? '✅ EXISTS' : '❌ NULL/UNDEFINED'}`);
  console.log(`  - eca_summary: ${state.eca_summary ? '✅ EXISTS' : '❌ NULL/UNDEFINED'}`);
  console.log(`  - vessel_profile: ${state.vessel_profile ? '✅ EXISTS' : '❌ NULL/UNDEFINED'}`);
  console.log(`  - bunker_analysis: ${state.bunker_analysis ? '✅ EXISTS' : '❌ NULL/UNDEFINED'}`);
  console.log(`  - agent_status: ${state.agent_status ? `✅ EXISTS (${Object.keys(state.agent_status).length} agents)` : '❌ NULL/UNDEFINED'}`);
  
  if (state.rob_tracking) {
    console.log('📊 [FINALIZE-DEBUG] ROB Tracking Details:');
    
    // Handle both old and new (P0-5 enhanced) ROB tracking structures
    const robTracking = state.rob_tracking as any;
    
    // Check for new P0-5 enhanced structure
    if (robTracking.with_bunker || robTracking.without_bunker) {
      // New enhanced structure
      const withBunker = robTracking.with_bunker;
      const withoutBunker = robTracking.without_bunker;
      
      if (withoutBunker?.final_rob) {
        console.log(`  - Without Bunker Final ROB: ${withoutBunker.final_rob.VLSFO?.toFixed(1)} MT VLSFO, ${withoutBunker.final_rob.LSMGO?.toFixed(1)} MT LSMGO`);
        console.log(`  - Without Bunker Safe: ${withoutBunker.overall_safe}`);
      }
      if (withBunker?.final_rob) {
        console.log(`  - With Bunker Final ROB: ${withBunker.final_rob.VLSFO?.toFixed(1)} MT VLSFO, ${withBunker.final_rob.LSMGO?.toFixed(1)} MT LSMGO`);
        console.log(`  - With Bunker Safe: ${withBunker.overall_safe}`);
      }
      console.log(`  - Overall Safe: ${robTracking.overall_safe}`);
      console.log(`  - Still Unsafe After Bunker: ${robTracking.with_bunker_still_unsafe}`);
    } else if (robTracking.final_rob) {
      // Old structure (backwards compatibility)
      console.log(`  - Final ROB: ${robTracking.final_rob.VLSFO} MT VLSFO, ${robTracking.final_rob.LSMGO} MT LSMGO`);
      console.log(`  - Overall Safe: ${robTracking.overall_safe}`);
      console.log(`  - Waypoints: ${robTracking.waypoints?.length || 0}`);
    } else {
      console.log(`  - Structure: Unknown (keys: ${Object.keys(robTracking).join(', ')})`);
    }
  }

  if (state.rob_waypoints) {
    console.log('📍 [FINALIZE-DEBUG] ROB Waypoints:');
    state.rob_waypoints.forEach((wp, idx) => {
      const vlsfo = wp.rob_after_action?.VLSFO;
      console.log(`  ${idx + 1}. ${wp.location}: ${vlsfo !== undefined ? vlsfo.toFixed(1) : 'N/A'} MT VLSFO, ${wp.is_safe ? '✅' : '⚠️'}`);
    });
  }
  // === END DEBUG ===
  
  const agentStartTime = Date.now();

  try {
    // ========================================================================
    // PHASE 1: CROSS-AGENT SYNTHESIS
    // ========================================================================
    
    console.log('🧠 [FINALIZE] Phase 1: Cross-agent synthesis');
    
    // Create mutable state copy for adding synthesis insights
    let updatedState = { ...state };
    
    // Try to generate synthesis
    try {
      const synthesisResult = await generateSynthesis(state);
      
      if (synthesisResult.success && synthesisResult.synthesized_insights) {
        console.log('✅ [FINALIZE] Synthesis successful');
        console.log(`   Cost: $${synthesisResult.cost_usd?.toFixed(4) || '0.0000'}`);
        console.log(`   Duration: ${synthesisResult.duration_ms}ms`);
        
        // Add synthesis to state
        updatedState.synthesized_insights = synthesisResult.synthesized_insights;
        
      } else {
        console.log(`⏭️ [FINALIZE] Synthesis skipped: ${synthesisResult.error || 'Unknown reason'}`);
      }
      
    } catch (synthesisError: unknown) {
      const message = synthesisError instanceof Error ? synthesisError.message : String(synthesisError);
      console.error('❌ [FINALIZE] Synthesis error (non-fatal):', message);
      // Continue without synthesis - graceful degradation
    }
    
    // ========================================================================
    // PHASE 2: TEMPLATE FORMATTING
    // ========================================================================
    
    console.log('🎨 [FINALIZE] Phase 2: Template formatting');
    
    // Generate legacy text output (backwards compatible)
    const legacyTextOutput = await generateLegacyTextOutput(updatedState);
    
    // Generate new formatted response (OPTIONAL)
    let formattedResponse: TemplateFormattedResponse | null = null;
    
    if (isFeatureEnabled('USE_RESPONSE_FORMATTER')) {
      console.log('🎛️ [FINALIZE] Template-aware formatter enabled, generating structured output...');
      
      try {
        // Use template-aware formatter with YAML templates and business rules
        // Pass updatedState so formatter has access to synthesis data
        formattedResponse = formatResponseWithTemplate(updatedState);
        console.log('✅ [FINALIZE] Template response generated successfully');
        
        // Log template metadata
        if (formattedResponse.template_metadata) {
          console.log(`   Template: ${formattedResponse.template_metadata.template_name} v${formattedResponse.template_metadata.version}`);
          console.log(`   Sections: ${formattedResponse.template_metadata.sections_count}`);
          console.log(`   Rules Applied: ${formattedResponse.template_metadata.rules_applied}`);
        }
        
        // Check if synthesis data was used
        if (updatedState.synthesized_insights) {
          console.log('   ✅ Synthesis insights included in response');
        }
        
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('❌ [FINALIZE] Template formatter error:', message);
        console.error('   Falling back to legacy text output only');
        // Continue with legacyTextOutput - no failure
      }
    } else {
      console.log('ℹ️ [FINALIZE] Response formatter disabled, using legacy text only');
    }
    
    // ========================================================================
    // PHASE 3: RETURN RESULTS
    // ========================================================================
    
    const agentDuration = Date.now() - agentStartTime;
    recordAgentTime('finalize', agentDuration);
    recordAgentExecution('finalize', agentDuration, true);
    
    console.log('✅ [FINALIZE] Node: Final recommendation generated');
    
    return {
      final_recommendation: legacyTextOutput,  // ALWAYS present (backwards compatible)
      formatted_response: formattedResponse,   // OPTIONAL (may be null)
      synthesized_insights: updatedState.synthesized_insights, // Include synthesis in output
      messages: [
        new AIMessage({
          content: legacyTextOutput  // Use legacy for message
        })
      ],
    };
    
  } catch (error) {
    const agentDuration = Date.now() - agentStartTime;
    recordAgentTime('finalize', agentDuration);
    recordAgentExecution('finalize', agentDuration, false);
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

// Export compliance agent node
export { complianceAgentNode };

