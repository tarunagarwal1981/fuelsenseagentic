/**
 * ROB (Remaining On Board) Tracking Engine
 * 
 * A CRITICAL deterministic engine that tracks fuel ROB at every point in a voyage.
 * This engine must be 100% accurate as it drives safety decisions.
 * 
 * Features:
 * - Calculates ROB at departure, waypoints, bunker ports, and destination
 * - Tracks both VLSFO and LSMGO separately
 * - Accounts for ECA fuel switching logic
 * - Validates minimum safety margins
 * - Never allows negative ROB
 * - Comprehensive error handling
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Remaining On Board fuel quantities
 */
export interface ROB {
  /** VLSFO (Very Low Sulphur Fuel Oil) in metric tons */
  vlsfo: number;
  /** LSMGO (Low Sulphur Marine Gas Oil) in metric tons */
  lsmgo: number;
}

/**
 * Daily fuel consumption rates
 */
export interface Consumption {
  /** VLSFO consumption per day in metric tons */
  vlsfo_per_day: number;
  /** LSMGO consumption per day in metric tons */
  lsmgo_per_day: number;
}

/**
 * Result of calculating ROB at a single point
 */
export interface ROBResult {
  /** ROB at this point */
  rob: ROB;
  /** Fuel consumed to reach this point */
  consumption: ROB;
  /** Time taken to reach this point in hours */
  time_hours: number;
  /** Warnings (e.g., low fuel levels) */
  warnings: string[];
}

/**
 * Route segment between two waypoints
 */
export interface RouteSegment {
  /** Distance in nautical miles */
  distance_nm: number;
  /** Time taken in hours */
  time_hours: number;
  /** Whether this segment is in an ECA zone */
  is_in_eca: boolean;
  /** Weather adjustment factor (multiplier) */
  weather_factor: number;
  /** Optional segment identifier */
  segment_id?: string;
}

/**
 * Bunker stop at a port
 */
export interface BunkerStop {
  /** Port code */
  port_code: string;
  /** Bunker amount in metric tons */
  bunker_amount: number;
  /** Fuel type being bunkered */
  fuel_type: 'VLSFO' | 'LSMGO';
  /** ROB before bunkering */
  rob_before?: ROB;
  /** ROB after bunkering */
  rob_after?: ROB;
  /** Optional tank capacity for validation */
  tank_capacity?: {
    vlsfo: number;
    lsmgo: number;
  };
}

/**
 * Complete voyage tracking report
 */
export interface ROBTrackingReport {
  /** ROB at departure */
  rob_departure: ROB;
  /** ROB at destination */
  rob_destination: ROB;
  /** ROB at each waypoint */
  waypoints: Array<{
    waypoint_id: string;
    rob: ROB;
    consumption: ROB;
    time_hours: number;
    is_in_eca: boolean;
    warnings: string[];
  }>;
  /** ROB at each bunker stop */
  bunker_stops: Array<{
    port_code: string;
    rob_before: ROB;
    rob_after: ROB;
    bunker_amount: number;
    fuel_type: 'VLSFO' | 'LSMGO';
    safety_margin_valid: boolean;
    warnings: string[];
  }>;
  /** Total fuel consumed during voyage */
  total_consumption: ROB;
  /** Safety validation results */
  safety_validations: Array<{
    location: string;
    validation: SafetyValidation;
  }>;
  /** Any errors encountered */
  errors: string[];
  /** Overall voyage status */
  status: 'valid' | 'insufficient_fuel' | 'safety_margin_violation' | 'error';
}

/**
 * Safety margin validation result
 */
export interface SafetyValidation {
  /** Whether safety margin is met */
  is_valid: boolean;
  /** Shortfall in days if insufficient */
  shortfall_days?: number;
  /** Available days of fuel */
  available_days: number;
  /** Required days of fuel */
  required_days: number;
  /** Warnings */
  warnings: string[];
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Error thrown when ROB becomes negative
 */
export class InsufficientFuelError extends Error {
  constructor(
    public readonly location: string,
    public readonly rob: ROB,
    public readonly shortfall: ROB
  ) {
    super(`Insufficient fuel at ${location}. ROB: VLSFO=${rob.vlsfo.toFixed(2)}MT, LSMGO=${rob.lsmgo.toFixed(2)}MT. Shortfall: VLSFO=${shortfall.vlsfo.toFixed(2)}MT, LSMGO=${shortfall.lsmgo.toFixed(2)}MT`);
    this.name = 'InsufficientFuelError';
  }
}

/**
 * Error thrown when safety margin is violated
 */
export class SafetyMarginError extends Error {
  constructor(
    public readonly location: string,
    public readonly required_days: number,
    public readonly available_days: number,
    public readonly shortfall_days: number
  ) {
    super(`Safety margin violation at ${location}. Required: ${required_days} days, Available: ${available_days.toFixed(2)} days, Shortfall: ${shortfall_days.toFixed(2)} days`);
    this.name = 'SafetyMarginError';
  }
}

/**
 * Error thrown when bunker amount exceeds tank capacity
 */
export class TankCapacityError extends Error {
  constructor(
    public readonly port_code: string,
    public readonly fuel_type: 'VLSFO' | 'LSMGO',
    public readonly rob_after: number,
    public readonly capacity: number
  ) {
    super(`Tank capacity exceeded at ${port_code} for ${fuel_type}. ROB after bunkering: ${rob_after.toFixed(2)}MT, Capacity: ${capacity}MT`);
    this.name = 'TankCapacityError';
  }
}

/**
 * Error thrown for invalid input parameters
 */
export class InvalidInputError extends Error {
  constructor(
    public readonly field: string,
    public readonly value: any,
    public readonly reason: string
  ) {
    super(`Invalid input for ${field}: ${value}. Reason: ${reason}`);
    this.name = 'InvalidInputError';
  }
}

// ============================================================================
// ROB TRACKER CLASS
// ============================================================================

/**
 * ROB Tracker Interface
 */
export interface ROBTracker {
  /**
   * Calculate ROB at a single point along the route
   */
  calculateROBAtPoint(params: {
    rob_previous: ROB;
    distance_nm: number;
    vessel_speed_knots: number;
    base_consumption: Consumption;
    weather_factor: number;
    is_in_eca: boolean;
  }): ROBResult;

  /**
   * Track ROB throughout entire voyage
   */
  trackEntireVoyage(params: {
    rob_departure: ROB;
    route_segments: RouteSegment[];
    bunker_stops: BunkerStop[];
    base_consumption: Consumption;
  }): ROBTrackingReport;

  /**
   * Validate safety margins at a port
   */
  validateSafetyMargins(params: {
    rob_at_port: ROB;
    daily_consumption: Consumption;
    minimum_days: number;
  }): SafetyValidation;
}

/**
 * ROB Tracking Engine Implementation
 */
export class ROBTrackingEngine implements ROBTracker {
  /**
   * Calculate ROB at a single point
   * 
   * Formula:
   * - time_hours = distance_nm / vessel_speed_knots
   * - time_days = time_hours / 24
   * - consumption = base_consumption * time_days * weather_factor
   * - ROB_at_point = ROB_previous - consumption
   * 
   * ECA Fuel Switching Logic:
   * - Outside ECA: VLSFO and LSMGO consumed at base rates
   * - Inside ECA: VLSFO = 0, LSMGO = base_vlsfo + base_lsmgo (VLSFO is REPLACED)
   */
  calculateROBAtPoint(params: {
    rob_previous: ROB;
    distance_nm: number;
    vessel_speed_knots: number;
    base_consumption: Consumption;
    weather_factor: number;
    is_in_eca: boolean;
  }): ROBResult {
    const {
      rob_previous,
      distance_nm,
      vessel_speed_knots,
      base_consumption,
      weather_factor,
      is_in_eca,
    } = params;

    // Input validation
    this.validateROB(rob_previous, 'rob_previous');
    if (distance_nm < 0) {
      throw new InvalidInputError('distance_nm', distance_nm, 'Distance must be non-negative');
    }
    if (vessel_speed_knots <= 0) {
      throw new InvalidInputError('vessel_speed_knots', vessel_speed_knots, 'Vessel speed must be positive');
    }
    if (base_consumption.vlsfo_per_day < 0 || base_consumption.lsmgo_per_day < 0) {
      throw new InvalidInputError('base_consumption', base_consumption, 'Consumption rates must be non-negative');
    }
    if (weather_factor <= 0) {
      throw new InvalidInputError('weather_factor', weather_factor, 'Weather factor must be positive');
    }

    // Calculate time to point
    const time_hours = distance_nm / vessel_speed_knots;
    const time_days = time_hours / 24;

    // Calculate consumption based on ECA status
    let vlsfo_consumption: number;
    let lsmgo_consumption: number;

    if (is_in_eca) {
      // Inside ECA: VLSFO is switched off, LSMGO replaces it
      vlsfo_consumption = 0;
      lsmgo_consumption = (base_consumption.vlsfo_per_day + base_consumption.lsmgo_per_day) * time_days * weather_factor;
    } else {
      // Outside ECA: Normal consumption
      vlsfo_consumption = base_consumption.vlsfo_per_day * time_days * weather_factor;
      lsmgo_consumption = base_consumption.lsmgo_per_day * time_days * weather_factor;
    }

    const consumption: ROB = {
      vlsfo: vlsfo_consumption,
      lsmgo: lsmgo_consumption,
    };

    // Calculate ROB at point
    const rob_at_point: ROB = {
      vlsfo: rob_previous.vlsfo - consumption.vlsfo,
      lsmgo: rob_previous.lsmgo - consumption.lsmgo,
    };

    // Validate ROB is non-negative
    if (rob_at_point.vlsfo < 0 || rob_at_point.lsmgo < 0) {
      const shortfall: ROB = {
        vlsfo: Math.max(0, -rob_at_point.vlsfo),
        lsmgo: Math.max(0, -rob_at_point.lsmgo),
      };
      throw new InsufficientFuelError('waypoint', rob_at_point, shortfall);
    }

    // Generate warnings for low fuel levels
    const warnings: string[] = [];
    const total_rob = rob_at_point.vlsfo + rob_at_point.lsmgo;
    const total_daily_consumption = base_consumption.vlsfo_per_day + base_consumption.lsmgo_per_day;
    const days_remaining = total_rob / total_daily_consumption;

    if (days_remaining < 5) {
      warnings.push(`Low fuel warning: Only ${days_remaining.toFixed(2)} days of fuel remaining`);
    }
    if (rob_at_point.vlsfo < 10) {
      warnings.push(`Low VLSFO warning: Only ${rob_at_point.vlsfo.toFixed(2)}MT remaining`);
    }
    if (rob_at_point.lsmgo < 10) {
      warnings.push(`Low LSMGO warning: Only ${rob_at_point.lsmgo.toFixed(2)}MT remaining`);
    }

    return {
      rob: rob_at_point,
      consumption,
      time_hours,
      warnings,
    };
  }

  /**
   * Track ROB throughout entire voyage
   * 
   * Processes route segments and bunker stops to calculate ROB at all points.
   * Validates safety margins at bunker ports (3 days) and destination (5 days).
   */
  trackEntireVoyage(params: {
    rob_departure: ROB;
    route_segments: RouteSegment[];
    bunker_stops: BunkerStop[];
    base_consumption: Consumption;
  }): ROBTrackingReport {
    const { rob_departure, route_segments, bunker_stops, base_consumption } = params;

    // Input validation
    this.validateROB(rob_departure, 'rob_departure');
    if (!Array.isArray(route_segments)) {
      throw new InvalidInputError('route_segments', route_segments, 'Route segments must be an array');
    }
    if (!Array.isArray(bunker_stops)) {
      throw new InvalidInputError('bunker_stops', bunker_stops, 'Bunker stops must be an array');
    }

    const waypoints: ROBTrackingReport['waypoints'] = [];
    const bunker_stop_results: ROBTrackingReport['bunker_stops'] = [];
    const safety_validations: ROBTrackingReport['safety_validations'] = [];
    const errors: string[] = [];
    let status: ROBTrackingReport['status'] = 'valid';

    let current_rob = { ...rob_departure };
    let total_consumption: ROB = { vlsfo: 0, lsmgo: 0 };
    let waypoint_index = 0;

    // Process route segments
    for (const segment of route_segments) {
      try {
        // Validate segment
        if (segment.distance_nm < 0) {
          throw new InvalidInputError('segment.distance_nm', segment.distance_nm, 'Distance must be non-negative');
        }
        if (segment.weather_factor <= 0) {
          throw new InvalidInputError('segment.weather_factor', segment.weather_factor, 'Weather factor must be positive');
        }

        // Calculate vessel speed from segment data
        const vessel_speed_knots = segment.distance_nm / (segment.time_hours || segment.distance_nm / 14); // Default 14 knots if time not provided

        // Calculate ROB at end of segment
        const result = this.calculateROBAtPoint({
          rob_previous: current_rob,
          distance_nm: segment.distance_nm,
          vessel_speed_knots,
          base_consumption,
          weather_factor: segment.weather_factor,
          is_in_eca: segment.is_in_eca,
        });

        // Track waypoint
        waypoints.push({
          waypoint_id: segment.segment_id || `waypoint_${waypoint_index++}`,
          rob: result.rob,
          consumption: result.consumption,
          time_hours: result.time_hours,
          is_in_eca: segment.is_in_eca,
          warnings: result.warnings,
        });

        // Update totals
        current_rob = result.rob;
        total_consumption.vlsfo += result.consumption.vlsfo;
        total_consumption.lsmgo += result.consumption.lsmgo;
      } catch (error) {
        if (error instanceof InsufficientFuelError) {
          errors.push(error.message);
          status = 'insufficient_fuel';
        } else if (error instanceof InvalidInputError) {
          errors.push(error.message);
          status = 'error';
        } else {
          errors.push(`Unexpected error processing segment: ${error instanceof Error ? error.message : String(error)}`);
          status = 'error';
        }
      }
    }

    // Process bunker stops
    for (const bunker_stop of bunker_stops) {
      try {
        // Calculate ROB before bunkering (should already be calculated, but validate)
        const rob_before = bunker_stop.rob_before || current_rob;

        // Validate safety margin at bunker port (3 days)
        const daily_consumption: Consumption = base_consumption;
        const safety_validation = this.validateSafetyMargins({
          rob_at_port: rob_before,
          daily_consumption,
          minimum_days: 3,
        });

        if (!safety_validation.is_valid) {
          status = 'safety_margin_violation';
          safety_validations.push({
            location: bunker_stop.port_code,
            validation: safety_validation,
          });
        }

        // Calculate ROB after bunkering
        const rob_after: ROB = { ...rob_before };
        if (bunker_stop.fuel_type === 'VLSFO') {
          rob_after.vlsfo += bunker_stop.bunker_amount;
        } else {
          rob_after.lsmgo += bunker_stop.bunker_amount;
        }

        // Validate tank capacity if provided
        if (bunker_stop.tank_capacity) {
          if (rob_after.vlsfo > bunker_stop.tank_capacity.vlsfo) {
            throw new TankCapacityError(
              bunker_stop.port_code,
              'VLSFO',
              rob_after.vlsfo,
              bunker_stop.tank_capacity.vlsfo
            );
          }
          if (rob_after.lsmgo > bunker_stop.tank_capacity.lsmgo) {
            throw new TankCapacityError(
              bunker_stop.port_code,
              'LSMGO',
              rob_after.lsmgo,
              bunker_stop.tank_capacity.lsmgo
            );
          }
        }

        // Track bunker stop
        bunker_stop_results.push({
          port_code: bunker_stop.port_code,
          rob_before,
          rob_after,
          bunker_amount: bunker_stop.bunker_amount,
          fuel_type: bunker_stop.fuel_type,
          safety_margin_valid: safety_validation.is_valid,
          warnings: safety_validation.warnings,
        });

        // Update current ROB
        current_rob = rob_after;
      } catch (error) {
        if (error instanceof TankCapacityError || error instanceof SafetyMarginError) {
          errors.push(error.message);
          status = 'safety_margin_violation';
        } else {
          errors.push(`Error processing bunker stop at ${bunker_stop.port_code}: ${error instanceof Error ? error.message : String(error)}`);
          status = 'error';
        }
      }
    }

    // Validate safety margin at destination (5 days)
    const daily_consumption: Consumption = base_consumption;
    const destination_validation = this.validateSafetyMargins({
      rob_at_port: current_rob,
      daily_consumption,
      minimum_days: 5,
    });

    if (!destination_validation.is_valid) {
      status = 'safety_margin_violation';
    }

    safety_validations.push({
      location: 'destination',
      validation: destination_validation,
    });

    return {
      rob_departure,
      rob_destination: current_rob,
      waypoints,
      bunker_stops: bunker_stop_results,
      total_consumption,
      safety_validations,
      errors,
      status,
    };
  }

  /**
   * Validate safety margins at a port
   * 
   * Checks if ROB is sufficient for minimum_days of operation.
   * Required: rob_total >= daily_consumption_total * minimum_days
   */
  validateSafetyMargins(params: {
    rob_at_port: ROB;
    daily_consumption: Consumption;
    minimum_days: number;
  }): SafetyValidation {
    const { rob_at_port, daily_consumption, minimum_days } = params;

    // Input validation
    this.validateROB(rob_at_port, 'rob_at_port');
    if (daily_consumption.vlsfo_per_day < 0 || daily_consumption.lsmgo_per_day < 0) {
      throw new InvalidInputError('daily_consumption', daily_consumption, 'Consumption rates must be non-negative');
    }
    if (minimum_days <= 0) {
      throw new InvalidInputError('minimum_days', minimum_days, 'Minimum days must be positive');
    }

    // Calculate total ROB and total daily consumption
    const total_rob = rob_at_port.vlsfo + rob_at_port.lsmgo;
    const total_daily_consumption = daily_consumption.vlsfo_per_day + daily_consumption.lsmgo_per_day;

    if (total_daily_consumption <= 0) {
      throw new InvalidInputError('daily_consumption', daily_consumption, 'Total daily consumption must be positive');
    }

    // Calculate available days
    const available_days = total_rob / total_daily_consumption;
    const required_days = minimum_days;
    const is_valid = available_days >= required_days;
    const shortfall_days = is_valid ? undefined : required_days - available_days;

    // Generate warnings
    const warnings: string[] = [];
    if (!is_valid && shortfall_days !== undefined) {
      warnings.push(`Insufficient fuel for safety margin. Shortfall: ${shortfall_days.toFixed(2)} days`);
    }
    if (available_days < required_days * 1.2) {
      warnings.push(`Low safety margin: Only ${available_days.toFixed(2)} days available (${required_days} required)`);
    }

    return {
      is_valid,
      shortfall_days,
      available_days,
      required_days,
      warnings,
    };
  }

  /**
   * Validate ROB values are non-negative
   */
  private validateROB(rob: ROB, field_name: string): void {
    if (rob.vlsfo < 0) {
      throw new InvalidInputError(field_name + '.vlsfo', rob.vlsfo, 'VLSFO must be non-negative');
    }
    if (rob.lsmgo < 0) {
      throw new InvalidInputError(field_name + '.lsmgo', rob.lsmgo, 'LSMGO must be non-negative');
    }
  }
}

// ============================================================================
// EXPORT DEFAULT INSTANCE
// ============================================================================

/**
 * Default ROB tracking engine instance
 */
export const robTracker = new ROBTrackingEngine();

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Example 1: Calculate ROB at a single waypoint
 * 
 * ```typescript
 * const engine = new ROBTrackingEngine();
 * 
 * const result = engine.calculateROBAtPoint({
 *   rob_previous: { vlsfo: 100, lsmgo: 20 },
 *   distance_nm: 336, // 1 day at 14 knots
 *   vessel_speed_knots: 14,
 *   base_consumption: { vlsfo_per_day: 30, lsmgo_per_day: 5 },
 *   weather_factor: 1.0,
 *   is_in_eca: false,
 * });
 * 
 * console.log(`ROB at waypoint: VLSFO=${result.rob.vlsfo}MT, LSMGO=${result.rob.lsmgo}MT`);
 * ```
 */

/**
 * Example 2: Track ROB through ECA zone (fuel switching)
 * 
 * ```typescript
 * const engine = new ROBTrackingEngine();
 * 
 * // Segment outside ECA
 * const result1 = engine.calculateROBAtPoint({
 *   rob_previous: { vlsfo: 100, lsmgo: 50 },
 *   distance_nm: 168, // 0.5 days
 *   vessel_speed_knots: 14,
 *   base_consumption: { vlsfo_per_day: 30, lsmgo_per_day: 5 },
 *   weather_factor: 1.0,
 *   is_in_eca: false,
 * });
 * 
 * // Segment inside ECA (fuel switching occurs)
 * const result2 = engine.calculateROBAtPoint({
 *   rob_previous: result1.rob,
 *   distance_nm: 168, // 0.5 days
 *   vessel_speed_knots: 14,
 *   base_consumption: { vlsfo_per_day: 30, lsmgo_per_day: 5 },
 *   weather_factor: 1.0,
 *   is_in_eca: true, // VLSFO switched off, LSMGO replaces it
 * });
 * 
 * // In ECA: VLSFO consumption = 0, LSMGO consumption = 35 MT/day
 * console.log(`ECA consumption: VLSFO=${result2.consumption.vlsfo}MT, LSMGO=${result2.consumption.lsmgo}MT`);
 * ```
 */

/**
 * Example 3: Track entire voyage with bunker stops
 * 
 * ```typescript
 * const engine = new ROBTrackingEngine();
 * 
 * const report = engine.trackEntireVoyage({
 *   rob_departure: { vlsfo: 200, lsmgo: 50 },
 *   route_segments: [
 *     {
 *       distance_nm: 336, // 1 day
 *       time_hours: 24,
 *       is_in_eca: false,
 *       weather_factor: 1.0,
 *       segment_id: 'segment_1',
 *     },
 *     {
 *       distance_nm: 336, // 1 day
 *       time_hours: 24,
 *       is_in_eca: true, // ECA zone
 *       weather_factor: 1.2, // Weather adjustment
 *       segment_id: 'segment_2_eca',
 *     },
 *   ],
 *   bunker_stops: [
 *     {
 *       port_code: 'SGSIN',
 *       bunker_amount: 100,
 *       fuel_type: 'VLSFO',
 *       tank_capacity: { vlsfo: 500, lsmgo: 200 },
 *     },
 *   ],
 *   base_consumption: { vlsfo_per_day: 30, lsmgo_per_day: 5 },
 * });
 * 
 * console.log(`Voyage status: ${report.status}`);
 * console.log(`Final ROB: VLSFO=${report.rob_destination.vlsfo}MT, LSMGO=${report.rob_destination.lsmgo}MT`);
 * console.log(`Total consumption: VLSFO=${report.total_consumption.vlsfo}MT, LSMGO=${report.total_consumption.lsmgo}MT`);
 * ```
 */

/**
 * Example 4: Validate safety margins
 * 
 * ```typescript
 * const engine = new ROBTrackingEngine();
 * 
 * // Check safety margin at bunker port (3 days required)
 * const validation = engine.validateSafetyMargins({
 *   rob_at_port: { vlsfo: 100, lsmgo: 20 },
 *   daily_consumption: { vlsfo_per_day: 30, lsmgo_per_day: 5 },
 *   minimum_days: 3,
 * });
 * 
 * if (!validation.is_valid) {
 *   console.error(`Safety margin violation! Shortfall: ${validation.shortfall_days} days`);
 * } else {
 *   console.log(`Safety margin OK. Available: ${validation.available_days} days`);
 * }
 * ```
 */

/**
 * Example 5: Error handling
 * 
 * ```typescript
 * const engine = new ROBTrackingEngine();
 * 
 * try {
 *   const result = engine.calculateROBAtPoint({
 *     rob_previous: { vlsfo: 10, lsmgo: 5 },
 *     distance_nm: 336, // 1 day
 *     vessel_speed_knots: 14,
 *     base_consumption: { vlsfo_per_day: 30, lsmgo_per_day: 5 },
 *     weather_factor: 1.0,
 *     is_in_eca: false,
 *   });
 * } catch (error) {
 *   if (error instanceof InsufficientFuelError) {
 *     console.error(`Insufficient fuel at ${error.location}`);
 *     console.error(`Shortfall: VLSFO=${error.shortfall.vlsfo}MT, LSMGO=${error.shortfall.lsmgo}MT`);
 *   } else if (error instanceof InvalidInputError) {
 *     console.error(`Invalid input: ${error.field} = ${error.value}`);
 *   }
 * }
 * ```
 */

