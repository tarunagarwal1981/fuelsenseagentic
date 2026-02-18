/**
 * Vessel Service
 *
 * Loads and provides vessel data from vessel_details API and VesselRepository
 * (noon_reports, vessel_details table). No JSON file fallback.
 */

import { VesselRepository } from '@/lib/repositories/vessel-repository';
import { resolveVesselIdentifier } from '@/lib/services/vessel-identifier-service';
import { getCurrentStateFromDatalogs } from '@/lib/services/rob-from-datalogs-service';
import { getConfigManager } from '@/lib/config/config-manager';
import type { VesselPlanningData, ProjectedROB } from './types';

const DEFAULT_CAPACITY_VLSFO = 2000;
const DEFAULT_CAPACITY_LSMGO = 200;
const DEFAULT_VLSFO_MT_PER_DAY = 30;
const DEFAULT_LSMGO_MT_PER_DAY = 3;

export interface VesselROB {
  VLSFO: number;
  LSMGO: number;
  last_updated?: string;
  last_bunker_port?: string;
  last_bunker_date?: string;
  notes?: string;
}

export interface VesselCapacity {
  VLSFO: number;
  LSMGO: number;
  total: number;
}

export interface VesselConsumption {
  main_engine_vlsfo_mt_per_day: number;
  auxiliary_lsmgo_mt_per_day: number;
  total_mt_per_day: number;
}

export interface VesselHullCondition {
  last_cleaning_date: string;
  days_since_cleaning: number;
  fouling_factor: number;
  next_cleaning_due: string;
  notes?: string;
}

export interface VesselData {
  vessel_id: string;
  imo: string;
  vessel_type: string;
  dwt: number;
  built_year: number;
  current_rob: VesselROB;
  tank_capacity: VesselCapacity;
  consumption_profile: Record<string, VesselConsumption>;
  operational_speed_knots: number;
  hull_condition: VesselHullCondition;
  owner: string;
  operator: string;
  flag: string;
}

export interface VesselProfile {
  vessel_name: string;
  vessel_data: VesselData | null;
  initial_rob: { VLSFO: number; LSMGO: number };
  capacity: { VLSFO: number; LSMGO: number };
  consumption_vlsfo_per_day: number;
  consumption_lsmgo_per_day: number;
  operational_speed: number;
  fouling_factor: number;
}

/**
 * Get vessel data by vessel name using vessel_details API and repository (noon_reports, vessel_details).
 * Returns null if vessel not found in APIs.
 */
export async function getVesselData(
  vesselName: string,
  vesselRepo: VesselRepository
): Promise<VesselData | null> {
  const policy = getConfigManager().getDataPolicy('bunker');
  const resolved = await resolveVesselIdentifier({ name: vesselName.trim() }, policy);
  const imo = resolved.imo;
  if (!imo) {
    console.warn(`❌ [VESSEL-SERVICE] Vessel "${vesselName}" not found (no IMO from vessel_details)`);
    return null;
  }

  const [masterData, currentState] = await Promise.all([
    vesselRepo.getVesselMasterData(imo),
    vesselRepo.getVesselCurrentState(imo),
  ]);

  if (!masterData) {
    console.warn(`❌ [VESSEL-SERVICE] No master data for IMO ${imo}`);
    return null;
  }

  const name = resolved.name ?? masterData.vessel_name ?? vesselName;
  const currentRob = currentState?.current_rob ?? { VLSFO: 0, LSMGO: 0 };

  return {
    vessel_id: imo,
    imo,
    vessel_type: masterData.vessel_type ?? 'Unknown',
    dwt: masterData.dwt ?? 0,
    built_year: typeof masterData.built_year === 'string' ? parseInt(masterData.built_year, 10) || 0 : 0,
    current_rob: {
      VLSFO: currentRob.VLSFO ?? 0,
      LSMGO: currentRob.LSMGO ?? 0,
    },
    tank_capacity: {
      VLSFO: DEFAULT_CAPACITY_VLSFO,
      LSMGO: DEFAULT_CAPACITY_LSMGO,
      total: DEFAULT_CAPACITY_VLSFO + DEFAULT_CAPACITY_LSMGO,
    },
    consumption_profile: {
      speed_14_knots: {
        main_engine_vlsfo_mt_per_day: DEFAULT_VLSFO_MT_PER_DAY,
        auxiliary_lsmgo_mt_per_day: DEFAULT_LSMGO_MT_PER_DAY,
        total_mt_per_day: DEFAULT_VLSFO_MT_PER_DAY + DEFAULT_LSMGO_MT_PER_DAY,
      },
    },
    operational_speed_knots: 14,
    hull_condition: {
      last_cleaning_date: '',
      days_since_cleaning: 0,
      fouling_factor: 1.0,
      next_cleaning_due: '',
    },
    owner: masterData.owner ?? '',
    operator: masterData.owner ?? '',
    flag: masterData.flag ?? '',
  };
}

/**
 * Get vessel profile for bunker planning from vessel_details and noon_reports.
 * Returns null if vessel not found.
 */
export async function getVesselProfile(
  vesselName: string,
  speed: number | undefined,
  vesselService: VesselService
): Promise<VesselProfile | null> {
  const policy = getConfigManager().getDataPolicy('bunker');
  const resolved = await resolveVesselIdentifier({ name: vesselName.trim() }, policy);
  const imo = resolved.imo;
  if (!imo) {
    return null;
  }

  const planning = await vesselService.getVesselForVoyagePlanning(imo);
  if (!planning) {
    return null;
  }

  const { current_state, master_data, consumption_profile } = planning;
  const operationalSpeed = speed ?? 14;
  const ballast = consumption_profile?.consumption_by_load?.ballast;
  const consumptionVlsfo = ballast?.vlsfo ?? DEFAULT_VLSFO_MT_PER_DAY;
  const consumptionLsmgo = ballast?.lsmgo ?? DEFAULT_LSMGO_MT_PER_DAY;

  return {
    vessel_name: resolved.name ?? current_state.vessel_name ?? vesselName,
    vessel_data: null,
    initial_rob: {
      VLSFO: current_state.current_rob.VLSFO ?? 0,
      LSMGO: current_state.current_rob.LSMGO ?? 0,
    },
    capacity: {
      VLSFO: DEFAULT_CAPACITY_VLSFO,
      LSMGO: DEFAULT_CAPACITY_LSMGO,
    },
    consumption_vlsfo_per_day: consumptionVlsfo,
    consumption_lsmgo_per_day: consumptionLsmgo,
    operational_speed: operationalSpeed,
    fouling_factor: 1.0,
  };
}

/**
 * In-code placeholder when vessel is not found in APIs (no file read).
 * Use only when a safe default is required (e.g. failed analysis placeholder).
 */
export function getDefaultVesselProfile(): VesselProfile {
  return {
    vessel_name: 'Default (no vessel specified)',
    vessel_data: null,
    initial_rob: { VLSFO: 850, LSMGO: 100 },
    capacity: { VLSFO: DEFAULT_CAPACITY_VLSFO, LSMGO: DEFAULT_CAPACITY_LSMGO },
    consumption_vlsfo_per_day: DEFAULT_VLSFO_MT_PER_DAY,
    consumption_lsmgo_per_day: DEFAULT_LSMGO_MT_PER_DAY,
    operational_speed: 14,
    fouling_factor: 1.1,
  };
}

/**
 * List vessel names from API when available; otherwise returns empty array.
 */
export async function listAllVessels(_vesselRepo?: VesselRepository): Promise<string[]> {
  return [];
}

/**
 * Check if vessel exists (resolved via vessel_details API).
 */
export async function vesselExists(
  vesselName: string,
  _vesselRepo?: VesselRepository
): Promise<boolean> {
  const policy = getConfigManager().getDataPolicy('bunker');
  const resolved = await resolveVesselIdentifier({ name: vesselName.trim() }, policy);
  return resolved.imo != null;
}

/**
 * Get vessel consumption for specific speed from repository consumption profile.
 */
export async function getVesselConsumptionAtSpeed(
  vesselName: string,
  speed: number,
  vesselRepo: VesselRepository
): Promise<VesselConsumption | null> {
  const policy = getConfigManager().getDataPolicy('bunker');
  const resolved = await resolveVesselIdentifier({ name: vesselName.trim() }, policy);
  if (!resolved.imo) return null;

  const profile = await vesselRepo.getVesselConsumptionProfile(resolved.imo);
  if (!profile?.consumption_by_speed) return null;

  const speedKey = Math.round(speed);
  const atSpeed = profile.consumption_by_speed[speedKey];
  if (atSpeed) {
    return {
      main_engine_vlsfo_mt_per_day: atSpeed.vlsfo_mt_per_day,
      auxiliary_lsmgo_mt_per_day: atSpeed.lsmgo_mt_per_day,
      total_mt_per_day: atSpeed.vlsfo_mt_per_day + atSpeed.lsmgo_mt_per_day,
    };
  }
  const ballast = profile.consumption_by_load?.ballast;
  if (ballast) {
    return {
      main_engine_vlsfo_mt_per_day: ballast.vlsfo,
      auxiliary_lsmgo_mt_per_day: ballast.lsmgo,
      total_mt_per_day: ballast.vlsfo + ballast.lsmgo,
    };
  }
  return null;
}

/**
 * Update vessel ROB (in production, this would update database)
 * For now, just logs the update
 */
export function updateVesselROB(
  vesselName: string,
  newROB: { VLSFO: number; LSMGO: number },
  port: string
): void {
  console.log(`📝 [VESSEL SERVICE] ROB Update for ${vesselName}:`);
  console.log(`   Port: ${port}`);
  console.log(`   New ROB: ${newROB.VLSFO} MT VLSFO, ${newROB.LSMGO} MT LSMGO`);
  console.log('   ⚠️  Note: In-memory update only. Production would update database.');
}

/**
 * VesselService - Higher-level vessel operations using VesselRepository
 *
 * Provides voyage planning data and ROB projections.
 * Uses repository methods only, no direct DB access.
 */
export class VesselService {
  constructor(private vesselRepo: VesselRepository) {}

  /**
   * Get complete vessel state for voyage planning
   *
   * Current state (including ROB) comes from data_logs API only (getCurrentStateFromDatalogs).
   * Master data and consumption profile from existing API-backed repository.
   */
  async getVesselForVoyagePlanning(
    vesselIMO: string
  ): Promise<VesselPlanningData | null> {
    const [currentState, masterData, consumptionProfile] = await Promise.all([
      getCurrentStateFromDatalogs(vesselIMO),
      this.vesselRepo.getVesselMasterData(vesselIMO),
      this.vesselRepo.getVesselConsumptionProfile(vesselIMO),
    ]);

    if (!currentState || !masterData) {
      return null;
    }

    return {
      imo: vesselIMO,
      name: currentState.vessel_name,
      current_state: currentState,
      master_data: masterData,
      consumption_profile: consumptionProfile,
    };
  }

  /**
   * Project ROB at a future date (current ROB minus consumption until that date).
   * Used to compute "ROB at start of voyage" when projecting from now to departure.
   * ROB at start of voyage is the single input for all downstream voyage calculations.
   *
   * @param currentRob - Current ROB (VLSFO, LSMGO) in MT
   * @param fromDate - Reference date (e.g. now)
   * @param toDate - Future date (e.g. voyage departure)
   * @param dailyVlsfo - VLSFO consumption MT/day
   * @param dailyLsmgo - LSMGO consumption MT/day
   * @returns Projected ROB at toDate, never negative
   */
  static projectROBAtFutureDate(
    currentRob: { VLSFO: number; LSMGO: number },
    fromDate: Date,
    toDate: Date,
    dailyVlsfo: number,
    dailyLsmgo: number
  ): { VLSFO: number; LSMGO: number } {
    const fromMs = fromDate.getTime();
    const toMs = toDate.getTime();
    const days = (toMs - fromMs) / (1000 * 60 * 60 * 24);
    if (days <= 0) {
      return {
        VLSFO: Math.max(0, currentRob.VLSFO),
        LSMGO: Math.max(0, currentRob.LSMGO),
      };
    }
    const vlsfo = Math.max(0, currentRob.VLSFO - dailyVlsfo * days);
    const lsmgo = Math.max(0, currentRob.LSMGO - dailyLsmgo * days);
    return { VLSFO: vlsfo, LSMGO: lsmgo };
  }

  /**
   * Project ROB at current voyage end
   *
   * Uses actual consumption data from noon reports
   */
  async projectROBAtCurrentVoyageEnd(
    vesselIMO: string
  ): Promise<ProjectedROB | null> {
    const currentState = await this.vesselRepo.getVesselCurrentState(vesselIMO);
    const consumptionProfile =
      await this.vesselRepo.getVesselConsumptionProfile(vesselIMO);

    if (!currentState || !consumptionProfile) {
      return null;
    }

    // Calculate days to voyage end
    const now = new Date();
    const voyageEnd = currentState.current_voyage.voyage_end_date;
    const daysRemaining =
      (voyageEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    if (daysRemaining < 0) {
      // Voyage already ended
      return {
        current_rob: currentState.current_rob,
        projected_rob: currentState.current_rob,
        days_to_voyage_end: 0,
        voyage_end_port: currentState.current_voyage.to_port,
        voyage_end_date: voyageEnd,
        projection_confidence: 100,
        assumptions: {
          note: 'Voyage already completed',
        },
      };
    }

    // Get appropriate consumption rate
    // Use recent consumption as best estimate
    const dailyVLSFO = currentState.recent_consumption?.VLSFO || 30;
    const dailyLSMGO = currentState.recent_consumption?.LSMGO || 3;

    // Project ROB
    const projectedROB = {
      VLSFO: Math.max(
        0,
        currentState.current_rob.VLSFO - dailyVLSFO * daysRemaining
      ),
      LSMGO: Math.max(
        0,
        currentState.current_rob.LSMGO - dailyLSMGO * daysRemaining
      ),
      MDO: currentState.current_rob.MDO || 0,
    };

    // Calculate confidence based on data quality
    const confidence = consumptionProfile
      ? Math.min(100, (consumptionProfile.data_quality.report_count / 30) * 100)
      : 50;

    return {
      current_rob: currentState.current_rob,
      projected_rob: projectedROB,
      days_to_voyage_end: daysRemaining,
      voyage_end_port: currentState.current_voyage.to_port,
      voyage_end_date: voyageEnd,
      projection_confidence: confidence,
      assumptions: {
        daily_vlsfo_consumption: dailyVLSFO,
        daily_lsmgo_consumption: dailyLSMGO,
        based_on_reports: consumptionProfile?.data_quality.report_count || 0,
      },
    };
  }
}
