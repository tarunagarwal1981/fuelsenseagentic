/**
 * ECA (Emission Control Area) Consumption Engine
 * 
 * Calculates fuel consumption with proper ECA fuel switching logic.
 * CRITICAL: Inside ECA, main engine SWITCHES to LSMGO (not add).
 */

export interface ECAZone {
  zone_name: string;
  start_distance: number;  // Nautical miles from origin
  end_distance: number;
  is_eca: boolean;
}

export interface ConsumptionProfile {
  main_engine_mt_per_day: number;    // Main propulsion
  auxiliary_mt_per_day: number;      // Auxiliary engines
  total_mt_per_day: number;
}

export interface RouteSegment {
  segment_id: string;
  from: string;
  to: string;
  distance_nm: number;
  is_eca: boolean;
  eca_zone_name?: string;
}

export interface ECAConsumptionInput {
  // Base consumption (clean hull, design conditions)
  base_consumption: ConsumptionProfile;
  
  // Route with ECA zones
  route_segments: RouteSegment[];
  
  // Speed
  speed_knots: number;
  
  // Adjustment factors
  weather_factor?: number;  // 1.0 to 1.5
  fouling_factor?: number;  // 1.0 to 1.3
  loading_factor?: number;  // 0.85 to 1.15
}

export interface FuelConsumptionByType {
  VLSFO: number;
  LSMGO: number;
  total: number;
}

export interface SegmentConsumption {
  segment_id: string;
  from: string;
  to: string;
  distance_nm: number;
  duration_days: number;
  is_eca: boolean;
  
  // Consumption by fuel type
  consumption_mt: FuelConsumptionByType;
  consumption_mt_per_day: FuelConsumptionByType;
  
  // Breakdown
  main_engine: {
    fuel_type: 'VLSFO' | 'LSMGO';
    consumption_mt_per_day: number;
  };
  auxiliary_engine: {
    fuel_type: 'LSMGO';
    consumption_mt_per_day: number;
  };
}

export interface ECAConsumptionOutput {
  segments: SegmentConsumption[];
  
  // Totals
  total_consumption_mt: FuelConsumptionByType;
  total_duration_days: number;
  total_distance_nm: number;
  
  // ECA breakdown
  eca_distance_nm: number;
  non_eca_distance_nm: number;
  eca_percentage: number;
}

export class ECAConsumptionEngine {
  
  /**
   * Calculate consumption with ECA fuel switching
   */
  public calculateConsumption(input: ECAConsumptionInput): ECAConsumptionOutput {
    const segments: SegmentConsumption[] = [];
    
    // Apply adjustment factors to base consumption
    const adjustedMainEngine = input.base_consumption.main_engine_mt_per_day *
      (input.weather_factor || 1.0) *
      (input.fouling_factor || 1.0) *
      (input.loading_factor || 1.0);
    
    const adjustedAuxiliary = input.base_consumption.auxiliary_mt_per_day *
      (input.weather_factor || 1.0);
    
    // Process each segment
    for (const segment of input.route_segments) {
      const durationDays = segment.distance_nm / (input.speed_knots * 24);
      
      let vlsfoPerDay = 0;
      let lsmgoPerDay = 0;
      let mainEngineFuelType: 'VLSFO' | 'LSMGO';
      
      if (segment.is_eca) {
        // Inside ECA: Main engine switches to LSMGO
        mainEngineFuelType = 'LSMGO';
        vlsfoPerDay = 0;
        lsmgoPerDay = adjustedMainEngine + adjustedAuxiliary;
      } else {
        // Outside ECA: Main engine uses VLSFO
        mainEngineFuelType = 'VLSFO';
        vlsfoPerDay = adjustedMainEngine;
        lsmgoPerDay = adjustedAuxiliary;
      }
      
      const totalPerDay = vlsfoPerDay + lsmgoPerDay;
      
      segments.push({
        segment_id: segment.segment_id,
        from: segment.from,
        to: segment.to,
        distance_nm: segment.distance_nm,
        duration_days: durationDays,
        is_eca: segment.is_eca,
        
        consumption_mt: {
          VLSFO: vlsfoPerDay * durationDays,
          LSMGO: lsmgoPerDay * durationDays,
          total: totalPerDay * durationDays,
        },
        
        consumption_mt_per_day: {
          VLSFO: vlsfoPerDay,
          LSMGO: lsmgoPerDay,
          total: totalPerDay,
        },
        
        main_engine: {
          fuel_type: mainEngineFuelType,
          consumption_mt_per_day: adjustedMainEngine,
        },
        
        auxiliary_engine: {
          fuel_type: 'LSMGO',
          consumption_mt_per_day: adjustedAuxiliary,
        },
      });
    }
    
    // Calculate totals
    const totalVLSFO = segments.reduce((sum, s) => sum + s.consumption_mt.VLSFO, 0);
    const totalLSMGO = segments.reduce((sum, s) => sum + s.consumption_mt.LSMGO, 0);
    const totalDistance = segments.reduce((sum, s) => sum + s.distance_nm, 0);
    const totalDuration = segments.reduce((sum, s) => sum + s.duration_days, 0);
    
    const ecaDistance = segments
      .filter(s => s.is_eca)
      .reduce((sum, s) => sum + s.distance_nm, 0);
    
    const nonEcaDistance = totalDistance - ecaDistance;
    
    return {
      segments,
      total_consumption_mt: {
        VLSFO: totalVLSFO,
        LSMGO: totalLSMGO,
        total: totalVLSFO + totalLSMGO,
      },
      total_duration_days: totalDuration,
      total_distance_nm: totalDistance,
      eca_distance_nm: ecaDistance,
      non_eca_distance_nm: nonEcaDistance,
      eca_percentage: (ecaDistance / totalDistance) * 100,
    };
  }
  
  /**
   * Calculate consumption for single segment
   */
  public calculateSegmentConsumption(
    baseConsumption: ConsumptionProfile,
    segmentDistance: number,
    speedKnots: number,
    isECA: boolean,
    adjustments?: {
      weather?: number;
      fouling?: number;
      loading?: number;
    }
  ): FuelConsumptionByType {
    const durationDays = segmentDistance / (speedKnots * 24);
    
    const adjustedMain = baseConsumption.main_engine_mt_per_day *
      (adjustments?.weather || 1.0) *
      (adjustments?.fouling || 1.0) *
      (adjustments?.loading || 1.0);
    
    const adjustedAux = baseConsumption.auxiliary_mt_per_day *
      (adjustments?.weather || 1.0);
    
    if (isECA) {
      return {
        VLSFO: 0,
        LSMGO: (adjustedMain + adjustedAux) * durationDays,
        total: (adjustedMain + adjustedAux) * durationDays,
      };
    } else {
      return {
        VLSFO: adjustedMain * durationDays,
        LSMGO: adjustedAux * durationDays,
        total: (adjustedMain + adjustedAux) * durationDays,
      };
    }
  }
  
  /**
   * Validate ECA logic: total consumption should be same inside/outside ECA
   * (just fuel type changes, not total energy)
   */
  public validateECALogic(
    consumption: ECAConsumptionOutput
  ): {
    is_valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    
    // Check that no segment has both VLSFO and LSMGO > 0 for main engine
    // (main engine uses only one fuel type at a time)
    for (const segment of consumption.segments) {
      if (segment.is_eca && segment.consumption_mt_per_day.VLSFO > 0) {
        issues.push(
          `ECA segment ${segment.segment_id} has VLSFO consumption (should be 0)`
        );
      }
      
      if (!segment.is_eca && segment.consumption_mt_per_day.VLSFO === 0) {
        issues.push(
          `Non-ECA segment ${segment.segment_id} has no VLSFO consumption`
        );
      }
    }
    
    return {
      is_valid: issues.length === 0,
      issues,
    };
  }
}

// Export singleton instance
export const ecaConsumptionEngine = new ECAConsumptionEngine();
