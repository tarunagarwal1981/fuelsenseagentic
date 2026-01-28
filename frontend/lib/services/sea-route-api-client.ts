/**
 * SeaRoute API Client
 * Wrapper for Maritime Route API
 *
 * COORDINATE ORDER:
 * - Input (from / to): [lat, lon] — standard geographic format
 * - Output geometry: [lon, lat] — GeoJSON format; must be converted before use
 * - Conversion: RouteService.convertGeometryToWaypoints() flips to [lat, lon]
 */

import { SeaRouteAPIResponse } from './types';
import { validateCoordinates } from '@/lib/utils/coordinate-validator';

export class SeaRouteAPIClient {
  private baseUrl: string = 'https://maritime-route-api.onrender.com';
  private timeoutMs: number = 20000;

  /**
   * Calculate route between two coordinates.
   *
   * @param params.from - Origin as [lat, lon]
   * @param params.to - Destination as [lat, lon]
   * @returns Route with distance, duration, and geometry in [lon, lat] GeoJSON order
   */
  async calculateRoute(params: {
    from: [number, number]; // [lat, lon]
    to: [number, number]; // [lat, lon]
    speed?: number;
  }): Promise<{
    distance: number;
    geometry: [number, number][]; // [lon, lat] from API — convert before passing to map
    duration: number;
  }> {
    const [fromLat, fromLon] = params.from;
    const [toLat, toLon] = params.to;

    console.log('🌐 [SEAROUTE-API] Validating coordinates before API call...');
    console.log('   Origin [lat, lon]:', params.from);
    console.log('   Destination [lat, lon]:', params.to);

    // Validate origin coordinates
    const originValid = validateCoordinates({ lat: fromLat, lon: fromLon });
    if (!originValid) {
      throw new Error(
        `Invalid origin coordinates: [${fromLat}, ${fromLon}]. ` +
          `Latitude must be -90 to 90, longitude must be -180 to 180.`
      );
    }

    // Validate destination coordinates
    const destValid = validateCoordinates({ lat: toLat, lon: toLon });
    if (!destValid) {
      throw new Error(
        `Invalid destination coordinates: [${toLat}, ${toLon}]. ` +
          `Latitude must be -90 to 90, longitude must be -180 to 180.`
      );
    }

    // Special check for (0, 0) which is highly suspicious
    if (Math.abs(fromLat) < 0.001 && Math.abs(fromLon) < 0.001) {
      console.error('❌ [SEAROUTE-API] Origin coordinates are near (0,0)!');
      throw new Error(
        'Invalid origin: coordinates are (0, 0). This indicates missing or wrong port data. ' +
          'Check that port coordinates are being loaded correctly.'
      );
    }

    if (Math.abs(toLat) < 0.001 && Math.abs(toLon) < 0.001) {
      console.error('❌ [SEAROUTE-API] Destination coordinates are near (0,0)!');
      throw new Error(
        'Invalid destination: coordinates are (0, 0). This indicates missing or wrong port data.'
      );
    }

    console.log('✅ [SEAROUTE-API] Coordinates validated successfully');

    const apiUrl = `${this.baseUrl}/route`;

    const urlParams = new URLSearchParams({
      origin_lon: fromLon.toString(),
      origin_lat: fromLat.toString(),
      dest_lon: toLon.toString(),
      dest_lat: toLat.toString(),
      speed: (params.speed || 14).toString(),
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await fetch(`${apiUrl}?${urlParams.toString()}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
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

      // Before returning, validate first and last waypoint
      if (data.route.coordinates.length > 0) {
        const firstWp = data.route.coordinates[0];
        const lastWp = data.route.coordinates[data.route.coordinates.length - 1];

        console.log('📊 [SEAROUTE-API] API returned geometry (GeoJSON [lon, lat]):');
        console.log('   Waypoint count:', data.route.coordinates.length);
        console.log('   First waypoint:', firstWp);
        console.log('   Last waypoint:', lastWp);

        // Validate first waypoint is valid GeoJSON [lon, lat]
        if (Math.abs(firstWp[0]) > 180 || Math.abs(firstWp[1]) > 90) {
          console.warn('⚠️ [SEAROUTE-API] First waypoint has suspicious coordinates!');
        }

        // Check if first waypoint is near (0, 0)
        if (Math.abs(firstWp[0]) < 0.001 && Math.abs(firstWp[1]) < 0.001) {
          console.error('❌ [SEAROUTE-API] API returned first waypoint at (0, 0)!');
          console.error('   This suggests API received wrong input coordinates.');
          console.error('   Input origin:', params.from);
          console.error('   Input destination:', params.to);
        }
      }

      return {
        distance: data.distance.value,
        geometry: data.route.coordinates,
        duration: data.duration?.value || 0,
      };
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
