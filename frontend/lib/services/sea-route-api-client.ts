/**
 * SeaRoute API Client
 * Wrapper for Maritime Route API
 */

import { SeaRouteAPIResponse } from './types';

export class SeaRouteAPIClient {
  private baseUrl: string = 'https://maritime-route-api.onrender.com';
  private timeoutMs: number = 20000;

  /**
   * Calculate route between two coordinates
   */
  async calculateRoute(params: {
    from: [number, number]; // [lat, lon]
    to: [number, number]; // [lat, lon]
    speed?: number;
  }): Promise<{
    distance: number;
    geometry: [number, number][]; // [lon, lat] from API
    duration: number;
  }> {
    const apiUrl = `${this.baseUrl}/route`;
    const [fromLat, fromLon] = params.from;
    const [toLat, toLon] = params.to;

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
