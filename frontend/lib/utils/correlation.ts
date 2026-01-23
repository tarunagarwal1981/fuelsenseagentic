/**
 * Correlation ID utilities for request tracing across the multi-agent system.
 */

import { randomUUID } from 'crypto';

/**
 * Generate a new correlation ID (UUID v4).
 */
export function generateCorrelationId(): string {
  return randomUUID();
}

/**
 * Extract correlation_id from state. Uses existing value or generates a fallback.
 */
export function extractCorrelationId(state: { correlation_id?: string } | Record<string, unknown>): string {
  const id = (state as { correlation_id?: string }).correlation_id;
  return (typeof id === 'string' && id.trim()) ? id.trim() : generateCorrelationId();
}

/**
 * Format a log message with correlation ID and optional metadata.
 */
export function formatLogWithCorrelation(
  correlation_id: string,
  message: string,
  metadata?: Record<string, unknown>
): string {
  const base = `[correlation_id=${correlation_id}] ${message}`;
  return metadata ? `${base} ${JSON.stringify(metadata)}` : base;
}
