/**
 * Sanitize tool input/output for structured logging.
 * Drops secrets, truncates large arrays/strings.
 */

const SENSITIVE_KEYS = ['api_key', 'apikey', 'apiKey', 'token', 'password', 'secret', 'authorization'];
const MAX_STRING = 500;
const MAX_ARRAY_LENGTH = 20;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v) && typeof (v as Date).getTime !== 'function';
}

function sanitizeValue(v: unknown, depth: number): unknown {
  if (depth > 3) return '[max depth]';
  if (v == null) return v;
  if (typeof v === 'string') return v.length > MAX_STRING ? v.slice(0, MAX_STRING) + '...' : v;
  if (typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    if (v.length > MAX_ARRAY_LENGTH) return { _array_length: v.length, _sample: sanitizeValue(v[0], depth + 1) };
    return v.map((x) => sanitizeValue(x, depth + 1));
  }
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      const lower = k.toLowerCase();
      if (SENSITIVE_KEYS.some((s) => lower.includes(s.toLowerCase()))) {
        out[k] = '[redacted]';
        continue;
      }
      if (k === 'waypoints' && Array.isArray(val)) {
        out.waypoints_count = val.length;
        continue;
      }
      if (k === 'positions' && Array.isArray(val)) {
        out.positions_count = val.length;
        continue;
      }
      out[k] = sanitizeValue(val, depth + 1);
    }
    return out;
  }
  return v;
}

/**
 * Sanitize tool input for logging.
 */
export function sanitizeToolInput(input: unknown): unknown {
  return sanitizeValue(input, 0);
}

/**
 * Produce a brief output summary for logging (not full data).
 */
export function sanitizeToolOutput(output: unknown): unknown {
  if (output == null) return output;
  if (typeof output === 'string') {
    try {
      const p = JSON.parse(output);
      return sanitizeToolOutput(p);
    } catch {
      return output.length > MAX_STRING ? output.slice(0, MAX_STRING) + '...' : output;
    }
  }
  if (Array.isArray(output)) {
    return { result_count: output.length, _type: 'array' };
  }
  if (isPlainObject(output)) {
    const o = output as Record<string, unknown>;
    if ('error' in o && typeof o.error === 'string') return { error: o.error };
    const keys = Object.keys(o);
    const summary: Record<string, unknown> = { _keys: keys.slice(0, 10) };
    if ('recommendations' in o && Array.isArray(o.recommendations)) summary.recommendations_count = o.recommendations.length;
    if ('total_ports_found' in o) summary.total_ports_found = o.total_ports_found;
    if ('prices_by_port' in o && isPlainObject(o.prices_by_port)) summary.ports_with_prices = Object.keys(o.prices_by_port as object).length;
    if ('distance_nm' in o) summary.distance_nm = o.distance_nm;
    if ('waypoints' in o && Array.isArray(o.waypoints)) summary.waypoints_count = o.waypoints.length;
    return summary;
  }
  return output;
}
