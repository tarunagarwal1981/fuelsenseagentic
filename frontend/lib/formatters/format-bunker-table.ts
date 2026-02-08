/**
 * Client-safe bunker table formatter.
 * Extracted from response-formatter to avoid pulling fs/template deps into client components.
 */

import type { MultiAgentState } from '../multi-agent/state';

export interface BunkerTableData {
  recommendedPort: BunkerPortRow | null;
  alternativePorts: BunkerPortRow[];
}

export interface BunkerPortRow {
  portName: string;
  portCode: string;
  isRecommended: boolean;
  fuelBreakdown: Array<{
    type: 'VLSFO' | 'MGO' | 'LSMGO';
    quantityMT: number;
    pricePerMT: number;
    totalCost: number;
  }>;
  totalQuantityMT: number;
  totalCostUSD: number;
  averagePricePerMT: number;
  distanceAlongRouteNM: number;
  deviationNM: number;
  weatherSafe: boolean;
  weatherStatus: string;
  confidenceScore: number;
  confidencePercentage: number;
  savingsVsNextBest?: number;
}

export function formatBunkerTable(state: MultiAgentState): BunkerTableData | null {
  if (!state.bunker_analysis) {
    return null;
  }

  const formatPort = (port: any, isRecommended: boolean, savingsVsNext?: number): BunkerPortRow => {
    const totalQuantity = 650;
    const pricePerMT = (port as any).fuel_price_per_mt || (port.fuel_cost_usd / totalQuantity) || 550;
    const totalCost = port.total_cost_usd || port.fuel_cost_usd || 0;

    return {
      portName: port.port_name,
      portCode: port.port_code || '',
      isRecommended,
      fuelBreakdown: [
        {
          type: 'VLSFO',
          quantityMT: totalQuantity,
          pricePerMT: pricePerMT,
          totalCost: totalCost,
        },
      ],
      totalQuantityMT: totalQuantity,
      totalCostUSD: port.total_cost_usd || port.fuel_cost_usd || totalCost,
      averagePricePerMT: pricePerMT,
      distanceAlongRouteNM: port.distance_along_route_nm || 0,
      deviationNM: port.distance_from_route_nm || 0,
      weatherSafe: true,
      weatherStatus: 'Safe',
      confidenceScore: 0.8,
      confidencePercentage: 80,
      savingsVsNextBest: savingsVsNext,
    };
  };

  const best = state.bunker_analysis.best_option;
  const alternatives = state.bunker_analysis.recommendations || [];

  let savingsVsNext: number | undefined;
  if (alternatives.length > 1) {
    savingsVsNext = (alternatives[1].total_cost_usd || 0) - (alternatives[0].total_cost_usd || 0);
  }

  return {
    recommendedPort: best ? formatPort(best, true, savingsVsNext) : null,
    alternativePorts: alternatives.slice(1).map((port, idx) => {
      const savings =
        idx < alternatives.length - 2
          ? (alternatives[idx + 2].total_cost_usd || 0) - (port.total_cost_usd || 0)
          : undefined;
      return formatPort(port, false, savings);
    }),
  };
}
