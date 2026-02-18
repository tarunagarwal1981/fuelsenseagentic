/**
 * Consolidated bunker types for FuelSense bunker agent and related services.
 * Single source of truth for data access, query, calculation, and analysis types.
 *
 * Sections:
 * - Data Access Types (API/service shapes)
 * - Query Types (subtype, constraints)
 * - Calculation Types (ROB, requirements)
 * - Analysis Types (multi-port, vessel comparison)
 */

// =============================================================================
// Data Access Types (BunkerDataService, API responses)
// =============================================================================

/** Date range for filtering bunker data. */
export interface DateRange {
  startDate: string;
  endDate: string;
}

/** Bunker pricing at a port for a fuel type. */
export interface BunkerPricing {
  port: string;
  /** UN/LOCODE or port code when available from API (bunker_pricing.port_code). */
  portCode?: string;
  fuelType: string;
  pricePerMT: number;
  currency: string;
  lastUpdated: string;
  supplier?: string;
  availableQuantity?: number;
}

/** Port bunkering capabilities. */
export interface PortCapabilities {
  portCode: string;
  availableFuelTypes: string[];
  maxSupplyRate?: number;
  berthAvailability?: string;
  ecaZone: boolean;
}

/** Vessel specifications for bunker planning. */
export interface VesselSpecs {
  vesselId: string;
  vesselName: string;
  vesselType: string;
  consumptionRate: number;
  tankCapacity: number;
  currentPosition?: { lat: number; lon: number };
  fuelCompatibility: string[];
}

/** Remaining on board snapshot for a vessel. */
export interface ROBSnapshot {
  vesselId: string;
  timestamp: string;
  robVLSFO?: number;
  robLSMGO?: number;
  robMGO?: number;
  robHSFO?: number;
  totalROB: number;
  location?: { lat: number; lon: number } | string;
}

/** Filters for fleet status queries. */
export interface FleetFilters {
  availableAfter?: string;
  currentRegion?: string;
  vesselTypes?: string[];
  minCapacity?: number;
}

/** Current status of a vessel in the fleet. */
export interface VesselStatus {
  vesselId: string;
  vesselName: string;
  currentVoyage?: string;
  eta?: string;
  nextAvailable?: string;
  currentPosition?: { lat: number; lon: number };
  currentROB?: number;
}

/** Historical price point. */
export interface PriceHistory {
  date: string;
  price: number;
  port: string;
  fuelType: string;
}

// =============================================================================
// Query Types (subtype classification, constraints)
// =============================================================================

/** Bunker query subtype for workflow routing. */
export type BunkerQueryType =
  | 'SIMPLE_PORT_TO_PORT'
  | 'VESSEL_SPECIFIC'
  | 'FLEET_COMPARISON'
  | 'CONSTRAINT_FIRST';

/** Constraint category for validation and relaxation. */
export type ConstraintType =
  | 'quantity_max'
  | 'quantity_min'
  | 'fuel_type'
  | 'price_ceiling'
  | 'preferred_ports'
  | 'avoid_ports'
  | 'time_window'
  | 'required_by_date';

/** Structured constraints extracted from user query. */
export interface BunkerConstraints {
  maxQuantityMT?: number;
  minQuantityMT?: number;
  fuelTypes: string[];
  priceCeilingPerMT?: number;
  preferredPorts: string[];
  avoidPorts: string[];
  timeWindowDays?: number;
  requiredByDate?: string;
}

/** Result of validating a port against constraints. */
export interface ConstraintValidationResult {
  valid: boolean;
  failures: ConstraintType[];
  reasons: string[];
}

/** Record of which constraints were relaxed. */
export interface RelaxedConstraints {
  quantity_relaxed?: { original: number; relaxed: number; reason: string };
  price_relaxed?: { original: number; relaxed: number; reason: string };
  time_relaxed?: { original: number; relaxed: number; reason: string };
}

// =============================================================================
// Calculation Types (ROB, fuel requirements)
// =============================================================================

/** Input parameters for calculating bunker requirement from ROB and voyage. */
export interface ROBCalculationParams {
  currentROB: number;
  vesselConsumption: number;
  routeDistance: number;
  routeEstimatedHours?: number;
  weatherFactor?: number;
  safetyMargin?: number;
  ecaDistance?: number;
  speedKnots?: number;
}

/** Result of bunker requirement calculation. */
export interface BunkerRequirement {
  voyageFuelConsumption: number;
  requiredFuel: number;
  bunkerQuantity: number;
  needsBunkering: boolean;
  safetyMarginApplied: number;
  weatherFactorApplied: number;
  ecaDistanceUsed?: number;
}

/** Vessel context for vessel-specific bunker analysis. */
export interface VesselContext {
  vessel_id: string;
  vessel_name: string;
  current_rob: number;
  tank_capacity: number;
  rob_after_bunkering?: number;
}

// =============================================================================
// Analysis Types (multi-port, fleet comparison)
// =============================================================================

/** One port option for multi-port optimizer. */
export interface BunkerPortOption {
  port_code: string;
  port_name: string;
  price_per_mt: number;
  deviation_nm: number;
  route_position?: number;
}

/** Input for multi-port bunkering optimization. */
export interface MultiPortParams {
  totalFuelRequired: number;
  tankCapacity: number;
  currentROB: number;
  availablePorts: BunkerPortOption[];
  route?: { distance_nm?: number; estimated_hours?: number };
  deviationCostPerNm?: number;
}

/** Single port stop in a multi-port strategy. */
export interface PortBunkerPlan {
  port_name: string;
  port_code?: string;
  sequence: 1 | 2 | 3;
  bunker_quantity: number;
  cost_per_mt: number;
  total_cost: number;
  rob_before: number;
  rob_after: number;
  reasoning: string;
}

/** Multi-port strategy result. */
export interface MultiPortStrategy {
  strategy_type: 'CAPACITY_SPLIT' | 'PRICE_OPTIMIZATION' | 'STRATEGIC';
  ports: PortBunkerPlan[];
  total_bunker_cost: number;
  total_deviation_cost: number;
  total_cost: number;
  savings_vs_single_port: number;
  time_impact_hours: number;
  recommendation: string;
}

/** Single vs multi-port comparison for UI. */
export interface SingleVsMultiComparison {
  single_port_cost: number;
  multi_port_cost: number;
  savings: number;
  recommended: 'MULTI_PORT' | 'SINGLE_PORT';
}

/** Target voyage for fleet comparison. */
export interface VoyageTarget {
  origin: string;
  destination: string;
  distance_nm: number;
  estimated_hours?: number;
  laycan_start?: string;
  laycan_end?: string;
  origin_coordinates?: { lat: number; lon: number };
}

/** Per-vessel input for fleet comparison. */
export interface VesselInputForComparison {
  vesselId: string;
  vesselName: string;
  currentROB: number;
  consumptionRate: number;
  tankCapacity: number;
  currentPosition?: { lat: number; lon: number };
}

/** Parameters for compareVesselsForVoyage. */
export interface FleetComparisonParams {
  vessels: VesselInputForComparison[];
  voyage: VoyageTarget;
  averagePricePerMT?: number;
  weatherFactor?: number;
  safetyMargin?: number;
  speedKnots?: number;
}

/** Laycan compliance classification. */
export type LaycanCompliance = 'MEETS' | 'TIGHT' | 'MISSES';

/** Recommendation tier for vessel comparison. */
export type VesselRecommendationTier = 'BEST CHOICE' | 'ACCEPTABLE' | 'NOT RECOMMENDED';

/** Single vessel comparison result. */
export interface VesselComparison {
  vessel_id: string;
  vessel_name: string;
  suitability_score: number;
  laycan_compliance: LaycanCompliance;
  ballast_fuel_cost: number;
  voyage_bunker_cost: number;
  total_cost: number;
  recommended_bunker_port: string;
  bunker_quantity: number;
  rob_advantage: number;
  estimated_eta: string;
  recommendation: VesselRecommendationTier;
  ballast_distance_nm?: number;
  hours_to_load_port?: number;
}
