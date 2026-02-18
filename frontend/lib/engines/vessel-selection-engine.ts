/**
 * Vessel Selection Engine
 *
 * Deterministic engine for comparing vessels, projecting ROB at voyage end,
 * and ranking vessels by cost and feasibility for voyage planning.
 *
 * ROB at start of voyage is the single input for all voyage calculations:
 * we use projected ROB at current voyage end (or fallback: current ROB from API
 * projected to next voyage departure), then run requirements, bunker plan, and ranking.
 *
 * Follows the pattern of ROBTrackingEngine and MultiPortBunkerPlanner.
 * Uses VesselService for vessel data and ROB projection.
 */

import type {
  NextVoyageDetails,
  VesselSelectionConstraints,
  VesselAnalysisResult,
  VesselComparisonAnalysis,
  VesselRanking,
  CostBreakdown,
  BunkerPlan,
} from '@/lib/types/vessel-selection';
import type { FuelQuantityMT } from '@/lib/multi-agent/state';
import type { RouteData } from '@/lib/multi-agent/state';
import type { VesselProfile } from '@/lib/services/vessel-service';
import { getVesselProfile, getDefaultVesselProfile, VesselService } from '@/lib/services/vessel-service';
import { getCurrentStateFromDatalogs } from '@/lib/services/rob-from-datalogs-service';
import { resolveVesselIdentifier } from '@/lib/services/vessel-identifier-service';
import { getConfigManager } from '@/lib/config/config-manager';
import { ServiceContainer } from '@/lib/repositories/service-container';
import { bunkerDataService } from '@/lib/services/bunker-data-service';

// ============================================================================
// Constants
// ============================================================================

const LOG_PREFIX = '⚖️ [VESSEL-SELECTION-ENGINE]';
const DEFAULT_VLSFO_MT_PER_DAY = 30;
const DEFAULT_LSMGO_MT_PER_DAY = 3;
const DEFAULT_SPEED_KNOTS = 14;
const DEFAULT_CAPACITY_VLSFO = 2000;
const DEFAULT_CAPACITY_LSMGO = 200;

/** IMO pattern: 7 digits, optionally prefixed with IMO */
function isIMOString(s: string): boolean {
  const cleaned = s.replace(/^IMO\s*/i, '').trim();
  return /^\d{7}$/.test(cleaned);
}

/** Extract IMO from vessel identifier (name or IMO string) via vessel_details API */
async function resolveIMO(identifier: string): Promise<string | null> {
  if (isIMOString(identifier)) {
    return identifier.replace(/^IMO\s*/i, '').trim();
  }
  const policy = getConfigManager().getDataPolicy('bunker');
  const resolved = await resolveVesselIdentifier({ name: identifier.trim() }, policy);
  return resolved.imo ?? null;
}

/** Build VesselProfile from planning data and projected ROB (for ROBTrackingEngine) */
function buildVesselProfileFromPlanningData(
  vesselName: string,
  projectedROB: { VLSFO: number; LSMGO: number },
  consumptionVlsfo: number,
  consumptionLsmgo: number,
  speed: number
): VesselProfile {
  return {
    vessel_name: vesselName,
    vessel_data: null,
    initial_rob: { VLSFO: projectedROB.VLSFO, LSMGO: projectedROB.LSMGO },
    capacity: { VLSFO: DEFAULT_CAPACITY_VLSFO, LSMGO: DEFAULT_CAPACITY_LSMGO },
    consumption_vlsfo_per_day: consumptionVlsfo,
    consumption_lsmgo_per_day: consumptionLsmgo,
    operational_speed: speed,
    fouling_factor: 1.0,
  };
}

// ============================================================================
// Vessel Selection Engine
// ============================================================================

export class VesselSelectionEngine {
  /**
   * Analyze a single vessel for next voyage feasibility
   *
   * Fetches vessel data, projects ROB at current voyage end,
   * calculates next voyage requirements, and determines feasibility.
   */
  static async analyzeVessel(params: {
    vessel_name: string;
    next_voyage: NextVoyageDetails;
    route_data?: RouteData;
    bunker_analysis?: any;
  }): Promise<VesselAnalysisResult> {
    const { vessel_name, next_voyage, route_data, bunker_analysis } = params;

    console.log(`${LOG_PREFIX} Analyzing vessel: ${vessel_name}`);

    try {
      const container = ServiceContainer.getInstance();
      const vesselService = container.getVesselService();
      // Resolve vessel identifier to IMO via vessel_details API
      const imo = await resolveIMO(vessel_name);

      let vesselProfile: VesselProfile;
      let currentVoyageEndPort: string;
      let currentVoyageEndEta: Date;
      let projectedROB: FuelQuantityMT;

      if (imo) {
        const planningData = await vesselService.getVesselForVoyagePlanning(imo);
        const projected = await vesselService.projectROBAtCurrentVoyageEnd(imo);

        if (planningData && projected) {
          currentVoyageEndPort = projected.voyage_end_port;
          currentVoyageEndEta = projected.voyage_end_date;
          projectedROB = {
            VLSFO: projected.projected_rob.VLSFO,
            LSMGO: projected.projected_rob.LSMGO,
          };

          const consumption = planningData.consumption_profile?.consumption_by_load?.ballast
            ? {
                vlsfo: planningData.consumption_profile.consumption_by_load.ballast.vlsfo || DEFAULT_VLSFO_MT_PER_DAY,
                lsmgo: planningData.consumption_profile.consumption_by_load.ballast.lsmgo || DEFAULT_LSMGO_MT_PER_DAY,
              }
            : { vlsfo: DEFAULT_VLSFO_MT_PER_DAY, lsmgo: DEFAULT_LSMGO_MT_PER_DAY };

          vesselProfile = buildVesselProfileFromPlanningData(
            planningData.name || vessel_name,
            projectedROB,
            consumption.vlsfo,
            consumption.lsmgo,
            next_voyage.speed ?? DEFAULT_SPEED_KNOTS
          );
          console.log(`${LOG_PREFIX} Using VesselService data for IMO ${imo}`);
        } else {
          // Fallback: compute ROB at start of voyage from bunker API current ROB + projection to departure
          const departureDate = next_voyage.departure_date
            ? new Date(next_voyage.departure_date)
            : new Date();
          currentVoyageEndPort = next_voyage.origin;
          currentVoyageEndEta = departureDate;

          let fallbackProjected: FuelQuantityMT | null = null;
          try {
            const snapshot = await bunkerDataService.fetchCurrentROB(imo);
            const currentVlsfo = snapshot.robVLSFO ?? 0;
            const currentLsmgo = snapshot.robLSMGO ?? 0;
            const total = snapshot.totalROB ?? 0;
            const currentRob =
              currentVlsfo > 0 || currentLsmgo > 0
                ? { VLSFO: currentVlsfo, LSMGO: currentLsmgo }
                : { VLSFO: total, LSMGO: 0 };
            fallbackProjected = VesselService.projectROBAtFutureDate(
              currentRob,
              new Date(),
              departureDate,
              DEFAULT_VLSFO_MT_PER_DAY,
              DEFAULT_LSMGO_MT_PER_DAY
            );
            console.log(`${LOG_PREFIX} ROB at start of voyage calculated from bunker API for IMO ${imo}`);
          } catch {
            console.warn(`${LOG_PREFIX} Bunker API ROB fetch failed for IMO ${imo}, using legacy profile`);
          }

          if (fallbackProjected == null) {
            const stateFromDatalogs = await getCurrentStateFromDatalogs(imo);
            if (stateFromDatalogs?.current_rob) {
              const currentRob = {
                VLSFO: stateFromDatalogs.current_rob.VLSFO ?? 0,
                LSMGO: stateFromDatalogs.current_rob.LSMGO ?? 0,
              };
              fallbackProjected = VesselService.projectROBAtFutureDate(
                currentRob,
                new Date(),
                departureDate,
                DEFAULT_VLSFO_MT_PER_DAY,
                DEFAULT_LSMGO_MT_PER_DAY
              );
              console.log(`${LOG_PREFIX} ROB at start of voyage from data_logs for IMO ${imo}`);
            }
          }

          const legacyProfile = await getVesselProfile(vessel_name, undefined, vesselService);
          vesselProfile = legacyProfile ?? getDefaultVesselProfile();
          projectedROB = fallbackProjected ?? {
            VLSFO: vesselProfile.initial_rob.VLSFO,
            LSMGO: vesselProfile.initial_rob.LSMGO,
          };
          if (fallbackProjected) {
            vesselProfile = {
              ...vesselProfile,
              initial_rob: { VLSFO: projectedROB.VLSFO, LSMGO: projectedROB.LSMGO },
            };
          }
        }
      } else {
        const legacyProfile = await getVesselProfile(vessel_name, undefined, vesselService);
        vesselProfile = legacyProfile ?? getDefaultVesselProfile();
        currentVoyageEndPort = next_voyage.origin;
        currentVoyageEndEta = new Date(next_voyage.departure_date || new Date());
        projectedROB = {
          VLSFO: vesselProfile.initial_rob.VLSFO,
          LSMGO: vesselProfile.initial_rob.LSMGO,
        };
        console.log(`${LOG_PREFIX} Using legacy vessel profile for ${vessel_name}`);
      }

      // Calculate next voyage fuel requirements
      const distanceNm = route_data?.distance_nm ?? 0;
      const speedKnots = next_voyage.speed ?? DEFAULT_SPEED_KNOTS;
      const durationDays =
        distanceNm > 0 ? distanceNm / (speedKnots * 24) : (route_data?.estimated_hours ?? 336) / 24;
      const consumptionVlsfo = vesselProfile.consumption_vlsfo_per_day;
      const consumptionLsmgo = vesselProfile.consumption_lsmgo_per_day;

      const nextVoyageRequirements: FuelQuantityMT = {
        VLSFO: consumptionVlsfo * durationDays,
        LSMGO: consumptionLsmgo * durationDays,
      };

      const canProceedWithoutBunker =
        projectedROB.VLSFO >= nextVoyageRequirements.VLSFO &&
        projectedROB.LSMGO >= nextVoyageRequirements.LSMGO;

      let bunkerPlan: BunkerPlan | undefined;
      let baseFuelCost = 0;
      let bunkerFuelCost = 0;
      let bunkerPortFees = 0;
      let deviationCost = 0;
      const timeCost = 0;

      if (!canProceedWithoutBunker && bunker_analysis?.best_option) {
        const best = bunker_analysis.best_option;
        bunkerPlan = {
          port_code: best.port_code ?? '',
          port_name: best.port_name ?? '',
          bunker_quantity: {
            VLSFO: Math.max(0, nextVoyageRequirements.VLSFO - projectedROB.VLSFO),
            LSMGO: Math.max(0, nextVoyageRequirements.LSMGO - projectedROB.LSMGO),
          },
          total_cost_usd: best.total_cost_usd ?? 0,
          deviation_nm: best.distance_from_route_nm ?? 0,
        };
        bunkerFuelCost = best.fuel_cost_usd ?? 0;
        deviationCost = best.deviation_cost_usd ?? 0;
      } else if (!canProceedWithoutBunker) {
        const vlsfoNeeded = Math.max(0, nextVoyageRequirements.VLSFO - projectedROB.VLSFO);
        const lsmgoNeeded = Math.max(0, nextVoyageRequirements.LSMGO - projectedROB.LSMGO);
        bunkerFuelCost = vlsfoNeeded * 600 + lsmgoNeeded * 800;
      }

      const totalVoyageCost = baseFuelCost + bunkerFuelCost + bunkerPortFees + deviationCost + timeCost;

      const costBreakdown: CostBreakdown = {
        base_fuel_cost: baseFuelCost,
        bunker_fuel_cost: bunkerFuelCost,
        bunker_port_fees: bunkerPortFees,
        deviation_cost: deviationCost,
        time_cost: timeCost,
        total_cost: totalVoyageCost,
      };

      const feasibilityScore = VesselSelectionEngine.calculateFeasibilityScore({
        vessel_name,
        vessel_profile: vesselProfile,
        current_voyage_end_port: currentVoyageEndPort,
        current_voyage_end_eta: currentVoyageEndEta,
        projected_rob_at_start: projectedROB,
        next_voyage_requirements: nextVoyageRequirements,
        can_proceed_without_bunker: canProceedWithoutBunker,
        bunker_plan: bunkerPlan,
        total_voyage_cost: totalVoyageCost,
        cost_breakdown: costBreakdown,
        feasibility_score: 0,
        risks: [],
      } as VesselAnalysisResult);

      const risks: string[] = [];
      if (!canProceedWithoutBunker) risks.push('Requires bunkering before next voyage');
      if (projectedROB.VLSFO < nextVoyageRequirements.VLSFO * 0.5) risks.push('Low VLSFO margin');
      if (projectedROB.LSMGO < nextVoyageRequirements.LSMGO * 0.5) risks.push('Low LSMGO margin');

      const result: VesselAnalysisResult = {
        vessel_name,
        vessel_profile: vesselProfile,
        current_voyage_end_port: currentVoyageEndPort,
        current_voyage_end_eta: currentVoyageEndEta,
        projected_rob_at_start: projectedROB,
        next_voyage_requirements: nextVoyageRequirements,
        can_proceed_without_bunker: canProceedWithoutBunker,
        bunker_plan: bunkerPlan,
        total_voyage_cost: totalVoyageCost,
        cost_breakdown: costBreakdown,
        feasibility_score: feasibilityScore,
        risks,
      };

      console.log(`${LOG_PREFIX} Analysis complete: ${vessel_name}, can_proceed=${canProceedWithoutBunker}, cost=$${totalVoyageCost.toFixed(0)}`);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`${LOG_PREFIX} Error analyzing ${vessel_name}:`, err.message);
      throw error;
    }
  }

  /**
   * Compare multiple vessels and rank by cost/feasibility
   */
  static async compareVessels(params: {
    vessel_names: string[];
    next_voyage: NextVoyageDetails;
    constraints?: VesselSelectionConstraints;
    route_data?: RouteData;
    bunker_analysis?: any;
  }): Promise<VesselComparisonAnalysis> {
    const { vessel_names, next_voyage, constraints, route_data, bunker_analysis } = params;

    console.log(`${LOG_PREFIX} Comparing ${vessel_names.length} vessel(s)`);

    try {
      if (!vessel_names || vessel_names.length === 0) {
        throw new Error('vessel_names array is required and must not be empty');
      }
      if (!next_voyage?.origin || !next_voyage?.destination) {
        throw new Error('next_voyage must have origin and destination');
      }

      let namesToAnalyze = vessel_names;
      if (constraints?.exclude_vessels?.length) {
        const excludeSet = new Set(constraints.exclude_vessels.map((v) => v.toLowerCase()));
        namesToAnalyze = vessel_names.filter((n) => !excludeSet.has(n.toLowerCase()));
        console.log(`${LOG_PREFIX} Excluded ${vessel_names.length - namesToAnalyze.length} vessel(s)`);
      }

      const analyses = await Promise.all(
        namesToAnalyze.map((name) =>
          VesselSelectionEngine.analyzeVessel({
            vessel_name: name,
            next_voyage,
            route_data,
            bunker_analysis,
          })
        )
      );

      let filtered = analyses;
      if (constraints?.max_bunker_cost != null) {
        filtered = analyses.filter((a) => a.total_voyage_cost <= constraints.max_bunker_cost!);
        console.log(`${LOG_PREFIX} Filtered by max_bunker_cost: ${analyses.length} -> ${filtered.length}`);
      }

      const rankings = VesselSelectionEngine.rankVessels(filtered);
      const comparisonMatrix = VesselSelectionEngine.generateComparisonMatrix(filtered);

      const recommendedVessel = rankings[0]?.vessel_name ?? vessel_names[0];
      const analysisSummary = `Compared ${filtered.length} vessel(s). Recommended: ${recommendedVessel} (${rankings[0]?.recommendation_reason ?? 'best cost/feasibility'}).`;

      console.log(`${LOG_PREFIX} Comparison complete. Recommended: ${recommendedVessel}`);

      return {
        vessels_analyzed: filtered,
        rankings,
        recommended_vessel: recommendedVessel,
        analysis_summary: analysisSummary,
        comparison_matrix: comparisonMatrix,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`${LOG_PREFIX} Error comparing vessels:`, err.message);
      throw error;
    }
  }

  /**
   * Rank vessels by feasibility and cost
   */
  static rankVessels(analyses: VesselAnalysisResult[]): VesselRanking[] {
    if (analyses.length === 0) return [];

    const costs = analyses.map((a) => a.total_voyage_cost);
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);
    const costRange = maxCost - minCost || 1;

    const deviations = analyses.map((a) => a.bunker_plan?.deviation_nm ?? 0);
    const maxDev = Math.max(...deviations, 1);

    const scored = analyses.map((a, i) => {
      let score = 0;
      if (a.can_proceed_without_bunker) score += 100;
      score += Math.max(0, 50 * (1 - (a.total_voyage_cost - minCost) / costRange));
      score += Math.max(0, 25 * (1 - (a.bunker_plan?.deviation_nm ?? 0) / maxDev));

      let reason = '';
      if (a.can_proceed_without_bunker) {
        reason = 'No bunkering required - sufficient ROB for next voyage';
      } else {
        reason = `Bunker required at ${a.bunker_plan?.port_name ?? 'TBD'}. Cost: $${a.total_voyage_cost.toLocaleString()}`;
      }

      return { ...a, _score: score, _reason: reason };
    });

    scored.sort((a, b) => b._score - a._score);

    return scored.map((a, i) => ({
      rank: i + 1,
      vessel_name: a.vessel_name,
      score: a._score,
      recommendation_reason: a._reason,
    }));
  }

  /**
   * Calculate feasibility score 0-100
   */
  static calculateFeasibilityScore(analysis: VesselAnalysisResult): number {
    let score = 50;

    if (analysis.can_proceed_without_bunker) score += 30;
    if (analysis.risks.length === 0) score += 10;
    if (analysis.risks.length === 1) score += 5;
    score -= analysis.risks.length * 5;

    const robMarginVlsfo =
      analysis.projected_rob_at_start.VLSFO / Math.max(analysis.next_voyage_requirements.VLSFO, 1);
    const robMarginLsmgo =
      analysis.projected_rob_at_start.LSMGO / Math.max(analysis.next_voyage_requirements.LSMGO, 1);
    if (robMarginVlsfo >= 1.2 && robMarginLsmgo >= 1.2) score += 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate comparison matrix for side-by-side view
   */
  static generateComparisonMatrix(analyses: VesselAnalysisResult[]): Record<string, Record<string, unknown>> {
    const matrix: Record<string, Record<string, unknown>> = {};

    for (const a of analyses) {
      matrix[a.vessel_name] = {
        projected_rob_vlsfo: a.projected_rob_at_start.VLSFO,
        projected_rob_lsmgo: a.projected_rob_at_start.LSMGO,
        next_voyage_vlsfo_req: a.next_voyage_requirements.VLSFO,
        next_voyage_lsmgo_req: a.next_voyage_requirements.LSMGO,
        can_proceed_without_bunker: a.can_proceed_without_bunker,
        total_voyage_cost: a.total_voyage_cost,
        feasibility_score: a.feasibility_score,
        bunker_port: a.bunker_plan?.port_name ?? null,
        deviation_nm: a.bunker_plan?.deviation_nm ?? null,
        risks: a.risks,
      };
    }

    return matrix;
  }
}
