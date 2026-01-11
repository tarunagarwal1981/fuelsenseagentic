/**
 * Fuel Availability Tool
 * 
 * Checks if required fuel types are available at a port.
 * Validates port fuel capabilities match requirements.
 */

import { z } from 'zod';
import { FuelType, Port } from '../types';

/**
 * Input for fuel availability check
 */
export interface FuelAvailabilityInput {
  /** Port to check */
  port: Port;
  /** Required fuel types */
  required_fuel_types: FuelType[];
}

/**
 * Output from fuel availability check
 */
export interface FuelAvailabilityOutput {
  /** Whether all required fuel types are available */
  available: boolean;
  /** Port code */
  port_code: string;
  /** Port name */
  port_name: string;
  /** Available fuel types at port */
  available_fuel_types: FuelType[];
  /** Required fuel types */
  required_fuel_types: FuelType[];
  /** Missing fuel types (if any) */
  missing_fuel_types: FuelType[];
  /** Availability status per fuel type */
  fuel_status: Record<FuelType, {
    required: boolean;
    available: boolean;
  }>;
  /** Message explaining availability */
  message: string;
}

/**
 * Tool schema for check_fuel_availability
 */
export const fuelAvailabilityToolSchema = {
  name: 'check_fuel_availability',
  description: 'Check if required fuel types are available at a port. Validates that the port\'s fuel capabilities match the required fuel types. Returns availability status and any missing fuel types.',
  input_schema: {
    type: 'object',
    properties: {
      port: {
        type: 'object',
        properties: {
          port_code: { type: 'string' },
          name: { type: 'string' },
          country: { type: 'string' },
          coordinates: {
            type: 'object',
            properties: {
              lat: { type: 'number' },
              lon: { type: 'number' },
            },
          },
          fuel_capabilities: {
            type: 'array',
            items: { type: 'string', enum: ['VLSFO', 'LSGO', 'MGO'] },
          },
        },
        required: ['port_code', 'name', 'fuel_capabilities'],
      },
      required_fuel_types: {
        type: 'array',
        items: { type: 'string', enum: ['VLSFO', 'LSGO', 'MGO'] },
        description: 'Array of required fuel types',
      },
    },
    required: ['port', 'required_fuel_types'],
  },
} as const;

/**
 * Execute check_fuel_availability tool
 */
export async function executeFuelAvailabilityTool(
  input: unknown
): Promise<FuelAvailabilityOutput> {
  const params = input as FuelAvailabilityInput;
  const { port, required_fuel_types } = params;

  // Initialize fuel status for all fuel types
  const fuel_status: Record<string, { required: boolean; available: boolean }> = {
    VLSFO: { required: false, available: port.fuel_capabilities.includes('VLSFO') },
    LSGO: { required: false, available: port.fuel_capabilities.includes('LSGO') },
    MGO: { required: false, available: port.fuel_capabilities.includes('MGO') },
  };

  // Mark required types
  for (const fuelType of required_fuel_types) {
    if (fuel_status[fuelType]) {
      fuel_status[fuelType].required = true;
    }
  }

  // Find missing fuel types
  const missing_fuel_types: FuelType[] = required_fuel_types.filter(
    fuelType => !port.fuel_capabilities.includes(fuelType)
  );

  const available = missing_fuel_types.length === 0;

  // Generate message
  let message: string;
  if (available) {
    message = `All required fuel types (${required_fuel_types.join(', ')}) are available at ${port.name}`;
  } else {
    message = `Missing fuel types at ${port.name}: ${missing_fuel_types.join(', ')}. Available: ${port.fuel_capabilities.join(', ')}`;
  }

  return {
    available,
    port_code: port.port_code,
    port_name: port.name,
    available_fuel_types: port.fuel_capabilities,
    required_fuel_types,
    missing_fuel_types,
    fuel_status,
    message,
  };
}

