// Test endpoint for Port Weather Tool
// Call this endpoint via GET or POST to test the port weather functionality

import { executePortWeatherTool } from '@/lib/tools/port-weather';

// Node.js runtime required for repository access (fs, path modules)
export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    // Default test case: Jebel Ali
    const testPorts = [
      {
        port_code: 'AEJEA',
        port_name: 'Jebel Ali',
        lat: 25.02,
        lon: 55.03,
        estimated_arrival: '2024-12-28T14:00:00Z',
        bunkering_duration_hours: 8,
      },
    ];

    const result = await executePortWeatherTool({ bunker_ports: testPorts });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Checked weather for ${result.length} port(s)`,
        ports: result,
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
    const { bunker_ports } = body;

    if (!bunker_ports || !Array.isArray(bunker_ports) || bunker_ports.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'bunker_ports array is required and must not be empty',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Validate each port
    for (const port of bunker_ports) {
      if (
        !port.port_code ||
        !port.port_name ||
        typeof port.lat !== 'number' ||
        typeof port.lon !== 'number' ||
        !port.estimated_arrival
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Each port must have port_code, port_name, lat, lon, and estimated_arrival',
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

    const result = await executePortWeatherTool({ bunker_ports });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Checked weather for ${result.length} port(s)`,
        ports: result,
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

