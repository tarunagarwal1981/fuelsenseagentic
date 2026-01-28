/**
 * SeaRoute API Client
 * Wrapper for Maritime Route API
 *
 * Accepts port codes/names OR coordinates:
 * - Port code/name (string): API resolves coordinates from its database
 * - Coordinates [lat, lon]: used as-is (validated; (0,0) rejected)
 *
 * COORDINATE ORDER:
 * - Input (from / to): string (port code) OR [lat, lon]
 * - Output geometry: [lon, lat] — GeoJSON format; convert before use
 */

import { SeaRouteAPIResponse } from './types';
import { validateCoordinates } from '@/lib/utils/coordinate-validator';

export interface SeaRouteCalculateRouteResult {
  distance: number;
  geometry: [number, number][]; // [lon, lat] from API
  duration: number;
  /** Resolved origin from API when port code/name was used */
  originResolved?: { coordinates: [number, number]; name?: string };
  /** Resolved destination from API when port code/name was used */
  destinationResolved?: { coordinates: [number, number]; name?: string };
}

export class SeaRouteAPIClient {
  private baseUrl: string = 'https://maritime-route-api.onrender.com';
  private timeoutMs: number = 20000;

  /**
   * Calculate route between two points (port code/name OR coordinates).
   *
   * @param params.from - Origin: port code (e.g. "AEJEA") or [lat, lon]
   * @param params.to - Destination: port code or [lat, lon]
   * @returns Route with distance, duration, geometry; optional resolved origin/destination from API
   */
  async calculateRoute(params: {
    from: string | [number, number];
    to: string | [number, number];
    speed?: number;
  }): Promise<SeaRouteCalculateRouteResult> {
    const apiUrl = `${this.baseUrl}/route`;
    const queryParams: Record<string, string> = {
      speed: (params.speed || 14).toString(),
    };

    // Handle origin (API expects 'from' for port code, 'origin_lat/origin_lon' for coordinates)
    if (typeof params.from === 'string') {
      queryParams.from = params.from;
      console.log('🌐 [SEAROUTE-API] Origin: Port code:', params.from);
    } else {
      const [fromLat, fromLon] = params.from;
      const originValid = validateCoordinates({ lat: fromLat, lon: fromLon });
      if (!originValid) {
        throw new Error(
          `Invalid origin coordinates: [${fromLat}, ${fromLon}]. ` +
            `Latitude must be -90 to 90, longitude must be -180 to 180.`
        );
      }
      if (Math.abs(fromLat) < 0.001 && Math.abs(fromLon) < 0.001) {
        console.error('❌ [SEAROUTE-API] Origin coordinates are (0,0)!');
        throw new Error(
          'Invalid origin coordinates (0,0). Port data is corrupted. Use port code instead of coordinates.'
        );
      }
      queryParams.origin_lat = fromLat.toString();
      queryParams.origin_lon = fromLon.toString();
      console.log('🌐 [SEAROUTE-API] Origin: Coordinates [lat,lon]:', params.from);
    }

    // Handle destination (API expects 'to' for port code, 'dest_lat/dest_lon' for coordinates)
    if (typeof params.to === 'string') {
      queryParams.to = params.to;
      console.log('🌐 [SEAROUTE-API] Destination: Port code:', params.to);
    } else {
      const [toLat, toLon] = params.to;
      const destValid = validateCoordinates({ lat: toLat, lon: toLon });
      if (!destValid) {
        throw new Error(
          `Invalid destination coordinates: [${toLat}, ${toLon}]. ` +
            `Latitude must be -90 to 90, longitude must be -180 to 180.`
        );
      }
      if (Math.abs(toLat) < 0.001 && Math.abs(toLon) < 0.001) {
        console.error('❌ [SEAROUTE-API] Destination coordinates are (0,0)!');
        throw new Error(
          'Invalid destination coordinates (0,0). Use port code instead.'
        );
      }
      queryParams.dest_lat = toLat.toString();
      queryParams.dest_lon = toLon.toString();
      console.log('🌐 [SEAROUTE-API] Destination: Coordinates [lat,lon]:', params.to);
    }

    const urlParams = new URLSearchParams(queryParams);
    console.log('🌐 [SEAROUTE-API] API URL:', `${apiUrl}?${urlParams.toString()}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await fetch(`${apiUrl}?${urlParams.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `SeaRoute API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = (await response.json()) as SeaRouteAPIResponse;

      if (!data || data.status !== 'success') {
        throw new Error(`API returned unsuccessful status: ${data?.status || 'unknown'}`);
      }

      if (!data.distance || typeof data.distance.value !== 'number') {
        throw new Error('Invalid response format: missing or invalid distance field');
      }

      if (!data.route || !Array.isArray(data.route.coordinates)) {
        throw new Error('Invalid response format: missing or invalid route coordinates');
      }

      if (data.route.coordinates.length > 0) {
        const firstWp = data.route.coordinates[0];
        const lastWp = data.route.coordinates[data.route.coordinates.length - 1];
        console.log('📊 [SEAROUTE-API] API returned geometry (GeoJSON [lon, lat]):');
        console.log('   Waypoint count:', data.route.coordinates.length);
        console.log('   First waypoint:', firstWp);
        console.log('   Last waypoint:', lastWp);
        if (Math.abs(firstWp[0]) > 180 || Math.abs(firstWp[1]) > 90) {
          console.warn('⚠️ [SEAROUTE-API] First waypoint has suspicious coordinates!');
        }
        if (Math.abs(firstWp[0]) < 0.001 && Math.abs(firstWp[1]) < 0.001) {
          console.error('❌ [SEAROUTE-API] API returned first waypoint at (0, 0)!');
          console.error('   Input origin:', params.from);
          console.error('   Input destination:', params.to);
        }
      }

      const result: SeaRouteCalculateRouteResult = {
        distance: data.distance.value,
        geometry: data.route.coordinates,
        duration: data.duration?.value || 0,
      };
      if (data.from?.coordinates) {
        result.originResolved = {
          coordinates: data.from.coordinates,
          name: data.from.name,
        };
      }
      if (data.to?.coordinates) {
        result.destinationResolved = {
          coordinates: data.to.coordinates,
          name: data.to.name,
        };
      }

      console.log('✅ [SEAROUTE-API] Route calculated successfully');
      console.log('   Distance:', result.distance, 'nm');
      console.log('   Waypoints:', result.geometry.length);

      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          `SeaRoute API request timed out after ${this.timeoutMs / 1000} seconds`
        );
      }
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Network error: Unable to reach SeaRoute API');
      }
      throw error;
    }
  }
}
