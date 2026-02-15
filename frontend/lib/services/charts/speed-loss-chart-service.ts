/**
 * Speed Loss Chart Service
 *
 * Builds speed loss % trend chart from HullPerformanceAnalysis with robust
 * data cleaning: invalid points, zeros, and outliers removed for professional charts.
 */

import { logCustomEvent } from '@/lib/monitoring/axiom-logger';
import type { HullPerformanceAnalysis } from '@/lib/services/hull-performance-service';
import { BaseChartService } from './base-chart-service';

/** Internal point shape for cleaning (timestamp for sort, date for display, speedLossPct for series) */
interface SpeedLossPoint {
  timestamp: number;
  date: string;
  speedLossPct: number;
}

export interface SpeedLossChartResult {
  data: Array<{ date: string; speed_loss_pct: number }>;
  xAxisKey: string;
  series: Array<{ dataKey: string; name?: string; color?: string }>;
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

/** Data point for scatter chart (timestamp for X, value for Y; optional actualSpeed for tooltip) */
export interface SpeedLossDataPoint {
  timestamp: number;
  date: string;
  speedLossPct: number;
  actualSpeed?: number;
}

/** Chart data shape for the professional speed loss chart (scatter + trend + stats) */
export interface SpeedLossChartData {
  dataPoints: SpeedLossDataPoint[];
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
  metadata: SpeedLossChartResult['metadata'];
}

/** Compute linear regression and stats from result; use for professional chart. */
export function toSpeedLossChartData(
  result: SpeedLossChartResult
): SpeedLossChartData {
  const dataPoints: SpeedLossDataPoint[] = result.data.map((d) => ({
    timestamp: new Date(d.date).getTime(),
    date: d.date,
    speedLossPct: d.speed_loss_pct,
  }));

  const n = dataPoints.length;
  const values = dataPoints.map((p) => p.speedLossPct);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n > 1 ? n - 1 : 1);
  const stdDev = Math.sqrt(variance);
  const min = Math.min(...values);
  const max = Math.max(...values);

  let regression: SpeedLossChartData['regression'];
  let trend: SpeedLossChartData['statistics']['trend'] = 'stable';

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

    const slopePerDay = slope * 86400 * 1000;
    if (slopePerDay > 0.05) trend = 'degrading';
    else if (slopePerDay < -0.05) trend = 'improving';
  }

  return {
    dataPoints,
    regression,
    statistics: { trend, mean, stdDev, min, max },
    metadata: result.metadata,
  };
}

export class SpeedLossChartService extends BaseChartService {
  /**
   * Extract raw points from trend_data for validation and cleaning.
   */
  protected extractDataPoints(
    trendData: HullPerformanceAnalysis['trend_data']
  ): SpeedLossPoint[] {
    if (!Array.isArray(trendData) || trendData.length === 0) return [];
    return trendData.map((d) => ({
      timestamp: new Date(d.date).getTime(),
      date: d.date,
      speedLossPct: d.speed_loss_pct,
    }));
  }

  /**
   * Build chart-ready data from hull performance analysis with two-step cleaning:
   * 1) Remove invalid data (nulls, NaN); 2) Remove zeros and outliers.
   */
  extractChartData(
    analysis: HullPerformanceAnalysis
  ): SpeedLossChartResult | null {
    if (!analysis?.trend_data?.length) return null;

    // Extract and validate data points
    const rawPoints = this.extractDataPoints(analysis.trend_data);

    // Step 1: Filter invalid data
    const validPoints = this.filterValidPoints(
      rawPoints as unknown as Record<string, unknown>[],
      ['timestamp', 'speedLossPct']
    ) as unknown as SpeedLossPoint[];
    const invalidCount = rawPoints.length - validPoints.length;

    // Step 2: Remove zeros and outliers
    const {
      valid: cleanPoints,
      filtered: cleanedCount,
      stats: cleanStats,
    } = this.filterNonZeroPoints(
      validPoints as unknown as Record<string, any>[],
      ['speedLossPct'],
      {
        removeZeros: true,
        removeNegatives: false,
        removeOutliers: true,
        outlierThreshold: 3.0,
      }
    );

    const totalFiltered = invalidCount + cleanedCount;

    if (cleanPoints.length < 2) {
      logCustomEvent(
        'speed_loss_chart_insufficient_data',
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

    // Sort by timestamp
    const sortedPoints = (cleanPoints as unknown as SpeedLossPoint[]).sort(
      (a, b) => a.timestamp - b.timestamp
    );

    // Chart series data (Recharts expects date + speed_loss_pct)
    const data: Array<{ date: string; speed_loss_pct: number }> = sortedPoints.map(
      (p) => ({
        date: p.date,
        speed_loss_pct: p.speedLossPct,
      })
    );

    // Build metadata
    const metadata: SpeedLossChartResult['metadata'] = {
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
        { dataKey: 'speed_loss_pct', name: 'Speed loss %', color: '#0ea5e9' },
      ],
      unit: '%',
      metadata,
    };
  }
}
