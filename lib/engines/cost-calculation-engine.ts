/**
 * Cost Calculation Engine
 * 
 * Calculates total bunker cost including:
 * - Direct fuel cost (quantity × price)
 * - Deviation cost (fuel consumed during deviation)
 * 
 * Supports multi-fuel type calculations (VLSFO + LSMGO).
 */

import { BunkerQuantity, TankCapacity } from './capacity-validation-engine';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Fuel prices per metric ton
 */
export interface FuelPrices {
  /** VLSFO price per MT */
  vlsfo_per_mt: number;
  /** LSMGO price per MT */
  lsmgo_per_mt: number;
}

/**
 * Deviation parameters
 */
export interface DeviationParams {
  /** Deviation distance in nautical miles (one-way) */
  distance_nm: number;
  /** Vessel speed in knots */
  vessel_speed_knots: number;
  /** Daily consumption rates */
  consumption: {
    vlsfo_per_day: number;
    lsmgo_per_day: number;
  };
  /** Weather adjustment factor */
  weather_factor: number;
  /** Whether deviation is in ECA zone */
  is_in_eca: boolean;
}

/**
 * Cost breakdown
 */
export interface CostBreakdown {
  /** Direct fuel cost (quantity × price) */
  fuel_cost: {
    vlsfo: number;
    lsmgo: number;
    total: number;
  };
  /** Deviation distance (round trip) */
  deviation_distance_nm: number;
  /** Deviation time in hours */
  deviation_hours: number;
  /** Deviation time in days */
  deviation_days: number;
  /** Fuel consumed during deviation */
  deviation_consumption: {
    vlsfo: number;
    lsmgo: number;
    total: number;
  };
  /** Cost of fuel consumed during deviation */
  deviation_fuel_cost: {
    vlsfo: number;
    lsmgo: number;
    total: number;
  };
  /** Total cost (fuel cost + deviation cost) */
  total_cost: number;
  /** Currency */
  currency: string;
}

/**
 * Cost calculation result
 */
export interface CostCalculationResult {
  /** Detailed cost breakdown */
  breakdown: CostBreakdown;
  /** Summary message */
  summary: string;
}

// ============================================================================
// ENGINE INTERFACE
// ============================================================================

/**
 * Cost Calculation Engine Interface
 */
export interface CostCalculationEngine {
  /**
   * Calculate total bunker cost
   */
  calculateCost(params: {
    bunker_quantity: BunkerQuantity;
    fuel_prices: FuelPrices;
    deviation: DeviationParams;
    currency?: string;
  }): CostCalculationResult;
}

// ============================================================================
// ENGINE IMPLEMENTATION
// ============================================================================

/**
 * Cost Calculation Engine Implementation
 */
export class CostCalculationEngineImpl implements CostCalculationEngine {
  /**
   * Calculate total bunker cost
   * 
   * Formula:
   * - Fuel cost = quantity × price (for each fuel type)
   * - Deviation distance = distance_nm × 2 (round trip)
   * - Deviation time = deviation_distance / speed
   * - Deviation consumption = consumption_rate × deviation_time × weather_factor
   * - Deviation cost = deviation_consumption × fuel_price
   * - Total cost = fuel_cost + deviation_cost
   */
  calculateCost(params: {
    bunker_quantity: BunkerQuantity;
    fuel_prices: FuelPrices;
    deviation: DeviationParams;
    currency?: string;
  }): CostCalculationResult {
    const {
      bunker_quantity,
      fuel_prices,
      deviation,
      currency = 'USD',
    } = params;

    // Input validation
    if (bunker_quantity.vlsfo < 0 || bunker_quantity.lsmgo < 0) {
      throw new Error('Bunker quantity cannot be negative');
    }
    if (fuel_prices.vlsfo_per_mt <= 0 || fuel_prices.lsmgo_per_mt <= 0) {
      throw new Error('Fuel prices must be positive');
    }
    if (deviation.distance_nm < 0) {
      throw new Error('Deviation distance cannot be negative');
    }
    if (deviation.vessel_speed_knots <= 0) {
      throw new Error('Vessel speed must be positive');
    }
    if (deviation.consumption.vlsfo_per_day < 0 || deviation.consumption.lsmgo_per_day < 0) {
      throw new Error('Consumption rates cannot be negative');
    }
    if (deviation.weather_factor < 1.0) {
      throw new Error('Weather factor must be >= 1.0');
    }

    // Calculate direct fuel cost
    const fuel_cost_vlsfo = bunker_quantity.vlsfo * fuel_prices.vlsfo_per_mt;
    const fuel_cost_lsmgo = bunker_quantity.lsmgo * fuel_prices.lsmgo_per_mt;
    const fuel_cost_total = fuel_cost_vlsfo + fuel_cost_lsmgo;

    // Calculate deviation (round trip)
    const deviation_distance_nm = deviation.distance_nm * 2;
    const deviation_hours = deviation_distance_nm / deviation.vessel_speed_knots;
    const deviation_days = deviation_hours / 24;

    // Calculate deviation consumption
    // Use ECA consumption logic: if in ECA, VLSFO = 0, LSMGO = vlsfo + lsmgo
    let deviation_consumption_vlsfo: number;
    let deviation_consumption_lsmgo: number;

    if (deviation.is_in_eca) {
      // Inside ECA: VLSFO = 0, LSMGO replaces VLSFO
      deviation_consumption_vlsfo = 0;
      deviation_consumption_lsmgo = 
        (deviation.consumption.vlsfo_per_day + deviation.consumption.lsmgo_per_day) *
        deviation_days *
        deviation.weather_factor;
    } else {
      // Outside ECA: Normal consumption
      deviation_consumption_vlsfo = 
        deviation.consumption.vlsfo_per_day *
        deviation_days *
        deviation.weather_factor;
      deviation_consumption_lsmgo = 
        deviation.consumption.lsmgo_per_day *
        deviation_days *
        deviation.weather_factor;
    }

    const deviation_consumption_total = deviation_consumption_vlsfo + deviation_consumption_lsmgo;

    // Calculate deviation fuel cost
    const deviation_fuel_cost_vlsfo = deviation_consumption_vlsfo * fuel_prices.vlsfo_per_mt;
    const deviation_fuel_cost_lsmgo = deviation_consumption_lsmgo * fuel_prices.lsmgo_per_mt;
    const deviation_fuel_cost_total = deviation_fuel_cost_vlsfo + deviation_fuel_cost_lsmgo;

    // Calculate total cost
    const total_cost = fuel_cost_total + deviation_fuel_cost_total;

    // Generate summary
    const summary = 
      `Total cost: ${currency} ${total_cost.toFixed(2)} ` +
      `(Fuel: ${currency} ${fuel_cost_total.toFixed(2)}, ` +
      `Deviation: ${currency} ${deviation_fuel_cost_total.toFixed(2)})`;

    return {
      breakdown: {
        fuel_cost: {
          vlsfo: fuel_cost_vlsfo,
          lsmgo: fuel_cost_lsmgo,
          total: fuel_cost_total,
        },
        deviation_distance_nm,
        deviation_hours,
        deviation_days,
        deviation_consumption: {
          vlsfo: deviation_consumption_vlsfo,
          lsmgo: deviation_consumption_lsmgo,
          total: deviation_consumption_total,
        },
        deviation_fuel_cost: {
          vlsfo: deviation_fuel_cost_vlsfo,
          lsmgo: deviation_fuel_cost_lsmgo,
          total: deviation_fuel_cost_total,
        },
        total_cost,
        currency,
      },
      summary,
    };
  }
}

// ============================================================================
// EXPORT DEFAULT INSTANCE
// ============================================================================

/**
 * Default cost calculation engine instance
 */
export const costCalculationEngine = new CostCalculationEngineImpl();

