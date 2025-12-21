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

// Weather Agent Tools
const fetchMarineWeatherTool = tool(
  async (input) => {
    console.log('🌊 [WEATHER-AGENT] Executing fetch_marine_weather');
    const startTime = Date.now();
    
    try {
      const result = await withTimeout(
        executeMarineWeatherTool(input),
        TIMEOUTS.WEATHER_API,
        'Marine weather API timed out'
      );
      
      const duration = Date.now() - startTime;
      recordToolCallTime('fetch_marine_weather', duration);
      return result;
    } catch (error: any) {
      console.error('❌ [WEATHER-AGENT] Marine weather error:', error.message);
      throw error;
    }
  },
  {
    name: 'fetch_marine_weather',
    description:
      'Fetch marine weather forecast for vessel positions. Returns wave height, wind speed, wind direction, and sea state.',
    schema: marineWeatherInputSchema,
  }
);

const calculateWeatherConsumptionTool = tool(
  async (input) => {
    console.log('⛽ [WEATHER-AGENT] Executing calculate_weather_consumption');
    try {
      return await executeWeatherConsumptionTool(input);
    } catch (error: any) {
      console.error('❌ [WEATHER-AGENT] Weather consumption error:', error.message);
      throw error;
    }
  },
  {
    name: 'calculate_weather_consumption',
    description:
      'Calculate fuel consumption adjusted for weather conditions. Returns adjusted consumption, additional fuel needed, and weather alerts.',
    schema: weatherConsumptionInputSchema,
  }
);

const checkBunkerPortWeatherTool = tool(
  async (input) => {
    console.log('⚓ [WEATHER-AGENT] Executing check_bunker_port_weather');
    try {
      return await executePortWeatherTool(input);
    } catch (error: any) {
      console.error('❌ [WEATHER-AGENT] Port weather error:', error.message);
      throw error;
    }
  },
  {
    name: 'check_bunker_port_weather',
    description:
      'Check if bunker ports have safe weather conditions for bunkering. Returns feasibility, risk level, and recommendations.',
    schema: portWeatherInputSchema,
  }
);

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
 */
export async function supervisorAgentNode(state: MultiAgentState) {
  console.log('🎯 [SUPERVISOR] Node: Making routing decision...');
  console.log(`📊 [SUPERVISOR] Current state:`);
  console.log(`   - Route data: ${state.route_data ? '✅' : '❌'}`);
  console.log(`   - Vessel timeline: ${state.vessel_timeline ? '✅' : '❌'}`);
  console.log(`   - Weather forecast: ${state.weather_forecast ? '✅' : '❌'}`);
  console.log(`   - Weather consumption: ${state.weather_consumption ? '✅' : '❌'}`);
  console.log(`   - Port weather: ${state.port_weather_status ? '✅' : '❌'}`);
  console.log(`   - Bunker ports: ${state.bunker_ports ? '✅' : '❌'}`);
  console.log(`   - Port prices: ${state.port_prices ? '✅' : '❌'}`);
  console.log(`   - Bunker analysis: ${state.bunker_analysis ? '✅' : '❌'}`);

  let nextAgent = '';

  // Decision logic: check what data is available
  if (!state.route_data) {
    // No route yet - delegate to route agent
    nextAgent = 'route_agent';
    console.log('🎯 [SUPERVISOR] Decision: Route to route_agent (no route data)');
  } else if (!state.weather_forecast || !state.weather_consumption) {
    // Have route but no weather analysis - delegate to weather agent
    nextAgent = 'weather_agent';
    console.log('🎯 [SUPERVISOR] Decision: Route to weather_agent (no weather data)');
  } else if (!state.bunker_analysis) {
    // Have route and weather but no bunker analysis - delegate to bunker agent
    nextAgent = 'bunker_agent';
    console.log('🎯 [SUPERVISOR] Decision: Route to bunker_agent (no bunker analysis)');
  } else {
    // All data complete - go to finalize
    nextAgent = 'finalize';
    console.log('🎯 [SUPERVISOR] Decision: Route to finalize (all data complete)');
  }

  const systemMessage = new SystemMessage(
    `You are the Supervisor Agent. Your role is to coordinate the multi-agent system.
    
Current state:
- Route data: ${state.route_data ? 'Available' : 'Not available'}
- Weather data: ${state.weather_forecast ? 'Available' : 'Not available'}
- Bunker analysis: ${state.bunker_analysis ? 'Available' : 'Not available'}

Your decision: Route to ${nextAgent}.`

  );

  return {
    next_agent: nextAgent,
    messages: [systemMessage],
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
    return stateUpdates;
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

    return { ...stateUpdates, messages: [response] };
  } catch (error) {
    const agentDuration = Date.now() - agentStartTime;
    recordAgentTime('route_agent', agentDuration);
    recordAgentExecution('route_agent', agentDuration, false);
    console.error('❌ [ROUTE-AGENT] Node error:', error);
    throw error;
  }
}

/**
 * Weather Agent Node
 * 
 * Analyzes weather impact using marine weather, consumption, and port weather tools.
 */
export async function weatherAgentNode(state: MultiAgentState) {
  console.log('🌊 [WEATHER-AGENT] Node: Starting weather analysis...');
  const agentStartTime = Date.now();

  const weatherTools = [
    fetchMarineWeatherTool,
    calculateWeatherConsumptionTool,
    checkBunkerPortWeatherTool,
  ];
  const llmWithTools = baseLLM.bindTools(weatherTools);

  const systemPrompt = `You are the Weather Agent. Your role is to:
1. Fetch marine weather forecasts for vessel positions from the timeline
2. Calculate weather-adjusted fuel consumption based on conditions
3. Check bunker port weather conditions for safe bunkering

Use fetch_marine_weather with vessel positions from the timeline.
Then use calculate_weather_consumption with the weather data.
Finally, use check_bunker_port_weather for any identified bunker ports.

Be thorough and ensure you complete all weather analysis steps.`;

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
    if (state.route_data && state.vessel_timeline) {
      fullSystemPrompt += `\n\nAvailable data:
- Route: ${state.route_data.origin_port_code} → ${state.route_data.destination_port_code}
- Vessel timeline: ${state.vessel_timeline.length} positions
- Use vessel_timeline positions for weather forecast`;
    }
    
    const messages = [
      new SystemMessage(fullSystemPrompt),
      ...filteredMessages,
    ];

    const response = await withTimeout(
      llmWithTools.invoke(messages),
      TIMEOUTS.AGENT,
      'Weather agent timed out'
    );

      const agentDuration = Date.now() - agentStartTime;
      recordAgentTime('weather_agent', agentDuration);
      recordAgentExecution('weather_agent', agentDuration, true);

      console.log('✅ [WEATHER-AGENT] Node: LLM responded');
    if (response.tool_calls && response.tool_calls.length > 0) {
      console.log(`🔧 [WEATHER-AGENT] Agent wants to call: ${response.tool_calls.map((tc: any) => tc.name).join(', ')}`);
    }

    return { messages: [response] };
  } catch (error) {
    const agentDuration = Date.now() - agentStartTime;
    recordAgentTime('weather_agent', agentDuration);
    recordAgentExecution('weather_agent', agentDuration, false);
    console.error('❌ [WEATHER-AGENT] Node error:', error);
    throw error;
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

    return { messages: [response] };
  } catch (error) {
    const agentDuration = Date.now() - agentStartTime;
    recordAgentTime('bunker_agent', agentDuration);
    recordAgentExecution('bunker_agent', agentDuration, false);
    console.error('❌ [BUNKER-AGENT] Node error:', error);
    throw error;
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

  const systemPrompt = `You are the Finalization Agent. Your role is to create a comprehensive bunker recommendation from all the collected data.

Available data:
- Route: ${state.route_data ? `${state.route_data.origin_port_code} → ${state.route_data.destination_port_code}` : 'Not available'}
- Weather impact: ${state.weather_consumption ? `${state.weather_consumption.consumption_increase_percent.toFixed(2)}% increase` : 'Not available'}
- Bunker analysis: ${state.bunker_analysis ? `${state.bunker_analysis.recommendations.length} options analyzed` : 'Not available'}
- Port weather: ${state.port_weather_status ? `${state.port_weather_status.length} ports checked` : 'Not available'}

Create a comprehensive, well-structured recommendation that includes:
1. Route summary
2. Weather impact on fuel consumption
3. Best bunker port recommendation with justification
4. Port weather conditions assessment
5. Total cost analysis
6. Risk assessment

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
    
    const messages = [
      new SystemMessage(systemPrompt),
      ...filteredMessages,
    ];

    // Add detailed state information
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

    if (stateContext.length > 0) {
      messages.push(new SystemMessage(`State Summary:\n${stateContext.join('\n')}`));
    }

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

