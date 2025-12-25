/**
 * Intent Analysis for Multi-Agent System
 * 
 * Analyzes user queries to determine intent and generates agent context.
 * This enables judicious tool calling - only calling tools that are needed.
 */

import type { MultiAgentState } from './state';

// ============================================================================
// Intent Analysis
// ============================================================================

/**
 * Query intent extracted from user query
 */
export interface QueryIntent {
  /** Whether route calculation is needed */
  needs_route: boolean;
  /** Whether weather information is needed */
  needs_weather: boolean;
  /** Whether bunker optimization is needed */
  needs_bunker: boolean;
  /** Query complexity level */
  complexity: 'low' | 'medium' | 'high';
}

/**
 * Analyze user query to extract intent
 * 
 * Uses keyword matching to determine what the user needs.
 * This is pure logic (no LLM) for cost-effectiveness and speed.
 */
export function analyzeQueryIntent(userQuery: string): QueryIntent {
  const queryLower = userQuery.toLowerCase();
  
  // Route detection - check if user is asking about routes
  // Exclude queries that mention "already" to avoid redundant route calculation
  const needsRoute = !userQuery.includes('already') && 
    (queryLower.includes('route') || 
     queryLower.includes('distance') || 
     queryLower.includes('from') && queryLower.includes('to') ||
     queryLower.includes('calculate') && (queryLower.includes('route') || queryLower.includes('distance')));
  
  // Weather detection - check for weather-related keywords
  const needsWeather = [
    'weather', 'forecast', 'consumption', 'conditions', 'wind', 'wave',
    'storm', 'gale', 'seas', 'swell', 'meteorological', 'climate',
    'sea state', 'wind speed', 'wave height'
  ].some(keyword => queryLower.includes(keyword));
  
  // Bunker detection - check for bunker/fuel-related keywords
  const needsBunker = [
    'bunker', 'fuel', 'port', 'price', 'cheapest', 'cost', 'refuel',
    'bunkering', 'fueling', 'vlsfo', 'mgo', 'diesel', 'optimization',
    'best option', 'recommendation', 'compare', 'savings', 'refueling',
    'bunkering port', 'fuel price', 'fuel cost'
  ].some(keyword => queryLower.includes(keyword));
  
  // Complexity assessment
  // High: Both bunker and weather needed (complex multi-step analysis)
  // Medium: Either bunker or weather needed (moderate complexity)
  // Low: Only route needed (simple query)
  let complexity: 'low' | 'medium' | 'high' = 'low';
  if (needsBunker && needsWeather) {
    complexity = 'high';
  } else if (needsBunker || needsWeather) {
    complexity = 'medium';
  }
  
  return {
    needs_route: needsRoute,
    needs_weather: needsWeather,
    needs_bunker: needsBunker,
    complexity,
  };
}

/**
 * Generate agent context from intent and current state
 * 
 * Creates context for each agent indicating what tools/actions they should take.
 * This enables agents to make judicious tool calling decisions.
 */
export function generateAgentContext(
  intent: QueryIntent,
  state: MultiAgentState
): import('./state').AgentContext {
  return {
    route_agent: {
      // Weather timeline is needed if weather or bunker analysis is required
      // (weather timeline provides vessel positions for weather forecasting)
      needs_weather_timeline: intent.needs_weather || intent.needs_bunker,
      // Port info might be needed for bunker queries (future enhancement)
      needs_port_info: intent.needs_bunker,
      // Legacy fallback: empty tools means use all tools
      required_tools: [],
      task_description: intent.needs_route 
        ? 'Calculate route between ports' 
        : 'Route calculation not required',
      priority: 'critical' as const,
    },
    weather_agent: {
      // Consumption calculation is only needed for bunker planning
      // (to calculate weather-adjusted fuel needs)
      needs_consumption: intent.needs_bunker,
      // Port weather check is only needed if bunker ports have been found
      needs_port_weather: intent.needs_bunker && !!state.bunker_ports && state.bunker_ports.length > 0,
      // Legacy fallback: empty tools means use all tools
      required_tools: [],
      task_description: intent.needs_weather
        ? 'Fetch weather forecasts and calculate consumption'
        : 'Weather analysis not required',
      priority: intent.needs_bunker ? ('critical' as const) : ('important' as const),
    },
    bunker_agent: {
      // Weather consumption needed for accurate bunker cost analysis
      // (weather affects fuel consumption, which affects bunker quantity needed)
      needs_weather_consumption: intent.needs_weather && intent.needs_bunker,
      // Port weather check needed for bunker feasibility
      needs_port_weather: intent.needs_bunker,
      // Legacy fallback: empty tools means use all tools
      required_tools: [],
      task_description: intent.needs_bunker
        ? 'Find bunker ports and analyze fuel options'
        : 'Bunker analysis not required',
      priority: 'critical' as const,
    },
    finalize: {
      // Pass complexity to finalize for appropriate synthesis
      complexity: intent.complexity,
      // Indicate what analysis sections are needed in final response
      needs_weather_analysis: intent.needs_weather,
      needs_bunker_analysis: intent.needs_bunker,
    },
  };
}

