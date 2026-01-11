/**
 * Price Fetcher Tool Configuration
 */

export interface PriceFetcherToolConfig {
  name: string;
  description: string;
  implementation: string;
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  timeout?: number;
  retries?: number;
}

export const priceFetcherConfig: PriceFetcherToolConfig = {
  name: 'fetch_fuel_prices',
  description: 'Fetch current fuel prices for specified ports',
  implementation: '@/lib/tools/price-fetcher',
  inputSchema: {
    type: 'object',
    properties: {
      port_codes: { type: 'array', items: { type: 'string' } },
      fuel_types: { type: 'array', items: { type: 'string' } },
    },
    required: ['port_codes'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      prices: { type: 'array' },
    },
  },
  timeout: 30000,
  retries: 2,
};

