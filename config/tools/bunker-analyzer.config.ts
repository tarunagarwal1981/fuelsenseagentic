/**
 * Bunker Analyzer Tool Configuration
 */

export interface BunkerAnalyzerToolConfig {
  name: string;
  description: string;
  implementation: string;
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  timeout?: number;
  retries?: number;
}

export const bunkerAnalyzerConfig: BunkerAnalyzerToolConfig = {
  name: 'analyze_bunker_options',
  description: 'Analyze and rank bunker options based on cost and route deviation',
  implementation: '@/lib/tools/bunker-analyzer',
  inputSchema: {
    type: 'object',
    properties: {
      route: { type: 'object' },
      ports: { type: 'array' },
      prices: { type: 'array' },
      fuel_quantity_mt: { type: 'number' },
      vessel_speed_knots: { type: 'number' },
      vessel_consumption_mt_per_day: { type: 'number' },
    },
    required: ['route', 'ports', 'prices'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      recommendations: { type: 'array' },
    },
  },
  timeout: 30000,
  retries: 2,
};

