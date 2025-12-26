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
import { AgentRegistry } from './registry';
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

// Import tool schemas
import { routeCalculatorInputSchema } from '@/lib/tools/route-calculator';
import { weatherTimelineInputSchema } from '@/lib/tools/weather-timeline';
import { marineWeatherInputSchema } from '@/lib/tools/marine-weather';
import { weatherConsumptionInputSchema } from '@/lib/tools/weather-consumption';
import { portWeatherInputSchema } from '@/lib/tools/port-weather';
import { portFinderInputSchema } from '@/lib/tools/port-finder';
import { priceFetcherInputSchema } from '@/lib/tools/price-fetcher';
import { bunkerAnalyzerInputSchema } from '@/lib/tools/bunker-analyzer';

// Import weather agent tools from tools.ts
import {
  fetchMarineWeatherTool,
  createFetchMarineWeatherTool,
  calculateWeatherConsumptionTool,
  checkPortWeatherTool,
} from './tools';

// Import port lookup utility
import { extractPortsFromQuery as lookupPorts } from '@/lib/utils/port-lookup';

// ============================================================================
// Circuit Breaker Helper
// ============================================================================

/**
 * Count how many times each agent has been called
 * Used for circuit breaker to prevent infinite loops
 */
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

// Validate API key is present (skip in test mode)
if (!process.env.ANTHROPIC_API_KEY && process.env.NODE_ENV !== 'test') {
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
      
      // If execution plan exists and has bunker agent tools, use them
      if (executionPlan && executionPlan.agent_tool_assignments['bunker_agent'] && executionPlan.agent_tool_assignments['bunker_agent'].length > 0) {
        const bunkerTools = executionPlan.agent_tool_assignments['bunker_agent'];
        console.log(`✅ [SUPERVISOR] Using execution plan tools for bunker_agent: ${bunkerTools.join(', ')}`);
        
        // Ensure agentContext exists and has bunker_agent
        if (!agentContext) {
          const intent = analyzeQueryIntent(userQuery);
          agentContext = generateAgentContext(intent, state);
        }
        
        // Set bunker agent tools from execution plan
        if (!agentContext.bunker_agent) {
          agentContext.bunker_agent = {
            needs_weather_consumption: true,
            needs_port_weather: true,
            required_tools: [],
            task_description: '',
            priority: 'critical' as const
          };
        }
        agentContext.bunker_agent.required_tools = bunkerTools;
      } else if (!agentContext || !agentContext.bunker_agent?.required_tools || agentContext.bunker_agent.required_tools.length === 0) {
        // Fallback to generating context if no execution plan
        const intent = analyzeQueryIntent(userQuery);
        agentContext = generateAgentContext(intent, state);
        console.log(`⚠️ [SUPERVISOR] No execution plan tools for bunker_agent, using legacy context`);
      }
      
      return {
        next_agent: "bunker_agent",
        agent_context: agentContext,
        messages: [],
      };
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
      return {
        next_agent: "bunker_agent",
        agent_context: agentContext,
        messages: [],
      };
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
      const tools = executionPlan.agent_tool_assignments[agentName] || [];
      if (tools.length === 0) {
        // Agent has no tools assigned, skip it
        continue;
      }
      
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
      const agentDone = 
        (agentName === 'route_agent' && routeCompleteForQuery) ||
        (agentName === 'weather_agent' && state.weather_forecast && (!needsBunker || state.weather_consumption)) ||
        (agentName === 'bunker_agent' && state.bunker_analysis);
      
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
    return {
      next_agent: "route_agent",
      agent_context: agentContext,
      messages: [],
    };
  }
  
  // 2. If route is complete (for this query type), check what else is needed based on query intent
  if (routeCompleteForQuery) {
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
          return {
            next_agent: 'bunker_agent',
            agent_context: agentContext,
            messages: [],
          };
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
        return {
          next_agent: "weather_agent",
          agent_context: agentContext,
          messages: [],
        };
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
        return {
          next_agent: "weather_agent",
          agent_context: agentContext,
          messages: [],
        };
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
          return {
            next_agent: "bunker_agent",
            agent_context: agentContext,
            messages: [],
          };
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
          return {
            next_agent: "bunker_agent",
            agent_context: agentContext,
            messages: [],
          };
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
  return {
    next_agent: "route_agent",
    agent_context: agentContext,
    messages: [],
  };
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
 * Extract ports from query using database lookup
 * Fast, free, and accurate - searches port database instead of using LLM
 */
async function extractPortsFromQuery(query: string): Promise<{ origin: string; destination: string }> {
  const { origin, destination } = lookupPorts(query);
  
  // Use defaults if not found
  const finalOrigin = origin || 'SGSIN';
  const finalDest = destination || 'AEFJR';
  
  console.log(`✅ [PORT-EXTRACTION] Result: ${finalOrigin} → ${finalDest}`);
  
  return {
    origin: finalOrigin,
    destination: finalDest,
  };
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
      
      // Try primary API, with fallback to cached routes
      try {
        // Try main API
        const routeResult = await executeRouteCalculatorTool({
          origin_port_code: origin,
          destination_port_code: destination,
          vessel_speed_knots: 14, // Default speed
        });
        
        console.log(`✅ [ROUTE-WORKFLOW] Route calculated: ${routeResult.distance_nm} nm`);
        
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
 * Bunker Agent Node
 * 
 * Finds best bunker option using port finder, price fetcher, and bunker analyzer tools.
 */
export async function bunkerAgentNode(state: MultiAgentState) {
  console.log('⚓ [BUNKER-AGENT] Node: Starting bunker analysis...');
  const agentStartTime = Date.now();

  // Get agent context from supervisor
  const context = state.agent_context?.bunker_agent;
  const requiredTools = context?.required_tools || [];
  
  console.log(`📋 [BUNKER-AGENT] Context: required_tools=${requiredTools.join(', ') || 'none'}`);

  // FIRST: Check if we have tool results to extract (like route and weather agents do)
  console.log(`🔍 [BUNKER-AGENT] Checking for tool results in ${state.messages.length} messages`);
  const toolMessages = state.messages.filter(m => m instanceof ToolMessage);
  console.log(`🔍 [BUNKER-AGENT] Found ${toolMessages.length} ToolMessages`);
  
  const extractedData = extractBunkerDataFromMessages(state.messages);
  const stateUpdates: any = {};
  
  if (extractedData.bunker_ports && !state.bunker_ports) {
    stateUpdates.bunker_ports = extractedData.bunker_ports;
    console.log(`✅ [BUNKER-AGENT] Extracted bunker_ports from tool results (${extractedData.bunker_ports.length} ports)`);
  }
  
  if (extractedData.port_prices && !state.port_prices) {
    stateUpdates.port_prices = extractedData.port_prices;
    console.log('✅ [BUNKER-AGENT] Extracted port_prices from tool results');
  }
  
  if (extractedData.bunker_analysis && !state.bunker_analysis) {
    stateUpdates.bunker_analysis = extractedData.bunker_analysis;
    console.log(`✅ [BUNKER-AGENT] Extracted bunker_analysis from tool results`);
  }
  
  // If we got all bunker data from tool results, we're done
  if (extractedData.bunker_ports && extractedData.port_prices && extractedData.bunker_analysis) {
    console.log('✅ [BUNKER-AGENT] All bunker data extracted, returning state update');
    return { 
      ...stateUpdates, 
      agent_status: { ...(state.agent_status || {}), bunker_agent: 'success' } 
    };
  }

  // STRICT ORCHESTRATION: Enforce supervisor tool assignments
  // Agents can ONLY use tools assigned by supervisor - no fallback to all tools
  if (requiredTools.length === 0) {
    console.error('❌ [BUNKER-AGENT] No tools assigned by supervisor - cannot proceed');
    return {
      agent_status: { bunker_agent: 'failed' },
      agent_errors: {
        bunker_agent: {
          error: 'No tools assigned by supervisor. Supervisor must assign tools before agent can execute.',
          timestamp: Date.now(),
        },
      },
      messages: [new AIMessage('[BUNKER-AGENT] Cannot proceed - supervisor has not assigned any tools')],
    };
  }
  
  // Map tool names to actual tool objects (only bunker agent's tools)
  const toolMap: Record<string, any> = {
    'find_bunker_ports': findBunkerPortsTool,
    'get_fuel_prices': getFuelPricesTool,
    'analyze_bunker_options': analyzeBunkerOptionsTool,
  };
  
  // STRICT: Only use supervisor-assigned tools
  console.log(`✅ [BUNKER-AGENT] Using supervisor-specified tools: ${requiredTools.join(', ')}`);
  const bunkerTools = requiredTools
    .map(toolName => toolMap[toolName])
    .filter(Boolean); // Remove undefined
  
  if (bunkerTools.length === 0) {
    console.error('❌ [BUNKER-AGENT] Supervisor assigned tools but none matched bunker agent tools');
    return {
      agent_status: { bunker_agent: 'failed' },
      agent_errors: {
        bunker_agent: {
          error: `Supervisor assigned invalid tools: ${requiredTools.join(', ')}. Bunker agent only has: find_bunker_ports, get_fuel_prices, analyze_bunker_options`,
          timestamp: Date.now(),
        },
      },
      messages: [new AIMessage('[BUNKER-AGENT] Invalid tool assignments from supervisor')],
    };
  }
  
  // Validate all assigned tools belong to bunker agent
  const invalidTools = requiredTools.filter(toolName => !toolMap[toolName]);
  if (invalidTools.length > 0) {
    console.error(`❌ [BUNKER-AGENT] Supervisor assigned tools from other agents: ${invalidTools.join(', ')}`);
    return {
      agent_status: { bunker_agent: 'failed' },
      agent_errors: {
        bunker_agent: {
          error: `Supervisor assigned tools from other agents: ${invalidTools.join(', ')}. Bunker agent cannot use other agents' tools.`,
          timestamp: Date.now(),
        },
      },
      messages: [new AIMessage('[BUNKER-AGENT] Cannot use tools from other agents')],
    };
  }
  
  // Use tiered LLM (Claude Haiku 4.5 for complex tool calling)
  const bunkerAgentLLM = LLMFactory.getLLMForAgent('bunker_agent', state.agent_context || undefined);
  const llmWithTools = (bunkerAgentLLM as any).bindTools(bunkerTools);

  const systemPrompt = `You are the Bunker Agent. Your role is to:
1. Find bunker ports along the route using route waypoints
2. Fetch current fuel prices for those ports
3. Analyze and rank bunker options based on total cost

Use find_bunker_ports with route waypoints.
Then use get_fuel_prices for the found ports.
Finally, use analyze_bunker_options to rank all options.

Be thorough and ensure you complete the full bunker optimization analysis.`;

  try {
    // Build messages with system prompt and conversation history
    // CRITICAL: Validate BEFORE slicing - validation needs full message array to find complete pairs
    
    // Step 1: Get all messages (don't trim yet - we need full context for validation)
    const allMessages = state.messages;

    // Step 2: Remove SystemMessages (we'll add our own)
    let messagesWithoutSystem = allMessages.filter(
      (msg) => !(msg instanceof SystemMessage) && 
               msg.constructor.name !== 'SystemMessage'
    );

    // Step 3: Find last HumanMessage
    const lastHumanMessageIndex = messagesWithoutSystem.findLastIndex(
      (msg) => msg instanceof HumanMessage || msg.constructor.name === 'HumanMessage'
    );

    // Step 4: Take messages from last human query onward (keep recent context)
    const messagesToInclude = lastHumanMessageIndex >= 0
      ? messagesWithoutSystem.slice(lastHumanMessageIndex)
      : messagesWithoutSystem.slice(-20);  // Fallback: last 20

    // Combine system prompt with context about available data
    let fullSystemPrompt = systemPrompt;
    if (state.route_data) {
      fullSystemPrompt += `\n\nAvailable data:
- Route waypoints: ${state.route_data.waypoints.length} waypoints
- Use route waypoints for find_bunker_ports`;
    }

    // Step 5: Build final message array for LLM
    const messages = [
      new SystemMessage(fullSystemPrompt),
      ...messagesToInclude,
    ];

    const response: any = await withTimeout(
      llmWithTools.invoke(messages),
      TIMEOUTS.AGENT,
      'Bunker agent timed out'
    );

    const agentDuration = Date.now() - agentStartTime;
    recordAgentTime('bunker_agent', agentDuration);
    recordAgentExecution('bunker_agent', agentDuration, true);

    console.log('✅ [BUNKER-AGENT] Node: LLM responded');
    if (response.tool_calls && response.tool_calls.length > 0) {
      console.log(`🔧 [BUNKER-AGENT] Agent wants to call: ${response.tool_calls.map((tc: any) => tc.name).join(', ')}`);
    }

    console.log(`✅ [BUNKER-AGENT] Completed successfully`);
    console.log(`   • Tools called: ${response.tool_calls?.map((tc: any) => tc.name).join(', ') || 'none'}`);
    console.log(`   • Duration: ${agentDuration}ms`);

    // NEW DEBUG LOGGING
    console.log(`📤 [BUNKER-AGENT] Returning to state:`);
    console.log(`   • Message type: ${response.constructor.name}`);
    console.log(`   • Has tool_calls: ${response.tool_calls ? 'YES' : 'NO'}`);
    if (response.tool_calls && response.tool_calls.length > 0) {
      console.log(`   • Tool call count: ${response.tool_calls.length}`);
      console.log(`   • Tool names: ${response.tool_calls.map((tc: any) => tc.name).join(', ')}`);
      console.log(`   • Tool IDs: ${response.tool_calls.map((tc: any) => tc.id).join(', ')}`);
    }
    console.log(`   • State updates: ${JSON.stringify(Object.keys(stateUpdates))}`);

    // Return both the LLM response and any state updates from extracted data
    return { 
      ...stateUpdates,
      messages: [response], 
      agent_status: { ...(state.agent_status || {}), bunker_agent: 'success' } 
    };
  } catch (error) {
    const agentDuration = Date.now() - agentStartTime;
    recordAgentTime('bunker_agent', agentDuration);
    recordAgentExecution('bunker_agent', agentDuration, false);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('timed out');
    
    console.error(`❌ [BUNKER-AGENT] Node error: ${errorMessage}`);
    console.warn(`⚠️ [BUNKER-AGENT] Marking bunker agent as failed, supervisor will proceed to finalize`);
    
    // Mark as failed - don't throw, let supervisor handle it
    return {
      agent_status: { bunker_agent: 'failed' },
      agent_errors: {
        bunker_agent: {
          error: isTimeout ? 'Bunker agent timed out after 30 seconds' : errorMessage,
          timestamp: Date.now(),
        },
      },
      messages: [
        new SystemMessage(
          `Bunker agent encountered an error: ${errorMessage}. The system will continue with available data.`
        ),
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
export async function finalizeNode(state: MultiAgentState) {
  console.log('📝 [FINALIZE] Node: Synthesizing final recommendation...');
  const agentStartTime = Date.now();

  // Determine what the user actually asked for
  const userMessage = state.messages.find((msg) => msg instanceof HumanMessage);
  const userQuery = userMessage 
    ? (typeof userMessage.content === 'string' ? userMessage.content : String(userMessage.content))
    : '';
  const userQueryLower = userQuery.toLowerCase();
  
  const needsWeather = [
    'weather', 'forecast', 'conditions', 'wind', 'wave', 
    'storm', 'gale', 'seas', 'swell', 'meteorological', 'climate'
  ].some(keyword => userQueryLower.includes(keyword));
  
  const needsBunker = [
    'bunker', 'fuel', 'port', 'price', 'cheapest', 'cost', 'refuel',
    'bunkering', 'fueling', 'vlsfo', 'mgo', 'diesel', 'optimization',
    'best option', 'recommendation', 'compare', 'savings'
  ].some(keyword => userQueryLower.includes(keyword));

  console.log(`📝 [FINALIZE] User query analysis: weather=${needsWeather}, bunker=${needsBunker}`);

  // NEW: Get agent context from supervisor
  const context = state.agent_context?.finalize;
  const complexity = context?.complexity || 'medium';
  
  console.log(`📋 [FINALIZE] Context: complexity=${complexity}, needs_weather_analysis=${context?.needs_weather_analysis}, needs_bunker_analysis=${context?.needs_bunker_analysis}`);

  // NEW: Use tiered LLM (Haiku 4.5 for synthesis)
  const finalizeLLM = LLMFactory.getLLMForAgent('finalize', state.agent_context || undefined);

  // Check for errors and build context
  const agentErrors = state.agent_errors || {};
  const agentStatus = state.agent_status || {};
  const hasErrors = Object.keys(agentErrors).length > 0;
  
  // Build user-friendly error context
  let errorContext = '';
  if (hasErrors) {
    const routeError = agentErrors.route_agent;
    const weatherError = agentErrors.weather_agent;
    const bunkerError = agentErrors.bunker_agent;
    
    if (routeError) {
      const isTimeout = routeError.error.includes('timeout') || routeError.error.includes('timed out');
      errorContext = `\n\n⚠️ IMPORTANT: The route calculation service is currently unavailable${isTimeout ? ' (timed out after 20 seconds)' : ''}. This prevents us from:\n- Calculating the optimal route between ports\n- Identifying bunker ports along the route\n- Providing accurate distance and time estimates\n\nPlease try again in a few moments, or contact support if the issue persists.`;
    } else if (weatherError) {
      errorContext = `\n\n⚠️ Note: Weather data could not be retrieved. This may affect fuel consumption estimates.`;
    } else if (bunkerError) {
      errorContext = `\n\n⚠️ Note: Bunker port analysis encountered an issue. Some pricing data may be incomplete.`;
    }
  }

  // Build state context summary
  const stateContext: string[] = [];

  if (state.route_data) {
    stateContext.push(
      `Route: ${state.route_data.distance_nm.toFixed(2)}nm, ${state.route_data.estimated_hours.toFixed(1)}h, ${state.route_data.route_type}`
    );
  }

  if (state.weather_forecast) {
    stateContext.push(
      `Weather Forecast: ${state.weather_forecast.length} data points available`
    );
  }

  if (state.weather_consumption) {
    stateContext.push(
      `Weather Impact: +${state.weather_consumption.consumption_increase_percent.toFixed(2)}% consumption, ${state.weather_consumption.additional_fuel_needed_mt.toFixed(2)}MT additional fuel`
    );
  }

  if (state.bunker_analysis) {
    const best = state.bunker_analysis.best_option;
    if (best) {
      const totalCost = best.total_cost_usd ? best.total_cost_usd.toFixed(2) : 'N/A';
      const savings = state.bunker_analysis.max_savings_usd ? state.bunker_analysis.max_savings_usd.toFixed(2) : 'N/A';
      stateContext.push(
        `Best Option: ${best.port_name || 'N/A'} - Total cost: $${totalCost}, Savings: $${savings}`
      );
    }
  }

  if (state.port_weather_status && state.port_weather_status.length > 0) {
    const portWeather = state.port_weather_status[0];
    stateContext.push(
      `Port Weather: ${portWeather.port_name} - ${portWeather.bunkering_feasible ? 'Feasible' : 'Not feasible'}, ${portWeather.weather_risk} risk`
    );
  }

  const stateSummary = stateContext.length > 0 ? `\n\nAvailable Data:\n${stateContext.join('\n')}` : '';

  // Build system prompt based on what user asked for
  let systemPrompt = '';
  
  if (needsWeather && !needsBunker) {
    // Weather-only query - focus on weather information
    // Build weather forecast summary
    let weatherDetails = '';
    if (state.weather_forecast && state.weather_forecast.length > 0) {
      // Sample first, middle, and last weather points
      const samplePoints = [
        state.weather_forecast[0],
        state.weather_forecast[Math.floor(state.weather_forecast.length / 2)],
        state.weather_forecast[state.weather_forecast.length - 1]
      ];
      
      weatherDetails = `\n\nWeather Forecast Sample (showing first, middle, and last points):
${samplePoints.map((wp, i) => {
  const pos = wp.position || {};
  return `Point ${i === 0 ? 'Start' : i === 1 ? 'Mid' : 'End'}: 
  - Location: ${pos.lat?.toFixed(2)}, ${pos.lon?.toFixed(2)}
  - Datetime: ${wp.datetime}
  - Wave Height: ${wp.weather?.wave_height_m?.toFixed(2)}m
  - Wind Speed: ${wp.weather?.wind_speed_knots?.toFixed(1)} knots
  - Wind Direction: ${wp.weather?.wind_direction_deg?.toFixed(0)}°
  - Sea State: ${wp.weather?.sea_state}
  - Confidence: ${wp.forecast_confidence}`;
}).join('\n\n')}

Total weather data points: ${state.weather_forecast.length}`;
    }
    
    systemPrompt = `You are the Weather Analysis Agent. The user asked about weather conditions for their route.

User Query: "${userQuery}"

Available data:
- Route: ${state.route_data ? `${state.route_data.origin_port_code} → ${state.route_data.destination_port_code}, ${state.route_data.distance_nm.toFixed(2)}nm, ${state.route_data.estimated_hours.toFixed(1)} hours` : 'Not available'}
- Weather Forecast: ${state.weather_forecast ? `${state.weather_forecast.length} data points along the route` : 'Not available'}${weatherDetails}${errorContext}${stateSummary}

Create a comprehensive weather analysis that includes:
1. Route Overview: Distance, estimated transit time, route type, departure date
2. Weather Conditions Along Route: 
   - Wave heights, wind speeds, and sea states by segment
   - Weather patterns by region/geographic area
   - Forecast confidence levels
3. Weather Timeline: Key weather events and conditions at different stages of the voyage
4. Weather Alerts: Any severe conditions, storms, or warnings
5. Recommendations: Weather-related planning advice

${state.weather_forecast ? 'Use the weather forecast data to provide detailed weather information. Analyze the weather patterns across the route and identify any challenging conditions.' : 'Note: Weather forecast data is not available.'}

IMPORTANT: Focus ONLY on weather information. Do NOT include bunker port recommendations, fuel cost analysis, or bunkering advice.`;
  } else if (needsBunker) {
    // Bunker query - include bunker analysis
    systemPrompt = `You are the Finalization Agent. Your role is to create a comprehensive bunker recommendation from all the collected data.

User Query: "${userQuery}"

Available data:
- Route: ${state.route_data ? `${state.route_data.origin_port_code} → ${state.route_data.destination_port_code}${(state.route_data as any)._from_cache ? ' (from cache)' : ''}` : 'Not available'}
- Weather impact: ${state.weather_consumption ? `${state.weather_consumption.consumption_increase_percent.toFixed(2)}% increase` : 'Not available'}
- Bunker analysis: ${state.bunker_analysis ? `${state.bunker_analysis.recommendations.length} options analyzed` : 'Not available'}
- Port weather: ${state.port_weather_status ? `${state.port_weather_status.length} ports checked` : 'Not available'}${errorContext}${stateSummary}

Create a comprehensive, well-structured recommendation that includes:
1. Route summary${state.route_data ? '' : ' (if available)'}
2. Weather impact on fuel consumption${state.weather_consumption ? '' : ' (if available - note if missing)'}
3. Best bunker port recommendation with justification${state.bunker_analysis ? '' : ' (if available - note if missing)'}
4. Port weather conditions assessment${state.port_weather_status ? '' : ' (if available - note if missing)'}
5. Total cost analysis${state.bunker_analysis ? '' : ' (if available - note if missing)'}
6. Risk assessment

${hasErrors ? 'IMPORTANT: Clearly indicate which data is missing and how it affects the recommendation. Be transparent about limitations.' : ''}

Be clear, concise, and actionable.

IMPORTANT: If route calculation failed, provide a helpful but concise explanation. Focus on:
1. What went wrong (route service unavailable)
2. What this means for the user (cannot provide bunker recommendations without route)
3. What they can do (retry in a few moments, or use general port knowledge)
4. Keep it brief - avoid overly technical details or lengthy disclaimers.`;
  } else {
    // Route-only query or general query
    systemPrompt = `You are the Route Planning Agent. Provide information about the requested route.

User Query: "${userQuery}"

Available data:
- Route: ${state.route_data ? `${state.route_data.origin_port_code} → ${state.route_data.destination_port_code}, ${state.route_data.distance_nm.toFixed(2)}nm` : 'Not available'}${errorContext}${stateSummary}

Provide a clear summary of the route information.`;
  }

  try {
    // Build comprehensive context for final synthesis
    // CRITICAL: Validate BEFORE slicing - validation needs full message array to find complete pairs
    
    // Step 1: Get all messages (don't trim yet - we need full context for validation)
    const allMessages = state.messages;

    // Step 2: Remove SystemMessages (we'll add our own)
    let messagesWithoutSystem = allMessages.filter(
      (msg) => !(msg instanceof SystemMessage) && 
               msg.constructor.name !== 'SystemMessage'
    );

    // Step 3: Validate COMPLETE messages (this needs full message array!)
    const validatedMessages = validateMessagesForAnthropicAPI(messagesWithoutSystem);

    // Step 4: NOW find last HumanMessage and slice if needed
    const lastHumanMessageIndex = validatedMessages.findLastIndex(
      (msg) => msg instanceof HumanMessage || msg.constructor.name === 'HumanMessage'
    );

    // Step 5: Take messages from last human query onward
    const messagesToInclude = lastHumanMessageIndex >= 0
      ? validatedMessages.slice(lastHumanMessageIndex)
      : validatedMessages.slice(-20);  // Fallback: last 20 messages

    // Step 6: Build final message array for LLM
    // CRITICAL: Only ONE SystemMessage allowed, and it must be first
    const messages = [
      new SystemMessage(systemPrompt),
      ...messagesToInclude,
    ];

    const response = await withTimeout(
      finalizeLLM.invoke(messages),
      TIMEOUTS.AGENT,
      'Finalize node timed out'
    );

    const agentDuration = Date.now() - agentStartTime;
    recordAgentTime('finalize', agentDuration);
    recordAgentExecution('finalize', agentDuration, true);

    console.log('✅ [FINALIZE] Node: Final recommendation generated');

    // Extract recommendation text
    const recommendation =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

    return {
      final_recommendation: recommendation,
      messages: [response],
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
      produces: ['route_data']
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
      produces: ['vessel_timeline']
    }
  ],
  prerequisites: ['origin_port', 'destination_port'],
  outputs: ['route_data', 'vessel_timeline']
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
      produces: ['weather_forecast']
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
      produces: ['weather_consumption']
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
      produces: ['port_weather_status']
    }
  ],
  prerequisites: ['vessel_timeline'],
  outputs: ['weather_forecast', 'weather_consumption', 'port_weather_status']
});

// Register Bunker Agent
AgentRegistry.registerAgent({
  agent_name: 'bunker_agent',
  description: 'Finds bunker ports along route, fetches fuel prices, and analyzes optimal bunkering options with cost-benefit analysis',
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
  prerequisites: ['route_data'],
  outputs: ['bunker_ports', 'port_prices', 'bunker_analysis']
});

