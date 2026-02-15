/**
 * Speed Loss Chart Service
 *
 * Processes hull performance data to generate speed loss trend charts.
 * Tracks hull roughness impact on vessel speed over time.
 *
 * Used by: Hull Performance Agent, Fleet Performance Agent
 */

import { BaseChartService, type RegressionResult } from './base-chart-service';
import type { HullPerformanceAnalysis } from '../hull-performance-service';
import { logCustomEvent } from '@/lib/monitoring/axiom-logger';

// ============================================================================
// Interfaces
// ============================================================================

export interface SpeedLossDataPoint {
  date: string;
  timestamp: number;
  speedLossPct: number;
  actualSpeed?: number; // Optional: actual speed for context
  reportDate: string;
}

export interface SpeedLossChartData {
  dataPoints: SpeedLossDataPoint[];
  regression: RegressionResult;
  statistics: {
    mean: number;
    stdDev: number;
    min: number;
    max: number;
    trend: 'improving' | 'degrading' | 'stable';
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

export class SpeedLossChartService extends BaseChartService {
  /**
   * Extract speed loss chart data from hull performance analysis
   */
  async extractChartData(
    analysis: HullPerformanceAnalysis
  ): Promise<SpeedLossChartData | null> {
    const startTime = Date.now();

    logCustomEvent(
      'speed_loss_chart_extraction_start',
      this.correlationId,
      { vessel_imo: analysis.vessel.imo },
      'info'
    );

    // Validate input
    const validation = this.validateChartData(analysis.trend_data, 2);
    if (!validation.isValid) {
      logCustomEvent(
        'speed_loss_chart_extraction_failed',
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
      ['timestamp', 'speedLossPct']
    );

    if (validPoints.length < 2) {
      logCustomEvent(
        'speed_loss_chart_insufficient_data',
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
    const speedLosses = sortedPoints.map(p => p.speedLossPct);
    const regression = this.calculateLinearRegression(timestamps, speedLosses);

    // Calculate statistics
    const statistics = this.calculateStatistics(speedLosses, regression);

    // Build metadata
    const metadata = {
      totalPoints: analysis.trend_data.length,
      filteredPoints: filteredCount,
      dateRange: {
        start: sortedPoints[0].date,
        end: sortedPoints[sortedPoints.length - 1].date,
      },
    };

    const chartData: SpeedLossChartData = {
      dataPoints: sortedPoints,
      regression,
      statistics,
      metadata,
    };

    const executionTime = Date.now() - startTime;
    logCustomEvent(
      'speed_loss_chart_extraction_complete',
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
  ): SpeedLossDataPoint[] {
    return trendData.map(point => ({
      date: point.date,
      timestamp: this.dateToTimestamp(point.date),
      speedLossPct: point.speed_loss_pct ?? 0,
      actualSpeed: point.speed,
      reportDate: point.date,
    }));
  }

  /**
   * Calculate statistical summary
   */
  private calculateStatistics(
    values: number[],
    regression: RegressionResult
  ): SpeedLossChartData['statistics'] {
    const mean = this.calculateMean(values);
    const stdDev = this.calculateStdDev(values);
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Determine trend
    let trend: 'improving' | 'degrading' | 'stable';
    if (Math.abs(regression.slope) < 1e-10) {
      trend = 'stable';
    } else if (regression.slope > 0) {
      trend = 'degrading'; // Speed loss increasing
    } else {
      trend = 'improving'; // Speed loss decreasing
    }

    return { mean, stdDev, min, max, trend };
  }

  /**
   * Calculate economic impact of speed loss
   * Returns additional fuel consumption (MT/day) due to speed loss
   *
   * @param speedLossPct - Speed loss percentage
   * @param baseConsumption - Normal consumption at design speed (MT/day)
   * @returns Additional fuel consumption
   */
  calculateSpeedLossImpact(
    speedLossPct: number,
    baseConsumption: number
  ): number {
    // Simplified model: fuel consumption increases with cube of speed loss
    // More accurate models would use propulsion curves
    const factor = Math.pow(1 + speedLossPct / 100, 3) - 1;
    return baseConsumption * factor;
  }
}
