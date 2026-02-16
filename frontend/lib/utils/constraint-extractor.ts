/**
 * Extracts structured bunker constraints from natural language query and optional state.
 * Used by constraint-first bunker workflow.
 */

import type { BunkerConstraints } from '@/lib/types/bunker';

/** Minimal state shape for constraint extraction (route context). */
export interface ConstraintExtractorState {
  route_data?: {
    origin_port_name?: string;
    origin_port_code?: string;
    destination_port_name?: string;
    destination_port_code?: string;
  } | null;
}

/** State with optional route_data (e.g. MultiAgentState). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AgentStateForConstraints = ConstraintExtractorState | { route_data?: unknown } | any;

const FUEL_TYPES = ['VLSFO', 'LSMGO', 'LSGO', 'MGO', 'IFO', 'MDO'];

/**
 * Extract bunker constraints from user query and optional state.
 *
 * Patterns:
 * - Max/min quantity: "max 2000 MT", "at least 1500 tons", "minimum 1000"
 * - Fuel type: "VLSFO", "MGO", "LSMGO"
 * - Price ceiling: "under $650/MT", "cheaper than $600", "below 700 USD per MT"
 * - Port preferences: "prefer Fujairah", "preferred port Singapore"
 * - Avoid ports: "avoid Singapore", "exclude Rotterdam"
 * - Time: "within 3 days", "in 5 days", "before Jan 15", "by 2025-02-01"
 *
 * @param query - User message text
 * @param state - Optional agent state (e.g. for route context)
 * @returns BunkerConstraints
 */
export function extractBunkerConstraints(
  query: string,
  state?: AgentStateForConstraints | null
): BunkerConstraints {
  const q = query.replace(/\s+/g, ' ').trim();
  const lower = q.toLowerCase();

  const constraints: BunkerConstraints = {
    fuelTypes: [],
    preferredPorts: [],
    avoidPorts: [],
  };

  // Max quantity: "max 2000 MT", "maximum 3000 tons", "up to 2500 MT"
  const maxQty = q.match(/\b(?:max|maximum|up to)\s+([\d,]+)\s*(?:mt|tons?|metric tons?)?/i)
    || lower.match(/\b(?:max|maximum|up to)\s+([\d,]+)/);
  if (maxQty) {
    const n = parseInt(maxQty[1].replace(/,/g, ''), 10);
    if (Number.isFinite(n)) constraints.maxQuantityMT = n;
  }

  // Min quantity: "at least 1500", "minimum 1000 MT", "min 2000 tons"
  const minQty = q.match(/\b(?:min|minimum|at least)\s+([\d,]+)\s*(?:mt|tons?|metric tons?)?/i)
    || lower.match(/\b(?:at least|minimum|min)\s+([\d,]+)/);
  if (minQty) {
    const n = parseInt(minQty[1].replace(/,/g, ''), 10);
    if (Number.isFinite(n)) constraints.minQuantityMT = n;
  }

  // Fuel types (explicit mentions)
  for (const ft of FUEL_TYPES) {
    if (new RegExp(`\\b${ft}\\b`, 'i').test(q)) {
      if (!constraints.fuelTypes.includes(ft)) constraints.fuelTypes.push(ft);
    }
  }
  if (constraints.fuelTypes.length === 0) constraints.fuelTypes = ['VLSFO'];

  // Price ceiling: "under $650/MT", "cheaper than $600", "below 700 USD", "max 650 per MT"
  const priceMatch = q.match(/\b(?:under|below|cheaper than|max|maximum)\s*\$?\s*([\d,]+)(?:\s*\/?\s*MT|\s*per\s*MT|\s*USD)?/i)
    || q.match(/\$([\d,]+)\s*(?:\/|per)\s*MT/i);
  if (priceMatch) {
    const n = parseFloat(priceMatch[1].replace(/,/g, ''));
    if (Number.isFinite(n)) constraints.priceCeilingPerMT = n;
  }

  // Prefer: "prefer Fujairah", "preferred port Singapore", "prefer SGSIN"
  const preferMatch = q.match(/\bprefer(?:red)?\s+(?:port\s+)?([A-Za-z\s]+?)(?:\s|$|,|\.|and)/i);
  if (preferMatch) {
    const name = preferMatch[1].trim();
    if (name && name.length > 1) constraints.preferredPorts.push(name);
  }

  // Avoid: "avoid Singapore", "exclude Rotterdam", "not Singapore"
  const avoidMatch = q.match(/\b(?:avoid|exclude|not)\s+([A-Za-z\s]+?)(?:\s|$|,|\.|and)/i);
  if (avoidMatch) {
    const name = avoidMatch[1].trim();
    if (name && name.length > 1) constraints.avoidPorts.push(name);
  }

  // Time window: "within 3 days", "in 5 days"
  const withinDays = q.match(/\b(?:within|in)\s+(\d+)\s+days?\b/i);
  if (withinDays) {
    const n = parseInt(withinDays[1], 10);
    if (Number.isFinite(n)) constraints.timeWindowDays = n;
  }

  // Required by date: "before Jan 15", "by 15 January", "by 2025-02-01"
  const beforeDate = q.match(/\b(?:before|by)\s+(\d{4}-\d{2}-\d{2})\b/i)
    || q.match(/\b(?:before|by)\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})\b/i);
  if (beforeDate) {
    if (beforeDate[1].match(/^\d{4}-\d{2}-\d{2}$/)) {
      constraints.requiredByDate = beforeDate[1];
    } else if (beforeDate[1] && beforeDate[2]) {
      const monthMap: Record<string, string> = {
        jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
        apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07',
        aug: '08', august: '08', sep: '09', september: '09', oct: '10', october: '10',
        nov: '11', november: '11', dec: '12', december: '12',
      };
      const mon = monthMap[beforeDate[1].toLowerCase().slice(0, 3)];
      const day = beforeDate[2].padStart(2, '0');
      const year = new Date().getFullYear();
      constraints.requiredByDate = `${year}-${mon}-${day}`;
    }
  }

  return constraints;
}
