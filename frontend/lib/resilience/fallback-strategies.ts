/**
 * Fallback strategies for graceful degradation when tools fail completely.
 * Provides degraded responses when circuit breakers and retries are exhausted.
 */

import { getCachedRoute } from '@/lib/multi-agent/optimizations';
import { logError } from '@/lib/monitoring/axiom-logger';
import { getCorrelationId } from '@/lib/monitoring/correlation-context';

/**
 * Calculate straight-line distance between two coordinates using Haversine formula
 */
function calculateStraightLineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3440; // Earth radius in nautical miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get port coordinates from port code (simplified - would use port database in production)
 */
function getPortCoordinates(portCode: string): { lat: number; lon: number } | null {
  // In production, this would query a port database
  // For now, return null - will use cached route if available
  return null;
}

/**
 * Fallback response for calculateRoute tool
 * Uses straight-line distance estimation or cached route
 */
export function getRouteFallback(
  originPortCode: string,
  destinationPortCode: string,
  error: unknown
): {
  distance_nm: number;
  estimated_hours: number;
  waypoints: Array<{ lat: number; lon: number }>;
  route_type: string;
  origin_port_code: string;
  destination_port_code: string;
  _from_cache?: boolean;
  _degraded: boolean;
  _degradation_reason: string;
} | null {
  const cid = getCorrelationId() || 'unknown';
  
  // First try cached route
  const cachedRoute = getCachedRoute(originPortCode, destinationPortCode);
  if (cachedRoute) {
    logError(cid, new Error('[FALLBACK] Using cached route'), {
      tool: 'calculate_route',
      fallback_type: 'cached_route',
      origin: originPortCode,
      destination: destinationPortCode,
    });
    return {
      ...cachedRoute,
      _degraded: true,
      _degradation_reason: 'Route API unavailable, using cached route',
    };
  }
  
  // Try to get port coordinates for straight-line calculation
  const originCoords = getPortCoordinates(originPortCode);
  const destCoords = getPortCoordinates(destinationPortCode);
  
  if (originCoords && destCoords) {
    const distance = calculateStraightLineDistance(
      originCoords.lat,
      originCoords.lon,
      destCoords.lat,
      destCoords.lon
    );
    const estimatedHours = Math.round(distance / 14); // Assume 14 knots average speed
    
    logError(cid, new Error('[FALLBACK] Using straight-line distance estimation'), {
      tool: 'calculate_route',
      fallback_type: 'straight_line',
      origin: originPortCode,
      destination: destinationPortCode,
      distance_nm: distance,
    });
    
    return {
      distance_nm: Math.round(distance),
      estimated_hours: estimatedHours,
      waypoints: [originCoords, destCoords],
      route_type: 'straight-line estimation (degraded mode)',
      origin_port_code: originPortCode,
      destination_port_code: destinationPortCode,
      _degraded: true,
      _degradation_reason: 'Route API unavailable, using straight-line distance estimation',
    };
  }
  
  // No fallback available
  return null;
}

/**
 * Fallback response for findBunkerPorts tool
 * Returns last cached port list with warning
 */
export function getBunkerPortsFallback(error: unknown): {
  ports: Array<{
    port: {
      port_code: string;
      name: string;
      country: string;
      coordinates: { lat: number; lon: number };
      fuel_capabilities: string[];
    };
    distance_from_route_nm: number;
  }>;
  _degraded: boolean;
  _degradation_reason: string;
  warning?: string;
} | null {
  const cid = getCorrelationId() || 'unknown';
  
  // In production, this would load from a persistent cache or database
  // For now, return empty array with warning
  logError(cid, new Error('[FALLBACK] Port finder unavailable'), {
    tool: 'find_bunker_ports',
    fallback_type: 'empty_with_warning',
  });
  
  return {
    ports: [],
    _degraded: true,
    _degradation_reason: 'Port finder API unavailable',
    warning: 'Unable to fetch current bunker port list. Please try again later or contact support.',
  };
}

/**
 * Fallback response for getFuelPrices tool
 * Uses average historical prices with staleness warning
 */
export function getFuelPricesFallback(
  portCodes: string[],
  error: unknown
): {
  prices_by_port: Record<string, Array<{
    price: {
      port_code: string;
      fuel_type: string;
      price_per_mt: number;
      currency: string;
      last_updated: string;
    };
    is_fresh: boolean;
  }>>;
  _degraded: boolean;
  _degradation_reason: string;
  warning?: string;
} | null {
  const cid = getCorrelationId() || 'unknown';
  
  // In production, this would load historical averages from a database
  // For now, return estimated prices with warning
  const historicalAveragePrices = {
    VLSFO: 650, // USD per MT (example)
    LSGO: 700,
    MGO: 750,
  };
  
  const pricesByPort: Record<string, Array<{
    price: {
      port_code: string;
      fuel_type: string;
      price_per_mt: number;
      currency: string;
      last_updated: string;
    };
    is_fresh: boolean;
  }>> = {};
  
  for (const portCode of portCodes) {
    pricesByPort[portCode] = Object.entries(historicalAveragePrices).map(([fuelType, price]) => ({
      price: {
        port_code: portCode,
        fuel_type: fuelType,
        price_per_mt: price,
        currency: 'USD',
        last_updated: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
      },
      is_fresh: false,
    }));
  }
  
  logError(cid, new Error('[FALLBACK] Using historical average prices'), {
    tool: 'get_fuel_prices',
    fallback_type: 'historical_average',
    port_codes: portCodes,
  });
  
  return {
    prices_by_port: pricesByPort,
    _degraded: true,
    _degradation_reason: 'Price API unavailable, using historical averages',
    warning: 'Current fuel prices unavailable. Using historical average prices (may be outdated by 7+ days).',
  };
}

/**
 * Fallback response for analyzeBunkerOptions tool
 * Returns "insufficient data" message
 */
export function getBunkerAnalysisFallback(error: unknown): {
  recommendations: Array<{
    port_code: string;
    port_name: string;
    error: string;
  }>;
  error_message: string;
  _degraded: boolean;
  _degradation_reason: string;
} | null {
  const cid = getCorrelationId() || 'unknown';
  
  logError(cid, new Error('[FALLBACK] Bunker analysis unavailable'), {
    tool: 'analyze_bunker_options',
    fallback_type: 'insufficient_data',
  });
  
  return {
    recommendations: [],
    error_message: 'Bunker analysis unavailable due to missing data. Please ensure route, ports, and prices are available.',
    _degraded: true,
    _degradation_reason: 'Analysis API unavailable or insufficient data',
  };
}

/**
 * Check if a tool response indicates a fallback/degraded response
 */
export function isFallbackResponse(response: any): boolean {
  if (!response || typeof response !== 'object') return false;
  
  // Check for circuit breaker fallback indicators
  if (response.error && typeof response.error === 'string') {
    if (
      response.error.includes('Circuit open') ||
      response.error.includes('unavailable') ||
      response.error.includes('temporarily unavailable')
    ) {
      return true;
    }
  }
  
  // Check for explicit degraded flag
  if (response._degraded === true) {
    return true;
  }
  
  // Check for degradation reason
  if (response._degradation_reason) {
    return true;
  }
  
  return false;
}

/**
 * Get fallback response for a specific tool
 */
export function getFallbackResponse(
  toolName: string,
  error: unknown,
  context: Record<string, any>
): any | null {
  switch (toolName) {
    case 'calculate_route':
    case 'calculate_weather_timeline':
      return getRouteFallback(
        context.origin_port_code || context.origin,
        context.destination_port_code || context.destination,
        error
      );
    
    case 'find_bunker_ports':
      return getBunkerPortsFallback(error);
    
    case 'get_fuel_prices':
      return getFuelPricesFallback(context.port_codes || [], error);
    
    case 'analyze_bunker_options':
      return getBunkerAnalysisFallback(error);
    
    default:
      return null;
  }
}

/**
 * Create a degraded response with partial data
 */
export function createDegradedResponse(
  partialData: any,
  missingComponents: string[]
): {
  data: any;
  _degraded: boolean;
  _missing_components: string[];
  _degradation_reason: string;
} {
  return {
    data: partialData,
    _degraded: true,
    _missing_components: missingComponents,
    _degradation_reason: `Missing components: ${missingComponents.join(', ')}`,
  };
}
