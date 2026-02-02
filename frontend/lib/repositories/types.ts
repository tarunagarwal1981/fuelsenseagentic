/**
 * Repository types and interfaces for FuelSense data access layer
 */

export interface RepositoryConfig {
  tableName: string;
  fallbackPath?: string;
  cacheTTL?: number;
}

export interface QueryFilter<T> {
  where?: Partial<T>;
  orderBy?: keyof T;
  limit?: number;
}

/**
 * Port entity for repository layer
 * Maps to database schema and provides normalized interface
 */
export interface Port {
  /** Unique identifier (same as code) - required by BaseRepository */
  id: string;
  /** UN/LOCODE (e.g., "SGSIN") - primary identifier */
  code: string;
  /** Port name */
  name: string;
  /** Country code (ISO 3166-1 alpha-2) */
  country: string;
  /** Geographic coordinates [latitude, longitude] */
  coordinates: [number, number];
  /** Whether this port can provide bunker services */
  bunkerCapable: boolean;
  /** Array of fuel types available at this port */
  fuelsAvailable: string[];
  /** Timezone identifier (e.g., "Asia/Singapore") */
  timezone: string;
}

/**
 * Fuel price entity for repository layer
 */
export interface FuelPrice {
  /** Unique identifier (optional, auto-generated) */
  id?: string;
  /** Port code (UN/LOCODE) */
  portCode: string;
  /** Fuel type */
  fuelType: 'VLSFO' | 'LSFO' | 'HSFO' | 'MGO' | 'LSMGO';
  /** Price in USD per metric ton */
  priceUSD: number;
  /** Date of price (ISO date string) */
  date: string;
  /** Source of price data */
  source: string;
  /** Timestamp when record was updated */
  updatedAt: Date;
}

/**
 * Query parameters for price lookups
 */
export interface PriceQuery {
  /** Port code to query (optional when portName is used; fuelsense.bunker has port_code NULL) */
  portCode?: string;
  /** Port name to query (for BunkerPricing API keyed by port name) */
  portName?: string;
  /** Array of fuel types to fetch */
  fuelTypes: string[];
  /** Optional date to query prices at (defaults to latest) */
  date?: Date;
}

/**
 * World Port Index (Pub150) entry for worldwide port lookup.
 * Used when ports.json / DB does not have a port; supports CSV now, DB later.
 */
export interface WorldPortEntry {
  /** Stable id: normalized UN/LOCODE when present, else WPI_<OID_> */
  id: string;
  /** Normalized UN/LOCODE (no space, uppercase) or null when CSV has none */
  code: string | null;
  /** Display name (main port name from CSV) */
  name: string;
  /** [latitude, longitude] from CSV */
  coordinates: [number, number];
  /** Country code from CSV */
  countryCode?: string;
  /** Harbor Size from CSV (e.g. Large, Medium, Small) for multi-match rule */
  harborSize?: string;
}

/**
 * Repository for worldwide port data (Pub150 / World Port Index).
 * Implementation can read from CSV now or DB later without changing callers.
 */
export interface IWorldPortRepository {
  /** Resolve by main or alternate port name; applies multi-match rule when multiple rows match. */
  findByName(name: string): Promise<WorldPortEntry | null>;
  /** Lookup by normalized port code (UN/LOCODE or WPI_<OID_>). */
  findByCode(code: string): Promise<WorldPortEntry | null>;
}

/**
 * Vessel profile entity for repository layer
 */
export interface VesselProfile {
  /** Unique identifier - required by BaseRepository */
  id: string;
  /** Vessel name */
  name: string;
  /** IMO number (optional) */
  imo?: string;
  /** Vessel type (e.g., "Container Ship", "Bulk Carrier") */
  vesselType: string;
  /** Deadweight tonnage */
  dwt: number;
  /** Vessel specifications */
  specs: {
    /** Fuel tank capacities */
    fuelCapacity: {
      /** Total fuel capacity in MT */
      total: number;
      /** VLSFO capacity in MT */
      vlsfo: number;
      /** MGO capacity in MT */
      mgo: number;
    };
    /** Speed specifications */
    speed: {
      /** Design speed in knots */
      design: number;
      /** Eco speed in knots */
      eco: number;
    };
  };
  /** Consumption data */
  consumption: {
    /** Speed-consumption curves (consumption per day at different speeds) */
    atSea: Array<{
      /** Speed in knots */
      speed: number;
      /** VLSFO consumption per day in MT */
      vlsfo: number;
      /** MGO consumption per day in MT */
      mgo: number;
    }>;
    /** Consumption while in port (per day) */
    inPort: {
      /** VLSFO consumption per day in MT */
      vlsfo: number;
      /** MGO consumption per day in MT */
      mgo: number;
    };
  };
}
