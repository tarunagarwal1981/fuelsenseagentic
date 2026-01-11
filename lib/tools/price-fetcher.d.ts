/**
 * Price Fetcher Tool
 *
 * Fetches current fuel prices for maritime bunker ports.
 * Loads price data from the prices database and provides filtering
 * and validation capabilities.
 *
 * Features:
 * - Fetch prices for multiple ports at once
 * - Filter by fuel type (VLSFO, LSGO, MGO)
 * - Price freshness validation
 * - Graceful handling of missing data
 * - Currency formatting
 */
import { z } from 'zod';
import { FuelPrice, FuelType } from '../types';
/**
 * Input parameters for price fetcher
 */
export interface PriceFetcherInput {
    /** Array of port codes to fetch prices for */
    port_codes: string[];
    /** Optional filter for specific fuel types */
    fuel_types?: FuelType[];
}
/**
 * Price data with metadata
 */
export interface PriceData {
    /** Fuel price information */
    price: FuelPrice;
    /** Whether the price is considered fresh (< 24 hours old) */
    is_fresh: boolean;
    /** Hours since last update */
    hours_since_update: number;
    /** Formatted price string */
    formatted_price: string;
}
/**
 * Output from price fetcher
 */
export interface PriceFetcherOutput {
    /** Map of port_code to array of price data */
    prices_by_port: Record<string, PriceData[]>;
    /** Total number of prices found */
    total_prices: number;
    /** Number of ports with prices found */
    ports_with_prices: number;
    /** Number of ports requested but not found */
    ports_not_found: string[];
    /** Warnings about stale prices */
    stale_price_warnings: Array<{
        port_code: string;
        fuel_type: FuelType;
        hours_old: number;
    }>;
}
/**
 * Zod schema for input validation
 */
export declare const priceFetcherInputSchema: z.ZodObject<{
    port_codes: z.ZodArray<z.ZodString, "many">;
    fuel_types: z.ZodOptional<z.ZodArray<z.ZodEnum<["VLSFO", "LSGO", "MGO"]>, "many">>;
}, "strip", z.ZodTypeAny, {
    port_codes: string[];
    fuel_types?: ("VLSFO" | "LSGO" | "MGO")[] | undefined;
}, {
    port_codes: string[];
    fuel_types?: ("VLSFO" | "LSGO" | "MGO")[] | undefined;
}>;
/**
 * Error class for price fetcher failures
 */
export declare class PriceFetcherError extends Error {
    readonly code: string;
    constructor(message: string, code: string);
}
/**
 * Formats a price with currency symbol
 *
 * @param price - Price value
 * @param currency - Currency code (e.g., 'USD', 'EUR')
 * @returns Formatted price string
 */
export declare function formatCurrency(price: number, currency?: string): string;
/**
 * Main function to fetch prices for ports
 *
 * This function:
 * 1. Validates input parameters using Zod
 * 2. Loads price data from the database
 * 3. Filters prices by port codes and optional fuel types
 * 4. Checks price freshness and generates warnings
 * 5. Formats prices with currency
 * 6. Returns organized price data
 *
 * @param input - Price fetcher parameters
 * @returns Price data organized by port code
 * @throws PriceFetcherError - If validation fails or data loading fails
 */
export declare function fetchPrices(input: PriceFetcherInput): Promise<PriceFetcherOutput>;
/**
 * Tool schema for Claude (Anthropic SDK)
 * This schema is used to register the tool with Claude so it can be called by the AI agent
 */
export declare const priceFetcherToolSchema: {
    readonly name: "fetch_fuel_prices";
    readonly description: "Fetch current fuel prices for maritime bunker ports.\n    Returns prices for specified ports with metadata including price freshness,\n    currency formatting, and warnings for stale prices (> 24 hours old).\n    Supports filtering by fuel type (VLSFO, LSGO, MGO).\n    Useful for comparing fuel prices across ports or checking current market rates.";
    readonly input_schema: {
        readonly type: "object";
        readonly properties: {
            readonly port_codes: {
                readonly type: "array";
                readonly description: "Array of port codes (UNLOCODE format) to fetch prices for. Maximum 50 ports.";
                readonly items: {
                    readonly type: "string";
                };
            };
            readonly fuel_types: {
                readonly type: "array";
                readonly description: "Optional filter for specific fuel types. If not provided, all available fuel types are returned.";
                readonly items: {
                    readonly type: "string";
                    readonly enum: readonly ["VLSFO", "LSGO", "MGO"];
                };
            };
        };
        readonly required: readonly ["port_codes"];
    };
};
/**
 * Tool execution wrapper for Claude
 * This function is called by the agent when the tool is invoked
 */
export declare function executePriceFetcherTool(args: unknown): Promise<PriceFetcherOutput>;
//# sourceMappingURL=price-fetcher.d.ts.map