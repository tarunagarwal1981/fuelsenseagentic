/**
 * Correlation ID context via AsyncLocalStorage.
 * Allows tools and other code without access to state to read correlation_id
 * when running inside a request that called runWithCorrelation.
 */

import { AsyncLocalStorage } from 'async_hooks';

interface CorrelationStore {
  correlation_id: string;
}

const asyncLocalStorage = new AsyncLocalStorage<CorrelationStore>();

/**
 * Run an async function with correlation_id in context.
 * Use in the API route before starting the graph stream so tools can read it.
 */
export function runWithCorrelation<T>(correlation_id: string, fn: () => Promise<T>): Promise<T> {
  return asyncLocalStorage.run({ correlation_id }, fn);
}

/**
 * Get the current correlation_id from context, if any.
 * Returns undefined when not running inside runWithCorrelation.
 */
export function getCorrelationId(): string | undefined {
  return asyncLocalStorage.getStore()?.correlation_id;
}
