/**
 * Multi-Agent Performance Optimizations
 * 
 * Provides caching, timeout management, and memory optimization utilities
 * for the multi-agent system.
 */

// ============================================================================
// Route Calculation Cache
// ============================================================================

interface RouteCacheEntry {
  origin: string;
  destination: string;
  route: any;
  timestamp: number;
}

const ROUTE_CACHE_TTL = 3600000; // 1 hour in milliseconds
const routeCache = new Map<string, RouteCacheEntry>();

/**
 * Generate cache key for route calculation
 */
function getRouteCacheKey(origin: string, destination: string): string {
  return `${origin}:${destination}`.toUpperCase();
}

/**
 * Get cached route if available and not expired
 */
export function getCachedRoute(
  origin: string,
  destination: string
): any | null {
  const key = getRouteCacheKey(origin, destination);
  const entry = routeCache.get(key);

  if (!entry) {
    return null;
  }

  const age = Date.now() - entry.timestamp;
  if (age > ROUTE_CACHE_TTL) {
    routeCache.delete(key);
    return null;
  }

  console.log(`💾 [CACHE] Route cache hit: ${origin} → ${destination} (age: ${Math.round(age / 1000)}s)`);
  return entry.route;
}

/**
 * Cache route calculation result
 */
export function cacheRoute(
  origin: string,
  destination: string,
  route: any
): void {
  const key = getRouteCacheKey(origin, destination);
  routeCache.set(key, {
    origin,
    destination,
    route,
    timestamp: Date.now(),
  });
  console.log(`💾 [CACHE] Route cached: ${origin} → ${destination}`);
}

/**
 * Clear expired cache entries
 */
export function clearExpiredCache(): void {
  const now = Date.now();
  let cleared = 0;
  for (const [key, entry] of routeCache.entries()) {
    if (now - entry.timestamp > ROUTE_CACHE_TTL) {
      routeCache.delete(key);
      cleared++;
    }
  }
  if (cleared > 0) {
    console.log(`🧹 [CACHE] Cleared ${cleared} expired route cache entries`);
  }
  
  // Clear expired weather cache entries
  let weatherCleared = 0;
  for (const [key, entry] of weatherCache.entries()) {
    if (now - entry.timestamp > WEATHER_CACHE_TTL) {
      weatherCache.delete(key);
      weatherCleared++;
    }
  }
  if (weatherCleared > 0) {
    console.log(`🧹 [CACHE] Cleared ${weatherCleared} expired weather cache entries`);
  }
}

// ============================================================================
// Weather Data Cache
// ============================================================================

interface WeatherCacheEntry {
  lat: number;
  lon: number;
  datetime: string;
  weather: any;
  timestamp: number;
}

const WEATHER_CACHE_TTL = 3600000; // 1 hour in milliseconds
const WEATHER_CACHE_MAX_SIZE = 1000; // Maximum cache entries before cleanup
const weatherCache = new Map<string, WeatherCacheEntry>();

/**
 * Generate cache key for weather data
 * Uses lat/lon rounded to 2 decimal places and timestamp (hour precision)
 * This allows caching weather for the same location and time window
 */
function getWeatherCacheKey(lat: number, lon: number, datetime: string): string {
  // Round coordinates to 2 decimal places (~1.1km precision)
  const roundedLat = lat.toFixed(2);
  const roundedLon = lon.toFixed(2);
  
  // Use timestamp with hour precision for cache key
  // This groups positions within the same hour together
  const date = new Date(datetime);
  const timestampKey = date.toISOString().slice(0, 13); // YYYY-MM-DDTHH
  
  return `weather:${roundedLat}_${roundedLon}_${timestampKey}`;
}

/**
 * Get cached weather data if available and not expired
 */
export function getCachedWeather(
  lat: number,
  lon: number,
  datetime: string
): any | null {
  const key = getWeatherCacheKey(lat, lon, datetime);
  const entry = weatherCache.get(key);

  if (!entry) {
    return null;
  }

  const age = Date.now() - entry.timestamp;
  if (age > WEATHER_CACHE_TTL) {
    weatherCache.delete(key);
    return null;
  }

  const ageSeconds = Math.round(age / 1000);
  console.log(`💾 [CACHE] Weather cache hit: ${lat.toFixed(2)}, ${lon.toFixed(2)} (age: ${ageSeconds}s, key: ${key})`);
  return entry.weather;
}

/**
 * Cache weather data result
 * Automatically cleans up old entries if cache exceeds max size
 */
export function cacheWeather(
  lat: number,
  lon: number,
  datetime: string,
  weather: any
): void {
  const key = getWeatherCacheKey(lat, lon, datetime);
  weatherCache.set(key, {
    lat,
    lon,
    datetime,
    weather,
    timestamp: Date.now(),
  });
  console.log(`💾 [CACHE] Weather cached: ${lat.toFixed(2)}, ${lon.toFixed(2)} (key: ${key})`);
  
  // Clean up old cache entries if cache exceeds max size
  // This prevents memory leaks from unbounded cache growth
  if (weatherCache.size > WEATHER_CACHE_MAX_SIZE) {
    console.log(`🧹 [CACHE] Weather cache size (${weatherCache.size}) exceeds max (${WEATHER_CACHE_MAX_SIZE}), cleaning up...`);
    
    // Sort entries by timestamp and remove oldest 10%
    const entries = Array.from(weatherCache.entries())
      .map(([key, entry]) => ({ key, timestamp: entry.timestamp }))
      .sort((a, b) => a.timestamp - b.timestamp);
    
    const toRemove = Math.floor(entries.length * 0.1); // Remove 10% oldest
    for (let i = 0; i < toRemove; i++) {
      weatherCache.delete(entries[i].key);
    }
    
    console.log(`🧹 [CACHE] Removed ${toRemove} oldest weather cache entries`);
  }
}

/**
 * Get weather cache statistics
 * Useful for monitoring cache performance
 */
export function getWeatherCacheStats(): {
  size: number;
  maxSize: number;
  ttl: number;
  hitRate?: number;
} {
  return {
    size: weatherCache.size,
    maxSize: WEATHER_CACHE_MAX_SIZE,
    ttl: WEATHER_CACHE_TTL,
  };
}

// ============================================================================
// Timeout Management
// ============================================================================

/**
 * Create a promise that rejects after timeout
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Agent-specific timeout constants
 */
export const TIMEOUTS = {
  AGENT: 45000, // 45 seconds per agent
  WEATHER_AGENT: 90000, // 90 seconds for weather agent (handles many positions)
  TOTAL: 120000, // 120 seconds total (2 minutes)
  ROUTE_CALCULATION: 15000, // 15 seconds for route calculation
  WEATHER_API: 30000, // 30 seconds for weather API
  PRICE_FETCH: 10000, // 10 seconds for price fetch
} as const;

// ============================================================================
// Memory Optimization
// ============================================================================

/**
 * Limit message history to prevent memory bloat
 */
const MAX_MESSAGE_HISTORY = 20;

/**
 * Trim message history to keep only recent messages
 * CRITICAL: Ensures tool_use/tool_result pairs are kept together
 */
export function trimMessageHistory(messages: any[]): any[] {
  if (messages.length <= MAX_MESSAGE_HISTORY) {
    return messages;
  }

  // Keep first message (system/initial) and last N messages
  const trimmed = [
    messages[0], // Keep initial message
    ...messages.slice(-(MAX_MESSAGE_HISTORY - 1)), // Keep last N-1 messages
  ];

  // CRITICAL: Ensure all AIMessages with tool_calls have their corresponding ToolMessages
  // If an AIMessage with tool_calls is included, we must include all its ToolMessages
  // Simple approach: Remove any AIMessage with tool_calls if we can't verify all ToolMessages are present
  const { AIMessage, ToolMessage } = require('@langchain/core/messages');
  
  const validated: any[] = [trimmed[0]]; // Keep first message
  
  for (let i = 1; i < trimmed.length; i++) {
    const msg = trimmed[i];
    
    // If this is an AIMessage with tool_calls, check if all ToolMessages are present
    if (msg.constructor.name === 'AIMessage' && msg.tool_calls && msg.tool_calls.length > 0) {
      const toolCallIds = new Set(msg.tool_calls.map((tc: any) => tc.id || tc.tool_call_id));
      
      // Look ahead to find all ToolMessages for these tool_calls
      const foundToolCallIds = new Set<string>();
      for (let j = i + 1; j < trimmed.length; j++) {
        const nextMsg = trimmed[j];
        // If we hit another AIMessage, stop looking (tool results must be immediately after)
        if (nextMsg.constructor.name === 'AIMessage') {
          break;
        }
        if (nextMsg.constructor.name === 'ToolMessage' && nextMsg.tool_call_id) {
          if (toolCallIds.has(nextMsg.tool_call_id)) {
            foundToolCallIds.add(nextMsg.tool_call_id);
          }
        }
      }
      
      // If not all tool results are present, skip this AIMessage to avoid API errors
      if (foundToolCallIds.size < toolCallIds.size) {
        console.warn(`⚠️ [MEMORY] Skipping AIMessage with incomplete tool results (found ${foundToolCallIds.size}/${toolCallIds.size} tool results)`);
        continue; // Skip this message
      }
    }
    
    validated.push(msg);
  }

  console.log(
    `🧹 [MEMORY] Trimmed message history: ${messages.length} → ${validated.length}`
  );
  return validated;
}

/**
 * Validate message pairs - ONLY remove orphaned ToolMessages
 * 
 * CRITICAL: Do NOT remove AIMessages with tool_calls that haven't executed yet!
 * Flow: AIMessage with tool_calls → Router routes to tools → Tools execute → ToolMessages created
 * If we remove AIMessage before execution, router never sees the tool_calls!
 */
export function validateMessagePairs(messages: any[]): any[] {
  const { AIMessage, ToolMessage, SystemMessage, HumanMessage } = require('@langchain/core/messages');
  
  // Step 1: Collect all valid tool call IDs from AIMessages
  const validToolCallIds = new Set<string>();
  
  for (const msg of messages) {
    if ((msg instanceof AIMessage || msg.constructor.name === 'AIMessage') && msg.tool_calls) {
      for (const toolCall of msg.tool_calls) {
        const id = toolCall.id || toolCall.tool_call_id;
        if (id) {
          validToolCallIds.add(id);
        }
      }
    }
  }

  // Step 2: Filter messages - keep ALL AIMessages, remove only orphaned ToolMessages
  const validated = messages.filter((msg) => {
    // ALWAYS keep AIMessages (they need to execute!)
    if (msg instanceof AIMessage || msg.constructor.name === 'AIMessage') {
      return true;
    }

    // ALWAYS keep HumanMessages and SystemMessages
    if (msg instanceof HumanMessage || msg instanceof SystemMessage || 
        msg.constructor.name === 'HumanMessage' || msg.constructor.name === 'SystemMessage') {
      return true;
    }

    // For ToolMessages, only keep if they have a valid parent AIMessage
    if (msg instanceof ToolMessage || msg.constructor.name === 'ToolMessage') {
      if (!msg.tool_call_id || !validToolCallIds.has(msg.tool_call_id)) {
        console.warn(
          `⚠️ [MESSAGE-VALIDATION] Removing orphaned ToolMessage: ${msg.tool_call_id || 'unknown'}`
        );
        return false;
      }
    }

    return true;
  });

  console.log(
    `✅ [MESSAGE-VALIDATION] Validated ${messages.length} → ${validated.length} messages (kept all AIMessages, removed ${messages.length - validated.length} orphans)`
  );

  return validated;
}

/**
 * Validate messages specifically for Anthropic API calls
 * 
 * CRITICAL: Anthropic API requires STRICT tool_use/tool_result pairing
 * - Every AIMessage with tool_calls MUST have ALL corresponding ToolMessages immediately after
 * - If ANY tool_result is missing, the ENTIRE AIMessage must be removed
 * 
 * This is DIFFERENT from validateMessagePairs which is lenient for graph flow.
 */
export function validateMessagesForAnthropicAPI(messages: any[]): any[] {
  const { AIMessage, ToolMessage, SystemMessage, HumanMessage } = require('@langchain/core/messages');
  
  // Find the last AIMessage with tool_calls (the current agent's response)
  let lastAIMessageWithToolCallsIndex = -1;
  for (let idx = messages.length - 1; idx >= 0; idx--) {
    const msg = messages[idx];
    if ((msg instanceof AIMessage || msg.constructor.name === 'AIMessage') && 
        msg.tool_calls && msg.tool_calls.length > 0) {
      lastAIMessageWithToolCallsIndex = idx;
      break;
    }
  }
  
  const validated: any[] = [];
  let i = 0;
  
  while (i < messages.length) {
    const msg = messages[i];
    
    // Always keep SystemMessages and HumanMessages
    if (msg instanceof SystemMessage || msg instanceof HumanMessage || 
        msg.constructor.name === 'SystemMessage' || msg.constructor.name === 'HumanMessage') {
      validated.push(msg);
      i++;
      continue;
    }
    
    // For AIMessages with tool_calls, verify ALL tool results are present
    if ((msg instanceof AIMessage || msg.constructor.name === 'AIMessage') && 
        msg.tool_calls && msg.tool_calls.length > 0) {
      
      const toolCallIds = new Set(
        msg.tool_calls.map((tc: any) => tc.id || tc.tool_call_id).filter(Boolean)
      );
      
      // Look at the NEXT messages to find ToolMessages
      const foundToolCallIds = new Set<string>();
      let j = i + 1;
      
      // Collect all consecutive ToolMessages after this AIMessage
      while (j < messages.length) {
        const nextMsg = messages[j];
        
        // If we hit another AIMessage or HumanMessage, stop looking
        if (nextMsg instanceof AIMessage || nextMsg instanceof HumanMessage ||
            nextMsg.constructor.name === 'AIMessage' || nextMsg.constructor.name === 'HumanMessage') {
          break;
        }
        
        // If it's a ToolMessage, check if it matches our tool_calls
        if (nextMsg instanceof ToolMessage || nextMsg.constructor.name === 'ToolMessage') {
          if (nextMsg.tool_call_id && toolCallIds.has(nextMsg.tool_call_id)) {
            foundToolCallIds.add(nextMsg.tool_call_id);
          }
        }
        
        j++;
      }
      
      const isLast = i === lastAIMessageWithToolCallsIndex;
      
      // STRICT: Only include this AIMessage if ALL tool results are present
      // EXCEPTION: Keep the LAST AIMessage even if incomplete (it's the current agent's response)
      if (foundToolCallIds.size === toolCallIds.size || isLast) {
        if (isLast && foundToolCallIds.size < toolCallIds.size) {
          // Last AIMessage with incomplete tool_calls - keep it for router, but don't send to API
          // We'll handle this by not including it in the messages sent to the API
          // For now, skip it from API validation but it will remain in state.messages for routing
          console.warn(
            `⚠️ [API-VALIDATION] Last AIMessage has incomplete tool_calls (found ${foundToolCallIds.size}/${toolCallIds.size}) - keeping in state for routing but skipping from API call`
          );
          // Skip this message from API call (don't add to validated)
          i = j;
          continue;
        }
        
        // All tool results found OR it's the last one - include the AIMessage and its ToolMessages
        validated.push(msg);
        
        // Add all the ToolMessages that belong to this AIMessage
        for (let k = i + 1; k < j; k++) {
          const toolMsg = messages[k];
          if ((toolMsg instanceof ToolMessage || toolMsg.constructor.name === 'ToolMessage') &&
              toolMsg.tool_call_id && toolCallIds.has(toolMsg.tool_call_id)) {
            validated.push(toolMsg);
          }
        }
        
        console.log(
          `✅ [API-VALIDATION] Kept AIMessage with ${toolCallIds.size} complete tool calls${isLast ? ' [LAST]' : ''}`
        );
        
        // Skip past all the ToolMessages we just added
        i = j;
      } else {
        // Incomplete tool results - SKIP this AIMessage and its partial ToolMessages
        console.warn(
          `⚠️ [API-VALIDATION] Skipping AIMessage with incomplete tool results (found ${foundToolCallIds.size}/${toolCallIds.size}) - required by Anthropic API`
        );
        
        // Skip past this AIMessage and any of its ToolMessages
        i = j;
      }
      
      continue;
    }
    
    // For AIMessages without tool_calls, keep them
    if (msg instanceof AIMessage || msg.constructor.name === 'AIMessage') {
      validated.push(msg);
      i++;
      continue;
    }
    
    // For standalone ToolMessages (shouldn't happen after above logic), skip them
    if (msg instanceof ToolMessage || msg.constructor.name === 'ToolMessage') {
      console.warn(
        `⚠️ [API-VALIDATION] Skipping orphaned ToolMessage: ${msg.tool_call_id || 'unknown'}`
      );
      i++;
      continue;
    }
    
    // Any other message type, keep it
    validated.push(msg);
    i++;
  }
  
  console.log(
    `🔒 [API-VALIDATION] Strict validation for Anthropic API: ${messages.length} → ${validated.length} messages`
  );
  
  return validated;
}

/**
 * Clean up large data structures from state
 */
export function cleanupStateData(state: any): any {
  const cleaned = { ...state };

  // Limit vessel timeline positions if too many
  if (cleaned.vessel_timeline && cleaned.vessel_timeline.length > 100) {
    // Keep first, last, and sample every Nth position
    const positions = cleaned.vessel_timeline;
    const sampled = [
      positions[0],
      ...positions.filter((_: any, i: number) => i % 5 === 0),
      positions[positions.length - 1],
    ];
    cleaned.vessel_timeline = sampled;
    console.log(
      `🧹 [MEMORY] Sampled vessel timeline: ${positions.length} → ${sampled.length} positions`
    );
  }

  // Limit weather forecast points if too many
  if (cleaned.weather_forecast && cleaned.weather_forecast.length > 100) {
    const forecast = cleaned.weather_forecast;
    const sampled = [
      forecast[0],
      ...forecast.filter((_: any, i: number) => i % 5 === 0),
      forecast[forecast.length - 1],
    ];
    cleaned.weather_forecast = sampled;
    console.log(
      `🧹 [MEMORY] Sampled weather forecast: ${forecast.length} → ${sampled.length} points`
    );
  }

  return cleaned;
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Batch array into chunks of specified size
 */
export function batchArray<T>(array: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Process array in parallel batches
 */
export async function processInBatches<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 5,
  concurrency: number = 3
): Promise<R[]> {
  const batches = batchArray(items, batchSize);
  const results: R[] = [];

  for (const batch of batches) {
    const batchPromises = batch.map((item) => processor(item));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Limit concurrency between batches
    if (batches.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}

// ============================================================================
// Performance Monitoring
// ============================================================================

interface PerformanceMetrics {
  agentTimes: Record<string, number>;
  toolCallTimes: Record<string, number[]>;
  totalTime: number;
  startTime: number;
}

let performanceMetrics: PerformanceMetrics | null = null;

/**
 * Start performance monitoring
 */
export function startPerformanceMonitoring(): void {
  performanceMetrics = {
    agentTimes: {},
    toolCallTimes: {},
    totalTime: 0,
    startTime: Date.now(),
  };
}

/**
 * Record agent execution time
 */
export function recordAgentTime(agent: string, duration: number): void {
  if (!performanceMetrics) return;
  performanceMetrics.agentTimes[agent] =
    (performanceMetrics.agentTimes[agent] || 0) + duration;
}

/**
 * Record tool call time
 */
export function recordToolCallTime(tool: string, duration: number): void {
  if (!performanceMetrics) return;
  if (!performanceMetrics.toolCallTimes[tool]) {
    performanceMetrics.toolCallTimes[tool] = [];
  }
  performanceMetrics.toolCallTimes[tool].push(duration);
}

/**
 * Get performance metrics
 */
export function getPerformanceMetrics(): PerformanceMetrics | null {
  if (!performanceMetrics) return null;
  performanceMetrics.totalTime = Date.now() - performanceMetrics.startTime;
  return { ...performanceMetrics };
}

/**
 * Reset performance metrics
 */
export function resetPerformanceMetrics(): void {
  performanceMetrics = null;
}

// ============================================================================
// State Update Optimization
// ============================================================================

/**
 * Efficient reducer that only updates if value actually changed
 */
export function efficientReducer<T>(
  current: T,
  update: T | null | undefined
): T {
  // If update is null/undefined, keep current
  if (update === null || update === undefined) {
    return current;
  }

  // For objects/arrays, do shallow comparison
  if (typeof current === 'object' && typeof update === 'object') {
    if (JSON.stringify(current) === JSON.stringify(update)) {
      return current; // No change, return same reference
    }
  }

  // Value changed, return new value
  return update;
}

/**
 * Optimized message reducer that limits history
 */
export function optimizedMessageReducer(
  current: any[],
  update: any[]
): any[] {
  const combined = current.concat(update);
  return trimMessageHistory(combined);
}

