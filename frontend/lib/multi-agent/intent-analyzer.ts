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
  /** Weather query classification (for standalone port weather vs route weather) */
  weather_type?: 'port_weather' | 'route_weather' | 'none';
  /** Extracted port name for standalone port weather queries */
  weather_port?: string;
  /** Extracted date for weather queries */
  weather_date?: string;
}

/**
 * Classify weather query to determine if route is required
 * 
 * Distinguishes between:
 * - port_weather: Standalone weather at a single port (NO route needed)
 * - route_weather: Weather along a voyage route (route needed)
 * - none: Not a weather query
 */
export function classifyWeatherQuery(query: string): {
  type: 'port_weather' | 'route_weather' | 'none';
  port?: string;
  date?: string;
  needsRoute: boolean;
} {
  const lowerQuery = query.toLowerCase();
  
  // Not a weather query at all
  const weatherKeywords = ['weather', 'forecast', 'conditions', 'storm', 'wind', 'wave', 'seas', 'swell'];
  const isWeatherQuery = weatherKeywords.some(kw => lowerQuery.includes(kw));
  
  if (!isWeatherQuery) {
    return { type: 'none', needsRoute: false };
  }
  
  // Route-based weather queries (need route calculation)
  const routeIndicators = [
    /along.*route/i,
    /on.*route/i,
    /route.*weather/i,
    /weather.*route/i,
    /from\s+\w+\s+to\s+\w+/i,  // "from X to Y"
    /between\s+\w+\s+and\s+\w+.*(?:weather|forecast)/i,  // "between X and Y" with weather context
    /voyage.*weather/i,
    /weather.*voyage/i,
    /transit.*weather/i,
    /passage.*weather/i,
    /sailing.*weather/i,
    /weather.*sailing/i,
    /consumption/i,  // Consumption requires route for fuel calculations
  ];
  
  for (const pattern of routeIndicators) {
    if (pattern.test(query)) {
      return { type: 'route_weather', needsRoute: true };
    }
  }
  
  // Port-based weather queries (single location, no route needed)
  const portPatterns = [
    /weather\s+(?:at|in|for)\s+([A-Za-z\s]+?)(?:\s+port|\s+on|\s*$)/i,
    /(?:at|in)\s+([A-Za-z\s]+?)\s+(?:port\s+)?(?:weather|forecast)/i,
    /forecast\s+(?:at|in|for)\s+([A-Za-z\s]+?)(?:\s+port)?(?:\s+on|\s*$)/i,
    /(?:sea\s+)?conditions\s+(?:at|in)\s+([A-Za-z\s]+?)(?:\s+port)?/i,
    /([A-Za-z]+)\s+port\s+weather/i,
    /weather\s+([A-Za-z]+)\s+port/i,
  ];
  
  for (const pattern of portPatterns) {
    const match = query.match(pattern);
    if (match) {
      const portName = match[1].trim();
      
      // Extract date if present
      const datePatterns = [
        /on\s+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})/i,
        /for\s+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})/i,
        /(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})/i,
        /on\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/i,
        /(next\s+week|tomorrow|today)/i,
      ];
      
      let date: string | undefined;
      for (const datePattern of datePatterns) {
        const dateMatch = query.match(datePattern);
        if (dateMatch) {
          date = dateMatch[1].trim();
          break;
        }
      }
      
      console.log(`🌤️ [INTENT] Port weather query detected: port="${portName}", date="${date || 'not specified'}"`);
      return { 
        type: 'port_weather', 
        port: portName,
        date: date,
        needsRoute: false  // KEY: No route needed!
      };
    }
  }
  
  // Check for standalone weather query without clear port (e.g., "what's the weather at Rotterdam")
  // These still need a port, so we try to extract it
  const simplePortMatch = query.match(/weather\s+(?:at|in|for)\s+([A-Za-z\s]+)/i);
  if (simplePortMatch) {
    const portName = simplePortMatch[1].trim().replace(/\s+on.*$/i, '').replace(/\s+port$/i, '');
    console.log(`🌤️ [INTENT] Simple port weather query detected: port="${portName}"`);
    
    // Extract date
    let date: string | undefined;
    const dateMatch = query.match(/on\s+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+(?:\s+\d{4})?)/i);
    if (dateMatch) {
      date = dateMatch[1].trim();
    }
    
    return { 
      type: 'port_weather', 
      port: portName,
      date: date,
      needsRoute: false 
    };
  }
  
  // Default: if weather keywords found but no clear pattern, assume route weather
  // (safer to calculate route than miss data)
  return { type: 'route_weather', needsRoute: true };
}

/**
 * Analyze user query to extract intent
 * 
 * Uses keyword matching to determine what the user needs.
 * This is pure logic (no LLM) for cost-effectiveness and speed.
 */
export function analyzeQueryIntent(userQuery: string): QueryIntent {
  const queryLower = userQuery.toLowerCase();
  
  // First, classify weather query type
  const weatherClassification = classifyWeatherQuery(userQuery);
  
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
  
  // Route detection - check if user is asking about routes
  // IMPORTANT: For standalone port weather queries, do NOT require route
  let needsRoute = false;
  
  if (weatherClassification.type === 'port_weather') {
    // Standalone port weather - NO ROUTE NEEDED
    needsRoute = false;
    console.log('🌤️ [INTENT] Standalone port weather query - route NOT needed');
  } else {
    // Standard route detection logic
    // Exclude queries that mention "already" to avoid redundant route calculation
    needsRoute = !userQuery.includes('already') && 
      (queryLower.includes('route') || 
       queryLower.includes('distance') || 
       (queryLower.includes('from') && queryLower.includes('to')) ||
       (queryLower.includes('calculate') && (queryLower.includes('route') || queryLower.includes('distance'))) ||
       weatherClassification.needsRoute ||  // Route weather requires route
       needsBunker);  // Bunker always requires route
  }
  
  // Complexity assessment
  // High: Both bunker and weather needed (complex multi-step analysis)
  // Medium: Either bunker or weather needed (moderate complexity)
  // Low: Only route needed OR standalone port weather (simple query)
  let complexity: 'low' | 'medium' | 'high' = 'low';
  if (needsBunker && needsWeather) {
    complexity = 'high';
  } else if (needsBunker || (needsWeather && weatherClassification.type !== 'port_weather')) {
    complexity = 'medium';
  }
  
  return {
    needs_route: needsRoute,
    needs_weather: needsWeather,
    needs_bunker: needsBunker,
    complexity,
    weather_type: weatherClassification.type === 'none' ? 'none' : weatherClassification.type,
    weather_port: weatherClassification.port,
    weather_date: weatherClassification.date,
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
      // Deterministic workflow - no tools needed (calls functions directly)
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

