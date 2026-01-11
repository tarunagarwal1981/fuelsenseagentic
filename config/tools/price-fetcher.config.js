"use strict";
/**
 * Price Fetcher Tool Configuration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.priceFetcherConfig = void 0;
exports.priceFetcherConfig = {
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
//# sourceMappingURL=price-fetcher.config.js.map