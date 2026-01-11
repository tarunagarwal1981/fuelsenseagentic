/**
 * Port Finder Tool Configuration
 */

export interface PortFinderToolConfig {
  name: string;
  description: string;
  implementation: string;
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  timeout?: number;
  retries?: number;
}

export const portFinderConfig: PortFinderToolConfig = {
  name: 'find_ports_near_route',
  description: 'Find bunker ports near a shipping route',
  implementation: '@/lib/tools/port-finder',
  inputSchema: {
    type: 'object',
    properties: {
      route_waypoints: { type: 'array' },
      max_deviation_nm: { type: 'number', default: 150 },
    },
    required: ['route_waypoints'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      ports: { type: 'array' },
    },
  },
  timeout: 30000,
  retries: 2,
};

