/**
 * ECA Zone Configuration
 * 
 * Centralized configuration for ECA compliance calculations.
 * ALL ADJUSTABLE PARAMETERS ARE HERE - Easy to modify!
 */

// ============================================================================
// 🔧 ADJUSTABLE CONFIGURATION CONSTANTS
// ============================================================================

/**
 * Fuel Consumption Configuration
 * 
 * Default vessel consumption rates - can be overridden per vessel
 */
export const CONSUMPTION_CONFIG = {
  // Main engine consumption (tons per day)
  MAIN_ENGINE_MT_PER_DAY: 30,
  
  // Auxiliary engine consumption (tons per day)
  AUXILIARY_MT_PER_DAY: 5,
  
  // Boiler consumption when at sea (tons per day)
  BOILER_MT_PER_DAY_SAILING: 0,
  
  // Boiler consumption when in port (tons per day)
  BOILER_MT_PER_DAY_PORT: 2,
} as const;

/**
 * Safety Margin Configuration
 * 
 * Safety margins to add to fuel calculations
 */
export const SAFETY_MARGIN_CONFIG = {
  // Main engine safety margin (percentage)
  MAIN_ENGINE_MARGIN_PERCENT: 10,
  
  // Auxiliary engine safety margin (percentage)
  AUXILIARY_MARGIN_PERCENT: 15,
  
  // Overall safety margin for MGO (percentage)
  // Applied to total MGO requirement
  OVERALL_MGO_MARGIN_PERCENT: 12,
} as const;

/**
 * Vessel Speed Configuration
 * 
 * Default vessel speeds if not provided
 */
export const SPEED_CONFIG = {
  // Default cruising speed (knots)
  DEFAULT_VESSEL_SPEED_KNOTS: 14,
  
  // Slow steaming speed (knots)
  SLOW_STEAM_SPEED_KNOTS: 11,
  
  // Full ahead speed (knots)
  FULL_AHEAD_SPEED_KNOTS: 18,
} as const;

/**
 * ECA Compliance Configuration
 */
export const ECA_COMPLIANCE_CONFIG = {
  // Maximum sulfur content in ECA zones (percentage)
  ECA_SULFUR_LIMIT_PERCENT: 0.1,
  
  // Maximum sulfur content outside ECA (percentage)
  GLOBAL_SULFUR_LIMIT_PERCENT: 0.5,
  
  // Minimum MGO quantity to round up to (tons)
  MIN_MGO_QUANTITY_MT: 5,
  
  // Round MGO requirements to nearest (tons)
  MGO_ROUNDING_MT: 5,
} as const;

/**
 * Distance Calculation Configuration
 */
export const DISTANCE_CONFIG = {
  // Kilometers per nautical mile
  KM_PER_NAUTICAL_MILE: 1.852,
  
  // Nautical miles per degree latitude
  NM_PER_DEGREE_LAT: 60,
} as const;

// ============================================================================
// 🌍 ECA ZONE DEFINITIONS - COMPLETE COORDINATES
// ============================================================================

export interface ECAZone {
  name: string;
  code: string;
  enacted_date: string;
  sulfur_limit_percent: number;
  status: 'ACTIVE' | 'PROPOSED';
  description: string;
  boundaries: number[][][];
  extends_from_coast_nm?: number;
}

/**
 * Complete ECA Zones Database
 * 
 * Coordinates sourced from:
 * - IMO MARPOL Annex VI regulations
 * - US EPA ECA boundaries (40 CFR Part 1043)
 * - European Maritime Safety Agency (EMSA)
 * - Transport Canada regulations
 * 
 * Format: [longitude, latitude] for Turf.js compatibility
 * Polygons must be closed (first point = last point)
 */
export const ECA_ZONES: Record<string, ECAZone> = {
  
  // ==========================================================================
  // NORTH SEA & BALTIC SEA ECA (SECA)
  // ==========================================================================
  NORTH_SEA_BALTIC: {
    name: 'North Sea & Baltic Sea ECA (SECA)',
    code: 'SECA',
    enacted_date: '2015-01-01',
    sulfur_limit_percent: 0.1,
    status: 'ACTIVE',
    description: 'Covers North Sea, English Channel, and Baltic Sea. Most heavily trafficked ECA in Europe.',
    
    boundaries: [
      [
        // Starting from southwest (English Channel), going clockwise
        [-5.0, 49.5],      // English Channel (west, south of UK)
        [-2.0, 49.5],      // English Channel (west, France coast)
        [2.0, 50.0],       // English Channel (east, Dover Strait)
        [4.0, 51.0],       // North Sea (south, approaching Netherlands)
        [8.0, 54.0],       // North Sea (central)
        [11.0, 58.0],      // Skagerrak Strait
        [15.0, 55.0],      // Danish Straits (Sound)
        [24.0, 55.0],      // Southern Baltic
        [30.0, 60.0],      // Gulf of Finland
        [30.0, 65.5],      // Northern extent
        [20.0, 70.0],      // Norwegian coast (north)
        [10.0, 70.0],      // 
        [5.0, 70.0],       // 
        [-4.0, 62.0],      // West of Scotland
        [-5.0, 55.0],      // North Sea (west, central)
        [-5.0, 49.5]       // Close polygon (back to English Channel)
      ]
    ]
  },

  // ==========================================================================
  // NORTH AMERICAN ECA - ATLANTIC/EAST COAST
  // ==========================================================================
  NORTH_AMERICA_EAST: {
    name: 'North American ECA - US/Canada Atlantic Coast',
    code: 'NAECA_ATLANTIC',
    enacted_date: '2012-08-01',
    sulfur_limit_percent: 0.1,
    status: 'ACTIVE',
    description: 'Extends 200 nautical miles from Atlantic coast of US and Canada',
    extends_from_coast_nm: 200,
    
    boundaries: [
      [
        // Atlantic coast outline (200nm offshore)
        [-52.0, 48.0],     // Newfoundland
        [-50.0, 45.0],     // Grand Banks
        [-60.0, 44.0],     // Nova Scotia (offshore)
        [-62.0, 42.0],     // 
        [-67.0, 42.0],     // Maine (offshore)
        [-68.0, 40.0],     // 
        [-70.0, 41.0],     // Massachusetts (offshore)
        [-69.0, 38.0],     // 
        [-72.0, 37.0],     // New York/New Jersey (offshore)
        [-74.0, 35.0],     // North Carolina (offshore)
        [-76.0, 33.0],     // South Carolina (offshore)
        [-78.0, 31.0],     // Georgia (offshore)
        [-79.0, 28.0],     // Florida east coast (offshore)
        [-80.0, 26.0],     // Florida (offshore)
        [-80.5, 24.5],     // Florida Keys area
        [-81.0, 24.0],     // South Florida
        [-64.0, 18.0],     // Connection point
        [-52.0, 30.0],     // Return north
        [-52.0, 48.0]      // Close polygon
      ]
    ]
  },

  // ==========================================================================
  // NORTH AMERICAN ECA - GULF OF MEXICO
  // ==========================================================================
  NORTH_AMERICA_GULF: {
    name: 'North American ECA - Gulf of Mexico',
    code: 'NAECA_GULF',
    enacted_date: '2012-08-01',
    sulfur_limit_percent: 0.1,
    status: 'ACTIVE',
    description: 'Covers Gulf of Mexico, extends 200nm from US Gulf Coast',
    extends_from_coast_nm: 200,
    
    boundaries: [
      [
        [-97.5, 27.5],     // Texas coast (offshore)
        [-96.0, 26.0],     // South Texas
        [-95.0, 24.0],     // 
        [-94.0, 22.0],     // 
        [-92.0, 20.0],     // Mexico (Yucatan offshore)
        [-88.0, 19.0],     // 
        [-85.0, 19.5],     // 
        [-83.0, 21.0],     // 
        [-82.0, 23.0],     // Cuba area
        [-81.0, 24.0],     // Florida Keys
        [-82.0, 26.0],     // Florida west coast
        [-83.0, 27.0],     // 
        [-84.0, 28.0],     // 
        [-86.0, 29.0],     // Florida Panhandle (offshore)
        [-88.0, 29.5],     // Alabama/Mississippi (offshore)
        [-90.0, 29.0],     // Louisiana (offshore)
        [-92.0, 29.0],     // 
        [-94.0, 28.5],     // 
        [-96.0, 28.0],     // 
        [-97.5, 27.5]      // Close polygon
      ]
    ]
  },

  // ==========================================================================
  // NORTH AMERICAN ECA - PACIFIC/WEST COAST
  // ==========================================================================
  NORTH_AMERICA_WEST: {
    name: 'North American ECA - US/Canada Pacific Coast',
    code: 'NAECA_PACIFIC',
    enacted_date: '2012-08-01',
    sulfur_limit_percent: 0.1,
    status: 'ACTIVE',
    description: 'Extends 200 nautical miles from Pacific coast of US and Canada',
    extends_from_coast_nm: 200,
    
    boundaries: [
      [
        [-133.0, 54.0],    // British Columbia (north, offshore)
        [-131.0, 52.0],    // BC central coast (offshore)
        [-130.0, 50.0],    // Vancouver Island (offshore)
        [-129.0, 48.0],    // Washington (offshore)
        [-127.0, 46.0],    // Oregon (offshore)
        [-126.0, 44.0],    // Oregon (offshore)
        [-125.0, 42.0],    // California (north, offshore)
        [-124.0, 40.0],    // Northern California (offshore)
        [-123.0, 38.0],    // San Francisco area (offshore)
        [-122.0, 36.0],    // Central California (offshore)
        [-121.0, 34.0],    // Southern California (offshore)
        [-120.0, 33.0],    // Los Angeles area (offshore)
        [-119.0, 32.5],    // San Diego area (offshore)
        [-117.5, 32.0],    // US-Mexico border area
        [-116.0, 31.0],    // Baja California (offshore)
        [-125.0, 31.0],    // Return offshore
        [-133.0, 42.0],    // Return north
        [-133.0, 54.0]     // Close polygon
      ]
    ]
  },

  // ==========================================================================
  // US CARIBBEAN ECA (Puerto Rico & US Virgin Islands)
  // ==========================================================================
  US_CARIBBEAN: {
    name: 'US Caribbean ECA',
    code: 'USCARECA',
    enacted_date: '2014-01-01',
    sulfur_limit_percent: 0.1,
    status: 'ACTIVE',
    description: 'Covers Puerto Rico and US Virgin Islands, extends 50nm from coast',
    extends_from_coast_nm: 50,
    
    boundaries: [
      [
        [-67.5, 18.8],     // Puerto Rico (west)
        [-67.0, 18.0],     // Southwest PR
        [-65.5, 17.8],     // South coast PR
        [-65.2, 18.0],     // Southeast PR
        [-64.5, 18.5],     // East coast PR / Vieques
        [-64.0, 18.6],     // US Virgin Islands (west)
        [-64.5, 17.5],     // USVI (south, offshore)
        [-65.0, 17.3],     // 
        [-66.0, 17.3],     // 
        [-67.0, 17.5],     // 
        [-67.8, 17.8],     // 
        [-67.5, 18.8]      // Close polygon
      ]
    ]
  },

  // ==========================================================================
  // NORWEGIAN ECA (National Territorial Waters)
  // ==========================================================================
  NORWEGIAN_TERRITORIAL: {
    name: 'Norwegian Territorial Waters ECA',
    code: 'NOECA',
    enacted_date: '2024-01-01',
    sulfur_limit_percent: 0.1,
    status: 'ACTIVE',
    description: 'Norwegian territorial waters (12nm from coast). National regulation stricter than SECA.',
    extends_from_coast_nm: 12,
    
    boundaries: [
      [
        // Simplified Norwegian coastline (12nm buffer)
        [5.0, 58.5],       // South Norway (Skagerrak)
        [6.0, 58.0],       // 
        [8.0, 58.5],       // Oslo Fjord area
        [10.0, 59.0],      // 
        [11.0, 60.0],      // Bergen area
        [5.0, 61.0],       // West coast
        [5.0, 62.5],       // 
        [6.0, 64.0],       // Mid-Norway
        [10.0, 65.0],      // 
        [13.0, 66.5],      // 
        [16.0, 68.0],      // Lofoten area
        [20.0, 69.5],      // Finnmark
        [30.0, 70.0],      // North Cape area
        [31.0, 70.5],      // Russia border
        [28.0, 71.0],      // Offshore return
        [15.0, 71.0],      // 
        [10.0, 70.0],      // 
        [5.0, 65.0],       // 
        [4.0, 62.0],       // 
        [5.0, 58.5]        // Close polygon
      ]
    ]
  },

  // ==========================================================================
  // MEDITERRANEAN ECA (PROPOSED - Expected 2025-2026)
  // ==========================================================================
  MEDITERRANEAN: {
    name: 'Mediterranean Sea ECA (Proposed)',
    code: 'MEDECA',
    enacted_date: '2025-05-01',
    sulfur_limit_percent: 0.1,
    status: 'PROPOSED',
    description: 'Proposed ECA covering entire Mediterranean Sea. Expected IMO adoption 2025-2026.',
    
    boundaries: [
      [
        // Comprehensive Mediterranean boundary
        [-5.5, 36.0],      // Gibraltar (west)
        [-3.0, 36.0],      // Alboran Sea
        [0.0, 37.5],       // Algeria
        [3.0, 37.0],       // 
        [8.0, 37.0],       // Tunisia
        [10.0, 37.5],      // Sicily area
        [12.0, 38.0],      // 
        [15.0, 37.5],      // Malta area
        [18.0, 36.0],      // Libya
        [20.0, 35.0],      // 
        [25.0, 34.5],      // 
        [30.0, 34.0],      // Egypt
        [32.0, 34.5],      // Israel/Lebanon
        [34.0, 35.5],      // Cyprus
        [36.0, 36.0],      // Syria/Turkey
        [35.0, 37.0],      // Turkey (south coast)
        [33.0, 37.5],      // 
        [30.0, 38.0],      // 
        [28.0, 39.0],      // Turkey (Aegean)
        [26.0, 40.0],      // Greece (Aegean)
        [24.0, 40.5],      // Greece
        [20.0, 40.0],      // Ionian Sea
        [18.0, 40.5],      // Albania
        [16.0, 40.0],      // Italy (south)
        [14.0, 39.0],      // 
        [12.0, 40.0],      // Tyrrhenian Sea
        [10.0, 42.0],      // Sardinia
        [8.0, 43.0],       // Corsica
        [7.0, 43.5],       // France (south coast)
        [4.0, 43.0],       // 
        [2.0, 42.0],       // Spain (east coast)
        [0.0, 40.0],       // 
        [-2.0, 38.0],      // Spain (southeast)
        [-4.0, 37.0],      // 
        [-5.5, 36.0]       // Close polygon
      ]
    ]
  },

  // ==========================================================================
  // HONG KONG ECA (Regional)
  // ==========================================================================
  HONG_KONG: {
    name: 'Hong Kong ECA',
    code: 'HKECA',
    enacted_date: '2015-07-01',
    sulfur_limit_percent: 0.5,
    status: 'ACTIVE',
    description: 'Hong Kong territorial waters. Ships at berth must use fuel ≤0.5% sulfur.',
    extends_from_coast_nm: 12,
    
    boundaries: [
      [
        [113.8, 22.5],     // Northwest
        [114.5, 22.6],     // Northeast
        [114.4, 22.1],     // Southeast
        [113.8, 22.2],     // Southwest
        [113.8, 22.5]      // Close polygon
      ]
    ]
  }
};

// ============================================================================
// 🔧 HELPER FUNCTIONS FOR CONFIGURATION
// ============================================================================

/**
 * Get all active ECA zones
 */
export function getActiveECAZones(): Record<string, ECAZone> {
  return Object.fromEntries(
    Object.entries(ECA_ZONES).filter(([_, zone]) => zone.status === 'ACTIVE')
  );
}

/**
 * Get all proposed ECA zones
 */
export function getProposedECAZones(): Record<string, ECAZone> {
  return Object.fromEntries(
    Object.entries(ECA_ZONES).filter(([_, zone]) => zone.status === 'PROPOSED')
  );
}

/**
 * Calculate total daily consumption
 */
export function calculateDailyConsumption(
  mainEngine: number = CONSUMPTION_CONFIG.MAIN_ENGINE_MT_PER_DAY,
  auxiliary: number = CONSUMPTION_CONFIG.AUXILIARY_MT_PER_DAY,
  boiler: number = CONSUMPTION_CONFIG.BOILER_MT_PER_DAY_SAILING
): number {
  return mainEngine + auxiliary + boiler;
}

/**
 * Apply safety margin to fuel quantity
 */
export function applySafetyMargin(
  baseFuel: number,
  marginPercent: number = SAFETY_MARGIN_CONFIG.OVERALL_MGO_MARGIN_PERCENT
): number {
  return baseFuel * (1 + marginPercent / 100);
}

/**
 * Round MGO quantity to nearest increment
 */
export function roundMGOQuantity(
  quantity: number,
  roundTo: number = ECA_COMPLIANCE_CONFIG.MGO_ROUNDING_MT
): number {
  return Math.ceil(quantity / roundTo) * roundTo;
}

