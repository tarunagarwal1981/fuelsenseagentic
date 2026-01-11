"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.bunkerAnalyzerToolSchema = exports.BunkerAnalyzerError = exports.bunkerAnalyzerInputSchema = void 0;
exports.analyzeBunkerOptions = analyzeBunkerOptions;
exports.executeBunkerAnalyzerTool = executeBunkerAnalyzerTool;
const zod_1 = require("zod");
/**
 * Zod schema for input validation
 */
exports.bunkerAnalyzerInputSchema = zod_1.z.object({
    bunker_ports: zod_1.z
        .array(zod_1.z.any())
        .min(1, 'At least one bunker port is required')
        .describe('Array of bunker ports with distance information from route'),
    port_prices: zod_1.z
        .any()
        .describe('Fuel price data for the bunker ports'),
    fuel_quantity_mt: zod_1.z
        .number()
        .min(100, 'Minimum fuel quantity is 100 MT')
        .max(10000, 'Maximum fuel quantity is 10,000 MT')
        .describe('Fuel quantity needed in metric tons'),
    fuel_type: zod_1.z
        .enum(['VLSFO', 'LSGO', 'MGO'])
        .default('VLSFO')
        .optional()
        .describe('Type of fuel required (default: VLSFO)'),
    vessel_speed_knots: zod_1.z
        .number()
        .min(5, 'Minimum vessel speed is 5 knots')
        .max(30, 'Maximum vessel speed is 30 knots')
        .default(14)
        .optional()
        .describe('Vessel speed in knots (default: 14)'),
    vessel_consumption_mt_per_day: zod_1.z
        .number()
        .min(5, 'Minimum consumption is 5 MT/day')
        .max(200, 'Maximum consumption is 200 MT/day')
        .default(35)
        .optional()
        .describe('Vessel fuel consumption in MT per day (default: 35)'),
});
/**
 * Error class for bunker analyzer failures
 */
class BunkerAnalyzerError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'BunkerAnalyzerError';
    }
}
exports.BunkerAnalyzerError = BunkerAnalyzerError;
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
async function analyzeBunkerOptions(input) {
    // Validate input using Zod schema
    const validated = exports.bunkerAnalyzerInputSchema.parse(input);
    const { bunker_ports, port_prices, fuel_quantity_mt, fuel_type = 'VLSFO', vessel_speed_knots = 14, vessel_consumption_mt_per_day = 35, } = validated;
    console.log(`\n📊 Analyzing bunker options...`);
    console.log(`   Fuel needed: ${fuel_quantity_mt} MT of ${fuel_type}`);
    console.log(`   Vessel consumption: ${vessel_consumption_mt_per_day} MT/day`);
    console.log(`   Vessel speed: ${vessel_speed_knots} knots`);
    console.log(`   Ports to analyze: ${bunker_ports.length}`);
    const recommendations = [];
    // Analyze each port
    for (const portWithDistance of bunker_ports) {
        const port = portWithDistance.port;
        const distanceFromRoute = portWithDistance.distance_from_route_nm;
        // Find price data for this port
        const portPriceData = port_prices.prices_by_port[port.port_code];
        if (!portPriceData || portPriceData.length === 0) {
            console.log(`   ⚠️  No price data for ${port.port_code}, skipping`);
            continue;
        }
        // Find price for the requested fuel type
        const fuelPriceData = portPriceData.find((p) => p.price.fuel_type === fuel_type);
        if (!fuelPriceData) {
            console.log(`   ⚠️  No ${fuel_type} price for ${port.port_code}, skipping`);
            continue;
        }
        const fuelPrice = fuelPriceData.price.price_per_mt;
        const hoursSinceUpdate = fuelPriceData.hours_since_update;
        const isPriceStale = !fuelPriceData.is_fresh;
        // Calculate direct fuel cost
        const fuelCost = fuel_quantity_mt * fuelPrice;
        // Calculate deviation cost
        // Deviation is round trip: to port and back to route
        const deviationDistanceNm = distanceFromRoute * 2;
        const deviationHours = deviationDistanceNm / vessel_speed_knots;
        const deviationDays = deviationHours / 24;
        // Fuel consumed during deviation (at consumption rate)
        const deviationFuelConsumption = deviationDays * vessel_consumption_mt_per_day;
        const deviationFuelCost = deviationFuelConsumption * fuelPrice;
        // Total cost (fuel cost + deviation cost)
        const totalCost = fuelCost + deviationFuelCost;
        recommendations.push({
            port_code: port.port_code,
            port_name: port.name,
            rank: 0, // Will be set after sorting
            fuel_price_per_mt: fuelPrice,
            fuel_cost: fuelCost,
            deviation_nm: deviationDistanceNm,
            deviation_hours: deviationHours,
            deviation_days: deviationDays,
            deviation_fuel_consumption_mt: deviationFuelConsumption,
            deviation_fuel_cost: deviationFuelCost,
            total_cost: totalCost,
            savings_vs_most_expensive: 0, // Will be calculated
            savings_percentage: 0, // Will be calculated
            data_freshness_hours: hoursSinceUpdate,
            is_price_stale: isPriceStale,
        });
    }
    if (recommendations.length === 0) {
        throw new BunkerAnalyzerError('No valid bunker options found with available price data', 'NO_VALID_OPTIONS');
    }
    // Sort by total cost (cheapest first)
    recommendations.sort((a, b) => a.total_cost - b.total_cost);
    // Set ranks
    recommendations.forEach((rec, index) => {
        rec.rank = index + 1;
    });
    // Calculate savings vs most expensive option
    const mostExpensive = recommendations[recommendations.length - 1];
    const maxCost = mostExpensive.total_cost;
    recommendations.forEach((rec) => {
        rec.savings_vs_most_expensive = maxCost - rec.total_cost;
        rec.savings_percentage =
            maxCost > 0 ? (rec.savings_vs_most_expensive / maxCost) * 100 : 0;
    });
    const bestOption = recommendations[0];
    const maxSavings = bestOption.savings_vs_most_expensive;
    // Generate human-readable summary
    const analysisSummary = `
Analyzed ${recommendations.length} bunker ports for ${fuel_quantity_mt} MT of ${fuel_type}.

Best Option: ${bestOption.port_name} (${bestOption.port_code})
- Total Cost: $${bestOption.total_cost.toLocaleString(undefined, {
        maximumFractionDigits: 0,
    })}
- Fuel Cost: $${bestOption.fuel_cost.toLocaleString(undefined, {
        maximumFractionDigits: 0,
    })} (${fuel_quantity_mt} MT @ $${bestOption.fuel_price_per_mt.toFixed(2)}/MT)
- Deviation Cost: $${bestOption.deviation_fuel_cost.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${bestOption.deviation_nm.toFixed(1)} nm round trip)
- Savings vs worst option: $${maxSavings.toLocaleString(undefined, {
        maximumFractionDigits: 0,
    })} (${bestOption.savings_percentage.toFixed(1)}%)

Time Impact: ${bestOption.deviation_hours.toFixed(1)} hours (${bestOption.deviation_days.toFixed(2)} days) additional voyage time
  `.trim();
    console.log(`\n   ✅ Analysis complete: ${recommendations.length} options ranked`);
    console.log(`\n   🏆 Best option: ${bestOption.port_name}`);
    console.log(`      Total cost: $${bestOption.total_cost.toLocaleString(undefined, {
        maximumFractionDigits: 0,
    })}`);
    console.log(`      Savings: $${maxSavings.toLocaleString(undefined, {
        maximumFractionDigits: 0,
    })} vs worst option`);
    return {
        recommendations,
        best_option: bestOption,
        worst_option: mostExpensive,
        max_savings: maxSavings,
        analysis_summary: analysisSummary,
    };
}
/**
 * Tool schema for Claude (Anthropic SDK)
 * This schema is used to register the tool with Claude so it can be called by the AI agent
 */
exports.bunkerAnalyzerToolSchema = {
    name: 'analyze_bunker_options',
    description: `Performs comprehensive cost-benefit analysis of bunker port options.
    Calculates the true total cost of bunkering at each port by considering:
    - Direct fuel cost (quantity × price per MT)
    - Deviation cost (extra distance traveled to reach port)
    - Time impact (additional voyage time)
    
    The analysis accounts for:
    - Vessel fuel consumption during deviation
    - Current fuel prices at each port
    - Distance from the planned route
    
    Returns recommendations ranked by total cost with detailed breakdowns.
    Use this when comparing bunker port options or optimizing refueling decisions.`,
    input_schema: {
        type: 'object',
        properties: {
            bunker_ports: {
                type: 'array',
                description: 'Array of bunker ports with distance information from route (from port finder tool)',
            },
            port_prices: {
                type: 'object',
                description: 'Fuel price data for the bunker ports (from price fetcher tool)',
            },
            fuel_quantity_mt: {
                type: 'number',
                description: 'Amount of fuel needed in metric tons (typical: 500-2000 MT)',
            },
            fuel_type: {
                type: 'string',
                enum: ['VLSFO', 'LSGO', 'MGO'],
                description: 'Type of fuel required (default: VLSFO)',
            },
            vessel_speed_knots: {
                type: 'number',
                description: 'Vessel speed in knots (default: 14)',
            },
            vessel_consumption_mt_per_day: {
                type: 'number',
                description: 'Vessel fuel consumption rate in MT per day (typical: 20-50 MT/day, default: 35)',
            },
        },
        required: ['bunker_ports', 'port_prices', 'fuel_quantity_mt'],
    },
};
/**
 * Tool execution wrapper for Claude
 * This function is called by the agent when the tool is invoked
 */
async function executeBunkerAnalyzerTool(args) {
    return analyzeBunkerOptions(args);
}
//# sourceMappingURL=bunker-analyzer.js.map