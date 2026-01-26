/**
 * Open-Meteo API Client
 * Wrapper for Open-Meteo Marine Weather API
 */

export interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  hourly_units: {
    time: string;
    wave_height: string;
    wind_speed_10m: string;
    wind_direction_10m: string;
  };
  hourly: {
    time: string[];
    wave_height: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
  };
}

export class OpenMeteoAPIClient {
  private baseUrl: string = 'https://marine-api.open-meteo.com/v1/marine';
  private timeoutMs: number = 20000;

  /**
   * Fetch marine weather for a specific location and date
   */
  async fetchMarine(params: {
    latitude: number;
    longitude: number;
    date: Date;
  }): Promise<{
    waveHeight: number;
    windSpeed: number; // in knots
    windDirection: number; // in degrees
    seaState: string;
  }> {
    const urlParams = new URLSearchParams({
      latitude: params.latitude.toString(),
      longitude: params.longitude.toString(),
      hourly: 'wave_height,wind_speed_10m,wind_direction_10m',
      forecast_days: '16',
      timezone: 'UTC',
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}?${urlParams.toString()}`, {
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
          `Open-Meteo API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = (await response.json()) as OpenMeteoResponse;

      if (!data || !data.hourly) {
        throw new Error('Invalid response format: missing hourly data');
      }

      if (
        !Array.isArray(data.hourly.time) ||
        !Array.isArray(data.hourly.wave_height) ||
        !Array.isArray(data.hourly.wind_speed_10m) ||
        !Array.isArray(data.hourly.wind_direction_10m)
      ) {
        throw new Error('Invalid response format: missing required hourly arrays');
      }

      // Find the closest time to the requested date
      const targetTime = params.date.toISOString();
      const times = data.hourly.time;
      let closestIndex = 0;
      let minDiff = Infinity;

      for (let i = 0; i < times.length; i++) {
        const diff = Math.abs(
          new Date(times[i]).getTime() - new Date(targetTime).getTime()
        );
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = i;
        }
      }

      // Extract weather data for the closest time
      const waveHeight = data.hourly.wave_height[closestIndex] || 0;
      const windSpeedMs = data.hourly.wind_speed_10m[closestIndex] || 0;
      const windDirection = data.hourly.wind_direction_10m[closestIndex] || 0;

      // Convert wind speed from m/s to knots
      const windSpeedKnots = windSpeedMs * 1.944;

      // Classify sea state
      const seaState = this.classifySeaState(waveHeight);

      return {
        waveHeight,
        windSpeed: windSpeedKnots,
        windDirection,
        seaState,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          `Open-Meteo API request timed out after ${this.timeoutMs / 1000} seconds`
        );
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Network error: Unable to reach Open-Meteo API');
      }

      throw error;
    }
  }

  /**
   * Classify sea state based on wave height
   */
  private classifySeaState(waveHeightM: number): string {
    if (waveHeightM < 0.5) {
      return 'Calm';
    } else if (waveHeightM < 1.25) {
      return 'Slight';
    } else if (waveHeightM < 2.5) {
      return 'Moderate';
    } else if (waveHeightM < 4.0) {
      return 'Rough';
    } else if (waveHeightM < 6.0) {
      return 'Very Rough';
    } else {
      return 'High';
    }
  }
}
