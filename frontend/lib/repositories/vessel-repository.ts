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
import { VesselProfile } from './types';
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
}
