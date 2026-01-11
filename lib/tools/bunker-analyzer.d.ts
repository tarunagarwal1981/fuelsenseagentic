/**
 * Bunker Cost-Benefit Analyzer Tool
 *
 * Performs comprehensive cost-benefit analysis of bunker port options.
 * Calculates true total cost including fuel cost and deviation costs.
 *
 * This tool helps optimize bunkering decisions by considering:
 * - Direct fuel cost (quantity × price per MT)
 * - Deviation cost (extra distance traveled to reach port)
 * - Time impact (additional voyage time)
 * - Fuel consumption during deviation
 */
import { z } from 'zod';
import { FoundPort } from '@/lib/tools/port-finder';
import { PriceFetcherOutput } from '@/lib/tools/price-fetcher';
import { FuelType } from '../types';
/**
 * Input parameters for bunker analyzer
 */
export interface BunkerAnalyzerInput {
    /** Ports found along route with distance information */
    bunker_ports: FoundPort[];
    /** Fuel price data for the ports */
    port_prices: PriceFetcherOutput;
    /** Fuel quantity needed in metric tons */
    fuel_quantity_mt: number;
    /** Type of fuel required */
    fuel_type?: FuelType;
    /** Vessel speed in knots */
    vessel_speed_knots?: number;
    /** Vessel fuel consumption in MT per day */
    vessel_consumption_mt_per_day?: number;
}
/**
 * Bunker recommendation with detailed cost breakdown
 */
export interface BunkerRecommendation {
    /** Port code */
    port_code: string;
    /** Port name */
    port_name: string;
    /** Ranking (1 = best/cheapest) */
    rank: number;
    /** Fuel price per metric ton */
    fuel_price_per_mt: number;
    /** Total fuel cost */
    fuel_cost: number;
    /** Deviation distance in nautical miles (round trip) */
    deviation_nm: number;
    /** Deviation time in hours */
    deviation_hours: number;
    /** Deviation time in days */
    deviation_days: number;
    /** Fuel consumed during deviation in MT */
    deviation_fuel_consumption_mt: number;
    /** Cost of fuel consumed during deviation */
    deviation_fuel_cost: number;
    /** Total cost (fuel cost + deviation cost) */
    total_cost: number;
    /** Savings compared to most expensive option */
    savings_vs_most_expensive: number;
    /** Savings as percentage */
    savings_percentage: number;
    /** Hours since price was last updated */
    data_freshness_hours: number;
    /** Whether price is considered stale (> 24 hours) */
    is_price_stale: boolean;
}
/**
 * Complete analysis result
 */
export interface BunkerAnalysisResult {
    /** All recommendations ranked by total cost */
    recommendations: BunkerRecommendation[];
    /** Best (cheapest) option */
    best_option: BunkerRecommendation;
    /** Worst (most expensive) option */
    worst_option: BunkerRecommendation;
    /** Maximum potential savings */
    max_savings: number;
    /** Human-readable analysis summary */
    analysis_summary: string;
}
/**
 * Zod schema for input validation
 */
export declare const bunkerAnalyzerInputSchema: z.ZodObject<{
    bunker_ports: z.ZodArray<z.ZodAny, "many">;
    port_prices: z.ZodAny;
    fuel_quantity_mt: z.ZodNumber;
    fuel_type: z.ZodOptional<z.ZodDefault<z.ZodEnum<["VLSFO", "LSGO", "MGO"]>>>;
    vessel_speed_knots: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    vessel_consumption_mt_per_day: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    bunker_ports: any[];
    fuel_quantity_mt: number;
    vessel_speed_knots?: number | undefined;
    port_prices?: any;
    fuel_type?: "VLSFO" | "LSGO" | "MGO" | undefined;
    vessel_consumption_mt_per_day?: number | undefined;
}, {
    bunker_ports: any[];
    fuel_quantity_mt: number;
    vessel_speed_knots?: number | undefined;
    port_prices?: any;
    fuel_type?: "VLSFO" | "LSGO" | "MGO" | undefined;
    vessel_consumption_mt_per_day?: number | undefined;
}>;
/**
 * Error class for bunker analyzer failures
 */
export declare class BunkerAnalyzerError extends Error {
    readonly code: string;
    constructor(message: string, code: string);
}
/**
 * Main function to analyze bunker options
 *
 * This function:
 * 1. Validates input parameters using Zod
 * 2. For each port, calculates:
 *    - Direct fuel cost
 *    - Deviation distance and time
 *    - Deviation fuel consumption and cost
 *    - Total cost
 * 3. Ranks ports by total cost
 * 4. Calculates savings vs most expensive option
 * 5. Returns comprehensive analysis
 *
 * @param input - Bunker analyzer parameters
 * @returns Complete analysis with ranked recommendations
 * @throws BunkerAnalyzerError - If validation fails or no valid options found
 */
export declare function analyzeBunkerOptions(input: BunkerAnalyzerInput): Promise<BunkerAnalysisResult>;
/**
 * Tool schema for Claude (Anthropic SDK)
 * This schema is used to register the tool with Claude so it can be called by the AI agent
 */
export declare const bunkerAnalyzerToolSchema: {
    readonly name: "analyze_bunker_options";
    readonly description: "Performs comprehensive cost-benefit analysis of bunker port options.\n    Calculates the true total cost of bunkering at each port by considering:\n    - Direct fuel cost (quantity × price per MT)\n    - Deviation cost (extra distance traveled to reach port)\n    - Time impact (additional voyage time)\n    \n    The analysis accounts for:\n    - Vessel fuel consumption during deviation\n    - Current fuel prices at each port\n    - Distance from the planned route\n    \n    Returns recommendations ranked by total cost with detailed breakdowns.\n    Use this when comparing bunker port options or optimizing refueling decisions.";
    readonly input_schema: {
        readonly type: "object";
        readonly properties: {
            readonly bunker_ports: {
                readonly type: "array";
                readonly description: "Array of bunker ports with distance information from route (from port finder tool)";
            };
            readonly port_prices: {
                readonly type: "object";
                readonly description: "Fuel price data for the bunker ports (from price fetcher tool)";
            };
            readonly fuel_quantity_mt: {
                readonly type: "number";
                readonly description: "Amount of fuel needed in metric tons (typical: 500-2000 MT)";
            };
            readonly fuel_type: {
                readonly type: "string";
                readonly enum: readonly ["VLSFO", "LSGO", "MGO"];
                readonly description: "Type of fuel required (default: VLSFO)";
            };
            readonly vessel_speed_knots: {
                readonly type: "number";
                readonly description: "Vessel speed in knots (default: 14)";
            };
            readonly vessel_consumption_mt_per_day: {
                readonly type: "number";
                readonly description: "Vessel fuel consumption rate in MT per day (typical: 20-50 MT/day, default: 35)";
            };
        };
        readonly required: readonly ["bunker_ports", "port_prices", "fuel_quantity_mt"];
    };
};
/**
 * Tool execution wrapper for Claude
 * This function is called by the agent when the tool is invoked
 */
export declare function executeBunkerAnalyzerTool(args: unknown): Promise<BunkerAnalysisResult>;
//# sourceMappingURL=bunker-analyzer.d.ts.map