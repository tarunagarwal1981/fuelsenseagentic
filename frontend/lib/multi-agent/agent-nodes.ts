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
} from './optimizations';
import {
  recordAgentExecution,
  recordToolCall,
} from './monitoring';

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
// LLM Configuration
// ============================================================================

// Validate API key is present
if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error(
    'ANTHROPIC_API_KEY environment variable is not set. Please configure it in Netlify environment variables.'
  );
}

// Create LLM instance with Claude Sonnet 4
const MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-20250514';

const baseLLM = new ChatAnthropic({
  model: MODEL,
  temperature: 0,
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

  // ADD THIS: Loop detection
  const messageCount = state.messages.length;
  console.log(`📊 [SUPERVISOR] Message count: ${messageCount}`);
  
  // If we have more than 20 messages and still no progress, force finalize
  if (messageCount > 20) {
    console.log("⚠️ [SUPERVISOR] Loop detected (20+ messages) - forcing finalize");
    return {
      next_agent: "finalize",
      messages: [],
    };
  }
  
  // Early detection: If we have 10+ messages and weather is needed but missing, likely stuck
  // (This catches stuck weather agent earlier)
  if (messageCount >= 10 && state.route_data && !state.weather_forecast && !state.weather_consumption) {
    // Get intent first to decide what to do
    const userMsg = state.messages.find((msg) => msg instanceof HumanMessage);
    const query = userMsg 
      ? (typeof userMsg.content === 'string' ? userMsg.content : String(userMsg.content))
      : '';
    const queryLower = query.toLowerCase();
    const needsWeather = ['weather', 'forecast', 'consumption', 'conditions', 'wind', 'wave'].some(k => queryLower.includes(k));
    const needsBunker = ['bunker', 'fuel', 'port', 'price', 'cheapest'].some(k => queryLower.includes(k));
    
    if (needsWeather && !needsBunker) {
      console.log("⚠️ [SUPERVISOR] Early detection: Weather stuck (10+ messages, no weather data) - finalizing");
      return {
        next_agent: "finalize",
        messages: [],
      };
    }
  }

  // Get user query to analyze intent FIRST (before checking stuck agents)
  const userMessage = state.messages.find((msg) => msg instanceof HumanMessage);
  const userQuery = userMessage 
    ? (typeof userMessage.content === 'string' ? userMessage.content : String(userMessage.content))
    : state.messages[0]?.content?.toString() || 'Plan bunker route';
  
  const userQueryLower = userQuery.toLowerCase();
  
  // Analyze user intent - what do they actually need?
  const needsRoute = !state.route_data || !state.vessel_timeline;
  
  const needsWeather = [
    'weather', 'forecast', 'consumption', 'conditions', 'wind', 'wave', 
    'storm', 'gale', 'seas', 'swell', 'meteorological', 'climate'
  ].some(keyword => userQueryLower.includes(keyword));
  
  const needsBunker = [
    'bunker', 'fuel', 'port', 'price', 'cheapest', 'cost', 'refuel',
    'bunkering', 'fueling', 'vlsfo', 'mgo', 'diesel', 'optimization',
    'best option', 'recommendation', 'compare', 'savings'
  ].some(keyword => userQueryLower.includes(keyword));

  // NEW LOGIC: Check if weather agent is stuck
  // Better detection: If route is complete, weather is needed, but weather data doesn't exist
  // AND we've been through supervisor multiple times, we're likely stuck
  const routeComplete = state.route_data && state.vessel_timeline;
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
      if (isEmpty && routeComplete) {
        return true;
      }
    }
    return false;
  }).length;
  
  // Also check agent_status for weather_agent failures
  const weatherAgentFailed = state.agent_status?.weather_agent === 'failed';
  const weatherAgentPartial = state.weather_agent_partial === true;
  
  // If weather is needed but we've tried multiple times with no progress, or agent failed
  if (routeComplete && weatherNeededButMissing && (weatherAgentAttempts >= 3 || weatherAgentFailed)) {
    // If weather was needed but agent is stuck, check if we should skip or finalize
    if (needsWeather && !needsBunker) {
      // User only asked for weather, not bunker - finalize with what we have
      console.log(`⚠️ [SUPERVISOR] Weather agent stuck (${weatherAgentAttempts} attempts${weatherAgentFailed ? ', agent failed' : ''}) - finalizing with route data only`);
      return {
        next_agent: "finalize",
        messages: [],
      };
    } else if (needsBunker) {
      // User asked for bunker too - skip weather and go to bunker
      console.log(`⚠️ [SUPERVISOR] Weather agent stuck (${weatherAgentAttempts} attempts${weatherAgentFailed ? ', agent failed' : ''}) - skipping to bunker`);
      return {
        next_agent: "bunker_agent",
        messages: [],
      };
    } else {
      // Neither weather nor bunker needed - shouldn't happen, but finalize
      console.log("⚠️ [SUPERVISOR] Weather agent stuck but not needed - finalizing");
      return {
        next_agent: "finalize",
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
        messages: [],
      };
    } else {
      console.log('🎯 [SUPERVISOR] Weather partial, all requested work done → finalize');
      return {
        next_agent: "finalize",
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
  
  // DETERMINISTIC DECISION LOGIC - Based on actual needs, not fixed sequence
  
  // 1. If route is needed and not available, get route first
  if (needsRoute && (!state.route_data || !state.vessel_timeline)) {
    console.log('🎯 [SUPERVISOR] Decision: Route needed but missing → route_agent');
    return {
      next_agent: "route_agent",
      messages: [],
    };
  }
  
  // 2. If route is complete, check what else is needed based on query intent
  if (state.route_data && state.vessel_timeline) {
    // Priority 1: Weather is needed and not done
    if (needsWeather && !state.weather_forecast && !state.weather_consumption) {
      console.log('🎯 [SUPERVISOR] Decision: Weather needed and not done → weather_agent');
      return {
        next_agent: "weather_agent",
        messages: [],
      };
    }
    
    // Priority 2: Weather is complete, now check if bunker is needed
    if (needsWeather && state.weather_forecast && state.weather_consumption) {
      if (needsBunker && !state.bunker_analysis) {
        console.log('🎯 [SUPERVISOR] Decision: Weather complete, bunker needed → bunker_agent');
        return {
          next_agent: "bunker_agent",
          messages: [],
        };
      }
    }
    
    // Priority 3: Bunker is needed (and weather was not needed or is complete)
    if (needsBunker && !state.bunker_analysis) {
      // Only delegate to bunker if weather was not needed, or weather is complete
      const weatherNotNeeded = !needsWeather;
      const weatherComplete = needsWeather && state.weather_forecast && state.weather_consumption;
      
      if (weatherNotNeeded || weatherComplete) {
        console.log('🎯 [SUPERVISOR] Decision: Bunker needed and not done → bunker_agent');
        return {
          next_agent: "bunker_agent",
          messages: [],
        };
      }
    }
    
    // Priority 4: Check if all requested work is complete
    // If weather was not needed, consider it "complete"
    // If bunker was not needed, consider it "complete"
    const weatherComplete = !needsWeather || (state.weather_forecast && state.weather_consumption);
    const bunkerComplete = !needsBunker || state.bunker_analysis;
    
    if (weatherComplete && bunkerComplete) {
      console.log('🎯 [SUPERVISOR] Decision: All requested work complete → finalize');
      return {
        next_agent: "finalize",
        messages: [],
      };
    }
    
    // If we reach here, route exists but something is still needed
    // This shouldn't happen, but if it does, finalize with what we have
    console.log('🎯 [SUPERVISOR] Decision: Route complete, finalizing with available data');
    return {
      next_agent: "finalize",
      messages: [],
    };
  }
  
  // 4. Ultimate fallback: Get route
  console.log('🎯 [SUPERVISOR] Decision: Fallback → route_agent');
  return {
    next_agent: "route_agent",
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
  if (state.route_data && state.vessel_timeline) {
    console.log('✅ [ROUTE-AGENT] Route data already available, skipping');
    return { ...stateUpdates, agent_status: { route_agent: 'success' } };
  }

  const routeTools = [calculateRouteTool, calculateWeatherTimelineTool];
  const llmWithTools = baseLLM.bindTools(routeTools);

  // Get user's original message to understand what they want
  const userMessage = state.messages.find((msg) => msg instanceof HumanMessage);
  const userQuery = userMessage ? (typeof userMessage.content === 'string' ? userMessage.content : String(userMessage.content)) : '';

  // Extract port information from user query
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

STEP 2: After getting route result, call calculate_weather_timeline with:
{
  "waypoints": [use waypoints from calculate_route result],
  "vessel_speed_knots": 14,
  "departure_datetime": "${departureDate}",
  "sampling_interval_hours": 12
}

You MUST call these tools. Do not explain - just call the tools.`;

  try {
    // Build messages with system prompt and trimmed conversation history
    // CRITICAL: Anthropic API requires that AIMessage with tool_use is immediately followed by ToolMessages
    // Strategy: Include all messages from the last HumanMessage onwards to preserve tool_use/tool_result pairs
    const trimmedMessages = trimMessageHistory(state.messages);
    
    // Find the last HumanMessage (user query) - this is our starting point
    const lastHumanMessageIndex = trimmedMessages.findLastIndex(
      (msg) => msg instanceof HumanMessage
    );
    
    // Include all messages from the last HumanMessage onwards
    // This preserves the complete flow: HumanMessage -> AIMessage (with tool_use) -> ToolMessages (with tool_result)
    const messagesToInclude = lastHumanMessageIndex >= 0
      ? trimmedMessages.slice(lastHumanMessageIndex)
      : trimmedMessages; // Fallback: use all messages
    
    // Filter out SystemMessages (we'll add our own at the beginning)
    // Keep all other message types (HumanMessage, AIMessage, ToolMessage) to preserve tool call pairs
    const filteredMessages = messagesToInclude.filter(
      (msg) => !(msg instanceof SystemMessage)
    );
    
    const messages = [
      new SystemMessage(systemPrompt),
      ...filteredMessages,
    ];

    const response = await withTimeout(
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

    return { ...stateUpdates, messages: [response], agent_status: { route_agent: 'success' } };
  } catch (error) {
    const agentDuration = Date.now() - agentStartTime;
    recordAgentTime('route_agent', agentDuration);
    recordAgentExecution('route_agent', agentDuration, false);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('timed out');
    
    console.error(`❌ [ROUTE-AGENT] Node error: ${errorMessage}`);
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

  // Look for ToolMessages with weather data
  for (const msg of messages) {
    if (msg instanceof ToolMessage) {
      try {
        // Handle both string and object content (LangGraph may serialize automatically)
        let toolResult: any;
        if (typeof msg.content === 'string') {
          toolResult = JSON.parse(msg.content);
        } else {
          toolResult = msg.content;
        }
        
        // Check if this is weather forecast (array with forecast_confidence)
        if (Array.isArray(toolResult) && toolResult.length > 0 && toolResult[0].forecast_confidence) {
          result.weather_forecast = toolResult;
          console.log('📦 [WEATHER-AGENT] Extracted weather_forecast from tool result');
        }
        
        // Check if this is weather consumption (object with consumption_increase_percent)
        if (toolResult && typeof toolResult === 'object' && !Array.isArray(toolResult) && 'consumption_increase_percent' in toolResult) {
          result.weather_consumption = toolResult;
          console.log('📦 [WEATHER-AGENT] Extracted weather_consumption from tool result');
        }
        
        // Check if this is port weather status (array with bunkering_feasible)
        if (Array.isArray(toolResult) && toolResult.length > 0 && 'bunkering_feasible' in toolResult[0]) {
          result.port_weather_status = toolResult;
          console.log('📦 [WEATHER-AGENT] Extracted port_weather_status from tool result');
        }
      } catch (e) {
        // Not JSON or parse error, skip
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
  
  // Count how many times we've been called
  const weatherAgentMessages = state.messages.filter(m => 
    m.content?.toString().includes('[WEATHER-AGENT]')
  ).length;
  
  console.log(`🔢 [WEATHER-AGENT] Attempt number: ${weatherAgentMessages + 1}`);
  
  // If we've been called 3+ times with no progress, return null and let supervisor skip us
  if (weatherAgentMessages >= 3 && !state.weather_forecast) {
    console.log("⚠️ [WEATHER-AGENT] Multiple attempts with no progress - returning to supervisor");
    return {
      messages: [new AIMessage("[WEATHER-AGENT] Unable to fetch weather data - continuing without weather analysis")],
    };
  }
  
  // Use imported tools from tools.ts
  const weatherTools = [
    fetchMarineWeatherTool,
    calculateWeatherConsumptionTool,
    checkPortWeatherTool,
  ];
  
  // Check what data is available
  console.log("🔧 [WEATHER-AGENT] Tools available:", [
    'fetch_marine_weather',
    'calculate_weather_consumption',
    'check_bunker_port_weather'
  ]);
  
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
  
  const llmWithTools = baseLLM.bindTools(weatherTools);
  
  // MUCH MORE DIRECTIVE SYSTEM PROMPT
  const systemPrompt = `You are the Weather Agent. You have vessel timeline data.

IMMEDIATE ACTION REQUIRED:
${!state.weather_forecast 
  ? `1. Call fetch_marine_weather with ${state.vessel_timeline.length} vessel positions
     Use this EXACT format:
     {
       "positions": [the vessel_timeline array from state]
     }`
  : `1. ✅ Weather forecast already fetched`
}

${state.weather_forecast && !state.weather_consumption
  ? `2. Call calculate_weather_consumption with weather data
     Use base_consumption_mt: 750 MT (estimate)
     Use vessel_heading_deg: 45 (estimate)`
  : state.weather_consumption
    ? `2. ✅ Weather consumption already calculated`
    : `2. ⏸️ Waiting for weather forecast first`
}

DO NOT RESPOND WITH TEXT. CALL THE REQUIRED TOOL NOW.`;

  const messages = [
    new SystemMessage(systemPrompt),
    ...state.messages.slice(-3), // Last 3 messages for context
  ];
  
  console.log("🔧 [WEATHER-AGENT] Available tools before invoke:", 
    weatherTools.map(t => ({ name: t.name, description: (t.description || '').substring(0, 100) + '...' }))
  );
  
  try {
    const response = await withTimeout(
      llmWithTools.invoke(messages),
      TIMEOUTS.AGENT,
      'Weather agent timed out'
    );
    
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
    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.log("⚠️ [WEATHER-AGENT] No tool calls in response!");
      return {
        weather_forecast: null,
        weather_consumption: null,
        port_weather_status: null,
        messages: [new AIMessage("[WEATHER-AGENT] No tools called - returning to supervisor")],
      };
    }
    
    return {
      messages: [response],
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
 * Bunker Agent Node
 * 
 * Finds best bunker option using port finder, price fetcher, and bunker analyzer tools.
 */
export async function bunkerAgentNode(state: MultiAgentState) {
  console.log('⚓ [BUNKER-AGENT] Node: Starting bunker analysis...');
  const agentStartTime = Date.now();

  const bunkerTools = [findBunkerPortsTool, getFuelPricesTool, analyzeBunkerOptionsTool];
  const llmWithTools = baseLLM.bindTools(bunkerTools);

  const systemPrompt = `You are the Bunker Agent. Your role is to:
1. Find bunker ports along the route using route waypoints
2. Fetch current fuel prices for those ports
3. Analyze and rank bunker options based on total cost

Use find_bunker_ports with route waypoints.
Then use get_fuel_prices for the found ports.
Finally, use analyze_bunker_options to rank all options.

Be thorough and ensure you complete the full bunker optimization analysis.`;

  try {
    // Build messages with system prompt and trimmed conversation history
    // CRITICAL: Anthropic API requires that AIMessage with tool_use is immediately followed by ToolMessages
    // Strategy: Include all messages from the last HumanMessage onwards to preserve tool_use/tool_result pairs
    const trimmedMessages = trimMessageHistory(state.messages);
    
    // Find the last HumanMessage (user query) - this is our starting point
    const lastHumanMessageIndex = trimmedMessages.findLastIndex(
      (msg) => msg instanceof HumanMessage
    );
    
    // Include all messages from the last HumanMessage onwards
    // This preserves the complete flow: HumanMessage -> AIMessage (with tool_use) -> ToolMessages (with tool_result)
    const messagesToInclude = lastHumanMessageIndex >= 0
      ? trimmedMessages.slice(lastHumanMessageIndex)
      : trimmedMessages; // Fallback: use all messages
    
    // Filter out SystemMessages (we'll add our own at the beginning)
    // Keep all other message types (HumanMessage, AIMessage, ToolMessage) to preserve tool call pairs
    const filteredMessages = messagesToInclude.filter(
      (msg) => !(msg instanceof SystemMessage)
    );
    
    // Combine system prompt with context about available data
    let fullSystemPrompt = systemPrompt;
    if (state.route_data) {
      fullSystemPrompt += `\n\nAvailable data:
- Route waypoints: ${state.route_data.waypoints.length} waypoints
- Use route waypoints for find_bunker_ports`;
    }
    
    const messages = [
      new SystemMessage(fullSystemPrompt),
      ...filteredMessages,
    ];

    const response = await withTimeout(
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

    return { messages: [response], agent_status: { bunker_agent: 'success' } };
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

  // Check for errors and build context
  const agentErrors = state.agent_errors || {};
  const agentStatus = state.agent_status || {};
  const hasErrors = Object.keys(agentErrors).length > 0;
  
  let errorContext = '';
  if (hasErrors) {
    const errorList = Object.entries(agentErrors)
      .map(([agent, err]) => `- ${agent}: ${err.error}`)
      .join('\n');
    errorContext = `\n\n⚠️ Note: Some agents encountered errors:\n${errorList}\nPlease acknowledge these limitations in your recommendation.`;
  }

  // Build state context summary first
  const stateContext: string[] = [];

  if (state.route_data) {
    stateContext.push(
      `Route: ${state.route_data.distance_nm.toFixed(2)}nm, ${state.route_data.estimated_hours.toFixed(1)}h, ${state.route_data.route_type}`
    );
  }

  if (state.weather_consumption) {
    stateContext.push(
      `Weather Impact: +${state.weather_consumption.consumption_increase_percent.toFixed(2)}% consumption, ${state.weather_consumption.additional_fuel_needed_mt.toFixed(2)}MT additional fuel`
    );
  }

  if (state.bunker_analysis) {
    const best = state.bunker_analysis.best_option;
    stateContext.push(
      `Best Option: ${best.port_name} - Total cost: $${best.total_cost_usd.toFixed(2)}, Savings: $${state.bunker_analysis.max_savings_usd.toFixed(2)}`
    );
  }

  if (state.port_weather_status && state.port_weather_status.length > 0) {
    const portWeather = state.port_weather_status[0];
    stateContext.push(
      `Port Weather: ${portWeather.port_name} - ${portWeather.bunkering_feasible ? 'Feasible' : 'Not feasible'}, ${portWeather.weather_risk} risk`
    );
  }

  const stateSummary = stateContext.length > 0 ? `\n\nState Summary:\n${stateContext.join('\n')}` : '';

  const systemPrompt = `You are the Finalization Agent. Your role is to create a comprehensive bunker recommendation from all the collected data.

Available data:
- Route: ${state.route_data ? `${state.route_data.origin_port_code} → ${state.route_data.destination_port_code}` : 'Not available'}
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

Be clear, concise, and actionable.`;

  try {
    // Build comprehensive context for final synthesis with trimmed history
    // CRITICAL: Anthropic API requires that AIMessage with tool_use is immediately followed by ToolMessages
    // Strategy: Include all messages from the last HumanMessage onwards to preserve tool_use/tool_result pairs
    const trimmedMessages = trimMessageHistory(state.messages);
    
    // Find the last HumanMessage (user query) - this is our starting point
    const lastHumanMessageIndex = trimmedMessages.findLastIndex(
      (msg) => msg instanceof HumanMessage
    );
    
    // Include all messages from the last HumanMessage onwards
    // This preserves the complete flow: HumanMessage -> AIMessage (with tool_use) -> ToolMessages (with tool_result)
    const messagesToInclude = lastHumanMessageIndex >= 0
      ? trimmedMessages.slice(lastHumanMessageIndex)
      : trimmedMessages.slice(-10); // Fallback: last 10 messages
    
    // Filter out SystemMessages (we'll add our own at the beginning)
    // Keep all other message types (HumanMessage, AIMessage, ToolMessage) to preserve tool call pairs
    const filteredMessages = messagesToInclude.filter(
      (msg) => !(msg instanceof SystemMessage)
    );
    
    // CRITICAL: Only ONE SystemMessage allowed, and it must be first
    const messages = [
      new SystemMessage(systemPrompt),
      ...filteredMessages,
    ];

    const response = await withTimeout(
      baseLLM.invoke(messages),
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

