/**
 * Multi-Port Bunker Optimizer
 *
 * Determines when multi-port bunkering is beneficial and computes optimal
 * 2-port (or 3-port) strategies: capacity split, price optimization, strategic.
 * All calculations are deterministic and auditable.
 */

import type {
  MultiPortParams,
  MultiPortStrategy,
  PortBunkerPlan,
  BunkerPortOption,
} from '@/lib/types/bunker';

const DEVIATION_COST_PER_NM = 2;
const MIN_PRICE_DIFF_PERCENT = 5;
const CAPACITY_THRESHOLD = 0.8;
const MIN_VOYAGE_DAYS_FOR_MULTI = 20;
const HOURS_PER_DEVIATION_NM = 0.5;

/**
 * Decide whether to consider multi-port bunkering.
 * Returns true if:
 * - Total fuel > 80% of tank capacity, or
 * - Price difference between ports > 5%, or
 * - Multiple convenient ports (2+), or
 * - Voyage duration > 20 days.
 */
export function shouldConsiderMultiPort(
  bunkerRequirement: { bunkerQuantity: number; requiredFuel: number },
  vesselSpecs: { tankCapacity: number },
  portOptions: BunkerPortOption[],
  voyageDurationDays?: number
): boolean {
  if (portOptions.length < 2) return false;
  const totalFuel = bunkerRequirement.requiredFuel || bunkerRequirement.bunkerQuantity;
  const capacity = vesselSpecs.tankCapacity;
  if (capacity <= 0) return false;

  if (totalFuel > capacity * CAPACITY_THRESHOLD) return true;
  if (voyageDurationDays != null && voyageDurationDays > MIN_VOYAGE_DAYS_FOR_MULTI) return true;

  const prices = portOptions.map((p) => p.price_per_mt).filter((n) => n > 0);
  if (prices.length < 2) return false;
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  if (minP <= 0) return false;
  const diffPercent = ((maxP - minP) / minP) * 100;
  if (diffPercent >= MIN_PRICE_DIFF_PERCENT) return true;

  return portOptions.length >= 2;
}

/**
 * Build a 2-port capacity-split strategy: fill to capacity at first port, rest at second.
 * First port = cheapest of first two by route position or by price; second = next along route.
 */
function capacitySplitStrategy(
  params: MultiPortParams,
  sortedByPrice: BunkerPortOption[]
): MultiPortStrategy | null {
  if (sortedByPrice.length < 2) return null;
  const fillAtFirst = Math.min(params.tankCapacity - params.currentROB, params.totalFuelRequired);
  const fillAtSecond = Math.max(0, params.totalFuelRequired - fillAtFirst);
  if (fillAtSecond <= 0) return null;

  const port1 = sortedByPrice[0];
  const port2 = sortedByPrice[1];
  const cost1 = fillAtFirst * port1.price_per_mt;
  const cost2 = fillAtSecond * port2.price_per_mt;
  const devCost = (port1.deviation_nm + port2.deviation_nm) * (params.deviationCostPerNm ?? DEVIATION_COST_PER_NM);
  const robAfterFirst = params.currentROB + fillAtFirst;
  const robAfterSecond = robAfterFirst + fillAtSecond;

  const plans: PortBunkerPlan[] = [
    {
      port_name: port1.port_name,
      port_code: port1.port_code,
      sequence: 1,
      bunker_quantity: fillAtFirst,
      cost_per_mt: port1.price_per_mt,
      total_cost: cost1,
      rob_before: params.currentROB,
      rob_after: robAfterFirst,
      reasoning: `Fill to capacity (${fillAtFirst.toFixed(0)} MT) at best-priced port.`,
    },
    {
      port_name: port2.port_name,
      port_code: port2.port_code,
      sequence: 2,
      bunker_quantity: fillAtSecond,
      cost_per_mt: port2.price_per_mt,
      total_cost: cost2,
      rob_before: robAfterFirst,
      rob_after: robAfterSecond,
      reasoning: `Top-up ${fillAtSecond.toFixed(0)} MT at second port.`,
    },
  ];

  const totalBunker = cost1 + cost2;
  const timeImpact = (port1.deviation_nm + port2.deviation_nm) * HOURS_PER_DEVIATION_NM;

  return {
    strategy_type: 'CAPACITY_SPLIT',
    ports: plans,
    total_bunker_cost: totalBunker,
    total_deviation_cost: devCost,
    total_cost: totalBunker + devCost,
    savings_vs_single_port: 0,
    time_impact_hours: timeImpact,
    recommendation: `Split bunkering required: ${fillAtFirst.toFixed(0)} MT at ${port1.port_name}, ${fillAtSecond.toFixed(0)} MT at ${port2.port_name}. Total cost $${(totalBunker + devCost).toFixed(0)}.`,
  };
}

/**
 * Price-optimized 2-port: take more at cheaper port, less at expensive.
 * Maximize quantity at cheapest port (up to capacity), rest at next cheapest.
 */
function priceOptimizationStrategy(
  params: MultiPortParams,
  sortedByPrice: BunkerPortOption[]
): MultiPortStrategy | null {
  if (sortedByPrice.length < 2) return null;
  const port1 = sortedByPrice[0];
  const port2 = sortedByPrice[1];
  const space = params.tankCapacity - params.currentROB;
  const q1 = Math.min(space, params.totalFuelRequired);
  const q2 = Math.max(0, params.totalFuelRequired - q1);
  if (q2 <= 0) return null;

  const cost1 = q1 * port1.price_per_mt;
  const cost2 = q2 * port2.price_per_mt;
  const devCost = (port1.deviation_nm + port2.deviation_nm) * (params.deviationCostPerNm ?? DEVIATION_COST_PER_NM);
  const robAfterFirst = params.currentROB + q1;
  const robAfterSecond = robAfterFirst + q2;

  const plans: PortBunkerPlan[] = [
    {
      port_name: port1.port_name,
      port_code: port1.port_code,
      sequence: 1,
      bunker_quantity: q1,
      cost_per_mt: port1.price_per_mt,
      total_cost: cost1,
      rob_before: params.currentROB,
      rob_after: robAfterFirst,
      reasoning: `Maximize at cheapest port ($${port1.price_per_mt.toFixed(0)}/MT).`,
    },
    {
      port_name: port2.port_name,
      port_code: port2.port_code,
      sequence: 2,
      bunker_quantity: q2,
      cost_per_mt: port2.price_per_mt,
      total_cost: cost2,
      rob_before: robAfterFirst,
      rob_after: robAfterSecond,
      reasoning: `Remaining ${q2.toFixed(0)} MT at second port.`,
    },
  ];

  const totalBunker = cost1 + cost2;
  const timeImpact = (port1.deviation_nm + port2.deviation_nm) * HOURS_PER_DEVIATION_NM;

  return {
    strategy_type: 'PRICE_OPTIMIZATION',
    ports: plans,
    total_bunker_cost: totalBunker,
    total_deviation_cost: devCost,
    total_cost: totalBunker + devCost,
    savings_vs_single_port: 0,
    time_impact_hours: timeImpact,
    recommendation: `Price-optimized split: ${q1.toFixed(0)} MT at ${port1.port_name}, ${q2.toFixed(0)} MT at ${port2.port_name}. Total $${(totalBunker + devCost).toFixed(0)}.`,
  };
}

/**
 * Optimize multi-port bunkering: choose best of capacity-split vs price-optimization.
 * If total fuel <= tank capacity, only price-optimization is considered (optional split for savings).
 */
export function optimizeMultiPortBunkering(params: MultiPortParams): MultiPortStrategy | null {
  if (params.availablePorts.length < 2) return null;
  const sortedByPrice = [...params.availablePorts].sort((a, b) => a.price_per_mt - b.price_per_mt);

  const mustSplit = params.totalFuelRequired > params.tankCapacity - params.currentROB;
  let strategies: MultiPortStrategy[] = [];

  if (mustSplit) {
    const cap = capacitySplitStrategy(params, sortedByPrice);
    if (cap) strategies.push(cap);
  }

  const priceOpt = priceOptimizationStrategy(params, sortedByPrice);
  if (priceOpt) strategies.push(priceOpt);

  if (strategies.length === 0) return null;
  const best = strategies.reduce((a, b) => (a.total_cost <= b.total_cost ? a : b));
  return best;
}

/**
 * Compute savings vs single-port best option and attach to strategy.
 */
export function attachSavingsVsSingle(
  strategy: MultiPortStrategy,
  singlePortTotalCost: number
): MultiPortStrategy {
  const savings = singlePortTotalCost - strategy.total_cost;
  return {
    ...strategy,
    savings_vs_single_port: Math.max(0, savings),
  };
}
