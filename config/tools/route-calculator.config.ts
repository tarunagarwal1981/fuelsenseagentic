/**
 * Route Calculator Tool Configuration
 * 
 * Configuration for the route calculator tool that calculates
 * optimal maritime routes between ports.
 */

export interface RouteCalculatorToolConfig {
  name: string;
  description: string;
  implementation: string; // Path to implementation
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  timeout?: number;
  retries?: number;
}

export const routeCalculatorConfig: RouteCalculatorToolConfig = {
  name: 'calculate_route',
  description: 'Calculate optimal maritime route between two ports',
  implementation: '@/lib/tools/route-calculator',
  inputSchema: {
    type: 'object',
    properties: {
      origin_port_code: { type: 'string' },
      destination_port_code: { type: 'string' },
      vessel_speed_knots: { type: 'number', default: 14 },
    },
    required: ['origin_port_code', 'destination_port_code'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      distance_nm: { type: 'number' },
      estimated_hours: { type: 'number' },
      waypoints: { type: 'array' },
    },
  },
  timeout: 30000,
  retries: 2,
};

