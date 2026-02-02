/**
 * Price Fetcher Tool
 * 
 * Thin wrapper around PriceRepository that fetches current fuel prices for maritime bunker ports.
 * Uses the service layer for price data access.
 * 
 * Features:
 * - Fetch prices for multiple ports at once
 * - Filter by fuel type (VLSFO, LSGO, MGO)
 * - Price freshness validation
 * - Graceful handling of missing data
 * - Currency formatting
 */

import { z } from 'zod';
import { FuelType } from '@/lib/types';
import { ServiceContainer } from '@/lib/repositories/service-container';

/**
 * Input parameters for price fetcher
 */
export interface PriceFetcherInput {
  /** Array of port codes (or port names when code is empty) to fetch prices for */
  port_codes: string[];
  /** Optional parallel array of port names for name-based API lookup (fuelsense.bunker has port_code NULL) */
  port_names?: string[];
  /** Optional filter for specific fuel types */
  fuel_types?: FuelType[];
}

/**
 * Price data with metadata
 */
export interface PriceData {
  /** Fuel price information */
  price: {
    fuel_type: string;
    price_per_mt: number;
    currency: string;
  };
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
    .array(z.string().min(1, 'Port code or identifier cannot be empty'))
    .min(1, 'At least one port code or name is required')
    .max(50, 'Cannot fetch prices for more than 50 ports at once')
    .describe('Array of port codes (UNLOCODE) or port names to fetch prices for'),

  port_names: z
    .array(z.string())
    .optional()
    .describe('Optional parallel array of port names for name-based API lookup when port_code is empty'),

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
 * 2. Gets PriceRepository from ServiceContainer
 * 3. Fetches latest prices for each port using PriceRepository
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
  try {
    // Validate input using Zod schema
    const validatedInput = priceFetcherInputSchema.parse(input);

    const { port_codes, port_names, fuel_types } = validatedInput;

    console.log(`\n💰 Fetching prices for ${port_codes.length} port(s)...`);
    if (fuel_types && fuel_types.length > 0) {
      console.log(`   Filter: ${fuel_types.join(', ')}`);
    }

    // Get repository from container
    const container = ServiceContainer.getInstance();
    const priceRepo = container.getPriceRepository();

    // Organize prices by port identifier (code or name)
    const pricesByPort: Record<string, PriceData[]> = {};
    const portsNotFound = new Set<string>(port_codes);
    const stalePriceWarnings: Array<{
      port_code: string;
      fuel_type: FuelType;
      hours_old: number;
    }> = [];

    // Fetch prices for each port (use portName when port code is empty for name-keyed API)
    for (let i = 0; i < port_codes.length; i++) {
      const portCode = port_codes[i];
      const portName = port_names?.[i];
      const identifier = portCode || portName || '';
      try {
        const fuelTypesToFetch = fuel_types || ['VLSFO', 'LSGO', 'MGO'];
        const prices = await priceRepo.getLatestPrices({
          portCode: portCode || undefined,
          portName: portName || undefined,
          fuelTypes: fuelTypesToFetch,
        });

        if (Object.keys(prices).length === 0) {
          portsNotFound.add(identifier);
          continue;
        }

        // Mark port as found
        portsNotFound.delete(identifier);

        // Convert prices to PriceData format. No Supabase - Bunker API returns latest date; treat as fresh.
        const priceDataArray: PriceData[] = [];
        for (const fuelType of fuelTypesToFetch) {
          if (!prices[fuelType]) {
            continue;
          }

          const formattedPrice = formatCurrency(prices[fuelType], 'USD');

          priceDataArray.push({
            price: {
              fuel_type: fuelType as FuelType,
              price_per_mt: prices[fuelType],
              currency: 'USD',
            },
            is_fresh: true,
            hours_since_update: 0,
            formatted_price: formattedPrice,
          });
        }

        // Sort prices by fuel type for consistency
        priceDataArray.sort((a, b) =>
          a.price.fuel_type.localeCompare(b.price.fuel_type)
        );

        pricesByPort[identifier] = priceDataArray;
      } catch (error) {
        console.error(`Error fetching prices for ${identifier}:`, error);
        portsNotFound.add(identifier);
      }
    }

    const totalPrices = Object.values(pricesByPort).reduce(
      (sum, prices) => sum + prices.length,
      0
    );
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

