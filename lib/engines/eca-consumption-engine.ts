/**
 * ECA (Emission Control Area) Consumption Engine
 * 
 * CRITICAL ENGINE - Handles fuel type switching in ECA zones.
 * 
 * The logic is: VLSFO is REPLACED by LSMGO in ECA, NOT ADDED.
 * 
 * ============================================================================
 * BUSINESS RULE - CRITICAL TO UNDERSTAND
 * ============================================================================
 * 
 * Outside ECA:
 *   - Main engine: VLSFO
 *   - Auxiliary engine: LSMGO
 *   - Total: VLSFO consumption + LSMGO consumption
 * 
 * Inside ECA:
 *   - Main engine: LSMGO (REPLACES VLSFO)
 *   - Auxiliary engine: LSMGO
 *   - Total: (VLSFO base + LSMGO base) all as LSMGO
 * 
 * ============================================================================
 * EXAMPLE CALCULATION
 * ============================================================================
 * 
 * Base consumption: 20 MT/day VLSFO + 1 MT/day LSMGO at 12 knots
 * 
 * Outside ECA:
 *   VLSFO: 20 MT/day
 *   LSMGO: 1 MT/day
 *   Total: 21 MT/day
 * 
 * Inside ECA:
 *   VLSFO: 0 MT/day (switched off - REPLACED, not added)
 *   LSMGO: 21 MT/day (20 + 1, replaces VLSFO)
 *   Total: 21 MT/day (same total, different fuel type)
 * 
 * ============================================================================
 * VISUAL DIAGRAM - FUEL SWITCHING LOGIC
 * ============================================================================
 * 
 * OUTSIDE ECA:
 * ┌─────────────────────────────────────────┐
 * │ Main Engine:    20 MT/day VLSFO         │
 * │ Auxiliary:       1 MT/day LSMGO         │
 * │ ─────────────────────────────────────  │
 * │ Total:          21 MT/day               │
 * └─────────────────────────────────────────┘
 * 
 * INSIDE ECA (Fuel Switching):
 * ┌─────────────────────────────────────────┐
 * │ Main Engine:     0 MT/day VLSFO (OFF)   │
 * │                 21 MT/day LSMGO (REPL)  │
 * │ Auxiliary:       0 MT/day LSMGO (MERGED)│
 * │ ─────────────────────────────────────  │
 * │ Total:          21 MT/day (UNCHANGED)   │
 * └─────────────────────────────────────────┘
 * 
 * Note: VLSFO consumption is REPLACED by LSMGO, not added to it.
 * The total consumption remains constant - only the fuel type changes.
 * 
 * ============================================================================
 * COMMON MISTAKES TO AVOID
 * ============================================================================
 * 
 * ❌ WRONG: Inside ECA, LSMGO = base_lsmgo + base_vlsfo (adding)
 * ✅ CORRECT: Inside ECA, LSMGO = base_lsmgo + base_vlsfo (replacing)
 * 
 * The difference is subtle but critical:
 * - WRONG assumes both fuels are consumed simultaneously
 * - CORRECT recognizes VLSFO is switched off and LSMGO replaces it
 * 
 * ❌ WRONG: Total consumption changes in ECA zones
 * ✅ CORRECT: Total consumption remains the same, only fuel type changes
 * 
 * ============================================================================
 * WEATHER FACTOR APPLICATION
 * ============================================================================
 * 
 * Weather factor represents increased consumption due to adverse conditions.
 * It is always >= 1.0 (never reduces consumption below base rate).
 * 
 * Formula:
 *   Adjusted consumption = Base consumption × Weather factor
 * 
 * Example:
 *   Base: 20 MT/day VLSFO
 *   Weather factor: 1.2 (20% increase)
 *   Adjusted: 20 × 1.2 = 24 MT/day VLSFO
 * 
 * ============================================================================
 * INTEGRATION WITH OTHER SYSTEMS
 * ============================================================================
 * 
 * This engine can be used by:
 * - ROB Tracking Engine: For calculating fuel consumption at waypoints
 * - ECA Zone Validator: For calculating MGO requirements in ECA zones
 * - Bunker Analyzer: For calculating fuel requirements for bunker planning
 * 
 * The engine is deterministic - same inputs always produce same outputs.
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Route segment between two waypoints
 * Imported from ROB tracking engine for consistency
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
 * Result of consumption calculation
 */
export interface ConsumptionResult {
  /** VLSFO consumption in metric tons */
  vlsfo: number;
  /** LSMGO consumption in metric tons */
  lsmgo: number;
  /** Total consumption in metric tons */
  total: number;
  /** Human-readable explanation of the calculation */
  explanation: string;
}

/**
 * Result of segment consumption calculation
 * Extends ConsumptionResult with segment-specific details
 */
export interface SegmentConsumptionResult extends ConsumptionResult {
  /** Time taken for the segment in hours */
  time_hours: number;
  /** Distance of the segment in nautical miles */
  distance_nm: number;
  /** Time taken for the segment in days */
  time_days: number;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Error thrown for invalid base consumption values
 */
export class InvalidConsumptionError extends Error {
  constructor(
    public readonly field: string,
    public readonly value: number,
    public readonly reason: string
  ) {
    super(`Invalid consumption value for ${field}: ${value}. Reason: ${reason}`);
    this.name = 'InvalidConsumptionError';
  }
}

/**
 * Error thrown for invalid weather factor
 */
export class InvalidWeatherFactorError extends Error {
  constructor(
    public readonly value: number,
    public readonly reason: string
  ) {
    super(`Invalid weather factor: ${value}. Reason: ${reason}`);
    this.name = 'InvalidWeatherFactorError';
  }
}

/**
 * Error thrown for invalid ECA flag
 */
export class InvalidECAFlagError extends Error {
  constructor(
    public readonly value: any,
    public readonly reason: string
  ) {
    super(`Invalid ECA flag: ${value}. Reason: ${reason}`);
    this.name = 'InvalidECAFlagError';
  }
}

// ============================================================================
// ENGINE INTERFACE
// ============================================================================

/**
 * ECA Consumption Engine Interface
 */
export interface ECAConsumptionEngine {
  /**
   * Calculate daily consumption based on ECA status
   */
  calculateConsumption(params: {
    base_vlsfo_per_day: number;
    base_lsmgo_per_day: number;
    is_in_eca: boolean;
    weather_factor: number;
  }): ConsumptionResult;

  /**
   * Calculate consumption for a route segment
   */
  calculateSegmentConsumption(params: {
    segment: RouteSegment;
    base_consumption: {
      vlsfo_per_day: number;
      lsmgo_per_day: number;
    };
  }): SegmentConsumptionResult;
}

// ============================================================================
// ENGINE IMPLEMENTATION
// ============================================================================

/**
 * ECA Consumption Engine Implementation
 * 
 * Implements the critical business rule that VLSFO is REPLACED by LSMGO
 * in ECA zones, not added. Total consumption remains constant.
 */
export class ECAConsumptionEngineImpl implements ECAConsumptionEngine {
  /**
   * Calculate daily consumption based on ECA status
   * 
   * Formula:
   * - Outside ECA: VLSFO = base_vlsfo * weather_factor, LSMGO = base_lsmgo * weather_factor
   * - Inside ECA: VLSFO = 0, LSMGO = (base_vlsfo + base_lsmgo) * weather_factor
   * 
   * CRITICAL: In ECA zones, VLSFO consumption is REPLACED by LSMGO, not added.
   * The total consumption remains the same, only the fuel type distribution changes.
   * 
   * @param params - Consumption calculation parameters
   * @returns ConsumptionResult with VLSFO, LSMGO, total, and explanation
   * @throws InvalidConsumptionError - If base consumption values are invalid
   * @throws InvalidWeatherFactorError - If weather factor is < 1.0
   * @throws InvalidECAFlagError - If ECA flag is not a boolean
   */
  calculateConsumption(params: {
    base_vlsfo_per_day: number;
    base_lsmgo_per_day: number;
    is_in_eca: boolean;
    weather_factor: number;
  }): ConsumptionResult {
    const {
      base_vlsfo_per_day,
      base_lsmgo_per_day,
      is_in_eca,
      weather_factor,
    } = params;

    // Input validation
    if (base_vlsfo_per_day <= 0) {
      throw new InvalidConsumptionError(
        'base_vlsfo_per_day',
        base_vlsfo_per_day,
        'Base VLSFO consumption must be positive'
      );
    }

    if (base_lsmgo_per_day <= 0) {
      throw new InvalidConsumptionError(
        'base_lsmgo_per_day',
        base_lsmgo_per_day,
        'Base LSMGO consumption must be positive'
      );
    }

    if (typeof is_in_eca !== 'boolean') {
      throw new InvalidECAFlagError(
        is_in_eca,
        'ECA flag must be a boolean value'
      );
    }

    if (weather_factor < 1.0) {
      throw new InvalidWeatherFactorError(
        weather_factor,
        'Weather factor must be >= 1.0 (represents increased consumption, never reduction)'
      );
    }

    // Calculate consumption based on ECA status
    let vlsfo: number;
    let lsmgo: number;
    let explanation: string;

    if (is_in_eca) {
      // Inside ECA: VLSFO is REPLACED by LSMGO (not added)
      vlsfo = 0;
      lsmgo = (base_vlsfo_per_day + base_lsmgo_per_day) * weather_factor;
      
      explanation = `Inside ECA: VLSFO consumption is REPLACED by LSMGO. ` +
        `Base consumption (${base_vlsfo_per_day.toFixed(2)} MT/day VLSFO + ${base_lsmgo_per_day.toFixed(2)} MT/day LSMGO) ` +
        `= ${(base_vlsfo_per_day + base_lsmgo_per_day).toFixed(2)} MT/day total. ` +
        `With weather factor ${weather_factor.toFixed(2)}: ` +
        `VLSFO = 0 MT/day (switched off), LSMGO = ${lsmgo.toFixed(2)} MT/day (replaces VLSFO).`;
    } else {
      // Outside ECA: Normal consumption
      vlsfo = base_vlsfo_per_day * weather_factor;
      lsmgo = base_lsmgo_per_day * weather_factor;
      
      explanation = `Outside ECA: Normal consumption. ` +
        `VLSFO = ${base_vlsfo_per_day.toFixed(2)} MT/day × ${weather_factor.toFixed(2)} = ${vlsfo.toFixed(2)} MT/day. ` +
        `LSMGO = ${base_lsmgo_per_day.toFixed(2)} MT/day × ${weather_factor.toFixed(2)} = ${lsmgo.toFixed(2)} MT/day.`;
    }

    const total = vlsfo + lsmgo;

    // Validate total consumption is positive
    if (total <= 0) {
      throw new InvalidConsumptionError(
        'total',
        total,
        'Total consumption must be positive'
      );
    }

    return {
      vlsfo,
      lsmgo,
      total,
      explanation,
    };
  }

  /**
   * Calculate consumption for a route segment
   * 
   * Calculates consumption over a route segment by:
   * 1. Getting daily consumption rates from calculateConsumption()
   * 2. Multiplying by time_days to get segment consumption
   * 
   * @param params - Segment consumption calculation parameters
   * @returns SegmentConsumptionResult with consumption and segment details
   * @throws InvalidConsumptionError - If base consumption values are invalid
   * @throws InvalidWeatherFactorError - If weather factor is < 1.0
   * @throws InvalidECAFlagError - If ECA flag is not a boolean
   */
  calculateSegmentConsumption(params: {
    segment: RouteSegment;
    base_consumption: {
      vlsfo_per_day: number;
      lsmgo_per_day: number;
    };
  }): SegmentConsumptionResult {
    const { segment, base_consumption } = params;

    // Validate segment
    if (segment.distance_nm < 0) {
      throw new InvalidConsumptionError(
        'segment.distance_nm',
        segment.distance_nm,
        'Distance must be non-negative'
      );
    }

    if (segment.time_hours < 0) {
      throw new InvalidConsumptionError(
        'segment.time_hours',
        segment.time_hours,
        'Time must be non-negative'
      );
    }

    // Calculate daily consumption
    const dailyConsumption = this.calculateConsumption({
      base_vlsfo_per_day: base_consumption.vlsfo_per_day,
      base_lsmgo_per_day: base_consumption.lsmgo_per_day,
      is_in_eca: segment.is_in_eca,
      weather_factor: segment.weather_factor,
    });

    // Calculate time in days
    const time_days = segment.time_hours / 24;

    // Calculate segment consumption
    const vlsfo = dailyConsumption.vlsfo * time_days;
    const lsmgo = dailyConsumption.lsmgo * time_days;
    const total = dailyConsumption.total * time_days;

    // Build explanation
    const explanation = `Segment consumption: ${dailyConsumption.explanation} ` +
      `Applied over ${time_days.toFixed(3)} days (${segment.time_hours.toFixed(2)} hours): ` +
      `VLSFO = ${vlsfo.toFixed(2)} MT, LSMGO = ${lsmgo.toFixed(2)} MT, Total = ${total.toFixed(2)} MT.`;

    return {
      vlsfo,
      lsmgo,
      total,
      explanation,
      time_hours: segment.time_hours,
      distance_nm: segment.distance_nm,
      time_days,
    };
  }
}

// ============================================================================
// EXPORT DEFAULT INSTANCE
// ============================================================================

/**
 * Default ECA consumption engine instance
 */
export const ecaConsumptionEngine = new ECAConsumptionEngineImpl();

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Example 1: Calculate daily consumption outside ECA
 * 
 * ```typescript
 * const engine = new ECAConsumptionEngineImpl();
 * 
 * const result = engine.calculateConsumption({
 *   base_vlsfo_per_day: 20,
 *   base_lsmgo_per_day: 1,
 *   is_in_eca: false,
 *   weather_factor: 1.0,
 * });
 * 
 * console.log(`VLSFO: ${result.vlsfo} MT/day`);
 * console.log(`LSMGO: ${result.lsmgo} MT/day`);
 * console.log(`Total: ${result.total} MT/day`);
 * // Output: VLSFO: 20 MT/day, LSMGO: 1 MT/day, Total: 21 MT/day
 * ```
 */

/**
 * Example 2: Calculate daily consumption inside ECA (fuel replacement)
 * 
 * ```typescript
 * const engine = new ECAConsumptionEngineImpl();
 * 
 * const result = engine.calculateConsumption({
 *   base_vlsfo_per_day: 20,
 *   base_lsmgo_per_day: 1,
 *   is_in_eca: true,
 *   weather_factor: 1.0,
 * });
 * 
 * console.log(`VLSFO: ${result.vlsfo} MT/day`);
 * console.log(`LSMGO: ${result.lsmgo} MT/day`);
 * console.log(`Total: ${result.total} MT/day`);
 * // Output: VLSFO: 0 MT/day, LSMGO: 21 MT/day, Total: 21 MT/day
 * // Note: Total is the same, VLSFO is REPLACED by LSMGO
 * ```
 */

/**
 * Example 3: Calculate consumption with weather factor
 * 
 * ```typescript
 * const engine = new ECAConsumptionEngineImpl();
 * 
 * const result = engine.calculateConsumption({
 *   base_vlsfo_per_day: 20,
 *   base_lsmgo_per_day: 1,
 *   is_in_eca: false,
 *   weather_factor: 1.2, // 20% increase due to weather
 * });
 * 
 * console.log(`VLSFO: ${result.vlsfo} MT/day`);
 * console.log(`LSMGO: ${result.lsmgo} MT/day`);
 * console.log(`Total: ${result.total} MT/day`);
 * // Output: VLSFO: 24 MT/day, LSMGO: 1.2 MT/day, Total: 25.2 MT/day
 * ```
 */

/**
 * Example 4: Calculate segment consumption
 * 
 * ```typescript
 * const engine = new ECAConsumptionEngineImpl();
 * 
 * const segment: RouteSegment = {
 *   distance_nm: 336, // 1 day at 14 knots
 *   time_hours: 24,
 *   is_in_eca: true,
 *   weather_factor: 1.0,
 *   segment_id: 'segment_1',
 * };
 * 
 * const result = engine.calculateSegmentConsumption({
 *   segment,
 *   base_consumption: {
 *     vlsfo_per_day: 20,
 *     lsmgo_per_day: 1,
 *   },
 * });
 * 
 * console.log(`Segment consumption: VLSFO=${result.vlsfo} MT, LSMGO=${result.lsmgo} MT`);
 * // Output: VLSFO=0 MT, LSMGO=21 MT (VLSFO replaced in ECA)
 * ```
 */

/**
 * Example 5: Error handling
 * 
 * ```typescript
 * const engine = new ECAConsumptionEngineImpl();
 * 
 * try {
 *   const result = engine.calculateConsumption({
 *     base_vlsfo_per_day: -10, // Invalid: negative
 *     base_lsmgo_per_day: 1,
 *     is_in_eca: false,
 *     weather_factor: 1.0,
 *   });
 * } catch (error) {
 *   if (error instanceof InvalidConsumptionError) {
 *     console.error(`Invalid consumption: ${error.message}`);
 *   }
 * }
 * ```
 */

