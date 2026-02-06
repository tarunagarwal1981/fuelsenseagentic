/**
 * Vessel Performance Type Definitions
 *
 * Foundation types used by Hull Performance and Machinery Performance agents.
 * These types support noon report data, consumption profiles, and vessel specifications.
 */

/**
 * Basic vessel information from master database
 */
export interface VesselBasicInfo {
  /** Vessel name (e.g., "OCEAN PRIDE") */
  name: string;

  /** IMO number - 7-digit unique vessel identifier */
  imo: string;

  /** Vessel type (e.g., 'Bulk Carrier', 'Container Ship', 'Tanker', 'LNG Carrier') */
  type: string;

  /** Deadweight tonnage in metric tons */
  dwt: number;

  /** Flag state (ISO 3166-1 alpha-2 code, e.g., 'SG', 'LR', 'PA') */
  flag: string;

  /** Year vessel was built */
  built: number;

  /** Optional: Vessel operator/manager company name */
  operator?: string;

  /** Optional: Vessel call sign */
  call_sign?: string;
}

/**
 * Geographical position coordinates
 * @see latitude Valid range: -90 to 90 (decimal degrees)
 * @see longitude Valid range: -180 to 180 (decimal degrees)
 */
export interface Position {
  /** Latitude in decimal degrees (-90 to 90) */
  latitude: number;
  /** Longitude in decimal degrees (-180 to 180) */
  longitude: number;
}

/**
 * Remaining on Board (ROB) fuel quantities in metric tons
 * Supports industry standard fuel grades: VLSFO, LSMGO, HSFO, MGO
 */
export interface ROBQuantities {
  /** Very Low Sulphur Fuel Oil (0.5% sulphur) */
  vlsfo: number;
  /** Low Sulphur Marine Gas Oil (ECA fuel, 0.1% sulphur) */
  lsmgo: number;
  /** Optional: High Sulphur Fuel Oil (3.5% sulphur, for scrubber vessels) */
  hsfo?: number;
  /** Optional: Marine Gas Oil */
  mgo?: number;
}

/**
 * Weather conditions at time of report
 */
export interface WeatherConditions {
  /** Wind speed in knots */
  wind_speed: number;
  /** Wind direction in degrees (0-360, where 0/360 = North) */
  wind_direction: number;
  /** Significant wave height in meters */
  wave_height: number;
  /** Sea state on Douglas scale (0-9) */
  sea_state: number;
}

/**
 * Vessel draft information
 */
export interface DraftInfo {
  /** Forward draft in meters */
  forward: number;
  /** Aft draft in meters */
  aft: number;
}

/**
 * Noon report data - daily position and status report submitted by vessel
 */
export interface NoonReportData {
  /** Report submission timestamp (ISO 8601 format) */
  timestamp: string;

  /** Vessel IMO number */
  imo: string;

  /** Vessel name */
  vessel_name: string;

  /** Current geographical position */
  position: Position;

  /** Next port of call information */
  next_port: {
    /** Port name (e.g., "Jebel Ali", "Singapore") */
    name: string;
    /** Optional: UN/LOCODE if available (e.g., "AEJEA", "SGSIN") */
    locode?: string;
    /** Optional: Estimated Time of Arrival (ISO 8601) */
    eta?: string;
  };

  /** Remaining on Board (ROB) fuel quantities in metric tons */
  rob: ROBQuantities;

  /** Current vessel speed in knots */
  speed: number;

  /** Optional: Distance to next port in nautical miles */
  distance_to_go?: number;

  /** Optional: Weather conditions at time of report */
  weather?: WeatherConditions;

  /** Optional: Vessel draft information */
  draft?: DraftInfo;
}

/**
 * Fuel consumption by grade for main or auxiliary engines
 * All values in metric tons per day
 */
export interface FuelConsumptionByGrade {
  /** Very Low Sulphur Fuel Oil consumption */
  vlsfo?: number;
  /** Low Sulphur Marine Gas Oil consumption */
  lsmgo?: number;
  /** High Sulphur Fuel Oil consumption (scrubber vessels) */
  hsfo?: number;
  /** Marine Gas Oil consumption */
  mgo?: number;
}

/**
 * Vessel fuel consumption profile at different operating conditions
 * Used to predict consumption and calculate endurance
 */
export interface ConsumptionProfile {
  /** Vessel IMO number */
  imo: string;

  /** Operating speed in knots for this profile */
  speed: number;

  /** Weather/sea condition category */
  weather_condition: 'calm' | 'moderate' | 'rough' | 'very_rough';

  /** Fuel consumption rates in metric tons per day */
  consumption: {
    /** Main engine consumption */
    main_engine: FuelConsumptionByGrade;
    /** Auxiliary engine consumption (generators, etc.) */
    auxiliary_engine: FuelConsumptionByGrade;
  };

  /** Cargo loading condition affecting consumption */
  load_condition: 'ballast' | 'laden' | 'normal';

  /** Optional: Beaufort scale (0-12) for reference */
  beaufort_scale?: number;
}

/**
 * Weather condition assessment for consumption profile matching
 */
export interface WeatherCondition {
  /** Wind speed in knots */
  wind_speed: number;
  /** Wave height in meters */
  wave_height: number;
  /** Sea state (Douglas scale 0-9) */
  sea_state: number;
  /** Derived weather category */
  category: 'calm' | 'moderate' | 'rough' | 'very_rough';
}

/**
 * Fuel endurance calculation result
 */
export interface FuelEndurance {
  /** Days of endurance for VLSFO at current consumption */
  vlsfo_days: number;
  /** Days of endurance for LSMGO at current consumption */
  lsmgo_days: number;
  /** The limiting fuel grade (which runs out first) */
  limiting_fuel: 'vlsfo' | 'lsmgo' | 'hsfo' | 'mgo';
  /** Minimum endurance across all fuel grades */
  minimum_days: number;
}

/**
 * Extracted vessel identifiers from user query
 * Populated by Entity Extractor Agent
 */
export interface VesselIdentifiers {
  /** Vessel names mentioned in query */
  names: string[];
  /** IMO numbers mentioned in query */
  imos: string[];
}
