/**
 * Tier 2: Query classification by inferring from agent state.
 * Used when Tier 1 patterns don't match with sufficient confidence.
 */

import type { MultiAgentState } from '../../state';
import type { QueryClassification, QueryType } from '../query-classifier';

const WEATHER_ENTRIES_THRESHOLD = 5;
const COST_COMPARISON_RECOMMENDATIONS_MIN = 2;

/**
 * Infer query type from state: route-only, bunker_planning, weather-analysis, cost-comparison.
 * Returns confidence 0 if state does not support a clear inference.
 *
 * Patterns:
 * - route-only: route_data exists, no bunker_analysis
 * - bunker_planning: route_data + bunker_analysis
 * - weather-analysis: weather_forecast with 5+ entries, no bunker_analysis
 * - cost-comparison: bunker_analysis.recommendations has 2+ entries
 */
export function inferFromState(state: MultiAgentState): QueryClassification {
  const hasRoute = !!state.route_data;
  const hasBunker = !!state.bunker_analysis;
  const weather = state.weather_forecast;
  const weatherCount = Array.isArray(weather) ? weather.length : 0;
  const recommendations = state.bunker_analysis?.recommendations;
  const recommendationCount = Array.isArray(recommendations) ? recommendations.length : 0;

  // route-only: only route data, no bunker
  if (hasRoute && !hasBunker) {
    return {
      queryType: 'route-only',
      confidence: 80,
      method: 'tier2-state',
      reasoning: 'State has route_data and no bunker_analysis',
    };
  }

  // bunker_planning: route + bunker
  if (hasRoute && hasBunker) {
    const type: QueryType = recommendationCount >= COST_COMPARISON_RECOMMENDATIONS_MIN ? 'cost-comparison' : 'bunker_planning';
    const confidence = type === 'cost-comparison' ? 78 : 85;
    return {
      queryType: type,
      confidence,
      method: 'tier2-state',
      reasoning:
        type === 'cost-comparison'
          ? `bunker_analysis has ${recommendationCount} recommendations (comparison)`
          : 'State has route_data and bunker_analysis (bunker planning)',
    };
  }

  // weather-analysis: weather forecast with enough points, no bunker
  if (weatherCount >= WEATHER_ENTRIES_THRESHOLD && !hasBunker) {
    return {
      queryType: 'weather-analysis',
      confidence: 75,
      method: 'tier2-state',
      reasoning: `weather_forecast has ${weatherCount} entries, no bunker_analysis`,
    };
  }

  // Cannot infer
  return {
    queryType: 'informational',
    confidence: 0,
    method: 'tier2-state',
    reasoning: 'State does not support clear query type inference',
  };
}
