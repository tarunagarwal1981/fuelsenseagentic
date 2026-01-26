// Test endpoint for Weather Consumption Tool
// Call this endpoint via GET or POST to test the weather consumption functionality

import { executeWeatherConsumptionTool } from '@/lib/tools/weather-consumption';

// Node.js runtime required for repository access
export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    // Default test case
    const testWeather = [
      {
        datetime: '2024-12-25T08:00:00Z',
        weather: {
          wave_height_m: 2.0,
          wind_speed_knots: 18,
          wind_direction_deg: 90,
          sea_state: 'Moderate',
        },
        position: { lat: 1.29, lon: 103.85 },
      },
      {
        datetime: '2024-12-26T08:00:00Z',
        weather: {
          wave_height_m: 3.5,
          wind_speed_knots: 25,
          wind_direction_deg: 0,
          sea_state: 'Rough',
        },
        position: { lat: 5.50, lon: 95.32 },
      },
    ];

    const result = await executeWeatherConsumptionTool({
      weather_data: testWeather,
      base_consumption_mt: 750,
      vessel_heading_deg: 45,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Weather consumption calculated successfully',
        result,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { weather_data, base_consumption_mt, vessel_heading_deg, fuel_type_breakdown } = body;

    if (!weather_data || !Array.isArray(weather_data) || weather_data.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'weather_data array is required and must not be empty',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    if (typeof base_consumption_mt !== 'number' || base_consumption_mt <= 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'base_consumption_mt must be a positive number',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    if (typeof vessel_heading_deg !== 'number' || vessel_heading_deg < 0 || vessel_heading_deg > 360) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'vessel_heading_deg must be a number between 0 and 360',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const result = await executeWeatherConsumptionTool({
      weather_data,
      base_consumption_mt,
      vessel_heading_deg,
      fuel_type_breakdown,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Weather consumption calculated successfully',
        result,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
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

