/**
 * Route Validator Utility
 * 
 * Validates routes before returning results to catch port identification errors early.
 * Performs geographic sanity checks and compares with known routes.
 */

import { haversineDistance } from './port-lookup';

interface ValidationResult {
  valid: boolean;
  warnings: string[];
  suggestions?: { origin?: string; dest?: string };
}

interface KnownRoute {
  origin_port_code: string;
  destination_port_code: string;
  distance_nm: number;
}

// Known route distances for validation (in nautical miles)
const KNOWN_ROUTES: Record<string, { min: number; max: number }> = {
  'SGSIN-NLRTM': { min: 11000, max: 12000 }, // Singapore → Rotterdam
  'NLRTM-SGSIN': { min: 11000, max: 12000 },
  'AEJEA-NLRTM': { min: 5000, max: 6000 }, // Jebel Ali → Rotterdam
  'NLRTM-AEJEA': { min: 5000, max: 6000 },
  'SGSIN-AEJEA': { min: 10000, max: 11000 }, // Singapore → Jebel Ali
  'AEJEA-SGSIN': { min: 10000, max: 11000 },
  'SGSIN-AEFJR': { min: 3000, max: 3500 }, // Singapore → Fujairah
  'AEFJR-SGSIN': { min: 3000, max: 3500 },
};

/**
 * Validate route makes geographic sense
 */
export async function validateRoute(
  originCode: string,
  destCode: string,
  originQuery: string,
  destQuery: string,
  calculatedDistance?: number
): Promise<ValidationResult> {
  const warnings: string[] = [];
  const suggestions: { origin?: string; dest?: string } = {};

  // Load ports data
  let originCoords: { lat: number; lon: number } | null = null;
  let destCoords: { lat: number; lon: number } | null = null;

  try {
    const portsModule = await import('@/lib/data/ports.json');
    const ports = Array.isArray(portsModule) ? portsModule : (portsModule as any).default || portsModule;

    const originPort = ports.find((p: any) => p.port_code === originCode);
    const destPort = ports.find((p: any) => p.port_code === destCode);

    if (!originPort || !originPort.coordinates) {
      warnings.push(`Origin port ${originCode} not found in database`);
    } else {
      originCoords = originPort.coordinates;
    }

    if (!destPort || !destPort.coordinates) {
      warnings.push(`Destination port ${destCode} not found in database`);
    } else {
      destCoords = destPort.coordinates;
    }
  } catch (error) {
    warnings.push('Failed to load ports data for validation');
  }

  // Calculate straight-line distance if we have coordinates
  if (originCoords && destCoords) {
    const straightLineDistance = haversineDistance(originCoords, destCoords);

    // Check against known routes
    const routeKey = `${originCode}-${destCode}`;
    const knownRoute = KNOWN_ROUTES[routeKey];

    if (knownRoute && calculatedDistance) {
      // Check if calculated distance is within expected range
      if (calculatedDistance < knownRoute.min * 0.9 || calculatedDistance > knownRoute.max * 1.1) {
        warnings.push(
          `Route distance ${calculatedDistance.toFixed(0)}nm is outside expected range ` +
          `(${knownRoute.min}-${knownRoute.max}nm) for ${originCode} → ${destCode}`
        );
      }
    }

    // Check route distance ratio (should be 1.2x - 1.8x straight-line for maritime routes)
    if (calculatedDistance) {
      const ratio = calculatedDistance / straightLineDistance;
      if (ratio > 2.0) {
        warnings.push(
          `Route distance is ${ratio.toFixed(2)}x straight-line distance - unusually long. ` +
          `This may indicate wrong port identification.`
        );
      } else if (ratio < 1.1) {
        warnings.push(
          `Route distance is ${ratio.toFixed(2)}x straight-line distance - unusually short. ` +
          `This may indicate wrong port identification.`
        );
      }
    }

    // Geographic sanity checks
    // Check if route would require impossible paths
    const latDiff = Math.abs(originCoords.lat - destCoords.lat);
    const lonDiff = Math.abs(originCoords.lon - destCoords.lon);

    // Atlantic → Pacific without Panama (rough check)
    if (
      originCoords.lon < -60 &&
      originCoords.lon > -100 &&
      destCoords.lon > 120 &&
      destCoords.lon < 180
    ) {
      warnings.push(
        'Route appears to cross from Atlantic to Pacific - verify Panama Canal passage is included'
      );
    }

    // Mediterranean → Indian Ocean without Suez (rough check)
    if (
      originCoords.lon > 0 &&
      originCoords.lon < 30 &&
      originCoords.lat > 30 &&
      originCoords.lat < 45 &&
      destCoords.lon > 50 &&
      destCoords.lon < 100
    ) {
      warnings.push(
        'Route appears to cross from Mediterranean to Indian Ocean - verify Suez Canal passage is included'
      );
    }
  }

  // Check cached routes if available
  try {
    const cachedRoutesModule = await import('@/lib/data/cached-routes.json');
    const cachedRoutesData = cachedRoutesModule.default || cachedRoutesModule;
    const cachedRoutes = cachedRoutesData.routes || [];

    const matchingRoute = cachedRoutes.find(
      (r: KnownRoute) =>
        (r.origin_port_code === originCode && r.destination_port_code === destCode) ||
        (r.origin_port_code === destCode && r.destination_port_code === originCode)
    );

    if (matchingRoute && calculatedDistance) {
      const deviation = Math.abs(calculatedDistance - matchingRoute.distance_nm);
      const deviationPercent = (deviation / matchingRoute.distance_nm) * 100;

      if (deviationPercent > 10) {
        warnings.push(
          `Calculated distance (${calculatedDistance.toFixed(0)}nm) differs from cached route ` +
          `(${matchingRoute.distance_nm.toFixed(0)}nm) by ${deviationPercent.toFixed(1)}%`
        );
      }
    }
  } catch (error) {
    // Cached routes not available, skip this check
  }

  // Generate suggestions if warnings indicate wrong port
  if (warnings.some(w => w.includes('wrong port'))) {
    // Try to suggest alternatives based on query
    if (originQuery.toLowerCase().includes('rotterdam') && originCode !== 'NLRTM') {
      suggestions.origin = 'NLRTM';
    }
    if (destQuery.toLowerCase().includes('rotterdam') && destCode !== 'NLRTM') {
      suggestions.dest = 'NLRTM';
    }
    if (originQuery.toLowerCase().includes('dubai') && !originCode.startsWith('AE')) {
      suggestions.origin = 'AEJEA';
    }
    if (destQuery.toLowerCase().includes('dubai') && !destCode.startsWith('AE')) {
      suggestions.dest = 'AEJEA';
    }
  }

  const valid = warnings.length === 0 || warnings.every(w => !w.includes('not found'));

  return {
    valid,
    warnings,
    suggestions: Object.keys(suggestions).length > 0 ? suggestions : undefined,
  };
}

