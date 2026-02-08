/**
 * Query Pattern Classifier
 *
 * Distinguishes known patterns (with dedicated templates) from unknown/complex
 * patterns that need LLM Content Architect for intelligent response structure.
 */

import type { AutoSynthesisResult } from './synthesis/auto-synthesis-engine';
import type { MultiAgentState } from './state';

export type QueryPatternType = 'known' | 'unknown';

/**
 * Known patterns: Have dedicated templates with rich UX (bunker, route, vessel comparison).
 * Unknown patterns: Need LLM to decide structure (vessel lists, general info, ambiguous queries).
 */
const KNOWN_PATTERNS: Array<{ domain: string; query: string }> = [
  { domain: 'bunker', query: 'bunker_planning' },
  { domain: 'route', query: 'route_analysis' },
  { domain: 'vessel', query: 'vessel_selection' },
  { domain: 'vessel_comparison', query: 'vessel_selection' },
  { domain: 'weather', query: 'weather_forecast' },
  { domain: 'compliance', query: 'compliance_check' },
  { domain: 'rob', query: 'rob_projection' },
];

/**
 * Classify whether this query matches a known pattern (direct to template)
 * or is unknown (needs LLM Content Architect).
 */
export function classifyQueryPattern(
  synthesis: AutoSynthesisResult,
  state: MultiAgentState
): QueryPatternType {
  const { primary_domain, query_type } = synthesis.context;

  const matchedIntent = synthesis.context.routing_metadata?.matched_intent ?? '';

  const isKnown = KNOWN_PATTERNS.some(
    (p) =>
      (p.domain === primary_domain && p.query === query_type) ||
      (primary_domain === 'vessel' && matchedIntent === 'vessel_selection')
  );

  if (isKnown) {
    return 'known';
  }

  const hasRouteData = Boolean(state.route_data);
  const hasBunkerAnalysis = Boolean(state.bunker_analysis);
  const hasVesselComparison = Boolean(state.vessel_comparison_analysis);

  if (
    hasRouteData &&
    hasBunkerAnalysis &&
    (primary_domain === 'bunker' || primary_domain === 'route')
  ) {
    return 'known';
  }

  if (hasVesselComparison && primary_domain === 'vessel') {
    return 'known';
  }

  return 'unknown';
}
