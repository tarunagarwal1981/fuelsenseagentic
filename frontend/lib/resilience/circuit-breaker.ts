/**
 * Circuit breaker for tool calls to external APIs (SeaRoute, Open-Meteo, etc.).
 * Prevents cascading failures and infinite retries when APIs are down.
 */

import CircuitBreaker from 'opossum';
import { getCachedRoute } from '@/lib/multi-agent/optimizations';
import { getCorrelationId } from '@/lib/monitoring/correlation-context';
import { logError } from '@/lib/monitoring/axiom-logger';
import { retryWithBackoff } from './retry';

export type ToolType = 'route' | 'weather' | 'price' | 'analysis' | 'vessel';

const DEFAULT_OPTIONS = {
  timeout: 30_000, // 30s
  errorThresholdPercentage: 50,
  resetTimeout: 30_000, // 30s
  rollingCountTimeout: 300_000, // 5 min window
  rollingCountBuckets: 10,
  volumeThreshold: 5, // min requests before circuit can open
};

const breakers = new Map<string, CircuitBreaker>();
const lastFailureAt = new Map<string, number>();

function makeFallback(toolName: string, toolType: ToolType): (input: any) => any {
  switch (toolType) {
    case 'route': {
      return (input: any) => {
        const origin = input?.origin_port_code;
        const destination = input?.destination_port_code;
        const cached = origin && destination ? getCachedRoute(origin, destination) : null;
        if (cached) return cached;
        return { error: 'Route API unavailable. Circuit open. No cached route for this port pair.' };
      };
    }
    case 'weather': {
      return (input: any) => {
        // fetch_marine_weather expects array; others expect object
        if (toolName === 'fetch_marine_weather' || toolName === 'check_bunker_port_weather') return [];
        return { error: 'Weather data unavailable. Circuit open.' };
      };
    }
    case 'price': {
      return () => ({
        error: 'Price data temporarily unavailable. Circuit open. Last known prices could not be retrieved.',
      });
    }
    case 'analysis': {
      return () => ({
        error: 'Analysis unavailable. Circuit open. External analysis API is temporarily down.',
      });
    }
    case 'vessel': {
      return (input: any) => {
        const isNoonReport = toolName === 'fetch_noon_report';
        const isConsumptionProfile = toolName === 'fetch_consumption_profile';

        if (isConsumptionProfile) {
          return {
            success: false,
            error: 'Consumption profile API unavailable. Circuit open.',
            imo: input?.imo ?? '',
            message: 'Vessel consumption profile service is temporarily unavailable.',
          };
        }

        const vesselIdentifiers = input?.vessel_identifiers ?? input?.vessel_identifier ?? {};
        return {
          success: false,
          error: isNoonReport
            ? 'Noon report API unavailable. Circuit open.'
            : 'Vessel specification API unavailable. Circuit open.',
          ...(isNoonReport ? { vessel_identifiers: vesselIdentifiers } : { vessel_identifier: vesselIdentifiers }),
          message: 'Vessel service is temporarily unavailable.',
        };
      };
    }
    default:
      return () => ({ error: `Service unavailable. Circuit open for ${toolName}.` });
  }
}

function logCircuit(toolName: string, event: string, msg: string): void {
  const cid = getCorrelationId() || 'unknown';
  logError(cid, new Error(`[CIRCUIT] ${toolName}: ${msg}`), { tool: toolName, circuit_event: event });
}

/**
 * Create a circuit breaker for a tool.
 * Registers the breaker for the health endpoint and wires event handlers.
 * 
 * Flow: retry(3x) → circuit breaker → tool
 * Retry logic handles transient failures before circuit breaker triggers.
 */
export function createToolCircuitBreaker(
  toolName: string,
  executor: (input: any) => Promise<any>,
  toolType: ToolType,
  options?: Partial<typeof DEFAULT_OPTIONS>
): CircuitBreaker<[any], any> {
  const opts = { ...DEFAULT_OPTIONS, ...options, name: toolName };
  const fallbackFn = makeFallback(toolName, toolType);

  // Wrap executor with retry logic before passing to circuit breaker
  // This ensures transient failures are retried before circuit breaker opens
  const executorWithRetry = async (input: any): Promise<any> => {
    return retryWithBackoff(
      () => executor(input),
      {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'RATE_LIMIT', 'TIMEOUT_ERROR', 'NETWORK_ERROR', 'API_ERROR'],
        toolName,
      }
    );
  };

  const breaker = new CircuitBreaker<[any], any>(executorWithRetry, opts);
  breaker.fallback((input: any, _err?: Error) => fallbackFn(input));

  breaker.on('open', () => {
    logCircuit(toolName, 'open', 'Circuit opened');
  });
  breaker.on('halfOpen', () => {
    logCircuit(toolName, 'halfOpen', 'Attempting recovery');
  });
  breaker.on('close', () => {
    logCircuit(toolName, 'close', 'Circuit recovered');
  });
  breaker.on('failure', () => {
    lastFailureAt.set(toolName, Date.now());
  });

  breakers.set(toolName, breaker);
  return breaker;
}

/**
 * Get status of all circuit breakers for the health endpoint.
 */
export function getCircuitBreakerStatus(): Record<
  string,
  { state: 'OPEN' | 'CLOSED' | 'HALF_OPEN'; failures: number; last_failure_at: string | null }
> {
  const out: Record<string, { state: 'OPEN' | 'CLOSED' | 'HALF_OPEN'; failures: number; last_failure_at: string | null }> = {};
  for (const [name, b] of breakers) {
    const state: 'OPEN' | 'CLOSED' | 'HALF_OPEN' = b.opened ? 'OPEN' : b.halfOpen ? 'HALF_OPEN' : 'CLOSED';
    const failures = (b.stats as any)?.failures ?? 0;
    const ts = lastFailureAt.get(name);
    out[name] = {
      state,
      failures,
      last_failure_at: ts ? new Date(ts).toISOString() : null,
    };
  }
  return out;
}
