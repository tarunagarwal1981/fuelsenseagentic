/**
 * Excess Power Chart Service
 *
 * Processes hull performance data to generate excess power trend charts.
 * Provides:
 * - Time series of excess power percentage
 * - Linear regression (best-fit trend line)
 * - Statistical summary (mean, std dev, outliers)
 *
 * Used by: Hull Performance Agent, Commercial Performance Agent
 */

import { BaseChartService, type RegressionResult } from './base-chart-service';
import type { HullPerformanceAnalysis } from '../hull-performance-service';
import { logCustomEvent } from '@/lib/monitoring/axiom-logger';

// ============================================================================
// Interfaces
// ============================================================================

export interface ExcessPowerDataPoint {
  date: string; // ISO date (YYYY-MM-DD)
  timestamp: number; // Unix timestamp (ms)
  excessPowerPct: number; // Excess power percentage
  reportDate: string; // Original report date for reference
}

export interface ExcessPowerChartData {
  dataPoints: ExcessPowerDataPoint[];
  regression: RegressionResult;
  statistics: {
    mean: number;
    stdDev: number;
    min: number;
    max: number;
    trend: 'improving' | 'degrading' | 'stable'; // Based on regression slope
  };
  thresholds: {
    good: number; // 15%
    poor: number; // 25%
  };
  metadata: {
    totalPoints: number;
    filteredPoints: number;
    dateRange: {
      start: string;
      end: string;
    };
  };
}

// ============================================================================
// Service
// ============================================================================

export class ExcessPowerChartService extends BaseChartService {
  private readonly GOOD_THRESHOLD = 15; // % - Hull in good condition
  private readonly POOR_THRESHOLD = 25; // % - Hull needs immediate cleaning

  /**
   * Extract excess power chart data from hull performance analysis
   */
  async extractChartData(
    analysis: HullPerformanceAnalysis
  ): Promise<ExcessPowerChartData | null> {
    const startTime = Date.now();

    logCustomEvent(
      'excess_power_chart_extraction_start',
      this.correlationId,
      { vessel_imo: analysis.vessel.imo },
      'info'
    );

    // Validate input
    const validation = this.validateChartData(analysis.trend_data, 2);
    if (!validation.isValid) {
      logCustomEvent(
        'excess_power_chart_extraction_failed',
        this.correlationId,
        { reason: validation.errorMessage },
        'warn'
      );
      return null;
    }

    // Extract and validate data points
    const rawPoints = this.extractDataPoints(analysis.trend_data);
    const { valid: validPoints, filtered: filteredCount } = this.filterValidPoints(
      rawPoints,
      ['timestamp', 'excessPowerPct']
    );

    if (validPoints.length < 2) {
      logCustomEvent(
        'excess_power_chart_insufficient_data',
        this.correlationId,
        { valid_points: validPoints.length, filtered: filteredCount },
        'warn'
      );
      return null;
    }

    // Sort by timestamp
    const sortedPoints = validPoints.sort((a, b) => a.timestamp - b.timestamp);

    // Calculate regression
    const timestamps = sortedPoints.map(p => p.timestamp);
    const excessPowers = sortedPoints.map(p => p.excessPowerPct);
    const regression = this.calculateLinearRegression(timestamps, excessPowers);

    // Calculate statistics
    const statistics = this.calculateStatistics(excessPowers, regression);

    // Build metadata
    const metadata = {
      totalPoints: analysis.trend_data.length,
      filteredPoints: filteredCount,
      dateRange: {
        start: sortedPoints[0].date,
        end: sortedPoints[sortedPoints.length - 1].date,
      },
    };

    const chartData: ExcessPowerChartData = {
      dataPoints: sortedPoints,
      regression,
      statistics,
      thresholds: {
        good: this.GOOD_THRESHOLD,
        poor: this.POOR_THRESHOLD,
      },
      metadata,
    };

    const executionTime = Date.now() - startTime;
    logCustomEvent(
      'excess_power_chart_extraction_complete',
      this.correlationId,
      {
        vessel_imo: analysis.vessel.imo,
        data_points: sortedPoints.length,
        r2: regression.r2.toFixed(3),
        trend: statistics.trend,
        execution_time_ms: executionTime,
      },
      'info'
    );

    return chartData;
  }

  /**
   * Extract data points from trend data
   */
  private extractDataPoints(
    trendData: HullPerformanceAnalysis['trend_data']
  ): ExcessPowerDataPoint[] {
    return trendData.map(point => ({
      date: point.date,
      timestamp: this.dateToTimestamp(point.date),
      excessPowerPct: point.excess_power_pct ?? 0,
      reportDate: point.date,
    }));
  }

  /**
   * Calculate statistical summary
   */
  private calculateStatistics(
    values: number[],
    regression: RegressionResult
  ): ExcessPowerChartData['statistics'] {
    const mean = this.calculateMean(values);
    const stdDev = this.calculateStdDev(values);
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Determine trend based on regression slope
    // Positive slope = degrading (excess power increasing)
    // Negative slope = improving (excess power decreasing)
    let trend: 'improving' | 'degrading' | 'stable';
    if (Math.abs(regression.slope) < 1e-10) {
      // Essentially zero slope
      trend = 'stable';
    } else if (regression.slope > 0) {
      trend = 'degrading';
    } else {
      trend = 'improving';
    }

    return { mean, stdDev, min, max, trend };
  }

  /**
   * Generate prediction for a future date
   * Useful for forecasting when hull cleaning will be needed
   */
  predictExcessPower(
    regression: RegressionResult,
    futureDateStr: string
  ): number {
    const futureTimestamp = this.dateToTimestamp(futureDateStr);
    return regression.slope * futureTimestamp + regression.intercept;
  }

  /**
   * Estimate days until threshold is reached
   * Returns null if threshold is never reached (improving trend)
   */
  estimateDaysUntilThreshold(
    currentValue: number,
    regression: RegressionResult,
    threshold: number
  ): number | null {
    // If already above threshold
    if (currentValue >= threshold) return 0;

    // If trend is improving or stable, threshold won't be reached
    if (regression.slope <= 0) return null;

    // Calculate: threshold = slope * (currentTime + daysMs) + intercept
    // Solve for daysMs
    const currentTime = Date.now();
    const thresholdTime = (threshold - regression.intercept) / regression.slope;
    const daysMs = thresholdTime - currentTime;
    const days = daysMs / (24 * 60 * 60 * 1000);

    return days > 0 ? Math.ceil(days) : null;
  }
}
