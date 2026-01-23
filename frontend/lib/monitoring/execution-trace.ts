/**
 * Execution timeline from Axiom for a given correlation_id.
 * Queries agent_execution and tool_call events to visualize agent → tool flow.
 */

export interface TimelineEntry {
  timestamp: string;
  agent: string | null;
  tool: string | null;
  duration_ms: number;
  status: string;
  type: 'agent_execution' | 'tool_call';
}

const AXIOM_QUERY_URL = 'https://api.axiom.co/v2/datasets/query';

function getDataset(): string {
  return process.env.AXIOM_DATASET || 'fuelsense';
}

function getToken(): string | null {
  return process.env.AXIOM_TOKEN?.trim() || null;
}

/**
 * Map a raw Axiom event to TimelineEntry.
 * Handles both agent_execution and tool_call types.
 */
function toTimelineEntry(row: Record<string, unknown>): TimelineEntry {
  const ts = row._time ?? row.timestamp;
  const timestamp = typeof ts === 'string' ? ts : ts instanceof Date ? ts.toISOString() : new Date().toISOString();
  const type = (row.type as string) || 'agent_execution';
  const agent = type === 'agent_execution' ? (row.agent_name as string) || null : null;
  const tool = type === 'tool_call' ? (row.tool_name as string) || null : null;
  const duration_ms = typeof row.duration_ms === 'number' ? row.duration_ms : 0;
  const status = (row.status as string) || 'unknown';
  return { timestamp, agent, tool, duration_ms, status, type: type as 'agent_execution' | 'tool_call' };
}

/**
 * Query Axiom for all logs with the given correlation_id and return a timeline.
 * Returns [] when AXIOM_TOKEN is not set or the request fails.
 */
export async function buildExecutionTimeline(correlation_id: string): Promise<TimelineEntry[]> {
  const token = getToken();
  if (!token) return [];

  const dataset = getDataset();
  // APL: fetch from dataset, filter by correlation_id, order by time
  const apl = `['${dataset}'] | where correlation_id == \"${correlation_id.replace(/"/g, '\\"')}\" | order by _time asc`;

  try {
    const res = await fetch(AXIOM_QUERY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ apl }),
    });

    if (!res.ok) {
      console.warn('[execution-trace] Axiom query failed:', res.status, await res.text());
      return [];
    }

    const data = (await res.json()) as Record<string, unknown>;
    // Axiom can return { buckets: { ... } } or a direct array in different shapes.
    // Try common shapes: buckets.totals, result, or an array at top level.
    let rows: Record<string, unknown>[] = [];
    if (Array.isArray(data)) {
      rows = data as Record<string, unknown>[];
    } else if (data && typeof data === 'object') {
      const b = (data as any).buckets;
      if (b && typeof b === 'object') {
        const totals = (b as any).totals;
        if (Array.isArray(totals)) rows = totals;
        else if (totals && typeof totals === 'object' && Array.isArray((totals as any).rows)) rows = (totals as any).rows;
      }
      const result = (data as any).result;
      if (Array.isArray(result) && rows.length === 0) rows = result;
    }

    return rows.map(toTimelineEntry);
  } catch (e) {
    console.warn('[execution-trace] Axiom query error:', e);
    return [];
  }
}
