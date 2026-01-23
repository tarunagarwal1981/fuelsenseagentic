/**
 * Retry logic with exponential backoff for transient failures.
 * Handles network blips, timeouts, and rate limits before circuit breaker triggers.
 */

import { getCorrelationId } from '@/lib/monitoring/correlation-context';
import { logError } from '@/lib/monitoring/axiom-logger';

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelay?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** List of retryable error codes/patterns (default: ['ETIMEDOUT', 'ECONNRESET', 'RATE_LIMIT']) */
  retryableErrors?: string[];
  /** Tool name for logging */
  toolName?: string;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'toolName'>> & { toolName?: string } = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'RATE_LIMIT', 'TIMEOUT_ERROR', 'NETWORK_ERROR', 'API_ERROR'],
};

/**
 * Check if an error is retryable based on error code or message.
 */
export function shouldRetry(error: unknown, retryableErrors: string[]): boolean {
  if (!error) return false;

  const errorStr = error instanceof Error ? error.message : String(error);
  const errorCode = (error as any)?.code || (error as any)?.statusCode?.toString() || '';

  // Check error code
  for (const pattern of retryableErrors) {
    if (errorCode === pattern || errorStr.includes(pattern)) {
      return true;
    }
  }

  // Check for HTTP status codes that are retryable
  if (typeof (error as any)?.statusCode === 'number') {
    const status = (error as any).statusCode;
    // 429 (Too Many Requests), 500-599 (Server Errors), 408 (Request Timeout)
    if (status === 429 || status === 408 || (status >= 500 && status < 600)) {
      return true;
    }
  }

  // Check for network-related error messages
  const networkPatterns = ['timeout', 'network', 'connection', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'];
  const lowerErrorStr = errorStr.toLowerCase();
  for (const pattern of networkPatterns) {
    if (lowerErrorStr.includes(pattern.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate exponential backoff delay with jitter.
 * Jitter adds ±20% randomness to prevent thundering herd.
 */
export function calculateDelay(attempt: number, options: Required<Omit<RetryOptions, 'toolName'>>): number {
  // Calculate exponential backoff: initialDelay * (multiplier ^ (attempt - 1))
  const baseDelay = options.initialDelay * Math.pow(options.backoffMultiplier, attempt - 1);
  
  // Cap at maxDelay
  const cappedDelay = Math.min(baseDelay, options.maxDelay);
  
  // Add jitter: ±20% of the delay
  const jitterRange = cappedDelay * 0.2;
  const jitter = (Math.random() * 2 - 1) * jitterRange; // Random value between -jitterRange and +jitterRange
  
  const finalDelay = Math.max(0, cappedDelay + jitter);
  
  return Math.round(finalDelay);
}

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff.
 * 
 * Flow: retry(3x) → circuit breaker → tool
 * 
 * @param fn Function to retry (should return a Promise)
 * @param options Retry configuration options
 * @returns Promise that resolves with the function result or rejects after all retries exhausted
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const toolName = opts.toolName || 'unknown';
  const cid = getCorrelationId() || 'unknown';
  
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      // First attempt: execute immediately
      if (attempt === 1) {
        return await fn();
      }
      
      // Subsequent attempts: calculate delay with exponential backoff + jitter
      const delay = calculateDelay(attempt, opts);
      
      // Log retry attempt
      const errorReason = lastError instanceof Error 
        ? (lastError as any)?.code || lastError.message.substring(0, 50)
        : String(lastError).substring(0, 50);
      
      logError(cid, new Error(`[RETRY] ${toolName}: Retrying (attempt ${attempt}/${opts.maxAttempts})`), {
        tool: toolName,
        retry_attempt: attempt,
        retry_delay_ms: delay,
        retry_reason: errorReason,
        retry_max_attempts: opts.maxAttempts,
      });
      
      // Wait before retrying
      await sleep(delay);
      
      // Execute the function again
      return await fn();
      
    } catch (error) {
      lastError = error;
      
      // Check if error is retryable
      if (!shouldRetry(error, opts.retryableErrors)) {
        // Non-retryable error: fail immediately
        logError(cid, new Error(`[RETRY] ${toolName}: Non-retryable error, failing immediately`), {
          tool: toolName,
          retry_attempt: attempt,
          retry_reason: 'non-retryable',
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      
      // If this was the last attempt, log exhaustion and throw
      if (attempt === opts.maxAttempts) {
        logError(cid, new Error(`[RETRY] ${toolName}: All ${opts.maxAttempts} retry attempts exhausted`), {
          tool: toolName,
          retry_attempt: attempt,
          retry_max_attempts: opts.maxAttempts,
          retry_exhausted: true,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      
      // Otherwise, continue to next retry attempt
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw lastError;
}
