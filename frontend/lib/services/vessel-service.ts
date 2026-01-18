/**
 * Vessel Service
 *
 * Loads and provides vessel data from the vessel database.
 * Handles vessel lookup, validation, and default fallbacks.
 */

import vesselsDatabase from '@/lib/data/vessels.json';

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
