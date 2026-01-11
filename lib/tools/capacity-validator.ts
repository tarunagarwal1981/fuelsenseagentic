/**
 * Capacity Validator Tool
 * 
 * Tool wrapper for Capacity Validation Engine.
 * Validates bunker quantities fit in available tank capacity.
 */

import { z } from 'zod';
import {
  capacityValidationEngine,
  CapacityValidationResult,
  TankCapacity,
  BunkerQuantity,
} from '../engines/capacity-validation-engine';
import { ROB } from '../engines/rob-tracking-engine';

/**
 * Input for capacity validation
 */
export interface CapacityValidatorInput {
  /** Current ROB */
  current_rob: ROB;
  /** Bunker quantity requested */
  bunker_quantity: BunkerQuantity;
  /** Tank capacity */
  tank_capacity: TankCapacity;
}

/**
 * Output from capacity validation
 */
export interface CapacityValidatorOutput extends CapacityValidationResult {}

/**
 * Tool schema for validate_bunker_capacity
 */
export const capacityValidatorToolSchema = {
  name: 'validate_bunker_capacity',
  description: 'Validate if requested bunker quantities fit in available tank capacity. Checks that ROB + bunker quantity <= tank capacity for each fuel type. Returns validation result with suggestions if capacity is exceeded.',
  input_schema: {
    type: 'object',
    properties: {
      current_rob: {
        type: 'object',
        properties: {
          vlsfo: { type: 'number', description: 'Current VLSFO ROB in MT' },
          lsmgo: { type: 'number', description: 'Current LSMGO ROB in MT' },
        },
        required: ['vlsfo', 'lsmgo'],
      },
      bunker_quantity: {
        type: 'object',
        properties: {
          vlsfo: { type: 'number', description: 'Requested VLSFO quantity in MT' },
          lsmgo: { type: 'number', description: 'Requested LSMGO quantity in MT' },
        },
        required: ['vlsfo', 'lsmgo'],
      },
      tank_capacity: {
        type: 'object',
        properties: {
          vlsfo: { type: 'number', description: 'VLSFO tank capacity in MT' },
          lsmgo: { type: 'number', description: 'LSMGO tank capacity in MT' },
        },
        required: ['vlsfo', 'lsmgo'],
      },
    },
    required: ['current_rob', 'bunker_quantity', 'tank_capacity'],
  },
} as const;

/**
 * Execute validate_bunker_capacity tool
 */
export async function executeCapacityValidatorTool(
  input: unknown
): Promise<CapacityValidatorOutput> {
  const params = input as CapacityValidatorInput;
  return capacityValidationEngine.validateCapacity(params);
}

