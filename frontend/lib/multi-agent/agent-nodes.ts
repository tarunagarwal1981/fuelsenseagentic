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

export async function routeAgentNode(state: MultiAgentState) {
  console.log('🗺️ [ROUTE-AGENT] Node: Starting route calculation...');
  const agentStartTime = Date.now();

  // Get agent context from supervisor
  const context = state.agent_context?.route_agent;
  const needsWeatherTimeline = context?.needs_weather_timeline ?? false;
  const requiredTools = context?.required_tools || [];
  
  console.log(`📋 [ROUTE-AGENT] Context: needs_weather_timeline=${needsWeatherTimeline}, required_tools=${requiredTools.join(', ') || 'none'}`);
  
  // STRICT ORCHESTRATION: Enforce supervisor tool assignments
  // Agents can ONLY use tools assigned by supervisor - no fallback to all tools
  if (requiredTools.length === 0) {
    console.error('❌ [ROUTE-AGENT] No tools assigned by supervisor - cannot proceed');
    return {
      agent_status: { route_agent: 'failed' },
      agent_errors: {
        route_agent: {
          error: 'No tools assigned by supervisor. Supervisor must assign tools before agent can execute.',
          timestamp: Date.now(),
        },
      },
      messages: [new AIMessage('[ROUTE-AGENT] Cannot proceed - supervisor has not assigned any tools')],
    };
  }
  
  // Map tool names to actual tool objects (only route agent's tools)
  const toolMap: Record<string, any> = {
    'calculate_route': calculateRouteTool,
    'calculate_weather_timeline': calculateWeatherTimelineTool,
  };
  
  // STRICT: Only use supervisor-assigned tools
  console.log(`✅ [ROUTE-AGENT] Using supervisor-specified tools: ${requiredTools.join(', ')}`);
  const routeTools = requiredTools
    .map(toolName => toolMap[toolName])
    .filter(Boolean); // Remove undefined
  
  if (routeTools.length === 0) {
    console.error('❌ [ROUTE-AGENT] Supervisor assigned tools but none matched route agent tools');
    return {
      agent_status: { route_agent: 'failed' },
      agent_errors: {
        route_agent: {
          error: `Supervisor assigned invalid tools: ${requiredTools.join(', ')}. Route agent only has: calculate_route, calculate_weather_timeline`,
          timestamp: Date.now(),
        },
      },
      messages: [new AIMessage('[ROUTE-AGENT] Invalid tool assignments from supervisor')],
    };
  }
  
  // Validate all assigned tools belong to route agent
  const invalidTools = requiredTools.filter(toolName => !toolMap[toolName]);
  if (invalidTools.length > 0) {
    console.error(`❌ [ROUTE-AGENT] Supervisor assigned tools from other agents: ${invalidTools.join(', ')}`);
    return {
      agent_status: { route_agent: 'failed' },
      agent_errors: {
        route_agent: {
          error: `Supervisor assigned tools from other agents: ${invalidTools.join(', ')}. Route agent cannot use other agents' tools.`,
          timestamp: Date.now(),
        },
      },
      messages: [new AIMessage('[ROUTE-AGENT] Cannot use tools from other agents')],
    };
  }

  // First, check if we have tool results to extract
  const extractedData = extractRouteDataFromMessages(state.messages);
  const stateUpdates: any = {};

  if (extractedData.route_data && !state.route_data) {
    stateUpdates.route_data = extractedData.route_data;
    console.log('✅ [ROUTE-AGENT] Extracted route_data from tool results');
  }

  if (extractedData.vessel_timeline && !state.vessel_timeline) {
    stateUpdates.vessel_timeline = extractedData.vessel_timeline;
    console.log('✅ [ROUTE-AGENT] Extracted vessel_timeline from tool results');
  }

  // If we already have the data, just return
  // Check based on context - if weather timeline not needed, only check route_data
  if (state.route_data && (needsWeatherTimeline ? state.vessel_timeline : true)) {
    console.log('✅ [ROUTE-AGENT] Route data already available, skipping');
    // If route came from cache, we still need to calculate vessel timeline if needed
    if (needsWeatherTimeline && !state.vessel_timeline && (state.route_data as any)._from_cache) {
      console.log('🔄 [ROUTE-AGENT] Route from cache, calculating vessel timeline...');
      // Continue to calculate timeline
    } else {
      return { ...stateUpdates, agent_status: { route_agent: 'success' } };
    }
  }
  
  // Get user query for departure date extraction
  const userMessageForDate = state.messages.find((msg) => msg instanceof HumanMessage);
  const userQueryForDate = userMessageForDate ? (typeof userMessageForDate.content === 'string' ? userMessageForDate.content : String(userMessageForDate.content)) : '';
  
  // Extract departure date from query (needed for weather timeline)
  let cachedRouteDepartureDate = '2024-12-25T08:00:00Z'; // Default
  const cachedDateMatch = userQueryForDate.match(/(?:december|dec)\s+(\d+)/i);
  if (cachedDateMatch) {
    cachedRouteDepartureDate = `2024-12-${cachedDateMatch[1].padStart(2, '0')}T08:00:00Z`;
  }

  // Helper function to find and use cached route
  async function tryUseCachedRoute(originPort: string, destinationPort: string) {
    if (!originPort || !destinationPort) {
      return null;
    }
    
    try {
      const cachedRoutes = await loadCachedRoutes();
      if (!cachedRoutes || !cachedRoutes.routes) {
        return null;
      }
      
      // Search for matching route (check both directions)
      const cachedRoute = cachedRoutes.routes.find(
        (r: any) =>
          (r.origin_port_code === originPort && r.destination_port_code === destinationPort) ||
          (r.origin_port_code === destinationPort && r.destination_port_code === originPort)
      );
      
      if (!cachedRoute) {
        return null;
      }
      
      console.log(`✅ [ROUTE-AGENT] Found cached route: ${cachedRoute.origin_name} → ${cachedRoute.destination_name}`);
      
      const cachedRouteData = {
        distance_nm: cachedRoute.distance_nm,
        estimated_hours: cachedRoute.estimated_hours,
        waypoints: cachedRoute.waypoints,
        route_type: cachedRoute.route_type,
        origin_port_code: cachedRoute.origin_port_code,
        destination_port_code: cachedRoute.destination_port_code,
        _from_cache: true,
      };
      
      // If weather timeline needed, calculate it
      if (needsWeatherTimeline && cachedRouteData.waypoints && cachedRouteData.waypoints.length > 0) {
        console.log(`🚀 [ROUTE-AGENT] Calculating weather timeline for cached route with ${cachedRouteData.waypoints.length} waypoints`);
        const timelineResult = await withTimeout(
          executeWeatherTimelineTool({
            waypoints: cachedRouteData.waypoints,
            vessel_speed_knots: 14,
            departure_datetime: cachedRouteDepartureDate,
            sampling_interval_hours: 12
          }),
          TIMEOUTS.ROUTE_CALCULATION,
          'Weather timeline calculation timed out'
        );
        
        return {
          route_data: cachedRouteData,
          vessel_timeline: timelineResult,
          agent_status: { route_agent: 'success' },
          messages: [new AIMessage('[ROUTE-AGENT] Route loaded from cache, timeline calculated')]
        };
      }
      
      return {
        route_data: cachedRouteData,
        agent_status: { route_agent: 'success' },
        messages: [new AIMessage('[ROUTE-AGENT] Route loaded from cache')]
      };
    } catch (error) {
      console.warn(`⚠️ [ROUTE-AGENT] Failed to load cached route: ${error}`);
      return null;
    }
  }

  // Check if we should use cached route (fallback after API failure or if selected)
  const selectedRouteId = state.selected_route_id;
  if (!state.route_data && selectedRouteId) {
    try {
      const cachedRoutes = await loadCachedRoutes();
      if (!cachedRoutes || !cachedRoutes.routes) {
        throw new Error('Cached routes data is invalid');
      }
      const cachedRoute = cachedRoutes.routes.find((r) => r.id === selectedRouteId);
      if (cachedRoute) {
        const result = await tryUseCachedRoute(cachedRoute.origin_port_code, cachedRoute.destination_port_code);
        if (result) {
          return result;
        }
      }
    } catch (error) {
      console.warn(`⚠️ [ROUTE-AGENT] Failed to load cached route by ID: ${error}`);
    }
  }

  // Get user's original message to understand what they want
  const userMessage = state.messages.find((msg) => msg instanceof HumanMessage);
  const userQuery = userMessage ? (typeof userMessage.content === 'string' ? userMessage.content : String(userMessage.content)) : '';

  // Extract port information from user query (needed for fallback)
  let originPort = '';
  let destinationPort = '';
  let departureDate = '';
  
  if (userQuery.toLowerCase().includes('singapore')) {
    originPort = 'SGSIN';
  }
  if (userQuery.toLowerCase().includes('jebel ali') || userQuery.toLowerCase().includes('dubai')) {
    destinationPort = 'AEJEA';
  }
  if (userQuery.toLowerCase().includes('rotterdam')) {
    destinationPort = 'NLRTM';
  }
  
  // Try to extract date
  const dateMatch = userQuery.match(/(?:december|dec)\s+(\d+)/i);
  if (dateMatch) {
    departureDate = `2024-12-${dateMatch[1].padStart(2, '0')}T08:00:00Z`;
  } else {
    departureDate = '2024-12-25T08:00:00Z'; // Default
  }
  
  // Store ports for error handler fallback
  const extractedOriginPort = originPort;
  const extractedDestinationPort = destinationPort;
  
  // PROACTIVE: Check for cached route BEFORE trying API (if we have port codes)
  if (!state.route_data && originPort && destinationPort) {
    console.log(`🔍 [ROUTE-AGENT] Checking for cached route: ${originPort} → ${destinationPort}`);
    const cachedResult = await tryUseCachedRoute(originPort, destinationPort);
    if (cachedResult) {
      console.log(`✅ [ROUTE-AGENT] Using cached route proactively (before API call)`);
      return cachedResult;
    } else {
      console.log(`ℹ️ [ROUTE-AGENT] No cached route found, will try API`);
    }
  }

  // STRICT ORCHESTRATION: No direct tool calling - all tools must go through LLM binding
  // This ensures supervisor has full control and agents follow the assigned tool plan

  // Use tiered LLM (GPT-4o-mini for simple tool calling)
  const routeAgentLLM = LLMFactory.getLLMForAgent('route_agent', state.agent_context || undefined);
  
  // routeTools already determined above based on required_tools from context
  const llmWithTools = (routeAgentLLM as any).bindTools(routeTools);

  // NEW: Update system prompt based on context
  const systemPrompt = `You are the Route Planning Agent. Your ONLY job is to call tools to calculate routes.

CRITICAL: You MUST call the calculate_route tool immediately. Do NOT respond with text - ONLY call tools.

User query: "${userQuery}"

${originPort ? `Origin port detected: ${originPort}` : 'Extract origin port from query'}
${destinationPort ? `Destination port detected: ${destinationPort}` : 'Extract destination port from query'}

Port codes:
- Singapore: SGSIN
- Jebel Ali/Dubai: AEJEA  
- Rotterdam: NLRTM

STEP 1: Call calculate_route with:
{
  "origin_port_code": "${originPort || 'SGSIN'}",
  "destination_port_code": "${destinationPort || 'AEJEA'}",
  "vessel_speed_knots": 14
}

${needsWeatherTimeline ? `
STEP 2: After getting route result, call calculate_weather_timeline with:
{
  "waypoints": [use waypoints from calculate_route result],
  "vessel_speed_knots": 14,
  "departure_datetime": "${departureDate}",
  "sampling_interval_hours": 12
}
` : `
NOTE: You only need to calculate the route. Weather timeline is not needed for this query.
`}

You MUST call these tools. Do not explain - just call the tools.`;

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

    // Step 5: Build final message array for LLM
    const messages = [
      new SystemMessage(systemPrompt),
      ...messagesToInclude,
    ];

    const response: any = await withTimeout(
      llmWithTools.invoke(messages),
      TIMEOUTS.AGENT,
      'Route agent timed out'
    );

    const agentDuration = Date.now() - agentStartTime;
    recordAgentTime('route_agent', agentDuration);
    recordAgentExecution('route_agent', agentDuration, true);

    console.log('✅ [ROUTE-AGENT] Node: LLM responded');
    if (response.tool_calls && response.tool_calls.length > 0) {
      console.log(`🔧 [ROUTE-AGENT] Agent wants to call: ${response.tool_calls.map((tc: any) => tc.name).join(', ')}`);
    } else {
      console.warn('⚠️ [ROUTE-AGENT] No tool calls made! LLM response:', typeof response.content === 'string' ? response.content.substring(0, 200) : 'Non-string content');
    }

    console.log(`✅ [ROUTE-AGENT] Completed successfully`);
    console.log(`   • Tools called: ${response.tool_calls?.map((tc: any) => tc.name).join(', ') || 'none'}`);
    console.log(`   • Duration: ${agentDuration}ms`);

    // NEW DEBUG LOGGING
    console.log(`📤 [ROUTE-AGENT] Returning to state:`);
    console.log(`   • Message type: ${response.constructor.name}`);
    console.log(`   • Has tool_calls: ${response.tool_calls ? 'YES' : 'NO'}`);
    if (response.tool_calls && response.tool_calls.length > 0) {
      console.log(`   • Tool call count: ${response.tool_calls.length}`);
      console.log(`   • Tool names: ${response.tool_calls.map((tc: any) => tc.name).join(', ')}`);
      console.log(`   • Tool IDs: ${response.tool_calls.map((tc: any) => tc.id).join(', ')}`);
    }
    console.log(`   • State updates: ${JSON.stringify(Object.keys(stateUpdates))}`);

    return { ...stateUpdates, messages: [response], agent_status: { route_agent: 'success' } };
  } catch (error) {
    const agentDuration = Date.now() - agentStartTime;
    recordAgentTime('route_agent', agentDuration);
    recordAgentExecution('route_agent', agentDuration, false);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('timed out');
    const isApiError = errorMessage.includes('Maritime Route API') || 
                       errorMessage.includes('TIMEOUT_ERROR') ||
                       errorMessage.includes('NETWORK_ERROR') ||
                       errorMessage.includes('API_ERROR');
    
    console.error(`❌ [ROUTE-AGENT] Node error: ${errorMessage}`);
    
    // If API failed, try to fallback to cached routes
    if (isApiError && extractedOriginPort && extractedDestinationPort) {
      console.log(`🔄 [ROUTE-AGENT] API failed, attempting fallback to cached routes for ${extractedOriginPort} → ${extractedDestinationPort}`);
      const cachedResult = await tryUseCachedRoute(extractedOriginPort, extractedDestinationPort);
      if (cachedResult) {
        console.log(`✅ [ROUTE-AGENT] Successfully using cached route as fallback`);
        recordAgentExecution('route_agent', agentDuration, true);
        return cachedResult;
      } else {
        console.warn(`⚠️ [ROUTE-AGENT] No cached route found for ${extractedOriginPort} → ${extractedDestinationPort}`);
      }
    }
    
    console.error(`❌ [ROUTE-AGENT] Route agent failed - cannot proceed without route data`);
    
    // Route agent failure is critical - mark as failed
    return {
      agent_status: { route_agent: 'failed' },
      agent_errors: {
        route_agent: {
          error: isTimeout ? 'Route agent timed out after 30 seconds' : errorMessage,
          timestamp: Date.now(),
        },
      },
      messages: [
        new SystemMessage(
          `Route agent encountered an error: ${errorMessage}. Cannot proceed without route data.`
        ),
      ],
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
export async function weatherAgentNode(
  state: MultiAgentState
): Promise<Partial<MultiAgentState>> {
  console.log("\n🌊 [WEATHER-AGENT] Node: Starting weather analysis...");
  const agentStartTime = Date.now();
  
  // Count previous attempts
  const weatherMessages = state.messages.filter(m => 
    m.additional_kwargs?.agent_name === 'weather_agent' ||
    (typeof m.content === 'string' && m.content.includes('[WEATHER-AGENT]'))
  ).length;

  console.log(`🔢 [WEATHER-AGENT] This is attempt #${weatherMessages + 1}`);

  // If 3+ attempts with no progress, bail out
  if (weatherMessages >= 3 && !state.weather_forecast) {
    console.log("⚠️ [WEATHER-AGENT] 3+ attempts with no progress - returning to supervisor");
    return {
      weather_agent_partial: true,
      messages: [new AIMessage({
        content: "[WEATHER-AGENT] Unable to fetch weather data - continuing without weather",
        additional_kwargs: { agent_name: 'weather_agent' }
      })],
    };
  }
  
  // NEW: Early validation - if we already calculated consumption, return success
  if (state.weather_forecast && state.weather_consumption) {
    console.log('✅ [WEATHER-AGENT] Weather consumption already calculated - skipping');
    return {
      agent_status: { ...(state.agent_status || {}), weather_agent: 'success' }
    };
  }
  
  // NEW: Validate vessel_timeline exists and has data
  if (!state.vessel_timeline || state.vessel_timeline.length === 0) {
    console.error('❌ [WEATHER-AGENT] No vessel_timeline in state - cannot proceed');
    return {
      agent_status: { ...(state.agent_status || {}), weather_agent: 'failed' },
      agent_errors: {
        ...(state.agent_errors || {}),
        weather_agent: {
          error: 'No vessel_timeline available in state',
          timestamp: Date.now(),
        },
      },
    };
  }
  
  console.log(`✅ [WEATHER-AGENT] vessel_timeline validated: ${state.vessel_timeline.length} positions`);
  
  // FIRST: Check if we have tool results to extract (like route agent does)
  console.log(`🔍 [WEATHER-AGENT] Checking for tool results in ${state.messages.length} messages`);
  const toolMessages = state.messages.filter(m => m instanceof ToolMessage);
  console.log(`🔍 [WEATHER-AGENT] Found ${toolMessages.length} ToolMessages`);
  
  // Also check for AIMessages with weather tool calls to find corresponding ToolMessages
  const weatherToolCalls = state.messages
    .filter(m => m instanceof AIMessage && m.tool_calls && m.tool_calls.length > 0)
    .flatMap(m => (m as AIMessage).tool_calls || [])
    .filter((tc: any) => tc.name === 'fetch_marine_weather' || tc.name === 'calculate_weather_consumption');
  
  if (weatherToolCalls.length > 0) {
    console.log(`🔍 [WEATHER-AGENT] Found ${weatherToolCalls.length} weather tool calls in AIMessages`);
    weatherToolCalls.forEach((tc: any, idx: number) => {
      console.log(`🔍 [WEATHER-AGENT] Tool call ${idx + 1}: ${tc.name}, id: ${tc.id}`);
    });
  }
  
  const extractedData = extractWeatherDataFromMessages(state.messages);
  const stateUpdates: any = {};
  
  if (extractedData.weather_forecast && !state.weather_forecast) {
    stateUpdates.weather_forecast = extractedData.weather_forecast;
    console.log(`✅ [WEATHER-AGENT] Extracted weather_forecast from tool results (${extractedData.weather_forecast.length} points)`);
  }
  
  if (extractedData.weather_consumption && !state.weather_consumption) {
    stateUpdates.weather_consumption = extractedData.weather_consumption;
    console.log('✅ [WEATHER-AGENT] Extracted weather_consumption from tool results');
  }
  
  if (extractedData.port_weather_status && !state.port_weather_status) {
    stateUpdates.port_weather_status = extractedData.port_weather_status;
    console.log('✅ [WEATHER-AGENT] Extracted port_weather_status from tool results');
  }
  
  // Get agent context from supervisor (needed for early return check)
  const context = state.agent_context?.weather_agent;
  const needsConsumption = context?.needs_consumption ?? false;
  const needsPortWeather = context?.needs_port_weather ?? false;
  const requiredTools = context?.required_tools || [];
  
  // If we got weather forecast from tool results, check if we still need consumption
  if (extractedData.weather_forecast) {
    console.log('✅ [WEATHER-AGENT] Weather forecast extracted');
    
    // If consumption is needed and not yet calculated, continue to LLM to call calculate_weather_consumption
    if (needsConsumption && !state.weather_consumption && !extractedData.weather_consumption) {
      console.log('⏭️ [WEATHER-AGENT] Weather forecast extracted, but consumption still needed - continuing to LLM');
      
      // Check for consecutive fetch_marine_weather calls (loop detection)
      const recentMessages = state.messages.slice(-5);
      const consecutiveWeatherFetches = recentMessages.filter(msg => {
        if (msg instanceof AIMessage && msg.tool_calls) {
          return msg.tool_calls.some((tc: any) => tc.name === 'fetch_marine_weather');
        }
        return false;
      }).length;
      
      if (consecutiveWeatherFetches >= 2 && extractedData.weather_forecast) {
        console.log('⚠️ [WEATHER-AGENT] Detected loop: fetch_marine_weather called multiple times despite having forecast - forcing consumption calculation');
        // Force consumption calculation by adding explicit instruction message
        const instructionMessage = new HumanMessage(
          `Weather forecast has been successfully fetched (${extractedData.weather_forecast.length} points). ` +
          `You MUST now call calculate_weather_consumption tool. Do NOT call fetch_marine_weather again.`
        );
        // Continue to LLM with this instruction
      }
    } else {
      // Weather forecast extracted and consumption either not needed or already calculated
      console.log('✅ [WEATHER-AGENT] Weather forecast extracted, returning state update');
      return { 
        ...stateUpdates, 
        agent_status: { ...(state.agent_status || {}), weather_agent: 'success' } 
      };
    }
  }
  
  // Count how many times we've been called by checking AIMessages from weather agent
  // Count AIMessages that don't have tool_calls (failed attempts)
  const failedWeatherAttempts = state.messages.filter(m => {
    if (m instanceof AIMessage) {
      const content = m.content?.toString() || '';
      const isWeatherAgent = content.includes('[WEATHER-AGENT]') || 
                            (m.tool_calls && m.tool_calls.some((tc: any) => 
                              tc.name === 'fetch_marine_weather' || 
                              tc.name === 'calculate_weather_consumption'));
      // Count as failed if it's a weather agent message without tool calls
      return isWeatherAgent && (!m.tool_calls || m.tool_calls.length === 0);
    }
    return false;
  }).length;
  
  console.log(`🔢 [WEATHER-AGENT] Failed attempts: ${failedWeatherAttempts}`);
  console.log(`📋 [WEATHER-AGENT] Context: needs_consumption=${needsConsumption}, needs_port_weather=${needsPortWeather}, required_tools=${requiredTools.join(', ') || 'none'}`);
  
  // HARD LIMIT: If we've failed 2+ times with no progress, mark as failed and return
  // This prevents infinite loops
  if (failedWeatherAttempts >= 2 && !state.weather_forecast) {
    console.log("⚠️ [WEATHER-AGENT] Hard limit reached (2 failed attempts) - marking as failed and returning to supervisor");
    return {
      agent_status: { ...(state.agent_status || {}), weather_agent: 'failed' },
      agent_errors: {
        ...(state.agent_errors || {}),
        weather_agent: {
          error: 'Weather agent failed to call tools after multiple attempts. This may be due to LLM issues or tool execution problems.',
          timestamp: Date.now(),
        },
      },
      messages: [new AIMessage("[WEATHER-AGENT] Unable to fetch weather data after multiple attempts - continuing without weather analysis")],
    };
  }
  
  // Use tiered LLM (GPT-4o-mini for simple tool calling)
  const weatherAgentLLM = LLMFactory.getLLMForAgent('weather_agent', state.agent_context || undefined);
  
  // STRICT ORCHESTRATION: Enforce supervisor tool assignments
  // Agents can ONLY use tools assigned by supervisor - no fallback to all tools
  if (requiredTools.length === 0) {
    console.error('❌ [WEATHER-AGENT] No tools assigned by supervisor - cannot proceed');
    return {
      agent_status: { weather_agent: 'failed' },
      agent_errors: {
        weather_agent: {
          error: 'No tools assigned by supervisor. Supervisor must assign tools before agent can execute.',
          timestamp: Date.now(),
        },
      },
      messages: [new AIMessage('[WEATHER-AGENT] Cannot proceed - supervisor has not assigned any tools')],
    };
  }
  
  // Map tool names to actual tool objects (only weather agent's tools)
  const toolMap: Record<string, any> = {
    'fetch_marine_weather': fetchMarineWeatherTool,
    'calculate_weather_consumption': calculateWeatherConsumptionTool,
    'check_bunker_port_weather': checkPortWeatherTool,
  };
  
  // STRICT: Only use supervisor-assigned tools
  console.log(`✅ [WEATHER-AGENT] Using supervisor-specified tools: ${requiredTools.join(', ')}`);
  const weatherTools = requiredTools
    .map(toolName => toolMap[toolName])
    .filter(Boolean); // Remove undefined
  
  if (weatherTools.length === 0) {
    console.error('❌ [WEATHER-AGENT] Supervisor assigned tools but none matched weather agent tools');
    return {
      agent_status: { weather_agent: 'failed' },
      agent_errors: {
        weather_agent: {
          error: `Supervisor assigned invalid tools: ${requiredTools.join(', ')}. Weather agent only has: fetch_marine_weather, calculate_weather_consumption, check_bunker_port_weather`,
          timestamp: Date.now(),
        },
      },
      messages: [new AIMessage('[WEATHER-AGENT] Invalid tool assignments from supervisor')],
    };
  }
  
  // Validate all assigned tools belong to weather agent
  const invalidTools = requiredTools.filter(toolName => !toolMap[toolName]);
  if (invalidTools.length > 0) {
    console.error(`❌ [WEATHER-AGENT] Supervisor assigned tools from other agents: ${invalidTools.join(', ')}`);
    return {
      agent_status: { weather_agent: 'failed' },
      agent_errors: {
        weather_agent: {
          error: `Supervisor assigned tools from other agents: ${invalidTools.join(', ')}. Weather agent cannot use other agents' tools.`,
          timestamp: Date.now(),
        },
      },
      messages: [new AIMessage('[WEATHER-AGENT] Cannot use tools from other agents')],
    };
  }
  
  console.log(`🔧 [WEATHER-AGENT] Tool selection: ${weatherTools.length} tools`);
  console.log(`🔧 [WEATHER-AGENT] Tools: ${weatherTools.map(t => t.name).join(', ')}`);
  
  console.log("📊 [WEATHER-AGENT] State available:", {
    vessel_timeline: !!state.vessel_timeline,
    vessel_timeline_length: state.vessel_timeline?.length,
    bunker_ports: !!state.bunker_ports,
    bunker_ports_length: state.bunker_ports?.length
  });
  
  // If no vessel timeline, we can't do anything
  if (!state.vessel_timeline || state.vessel_timeline.length === 0) {
    console.log("⚠️ [WEATHER-AGENT] No vessel timeline available - cannot fetch weather");
    return {
      messages: [new AIMessage("[WEATHER-AGENT] No vessel timeline available - skipping weather analysis")],
    };
  }
  
  // If we already have all weather data, we're done
  if (state.weather_forecast && state.weather_consumption) {
    console.log("✅ [WEATHER-AGENT] Weather data already complete, skipping");
    return {
      agent_status: { ...(state.agent_status || {}), weather_agent: 'success' }
    };
  }
  
  // STRICT ORCHESTRATION: No direct tool calling - all tools must go through LLM binding
  // This ensures supervisor has full control and agents follow the assigned tool plan
  
  const llmWithTools = (weatherAgentLLM as any).bindTools(weatherTools);
  
  // MUCH MORE DIRECTIVE SYSTEM PROMPT - Be extremely explicit
  // Show first 2 positions as example format only
  const samplePositions = state.vessel_timeline.slice(0, 2).map((pos: any) => ({
    lat: pos.lat,
    lon: pos.lon,
    datetime: pos.datetime
  }));
  
  // Build system prompt - be extremely explicit and directive
  // Use the same variables declared earlier for tool selection
  const hasWeatherForecast = state.weather_forecast || extractedData.weather_forecast;
  const needsConsumptionCalc = needsConsumption && !state.weather_consumption && !extractedData.weather_consumption;
  
  let systemPrompt = `You are the Weather Intelligence Agent for maritime bunker planning.

CRITICAL: You MUST call tools - do not respond with text only.

Current State Analysis:
${state.vessel_timeline 
  ? `✅ Vessel timeline: ${state.vessel_timeline.length} positions available` 
  : `❌ No vessel timeline - cannot proceed`}
${hasWeatherForecast 
  ? `✅ Weather forecast: Already fetched (${hasWeatherForecast.length || 'available'} points)` 
  : `❌ Weather forecast: NOT FETCHED`}
${state.weather_consumption 
  ? `✅ Weather consumption: Already calculated` 
  : `❌ Weather consumption: NOT CALCULATED`}

MANDATORY ACTION SEQUENCE:

STEP 1: If vessel_timeline exists AND weather_forecast is null:
→ IMMEDIATELY call fetch_marine_weather tool
→ Input format: { "positions": [array of vessel_timeline positions] }

STEP 2: If weather_forecast exists AND weather_consumption is null:
→ IMMEDIATELY call calculate_weather_consumption tool
→ Input: weather_forecast data + base_consumption_mt (750)

STEP 3: If both weather_forecast AND weather_consumption exist:
→ Your work is COMPLETE - return to supervisor

DO NOT respond with explanatory text. CALL THE REQUIRED TOOL IMMEDIATELY.`;

  // Add explicit instruction if weather forecast exists but consumption is needed
  if (hasWeatherForecast && needsConsumptionCalc) {
    systemPrompt += `\n\n⚠️ CRITICAL: Weather forecast is already available. You MUST call calculate_weather_consumption tool NOW. Do NOT call fetch_marine_weather again - it has already been fetched.`;
  }

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
    
    // SIMPLIFIED: Only include user query and vessel timeline - nothing else
    // This gives the LLM a clean context without confusing route agent responses
    const userMessage = messagesWithoutSystem[lastHumanMessageIndex >= 0 ? lastHumanMessageIndex : 0];
    
    // Get user query for message
    const userQueryForMessage = userMessage instanceof HumanMessage 
      ? (typeof userMessage.content === 'string' ? userMessage.content : String(userMessage.content))
      : 'Get weather for route';
    
    // NEW: Explicitly inject vessel_timeline data into agent's context
    // CRITICAL FIX: Sample timeline instead of sending all positions (reduces LLM processing time from ~85s to ~10-15s)
    // Send only a sample (5-7 positions) to show structure, then instruct LLM to batch tool calls
    const vesselTimelineForAgent = (() => {
      const timeline = state.vessel_timeline;
      if (!timeline || timeline.length === 0) return [];
      
      // Sample: first, last, and 3-5 evenly distributed middle positions
      const sampleSize = Math.min(7, timeline.length);
      const step = timeline.length > 7 ? Math.floor(timeline.length / (sampleSize - 2)) : 1;
      
      const sampled: any[] = [];
      // Always include first position
      sampled.push({
        lat: timeline[0].lat,
        lon: timeline[0].lon,
        datetime: timeline[0].datetime
      });
      
      // Sample middle positions evenly
      for (let i = step; i < timeline.length - step; i += step) {
        if (sampled.length >= sampleSize - 1) break; // Reserve space for last
        sampled.push({
          lat: timeline[i].lat,
          lon: timeline[i].lon,
          datetime: timeline[i].datetime
        });
      }
      
      // Always include last position
      if (timeline.length > 1) {
        sampled.push({
          lat: timeline[timeline.length - 1].lat,
          lon: timeline[timeline.length - 1].lon,
          datetime: timeline[timeline.length - 1].datetime
        });
      }
      
      return sampled;
    })();
    
    // If weather forecast exists but consumption is needed, include weather forecast data
    const weatherForecastForAgent = (state.weather_forecast || extractedData.weather_forecast)?.map((w: any) => ({
      datetime: w.datetime || w.position?.datetime,
      weather: {
        wave_height_m: w.weather?.wave_height_m || w.position?.weather?.wave_height_m,
        wind_speed_knots: w.weather?.wind_speed_knots || w.position?.weather?.wind_speed_knots,
        wind_direction_deg: w.weather?.wind_direction_deg || w.position?.weather?.wind_direction_deg,
        sea_state: w.weather?.sea_state || w.position?.weather?.sea_state
      }
    })) || [];
    
    // Use the same variables declared earlier for tool selection
    // Create explicit state context message
    // CRITICAL FIX: Instruct LLM to batch tool calls instead of sending all positions at once
    let stateContextText = `CRITICAL STATE DATA:
      
vessel_timeline is available:
Total positions: ${state.vessel_timeline.length}
Sample positions (structure example - showing ${vesselTimelineForAgent.length} of ${state.vessel_timeline.length}):
${JSON.stringify(vesselTimelineForAgent, null, 2)}

🚨 CRITICAL INSTRUCTION FOR fetch_marine_weather:
You have ${state.vessel_timeline.length} total positions in vessel_timeline.
DO NOT send all ${state.vessel_timeline.length} positions in a single tool call.
Instead, you MUST call fetch_marine_weather MULTIPLE TIMES with batches of 25 positions each.

Batching strategy:
1. Split the ${state.vessel_timeline.length} positions into batches of 25
2. Call fetch_marine_weather for batch 1 (positions 0-24)
3. Call fetch_marine_weather for batch 2 (positions 25-49)
4. Continue until all positions are processed
5. The tool will return weather data for each batch
6. After all batches complete, call calculate_weather_consumption with ALL combined weather data

Example: If you have 142 positions, make 6 tool calls:
- Call 1: positions 0-24 (25 positions)
- Call 2: positions 25-49 (25 positions)
- Call 3: positions 50-74 (25 positions)
- Call 4: positions 75-99 (25 positions)
- Call 5: positions 100-124 (25 positions)
- Call 6: positions 125-141 (17 positions)

Use the full vessel_timeline array from state (not just the sample above) when making tool calls.`;

    // If weather forecast exists and consumption is needed, include it
    if ((state.weather_forecast || extractedData.weather_forecast) && needsConsumption && !state.weather_consumption) {
      stateContextText += `\n\nweather_forecast is available (${weatherForecastForAgent.length} points):
Use this weather_forecast data to call calculate_weather_consumption:
${JSON.stringify(weatherForecastForAgent.slice(0, 5), null, 2)}${weatherForecastForAgent.length > 5 ? `\n... (${weatherForecastForAgent.length - 5} more points)` : ''}

IMPORTANT: You MUST call calculate_weather_consumption with the weather_forecast data provided above.
The weather_data parameter should be an array of objects with datetime and weather fields.`;
    }
    
    stateContextText += `\n\n${requiredTools.length > 0 
      ? `You MUST call these tools: ${requiredTools.join(', ')}. Use the data provided above.`
      : 'You MUST use this data to call the appropriate weather tools immediately.'}
DO NOT ask for this data - it is provided above.
Call the tool now with the data provided above.

REMEMBER: For fetch_marine_weather, call it multiple times with batches of 25 positions each.`;
    
    const stateContextMessage = new HumanMessage(stateContextText);
    
    // Minimal message context: system prompt + user query + explicit state injection
    const messages = [
      new SystemMessage(systemPrompt),
      userMessage instanceof HumanMessage ? userMessage : new HumanMessage(userQueryForMessage),
      stateContextMessage, // NEW: Explicit state injection
    ];
  
    console.log("🔧 [WEATHER-AGENT] Available tools before invoke:", 
      weatherTools.map(t => ({ name: t.name, description: (t.description || '').substring(0, 100) + '...' }))
    );
    console.log(`📝 [WEATHER-AGENT] Message count: ${messages.length}, Last message type: ${messages[messages.length - 1]?.constructor?.name}`);
    console.log(`📝 [WEATHER-AGENT] Message types: ${messages.map(m => m.constructor.name).join(' -> ')}`);
    
    // Check for loop: if weather_forecast exists but recent messages show fetch_marine_weather calls
    const recentAIMessages = state.messages.filter(m => m instanceof AIMessage).slice(-3);
    const recentWeatherFetches = recentAIMessages.filter(msg => {
      return (msg as AIMessage).tool_calls?.some((tc: any) => tc.name === 'fetch_marine_weather');
    }).length;
    
    if (hasWeatherForecast && recentWeatherFetches >= 1 && needsConsumptionCalc) {
      console.log('⚠️ [WEATHER-AGENT] Loop detected: fetch_marine_weather called when forecast exists - forcing consumption calculation');
      // Remove fetch_marine_weather from available tools temporarily, or add even stronger instruction
      systemPrompt += `\n\n🚨 LOOP PREVENTION: Weather forecast ALREADY EXISTS. You are FORBIDDEN from calling fetch_marine_weather. You MUST call calculate_weather_consumption immediately.`;
      // Rebuild messages with updated prompt
      messages[0] = new SystemMessage(systemPrompt);
    }
    
    // Use longer timeout for weather agent since it processes many positions
    const response: any = await withTimeout(
      llmWithTools.invoke(messages),
      TIMEOUTS.WEATHER_AGENT || TIMEOUTS.AGENT * 2, // 90 seconds for weather agent
      'Weather agent timed out'
    );
    
    // Post-invocation check: if LLM tried to call fetch_marine_weather when forecast exists, intercept it
    if (hasWeatherForecast && needsConsumptionCalc && response.tool_calls) {
      const fetchWeatherCall = response.tool_calls.find((tc: any) => tc.name === 'fetch_marine_weather');
      if (fetchWeatherCall) {
        console.log('⚠️ [WEATHER-AGENT] LLM tried to call fetch_marine_weather despite having forecast - intercepting and forcing consumption calculation');
        // Remove fetch_marine_weather call and replace with consumption calculation instruction
        response.tool_calls = response.tool_calls.filter((tc: any) => tc.name !== 'fetch_marine_weather');
        // Add a message instructing to call consumption instead
        const correctionMessage = new HumanMessage(
          'Weather forecast is already available. You MUST call calculate_weather_consumption tool, not fetch_marine_weather.'
        );
        // This will be handled by the tool router, but we've removed the problematic call
      }
    }
    
    // Log what the agent decided
    console.log("🤖 [WEATHER-AGENT] Agent response:", {
      hasToolCalls: !!response.tool_calls && response.tool_calls.length > 0,
      toolCallsCount: response.tool_calls?.length || 0,
      toolCalls: response.tool_calls?.map((tc: any) => tc.name) || [],
      messageType: response.constructor?.name || typeof response,
      content: typeof response.content === 'string' 
        ? response.content.substring(0, 200) 
        : JSON.stringify(response.content || '').substring(0, 200),
      hasAdditionalKwargs: !!response.additional_kwargs,
      additionalKwargsKeys: Object.keys(response.additional_kwargs || {})
    });
    
    // If still no tool calls after directive prompt, something is wrong
    // Fail immediately if no tool calls - don't retry with text responses
    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.log("⚠️ [WEATHER-AGENT] No tool calls in response!");
      
      // Fail immediately if no tool calls - don't retry with text responses
      if (failedWeatherAttempts >= 0) {
        console.log("⚠️ [WEATHER-AGENT] LLM failed to call tools - marking as failed immediately");
        return {
          agent_status: { ...(state.agent_status || {}), weather_agent: 'failed' },
          agent_errors: {
            ...(state.agent_errors || {}),
            weather_agent: {
              error: 'LLM failed to call weather tools. This may indicate an LLM configuration issue.',
              timestamp: Date.now(),
            },
          },
          messages: [new AIMessage("[WEATHER-AGENT] No tools called - returning to supervisor")],
        };
      }
    }
    
    const agentDuration = Date.now() - agentStartTime;
    console.log(`✅ [WEATHER-AGENT] Completed successfully`);
    console.log(`   • Tools called: ${response.tool_calls?.map((tc: any) => tc.name).join(', ') || 'none'}`);
    console.log(`   • Duration: ${agentDuration}ms`);
    
    // NEW DEBUG LOGGING
    console.log(`📤 [WEATHER-AGENT] Returning to state:`);
    console.log(`   • Message type: ${response.constructor.name}`);
    console.log(`   • Has tool_calls: ${response.tool_calls ? 'YES' : 'NO'}`);
    if (response.tool_calls && response.tool_calls.length > 0) {
      console.log(`   • Tool call count: ${response.tool_calls.length}`);
      console.log(`   • Tool names: ${response.tool_calls.map((tc: any) => tc.name).join(', ')}`);
      console.log(`   • Tool IDs: ${response.tool_calls.map((tc: any) => tc.id).join(', ')}`);
    }
    console.log(`   • State updates: ${JSON.stringify(Object.keys(stateUpdates))}`);
    
    return {
      messages: [response as any],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ [WEATHER-AGENT] Error:', errorMessage);
    
    // Check if we got ANY weather data before timeout
    if (state.weather_forecast && state.weather_forecast.length > 0) {
      console.warn('⚠️ [WEATHER-AGENT] Partial data available, marking as partial');
      return {
        weather_agent_partial: true,
        agent_status: { ...(state.agent_status || {}), weather_agent: 'success' },
        messages: [new AIMessage("[WEATHER-AGENT] Partial weather data available - continuing")],
      };
    }
    
    // No data available - return error message
    return {
      messages: [new AIMessage(`[WEATHER-AGENT] Error: ${errorMessage} - returning to supervisor`)],
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
  description: 'Calculates maritime routes between ports and generates vessel position timeline for weather analysis',
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
  description: 'Fetches marine weather forecasts, calculates weather-adjusted fuel consumption, and validates bunker port weather safety',
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

