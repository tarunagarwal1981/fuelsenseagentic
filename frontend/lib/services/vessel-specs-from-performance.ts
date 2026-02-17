/**
 * Vessel Specs from Performance Service
 *
 * Builds consumption rate (MT/day) and tank capacity for bunker planning from
 * vessel performance model table when bunker API /vessels/:id/specs is unavailable.
 * Uses data-policy for load mapping and tank default.
 */

import { HullPerformanceClient } from '@/lib/api-clients/hull-performance-client';
import type { VesselPerformanceModelRecord } from '@/lib/api-clients/hull-performance-client';
import type { DataPolicyConfig } from '@/lib/types/config';
import type { VesselSpecs } from '@/lib/types/bunker';

const hullClient = new HullPerformanceClient();

export type LoadCondition = 'ballast' | 'laden';

export interface BaselineCurves {
  ballast: Array<{ speed: number; consumption: number }>;
  laden: Array<{ speed: number; consumption: number }>;
}

const TANK_CAPACITY_FALLBACK_MT = 3000;

function toCurve(rows: VesselPerformanceModelRecord[]): Array<{ speed: number; consumption: number }> {
  return rows
    .map((r) => ({ speed: r.speed_kts, consumption: r.me_consumption_ }))
    .sort((a, b) => a.speed - b.speed);
}

/**
 * Get baseline curves for a vessel (ballast and laden) from vessel-performance-model-table.
 * Load logic: ballast = Ballast rows; laden = Scantling if present else Design.
 */
export async function getBaselineCurvesForVessel(imo: string): Promise<BaselineCurves | null> {
  const imoNum = parseInt(String(imo).trim(), 10);
  if (!Number.isFinite(imoNum)) return null;
  try {
    const allRows = await hullClient.getVesselPerformanceModel({ vessel_imo: imoNum });
    const forVessel = allRows.filter((r) => Number(r.vessel_imo) === imoNum);

    const ballastRows = forVessel.filter((r) =>
      /^ballast$/i.test(String(r.load_type ?? '').trim())
    );
    const designRows = forVessel.filter((r) =>
      /^design$/i.test(String(r.load_type ?? '').trim())
    );
    const scantlingRows = forVessel.filter((r) =>
      /^scantling$/i.test(String(r.load_type ?? '').trim())
    );
    const ladenRows = scantlingRows.length > 0 ? scantlingRows : designRows;

    const ballast = toCurve(ballastRows);
    const laden = toCurve(ladenRows);
    if (ballast.length === 0 && laden.length === 0) return null;
    return { ballast, laden };
  } catch {
    return null;
  }
}

/**
 * Linear interpolation: consumption at speedKnots from sorted curve.
 * Clamps to nearest point if outside range.
 */
function interpolateConsumption(
  curve: Array<{ speed: number; consumption: number }>,
  speedKnots: number
): number | null {
  if (curve.length === 0) return null;
  if (curve.length === 1) return curve[0].consumption;
  const sorted = [...curve].sort((a, b) => a.speed - b.speed);
  if (speedKnots <= sorted[0].speed) return sorted[0].consumption;
  if (speedKnots >= sorted[sorted.length - 1].speed) return sorted[sorted.length - 1].consumption;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (speedKnots >= a.speed && speedKnots <= b.speed) {
      const t = (speedKnots - a.speed) / (b.speed - a.speed);
      return a.consumption + t * (b.consumption - a.consumption);
    }
  }
  return sorted[sorted.length - 1].consumption;
}

/**
 * Get consumption rate (MT/day) at given speed and load condition.
 * Uses policy consumption_load_mapping or default (ballast=Ballast, laden=Scantling else Design).
 */
export async function getConsumptionAtSpeed(
  imo: string,
  speedKnots: number,
  loadCondition: LoadCondition,
  _policy?: DataPolicyConfig | null
): Promise<number | null> {
  const curves = await getBaselineCurvesForVessel(imo);
  if (!curves) return null;
  const curve = loadCondition === 'ballast' ? curves.ballast : curves.laden;
  return interpolateConsumption(curve, speedKnots);
}

/**
 * Tank capacity from policy or fallback (3000 MT).
 */
export function getTankCapacityDefault(policy?: DataPolicyConfig | null): number {
  const n = policy?.tank_capacity_default;
  return typeof n === 'number' && Number.isFinite(n) ? n : TANK_CAPACITY_FALLBACK_MT;
}

/**
 * Build VesselSpecs for bunker workflow: consumption from performance model, tank from policy.
 */
export async function buildVesselSpecsFromPerformance(
  imo: string,
  vesselName: string,
  speedKnots: number,
  loadCondition: LoadCondition,
  policy?: DataPolicyConfig | null
): Promise<VesselSpecs | null> {
  const consumptionRate = await getConsumptionAtSpeed(imo, speedKnots, loadCondition, policy);
  if (consumptionRate == null) return null;
  const tankCapacity = getTankCapacityDefault(policy);
  return {
    vesselId: imo,
    vesselName: vesselName || `IMO ${imo}`,
    vesselType: 'Unknown',
    consumptionRate,
    tankCapacity,
    fuelCompatibility: ['VLSFO'],
  };
}
