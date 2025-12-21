// Test endpoint for Marine Weather Tool
// Call this endpoint via GET or POST to test the marine weather functionality

import { executeMarineWeatherTool } from '@/lib/tools/marine-weather';

export const runtime = 'edge';

export async function GET(req: Request) {
  try {
    // Default test case: Singapore to Jebel Ali positions
    const positions = [
      { lat: 1.29, lon: 103.85, datetime: '2024-12-25T08:00:00Z' },
      { lat: 5.50, lon: 95.32, datetime: '2024-12-26T08:00:00Z' },
    ];

    const result = await executeMarineWeatherTool({ positions });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Fetched weather for ${result.length} positions`,
        weather: result,
        summary: {
          total_positions: result.length,
          first_position: result[0],
          last_position: result[result.length - 1],
          sea_states: [...new Set(result.map((r) => r.weather.sea_state))],
          confidence_levels: [...new Set(result.map((r) => r.forecast_confidence))],
        },
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
    const { positions } = body;

    if (!positions || !Array.isArray(positions) || positions.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'positions array is required and must not be empty',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Validate each position
    for (const pos of positions) {
      if (
        typeof pos.lat !== 'number' ||
        typeof pos.lon !== 'number' ||
        typeof pos.datetime !== 'string'
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Each position must have lat (number), lon (number), and datetime (string)',
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
    }

    const result = await executeMarineWeatherTool({ positions });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Fetched weather for ${result.length} positions`,
        weather: result,
        summary: {
          total_positions: result.length,
          first_position: result[0],
          last_position: result[result.length - 1],
          sea_states: [...new Set(result.map((r) => r.weather.sea_state))],
          confidence_levels: [...new Set(result.map((r) => r.forecast_confidence))],
        },
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

