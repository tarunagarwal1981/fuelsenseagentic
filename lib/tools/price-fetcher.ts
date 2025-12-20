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
import { FuelPrice, FuelType } from '@/lib/types';

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
export const priceFetcherInputSchema = z.object({
  port_codes: z
    .array(z.string().min(1, 'Port code cannot be empty'))
    .min(1, 'At least one port code is required')
    .max(50, 'Cannot fetch prices for more than 50 ports at once')
    .describe('Array of port codes (UNLOCODE format) to fetch prices for'),

  fuel_types: z
    .array(z.enum(['VLSFO', 'LSGO', 'MGO']))
    .optional()
    .describe('Optional filter for specific fuel types. If not provided, all fuel types are returned.'),
});

/**
 * Error class for price fetcher failures
 */
export class PriceFetcherError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'PriceFetcherError';
  }
}

/**
 * Price data cache - loaded once at module initialization
 */
let pricesCache: FuelPrice[] | null = null;

/**
 * Loads price data from the prices.json file
 * Caches the data for subsequent lookups
 * Works in both Node.js and Edge runtime
 */
async function loadPricesData(): Promise<FuelPrice[]> {
  if (pricesCache) {
    return pricesCache;
  }

  try {
    // Use dynamic import for JSON file (works with resolveJsonModule in tsconfig)
    const pricesModule = await import('@/lib/data/prices.json');
    // JSON imports return the data directly, not as default export
    const prices = Array.isArray(pricesModule)
      ? pricesModule
      : (pricesModule as any).default || pricesModule;

    pricesCache = prices as FuelPrice[];
    return pricesCache;
  } catch (error) {
    throw new PriceFetcherError(
      `Failed to load prices data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'PRICE_DATA_LOAD_ERROR'
    );
  }
}

/**
 * Formats a price with currency symbol
 * 
 * @param price - Price value
 * @param currency - Currency code (e.g., 'USD', 'EUR')
 * @returns Formatted price string
 */
export function formatCurrency(price: number, currency: string = 'USD'): string {
  const currencySymbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CNY: '¥',
  };

  const symbol = currencySymbols[currency] || currency;
  
  // Format with thousand separators and 2 decimal places
  return `${symbol}${price.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Calculates hours since a timestamp
 * 
 * @param timestamp - ISO 8601 timestamp string
 * @returns Number of hours since the timestamp
 */
function hoursSinceUpdate(timestamp: string): number {
  try {
    const updateTime = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - updateTime.getTime();
    return diffMs / (1000 * 60 * 60); // Convert to hours
  } catch (error) {
    return Infinity; // Invalid timestamp
  }
}

/**
 * Checks if a price is considered fresh (< 24 hours old)
 * 
 * @param timestamp - ISO 8601 timestamp string
 * @returns True if price is less than 24 hours old
 */
function isPriceFresh(timestamp: string): boolean {
  return hoursSinceUpdate(timestamp) < 24;
}

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
export async function fetchPrices(
  input: PriceFetcherInput
): Promise<PriceFetcherOutput> {
  // Validate input using Zod schema
  const validatedInput = priceFetcherInputSchema.parse(input);

  const { port_codes, fuel_types } = validatedInput;

  console.log(`\n💰 Fetching prices for ${port_codes.length} port(s)...`);
  if (fuel_types && fuel_types.length > 0) {
    console.log(`   Filter: ${fuel_types.join(', ')}`);
  }

  try {
    // Load price data
    const allPrices = await loadPricesData();
    console.log(`   Available price entries: ${allPrices.length}`);

    // Filter prices by port codes
    const filteredPrices = allPrices.filter((price) =>
      port_codes.includes(price.port_code)
    );

    // Further filter by fuel types if specified
    const finalPrices = fuel_types
      ? filteredPrices.filter((price) => fuel_types.includes(price.fuel_type))
      : filteredPrices;

    // Organize prices by port code
    const pricesByPort: Record<string, PriceData[]> = {};
    const portsNotFound = new Set<string>(port_codes);
    const stalePriceWarnings: Array<{
      port_code: string;
      fuel_type: FuelType;
      hours_old: number;
    }> = [];

    for (const price of finalPrices) {
      // Mark port as found
      portsNotFound.delete(price.port_code);

      // Check price freshness
      const hoursOld = hoursSinceUpdate(price.last_updated);
      const isFresh = isPriceFresh(price.last_updated);

      if (!isFresh) {
        stalePriceWarnings.push({
          port_code: price.port_code,
          fuel_type: price.fuel_type,
          hours_old: Math.round(hoursOld * 10) / 10,
        });
      }

      // Format price
      const formattedPrice = formatCurrency(price.price_per_mt, price.currency);

      // Initialize array if needed
      if (!pricesByPort[price.port_code]) {
        pricesByPort[price.port_code] = [];
      }

      // Add price data
      pricesByPort[price.port_code].push({
        price,
        is_fresh: isFresh,
        hours_since_update: Math.round(hoursOld * 10) / 10,
        formatted_price: formattedPrice,
      });
    }

    // Sort prices by fuel type for consistency
    for (const portCode in pricesByPort) {
      pricesByPort[portCode].sort((a, b) =>
        a.price.fuel_type.localeCompare(b.price.fuel_type)
      );
    }

    const totalPrices = finalPrices.length;
    const portsWithPrices = Object.keys(pricesByPort).length;
    const portsNotFoundArray = Array.from(portsNotFound);

    console.log(`   ✅ Found prices for ${portsWithPrices} port(s)`);
    console.log(`   Total price entries: ${totalPrices}`);
    if (portsNotFoundArray.length > 0) {
      console.log(`   ⚠️  No prices found for: ${portsNotFoundArray.join(', ')}`);
    }
    if (stalePriceWarnings.length > 0) {
      console.log(`   ⚠️  ${stalePriceWarnings.length} stale price(s) detected`);
    }

    return {
      prices_by_port: pricesByPort,
      total_prices: totalPrices,
      ports_with_prices: portsWithPrices,
      ports_not_found: portsNotFoundArray,
      stale_price_warnings: stalePriceWarnings,
    };
  } catch (error) {
    // Re-throw PriceFetcherError as-is
    if (error instanceof PriceFetcherError) {
      throw error;
    }

    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      throw new PriceFetcherError(
        `Input validation failed: ${error.issues.map((e) => e.message).join(', ')}`,
        'VALIDATION_ERROR'
      );
    }

    // Handle unexpected errors
    throw new PriceFetcherError(
      `Unexpected error during price fetching: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'UNEXPECTED_ERROR'
    );
  }
}

/**
 * Tool schema for Claude (Anthropic SDK)
 * This schema is used to register the tool with Claude so it can be called by the AI agent
 */
export const priceFetcherToolSchema = {
  name: 'fetch_fuel_prices',
  description: `Fetch current fuel prices for maritime bunker ports.
    Returns prices for specified ports with metadata including price freshness,
    currency formatting, and warnings for stale prices (> 24 hours old).
    Supports filtering by fuel type (VLSFO, LSGO, MGO).
    Useful for comparing fuel prices across ports or checking current market rates.`,
  input_schema: {
    type: 'object',
    properties: {
      port_codes: {
        type: 'array',
        description: 'Array of port codes (UNLOCODE format) to fetch prices for. Maximum 50 ports.',
        items: {
          type: 'string',
        },
      },
      fuel_types: {
        type: 'array',
        description: 'Optional filter for specific fuel types. If not provided, all available fuel types are returned.',
        items: {
          type: 'string',
          enum: ['VLSFO', 'LSGO', 'MGO'],
        },
      },
    },
    required: ['port_codes'],
  },
} as const;

/**
 * Tool execution wrapper for Claude
 * This function is called by the agent when the tool is invoked
 */
export async function executePriceFetcherTool(
  args: unknown
): Promise<PriceFetcherOutput> {
  return fetchPrices(args as PriceFetcherInput);
}

