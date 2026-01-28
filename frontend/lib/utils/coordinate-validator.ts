/**
 * Coordinate Validation and Conversion Utilities
 *
 * Purpose: Ensure consistent coordinate handling across the application
 * Standard: Use [lat, lon] format everywhere except GeoJSON which uses [lon, lat]
 *
 * Critical Rules:
 * 1. Internal format: [lat, lon] array or {lat, lon} object
 * 2. GeoJSON format: [lon, lat] array (external APIs like SeaRoute)
 * 3. Always validate before using coordinates
 * 4. Auto-detect and warn about wrong order
 */

export interface CoordinateObject {
  lat: number;
  lon: number;
}

export type CoordinateArray = [number, number]; // [lat, lon]
export type GeoJSONCoordinate = [number, number]; // [lon, lat]

/**
 * Validate coordinates are in valid range
 * Latitude: -90 to 90
 * Longitude: -180 to 180
 */
export function validateCoordinates(coords: CoordinateObject): boolean {
  const { lat, lon } = coords;

  if (typeof lat !== 'number' || typeof lon !== 'number') {
    console.error('[COORD-VALIDATE] Invalid coordinate types:', { lat: typeof lat, lon: typeof lon });
    return false;
  }

  if (isNaN(lat) || isNaN(lon)) {
    console.error('[COORD-VALIDATE] NaN detected in coordinates:', { lat, lon });
    return false;
  }

  const valid = lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;

  if (!valid) {
    console.error('[COORD-VALIDATE] Coordinates out of range:', {
      lat,
      lon,
      lat_valid: lat >= -90 && lat <= 90,
      lon_valid: lon >= -180 && lon <= 180,
    });
  }

  return valid;
}

/**
 * Convert [lat, lon] array to {lat, lon} object
 */
export function arrayToObject(coords: CoordinateArray): CoordinateObject {
  if (!Array.isArray(coords) || coords.length !== 2) {
    throw new Error(`Invalid coordinate array: ${JSON.stringify(coords)}`);
  }
  return {
    lat: coords[0],
    lon: coords[1],
  };
}

/**
 * Convert {lat, lon} object to [lat, lon] array
 */
export function objectToArray(coords: CoordinateObject): CoordinateArray {
  if (typeof coords !== 'object' || !('lat' in coords) || !('lon' in coords)) {
    throw new Error(`Invalid coordinate object: ${JSON.stringify(coords)}`);
  }
  return [coords.lat, coords.lon];
}

/**
 * Flip [lon, lat] GeoJSON format to [lat, lon] standard format
 * Use this when receiving data from GeoJSON APIs
 */
export function flipGeoJSON(coords: GeoJSONCoordinate): CoordinateArray {
  return [coords[1], coords[0]];
}

/**
 * Flip [lat, lon] standard format to [lon, lat] GeoJSON format
 * Use this when sending data to GeoJSON APIs
 */
export function toGeoJSON(coords: CoordinateArray): GeoJSONCoordinate {
  return [coords[1], coords[0]];
}

/**
 * Detect if coordinates are likely in wrong order
 * Returns true if coordinates appear to be [lon, lat] instead of [lat, lon]
 *
 * Logic: Latitude must be between -90 and 90. If the first value is outside
 * this range, it's likely longitude (which can be -180 to 180)
 */
export function detectWrongOrder(coords: CoordinateArray): boolean {
  return Math.abs(coords[0]) > 90;
}

/**
 * Auto-correct coordinates if detected in wrong order
 * Logs warning when correction is made
 */
export function autoCorrect(coords: CoordinateArray): CoordinateArray {
  if (detectWrongOrder(coords)) {
    console.warn('⚠️ [COORD-AUTO-CORRECT] Detected wrong order, flipping:', coords, '→', [coords[1], coords[0]]);
    return flipGeoJSON(coords);
  }
  return coords;
}

/**
 * Validate and log coordinate conversion for debugging
 */
export function logCoordConversion(
  source: string,
  original: unknown,
  converted: unknown,
  options: { verbose?: boolean } = {}
): void {
  const convertedObj =
    typeof converted === 'object' && converted !== null && 'lat' in converted && 'lon' in converted
      ? (converted as CoordinateObject)
      : Array.isArray(converted) && converted.length >= 2
        ? arrayToObject(converted as CoordinateArray)
        : null;

  if (convertedObj === null) {
    console.log(`🔄 [COORD-CONVERT] ${source}: invalid converted value`, { original, converted });
    return;
  }

  const valid = validateCoordinates(convertedObj);

  if (options.verbose || !valid) {
    console.log(`🔄 [COORD-CONVERT] ${source}:`, {
      original,
      converted,
      valid,
      lat_range: `${convertedObj.lat >= -90 && convertedObj.lat <= 90 ? '✅' : '❌'} ${convertedObj.lat}`,
      lon_range: `${convertedObj.lon >= -180 && convertedObj.lon <= 180 ? '✅' : '❌'} ${convertedObj.lon}`,
    });
  }
}

/**
 * Batch validate array of coordinates
 * Returns indices of invalid coordinates
 */
export function validateBatch(
  coordinates: Array<CoordinateArray | CoordinateObject>,
  logErrors = true
): number[] {
  const invalidIndices: number[] = [];

  coordinates.forEach((coord, index) => {
    const coordObj = Array.isArray(coord) ? arrayToObject(coord) : coord;
    if (!validateCoordinates(coordObj)) {
      invalidIndices.push(index);
      if (logErrors) {
        console.error(`❌ [COORD-BATCH] Invalid coordinate at index ${index}:`, coord);
      }
    }
  });

  return invalidIndices;
}

/**
 * Format coordinates for display
 */
export function formatForDisplay(coords: CoordinateObject): string {
  const latDir = coords.lat >= 0 ? 'N' : 'S';
  const lonDir = coords.lon >= 0 ? 'E' : 'W';
  return `${Math.abs(coords.lat).toFixed(4)}°${latDir}, ${Math.abs(coords.lon).toFixed(4)}°${lonDir}`;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in nautical miles
 */
export function haversineDistance(from: CoordinateObject, to: CoordinateObject): number {
  const R = 3440.065; // Earth's radius in nautical miles

  const lat1Rad = (from.lat * Math.PI) / 180;
  const lat2Rad = (to.lat * Math.PI) / 180;
  const deltaLatRad = ((to.lat - from.lat) * Math.PI) / 180;
  const deltaLonRad = ((to.lon - from.lon) * Math.PI) / 180;

  const a =
    Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLonRad / 2) * Math.sin(deltaLonRad / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

/**
 * Check if coordinate appears to be on land (rough check)
 * This is a very rough heuristic - not 100% accurate
 */
export function appearsOnLand(coords: CoordinateObject): boolean {
  const { lat, lon } = coords;

  if (lat > 0 && lat < 70 && lon > -80 && lon < -10) {
    return false; // Likely Atlantic
  }

  if (lat > -60 && lat < 60 && ((lon > 100 && lon < 180) || (lon > -180 && lon < -100))) {
    return false; // Likely Pacific
  }

  if (lat > -60 && lat < 30 && lon > 30 && lon < 120) {
    return false; // Likely Indian Ocean
  }

  return true; // Assume land
}

/**
 * Validate port coordinates make sense for maritime routing
 * Ports should be on coastlines (near water)
 */
export function validatePortLocation(
  coords: CoordinateObject,
  portName: string
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (!validateCoordinates(coords)) {
    return { valid: false, warnings: ['Coordinates out of valid range'] };
  }

  if (appearsOnLand(coords)) {
    warnings.push(`${portName} coordinates may be inland - verify this is a coastal port`);
  }

  if (coords.lat === coords.lon) {
    warnings.push('Latitude and longitude are identical - possible data entry error');
  }

  if (Math.abs(coords.lat) < 0.01 && Math.abs(coords.lon) < 0.01) {
    warnings.push('Coordinates very close to 0,0 (Gulf of Guinea) - verify this is correct');
  }

  return {
    valid: true,
    warnings,
  };
}

/**
 * Create a test suite for coordinate validation
 * Useful for debugging coordinate issues
 */
export function runCoordinateTests() {
  console.log('🧪 [COORD-TEST] Running coordinate validation tests...\n');

  const tests = [
    {
      name: 'Valid Singapore Port',
      coords: { lat: 1.2897, lon: 103.8501 },
      expected: true,
    },
    {
      name: 'Valid Dubai Port',
      coords: { lat: 25.2532, lon: 55.2769 },
      expected: true,
    },
    {
      name: 'Invalid - Latitude > 90',
      coords: { lat: 100, lon: 50 },
      expected: false,
    },
    {
      name: 'Invalid - Longitude > 180',
      coords: { lat: 50, lon: 200 },
      expected: false,
    },
    {
      name: 'Wrong order - [lon, lat] format',
      array: [103.8501, 1.2897] as CoordinateArray,
      shouldDetectWrongOrder: true,
    },
    {
      name: 'Correct order - [lat, lon] format',
      array: [1.2897, 103.8501] as CoordinateArray,
      shouldDetectWrongOrder: false,
    },
  ];

  let passed = 0;
  let failed = 0;

  tests.forEach((test) => {
    if ('coords' in test && test.coords != null) {
      const result = validateCoordinates(test.coords);
      if (result === test.expected) {
        console.log(`✅ ${test.name}`);
        passed++;
      } else {
        console.error(`❌ ${test.name} - Expected ${test.expected}, got ${result}`);
        failed++;
      }
    } else if ('array' in test) {
      const result = detectWrongOrder(test.array);
      if (result === test.shouldDetectWrongOrder) {
        console.log(`✅ ${test.name}`);
        passed++;
      } else {
        console.error(`❌ ${test.name} - Expected ${test.shouldDetectWrongOrder}, got ${result}`);
        failed++;
      }
    }
  });

  console.log(`\n📊 [COORD-TEST] Results: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

/**
 * Normalize waypoint-like value to { lat, lon } for map/validation.
 * Handles: Waypoint ({ coordinates: [lat, lon] }), [lat, lon], { lat, lon }.
 */
export function waypointToCoords(wp: unknown): CoordinateObject | null {
  if (!wp || typeof wp !== 'object') return null;
  const o = wp as Record<string, unknown>;
  if (o.coordinates && Array.isArray(o.coordinates) && o.coordinates.length >= 2) {
    const c = o.coordinates as number[];
    if (typeof c[0] === 'number' && typeof c[1] === 'number') {
      return { lat: c[0], lon: c[1] };
    }
  }
  if (typeof o.lat === 'number' && typeof o.lon === 'number') {
    return { lat: o.lat, lon: o.lon };
  }
  if (Array.isArray(wp) && wp.length >= 2 && typeof wp[0] === 'number' && typeof wp[1] === 'number') {
    return { lat: wp[0], lon: wp[1] };
  }
  return null;
}

export const COORDINATE_FORMATS = {
  INTERNAL: '[lat, lon] array or {lat, lon} object',
  GEOJSON: '[lon, lat] array',
  DISPLAY: 'latitude°N/S, longitude°E/W',
} as const;

export const COORDINATE_RANGES = {
  LATITUDE: { min: -90, max: 90, unit: 'degrees' },
  LONGITUDE: { min: -180, max: 180, unit: 'degrees' },
} as const;
