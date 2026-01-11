/**
 * Deviation Calculator Tool
 * 
 * Calculates deviation cost for bunkering at a port off the main route.
 * Includes deviation distance, time, fuel consumption, and cost.
 */

import { z } from 'zod';
import { costCalculationEngine, FuelPrices, DeviationParams } from '../engines/cost-calculation-engine';
import { BunkerQuantity } from '../engines/capacity-validation-engine';

/**
 * Input for deviation cost calculation
 */
export interface DeviationCalculatorInput {
  /** Deviation distance in nautical miles (one-way) */
  deviation_distance_nm: number;
  /** Vessel speed in knots */
  vessel_speed_knots: number;
  /** Daily consumption rates */
  consumption: {
    vlsfo_per_day: number;
    lsmgo_per_day: number;
  };
  /** Fuel prices per MT */
  fuel_prices: FuelPrices;
  /** Weather adjustment factor */
  weather_factor?: number;
  /** Whether deviation is in ECA zone */
  is_in_eca?: boolean;
  /** Currency (default: USD) */
  currency?: string;
}

/**
 * Output from deviation cost calculation
 */
export interface DeviationCalculatorOutput {
  /** Deviation distance (round trip) in nautical miles */
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
  deviation_cost: {
    vlsfo: number;
    lsmgo: number;
    total: number;
  };
  /** Currency */
  currency: string;
  /** Summary message */
  summary: string;
}

/**
 * Tool schema for calculate_deviation_cost
 */
export const deviationCalculatorToolSchema = {
  name: 'calculate_deviation_cost',
  description: 'Calculate the cost of deviating from the main route to reach a bunker port. Includes deviation distance (round trip), time, fuel consumption, and cost. Accounts for ECA zones and weather adjustments.',
  input_schema: {
    type: 'object',
    properties: {
      deviation_distance_nm: {
        type: 'number',
        description: 'Deviation distance in nautical miles (one-way)',
      },
      vessel_speed_knots: {
        type: 'number',
        description: 'Vessel speed in knots',
      },
      consumption: {
        type: 'object',
        properties: {
          vlsfo_per_day: { type: 'number', description: 'VLSFO consumption per day in MT' },
          lsmgo_per_day: { type: 'number', description: 'LSMGO consumption per day in MT' },
        },
        required: ['vlsfo_per_day', 'lsmgo_per_day'],
      },
      fuel_prices: {
        type: 'object',
        properties: {
          vlsfo_per_mt: { type: 'number', description: 'VLSFO price per MT' },
          lsmgo_per_mt: { type: 'number', description: 'LSMGO price per MT' },
        },
        required: ['vlsfo_per_mt', 'lsmgo_per_mt'],
      },
      weather_factor: {
        type: 'number',
        description: 'Weather adjustment factor (default: 1.0)',
        default: 1.0,
      },
      is_in_eca: {
        type: 'boolean',
        description: 'Whether deviation is in ECA zone (default: false)',
        default: false,
      },
      currency: {
        type: 'string',
        description: 'Currency code (default: USD)',
        default: 'USD',
      },
    },
    required: ['deviation_distance_nm', 'vessel_speed_knots', 'consumption', 'fuel_prices'],
  },
} as const;

/**
 * Execute calculate_deviation_cost tool
 */
export async function executeDeviationCalculatorTool(
  input: unknown
): Promise<DeviationCalculatorOutput> {
  const params = input as DeviationCalculatorInput;
  const {
    deviation_distance_nm,
    vessel_speed_knots,
    consumption,
    fuel_prices,
    weather_factor = 1.0,
    is_in_eca = false,
    currency = 'USD',
  } = params;

  // Use cost calculation engine with zero bunker quantity (only deviation cost)
  const result = costCalculationEngine.calculateCost({
    bunker_quantity: { vlsfo: 0, lsmgo: 0 },
    fuel_prices,
    deviation: {
      distance_nm: deviation_distance_nm,
      vessel_speed_knots,
      consumption,
      weather_factor,
      is_in_eca,
    },
    currency,
  });

  return {
    deviation_distance_nm: result.breakdown.deviation_distance_nm,
    deviation_hours: result.breakdown.deviation_hours,
    deviation_days: result.breakdown.deviation_days,
    deviation_consumption: result.breakdown.deviation_consumption,
    deviation_cost: result.breakdown.deviation_fuel_cost,
    currency,
    summary: `Deviation cost: ${currency} ${result.breakdown.deviation_fuel_cost.total.toFixed(2)} ` +
      `(Distance: ${result.breakdown.deviation_distance_nm.toFixed(1)} nm, ` +
      `Time: ${result.breakdown.deviation_hours.toFixed(1)} hours, ` +
      `Fuel: ${result.breakdown.deviation_consumption.total.toFixed(2)} MT)`,
  };
}

