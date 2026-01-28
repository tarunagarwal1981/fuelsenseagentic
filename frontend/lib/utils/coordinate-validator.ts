/**
 * Coordinate Validation and Conversion Utilities for Maritime Routing
 *
 * Ensures consistent coordinate handling and catches common errors (e.g. route
 * waypoints at (0, 0) instead of correct port location). Use at multiple
 * layers to validate coordinates.
 *
 * Maritime coordinates: latitude -90 to 90, longitude -180 to 180.
 *
 * Conventions:
 * - Internal format: [lat, lon] array or { lat, lon } object
 * - GeoJSON format: [lon, lat] array (e.g. SeaRoute API, GeoJSON specs)
 *
 * Error handling: throws descriptive errors for invalid inputs; logs warnings
 * for suspicious values (e.g. near 0,0). Never returns undefined for
 * conversion functions—returns a valid result or throws.
 */

export interface CoordinateObject {
  lat: number;
  lon: number;
}

/** [lat, lon] — internal and Leaflet convention */
export type CoordinateArray = [number, number];

/** [lon, lat] — GeoJSON and many external APIs */
export type GeoJSONCoordinate = [number, number];

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

export const COORDINATE_FORMATS = {
  INTERNAL: '[lat, lon] array or {lat, lon} object',
  GEOJSON: '[lon, lat] array',
  DISPLAY: 'latitude°N/S, longitude°E/W (e.g. 25.2532°N, 55.2769°E)',
} as const;

export const COORDINATE_RANGES = {
  LATITUDE: { min: -90, max: 90, unit: 'degrees' },
  LONGITUDE: { min: -180, max: 180, unit: 'degrees' },
} as const;

const EARTH_RADIUS_NM = 3440.065;
const NEAR_ZERO_THRESHOLD = 0.01;

// -----------------------------------------------------------------------------
// Core validation
// -----------------------------------------------------------------------------

/**
 * Validates maritime coordinates (lat -90..90, lon -180..180).
 * Logs specific issues and warns when coordinates are suspicious (e.g. near 0,0).
 *
 * @param coords - { lat, lon } object
 * @returns true if valid; false if invalid (and logs errors)
 */
export function validateCoordinates(coords: CoordinateObject): boolean {
  const { lat, lon } = coords;

  if (typeof lat !== 'number' || typeof lon !== 'number') {
    console.error('[COORD-VALIDATE] ❌ Invalid coordinate types:', {
      lat: typeof lat,
      lon: typeof lon,
      lat_value: lat,
      lon_value: lon,
    });
    return false;
  }

  if (isNaN(lat) || isNaN(lon)) {
    console.error('[COORD-VALIDATE] ❌ NaN in coordinates:', { lat, lon });
    return false;
  }

  const latInRange = lat >= -90 && lat <= 90;
  const lonInRange = lon >= -180 && lon <= 180;

  if (!latInRange || !lonInRange) {
    console.error('[COORD-VALIDATE] ❌ Coordinates out of range:', {
      lat,
      lon,
      lat_valid: latInRange,
      lon_valid: lonInRange,
      expected_lat: '[-90, 90]',
      expected_lon: '[-180, 180]',
    });
    return false;
  }

  if (Math.abs(lat) < NEAR_ZERO_THRESHOLD && Math.abs(lon) < NEAR_ZERO_THRESHOLD) {
    console.warn('[COORD-VALIDATE] ⚠️ Suspicious: coordinates very close to (0,0). May indicate missing or default data:', {
      lat,
      lon,
    });
  }

  return true;
}

/**
 * Detects if the array is likely [lon, lat] instead of [lat, lon].
 * Latitude must be in [-90, 90]; if the first element is outside that range,
 * it is likely longitude.
 *
 * @param coords - [number, number] assumed to be [lat, lon]
 * @returns true if first element looks like longitude (e.g. |x| > 90)
 */
export function detectWrongOrder(coords: CoordinateArray): boolean {
  return Math.abs(coords[0]) > 90;
}

/**
 * Auto-corrects coordinate order: if the array looks like [lon, lat],
 * returns [lat, lon]. Otherwise returns the input unchanged.
 * Logs a warning when a correction is made.
 *
 * @param coords - [number, number] possibly [lon, lat]
 * @returns [lat, lon] — never undefined
 */
export function autoCorrect(coords: CoordinateArray): CoordinateArray {
  if (detectWrongOrder(coords)) {
    const corrected: CoordinateArray = [coords[1], coords[0]];
    console.warn('[COORD-VALIDATE] ⚠️ Auto-corrected wrong order:', {
      original: coords,
      corrected,
    });
    return corrected;
  }
  return coords;
}

// -----------------------------------------------------------------------------
// Conversion
// -----------------------------------------------------------------------------

/**
 * Converts [lat, lon] array to { lat, lon } object.
 * @throws Error if input is not a length-2 array of numbers
 */
export function arrayToObject(coords: CoordinateArray): CoordinateObject {
  if (!Array.isArray(coords) || coords.length !== 2) {
    throw new Error(
      `[COORD-VALIDATE] Invalid coordinate array: expected [lat, lon] with length 2, got ${JSON.stringify(coords)}`
    );
  }
  const [lat, lon] = coords;
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    throw new Error(
      `[COORD-VALIDATE] Invalid coordinate array: elements must be numbers, got [${typeof lat}, ${typeof lon}] values ${JSON.stringify(coords)}`
    );
  }
  return { lat, lon };
}

/**
 * Converts { lat, lon } object to [lat, lon] array.
 * @throws Error if input is not an object with lat and lon numbers
 */
export function objectToArray(coords: CoordinateObject): CoordinateArray {
  if (typeof coords !== 'object' || coords == null) {
    throw new Error(
      `[COORD-VALIDATE] Invalid coordinate object: expected { lat, lon }, got ${JSON.stringify(coords)}`
    );
  }
  if (!('lat' in coords) || !('lon' in coords)) {
    throw new Error(
      `[COORD-VALIDATE] Invalid coordinate object: missing lat or lon, got ${JSON.stringify(coords)}`
    );
  }
  const { lat, lon } = coords;
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    throw new Error(
      `[COORD-VALIDATE] Invalid coordinate object: lat and lon must be numbers, got ${JSON.stringify(coords)}`
    );
  }
  return [lat, lon];
}

/**
 * Converts GeoJSON [lon, lat] to internal [lat, lon].
 * Use when receiving data from GeoJSON or APIs that return [lon, lat].
 */
export function flipGeoJSON(coords: GeoJSONCoordinate): CoordinateArray {
  return [coords[1], coords[0]];
}

/**
 * Converts internal [lat, lon] to GeoJSON [lon, lat].
 * Use when sending data to GeoJSON APIs.
 */
export function toGeoJSON(coords: CoordinateArray): GeoJSONCoordinate {
  return [coords[1], coords[0]];
}

// -----------------------------------------------------------------------------
// Batch validation
// -----------------------------------------------------------------------------

/**
 * Validates an array of coordinates and returns indices of invalid entries.
 *
 * @param coordinates - Array of [lat, lon] or { lat, lon }
 * @param logErrors - If true, log each invalid coordinate (default: true)
 * @returns Indices of invalid coordinates (empty if all valid)
 */
export function validateBatch(
  coordinates: Array<CoordinateArray | CoordinateObject>,
  logErrors = true
): number[] {
  const invalidIndices: number[] = [];

  coordinates.forEach((coord, index) => {
    let obj: CoordinateObject;
    try {
      obj = Array.isArray(coord) ? arrayToObject(coord) : coord;
    } catch (e) {
      invalidIndices.push(index);
      if (logErrors) {
        console.error('[COORD-VALIDATE] ❌ Invalid coordinate at index', index, ':', coord, (e as Error).message);
      }
      return;
    }
    if (!validateCoordinates(obj)) {
      invalidIndices.push(index);
      if (logErrors) {
        console.error('[COORD-VALIDATE] ❌ Invalid coordinate at index', index, ':', coord);
      }
    }
  });

  return invalidIndices;
}

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

/**
 * Formats coordinates for display (e.g. "25.2532°N, 55.2769°E").
 * Uses N/S for latitude and E/W for longitude based on sign.
 */
export function formatForDisplay(coords: CoordinateObject): string {
  const latDir = coords.lat >= 0 ? 'N' : 'S';
  const lonDir = coords.lon >= 0 ? 'E' : 'W';
  return `${Math.abs(coords.lat).toFixed(4)}°${latDir}, ${Math.abs(coords.lon).toFixed(4)}°${lonDir}`;
}

/**
 * Haversine distance between two points in nautical miles.
 * Uses Earth radius 3440.065 nm.
 *
 * @param from - Start { lat, lon }
 * @param to - End { lat, lon }
 * @returns Distance in nautical miles (always >= 0)
 */
export function haversineDistance(from: CoordinateObject, to: CoordinateObject): number {
  const lat1Rad = (from.lat * Math.PI) / 180;
  const lat2Rad = (to.lat * Math.PI) / 180;
  const deltaLatRad = ((to.lat - from.lat) * Math.PI) / 180;
  const deltaLonRad = ((to.lon - from.lon) * Math.PI) / 180;

  const a =
    Math.sin(deltaLatRad / 2) ** 2 +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLonRad / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_NM * c;
}

// -----------------------------------------------------------------------------
// Logging
// -----------------------------------------------------------------------------

/**
 * Logs a coordinate conversion for debugging (before/after and validation).
 *
 * @param source - Label for the conversion (e.g. "Waypoint 0")
 * @param original - Original value (any shape)
 * @param converted - Converted value (object with lat/lon or [lat, lon])
 * @param options - { verbose: true } to always log; otherwise logs only when invalid
 */
export function logCoordConversion(
  source: string,
  original: unknown,
  converted: unknown,
  options: { verbose?: boolean } = {}
): void {
  let convertedObj: CoordinateObject | null = null;

  if (
    typeof converted === 'object' &&
    converted !== null &&
    'lat' in converted &&
    'lon' in converted &&
    typeof (converted as CoordinateObject).lat === 'number' &&
    typeof (converted as CoordinateObject).lon === 'number'
  ) {
    convertedObj = converted as CoordinateObject;
  } else if (Array.isArray(converted) && converted.length >= 2) {
    try {
      convertedObj = arrayToObject(converted as CoordinateArray);
    } catch {
      convertedObj = null;
    }
  }

  if (convertedObj === null) {
    console.error('[COORD-VALIDATE] ❌ Conversion produced invalid value:', { source, original, converted });
    return;
  }

  const valid = validateCoordinates(convertedObj);
  const status = valid ? '✅ valid' : '❌ invalid';

  if (options.verbose || !valid) {
    console.log('[COORD-VALIDATE] 🔄 Conversion', source, status, {
      original,
      converted: convertedObj,
      lat_in_range: convertedObj.lat >= -90 && convertedObj.lat <= 90,
      lon_in_range: convertedObj.lon >= -180 && convertedObj.lon <= 180,
    });
  }
}

// -----------------------------------------------------------------------------
// Optional helpers (kept for map-viewer and port validation)
// -----------------------------------------------------------------------------

/**
 * Normalizes waypoint-like values to { lat, lon } for map/validation.
 * Handles: Waypoint ({ coordinates: [lat, lon] }), [lat, lon], { lat, lon }.
 * Returns null if the value cannot be parsed (does not throw).
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
