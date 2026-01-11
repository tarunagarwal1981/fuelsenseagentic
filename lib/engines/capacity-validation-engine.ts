/**
 * Capacity Validation Engine
 * 
 * Validates bunker quantities fit in available tank capacity.
 * Ensures ROB + bunker quantity <= tank capacity for each fuel type.
 */

import { ROB } from './rob-tracking-engine';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Tank capacity for fuel types
 */
export interface TankCapacity {
  /** VLSFO tank capacity in metric tons */
  vlsfo: number;
  /** LSMGO tank capacity in metric tons */
  lsmgo: number;
}

/**
 * Bunker quantity request
 */
export interface BunkerQuantity {
  /** VLSFO quantity in metric tons */
  vlsfo: number;
  /** LSMGO quantity in metric tons */
  lsmgo: number;
}

/**
 * Capacity validation result
 */
export interface CapacityValidationResult {
  /** Whether all quantities fit */
  fits: boolean;
  /** Available capacity for each fuel type */
  available_capacity: TankCapacity;
  /** ROB after bunkering */
  rob_after_bunker: ROB;
  /** Validation details per fuel type */
  validations: {
    vlsfo: {
      fits: boolean;
      current_rob: number;
      requested_quantity: number;
      available_capacity: number;
      rob_after: number;
      exceeds_by?: number;
    };
    lsmgo: {
      fits: boolean;
      current_rob: number;
      requested_quantity: number;
      available_capacity: number;
      rob_after: number;
      exceeds_by?: number;
    };
  };
  /** Suggestions if capacity exceeded */
  suggestions: string[];
  /** Warnings */
  warnings: string[];
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Error thrown when capacity is exceeded
 */
export class CapacityExceededError extends Error {
  constructor(
    public readonly fuel_type: 'VLSFO' | 'LSMGO',
    public readonly requested: number,
    public readonly available: number,
    public readonly exceeds_by: number
  ) {
    super(`Capacity exceeded for ${fuel_type}: Requested ${requested.toFixed(2)}MT, Available ${available.toFixed(2)}MT, Exceeds by ${exceeds_by.toFixed(2)}MT`);
    this.name = 'CapacityExceededError';
  }
}

// ============================================================================
// ENGINE INTERFACE
// ============================================================================

/**
 * Capacity Validation Engine Interface
 */
export interface CapacityValidationEngine {
  /**
   * Validate bunker quantity fits in available capacity
   */
  validateCapacity(params: {
    current_rob: ROB;
    bunker_quantity: BunkerQuantity;
    tank_capacity: TankCapacity;
  }): CapacityValidationResult;
}

// ============================================================================
// ENGINE IMPLEMENTATION
// ============================================================================

/**
 * Capacity Validation Engine Implementation
 */
export class CapacityValidationEngineImpl implements CapacityValidationEngine {
  /**
   * Validate bunker quantity fits in available capacity
   * 
   * Checks:
   * - ROB + bunker quantity <= tank capacity for each fuel type
   * - Generates suggestions if capacity exceeded
   * - Calculates available capacity
   */
  validateCapacity(params: {
    current_rob: ROB;
    bunker_quantity: BunkerQuantity;
    tank_capacity: TankCapacity;
  }): CapacityValidationResult {
    const { current_rob, bunker_quantity, tank_capacity } = params;

    // Input validation
    if (current_rob.vlsfo < 0 || current_rob.lsmgo < 0) {
      throw new Error('Current ROB cannot be negative');
    }
    if (bunker_quantity.vlsfo < 0 || bunker_quantity.lsmgo < 0) {
      throw new Error('Bunker quantity cannot be negative');
    }
    if (tank_capacity.vlsfo <= 0 || tank_capacity.lsmgo <= 0) {
      throw new Error('Tank capacity must be positive');
    }

    // Calculate available capacity
    const available_capacity: TankCapacity = {
      vlsfo: tank_capacity.vlsfo - current_rob.vlsfo,
      lsmgo: tank_capacity.lsmgo - current_rob.lsmgo,
    };

    // Calculate ROB after bunkering
    const rob_after_bunker: ROB = {
      vlsfo: current_rob.vlsfo + bunker_quantity.vlsfo,
      lsmgo: current_rob.lsmgo + bunker_quantity.lsmgo,
    };

    // Validate VLSFO
    const vlsfo_fits = rob_after_bunker.vlsfo <= tank_capacity.vlsfo;
    const vlsfo_exceeds_by = vlsfo_fits ? undefined : rob_after_bunker.vlsfo - tank_capacity.vlsfo;

    // Validate LSMGO
    const lsmgo_fits = rob_after_bunker.lsmgo <= tank_capacity.lsmgo;
    const lsmgo_exceeds_by = lsmgo_fits ? undefined : rob_after_bunker.lsmgo - tank_capacity.lsmgo;

    const fits = vlsfo_fits && lsmgo_fits;

    // Generate suggestions if capacity exceeded
    const suggestions: string[] = [];
    if (!fits) {
      if (!vlsfo_fits) {
        suggestions.push(`Reduce VLSFO quantity to ${available_capacity.vlsfo.toFixed(2)}MT (available capacity)`);
      }
      if (!lsmgo_fits) {
        suggestions.push(`Reduce LSMGO quantity to ${available_capacity.lsmgo.toFixed(2)}MT (available capacity)`);
      }
      if (!vlsfo_fits && !lsmgo_fits) {
        suggestions.push('Split bunkering across two ports');
        suggestions.push('Bunker at earlier port with more capacity');
      }
    }

    // Generate warnings
    const warnings: string[] = [];
    const vlsfo_utilization = (rob_after_bunker.vlsfo / tank_capacity.vlsfo) * 100;
    const lsmgo_utilization = (rob_after_bunker.lsmgo / tank_capacity.lsmgo) * 100;

    if (vlsfo_utilization > 90) {
      warnings.push(`High VLSFO tank utilization: ${vlsfo_utilization.toFixed(1)}%`);
    }
    if (lsmgo_utilization > 90) {
      warnings.push(`High LSMGO tank utilization: ${lsmgo_utilization.toFixed(1)}%`);
    }

    return {
      fits,
      available_capacity,
      rob_after_bunker,
      validations: {
        vlsfo: {
          fits: vlsfo_fits,
          current_rob: current_rob.vlsfo,
          requested_quantity: bunker_quantity.vlsfo,
          available_capacity: available_capacity.vlsfo,
          rob_after: rob_after_bunker.vlsfo,
          exceeds_by: vlsfo_exceeds_by,
        },
        lsmgo: {
          fits: lsmgo_fits,
          current_rob: current_rob.lsmgo,
          requested_quantity: bunker_quantity.lsmgo,
          available_capacity: available_capacity.lsmgo,
          rob_after: rob_after_bunker.lsmgo,
          exceeds_by: lsmgo_exceeds_by,
        },
      },
      suggestions,
      warnings,
    };
  }
}

// ============================================================================
// EXPORT DEFAULT INSTANCE
// ============================================================================

/**
 * Default capacity validation engine instance
 */
export const capacityValidationEngine = new CapacityValidationEngineImpl();

