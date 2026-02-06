/**
 * Core types for the FuelSense 360 Maritime Bunker Port Optimization Agent
 */

export type {
  VesselBasicInfo,
  NoonReportData,
  ConsumptionProfile,
  WeatherCondition,
  FuelEndurance,
  VesselIdentifiers,
  Position,
  ROBQuantities,
  WeatherConditions,
  DraftInfo,
  FuelConsumptionByGrade,
} from './vessel-performance';

/**
 * Geographic coordinates for a location
 */
export interface Coordinates {
  /** Latitude in decimal degrees */
  lat: number;
  /** Longitude in decimal degrees */
  lon: number;
}

/**
 * Fuel type available at a port
 */
export type FuelType = 'VLSFO' | 'LSGO' | 'MGO';

/**
 * Represents a maritime port with its capabilities
 */
export interface Port {
  /** Unique port identifier code (e.g., 'SGSIN' for Singapore) */
  port_code: string;
  /** Full name of the port */
  name: string;
  /** Country where the port is located */
  country: string;
  /** Geographic coordinates of the port */
  coordinates: Coordinates;
  /** Array of fuel types available at this port */
  fuel_capabilities: FuelType[];
}

/**
 * Represents a maritime route between two ports
 */
export interface Route {
  /** Origin port code */
  origin: string;
  /** Destination port code */
  destination: string;
  /** Distance in nautical miles */
  distance_nm: number;
  /** Estimated travel time in hours */
  estimated_hours: number;
  /** Array of waypoint coordinates along the route */
  waypoints: Coordinates[];
}

/**
 * Represents current fuel pricing at a specific port
 */
export interface FuelPrice {
  /** Port code where this fuel price applies */
  port_code: string;
  /** Type of fuel (Very Low Sulphur Fuel Oil, Low Sulphur Gas Oil, or Marine Gas Oil) */
  fuel_type: FuelType;
  /** Price per metric ton */
  price_per_mt: number;
  /** Currency code (e.g., 'USD', 'EUR') */
  currency: string;
  /** Timestamp of when this price was last updated (ISO 8601 format) */
  last_updated: string;
}

/**
 * Represents a bunker fueling recommendation with optimization details
 */
export interface BunkerRecommendation {
  /** Recommended port for bunkering */
  port: Port;
  /** Fuel price information at the recommended port */
  price: FuelPrice;
  /** Additional distance deviation in nautical miles from the original route */
  deviation_nm: number;
  /** Additional time deviation in hours from the original route */
  deviation_hours: number;
  /** Potential cost savings in the specified currency */
  savings_potential: number;
}

