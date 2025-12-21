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
  AGENT: 30000, // 30 seconds per agent
  TOTAL: 90000, // 90 seconds total
  ROUTE_CALCULATION: 15000, // 15 seconds for route calculation
  WEATHER_API: 20000, // 20 seconds for weather API
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

  console.log(
    `🧹 [MEMORY] Trimmed message history: ${messages.length} → ${trimmed.length}`
  );
  return trimmed;
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

