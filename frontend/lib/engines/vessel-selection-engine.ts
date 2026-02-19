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
import { getConsumptionAtSpeed, type LoadCondition } from '@/lib/services/vessel-specs-from-performance';
import { resolveVesselIdentifier } from '@/lib/services/vessel-identifier-service';
import { getConfigManager } from '@/lib/config/config-manager';
import { ServiceContainer } from '@/lib/repositories/service-container';
import { bunkerDataService } from '@/lib/services/bunker-data-service';

// ============================================================================
// Constants
// ============================================================================

const LOG_PREFIX = '⚖️ [VESSEL-SELECTION-ENGINE]';
const DEFAULT_CAPACITY_VLSFO = 2000;
const DEFAULT_CAPACITY_LSMGO = 200;

/** Engine params from YAML with fallbacks (used by analyzeVessel and related paths) */
function getEngineParamsWithFallbacks(): {
  default_vlsfo_mt_per_day: number;
  default_lsmgo_mt_per_day: number;
  default_speed_knots: number;
  current_voyage_default_speed_knots: number;
} {
  const cfg = getConfigManager().getEngineParams('vessel_selection_calculation');
  const p = cfg?.parameters;
  return {
    default_vlsfo_mt_per_day: p?.default_vlsfo_mt_per_day ?? 30,
    default_lsmgo_mt_per_day: p?.default_lsmgo_mt_per_day ?? 3,
    default_speed_knots: p?.default_speed_knots ?? 14,
    current_voyage_default_speed_knots: p?.current_voyage_default_speed_knots ?? 12,
  };
}

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
    /** When set, ROB at start of next voyage = current ROB − consumption to this date (12 kn, load from data_logs) */
    current_voyage_end_date?: string;
  }): Promise<VesselAnalysisResult> {
    const { vessel_name, next_voyage, route_data, bunker_analysis, current_voyage_end_date } = params;

    console.log(`${LOG_PREFIX} Analyzing vessel: ${vessel_name}`);

    const ep = getEngineParamsWithFallbacks();

    try {
      const container = ServiceContainer.getInstance();
      const vesselService = container.getVesselService();
      // Resolve vessel identifier to IMO via vessel_details API
      const imo = await resolveIMO(vessel_name);

      let vesselProfile: VesselProfile | undefined;
      let currentVoyageEndPort: string = next_voyage.origin;
      let currentVoyageEndEta: Date = new Date(next_voyage.departure_date || Date.now());
      let projectedROB: FuelQuantityMT = { VLSFO: 0, LSMGO: 0 };
      /** Current ROB at query time when available (for card display vs projected) */
      let currentRobForResult: FuelQuantityMT | undefined;

      if (imo) {
        // When user provided current voyage end date: compute ROB at start of next voyage from current ROB − consumption to that date (12 kn, load from data_logs)
        if (current_voyage_end_date && current_voyage_end_date.trim()) {
          const stateFromDatalogs = await getCurrentStateFromDatalogs(imo);
          const currentRob = stateFromDatalogs?.current_rob
            ? {
                VLSFO: stateFromDatalogs.current_rob.VLSFO ?? 0,
                LSMGO: stateFromDatalogs.current_rob.LSMGO ?? 0,
              }
            : null;
          if (currentRob) {
            const endDate = new Date(current_voyage_end_date.trim());
            const now = new Date();
            const daysToEnd = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
            const loadTypeRaw = (stateFromDatalogs?.load_type ?? '').trim().toLowerCase();
            const currentVoyageLoad: LoadCondition =
              /ballast/.test(loadTypeRaw) || loadTypeRaw === 'ballast' ? 'ballast' : 'laden';
            const dailyConsumptionTotal =
              (await getConsumptionAtSpeed(imo, ep.current_voyage_default_speed_knots, currentVoyageLoad)) ??
              ep.default_vlsfo_mt_per_day + ep.default_lsmgo_mt_per_day;
            const totalConsumption = Math.max(0, daysToEnd) * dailyConsumptionTotal;
            const ratioVlsfo = ep.default_vlsfo_mt_per_day / (ep.default_vlsfo_mt_per_day + ep.default_lsmgo_mt_per_day);
            const consumptionVlsfo = totalConsumption * ratioVlsfo;
            const consumptionLsmgo = totalConsumption * (1 - ratioVlsfo);
            const projectedFromCurrentVoyage: FuelQuantityMT = {
              VLSFO: Math.max(0, currentRob.VLSFO - consumptionVlsfo),
              LSMGO: Math.max(0, currentRob.LSMGO - consumptionLsmgo),
            };
            const nextSpeed = next_voyage.speed ?? ep.default_speed_knots;
            const nextLoad: LoadCondition =
              next_voyage.cargo_type === 'laden' ? 'laden' : 'ballast';
            const nextDailyTotal =
              (await getConsumptionAtSpeed(imo, nextSpeed, nextLoad)) ??
              ep.default_vlsfo_mt_per_day + ep.default_lsmgo_mt_per_day;
            const nextRatioVlsfo = ep.default_vlsfo_mt_per_day / (ep.default_vlsfo_mt_per_day + ep.default_lsmgo_mt_per_day);
            vesselProfile = buildVesselProfileFromPlanningData(
              stateFromDatalogs?.vessel_name || vessel_name,
              projectedFromCurrentVoyage,
              nextDailyTotal * nextRatioVlsfo,
              nextDailyTotal * (1 - nextRatioVlsfo),
              nextSpeed
            );
            currentVoyageEndPort = next_voyage.origin;
            currentVoyageEndEta = endDate;
            projectedROB = projectedFromCurrentVoyage;
            currentRobForResult = currentRob;
            console.log(
              `${LOG_PREFIX} ROB at start of next voyage from current voyage end date for IMO ${imo}: ${projectedROB.VLSFO.toFixed(0)} VLSFO, ${projectedROB.LSMGO.toFixed(0)} LSMGO`
            );
          }
        }

        if (!vesselProfile) {
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
                vlsfo: planningData.consumption_profile.consumption_by_load.ballast.vlsfo || ep.default_vlsfo_mt_per_day,
                lsmgo: planningData.consumption_profile.consumption_by_load.ballast.lsmgo || ep.default_lsmgo_mt_per_day,
              }
            : { vlsfo: ep.default_vlsfo_mt_per_day, lsmgo: ep.default_lsmgo_mt_per_day };

          vesselProfile = buildVesselProfileFromPlanningData(
            planningData.name || vessel_name,
            projectedROB,
            consumption.vlsfo,
            consumption.lsmgo,
            next_voyage.speed ?? ep.default_speed_knots
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
            currentRobForResult = currentRob;
            fallbackProjected = VesselService.projectROBAtFutureDate(
              currentRob,
              new Date(),
              departureDate,
              ep.default_vlsfo_mt_per_day,
              ep.default_lsmgo_mt_per_day
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
              currentRobForResult = currentRob;
              fallbackProjected = VesselService.projectROBAtFutureDate(
                currentRob,
                new Date(),
                departureDate,
                ep.default_vlsfo_mt_per_day,
                ep.default_lsmgo_mt_per_day
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

      if (!vesselProfile) {
        throw new Error(`${LOG_PREFIX} Vessel profile not resolved for ${vessel_name}`);
      }

      // Calculate next voyage fuel requirements
      const distanceNm = route_data?.distance_nm ?? 0;
      const speedKnots = next_voyage.speed ?? ep.default_speed_knots;
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

      const bunkerQuantityWhenNeeded: FuelQuantityMT = {
        VLSFO: Math.max(0, nextVoyageRequirements.VLSFO - projectedROB.VLSFO),
        LSMGO: Math.max(0, nextVoyageRequirements.LSMGO - projectedROB.LSMGO),
      };
      let bunkerPlan: BunkerPlan | undefined;
      let baseFuelCost = 0;
      let bunkerFuelCost = 0;
      let bunkerPortFees = 0;
      let deviationCost = 0;
      const timeCost = 0;

      if (!canProceedWithoutBunker) {
        if (bunker_analysis?.best_option) {
          const best = bunker_analysis.best_option;
          bunkerPlan = {
            port_code: best.port_code ?? '',
            port_name: best.port_name ?? '',
            bunker_quantity: bunkerQuantityWhenNeeded,
            total_cost_usd: best.total_cost_usd ?? 0,
            deviation_nm: best.distance_from_route_nm ?? 0,
          };
          bunkerFuelCost = best.fuel_cost_usd ?? 0;
          deviationCost = best.deviation_cost_usd ?? 0;
        } else {
          bunkerFuelCost = bunkerQuantityWhenNeeded.VLSFO * 600 + bunkerQuantityWhenNeeded.LSMGO * 800;
          bunkerPlan = {
            port_code: '',
            port_name: 'TBD',
            bunker_quantity: bunkerQuantityWhenNeeded,
            total_cost_usd: bunkerFuelCost,
            deviation_nm: 0,
          };
        }
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

      const departure = currentVoyageEndEta;
      const nextVoyageDestinationEta = new Date(
        departure.getTime() + durationDays * 24 * 60 * 60 * 1000
      );

      const result: VesselAnalysisResult = {
        vessel_name,
        vessel_profile: vesselProfile,
        current_voyage_end_port: currentVoyageEndPort,
        current_voyage_end_eta: currentVoyageEndEta,
        ...(currentRobForResult != null && { current_rob: currentRobForResult }),
        projected_rob_at_start: projectedROB,
        next_voyage_requirements: nextVoyageRequirements,
        next_voyage_destination_eta: nextVoyageDestinationEta,
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
      const eta = a.next_voyage_destination_eta;
      matrix[a.vessel_name] = {
        current_rob_vlsfo: a.current_rob?.VLSFO ?? null,
        current_rob_lsmgo: a.current_rob?.LSMGO ?? null,
        projected_rob_vlsfo: a.projected_rob_at_start.VLSFO,
        projected_rob_lsmgo: a.projected_rob_at_start.LSMGO,
        next_voyage_vlsfo_req: a.next_voyage_requirements.VLSFO,
        next_voyage_lsmgo_req: a.next_voyage_requirements.LSMGO,
        next_voyage_total_fuel_mt: a.next_voyage_requirements.VLSFO + a.next_voyage_requirements.LSMGO,
        can_proceed_without_bunker: a.can_proceed_without_bunker,
        total_voyage_cost: a.total_voyage_cost,
        feasibility_score: a.feasibility_score,
        bunker_port: a.bunker_plan?.port_name ?? null,
        bunker_quantity_vlsfo: a.bunker_plan?.bunker_quantity?.VLSFO ?? null,
        bunker_quantity_lsmgo: a.bunker_plan?.bunker_quantity?.LSMGO ?? null,
        deviation_nm: a.bunker_plan?.deviation_nm ?? null,
        next_voyage_destination_eta: eta instanceof Date ? eta.toISOString() : eta ?? null,
        risks: a.risks,
      };
    }

    return matrix;
  }
}
