/**
 * Test Fixtures for Workflow Integration Tests
 * 
 * Provides sample data for testing workflows:
 * - Vessel profiles
 * - Routes
 * - Weather data
 * - Bunker analysis results
 * - CII ratings
 * - ETS costs
 */

import { WorkflowState, VesselProfile, RouteData, WeatherData, BunkerAnalysis, CIIRating, ETSCost } from '../../workflow-engine';

/**
 * Sample vessel profile
 */
export const sampleVessel: VesselProfile = {
  name: 'MV Test Vessel',
  imo: '1234567',
  type: 'Container Ship',
  metadata: {
    dwt: 50000,
    gross_tonnage: 30000,
  },
};

/**
 * Sample route data
 */
export const sampleRouteData: RouteData = {
  origin: 'SGSIN',
  destination: 'NLRTM',
  distance_nm: 8142,
  estimated_hours: 581,
  waypoints: [
    { lat: 1.29, lon: 103.85 }, // Singapore
    { lat: 6.13, lon: 100.37 }, // Strait of Malacca
    { lat: 25.02, lon: 55.03 }, // Dubai
    { lat: 31.23, lon: 121.47 }, // Shanghai
    { lat: 51.92, lon: 4.48 },  // Rotterdam
  ],
};

/**
 * Sample weather data
 */
export const sampleWeatherData: WeatherData = {
  conditions: [
    {
      location: { lat: 1.29, lon: 103.85 },
      wave_height_m: 1.2,
      wind_speed_kt: 15,
      weather_factor: 1.05,
    },
    {
      location: { lat: 25.02, lon: 55.03 },
      wave_height_m: 0.8,
      wind_speed_kt: 12,
      weather_factor: 1.02,
    },
    {
      location: { lat: 51.92, lon: 4.48 },
      wave_height_m: 2.1,
      wind_speed_kt: 20,
      weather_factor: 1.15,
    },
  ],
  risk_level: 'Medium',
};

/**
 * Sample bunker analysis
 */
export const sampleBunkerAnalysis: BunkerAnalysis = {
  recommended_port: {
    code: 'AEDXB',
    name: 'Dubai',
    total_cost: 125000,
  },
  alternative_ports: [
    {
      code: 'SGSIN',
      name: 'Singapore',
      total_cost: 130000,
    },
    {
      code: 'NLRTM',
      name: 'Rotterdam',
      total_cost: 135000,
    },
  ],
  status: 'OPTIMIZATION',
  message: 'Optimal bunker port selected based on cost, weather, and safety',
};

/**
 * Sample CII rating
 */
export const sampleCIIRating: CIIRating = {
  rating: 'B',
  cii_value: 4.2,
  compliant: true,
};

/**
 * Sample EU ETS cost
 */
export const sampleETSCost: ETSCost = {
  total_cost_eur: 45000,
  co2_emissions_tons: 1500,
  cost_per_ton_eur: 30,
};

/**
 * Create initial workflow state for testing
 */
export function createInitialWorkflowState(overrides?: Partial<WorkflowState>): WorkflowState {
  return {
    query: 'Find cheapest bunker from Singapore to Rotterdam',
    query_type: 'bunker_planning',
    vessel: sampleVessel,
    origin_port: 'SGSIN',
    destination_port: 'NLRTM',
    vessel_speed_knots: 14,
    consumption: {
      vlsfo_per_day: 35,
      lsmgo_per_day: 3,
    },
    agent_history: [],
    errors: [],
    warnings: [],
    start_time: Date.now(),
    ...overrides,
  };
}

/**
 * Create workflow state with route data
 */
export function createStateWithRoute(overrides?: Partial<WorkflowState>): WorkflowState {
  return createInitialWorkflowState({
    route_data: sampleRouteData,
    ...overrides,
  });
}

/**
 * Create workflow state with route and weather data
 */
export function createStateWithRouteAndWeather(overrides?: Partial<WorkflowState>): WorkflowState {
  return createStateWithRoute({
    weather_data: sampleWeatherData,
    ...overrides,
  });
}

/**
 * Create workflow state with all data
 */
export function createCompleteState(overrides?: Partial<WorkflowState>): WorkflowState {
  return createStateWithRouteAndWeather({
    bunker_analysis: sampleBunkerAnalysis,
    cii_rating: sampleCIIRating,
    eu_ets_cost: sampleETSCost,
    ...overrides,
  });
}

