/**
 * ROB (Remaining on Board) Calculator Engine
 *
 * Deterministic calculation of bunker requirement for a voyage:
 * voyage consumption, required fuel (with safety margin), and quantity to bunker.
 * Used by vessel-specific bunker planning workflow.
 *
 * Callers should pass ROB at start of voyage as currentROB when available;
 * that value is the single input for voyage calculations (requirement, tracking, comparison).
 */

import type { ROBCalculationParams, BunkerRequirement } from '@/lib/types/bunker';

const DEFAULT_WEATHER_FACTOR = 1.1;
const DEFAULT_SAFETY_MARGIN = 0.15;
const DEFAULT_SPEED_KNOTS = 14;

/**
 * Calculate bunker requirement from current ROB, vessel consumption, and route.
 *
 * Formula:
 * - voyageFuelConsumption = voyage_days × vesselConsumption × weatherFactor
 * - requiredFuel = voyageFuelConsumption × (1 + safetyMargin)
 * - bunkerQuantity = max(0, requiredFuel - currentROB)
 *
 * Voyage days derived from routeEstimatedHours when provided, else from
 * routeDistance / (speedKnots × 24).
 *
 * @param params - ROBCalculationParams (currentROB, consumption, distance, etc.)
 * @returns BunkerRequirement with all calculations
 */
export function calculateBunkerRequirement(params: ROBCalculationParams): BunkerRequirement {
  const weatherFactor = params.weatherFactor ?? DEFAULT_WEATHER_FACTOR;
  const safetyMargin = params.safetyMargin ?? DEFAULT_SAFETY_MARGIN;
  const speedKnots = params.speedKnots ?? DEFAULT_SPEED_KNOTS;

  let voyageDays: number;
  if (params.routeEstimatedHours != null && params.routeEstimatedHours > 0) {
    voyageDays = params.routeEstimatedHours / 24;
  } else if (params.routeDistance > 0 && speedKnots > 0) {
    const voyageHours = params.routeDistance / speedKnots;
    voyageDays = voyageHours / 24;
  } else {
    voyageDays = 0;
  }

  const voyageFuelConsumption =
    voyageDays * params.vesselConsumption * weatherFactor;
  const requiredFuel = voyageFuelConsumption * (1 + safetyMargin);
  const bunkerQuantity = Math.max(0, requiredFuel - params.currentROB);
  const needsBunkering = bunkerQuantity > 0;

  return {
    voyageFuelConsumption,
    requiredFuel,
    bunkerQuantity,
    needsBunkering,
    safetyMarginApplied: safetyMargin,
    weatherFactorApplied: weatherFactor,
    ecaDistanceUsed: params.ecaDistance,
  };
}
