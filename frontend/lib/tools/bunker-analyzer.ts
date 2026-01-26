/**
 * Bunker Cost-Benefit Analyzer Tool
 * 
 * Thin wrapper around BunkerService and PriceRepository that performs comprehensive
 * cost-benefit analysis of bunker port options.
 * 
 * This tool helps optimize bunkering decisions by considering:
 * - Direct fuel cost (quantity × price per MT)
 * - Deviation cost (extra distance traveled to reach port)
 * - Time impact (additional voyage time)
 * - Fuel consumption during deviation
 * - Price staleness penalties
 */

import { z } from 'zod';
import { FoundPort } from '@/lib/tools/port-finder';
import { PriceFetcherOutput, PriceData } from '@/lib/tools/price-fetcher';
import { FuelType } from '@/lib/types';
import { ServiceContainer } from '@/lib/repositories/service-container';

/**
 * Price staleness thresholds and penalties
 * Stale prices are less reliable and should be penalized in ranking
 */
const PRICE_STALENESS_CONFIG = {
  // Warning thresholds (hours)
  WARNING_THRESHOLD_HOURS: 24,      // Prices older than 1 day get a warning
  MODERATE_THRESHOLD_HOURS: 168,    // Prices older than 1 week get moderate penalty
  HIGH_THRESHOLD_HOURS: 720,        // Prices older than 1 month get high penalty
  CRITICAL_THRESHOLD_HOURS: 2160,   // Prices older than 3 months get critical penalty
  
  // Score multipliers (1.0 = no penalty, lower = more penalty)
  FRESH_MULTIPLIER: 1.0,            // < 24 hours: no penalty
  WARNING_MULTIPLIER: 0.95,         // 24h - 1 week: 5% penalty
  MODERATE_MULTIPLIER: 0.85,        // 1 week - 1 month: 15% penalty
  HIGH_MULTIPLIER: 0.70,            // 1 month - 3 months: 30% penalty
  CRITICAL_MULTIPLIER: 0.50,        // > 3 months: 50% penalty
};

/**
 * Calculate the freshness penalty multiplier for a given price age
 * Returns a value between 0.5 and 1.0
 */
function calculateFreshnessPenalty(hoursSinceUpdate: number): number {
  if (hoursSinceUpdate < PRICE_STALENESS_CONFIG.WARNING_THRESHOLD_HOURS) {
    return PRICE_STALENESS_CONFIG.FRESH_MULTIPLIER;
  } else if (hoursSinceUpdate < PRICE_STALENESS_CONFIG.MODERATE_THRESHOLD_HOURS) {
    return PRICE_STALENESS_CONFIG.WARNING_MULTIPLIER;
  } else if (hoursSinceUpdate < PRICE_STALENESS_CONFIG.HIGH_THRESHOLD_HOURS) {
    return PRICE_STALENESS_CONFIG.MODERATE_MULTIPLIER;
  } else if (hoursSinceUpdate < PRICE_STALENESS_CONFIG.CRITICAL_THRESHOLD_HOURS) {
    return PRICE_STALENESS_CONFIG.HIGH_MULTIPLIER;
  } else {
    return PRICE_STALENESS_CONFIG.CRITICAL_MULTIPLIER;
  }
}

/**
 * Get staleness severity level for display
 */
function getStalenessLevel(hoursSinceUpdate: number): 'fresh' | 'warning' | 'moderate' | 'high' | 'critical' {
  if (hoursSinceUpdate < PRICE_STALENESS_CONFIG.WARNING_THRESHOLD_HOURS) {
    return 'fresh';
  } else if (hoursSinceUpdate < PRICE_STALENESS_CONFIG.MODERATE_THRESHOLD_HOURS) {
    return 'warning';
  } else if (hoursSinceUpdate < PRICE_STALENESS_CONFIG.HIGH_THRESHOLD_HOURS) {
    return 'moderate';
  } else if (hoursSinceUpdate < PRICE_STALENESS_CONFIG.CRITICAL_THRESHOLD_HOURS) {
    return 'high';
  } else {
    return 'critical';
  }
}

/**
 * Input parameters for bunker analyzer
 */
export interface BunkerAnalyzerInput {
  /** Ports found along route with distance information */
  bunker_ports: FoundPort[];
  /** Fuel price data for the ports */
  port_prices: PriceFetcherOutput;
  /** VLSFO fuel quantity needed in metric tons */
  fuel_quantity_mt: number;
  /** LSMGO/MGO quantity needed in metric tons (for auxiliary engines, ECA zones) */
  mgo_quantity_mt?: number;
  /** Type of primary fuel required */
  fuel_type?: FuelType;
  /** Vessel speed in knots */
  vessel_speed_knots?: number;
  /** Vessel fuel consumption in MT per day */
  vessel_consumption_mt_per_day?: number;
}

/**
 * Breakdown of cost for a single fuel type
 */
export interface FuelBreakdown {
  /** Fuel type identifier */
  type: 'VLSFO' | 'LSMGO' | 'MGO' | 'LSGO';
  /** Quantity in metric tons */
  quantity: number;
  /** Price per metric ton in USD */
  price_per_mt: number;
  /** Total cost for this fuel type */
  cost: number;
  /** Whether price data was available or estimated */
  is_estimated: boolean;
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

  // Price data
  /** Fuel price per metric ton */
  fuel_price_per_mt: number;
  /** Total fuel cost */
  fuel_cost: number;

  // Deviation data
  /** Deviation distance in nautical miles (round trip) */
  deviation_nm: number;
  /** Deviation time in hours */
  deviation_hours: number;
  /** Deviation time in days */
  deviation_days: number;

  // Deviation cost calculation
  /** Fuel consumed during deviation in MT */
  deviation_fuel_consumption_mt: number;
  /** Cost of fuel consumed during deviation */
  deviation_fuel_cost: number;

  // Total analysis
  /** Total cost (fuel cost + deviation cost) */
  total_cost: number;

  // Savings comparison
  /** Savings compared to most expensive option */
  savings_vs_most_expensive: number;
  /** Savings as percentage */
  savings_percentage: number;

  // Multi-fuel support
  /** Breakdown of costs by fuel type */
  fuels: FuelBreakdown[];
  /** MGO/LSMGO price per metric ton (for backwards compatibility) */
  mgo_price_per_mt?: number;
  /** MGO/LSMGO total cost (for backwards compatibility) */
  mgo_cost?: number;
  /** MGO/LSMGO quantity in metric tons */
  mgo_quantity_mt?: number;

  // Metadata
  /** Hours since price was last updated */
  data_freshness_hours: number;
  /** Whether price is considered stale (> 24 hours) */
  is_price_stale: boolean;
  /** Staleness severity level */
  staleness_level: 'fresh' | 'warning' | 'moderate' | 'high' | 'critical';
  /** Freshness penalty applied to ranking (1.0 = no penalty) */
  freshness_penalty: number;
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
  /** Warning if prices are stale */
  stale_price_warning?: string;
  /** Count of ports with stale prices */
  stale_price_count: number;
  /** Whether ALL prices are stale (critical warning) */
  all_prices_stale: boolean;
}

/**
 * Zod schema for input validation
 */
export const bunkerAnalyzerInputSchema = z.object({
  bunker_ports: z
    .array(z.any())
    .min(1, 'At least one bunker port is required')
    .describe('Array of bunker ports with distance information from route'),

  port_prices: z
    .any()
    .describe('Fuel price data for the bunker ports'),

  fuel_quantity_mt: z
    .number()
    .min(100, 'Minimum fuel quantity is 100 MT')
    .max(10000, 'Maximum fuel quantity is 10,000 MT')
    .describe('Fuel quantity needed in metric tons'),

  fuel_type: z
    .enum(['VLSFO', 'LSGO', 'MGO'])
    .default('VLSFO')
    .optional()
    .describe('Type of fuel required (default: VLSFO)'),

  vessel_speed_knots: z
    .number()
    .min(5, 'Minimum vessel speed is 5 knots')
    .max(30, 'Maximum vessel speed is 30 knots')
    .default(14)
    .optional()
    .describe('Vessel speed in knots (default: 14)'),

  vessel_consumption_mt_per_day: z
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
export class BunkerAnalyzerError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'BunkerAnalyzerError';
  }
}

/**
 * Main function to analyze bunker options
 * 
 * This function:
 * 1. Validates input parameters using Zod
 * 2. Gets BunkerService and PriceRepository from ServiceContainer
 * 3. For each port, calculates:
 *    - Direct fuel cost (using PriceRepository)
 *    - Deviation distance and time
 *    - Deviation fuel consumption and cost
 *    - Total cost
 * 4. Ranks ports by total cost (with staleness penalties)
 * 5. Calculates savings vs most expensive option
 * 6. Returns comprehensive analysis
 * 
 * @param input - Bunker analyzer parameters
 * @returns Complete analysis with ranked recommendations
 * @throws BunkerAnalyzerError - If validation fails or no valid options found
 */
export async function analyzeBunkerOptions(
  input: BunkerAnalyzerInput
): Promise<BunkerAnalysisResult> {
  try {
    // Validate input using Zod schema
    const validated = bunkerAnalyzerInputSchema.parse(input);

    const {
      bunker_ports,
      port_prices,
      fuel_quantity_mt,
      fuel_type = 'VLSFO',
      vessel_speed_knots = 14,
      vessel_consumption_mt_per_day = 35,
    } = validated;

    // Get MGO quantity from input (not in Zod schema for backwards compatibility)
    const mgo_quantity_mt = (input as any).mgo_quantity_mt || 0;

    // Get services from container
    const container = ServiceContainer.getInstance();
    const priceRepo = container.getPriceRepository();

    console.log(`\n📊 Analyzing bunker options...`);
    console.log(`   VLSFO needed: ${fuel_quantity_mt} MT`);
    if (mgo_quantity_mt > 0) {
      console.log(`   LSMGO needed: ${mgo_quantity_mt} MT`);
    }
    console.log(`   Vessel consumption: ${vessel_consumption_mt_per_day} MT/day`);
    console.log(`   Vessel speed: ${vessel_speed_knots} knots`);
    console.log(`   Ports to analyze: ${bunker_ports.length}`);
  
    // Validate port_prices structure (backwards compatibility)
    // If port_prices is provided, use it; otherwise fetch from repository
    let pricesByPort: Record<string, PriceData[]> = {};
    
    if (port_prices && port_prices.prices_by_port) {
      pricesByPort = port_prices.prices_by_port;
      console.log(`   Using provided price data for ${Object.keys(pricesByPort).length} port(s)`);
    } else {
      // Fetch prices from repository for all ports
      console.log(`   Fetching price data from repository...`);
      for (const portWithDistance of bunker_ports as any[]) {
        const port = portWithDistance.port || portWithDistance;
        if (!port || !port.port_code) continue;
        
        try {
          const latestPrices = await priceRepo.getLatestPrices({
            portCode: port.port_code,
            fuelTypes: [fuel_type, 'LSGO', 'MGO'],
          });
          
          const priceHistory = await priceRepo.getPriceHistory(
            port.port_code,
            fuel_type,
            30 // days
          );
          
          if (priceHistory.length > 0) {
            const record = priceHistory[0]!;
            const hoursSinceUpdate = record.updatedAt
              ? (Date.now() - new Date(record.updatedAt).getTime()) / (1000 * 60 * 60)
              : 999;
            
            pricesByPort[port.port_code] = [{
              price: {
                fuel_type: fuel_type,
                price_per_mt: latestPrices[fuel_type] || 0,
                currency: 'USD',
              },
              hours_since_update: hoursSinceUpdate,
              is_fresh: hoursSinceUpdate < 24,
              formatted_price: `$${(latestPrices[fuel_type] || 0).toFixed(0)}/MT`,
            }];
          }
        } catch (error) {
          console.warn(`   ⚠️  Failed to fetch prices for ${port.port_code}:`, error);
        }
      }
      console.log(`   Fetched price data for ${Object.keys(pricesByPort).length} port(s)`);
    }

  const recommendations: BunkerRecommendation[] = [];

  // Analyze each port
  for (const portWithDistance of bunker_ports as any[]) {
    // Handle both formats:
    // 1. FoundPort format: { port: { port_code, name, ... }, distance_from_route_nm, ... }
    // 2. Flat format: { port_code, name, distance_from_route_nm, ... }
    let port: any;
    let distanceFromRoute: number;
    
    if (portWithDistance.port) {
      // FoundPort format
      port = portWithDistance.port;
      distanceFromRoute = portWithDistance.distance_from_route_nm;
    } else {
      // Flat format - LLM sometimes passes this
      port = {
        port_code: portWithDistance.port_code,
        name: portWithDistance.name || portWithDistance.port_name,
      };
      distanceFromRoute = portWithDistance.distance_from_route_nm;
    }

    // Validate port has port_code
    if (!port || !port.port_code) {
      console.log(`   ⚠️  Invalid port data, skipping:`, portWithDistance);
      continue;
    }

    // Find price data for this port
    const portPriceData = pricesByPort[port.port_code];

    if (!portPriceData || portPriceData.length === 0) {
      console.log(`   ⚠️  No price data for ${port.port_code}, skipping`);
      continue;
    }

    // Find price for the requested fuel type (VLSFO)
    const fuelPriceData = portPriceData.find(
      (p: PriceData) => p.price.fuel_type === fuel_type
    );

    if (!fuelPriceData) {
      console.log(
        `   ⚠️  No ${fuel_type} price for ${port.port_code}, skipping`
      );
      continue;
    }

    const fuelPrice = fuelPriceData.price.price_per_mt;
    const hoursSinceUpdate = fuelPriceData.hours_since_update;
    const isPriceStale = !fuelPriceData.is_fresh;

    // Calculate direct VLSFO fuel cost
    const fuelCost = fuel_quantity_mt * fuelPrice;

    // ========================================================================
    // MULTI-FUEL: Find and calculate MGO/LSMGO costs
    // ========================================================================
    let mgoPriceData: PriceData | undefined;
    let mgoPrice = 0;
    let mgoCost = 0;
    let mgoIsEstimated = false;
    
    if (mgo_quantity_mt > 0) {
      // Try to find LSGO price first (Low Sulfur Gas Oil = LSMGO)
      mgoPriceData = portPriceData.find(
        (p: PriceData) => p.price.fuel_type === 'LSGO'
      );
      
      // Fallback to MGO if LSGO not found
      if (!mgoPriceData) {
        mgoPriceData = portPriceData.find(
          (p: PriceData) => p.price.fuel_type === 'MGO'
        );
      }
      
      if (mgoPriceData) {
        mgoPrice = mgoPriceData.price.price_per_mt;
        mgoIsEstimated = false;
      } else {
        // Last resort: estimate MGO as VLSFO * 1.4 (MGO typically 40% more expensive)
        mgoPrice = fuelPrice * 1.4;
        mgoIsEstimated = true;
        console.log(`   ℹ️ Estimating LSMGO price for ${port.port_code}: $${mgoPrice.toFixed(0)}/MT (VLSFO × 1.4)`);
      }
      
      mgoCost = mgo_quantity_mt * mgoPrice;
    }

    // Calculate deviation cost
    // Deviation is round trip: to port and back to route
    const deviationDistanceNm = distanceFromRoute * 2;
    const deviationHours = deviationDistanceNm / vessel_speed_knots;
    const deviationDays = deviationHours / 24;

    // Fuel consumed during deviation (at consumption rate)
    // Use VLSFO for main engine, estimate 10% for auxiliary (MGO)
    const deviationVlsfoConsumption = deviationDays * vessel_consumption_mt_per_day;
    const deviationMgoConsumption = deviationDays * (vessel_consumption_mt_per_day * 0.1);
    const deviationFuelConsumption = deviationVlsfoConsumption + deviationMgoConsumption;
    const deviationFuelCost = (deviationVlsfoConsumption * fuelPrice) + 
                              (mgo_quantity_mt > 0 ? deviationMgoConsumption * mgoPrice : 0);

    // Total cost (VLSFO cost + MGO cost + deviation cost)
    const totalCost = fuelCost + mgoCost + deviationFuelCost;

    // Calculate freshness penalty (use worst of VLSFO and MGO freshness)
    const mgoHoursSinceUpdate = mgoPriceData?.hours_since_update || hoursSinceUpdate;
    const maxHoursSinceUpdate = Math.max(hoursSinceUpdate, mgoHoursSinceUpdate);
    const freshnessPenalty = calculateFreshnessPenalty(maxHoursSinceUpdate);
    const stalenessLevel = getStalenessLevel(maxHoursSinceUpdate);
    
    // Build fuels array for multi-fuel support
    const fuels: FuelBreakdown[] = [
      {
        type: 'VLSFO',
        quantity: fuel_quantity_mt,
        price_per_mt: fuelPrice,
        cost: fuelCost,
        is_estimated: false,
      }
    ];
    
    if (mgo_quantity_mt > 0) {
      fuels.push({
        type: 'LSMGO',
        quantity: mgo_quantity_mt,
        price_per_mt: mgoPrice,
        cost: mgoCost,
        is_estimated: mgoIsEstimated,
      });
    }
    
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
      fuels: fuels,
      mgo_price_per_mt: mgo_quantity_mt > 0 ? mgoPrice : undefined,
      mgo_cost: mgo_quantity_mt > 0 ? mgoCost : undefined,
      mgo_quantity_mt: mgo_quantity_mt > 0 ? mgo_quantity_mt : undefined,
      data_freshness_hours: maxHoursSinceUpdate,
      is_price_stale: isPriceStale || (mgoPriceData ? !mgoPriceData.is_fresh : false),
      staleness_level: stalenessLevel,
      freshness_penalty: freshnessPenalty,
    });
  }

  if (recommendations.length === 0) {
    throw new BunkerAnalyzerError(
      'No valid bunker options found with available price data',
      'NO_VALID_OPTIONS'
    );
  }

  // Sort by adjusted cost (total cost penalized by freshness)
  // This ensures stale prices rank lower than fresh prices at similar cost levels
  recommendations.sort((a, b) => {
    // Calculate adjusted costs: higher penalty = higher adjusted cost = ranks lower
    const adjustedCostA = a.total_cost / a.freshness_penalty;
    const adjustedCostB = b.total_cost / b.freshness_penalty;
    return adjustedCostA - adjustedCostB;
  });

  // Set ranks
  recommendations.forEach((rec, index) => {
    rec.rank = index + 1;
  });
  
  // Calculate stale price statistics
  const stalePrices = recommendations.filter(r => r.is_price_stale);
  const staleCount = stalePrices.length;
  const allStale = staleCount === recommendations.length;
  
  // Log warnings for stale prices
  if (staleCount > 0) {
    const criticalCount = recommendations.filter(r => r.staleness_level === 'critical').length;
    const highCount = recommendations.filter(r => r.staleness_level === 'high').length;
    
    if (criticalCount > 0) {
      console.warn(`⚠️ [BUNKER-ANALYZER] ${criticalCount} port(s) have critically stale prices (>3 months old)`);
    }
    if (highCount > 0) {
      console.warn(`⚠️ [BUNKER-ANALYZER] ${highCount} port(s) have highly stale prices (1-3 months old)`);
    }
    if (allStale) {
      console.warn(`🚨 [BUNKER-ANALYZER] ALL ${staleCount} ports have stale prices - recommendations may be unreliable!`);
    }
  }

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

  // Build fuel summary for multi-fuel display
  const fuelSummaryLines: string[] = [];
  for (const fuel of bestOption.fuels) {
    fuelSummaryLines.push(
      `- ${fuel.type}: $${fuel.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })} ` +
      `(${fuel.quantity.toFixed(0)} MT @ $${fuel.price_per_mt.toFixed(0)}/MT)` +
      (fuel.is_estimated ? ' [estimated]' : '')
    );
  }

  // Generate human-readable summary
  const analysisSummary = `
Analyzed ${recommendations.length} bunker ports for ${fuel_quantity_mt} MT of ${fuel_type}${mgo_quantity_mt > 0 ? ` + ${mgo_quantity_mt} MT of LSMGO` : ''}.

Best Option: ${bestOption.port_name} (${bestOption.port_code})
- Total Cost: $${bestOption.total_cost.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}
${fuelSummaryLines.join('\n')}
- Deviation Cost: $${bestOption.deviation_fuel_cost.toLocaleString(
    undefined,
    { maximumFractionDigits: 0 }
  )} (${bestOption.deviation_nm.toFixed(1)} nm round trip)
- Savings vs worst option: $${maxSavings.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })} (${bestOption.savings_percentage.toFixed(1)}%)

Time Impact: ${bestOption.deviation_hours.toFixed(
    1
  )} hours (${bestOption.deviation_days.toFixed(2)} days) additional voyage time
  `.trim();

  console.log(`\n   ✅ Analysis complete: ${recommendations.length} options ranked`);
  console.log(`\n   🏆 Best option: ${bestOption.port_name}`);
  
  // Log each fuel type
  for (const fuel of bestOption.fuels) {
    console.log(
      `      ${fuel.type}: ${fuel.quantity.toFixed(0)} MT @ $${fuel.price_per_mt.toFixed(0)}/MT = $${fuel.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}` +
      (fuel.is_estimated ? ' [estimated]' : '')
    );
  }
  
  console.log(
    `      Total cost: $${bestOption.total_cost.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })}`
  );
  console.log(
    `      Savings: $${maxSavings.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })} vs worst option`
  );

  // Generate stale price warning if applicable
  let stalePriceWarning: string | undefined;
  if (allStale) {
    const avgAgeHours = recommendations.reduce((sum, r) => sum + r.data_freshness_hours, 0) / recommendations.length;
    const avgAgeDays = Math.round(avgAgeHours / 24);
    stalePriceWarning = `⚠️ PRICE DATA WARNING: All ${staleCount} ports have stale prices (average ${avgAgeDays} days old). ` +
      `These recommendations may not reflect current market rates. Consider contacting ports directly for current prices.`;
  } else if (staleCount > recommendations.length / 2) {
    stalePriceWarning = `⚠️ Price data warning: ${staleCount} of ${recommendations.length} ports have stale prices. ` +
      `Verify current prices before bunkering.`;
  }

  return {
    recommendations,
    best_option: bestOption,
    worst_option: mostExpensive,
    max_savings: maxSavings,
    analysis_summary: analysisSummary,
    stale_price_warning: stalePriceWarning,
    stale_price_count: staleCount,
    all_prices_stale: allStale,
  };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new BunkerAnalyzerError(
        `Invalid input: ${error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
        'VALIDATION_ERROR'
      );
    }
    
    if (error instanceof BunkerAnalyzerError) {
      throw error;
    }
    
    throw new BunkerAnalyzerError(
      `Failed to analyze bunker options: ${error instanceof Error ? error.message : String(error)}`,
      'ANALYSIS_ERROR'
    );
  }
}

/**
 * Tool schema for Claude (Anthropic SDK)
 * This schema is used to register the tool with Claude so it can be called by the AI agent
 */
export const bunkerAnalyzerToolSchema = {
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
        description:
          'Array of bunker ports with distance information from route (from port finder tool)',
      },
      port_prices: {
        type: 'object',
        description:
          'Fuel price data for the bunker ports (from price fetcher tool)',
      },
      fuel_quantity_mt: {
        type: 'number',
        description:
          'Amount of fuel needed in metric tons (typical: 500-2000 MT)',
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
        description:
          'Vessel fuel consumption rate in MT per day (typical: 20-50 MT/day, default: 35)',
      },
    },
    required: ['bunker_ports', 'port_prices', 'fuel_quantity_mt'],
  },
} as const;

/**
 * Tool execution wrapper for Claude
 * This function is called by the agent when the tool is invoked
 */
export async function executeBunkerAnalyzerTool(
  args: unknown
): Promise<BunkerAnalysisResult> {
  return analyzeBunkerOptions(args as BunkerAnalyzerInput);
}

