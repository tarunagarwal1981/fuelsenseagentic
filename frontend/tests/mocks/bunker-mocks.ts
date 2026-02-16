/**
 * Mock data factory for bunker agent and related services.
 * Provides realistic shapes matching API responses and agent state.
 */

import type {
  VesselSpecs,
  ROBSnapshot,
  BunkerPricing,
  BunkerPortOption,
  VoyageTarget,
  VesselInputForComparison,
  BunkerRequirement,
} from '@/lib/types/bunker';
import type { Port } from '@/lib/types';

const ISO_NOW = new Date().toISOString();

export interface MockVesselSpecsOverrides {
  vesselId?: string;
  vesselName?: string;
  consumptionRate?: number;
  tankCapacity?: number;
  currentPosition?: { lat: number; lon: number };
}

export function mockVesselSpecs(overrides: MockVesselSpecsOverrides = {}): VesselSpecs {
  return {
    vesselId: overrides.vesselId ?? 'IMO9123456',
    vesselName: overrides.vesselName ?? 'Mock Vessel Alpha',
    vesselType: 'Bulk',
    consumptionRate: overrides.consumptionRate ?? 35,
    tankCapacity: overrides.tankCapacity ?? 2500,
    currentPosition: overrides.currentPosition ?? { lat: 1.26, lon: 103.82 },
    fuelCompatibility: ['VLSFO', 'LSMGO', 'MGO'],
  };
}

export interface MockROBSnapshotOverrides {
  vesselId?: string;
  totalROB?: number;
  robVLSFO?: number;
  robLSMGO?: number;
  robMGO?: number;
  timestamp?: string;
}

export function mockROBSnapshot(overrides: MockROBSnapshotOverrides = {}): ROBSnapshot {
  const robVLSFO = overrides.robVLSFO ?? overrides.totalROB ?? 800;
  const robMGO = overrides.robMGO ?? 50;
  const total = overrides.totalROB ?? robVLSFO + (overrides.robLSMGO ?? 0) + robMGO;
  return {
    vesselId: overrides.vesselId ?? 'IMO9123456',
    timestamp: overrides.timestamp ?? ISO_NOW,
    robVLSFO,
    robLSMGO: overrides.robLSMGO ?? 0,
    robMGO,
    totalROB: total,
    location: { lat: 1.26, lon: 103.82 },
  };
}

export interface MockBunkerPricingOverrides {
  port?: string;
  fuelType?: string;
  pricePerMT?: number;
  currency?: string;
  lastUpdated?: string;
}

export function mockBunkerPricing(overrides: MockBunkerPricingOverrides = {}): BunkerPricing {
  return {
    port: overrides.port ?? 'SGSIN',
    fuelType: overrides.fuelType ?? 'VLSFO',
    pricePerMT: overrides.pricePerMT ?? 520,
    currency: overrides.currency ?? 'USD',
    lastUpdated: overrides.lastUpdated ?? ISO_NOW,
    supplier: 'Mock Supplier',
    availableQuantity: 5000,
  };
}

export function mockBunkerPricingList(
  ports: string[] = ['SGSIN', 'AEFJR', 'NLRTM'],
  fuelType = 'VLSFO'
): BunkerPricing[] {
  const basePrices: Record<string, number> = { SGSIN: 520, AEFJR: 480, NLRTM: 550 };
  return ports.map((port) =>
    mockBunkerPricing({
      port,
      fuelType,
      pricePerMT: basePrices[port] ?? 500,
    })
  );
}

export interface MockRouteDataOverrides {
  origin_port_code?: string;
  destination_port_code?: string;
  distance_nm?: number;
  estimated_hours?: number;
  waypoints?: { lat: number; lon: number }[];
}

export function mockRouteData(overrides: MockRouteDataOverrides = {}): {
  origin_port_code: string;
  destination_port_code: string;
  distance_nm: number;
  estimated_hours: number;
  waypoints: { lat: number; lon: number }[];
  route_type?: string;
} {
  const waypoints =
    overrides.waypoints ??
    [
      { lat: 1.26, lon: 103.82 },
      { lat: 25.28, lon: 55.33 },
      { lat: 51.92, lon: 4.48 },
    ];
  return {
    origin_port_code: overrides.origin_port_code ?? 'SGSIN',
    destination_port_code: overrides.destination_port_code ?? 'NLRTM',
    distance_nm: overrides.distance_nm ?? 8500,
    estimated_hours: overrides.estimated_hours ?? 607,
    waypoints,
    route_type: 'sea',
  };
}

export function mockBunkerPortOption(overrides: Partial<BunkerPortOption> = {}): BunkerPortOption {
  return {
    port_code: overrides.port_code ?? 'SGSIN',
    port_name: overrides.port_name ?? 'Singapore',
    price_per_mt: overrides.price_per_mt ?? 520,
    deviation_nm: overrides.deviation_nm ?? 0,
    route_position: overrides.route_position,
  };
}

export function mockVoyageTarget(overrides: Partial<VoyageTarget> = {}): VoyageTarget {
  return {
    origin: overrides.origin ?? 'SGSIN',
    destination: overrides.destination ?? 'NLRTM',
    distance_nm: overrides.distance_nm ?? 8500,
    estimated_hours: overrides.estimated_hours ?? 607,
    laycan_start: overrides.laycan_start,
    laycan_end: overrides.laycan_end,
    origin_coordinates: overrides.origin_coordinates ?? { lat: 1.26, lon: 103.82 },
  };
}

export function mockVesselInputForComparison(
  overrides: Partial<VesselInputForComparison> = {}
): VesselInputForComparison {
  return {
    vesselId: overrides.vesselId ?? 'IMO9123456',
    vesselName: overrides.vesselName ?? 'Vessel Alpha',
    currentROB: overrides.currentROB ?? 800,
    consumptionRate: overrides.consumptionRate ?? 35,
    tankCapacity: overrides.tankCapacity ?? 2500,
    currentPosition: overrides.currentPosition ?? { lat: 1.26, lon: 103.82 },
  };
}

export function mockBunkerRequirement(overrides: Partial<BunkerRequirement> = {}): BunkerRequirement {
  return {
    voyageFuelConsumption: overrides.voyageFuelConsumption ?? 2500,
    requiredFuel: overrides.requiredFuel ?? 2875,
    bunkerQuantity: overrides.bunkerQuantity ?? 2075,
    needsBunkering: overrides.needsBunkering ?? true,
    safetyMarginApplied: overrides.safetyMarginApplied ?? 0.15,
    weatherFactorApplied: overrides.weatherFactorApplied ?? 1.1,
    ecaDistanceUsed: overrides.ecaDistanceUsed,
  };
}

export function mockPort(overrides: Partial<Port> = {}): Port {
  return {
    port_code: overrides.port_code ?? 'SGSIN',
    name: overrides.name ?? 'Singapore',
    country: overrides.country ?? 'SG',
    coordinates: overrides.coordinates ?? { lat: 1.26, lon: 103.82 },
    fuel_capabilities: overrides.fuel_capabilities ?? (['VLSFO', 'LSMGO', 'MGO'] as Port['fuel_capabilities']),
  };
}

/** Query type for mock agent state. */
export type BunkerQueryTypeForMock = 'SIMPLE_PORT_TO_PORT' | 'VESSEL_SPECIFIC' | 'FLEET_COMPARISON' | 'CONSTRAINT_FIRST';

export interface MockAgentStateOverrides {
  route_data?: unknown;
  messages?: unknown[];
  vessel_identifiers?: { imos?: string[]; names?: string[] };
  vessel_specs?: unknown;
  weather_consumption?: unknown;
  bunker_ports?: unknown;
  port_prices?: unknown;
}

/**
 * Build a minimal agent state shape for testing by query type.
 * Used to drive detectBunkerQuerySubtype and workflow routing.
 */
export function mockAgentState(
  type: BunkerQueryTypeForMock,
  overrides: MockAgentStateOverrides = {}
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    messages: overrides.messages ?? [],
    route_data: overrides.route_data ?? mockRouteData(),
    ...overrides,
  };

  switch (type) {
    case 'SIMPLE_PORT_TO_PORT':
      return {
        ...base,
        route_data: overrides.route_data ?? mockRouteData(),
        vessel_identifiers: undefined,
      };
    case 'VESSEL_SPECIFIC':
      return {
        ...base,
        vessel_identifiers: overrides.vessel_identifiers ?? { imos: ['IMO9123456'], names: [] },
      };
    case 'FLEET_COMPARISON':
      return {
        ...base,
        vessel_identifiers: overrides.vessel_identifiers ?? {
          imos: ['IMO9123456', 'IMO9234567'],
          names: [],
        },
      };
    case 'CONSTRAINT_FIRST':
      return {
        ...base,
        messages: [
          { _getType: () => 'human', content: 'Find cheapest bunker under $500/MT with max 100nm deviation' },
          ...(Array.isArray(overrides.messages) ? overrides.messages : []),
        ],
        route_data: overrides.route_data ?? mockRouteData(),
      };
    default:
      return base;
  }
}
