/**
 * ROB (Remaining On Board) Tracking Engine
 * 
 * Tracks fuel remaining on board throughout voyage.
 * Critical for bunker planning safety validation.
 */

export interface FuelQuantity {
  VLSFO: number;  // Metric tons
  LSMGO: number;  // Metric tons
}

export interface ROBWaypoint {
  location: string;
  distance_from_previous: number;  // Nautical miles
  rob_before_action: FuelQuantity;
  action?: {
    type: 'bunker' | 'consume';
    quantity: FuelQuantity;
  };
  rob_after_action: FuelQuantity;
  safety_margin_days: number;
  is_safe: boolean;
}

export interface ROBTrackingInput {
  // Initial state
  initial_rob: FuelQuantity;
  vessel_capacity: FuelQuantity;
  
  // Voyage segments
  segments: Array<{
    from: string;
    to: string;
    distance_nm: number;
    consumption_mt_per_day: FuelQuantity;  // By fuel type
    duration_days: number;
  }>;
  
  // Bunker stops
  bunker_stops?: Array<{
    port_name: string;
    quantity_to_bunker: FuelQuantity;
    segment_index: number;  // After which segment this bunker happens (-1 = at departure, before first segment)
  }>;
  
  // Safety parameters
  safety_margin_days: number;  // Typically 3-5 days
}

export interface ROBTrackingOutput {
  waypoints: ROBWaypoint[];
  final_rob: FuelQuantity;
  minimum_rob_reached: FuelQuantity;
  minimum_rob_location: string;
  overall_safe: boolean;
  safety_violations: Array<{
    location: string;
    issue: string;
    rob_at_violation: FuelQuantity;
  }>;
}

export class ROBTrackingEngine {
  
  /**
   * Track ROB throughout entire voyage
   */
  public calculateROBTracking(input: ROBTrackingInput): ROBTrackingOutput {
    const waypoints: ROBWaypoint[] = [];
    let currentROB = { ...input.initial_rob };
    let minROB = { ...input.initial_rob };
    let minROBLocation = 'Departure';
    const violations: Array<{
      location: string;
      issue: string;
      rob_at_violation: FuelQuantity;
    }> = [];

    // Add departure waypoint
    const defaultConsumption = input.segments[0]?.consumption_mt_per_day || { VLSFO: 30, LSMGO: 3 };
    waypoints.push({
      location: 'Departure',
      distance_from_previous: 0,
      rob_before_action: { ...currentROB },
      rob_after_action: { ...currentROB },
      safety_margin_days: this.calculateSafetyMarginDays(currentROB, defaultConsumption),
      is_safe: true,
    });

    // Check for bunker at departure (segment_index: -1)
    // This handles the case where bunker happens at the departure port BEFORE sailing
    const bunkerAtDeparture = input.bunker_stops?.find(b => b.segment_index === -1);
    if (bunkerAtDeparture) {
      // Validate bunker quantity fits in available capacity
      const availableVLSFO = input.vessel_capacity.VLSFO - currentROB.VLSFO;
      const availableLSMGO = input.vessel_capacity.LSMGO - currentROB.LSMGO;
      
      if (bunkerAtDeparture.quantity_to_bunker.VLSFO > availableVLSFO || 
          bunkerAtDeparture.quantity_to_bunker.LSMGO > availableLSMGO) {
        violations.push({
          location: bunkerAtDeparture.port_name,
          issue: 'Bunker quantity exceeds available tank capacity',
          rob_at_violation: { ...currentROB },
        });
      }
      
      // Record ROB before bunkering
      const robBeforeBunker = { ...currentROB };
      
      // Add fuel from bunkering
      currentROB.VLSFO = Math.min(
        currentROB.VLSFO + bunkerAtDeparture.quantity_to_bunker.VLSFO,
        input.vessel_capacity.VLSFO
      );
      currentROB.LSMGO = Math.min(
        currentROB.LSMGO + bunkerAtDeparture.quantity_to_bunker.LSMGO,
        input.vessel_capacity.LSMGO
      );
      
      // Add bunker waypoint (at departure, after bunkering)
      const safetyMarginAfterBunker = this.calculateSafetyMarginDays(currentROB, defaultConsumption);
      
      waypoints.push({
        location: `${bunkerAtDeparture.port_name} (After Bunker)`,
        distance_from_previous: 0,
        rob_before_action: robBeforeBunker,
        action: {
          type: 'bunker',
          quantity: bunkerAtDeparture.quantity_to_bunker,
        },
        rob_after_action: { ...currentROB },
        safety_margin_days: safetyMarginAfterBunker,
        is_safe: safetyMarginAfterBunker >= input.safety_margin_days,
      });
      
      console.log(`✅ [ROB-ENGINE] Bunker at departure: +${bunkerAtDeparture.quantity_to_bunker.VLSFO} MT VLSFO, +${bunkerAtDeparture.quantity_to_bunker.LSMGO || 0} MT LSMGO`);
      console.log(`   ROB now: ${currentROB.VLSFO.toFixed(1)} MT VLSFO, ${currentROB.LSMGO.toFixed(1)} MT LSMGO`);
    }

    // Process each segment
    for (let i = 0; i < input.segments.length; i++) {
      const segment = input.segments[i];
      
      // Calculate consumption during this segment
      const consumptionVLSFO = segment.consumption_mt_per_day.VLSFO * segment.duration_days;
      const consumptionLSMGO = segment.consumption_mt_per_day.LSMGO * segment.duration_days;
      
      // Deduct consumption
      currentROB.VLSFO -= consumptionVLSFO;
      currentROB.LSMGO -= consumptionLSMGO;
      
      // Check if ROB went negative (CRITICAL VIOLATION)
      if (currentROB.VLSFO < 0 || currentROB.LSMGO < 0) {
        violations.push({
          location: segment.to,
          issue: 'Negative ROB - vessel cannot reach destination',
          rob_at_violation: { ...currentROB },
        });
      }
      
      // Track minimum ROB
      if (currentROB.VLSFO < minROB.VLSFO || currentROB.LSMGO < minROB.LSMGO) {
        minROB = { ...currentROB };
        minROBLocation = segment.to;
      }
      
      // Calculate safety margin
      const safetyMarginDays = this.calculateSafetyMarginDays(
        currentROB,
        segment.consumption_mt_per_day
      );
      
      const isSafe = safetyMarginDays >= input.safety_margin_days && 
                     currentROB.VLSFO >= 0 && 
                     currentROB.LSMGO >= 0;
      
      if (!isSafe && safetyMarginDays < input.safety_margin_days) {
        violations.push({
          location: segment.to,
          issue: `Safety margin below ${input.safety_margin_days} days (${safetyMarginDays.toFixed(1)} days)`,
          rob_at_violation: { ...currentROB },
        });
      }
      
      // Add arrival waypoint (before bunker)
      waypoints.push({
        location: segment.to,
        distance_from_previous: segment.distance_nm,
        rob_before_action: { ...currentROB },
        rob_after_action: { ...currentROB },
        safety_margin_days: safetyMarginDays,
        is_safe: isSafe,
      });
      
      // Check if there's a bunker stop after this segment
      const bunkerStop = input.bunker_stops?.find(b => b.segment_index === i);
      if (bunkerStop) {
        // Validate bunker quantity fits in available capacity
        const availableVLSFO = input.vessel_capacity.VLSFO - currentROB.VLSFO;
        const availableLSMGO = input.vessel_capacity.LSMGO - currentROB.LSMGO;
        
        if (bunkerStop.quantity_to_bunker.VLSFO > availableVLSFO || 
            bunkerStop.quantity_to_bunker.LSMGO > availableLSMGO) {
          violations.push({
            location: bunkerStop.port_name,
            issue: 'Bunker quantity exceeds available tank capacity',
            rob_at_violation: { ...currentROB },
          });
        }
        
        // Add fuel from bunkering
        currentROB.VLSFO += bunkerStop.quantity_to_bunker.VLSFO;
        currentROB.LSMGO += bunkerStop.quantity_to_bunker.LSMGO;
        
        // Add bunker waypoint
        const safetyMarginAfterBunker = this.calculateSafetyMarginDays(
          currentROB,
          segment.consumption_mt_per_day
        );
        
        waypoints.push({
          location: `${bunkerStop.port_name} (After Bunker)`,
          distance_from_previous: 0,
          rob_before_action: waypoints[waypoints.length - 1].rob_after_action,
          action: {
            type: 'bunker',
            quantity: bunkerStop.quantity_to_bunker,
          },
          rob_after_action: { ...currentROB },
          safety_margin_days: safetyMarginAfterBunker,
          is_safe: safetyMarginAfterBunker >= input.safety_margin_days,
        });
      }
    }

    return {
      waypoints,
      final_rob: currentROB,
      minimum_rob_reached: minROB,
      minimum_rob_location: minROBLocation,
      overall_safe: violations.length === 0,
      safety_violations: violations,
    };
  }

  /**
   * Calculate how many days of sailing remaining with current ROB
   */
  private calculateSafetyMarginDays(
    currentROB: FuelQuantity,
    dailyConsumption: FuelQuantity
  ): number {
    // Safety margin is minimum of VLSFO days and LSMGO days
    const vlsfoDays = dailyConsumption.VLSFO > 0 
      ? currentROB.VLSFO / dailyConsumption.VLSFO 
      : Infinity;
    
    const lsmgoDays = dailyConsumption.LSMGO > 0 
      ? currentROB.LSMGO / dailyConsumption.LSMGO 
      : Infinity;
    
    return Math.min(vlsfoDays, lsmgoDays);
  }

  /**
   * Validate if bunker quantity fits in available capacity
   */
  public validateBunkerCapacity(
    currentROB: FuelQuantity,
    vesselCapacity: FuelQuantity,
    bunkerQuantity: FuelQuantity
  ): {
    fits: boolean;
    available_capacity: FuelQuantity;
    overflow: FuelQuantity;
  } {
    const availableVLSFO = vesselCapacity.VLSFO - currentROB.VLSFO;
    const availableLSMGO = vesselCapacity.LSMGO - currentROB.LSMGO;
    
    const overflowVLSFO = Math.max(0, bunkerQuantity.VLSFO - availableVLSFO);
    const overflowLSMGO = Math.max(0, bunkerQuantity.LSMGO - availableLSMGO);
    
    return {
      fits: overflowVLSFO === 0 && overflowLSMGO === 0,
      available_capacity: {
        VLSFO: availableVLSFO,
        LSMGO: availableLSMGO,
      },
      overflow: {
        VLSFO: overflowVLSFO,
        LSMGO: overflowLSMGO,
      },
    };
  }
}

// Export singleton instance
export const robTrackingEngine = new ROBTrackingEngine();
