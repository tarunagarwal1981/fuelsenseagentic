/**
 * Bunker agent: query subtype detection and re-exports.
 * All bunker types are consolidated in bunker.ts; this file re-exports them
 * and provides detectBunkerQuerySubtype for workflow routing.
 */

import type { MultiAgentState } from '@/lib/multi-agent/state';
import type { BunkerQueryType } from '@/lib/types/bunker';

export type {
  BunkerConstraints,
  BunkerPortOption,
  BunkerPricing,
  BunkerQueryType,
  BunkerRequirement,
  ConstraintType,
  ConstraintValidationResult,
  DateRange,
  FleetComparisonParams,
  FleetFilters,
  LaycanCompliance,
  MultiPortParams,
  MultiPortStrategy,
  PortBunkerPlan,
  PortCapabilities,
  PriceHistory,
  RelaxedConstraints,
  ROBCalculationParams,
  ROBSnapshot,
  SingleVsMultiComparison,
  VesselComparison,
  VesselContext,
  VesselInputForComparison,
  VesselRecommendationTier,
  VesselSpecs,
  VesselStatus,
  VoyageTarget,
} from '@/lib/types/bunker';

/**
 * Detect bunker query subtype from state for workflow routing.
 *
 * Logic:
 * - If vessel_identifiers exists and has vessel IDs:
 *   - Multiple vessels → FLEET_COMPARISON
 *   - Single vessel → VESSEL_SPECIFIC
 * - If no vessel context but has route_data → SIMPLE_PORT_TO_PORT
 * - If explicit constraints mentioned in query → CONSTRAINT_FIRST
 */
export function detectBunkerQuerySubtype(state: MultiAgentState): BunkerQueryType {
  const userMessage = state.messages?.find((m) => m._getType?.() === 'human');
  const userQuery = (userMessage as any)?.content?.toString?.() ?? '';
  const queryLower = userQuery.toLowerCase().trim();

  const constraintPatterns = [
    /cheapest|lowest\s+cost|minimum\s+cost|best\s+price|within\s+budget|budget\s+of/i,
    /max(?:imum)?\s+deviation|deviation\s+(?:of|within)\s+\d+|within\s+\d+\s*nm/i,
    /minim(?:ize|um)\s+cost|optim(?:ize|um)\s+for\s+cost|cost\s+optimization/i,
    /strict(?:ly)?\s+under|not\s+exceed|at\s+most\s+\$|less\s+than\s+\$/i,
  ];
  const hasExplicitConstraints = constraintPatterns.some((p) => p.test(queryLower));
  if (hasExplicitConstraints) {
    return 'CONSTRAINT_FIRST';
  }

  const vesselIds = state.vessel_identifiers;
  const hasVesselContext =
    vesselIds &&
    ((vesselIds.imos?.length ?? 0) > 0 || (vesselIds.names?.length ?? 0) > 0);

  if (hasVesselContext) {
    const imoCount = vesselIds!.imos?.length ?? 0;
    const nameCount = vesselIds!.names?.length ?? 0;
    const totalVessels = imoCount + nameCount;
    if (totalVessels > 1) {
      return 'FLEET_COMPARISON';
    }
    return 'VESSEL_SPECIFIC';
  }

  if (state.route_data?.waypoints?.length) {
    return 'SIMPLE_PORT_TO_PORT';
  }

  return 'SIMPLE_PORT_TO_PORT';
}
