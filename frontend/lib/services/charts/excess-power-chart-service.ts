/**
 * Excess Power Chart Service
 *
 * Builds excess power % trend chart from HullPerformanceAnalysis with robust
 * data cleaning: invalid points, zeros, and outliers removed for professional charts.
 */

import { logCustomEvent } from '@/lib/monitoring/axiom-logger';
import type { HullPerformanceAnalysis } from '@/lib/services/hull-performance-service';
import { BaseChartService } from './base-chart-service';

const THRESHOLD_GOOD_MAX = 15;
const THRESHOLD_POOR_MIN = 25;
const ZONE_RED_Y_MAX = 50;

/** Internal point shape for cleaning (timestamp for sort, date for display, excessPowerPct for series) */
interface ExcessPowerPoint {
  timestamp: number;
  date: string;
  excessPowerPct: number;
}

export interface ExcessPowerChartResult {
  data: Array<{ date: string; excess_power_pct: number }>;
  xAxisKey: string;
  series: Array<{ dataKey: string; name?: string; color?: string }>;
  referenceLines: Array<{ y?: number; label?: string; stroke?: string }>;
  referenceAreas: Array<{ y1?: number; y2?: number; fill: string; fillOpacity?: number }>;
  unit: string;
  metadata: {
    totalPoints: number;
    filteredPoints: number;
    cleaningStats: {
      zerosRemoved: number;
      outliersRemoved: number;
      validPoints: number;
    };
    dateRange: {
      start: string;
      end: string;
    };
  };
}

/** Data point for scatter chart (timestamp for X, value for Y) */
export interface ExcessPowerDataPoint {
  timestamp: number;
  date: string;
  excessPowerPct: number;
}

/** Chart data shape for the professional excess power chart (scatter + trend + stats) */
export interface ExcessPowerChartData {
  dataPoints: ExcessPowerDataPoint[];
  regression?: {
    slope: number;
    intercept: number;
    r2: number;
  };
  statistics: {
    trend: 'improving' | 'degrading' | 'stable';
    mean: number;
    stdDev: number;
    min: number;
    max: number;
  };
  metadata: ExcessPowerChartResult['metadata'];
  thresholds: { good: number; poor: number };
}

/** Compute linear regression and stats from result; use for professional chart. */
export function toExcessPowerChartData(
  result: ExcessPowerChartResult
): ExcessPowerChartData {
  const dataPoints: ExcessPowerDataPoint[] = result.data.map((d) => ({
    timestamp: new Date(d.date).getTime(),
    date: d.date,
    excessPowerPct: d.excess_power_pct,
  }));

  const n = dataPoints.length;
  const values = dataPoints.map((p) => p.excessPowerPct);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n > 1 ? n - 1 : 1);
  const stdDev = Math.sqrt(variance);
  const min = Math.min(...values);
  const max = Math.max(...values);

  let regression: ExcessPowerChartData['regression'];
  let trend: ExcessPowerChartData['statistics']['trend'] = 'stable';

  if (n >= 2) {
    const xs = dataPoints.map((p) => p.timestamp);
    const ys = values;
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
    const sumX2 = xs.reduce((s, x) => s + x * x, 0);
    const denom = n * sumX2 - sumX * sumX;
    const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
    const intercept = mean - slope * (sumX / n);

    const yMean = sumY / n;
    const ssTot = ys.reduce((s, y) => s + (y - yMean) ** 2, 0);
    const ssRes = ys.reduce(
      (s, y, i) => s + (y - (slope * xs[i] + intercept)) ** 2,
      0
    );
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    regression = { slope, intercept, r2 };

    const slopePerDay = slope * 86400 * 1000; // slope is per ms
    if (slopePerDay > 0.05) trend = 'degrading';
    else if (slopePerDay < -0.05) trend = 'improving';
  }

  return {
    dataPoints,
    regression,
    statistics: { trend, mean, stdDev, min, max },
    metadata: result.metadata,
    thresholds: { good: THRESHOLD_GOOD_MAX, poor: THRESHOLD_POOR_MIN },
  };
}

export class ExcessPowerChartService extends BaseChartService {
  /**
   * Extract raw points from trend_data for validation and cleaning.
   */
  protected extractDataPoints(
    trendData: HullPerformanceAnalysis['trend_data']
  ): ExcessPowerPoint[] {
    if (!Array.isArray(trendData) || trendData.length === 0) return [];
    return trendData.map((d) => ({
      timestamp: new Date(d.date).getTime(),
      date: d.date,
      excessPowerPct: d.excess_power_pct,
    }));
  }

  /**
   * Build chart-ready data from hull performance analysis with two-step cleaning:
   * 1) Remove invalid data (nulls, NaN); 2) Remove zeros and outliers.
   */
  extractChartData(
    analysis: HullPerformanceAnalysis
  ): ExcessPowerChartResult | null {
    if (!analysis?.trend_data?.length) return null;

    // Extract and validate data points
    const rawPoints = this.extractDataPoints(analysis.trend_data);

    // Step 1: Filter out invalid data (nulls, NaN)
    const validPoints = this.filterValidPoints(
      rawPoints as unknown as Record<string, unknown>[],
      ['timestamp', 'excessPowerPct']
    ) as unknown as ExcessPowerPoint[];
    const invalidCount = rawPoints.length - validPoints.length;

    // Step 2: Remove zeros and outliers for cleaner visualization
    const {
      valid: cleanPoints,
      filtered: cleanedCount,
      stats: cleanStats,
    } = this.filterNonZeroPoints(
      validPoints as unknown as Record<string, any>[],
      ['excessPowerPct'],
      {
        removeZeros: true,
        removeNegatives: false, // Excess power can't be negative, but keep check
        removeOutliers: true,
        outlierThreshold: 3.0, // Remove extreme outliers (3x IQR)
      }
    );

    const totalFiltered = invalidCount + cleanedCount;

    if (cleanPoints.length < 2) {
      logCustomEvent(
        'excess_power_chart_insufficient_data',
        this.correlationId,
        {
          valid_points: cleanPoints.length,
          filtered: totalFiltered,
          zeros_removed: cleanStats.zeros,
          outliers_removed: cleanStats.outliers,
        },
        'warn'
      );
      return null;
    }

    // Sort by timestamp (cleanPoints from base is typed as Record[]; we know shape)
    const sortedPoints = (cleanPoints as unknown as ExcessPowerPoint[]).sort(
      (a, b) => a.timestamp - b.timestamp
    );

    // Chart series data (Recharts expects date + excess_power_pct)
    const data: Array<{ date: string; excess_power_pct: number }> = sortedPoints.map(
      (p) => ({
        date: p.date,
        excess_power_pct: p.excessPowerPct,
      })
    );

    // Build metadata
    const metadata: ExcessPowerChartResult['metadata'] = {
      totalPoints: analysis.trend_data.length,
      filteredPoints: totalFiltered,
      cleaningStats: {
        zerosRemoved: cleanStats.zeros,
        outliersRemoved: cleanStats.outliers,
        validPoints: sortedPoints.length,
      },
      dateRange: {
        start: sortedPoints[0].date,
        end: sortedPoints[sortedPoints.length - 1].date,
      },
    };

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
        {
          y1: THRESHOLD_GOOD_MAX,
          y2: THRESHOLD_POOR_MIN,
          fill: '#eab308',
          fillOpacity: 0.08,
        },
        {
          y1: THRESHOLD_POOR_MIN,
          y2: ZONE_RED_Y_MAX,
          fill: '#ef4444',
          fillOpacity: 0.08,
        },
      ],
      unit: '%',
      metadata,
    };
  }
}
