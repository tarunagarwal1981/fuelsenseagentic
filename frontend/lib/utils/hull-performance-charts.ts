/**
 * Hull Performance Chart Data Utilities
 *
 * Prepares chart data from HullPerformanceAnalysis for Recharts:
 * - Excess power trend with threshold lines and color zones
 * - Actual vs predicted consumption with fill
 * - Baseline comparison (scatter + laden/ballast overlays)
 * - KPI cards for latest metrics
 */

import type { HullPerformanceAnalysis, HullCondition } from '@/lib/services/hull-performance-service';

// ---------------------------------------------------------------------------
// Types (Recharts-friendly)
// ---------------------------------------------------------------------------

/** Data point for Recharts (array of objects, keyed by axis/series) */
export type ChartDataPoint = Record<string, string | number>;

/**
 * Chart data for Recharts LineChart/AreaChart.
 * - data: array passed to <LineChart data={...} />
 * - xAxisKey: key for X axis (default 'date')
 * - series: which keys to plot as lines/areas
 * - referenceLines: horizontal/vertical lines (e.g. thresholds)
 * - referenceAreas: horizontal bands (e.g. green/yellow/red zones)
 */
export interface ChartData {
  data: ChartDataPoint[];
  xAxisKey?: string;
  yAxisKey?: string;
  series?: Array<{ dataKey: string; name?: string; color?: string }>;
  referenceLines?: Array<{ y?: number; x?: number; label?: string; stroke?: string }>;
  referenceAreas?: Array<{
    y1?: number;
    y2?: number;
    x1?: number;
    x2?: number;
    fill: string;
    fillOpacity?: number;
  }>;
  /** For scatter-style charts: overlay curves (e.g. baseline laden/ballast) */
  overlaySeries?: Array<{
    data: Array<{ speed: number; consumption: number }>;
    name: string;
    color: string;
  }>;
  unit?: string;
}

/** KPI card for UI: title, value, subtitle, icon, threshold indicator */
export interface KPICard {
  title: string;
  value: string;
  subtitle?: string;
  icon?: string;
  threshold_indicator: 'good' | 'average' | 'poor' | 'neutral';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THRESHOLD_GOOD_MAX = 15;
const THRESHOLD_POOR_MIN = 25;
const ZONE_RED_Y_MAX = 50;

// ---------------------------------------------------------------------------
// 1. Excess power trend
// ---------------------------------------------------------------------------

/**
 * Line chart: excess power % over time with threshold lines (15%, 25%)
 * and color zones: green (<15%), yellow (15–25%), red (>25%).
 */
export function prepareExcessPowerTrendChart(
  trendData: HullPerformanceAnalysis['trend_data']
): ChartData {
  if (!Array.isArray(trendData) || trendData.length === 0) {
    return { data: [], unit: '%' };
  }

  const data: ChartDataPoint[] = trendData.map((d) => ({
    date: d.date,
    excess_power_pct: d.excess_power_pct,
  }));

  return {
    data,
    xAxisKey: 'date',
    series: [
      { dataKey: 'excess_power_pct', name: 'Excess power %', color: '#0ea5e9' },
    ],
    referenceLines: [
      { y: THRESHOLD_GOOD_MAX, label: '15%', stroke: '#22c55e' },
      { y: THRESHOLD_POOR_MIN, label: '25%', stroke: '#ef4444' },
    ],
    referenceAreas: [
      { y1: 0, y2: THRESHOLD_GOOD_MAX, fill: '#22c55e', fillOpacity: 0.08 },
      { y1: THRESHOLD_GOOD_MAX, y2: THRESHOLD_POOR_MIN, fill: '#eab308', fillOpacity: 0.08 },
      { y1: THRESHOLD_POOR_MIN, y2: ZONE_RED_Y_MAX, fill: '#ef4444', fillOpacity: 0.08 },
    ],
    unit: '%',
  };
}

// ---------------------------------------------------------------------------
// 2. Consumption comparison
// ---------------------------------------------------------------------------

/**
 * Dual line chart: actual vs predicted consumption over time.
 * Fill between lines can be rendered by the chart component (e.g. Area between two Line series).
 */
export function prepareConsumptionComparisonChart(
  trendData: HullPerformanceAnalysis['trend_data']
): ChartData {
  if (!Array.isArray(trendData) || trendData.length === 0) {
    return { data: [], unit: 'MT/day' };
  }

  const data: ChartDataPoint[] = trendData.map((d) => ({
    date: d.date,
    actual: d.consumption,
    predicted: d.predicted_consumption,
    excess: Math.max(0, d.consumption - d.predicted_consumption),
  }));

  return {
    data,
    xAxisKey: 'date',
    series: [
      { dataKey: 'actual', name: 'Actual consumption', color: '#0ea5e9' },
      { dataKey: 'predicted', name: 'Predicted consumption', color: '#64748b' },
    ],
    unit: 'MT/day',
  };
}

// ---------------------------------------------------------------------------
// 3. Baseline comparison
// ---------------------------------------------------------------------------

/**
 * Scatter-style data with baseline curve overlays: actual performance points
 * plus laden and ballast baseline curves.
 */
export function prepareBaselineComparisonChart(
  trendData: HullPerformanceAnalysis['trend_data'],
  baselineCurves: HullPerformanceAnalysis['baseline_curves']
): ChartData {
  const trendPoints =
    Array.isArray(trendData) && trendData.length > 0
      ? trendData.map((d) => ({ speed: d.speed, consumption: d.consumption }))
      : [];

  const data: ChartDataPoint[] = trendPoints.map((p, i) => ({
    ...p,
    point_index: i,
  }));

  const overlaySeries: ChartData['overlaySeries'] = [];
  if (baselineCurves?.laden?.length) {
    overlaySeries.push({
      data: baselineCurves.laden.map((p) => ({ speed: p.speed, consumption: p.consumption })),
      name: 'Baseline (laden)',
      color: '#22c55e',
    });
  }
  if (baselineCurves?.ballast?.length) {
    overlaySeries.push({
      data: baselineCurves.ballast.map((p) => ({ speed: p.speed, consumption: p.consumption })),
      name: 'Baseline (ballast)',
      color: '#3b82f6',
    });
  }

  return {
    data,
    xAxisKey: 'speed',
    yAxisKey: 'consumption',
    series: [
      { dataKey: 'consumption', name: 'Actual (speed vs consumption)', color: '#0ea5e9' },
    ],
    overlaySeries: overlaySeries.length ? overlaySeries : undefined,
    unit: 'MT/day',
  };
}

// ---------------------------------------------------------------------------
// 4. KPI cards
// ---------------------------------------------------------------------------

/**
 * Builds an array of KPI card objects from latest metrics and hull condition.
 */
export function prepareKPICards(
  latestMetrics: HullPerformanceAnalysis['latest_metrics'],
  condition: HullCondition
): KPICard[] {
  const indicator: KPICard['threshold_indicator'] =
    condition === 'GOOD' ? 'good' : condition === 'POOR' ? 'poor' : 'average';

  const pct = (v: number, decimals = 1) =>
    typeof v === 'number' && !Number.isNaN(v) ? `${v.toFixed(decimals)}%` : '—';
  const num = (v: number, decimals = 1) =>
    typeof v === 'number' && !Number.isNaN(v) ? v.toFixed(decimals) : '—';

  return [
    {
      title: 'Excess power',
      value: pct(latestMetrics.excess_power_pct),
      subtitle: 'Above clean-hull baseline',
      icon: '⚡',
      threshold_indicator: indicator,
    },
    {
      title: 'Speed loss',
      value: pct(latestMetrics.speed_loss_pct),
      subtitle: 'vs design speed',
      icon: '📉',
      threshold_indicator: 'neutral',
    },
    {
      title: 'Excess fuel (pct)',
      value: pct(latestMetrics.excess_fuel_consumption_pct),
      subtitle: 'Consumption above predicted',
      icon: '🛢️',
      threshold_indicator: indicator,
    },
    {
      title: 'Excess fuel (MTD)',
      value: num(latestMetrics.excess_fuel_consumption_mtd),
      subtitle: 'MT per day excess',
      icon: '📊',
      threshold_indicator: indicator,
    },
    {
      title: 'Actual consumption',
      value: `${num(latestMetrics.actual_consumption)} MT/day`,
      subtitle: 'Report period',
      icon: '📈',
      threshold_indicator: 'neutral',
    },
    {
      title: 'Predicted consumption',
      value: `${num(latestMetrics.predicted_consumption)} MT/day`,
      subtitle: 'Clean-hull baseline',
      icon: '🎯',
      threshold_indicator: 'neutral',
    },
    {
      title: 'Actual speed',
      value: `${num(latestMetrics.actual_speed)} kts`,
      subtitle: 'Report period',
      icon: '🚢',
      threshold_indicator: 'neutral',
    },
    {
      title: 'Report date',
      value: latestMetrics.report_date ?? '—',
      subtitle: 'Latest data point',
      icon: '📅',
      threshold_indicator: 'neutral',
    },
  ];
}
