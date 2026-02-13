/**
 * In-memory store for supervisor recovery ports, keyed by correlation_id.
 * Used when the graph state merge/checkpointer does not pass port_overrides or
 * routing_metadata.extracted_params to the route_agent. The supervisor writes
 * corrected ports here; the route_agent reads and clears them on use.
 */

const store = new Map<string, { origin_port?: string; destination_port?: string }>();

export function setRecoveryPorts(
  correlationId: string,
  ports: { origin_port?: string; destination_port?: string }
): void {
  if (!correlationId) return;
  store.set(correlationId, { ...ports });
}

export function getAndClearRecoveryPorts(
  correlationId: string
): { origin_port?: string; destination_port?: string } | null {
  if (!correlationId) return null;
  const value = store.get(correlationId) ?? null;
  store.delete(correlationId);
  return value;
}
