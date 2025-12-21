// Test endpoint for Weather Integration Test
// Call this endpoint via GET to test the complete weather workflow

import { executeWeatherTimelineTool } from '@/lib/tools/weather-timeline';
import { executeMarineWeatherTool } from '@/lib/tools/marine-weather';
import { executeWeatherConsumptionTool } from '@/lib/tools/weather-consumption';
import { executePortWeatherTool } from '@/lib/tools/port-weather';

export const runtime = 'edge';

// Test configuration
const TEST_CONFIG = {
  origin: { lat: 1.29, lon: 103.85 }, // Singapore
  destination: { lat: 25.02, lon: 55.03 }, // Jebel Ali (approximate)
  vessel_speed_knots: 14,
  departure_datetime: '2024-12-25T08:00:00Z',
  sampling_interval_hours: 12,
  base_consumption_mt: 350,
  vessel_heading_deg: 315, // Approximate heading from Singapore to Jebel Ali
  port_code: 'AEJEA',
  port_name: 'Jebel Ali',
  port_lat: 25.02,
  port_lon: 55.03,
  bunkering_duration_hours: 8,
};

export async function GET(req: Request) {
  try {
    const results: any = {
      success: true,
      steps: [],
      summary: {},
    };

    // STEP 1: Weather Timeline
    const waypoints = [TEST_CONFIG.origin, TEST_CONFIG.destination];
    const timelineResult = await executeWeatherTimelineTool({
      waypoints,
      vessel_speed_knots: TEST_CONFIG.vessel_speed_knots,
      departure_datetime: TEST_CONFIG.departure_datetime,
      sampling_interval_hours: TEST_CONFIG.sampling_interval_hours,
    });

    results.steps.push({
      step: 1,
      tool: 'weather-timeline',
      status: 'success',
      positions_generated: timelineResult.length,
      first_position: timelineResult[0],
      last_position: timelineResult[timelineResult.length - 1],
      total_distance_nm: timelineResult[timelineResult.length - 1].distance_from_start_nm,
    });

    // STEP 2: Marine Weather
    const weatherPositions = timelineResult.map((pos) => ({
      lat: pos.lat,
      lon: pos.lon,
      datetime: pos.datetime,
    }));

    const weatherResult = await executeMarineWeatherTool({
      positions: weatherPositions,
    });

    const avgWave = weatherResult.reduce((sum, w) => sum + w.weather.wave_height_m, 0) / weatherResult.length;
    const maxWave = Math.max(...weatherResult.map((w) => w.weather.wave_height_m));
    const avgWind = weatherResult.reduce((sum, w) => sum + w.weather.wind_speed_knots, 0) / weatherResult.length;
    const maxWind = Math.max(...weatherResult.map((w) => w.weather.wind_speed_knots));

    results.steps.push({
      step: 2,
      tool: 'marine-weather',
      status: 'success',
      weather_points: weatherResult.length,
      avg_wave_height_m: avgWave,
      max_wave_height_m: maxWave,
      avg_wind_speed_kt: avgWind,
      max_wind_speed_kt: maxWind,
      first_weather: weatherResult[0],
    });

    // STEP 3: Weather Consumption
    const weatherData = weatherResult.map((w) => ({
      datetime: w.datetime,
      weather: {
        wave_height_m: w.weather.wave_height_m,
        wind_speed_knots: w.weather.wind_speed_knots,
        wind_direction_deg: w.weather.wind_direction_deg,
        sea_state: w.weather.sea_state,
      },
      position: w.position,
    }));

    const consumptionResult = await executeWeatherConsumptionTool({
      weather_data: weatherData,
      base_consumption_mt: TEST_CONFIG.base_consumption_mt,
      vessel_heading_deg: TEST_CONFIG.vessel_heading_deg,
    });

    results.steps.push({
      step: 3,
      tool: 'weather-consumption',
      status: 'success',
      base_consumption_mt: consumptionResult.base_consumption_mt,
      adjusted_consumption_mt: consumptionResult.weather_adjusted_consumption_mt,
      additional_fuel_mt: consumptionResult.additional_fuel_needed_mt,
      increase_percent: consumptionResult.consumption_increase_percent,
      avg_multiplier: consumptionResult.voyage_weather_summary.avg_multiplier,
      weather_alerts_count: consumptionResult.weather_alerts.length,
      weather_summary: consumptionResult.voyage_weather_summary,
    });

    // STEP 4: Port Weather
    const estimatedArrival = timelineResult[timelineResult.length - 1].datetime;

    const portWeatherResult = await executePortWeatherTool({
      bunker_ports: [
        {
          port_code: TEST_CONFIG.port_code,
          port_name: TEST_CONFIG.port_name,
          lat: TEST_CONFIG.port_lat,
          lon: TEST_CONFIG.port_lon,
          estimated_arrival: estimatedArrival,
          bunkering_duration_hours: TEST_CONFIG.bunkering_duration_hours,
        },
      ],
    });

    results.steps.push({
      step: 4,
      tool: 'port-weather',
      status: 'success',
      port: portWeatherResult[0],
    });

    // Summary
    results.summary = {
      total_steps: 4,
      all_passed: true,
      positions_generated: timelineResult.length,
      weather_forecasts: weatherResult.length,
      consumption_increase: consumptionResult.consumption_increase_percent,
      port_bunkering_feasible: portWeatherResult[0].bunkering_feasible,
      port_weather_risk: portWeatherResult[0].weather_risk,
    };

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : String(error),
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}

