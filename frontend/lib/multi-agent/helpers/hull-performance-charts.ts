/**
 * Hull Performance Chart Data Utilities
 *
 * Prepares hull performance state for chart visualization:
 * - Excess power trend over time
 * - Actual vs predicted consumption comparison
 * - Baseline comparison (trend vs laden/ballast curves)
 */

/** Single point in trend_data from HullPerformanceAnalysis */
export interface TrendDataPoint {
  date: string;
  excess_power_pct: number;
  speed_loss_pct: number;
  excess_fuel_mtd: number;
  consumption: number;
  predicted_consumption: number;
  speed: number;
}

/** Baseline curve point */
export interface BaselineCurvePoint {
  speed: number;
  consumption: number;
  power: number;
}

/** Chart-ready series for excess power over time */
export interface ExcessPowerTrendChart {
  series: Array<{ date: string; value: number; label?: string }>;
  unit: string;
}

/** Chart-ready series for actual vs predicted consumption */
export interface ConsumptionComparisonChart {
  series: Array<{
    date: string;
    actual: number;
    predicted: number;
    speed?: number;
  }>;
  unit: string;
}

/** Chart-ready series for trend vs baseline curves */
export interface BaselineComparisonChart {
  trend: Array<{ date: string; speed: number; consumption: number }>;
  laden: Array<{ speed: number; consumption: number; power: number }>;
  ballast: Array<{ speed: number; consumption: number; power: number }>;
}

/**
 * Prepare excess power % trend for time-series chart.
 */
export function prepareExcessPowerTrendChart(
  trend_data: TrendDataPoint[] | undefined
): ExcessPowerTrendChart {
  if (!Array.isArray(trend_data) || trend_data.length === 0) {
    return { series: [], unit: '%' };
  }
  const series = trend_data.map((d) => ({
    date: d.date,
    value: d.excess_power_pct,
    label: `Excess power ${d.excess_power_pct.toFixed(1)}%`,
  }));
  return { series, unit: '%' };
}

/**
 * Prepare actual vs predicted consumption for comparison chart.
 */
export function prepareConsumptionComparisonChart(
  trend_data: TrendDataPoint[] | undefined
): ConsumptionComparisonChart {
  if (!Array.isArray(trend_data) || trend_data.length === 0) {
    return { series: [], unit: 'MT/day' };
  }
  const series = trend_data.map((d) => ({
    date: d.date,
    actual: d.consumption,
    predicted: d.predicted_consumption,
    speed: d.speed,
  }));
  return { series, unit: 'MT/day' };
}

/**
 * Prepare trend data alongside baseline curves (laden/ballast) for comparison chart.
 */
export function prepareBaselineComparisonChart(
  trend_data: TrendDataPoint[] | undefined,
  baseline_curves: {
    laden: Array<{ speed: number; consumption: number; power: number }>;
    ballast: Array<{ speed: number; consumption: number; power: number }>;
  } | undefined
): BaselineComparisonChart | null {
  if (!baseline_curves) {
    return null;
  }
  const trend =
    Array.isArray(trend_data) && trend_data.length > 0
      ? trend_data.map((d) => ({
          date: d.date,
          speed: d.speed,
          consumption: d.consumption,
        }))
      : [];
  return {
    trend,
    laden: baseline_curves.laden ?? [],
    ballast: baseline_curves.ballast ?? [],
  };
}
