/**
 * Vessel Selection Query Parser
 *
 * Parses natural language queries about vessel selection/comparison and extracts
 * structured data: vessel names, next voyage details (origin, destination, date, speed).
 *
 * Used by the Supervisor Agent to populate state before routing to vessel_selection_agent.
 *
 * @example
 * ```ts
 * // Test cases (expected inputs/outputs):
 *
 * // extractVesselNames
 * VesselSelectionQueryParser.extractVesselNames("Compare MV Pacific Star, MV Atlantic Trader")
 * // → ["MV Pacific Star", "MV Atlantic Trader"]
 *
 * VesselSelectionQueryParser.extractVesselNames("Which vessel is best: OCEAN PRIDE or ATLANTIC STAR?")
 * // → ["OCEAN PRIDE", "ATLANTIC STAR"]
 *
 * VesselSelectionQueryParser.extractVesselNames("Select vessel between TITAN and ATHENA")
 * // → ["TITAN", "ATHENA"]
 *
 * // extractNextVoyageDetails
 * VesselSelectionQueryParser.extractNextVoyageDetails("from Singapore to Rotterdam")
 * // → { origin: "Singapore", destination: "Rotterdam" }
 *
 * VesselSelectionQueryParser.extractNextVoyageDetails("SGSIN to NLRTM departing 2025-03-15 at 14 knots")
 * // → { origin: "SGSIN", destination: "NLRTM", departure_date: "2025-03-15", speed: 14 }
 *
 * // isVesselSelectionQuery
 * VesselSelectionQueryParser.isVesselSelectionQuery("Compare vessels for next voyage")
 * // → true
 *
 * VesselSelectionQueryParser.isVesselSelectionQuery("What's the weather in Singapore?")
 * // → false
 *
 * // parseVesselSelectionQuery
 * VesselSelectionQueryParser.parseVesselSelectionQuery(
 *   "Compare MV Pacific Star and MV Atlantic Trader from Singapore to Rotterdam"
 * )
 * // → { vessel_names: ["MV Pacific Star", "MV Atlantic Trader"], next_voyage: { origin: "Singapore", destination: "Rotterdam" } }
 * ```
 */

import type { NextVoyageDetails, VesselSelectionInput } from '@/lib/types/vessel-selection';

// ============================================================================
// Constants
// ============================================================================

const LOG_PREFIX = '🔍 [VESSEL-PARSER]';

/** Keywords indicating vessel selection intent */
const VESSEL_SELECTION_KEYWORDS = [
  'compare vessels',
  'which vessel',
  'best ship',
  'select vessel',
  'compare ships',
  'vessel selection',
  'compare vessel',
  'best vessel',
] as const;

/** Vessel name prefixes (MV, M/V, MT, etc.) */
const VESSEL_PREFIX_PATTERN = /^(?:MV|M\/V|MT|M\.V\.?|SS)\s+/i;

/** Stop words to exclude from vessel name extraction */
const VESSEL_STOP_WORDS = new Set([
  'compare', 'which', 'best', 'select', 'vessel', 'ship', 'between', 'among',
  'for', 'the', 'and', 'or', 'is', 'are', 'to', 'from',
]);

// ============================================================================
// VesselSelectionQueryParser
// ============================================================================

export class VesselSelectionQueryParser {
  /**
   * Extract vessel names from a query.
   * Handles: MV prefix, comma-separated lists, "and" separated lists.
   *
   * @param query - Raw user query string
   * @returns Array of vessel names (may include MV/M/V prefix if present in query)
   */
  static extractVesselNames(query: string): string[] {
    if (!query || typeof query !== 'string') {
      console.log(`${LOG_PREFIX} extractVesselNames: empty/invalid query`);
      return [];
    }

    const trimmed = query.trim();
    const names: string[] = [];
    const seen = new Set<string>();

    // Pattern 1: "MV Pacific Star, MV Atlantic Trader" or "MV Pacific Star and MV Atlantic Trader"
    const prefixedPattern = /(?:MV|M\/V|MT|M\.V\.?|SS)\s+([A-Za-z0-9\s]+?)(?=\s*,\s*|\s+and\s+|\s*$)/gi;
    for (const m of trimmed.matchAll(prefixedPattern)) {
      const full = m[0].trim();
      const nameOnly = full.replace(VESSEL_PREFIX_PATTERN, '').trim();
      const toAdd = full; // Keep full "MV Pacific Star" as per example
      if (nameOnly.length >= 2 && !seen.has(toAdd)) {
        seen.add(toAdd);
        names.push(toAdd);
      }
    }

    // Pattern 2: "between X and Y" or "compare X and Y"
    const betweenPattern = /(?:between|compare|among)\s+([A-Za-z0-9\s]+?)\s+and\s+([A-Za-z0-9\s]+?)(?:\s+and\s+([A-Za-z0-9\s]+))?(?=\s+for|\s+from|\s+to|\s+on|\s*$)/i;
    const betweenMatch = trimmed.match(betweenPattern);
    if (betweenMatch) {
      const parts = betweenMatch.slice(1).filter(Boolean).map((p) => p.trim());
      for (const p of parts) {
        const cleaned = p.replace(VESSEL_PREFIX_PATTERN, '').trim();
        if (cleaned.length >= 2 && !VESSEL_STOP_WORDS.has(cleaned.toLowerCase()) && !seen.has(p)) {
          seen.add(p);
          names.push(p);
        }
      }
    }

    // Pattern 3: "X and Y" where X and Y look like vessel names (title case or ALL CAPS)
    const andPattern = /\b([A-Z][A-Za-z0-9\s]{1,}?)\s+and\s+([A-Z][A-Za-z0-9\s]{1,}?)(?=\s+for|\s+from|\s+to|\s+on|\s*$)/g;
    if (names.length === 0) {
      for (const m of trimmed.matchAll(andPattern)) {
        const left = m[1].trim();
        const right = m[2].trim();
        for (const part of [left, right]) {
          const cleaned = part.replace(VESSEL_PREFIX_PATTERN, '').trim();
          if (cleaned.length >= 2 && !VESSEL_STOP_WORDS.has(cleaned.toLowerCase()) && !seen.has(part)) {
            seen.add(part);
            names.push(part);
          }
        }
      }
    }

    // Pattern 4: Comma-separated list "X, Y, Z"
    const commaParts = trimmed.split(/,\s*/);
    if (names.length === 0 && commaParts.length >= 2) {
      for (const p of commaParts) {
        const cleaned = p.replace(VESSEL_PREFIX_PATTERN, '').trim();
        if (cleaned.length >= 2 && /[A-Za-z]/.test(cleaned) && !VESSEL_STOP_WORDS.has(cleaned.toLowerCase()) && !seen.has(cleaned)) {
          seen.add(cleaned);
          names.push(cleaned);
        }
      }
    }

    // Pattern 5: "X or Y" / "X vs Y"
    const orPattern = /\b([A-Za-z0-9\s]{2,}?)\s+(?:or|vs\.?)\s+([A-Za-z0-9\s]{2,}?)(?=\s+for|\s+from|\s*$)/gi;
    if (names.length === 0) {
      for (const m of trimmed.matchAll(orPattern)) {
        const left = m[1].trim().replace(VESSEL_PREFIX_PATTERN, '').trim();
        const right = m[2].trim().replace(VESSEL_PREFIX_PATTERN, '').trim();
        for (const part of [left, right]) {
          if (part.length >= 2 && !VESSEL_STOP_WORDS.has(part.toLowerCase()) && !seen.has(part)) {
            seen.add(part);
            names.push(part);
          }
        }
      }
    }

    if (names.length > 0) {
      console.log(`${LOG_PREFIX} extractVesselNames: found ${names.length} vessel(s):`, names);
    } else {
      console.log(`${LOG_PREFIX} extractVesselNames: no vessel names found in query`);
    }

    return names;
  }

  /**
   * Extract next voyage details (origin, destination, date, speed) from query.
   *
   * @param query - Raw user query string
   * @returns NextVoyageDetails or null if nothing found
   */
  static extractNextVoyageDetails(query: string): NextVoyageDetails | null {
    if (!query || typeof query !== 'string') {
      console.log(`${LOG_PREFIX} extractNextVoyageDetails: empty/invalid query`);
      return null;
    }

    const trimmed = query.trim();
    let origin = '';
    let destination = '';
    let departure_date: string | undefined;
    let speed: number | undefined;

    // Pattern 1: "from X to Y" or "from X to Y"
    const fromToPattern = /(?:from|origin)\s+([A-Za-z0-9°\s,\.]+?)\s+(?:to|destination)\s+([A-Za-z0-9°\s,\.]+?)(?=\s+departing|\s+on|\s+at|\s+\d|$)/i;
    const fromToMatch = trimmed.match(fromToPattern);
    if (fromToMatch) {
      origin = fromToMatch[1].trim();
      destination = fromToMatch[2].trim();
      console.log(`${LOG_PREFIX} extractNextVoyageDetails: from-to pattern → origin="${origin}", destination="${destination}"`);
    }

    // Pattern 2: "X to Y" (without "from") - only if origin/dest not yet found
    if (!origin && !destination) {
      const toPattern = /([A-Za-z0-9°\s,\.]{2,}?)\s+to\s+([A-Za-z0-9°\s,\.]{2,}?)(?=\s+departing|\s+on|\s+at|\s+\d|$)/i;
      const toMatch = trimmed.match(toPattern);
      if (toMatch) {
        origin = toMatch[1].trim();
        destination = toMatch[2].trim();
        console.log(`${LOG_PREFIX} extractNextVoyageDetails: to pattern → origin="${origin}", destination="${destination}"`);
      }
    }

    // Pattern 3: "route/voyage between X and Y" (for ports - avoid matching vessel names)
    if (!origin && !destination) {
      const betweenPattern = /(?:route|voyage|passage)\s+between\s+([A-Za-z0-9°\s,\.]+?)\s+and\s+([A-Za-z0-9°\s,\.]+?)(?=\s+departing|\s+on|\s*$)/i;
      const betweenMatch = trimmed.match(betweenPattern);
      if (betweenMatch) {
        origin = betweenMatch[1].trim();
        destination = betweenMatch[2].trim();
        console.log(`${LOG_PREFIX} extractNextVoyageDetails: route-between pattern → origin="${origin}", destination="${destination}"`);
      }
    }

    // Pattern 4: UN/LOCODE style "SGSIN to NLRTM" (5-char codes)
    if (!origin && !destination) {
      const locodePattern = /\b([A-Z]{2}[A-Z0-9]{3})\s+(?:to|–|-)\s+([A-Z]{2}[A-Z0-9]{3})\b/i;
      const locodeMatch = trimmed.match(locodePattern);
      if (locodeMatch) {
        origin = locodeMatch[1].toUpperCase();
        destination = locodeMatch[2].toUpperCase();
        console.log(`${LOG_PREFIX} extractNextVoyageDetails: UN/LOCODE pattern → origin="${origin}", destination="${destination}"`);
      }
    }

    // Extract departure date: "departing 2025-03-15", "on 15 Mar 2025", "March 15", etc.
    const datePatterns = [
      /departing\s+(\d{4}-\d{2}-\d{2})/i,
      /(?:on|for)\s+(\d{4}-\d{2}-\d{2})/,
      /(?:on|for)\s+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})/i,
      /(?:on|for)\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/i,
      /(\d{1,2}\/\d{1,2}\/\d{4})/,
      /(\d{1,2}-\d{1,2}-\d{4})/,
    ];
    for (const pattern of datePatterns) {
      const dateMatch = trimmed.match(pattern);
      if (dateMatch) {
        departure_date = dateMatch[1].trim();
        console.log(`${LOG_PREFIX} extractNextVoyageDetails: departure_date="${departure_date}"`);
        break;
      }
    }

    // Extract speed: "14 knots", "at 14 knots", "14 kts"
    const speedPatterns = [
      /(?:at|@|speed)\s*(\d+(?:\.\d+)?)\s*(?:knots?|kts?)/i,
      /(\d+(?:\.\d+)?)\s*(?:knots?|kts?)/i,
    ];
    for (const pattern of speedPatterns) {
      const speedMatch = trimmed.match(pattern);
      if (speedMatch) {
        const parsed = parseFloat(speedMatch[1]);
        if (!isNaN(parsed) && parsed > 0 && parsed <= 30) {
          speed = parsed;
          console.log(`${LOG_PREFIX} extractNextVoyageDetails: speed=${speed} knots`);
          break;
        }
      }
    }

    if (!origin && !destination && !departure_date && speed === undefined) {
      console.log(`${LOG_PREFIX} extractNextVoyageDetails: no voyage details found`);
      return null;
    }

    const result: NextVoyageDetails = {
      origin: origin || '',
      destination: destination || '',
      ...(departure_date && { departure_date }),
      ...(speed !== undefined && { speed }),
    };

    console.log(`${LOG_PREFIX} extractNextVoyageDetails: returning`, result);
    return result;
  }

  /**
   * Detect if the query is about vessel selection.
   *
   * @param query - Raw user query string
   * @returns true if vessel selection intent detected
   */
  static isVesselSelectionQuery(query: string): boolean {
    if (!query || typeof query !== 'string') {
      console.log(`${LOG_PREFIX} isVesselSelectionQuery: empty/invalid query → false`);
      return false;
    }

    const lower = query.toLowerCase().trim();
    const result = VESSEL_SELECTION_KEYWORDS.some((kw) => lower.includes(kw));

    console.log(`${LOG_PREFIX} isVesselSelectionQuery: ${result} (keywords: ${VESSEL_SELECTION_KEYWORDS.join(', ')})`);
    return result;
  }

  /**
   * Combine extraction methods and return complete VesselSelectionInput.
   * Returns null if not a vessel selection query.
   *
   * @param query - Raw user query string
   * @returns VesselSelectionInput or null
   */
  static parseVesselSelectionQuery(query: string): VesselSelectionInput | null {
    if (!query || typeof query !== 'string') {
      console.log(`${LOG_PREFIX} parseVesselSelectionQuery: empty/invalid query → null`);
      return null;
    }

    if (!this.isVesselSelectionQuery(query)) {
      console.log(`${LOG_PREFIX} parseVesselSelectionQuery: not a vessel selection query → null`);
      return null;
    }

    const vesselNames = this.extractVesselNames(query);
    const nextVoyage = this.extractNextVoyageDetails(query);

    // Build next_voyage - use extracted or empty structure
    const voyage: NextVoyageDetails = nextVoyage ?? {
      origin: '',
      destination: '',
    };

    if (vesselNames.length === 0) {
      console.log(`${LOG_PREFIX} parseVesselSelectionQuery: vessel selection query but no vessel names extracted → null`);
      return null;
    }

    const result: VesselSelectionInput = {
      vessel_names: vesselNames,
      next_voyage: voyage,
    };

    console.log(`${LOG_PREFIX} parseVesselSelectionQuery: success`, {
      vessel_count: vesselNames.length,
      has_origin: !!voyage.origin,
      has_destination: !!voyage.destination,
    });

    return result;
  }
}
