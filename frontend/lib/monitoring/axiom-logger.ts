/**
 * Axiom production logger for FuelSense 360 multi-agent system.
 *
 * Structured logs with correlation IDs, agent names, tool calls, and state changes.
 * Dataset: AXIOM_DATASET or fuelsense.
 *
 * Batch behavior: queue in memory, flush every 1s OR when 100 logs queued.
 * Flush failures are logged and queued events are dropped to avoid unbounded growth.
 *
 * When AXIOM_TOKEN is not set, all log functions no-op.
 */

import { AxiomWithoutBatching } from "@axiomhq/js";

const SERVICE = "multi-agent-graph";
const FLUSH_INTERVAL_MS = 1000;
const FLUSH_THRESHOLD = 100;

// ---------------------------------------------------------------------------
// Singleton client and config
// ---------------------------------------------------------------------------

let client: AxiomWithoutBatching | null = null;

function getDataset(): string {
  return process.env.AXIOM_DATASET || "fuelsense";
}

function getEnvironment(): "development" | "production" {
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

function getClient(): AxiomWithoutBatching | null {
  if (client) return client;
  const token = process.env.AXIOM_TOKEN?.trim();
  if (!token) return null;
  try {
    client = new AxiomWithoutBatching({
      token,
      orgId: process.env.AXIOM_ORG_ID?.trim() || undefined,
      onError: (e) => console.error("[axiom]", e),
    });
  } catch (e) {
    console.warn("[axiom] Failed to create client:", e);
    return null;
  }
  return client;
}

// ---------------------------------------------------------------------------
// Base event and queue
// ---------------------------------------------------------------------------

type LogLevel = "info" | "warn" | "error";

function baseEvent(level: LogLevel, correlation_id: string): Record<string, unknown> {
  const timestamp = new Date().toISOString();
  return {
    _time: timestamp,
    timestamp,
    correlation_id,
    environment: getEnvironment(),
    level,
    service: SERVICE,
  };
}

const queue: Record<string, unknown>[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

function ensureTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flush();
  }, FLUSH_INTERVAL_MS);
  if (typeof flushTimer.unref === "function") flushTimer.unref();
}

function enqueue(event: Record<string, unknown>): void {
  if (!getClient()) return;
  queue.push(event);
  if (queue.length >= FLUSH_THRESHOLD) {
    void flush();
  } else {
    ensureTimer();
  }
}

/**
 * Flush queued logs to Axiom. Handles failures gracefully (log and drop).
 * Call before process exit in serverless to avoid losing events.
 */
export async function flush(): Promise<void> {
  const c = getClient();
  const dataset = getDataset();
  if (!c || queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  try {
    await c.ingest(dataset, batch);
  } catch (e) {
    console.error("[axiom] Flush failed, dropped", batch.length, "events:", e);
  }
}

// ---------------------------------------------------------------------------
// Structured log functions
// ---------------------------------------------------------------------------

/**
 * Log an agent execution.
 */
export function logAgentExecution(
  agent_name: string,
  correlation_id: string,
  duration_ms: number,
  status: string,
  metadata?: Record<string, unknown>
): void {
  enqueue({
    ...baseEvent("info", correlation_id),
    type: "agent_execution",
    agent_name,
    duration_ms,
    status,
    ...metadata,
  });
}

/**
 * Log a tool call.
 */
export function logToolCall(
  tool_name: string,
  correlation_id: string,
  input: unknown,
  output: unknown,
  duration_ms: number,
  status: string
): void {
  enqueue({
    ...baseEvent("info", correlation_id),
    type: "tool_call",
    tool_name,
    input,
    output,
    duration_ms,
    status,
  });
}

/**
 * Log a state change (e.g. across agent steps).
 */
export function logStateChange(
  correlation_id: string,
  state_before: unknown,
  state_after: unknown,
  changed_fields: string[]
): void {
  enqueue({
    ...baseEvent("info", correlation_id),
    type: "state_change",
    state_before,
    state_after,
    changed_fields,
  });
}

/**
 * Log an error with context.
 */
export function logError(
  correlation_id: string,
  error: unknown,
  context?: Record<string, unknown>
): void {
  const err = error instanceof Error ? { message: error.message, stack: error.stack } : String(error);
  enqueue({
    ...baseEvent("error", correlation_id),
    type: "error",
    error: err,
    ...context,
  });
}

/**
 * Log a checkpoint operation (put, get, putWrites, deleteThread, etc.).
 */
export function logCheckpointOperation(
  operation: string,
  correlation_id: string,
  thread_id: string,
  success: boolean,
  duration_ms: number
): void {
  enqueue({
    ...baseEvent(success ? "info" : "warn", correlation_id),
    type: "checkpoint_operation",
    operation,
    thread_id,
    success,
    duration_ms,
  });
}

/**
 * Log a custom event with arbitrary payload.
 * Used for agent-specific metrics (e.g. vessel selection, synthesis).
 */
export function logCustomEvent(
  type: string,
  correlation_id: string,
  payload: Record<string, unknown>,
  level: LogLevel = "info"
): void {
  enqueue({
    ...baseEvent(level, correlation_id),
    type,
    ...payload,
  });
}
