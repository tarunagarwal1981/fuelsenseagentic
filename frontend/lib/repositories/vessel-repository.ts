/**
 * Vessel Repository
 * 
 * Extends BaseRepository to provide vessel profile data access methods.
 * Handles mapping between JSON format and repository format.
 * 
 * Provides optimized methods for vessel queries:
 * - findByName: Find vessel by name (case-insensitive)
 * - findByIMO: Find vessel by IMO number
 * - getConsumptionAtSpeed: Interpolate consumption for given speed
 * - validateCapacity: Check if ROB values fit within vessel capacity
 */

import { BaseRepository } from './base-repository';
import { RedisCache } from './cache-client';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  VesselProfile,
  VesselCurrentState,
  VesselMasterData,
  VesselConsumptionProfile,
} from './types';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * JSON format vessel (from vessels.json)
 */
interface JsonVessel {
  vessel_id: string;
  imo?: string;
  vessel_type: string;
  dwt: number;
  built_year?: number;
  current_rob?: {
    VLSFO: number;
    LSMGO: number;
    last_updated?: string;
    last_bunker_port?: string;
    last_bunker_date?: string;
  };
  tank_capacity: {
    VLSFO: number;
    LSMGO: number;
    total: number;
  };
  consumption_profile: Record<
    string,
    {
      main_engine_vlsfo_mt_per_day: number;
      auxiliary_lsmgo_mt_per_day: number;
      total_mt_per_day: number;
    }
  >;
  operational_speed_knots: number;
  hull_condition?: {
    last_cleaning_date?: string;
    days_since_cleaning?: number;
    fouling_factor?: number;
    next_cleaning_due?: string;
  };
  owner?: string;
  operator?: string;
  flag?: string;
}

/**
 * Convert JSON vessel format to repository VesselProfile format
 */
function mapJsonToVessel(name: string, jsonVessel: JsonVessel): VesselProfile {
  // Extract speed-consumption curves
  const atSea: Array<{ speed: number; vlsfo: number; mgo: number }> = [];
  for (const [key, consumption] of Object.entries(jsonVessel.consumption_profile)) {
    const speedMatch = key.match(/speed_(\d+)_knots/);
    if (speedMatch) {
      const speed = parseInt(speedMatch[1], 10);
      atSea.push({
        speed,
        vlsfo: consumption.main_engine_vlsfo_mt_per_day,
        mgo: consumption.auxiliary_lsmgo_mt_per_day,
      });
    }
  }

  // Sort by speed
  atSea.sort((a, b) => a.speed - b.speed);

  // Use operational speed consumption as in-port consumption (or first available)
  const operationalSpeed = jsonVessel.operational_speed_knots || 14;
  const operationalKey = `speed_${operationalSpeed}_knots`;
  const operationalConsumption =
    jsonVessel.consumption_profile[operationalKey] ||
    jsonVessel.consumption_profile['speed_14_knots'] ||
    Object.values(jsonVessel.consumption_profile)[0];

  // Estimate design speed (highest speed in profile) and eco speed (lowest)
  const designSpeed = atSea.length > 0 ? atSea[atSea.length - 1].speed : operationalSpeed;
  const ecoSpeed = atSea.length > 0 ? atSea[0].speed : operationalSpeed - 2;

  return {
    id: jsonVessel.vessel_id,
    name,
    imo: jsonVessel.imo,
    vesselType: jsonVessel.vessel_type,
    dwt: jsonVessel.dwt,
    specs: {
      fuelCapacity: {
        total: jsonVessel.tank_capacity.total,
        vlsfo: jsonVessel.tank_capacity.VLSFO,
        mgo: jsonVessel.tank_capacity.LSMGO, // JSON uses LSMGO, repository uses mgo
      },
      speed: {
        design: designSpeed,
        eco: ecoSpeed,
      },
    },
    consumption: {
      atSea,
      inPort: {
        vlsfo: operationalConsumption?.main_engine_vlsfo_mt_per_day || 0,
        mgo: operationalConsumption?.auxiliary_lsmgo_mt_per_day || 0,
      },
    },
  };
}

export class VesselRepository extends BaseRepository<VesselProfile> {
  constructor(cache: RedisCache, db: SupabaseClient) {
    // Resolve fallback path relative to project root
    const fallbackPath = path.join(process.cwd(), 'lib', 'data');

    super(cache, db, {
      tableName: 'vessels',
      fallbackPath,
    });
  }

  /**
   * Override cache TTL - vessel specs rarely change, cache for 24 hours
   */
  protected getCacheTTL(): number {
    return 86400; // 24 hours
  }

  /**
   * Find vessel by name (case-insensitive)
   * 
   * @param name Vessel name
   * @returns Vessel profile or null if not found
   */
  async findByName(name: string): Promise<VesselProfile | null> {
    const cacheKey = `fuelsense:vessels:name:${name.toLowerCase()}`;

    // Step 1: Try cache
    try {
      const cached = await this.cache.get<VesselProfile>(cacheKey);
      if (cached) {
        console.log(`[CACHE HIT] vessels:name:${name}`);
        return cached;
      }
    } catch (error) {
      console.error(`[VesselRepository] Cache read error for ${name}:`, error);
    }

    // Step 2: Try database
    try {
      const { data, error } = await this.db
        .from(this.tableName)
        .select('*')
        .ilike('name', name)
        .single();

      if (error) {
        throw error;
      }

      if (data) {
        const vessel = data as VesselProfile;
        await this.cache.set(cacheKey, vessel, this.getCacheTTL());
        console.log(`[DB HIT] vessels:name:${name}`);
        return vessel;
      }
    } catch (error) {
      console.error(`[VesselRepository] Database read error for ${name}:`, error);
    }

    // Step 3: Try JSON fallback
    try {
      const allVessels = await this.loadAllVesselsFromFallback();
      const vessel = allVessels.find(
        (v) => v.name.toLowerCase() === name.toLowerCase()
      );

      if (vessel) {
        await this.cache.set(cacheKey, vessel, this.getCacheTTL());
        console.log(`[FALLBACK HIT] vessels:name:${name}`);
        return vessel;
      }
    } catch (error) {
      console.error(`[VesselRepository] Fallback read error for ${name}:`, error);
    }

    console.log(`[NOT FOUND] vessels:name:${name}`);
    return null;
  }

  /**
   * Find vessel by IMO number
   * 
   * @param imo IMO number (e.g., "IMO9234567")
   * @returns Vessel profile or null if not found
   */
  async findByIMO(imo: string): Promise<VesselProfile | null> {
    const cacheKey = `fuelsense:vessels:imo:${imo}`;

    // Step 1: Try cache
    try {
      const cached = await this.cache.get<VesselProfile>(cacheKey);
      if (cached) {
        console.log(`[CACHE HIT] vessels:imo:${imo}`);
        return cached;
      }
    } catch (error) {
      console.error(`[VesselRepository] Cache read error for IMO ${imo}:`, error);
    }

    // Step 2: Try database
    try {
      const { data, error } = await this.db
        .from(this.tableName)
        .select('*')
        .eq('imo', imo)
        .single();

      if (error) {
        throw error;
      }

      if (data) {
        const vessel = data as VesselProfile;
        await this.cache.set(cacheKey, vessel, this.getCacheTTL());
        console.log(`[DB HIT] vessels:imo:${imo}`);
        return vessel;
      }
    } catch (error) {
      console.error(`[VesselRepository] Database read error for IMO ${imo}:`, error);
    }

    // Step 3: Try JSON fallback
    try {
      const allVessels = await this.loadAllVesselsFromFallback();
      const vessel = allVessels.find((v) => v.imo === imo);

      if (vessel) {
        await this.cache.set(cacheKey, vessel, this.getCacheTTL());
        console.log(`[FALLBACK HIT] vessels:imo:${imo}`);
        return vessel;
      }
    } catch (error) {
      console.error(`[VesselRepository] Fallback read error for IMO ${imo}:`, error);
    }

    console.log(`[NOT FOUND] vessels:imo:${imo}`);
    return null;
  }

  /**
   * Get consumption at a specific speed
   * Interpolates between known speed points if exact speed not found
   * 
   * @param vesselId Vessel ID
   * @param speed Speed in knots
   * @returns Consumption rates {vlsfo, mgo} per day
   */
  async getConsumptionAtSpeed(
    vesselId: string,
    speed: number
  ): Promise<{ vlsfo: number; mgo: number }> {
    try {
      const vessel = await this.findById(vesselId);
      if (!vessel) {
        throw new Error(`Vessel ${vesselId} not found`);
      }

      const { atSea } = vessel.consumption;

      if (atSea.length === 0) {
        // Fallback to in-port consumption
        return vessel.consumption.inPort;
      }

      // Find exact match
      const exactMatch = atSea.find((c) => c.speed === speed);
      if (exactMatch) {
        return { vlsfo: exactMatch.vlsfo, mgo: exactMatch.mgo };
      }

      // Interpolate between two points
      // Find the two closest speed points
      let lower: typeof atSea[0] | null = null;
      let upper: typeof atSea[0] | null = null;

      for (const point of atSea) {
        if (point.speed < speed) {
          if (!lower || point.speed > lower.speed) {
            lower = point;
          }
        } else if (point.speed > speed) {
          if (!upper || point.speed < upper.speed) {
            upper = point;
          }
        }
      }

      // If speed is below minimum, use minimum consumption
      if (!lower && upper) {
        return { vlsfo: upper.vlsfo, mgo: upper.mgo };
      }

      // If speed is above maximum, use maximum consumption
      if (lower && !upper) {
        return { vlsfo: lower.vlsfo, mgo: lower.mgo };
      }

      // Linear interpolation
      if (lower && upper) {
        const speedDiff = upper.speed - lower.speed;
        const speedRatio = (speed - lower.speed) / speedDiff;

        const vlsfo =
          lower.vlsfo + (upper.vlsfo - lower.vlsfo) * speedRatio;
        const mgo = lower.mgo + (upper.mgo - lower.mgo) * speedRatio;

        return { vlsfo, mgo };
      }

      // Fallback to first available point
      return { vlsfo: atSea[0].vlsfo, mgo: atSea[0].mgo };
    } catch (error) {
      console.error(
        `[VesselRepository] Error getting consumption for ${vesselId} at ${speed} knots:`,
        error
      );
      throw error;
    }
  }

  /**
   * Validate that ROB values fit within vessel capacity
   * 
   * @param vesselId Vessel ID
   * @param robVLSFO Remaining on board VLSFO in MT
   * @param robMGO Remaining on board MGO in MT
   * @returns True if ROB values are within capacity
   */
  async validateCapacity(
    vesselId: string,
    robVLSFO: number,
    robMGO: number
  ): Promise<boolean> {
    try {
      const vessel = await this.findById(vesselId);
      if (!vessel) {
        throw new Error(`Vessel ${vesselId} not found`);
      }

      const { fuelCapacity } = vessel.specs;

      // Check individual capacities
      if (robVLSFO < 0 || robVLSFO > fuelCapacity.vlsfo) {
        return false;
      }

      if (robMGO < 0 || robMGO > fuelCapacity.mgo) {
        return false;
      }

      // Check total capacity
      const totalROB = robVLSFO + robMGO;
      if (totalROB > fuelCapacity.total) {
        return false;
      }

      return true;
    } catch (error) {
      console.error(
        `[VesselRepository] Error validating capacity for ${vesselId}:`,
        error
      );
      return false;
    }
  }

  /**
   * Load all vessels from JSON fallback file
   */
  private async loadAllVesselsFromFallback(): Promise<VesselProfile[]> {
    if (!this.fallbackPath) {
      return [];
    }

    try {
      const filePath = path.join(this.fallbackPath, `${this.tableName}.json`);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const jsonVessels: Record<string, JsonVessel> = JSON.parse(fileContent);

      if (!jsonVessels || typeof jsonVessels !== 'object') {
        return [];
      }

      return Object.entries(jsonVessels).map(([name, vessel]) =>
        mapJsonToVessel(name, vessel)
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`[VesselRepository] Error loading fallback:`, error);
      }
      return [];
    }
  }

  /**
   * Override findById to use vessel_id from JSON
   */
  async findById(id: string): Promise<VesselProfile | null> {
    const cacheKey = this.getCacheKey(id);

    // Step 1: Try cache
    try {
      const cached = await this.cache.get<VesselProfile>(cacheKey);
      if (cached) {
        console.log(`[CACHE HIT] vessels:${id}`);
        return cached;
      }
    } catch (error) {
      console.error(`[VesselRepository] Cache read error for ${id}:`, error);
    }

    // Step 2: Try database
    try {
      const { data, error } = await this.db
        .from(this.tableName)
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        throw error;
      }

      if (data) {
        const vessel = data as VesselProfile;
        await this.cache.set(cacheKey, vessel, this.getCacheTTL());
        console.log(`[DB HIT] vessels:${id}`);
        return vessel;
      }
    } catch (error) {
      console.error(`[VesselRepository] Database read error for ${id}:`, error);
    }

    // Step 3: Try JSON fallback
    try {
      const allVessels = await this.loadAllVesselsFromFallback();
      const vessel = allVessels.find((v) => v.id === id);

      if (vessel) {
        await this.cache.set(cacheKey, vessel, this.getCacheTTL());
        console.log(`[FALLBACK HIT] vessels:${id}`);
        return vessel;
      }
    } catch (error) {
      console.error(`[VesselRepository] Fallback read error for ${id}:`, error);
    }

    console.log(`[NOT FOUND] vessels:${id}`);
    return null;
  }

  /**
   * Get vessel current state from latest noon report
   *
   * COLUMN MAPPING (Hardcoded):
   * - VESSEL_IMO → vessel identifier
   * - ROB_VLSFO, ROB_LSMGO → current fuel
   * - TO_PORT → current voyage end port
   * - VOYAGE_END_DATE → when current voyage ends
   * - VOYAGE_NUMBER → current voyage ID
   * - DISTANCETOGO → remaining distance
   * - LATITUDE, LONGITUDE → current position
   * - UTC_DATE_TIME → report timestamp
   * - VESSEL_ACTIVITY → operational status
   * - LOAD_TYPE → ballast or laden
   *
   * @param vesselIMO - IMO number of vessel
   * @returns Current state or null if not found
   */
  async getVesselCurrentState(
    vesselIMO: string
  ): Promise<VesselCurrentState | null> {
    const cacheKey = `vessel:current_state:${vesselIMO}`;

    // Try cache first
    const cached = await this.cache.get<VesselCurrentState>(cacheKey);
    if (cached) {
      console.log(`✅ [VESSEL-REPO] Cache hit for current state: ${vesselIMO}`);
      return cached;
    }

    try {
      // Query your self-hosted database
      const { data, error } = await this.db
        .from('noon_reports') // Your actual table name
        .select(
          `
        VESSEL_IMO,
        VESSEL_NAME,
        ROB_VLSFO,
        ROB_LSMGO,
        ROB_MDO,
        ROB_HSFO,
        TO_PORT,
        VOYAGE_NUMBER,
        VOYAGE_END_DATE,
        VOYAGE_START_DATE,
        DISTANCETOGO,
        LATITUDE,
        LONGITUDE,
        UTC_DATE_TIME,
        VESSEL_ACTIVITY,
        LOAD_TYPE,
        FROM_PORT,
        TOTAL_CONSUMPTION_VLSFO,
        TOTAL_CONSUMPTION_LSMGO
      `
        )
        .eq('VESSEL_IMO', vesselIMO)
        .order('UTC_DATE_TIME', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        console.warn(
          `⚠️ [VESSEL-REPO] No noon report found for ${vesselIMO}`
        );
        return null;
      }

      // HARDCODED MAPPING (Not LLM decision!)
      const currentState: VesselCurrentState = {
        vessel_imo: data.VESSEL_IMO ?? '',
        vessel_name: data.VESSEL_NAME ?? '',
        current_rob: {
          VLSFO: data.ROB_VLSFO || 0,
          LSMGO: data.ROB_LSMGO || 0,
          MDO: data.ROB_MDO,
          HSFO: data.ROB_HSFO,
        },
        current_voyage: {
          voyage_number: data.VOYAGE_NUMBER ?? '',
          from_port: data.FROM_PORT ?? '',
          to_port: data.TO_PORT ?? '',
          voyage_start_date: new Date(data.VOYAGE_START_DATE),
          voyage_end_date: new Date(data.VOYAGE_END_DATE),
          distance_to_go: data.DISTANCETOGO,
        },
        current_position: {
          latitude: data.LATITUDE ?? 0,
          longitude: data.LONGITUDE ?? 0,
          timestamp: new Date(data.UTC_DATE_TIME),
        },
        vessel_activity: data.VESSEL_ACTIVITY ?? '',
        load_type: data.LOAD_TYPE ?? '',
        recent_consumption:
          data.TOTAL_CONSUMPTION_VLSFO != null || data.TOTAL_CONSUMPTION_LSMGO != null
            ? {
                VLSFO: data.TOTAL_CONSUMPTION_VLSFO ?? 0,
                LSMGO: data.TOTAL_CONSUMPTION_LSMGO ?? 0,
              }
            : undefined,
        last_report_date: new Date(data.UTC_DATE_TIME),
      };

      // Cache for 5 minutes (vessel state changes slowly)
      await this.cache.set(cacheKey, currentState, 300);

      return currentState;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(
        `❌ [VESSEL-REPO] Error fetching current state: ${msg}`
      );
      return null;
    }
  }

  /**
   * Get vessel master data from vessel_details table
   *
   * COLUMN MAPPING (Hardcoded):
   * - IMO → vessel identifier
   * - Vessel_Name → vessel name
   * - Vessel_Type → type classification
   * - Deadweight → DWT capacity
   * - GrossTonnage → GT
   * - Built_date → year built
   * - Flag → flag state
   * - Fleet → fleet grouping
   * - Registered_Owner → owner
   *
   * @param vesselIMO - IMO number
   * @returns Vessel master data or null
   */
  async getVesselMasterData(
    vesselIMO: string
  ): Promise<VesselMasterData | null> {
    const cacheKey = `vessel:master:${vesselIMO}`;

    // Try cache (master data changes rarely, cache for 24 hours)
    const cached = await this.cache.get<VesselMasterData>(cacheKey);
    if (cached) {
      console.log(`✅ [VESSEL-REPO] Cache hit for master data: ${vesselIMO}`);
      return cached;
    }

    try {
      const { data, error } = await this.db
        .from('vessel_details') // Your actual table name
        .select(
          `
        IMO,
        Vessel_Name,
        Vessel_Type,
        Vessel_SubType,
        Deadweight,
        GrossTonnage,
        Built_date,
        Flag,
        Fleet,
        Registered_Owner
      `
        )
        .eq('IMO', vesselIMO)
        .single();

      if (error || !data) {
        console.warn(
          `⚠️ [VESSEL-REPO] No master data found for ${vesselIMO}`
        );
        return null;
      }

      // HARDCODED MAPPING
      const masterData: VesselMasterData = {
        imo: data.IMO ?? '',
        vessel_name: data.Vessel_Name ?? '',
        vessel_type: data.Vessel_Type ?? '',
        vessel_subtype: data.Vessel_SubType,
        dwt: parseFloat(data.Deadweight) || 0,
        gross_tonnage: parseFloat(data.GrossTonnage) || 0,
        built_year: String(data.Built_date ?? ''),
        flag: data.Flag ?? '',
        fleet: data.Fleet,
        owner: data.Registered_Owner,
      };

      // Cache for 24 hours
      await this.cache.set(cacheKey, masterData, 86400);

      return masterData;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(
        `❌ [VESSEL-REPO] Error fetching master data: ${msg}`
      );
      return null;
    }
  }

  /**
   * Calculate consumption profile from historical noon reports
   *
   * COLUMN MAPPING (Hardcoded):
   * - TOTAL_CONSUMPTION_VLSFO → VLSFO consumption
   * - TOTAL_CONSUMPTION_LSMGO → LSMGO consumption
   * - SPEED → vessel speed
   * - LOAD_TYPE → ballast or laden
   * - VESSEL_ACTIVITY → filter for "AT SEA" only
   * - STEAMING_TIME_HRS → hours of steaming
   * - UTC_DATE_TIME → filter last 30 days
   *
   * Analyzes last 30 days of at-sea reports to calculate average consumption
   * at different speeds and load conditions.
   *
   * @param vesselIMO - IMO number
   * @param days - Number of days to analyze (default 30)
   * @returns Consumption profile
   */
  async getVesselConsumptionProfile(
    vesselIMO: string,
    days: number = 30
  ): Promise<VesselConsumptionProfile | null> {
    const cacheKey = `vessel:consumption:${vesselIMO}:${days}d`;

    // Cache for 6 hours
    const cached = await this.cache.get<VesselConsumptionProfile>(cacheKey);
    if (cached) {
      console.log(
        `✅ [VESSEL-REPO] Cache hit for consumption profile: ${vesselIMO}`
      );
      return cached;
    }

    try {
      // Get historical reports from last N days, at sea only
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const { data: reports, error } = await this.db
        .from('noon_reports')
        .select(
          `
        TOTAL_CONSUMPTION_VLSFO,
        TOTAL_CONSUMPTION_LSMGO,
        SPEED,
        LOAD_TYPE,
        STEAMING_TIME_HRS,
        UTC_DATE_TIME
      `
        )
        .eq('VESSEL_IMO', vesselIMO)
        .eq('VESSEL_ACTIVITY', 'AT SEA') // Only at-sea consumption
        .gte('UTC_DATE_TIME', cutoffDate.toISOString())
        .order('UTC_DATE_TIME', { ascending: false });

      if (error || !reports || reports.length === 0) {
        console.warn(
          `⚠️ [VESSEL-REPO] No consumption history for ${vesselIMO}`
        );
        return null;
      }

      // Calculate averages by speed (rounded) and load type
      const consumptionBySpeed: Record<
        number,
        { vlsfo: number; lsmgo: number; count: number }
      > = {};
      const consumptionByLoad: Record<
        string,
        { vlsfo: number; lsmgo: number; count: number }
      > = {
        BALLAST: { vlsfo: 0, lsmgo: 0, count: 0 },
        LADEN: { vlsfo: 0, lsmgo: 0, count: 0 },
      };

      reports.forEach((report) => {
        const speed = Math.round(report.SPEED || 0);
        const loadType = report.LOAD_TYPE?.toUpperCase() || 'BALLAST';

        // By speed
        if (!consumptionBySpeed[speed]) {
          consumptionBySpeed[speed] = { vlsfo: 0, lsmgo: 0, count: 0 };
        }
        consumptionBySpeed[speed].vlsfo += report.TOTAL_CONSUMPTION_VLSFO || 0;
        consumptionBySpeed[speed].lsmgo += report.TOTAL_CONSUMPTION_LSMGO || 0;
        consumptionBySpeed[speed].count += 1;

        // By load type
        if (consumptionByLoad[loadType]) {
          consumptionByLoad[loadType].vlsfo +=
            report.TOTAL_CONSUMPTION_VLSFO || 0;
          consumptionByLoad[loadType].lsmgo +=
            report.TOTAL_CONSUMPTION_LSMGO || 0;
          consumptionByLoad[loadType].count += 1;
        }
      });

      // Calculate averages
      const speedProfile: Record<
        number,
        { vlsfo_mt_per_day: number; lsmgo_mt_per_day: number }
      > = {};
      Object.entries(consumptionBySpeed).forEach(([speed, data]) => {
        if (data.count > 0) {
          speedProfile[parseInt(speed)] = {
            vlsfo_mt_per_day: data.vlsfo / data.count,
            lsmgo_mt_per_day: data.lsmgo / data.count,
          };
        }
      });

      const profile: VesselConsumptionProfile = {
        vessel_imo: vesselIMO,
        consumption_by_speed: speedProfile,
        consumption_by_load: {
          ballast: {
            vlsfo:
              consumptionByLoad.BALLAST.count > 0
                ? consumptionByLoad.BALLAST.vlsfo /
                  consumptionByLoad.BALLAST.count
                : 0,
            lsmgo:
              consumptionByLoad.BALLAST.count > 0
                ? consumptionByLoad.BALLAST.lsmgo /
                  consumptionByLoad.BALLAST.count
                : 0,
          },
          laden: {
            vlsfo:
              consumptionByLoad.LADEN.count > 0
                ? consumptionByLoad.LADEN.vlsfo / consumptionByLoad.LADEN.count
                : 0,
            lsmgo:
              consumptionByLoad.LADEN.count > 0
                ? consumptionByLoad.LADEN.lsmgo / consumptionByLoad.LADEN.count
                : 0,
          },
        },
        data_quality: {
          report_count: reports.length,
          date_range: {
            from: new Date(reports[reports.length - 1].UTC_DATE_TIME),
            to: new Date(reports[0].UTC_DATE_TIME),
          },
        },
      };

      // Cache for 6 hours
      await this.cache.set(cacheKey, profile, 21600);

      return profile;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(
        `❌ [VESSEL-REPO] Error calculating consumption profile: ${msg}`
      );
      return null;
    }
  }
}
