/**
 * Checkpoint recovery and management for FuelSense 360 LangGraph.
 *
 * - getCheckpointHistory: list checkpoints for a conversation
 * - recoverFromCheckpoint: get config to restore to a specific checkpoint
 * - deleteCheckpoint: clear all state for a thread
 * - validateCheckpoint: verify checkpoint structure and integrity
 */

import { getCheckpointer } from "./redis-checkpointer";
import type { RunnableConfig } from "@langchain/core/runnables";

const LOG_PREFIX = "[checkpoint-recovery]";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckpointHistoryEntry {
  id: string;
  step?: number;
  ts?: string;
  metadata?: Record<string, unknown>;
}

export interface RecoverConfigResult {
  config: RunnableConfig;
}

// ---------------------------------------------------------------------------
// getCheckpointHistory
// ---------------------------------------------------------------------------

/**
 * List all checkpoints for a conversation thread.
 *
 * @param thread_id - Conversation thread ID
 * @returns Array of checkpoint entries with id, step, ts, metadata
 */
export async function getCheckpointHistory(
  thread_id: string
): Promise<CheckpointHistoryEntry[]> {
  const cp = await getCheckpointer();
  const config: RunnableConfig = { configurable: { thread_id } };
  const out: CheckpointHistoryEntry[] = [];
  let i = 0;
  try {
    for await (const tuple of cp.list(config, { limit: 500 })) {
      const id =
        (tuple.checkpoint as { id?: string })?.id ??
        (tuple.config as { configurable?: { checkpoint_id?: string } })
          ?.configurable?.checkpoint_id ??
        `step-${(tuple.metadata as { step?: number })?.step ?? i}`;
      out.push({
        id,
        step: (tuple.metadata as { step?: number })?.step,
        ts: (tuple.checkpoint as { ts?: string })?.ts,
        metadata: tuple.metadata as Record<string, unknown> | undefined,
      });
      i += 1;
    }
  } catch (e) {
    console.error(`${LOG_PREFIX} getCheckpointHistory failed (thread_id=${thread_id}):`, e);
    throw e;
  }
  return out;
}

// ---------------------------------------------------------------------------
// recoverFromCheckpoint
// ---------------------------------------------------------------------------

/**
 * Build config to restore a run from a specific checkpoint.
 * Use this config when calling graph.invoke(input, config) or graph.stream(input, config).
 *
 * @param thread_id - Conversation thread ID
 * @param checkpoint_id - Checkpoint ID from getCheckpointHistory
 * @returns Config to pass to invoke/stream; optionally validates the checkpoint exists
 */
export async function recoverFromCheckpoint(
  thread_id: string,
  checkpoint_id: string
): Promise<RecoverConfigResult> {
  const cp = await getCheckpointer();
  const config: RunnableConfig = {
    configurable: { thread_id, checkpoint_id },
  };
  const tuple = await cp.getTuple(config);
  if (!tuple) {
    throw new Error(
      `Checkpoint not found: thread_id=${thread_id}, checkpoint_id=${checkpoint_id}`
    );
  }
  if (!validateCheckpoint(tuple.checkpoint)) {
    throw new Error(
      `Checkpoint failed integrity check: thread_id=${thread_id}, checkpoint_id=${checkpoint_id}`
    );
  }
  return { config };
}

// ---------------------------------------------------------------------------
// deleteCheckpoint
// ---------------------------------------------------------------------------

/**
 * Delete all checkpoints and writes for a conversation thread.
 *
 * @param thread_id - Conversation thread ID
 */
export async function deleteCheckpoint(thread_id: string): Promise<void> {
  const cp = await getCheckpointer();
  try {
    await cp.deleteThread(thread_id);
    console.log(`${LOG_PREFIX} deleteCheckpoint: cleared thread_id=${thread_id}`);
  } catch (e) {
    console.error(`${LOG_PREFIX} deleteCheckpoint failed (thread_id=${thread_id}):`, e);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// validateCheckpoint
// ---------------------------------------------------------------------------

/**
 * Verify checkpoint structure and integrity.
 * Ensures v, id, ts, channel_values exist and that channel_values.messages
 * is an array when present (MultiAgent state).
 *
 * @param checkpoint - Raw checkpoint object (from getTuple or similar)
 * @returns true if structure looks valid
 */
export function validateCheckpoint(checkpoint: unknown): boolean {
  if (!checkpoint || typeof checkpoint !== "object") return false;
  const c = checkpoint as Record<string, unknown>;
  if (typeof c.v !== "number") return false;
  if (typeof c.id !== "string" || !c.id) return false;
  if (typeof c.ts !== "string") return false;
  if (!c.channel_values || typeof c.channel_values !== "object") return false;
  const cv = c.channel_values as Record<string, unknown>;
  if (cv.messages != null && !Array.isArray(cv.messages)) return false;
  return true;
}
