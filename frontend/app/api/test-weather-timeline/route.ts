// Test endpoint for Weather Timeline Tool
// Call this endpoint via GET or POST to test the weather timeline functionality

import { executeWeatherTimelineTool } from '@/lib/tools/weather-timeline';

export const runtime = 'edge';

export async function GET(req: Request) {
  try {
    // Default test case: Singapore to Jebel Ali
    const testWaypoints = [
      { lat: 1.29, lon: 103.85 }, // Singapore
      { lat: 22.54, lon: 59.08 }, // Jebel Ali
    ];

    const result = await executeWeatherTimelineTool({
      waypoints: testWaypoints,
      vessel_speed_knots: 14,
      departure_datetime: '2024-12-25T08:00:00Z',
      sampling_interval_hours: 12,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Generated ${result.length} positions`,
        positions: result,
        summary: {
          total_positions: result.length,
          first_position: result[0],
          last_position: result[result.length - 1],
          total_distance_nm: result[result.length - 1]?.distance_from_start_nm || 0,
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
    const {
      waypoints,
      vessel_speed_knots,
      departure_datetime,
      sampling_interval_hours = 12,
    } = body;

    if (!waypoints || !Array.isArray(waypoints) || waypoints.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'waypoints array is required and must not be empty',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    if (!vessel_speed_knots || vessel_speed_knots < 5 || vessel_speed_knots > 30) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'vessel_speed_knots must be between 5 and 30',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    if (!departure_datetime) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'departure_datetime is required (ISO 8601 format)',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const result = await executeWeatherTimelineTool({
      waypoints,
      vessel_speed_knots,
      departure_datetime,
      sampling_interval_hours,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Generated ${result.length} positions`,
        positions: result,
        summary: {
          total_positions: result.length,
          first_position: result[0],
          last_position: result[result.length - 1],
          total_distance_nm: result[result.length - 1]?.distance_from_start_nm || 0,
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

