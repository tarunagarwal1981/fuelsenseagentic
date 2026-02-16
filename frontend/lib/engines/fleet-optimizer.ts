/**
 * Fleet Optimizer Engine
 *
 * Compares multiple vessels for a target voyage: ballast cost, voyage bunker
 * requirement, laycan compliance, and suitability score. Deterministic.
 */

import { haversineDistance } from '@/lib/utils/coordinate-validator';
import { calculateBunkerRequirement } from '@/lib/engines/rob-calculator';
import type {
  FleetComparisonParams,
  VesselComparison,
  VesselInputForComparison,
  VoyageTarget,
  LaycanCompliance,
  VesselRecommendationTier,
} from '@/lib/types/bunker';

const DEFAULT_PRICE_PER_MT = 500;
const DEFAULT_SPEED_KNOTS = 14;
const LAYCAN_POINTS = 40;
const BALLAST_POINTS = 30;
const BUNKER_POINTS = 20;
const ROB_POINTS = 10;

/**
 * Compute ballast distance (nm) from vessel position to load port.
 * Returns 0 if position or origin coordinates missing.
 */
function ballastDistanceNm(
  vessel: VesselInputForComparison,
  voyage: VoyageTarget
): number {
  const pos = vessel.currentPosition;
  const origin = voyage.origin_coordinates;
  if (!pos || !origin) return 0;
  return haversineDistance(
    { lat: pos.lat, lon: pos.lon },
    { lat: origin.lat, lon: origin.lon }
  );
}

/**
 * Classify laycan compliance from hours to reach load port and laycan window.
 * MEETS: ETA well within laycan; TIGHT: close to edge; MISSES: outside or unknown.
 */
function classifyLaycan(
  hoursToLoadPort: number,
  laycanStart?: string,
  laycanEnd?: string
): LaycanCompliance {
  if (!laycanStart || !laycanEnd) return 'MEETS';
  const now = Date.now();
  const etaMs = now + hoursToLoadPort * 60 * 60 * 1000;
  const startMs = new Date(laycanStart).getTime();
  const endMs = new Date(laycanEnd).getTime();
  if (etaMs < startMs) return 'MISSES';
  if (etaMs > endMs) return 'MISSES';
  const windowMs = endMs - startMs;
  const margin = 0.2 * windowMs;
  if (etaMs < startMs + margin || etaMs > endMs - margin) return 'TIGHT';
  return 'MEETS';
}

/**
 * Laycan score 0–100: 100 if MEETS, 50 if TIGHT, 0 if MISSES.
 * Normalized to 0–40 for weighting.
 */
function laycanScore(compliance: LaycanCompliance): number {
  switch (compliance) {
    case 'MEETS': return 100;
    case 'TIGHT': return 50;
    case 'MISSES': return 0;
  }
}

/**
 * Ballast cost efficiency score 0–100 (lower cost = higher score).
 * Relative to other vessels: best cost gets 100, worst gets 0.
 */
function ballastEfficiencyScore(cost: number, costs: number[]): number {
  if (costs.length <= 1) return 100;
  const min = Math.min(...costs);
  const max = Math.max(...costs);
  if (max <= min) return 100;
  return 100 - ((cost - min) / (max - min)) * 100;
}

/**
 * Bunker positioning score: prefer vessels that need less bunker or have better ROB.
 * Simple: lower bunker_quantity gets higher score (0–100), normalized across vessels.
 */
function bunkerPositioningScore(quantity: number, quantities: number[]): number {
  if (quantities.length <= 1) return 100;
  const min = Math.min(...quantities);
  const max = Math.max(...quantities);
  if (max <= min) return 100;
  return 100 - ((quantity - min) / (max - min)) * 100;
}

/**
 * ROB advantage score 0–100: higher rob_advantage = higher score.
 * Normalized across vessels.
 */
function robAdvantageScore(advantage: number, advantages: number[]): number {
  if (advantages.length <= 1) return advantage >= 0 ? 100 : 0;
  const min = Math.min(...advantages);
  const max = Math.max(...advantages);
  if (max <= min) return 100;
  return advantage >= max ? 100 : ((advantage - min) / (max - min)) * 100;
}

/**
 * Compare vessels for a voyage and return sorted comparison results.
 *
 * For each vessel:
 * - Ballast distance (position → load port) and ballast fuel cost
 * - Voyage fuel requirement (ROB calculator)
 * - Voyage bunker cost (quantity × average price)
 * - Total cost, ETA to load port, laycan compliance
 * - Suitability score (laycan 40, ballast 30, bunker 20, ROB 10)
 *
 * @param params - FleetComparisonParams (vessels, voyage, averagePricePerMT, etc.)
 * @returns VesselComparison[] sorted by suitability_score descending
 */
export function compareVesselsForVoyage(params: FleetComparisonParams): VesselComparison[] {
  const pricePerMT = params.averagePricePerMT ?? DEFAULT_PRICE_PER_MT;
  const speedKnots = params.speedKnots ?? DEFAULT_SPEED_KNOTS;
  const weatherFactor = params.weatherFactor ?? 1.1;
  const safetyMargin = params.safetyMargin ?? 0.15;
  const voyage = params.voyage;

  const results: VesselComparison[] = [];
  const ballastCosts: number[] = [];
  const bunkerQuantities: number[] = [];
  const robAdvantages: number[] = [];

  for (const v of params.vessels) {
    const ballastNm = ballastDistanceNm(v, voyage);
    const ballastHours = speedKnots > 0 ? ballastNm / speedKnots : 0;
    const ballastDays = ballastHours / 24;
    const ballastConsumptionMt = ballastDays * v.consumptionRate * weatherFactor;
    const ballastFuelCost = ballastConsumptionMt * pricePerMT;

    const requirement = calculateBunkerRequirement({
      currentROB: v.currentROB,
      vesselConsumption: v.consumptionRate,
      routeDistance: voyage.distance_nm,
      routeEstimatedHours: voyage.estimated_hours,
      weatherFactor,
      safetyMargin,
      speedKnots,
    });

    const voyageBunkerCost = requirement.bunkerQuantity * pricePerMT;
    const totalCost = ballastFuelCost + voyageBunkerCost;
    const robAdvantage = Math.max(0, v.currentROB - requirement.requiredFuel);

    const now = new Date();
    const etaDate = new Date(now.getTime() + ballastHours * 60 * 60 * 1000);
    const estimatedEta = etaDate.toISOString();
    const laycanCompliance = classifyLaycan(
      ballastHours,
      voyage.laycan_start,
      voyage.laycan_end
    );

    ballastCosts.push(ballastFuelCost);
    bunkerQuantities.push(requirement.bunkerQuantity);
    robAdvantages.push(robAdvantage);

    results.push({
      vessel_id: v.vesselId,
      vessel_name: v.vesselName,
      suitability_score: 0,
      laycan_compliance: laycanCompliance,
      ballast_fuel_cost: ballastFuelCost,
      voyage_bunker_cost: voyageBunkerCost,
      total_cost: totalCost,
      recommended_bunker_port: '',
      bunker_quantity: requirement.bunkerQuantity,
      rob_advantage: robAdvantage,
      estimated_eta: estimatedEta,
      recommendation: 'ACCEPTABLE',
      ballast_distance_nm: ballastNm,
      hours_to_load_port: ballastHours,
    });
  }

  const laycanScores = results.map((r) => laycanScore(r.laycan_compliance));
  const ballastScores = results.map((r) => ballastEfficiencyScore(r.ballast_fuel_cost, ballastCosts));
  const bunkerScores = results.map((r) => bunkerPositioningScore(r.bunker_quantity, bunkerQuantities));
  const robScores = results.map((r) => robAdvantageScore(r.rob_advantage, robAdvantages));

  for (let i = 0; i < results.length; i++) {
    const weighted =
      (laycanScores[i] / 100) * LAYCAN_POINTS +
      (ballastScores[i] / 100) * BALLAST_POINTS +
      (bunkerScores[i] / 100) * BUNKER_POINTS +
      (robScores[i] / 100) * ROB_POINTS;
    results[i].suitability_score = Math.round(Math.min(100, Math.max(0, weighted)));
  }

  results.sort((a, b) => b.suitability_score - a.suitability_score);

  const best = results[0];
  const worst = results[results.length - 1];
  for (let i = 0; i < results.length; i++) {
    if (results[i].laycan_compliance === 'MISSES') {
      results[i].recommendation = 'NOT RECOMMENDED';
    } else if (i === 0) {
      results[i].recommendation = 'BEST CHOICE';
    } else {
      results[i].recommendation = 'ACCEPTABLE';
    }
    results[i].recommended_bunker_port = results[i].bunker_quantity > 0 ? 'En-route (TBD)' : 'N/A';
  }

  return results;
}
