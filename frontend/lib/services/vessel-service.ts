/**
 * Vessel Service
 *
 * Loads and provides vessel data from the vessel database.
 * Handles vessel lookup, validation, and default fallbacks.
 */

import vesselsDatabase from '@/lib/data/vessels.json';
import { VesselRepository } from '@/lib/repositories/vessel-repository';
import type { VesselPlanningData, ProjectedROB } from './types';

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

const db = vesselsDatabase as Record<string, VesselData>;

/**
 * Get vessel data by vessel name (CASE-INSENSITIVE)
 */
export function getVesselData(vesselName: string): VesselData | null {
  // Try exact match first (fast path)
  if (db[vesselName as keyof typeof db]) {
    return db[vesselName as keyof typeof db];
  }
  
  // Try case-insensitive match
  const lowerName = vesselName.toLowerCase().trim();
  const matchingKey = Object.keys(db).find(
    key => key.toLowerCase().trim() === lowerName
  );
  
  if (matchingKey) {
    console.log(`✅ [VESSEL-SERVICE] Found vessel with case-insensitive match: "${vesselName}" → "${matchingKey}"`);
    return db[matchingKey as keyof typeof db];
  }
  
  console.warn(`❌ [VESSEL-SERVICE] Vessel "${vesselName}" not found in database`);
  console.log('   Available vessels:', Object.keys(db).join(', '));
  return null;
}

/**
 * Get vessel profile for bunker planning
 * Returns structured data ready for ROB tracking engine
 */
export function getVesselProfile(
  vesselName: string,
  speed?: number
): VesselProfile | null {
  const vesselData = getVesselData(vesselName);

  if (!vesselData) {
    return null;
  }

  // Find the actual database key (for case-insensitive matches)
  let matchedKey = vesselName;
  if (!(vesselName in db)) {
    const lowerName = vesselName.toLowerCase().trim();
    const foundKey = Object.keys(db).find(
      key => key.toLowerCase().trim() === lowerName
    );
    if (foundKey) {
      matchedKey = foundKey;
    }
  }

  const operationalSpeed = speed ?? vesselData.operational_speed_knots;
  const speedKey = `speed_${operationalSpeed}_knots`;
  const consumption =
    vesselData.consumption_profile[speedKey] ??
    vesselData.consumption_profile['speed_14_knots'];

  return {
    vessel_name: matchedKey,
    vessel_data: vesselData,
    initial_rob: {
      VLSFO: vesselData.current_rob.VLSFO,
      LSMGO: vesselData.current_rob.LSMGO,
    },
    capacity: {
      VLSFO: vesselData.tank_capacity.VLSFO,
      LSMGO: vesselData.tank_capacity.LSMGO,
    },
    consumption_vlsfo_per_day: consumption.main_engine_vlsfo_mt_per_day,
    consumption_lsmgo_per_day: consumption.auxiliary_lsmgo_mt_per_day,
    operational_speed: operationalSpeed,
    fouling_factor: vesselData.hull_condition.fouling_factor,
  };
}

/**
 * Get default vessel profile (fallback when vessel not found)
 */
export function getDefaultVesselProfile(): VesselProfile {
  return {
    vessel_name: 'Unknown Vessel',
    vessel_data: null,
    initial_rob: { VLSFO: 850, LSMGO: 100 },
    capacity: { VLSFO: 2000, LSMGO: 200 },
    consumption_vlsfo_per_day: 30,
    consumption_lsmgo_per_day: 3,
    operational_speed: 14,
    fouling_factor: 1.1,
  };
}

/**
 * List all available vessels
 */
export function listAllVessels(): string[] {
  return Object.keys(db);
}

/**
 * Check if vessel exists in database (CASE-INSENSITIVE)
 */
export function vesselExists(vesselName: string): boolean {
  // Try exact match first
  if (vesselName in db) {
    return true;
  }
  
  // Try case-insensitive match
  const lowerName = vesselName.toLowerCase().trim();
  return Object.keys(db).some(
    key => key.toLowerCase().trim() === lowerName
  );
}

/**
 * Get vessel consumption for specific speed
 */
export function getVesselConsumptionAtSpeed(
  vesselName: string,
  speed: number
): VesselConsumption | null {
  const vesselData = getVesselData(vesselName);
  if (!vesselData) return null;

  const speedKey = `speed_${speed}_knots`;
  return vesselData.consumption_profile[speedKey] ?? null;
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
   * Combines current state + master data + consumption profile
   */
  async getVesselForVoyagePlanning(
    vesselIMO: string
  ): Promise<VesselPlanningData | null> {
    const [currentState, masterData, consumptionProfile] = await Promise.all([
      this.vesselRepo.getVesselCurrentState(vesselIMO),
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
