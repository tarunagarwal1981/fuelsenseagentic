/**
 * Speed-Consumption Chart Service
 *
 * Analyzes relationship between vessel speed and fuel consumption.
 * Generates speed-consumption curves for voyage optimization.
 *
 * Used by: Hull Performance Agent, Voyage Optimizer Agent
 */

import { BaseChartService } from './base-chart-service';
import type { HullPerformanceAnalysis } from '../hull-performance-service';
import { logCustomEvent } from '@/lib/monitoring/axiom-logger';

// ============================================================================
// Interfaces
// ============================================================================

export interface SpeedConsumptionPoint {
  speed: number; // Vessel speed (knots)
  consumption: number; // Fuel consumption (MT/day)
  date: string; // Date of measurement (for color coding)
  timestamp: number; // Unix timestamp
  condition?: 'laden' | 'ballast'; // Vessel loading condition
}

export interface SpeedConsumptionChartData {
  dataPoints: SpeedConsumptionPoint[];
  statistics: {
    avgSpeed: number;
    avgConsumption: number;
    speedRange: { min: number; max: number };
    consumptionRange: { min: number; max: number };
    correlation: number; // Pearson correlation coefficient
  };
  // Optional: polynomial curve fit (cubic) for better accuracy
  polynomialFit?: {
    coefficients: number[]; // [a, b, c, d] for y = ax³ + bx² + cx + d
    r2: number;
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

export class SpeedConsumptionChartService extends BaseChartService {
  /**
   * Extract speed-consumption chart data from hull performance analysis
   */
  async extractChartData(
    analysis: HullPerformanceAnalysis
  ): Promise<SpeedConsumptionChartData | null> {
    const startTime = Date.now();

    logCustomEvent(
      'speed_consumption_chart_extraction_start',
      this.correlationId,
      { vessel_imo: analysis.vessel.imo },
      'info'
    );

    // Validate input
    const validation = this.validateChartData(analysis.trend_data, 2);
    if (!validation.isValid) {
      logCustomEvent(
        'speed_consumption_chart_extraction_failed',
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
      ['speed', 'consumption']
    );

    if (validPoints.length < 2) {
      logCustomEvent(
        'speed_consumption_chart_insufficient_data',
        this.correlationId,
        { valid_points: validPoints.length, filtered: filteredCount },
        'warn'
      );
      return null;
    }

    // Sort by speed for better visualization
    const sortedPoints = validPoints.sort((a, b) => a.speed - b.speed);

    // Calculate statistics
    const statistics = this.calculateStatistics(sortedPoints);

    // Build metadata
    const metadata = {
      totalPoints: analysis.trend_data.length,
      filteredPoints: filteredCount,
      dateRange: {
        start: sortedPoints[0].date,
        end: sortedPoints[sortedPoints.length - 1].date,
      },
    };

    const chartData: SpeedConsumptionChartData = {
      dataPoints: sortedPoints,
      statistics,
      metadata,
    };

    const executionTime = Date.now() - startTime;
    logCustomEvent(
      'speed_consumption_chart_extraction_complete',
      this.correlationId,
      {
        vessel_imo: analysis.vessel.imo,
        data_points: sortedPoints.length,
        correlation: statistics.correlation.toFixed(3),
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
  ): SpeedConsumptionPoint[] {
    return trendData.map(point => ({
      speed: point.speed ?? 0,
      consumption: point.consumption ?? 0,
      date: point.date,
      timestamp: this.dateToTimestamp(point.date),
      condition: undefined, // trend_data has no condition; baseline curves do
    }));
  }

  /**
   * Calculate statistical summary and correlation
   */
  private calculateStatistics(
    points: SpeedConsumptionPoint[]
  ): SpeedConsumptionChartData['statistics'] {
    const speeds = points.map(p => p.speed);
    const consumptions = points.map(p => p.consumption);

    const avgSpeed = this.calculateMean(speeds);
    const avgConsumption = this.calculateMean(consumptions);

    const speedRange = {
      min: Math.min(...speeds),
      max: Math.max(...speeds),
    };

    const consumptionRange = {
      min: Math.min(...consumptions),
      max: Math.max(...consumptions),
    };

    // Calculate Pearson correlation coefficient
    const correlation = this.calculateCorrelation(speeds, consumptions);

    return {
      avgSpeed,
      avgConsumption,
      speedRange,
      consumptionRange,
      correlation,
    };
  }

  /**
   * Calculate Pearson correlation coefficient
   * Measures linear relationship between speed and consumption
   * Range: -1 (perfect negative) to +1 (perfect positive)
   */
  private calculateCorrelation(xValues: number[], yValues: number[]): number {
    const n = xValues.length;
    if (n < 2) return 0;

    const xMean = this.calculateMean(xValues);
    const yMean = this.calculateMean(yValues);

    let numerator = 0;
    let xDenominator = 0;
    let yDenominator = 0;

    for (let i = 0; i < n; i++) {
      const xDiff = xValues[i] - xMean;
      const yDiff = yValues[i] - yMean;

      numerator += xDiff * yDiff;
      xDenominator += xDiff * xDiff;
      yDenominator += yDiff * yDiff;
    }

    const denominator = Math.sqrt(xDenominator * yDenominator);

    if (denominator === 0) return 0;

    return numerator / denominator;
  }

  /**
   * Predict consumption at a given speed using linear interpolation
   * For more accurate predictions, use polynomial fit
   */
  predictConsumption(
    chartData: SpeedConsumptionChartData,
    targetSpeed: number
  ): number | null {
    const points = chartData.dataPoints;

    // Find two closest points
    let lowerPoint: SpeedConsumptionPoint | null = null;
    let upperPoint: SpeedConsumptionPoint | null = null;

    for (const point of points) {
      if (point.speed <= targetSpeed) {
        if (!lowerPoint || point.speed > lowerPoint.speed) {
          lowerPoint = point;
        }
      }
      if (point.speed >= targetSpeed) {
        if (!upperPoint || point.speed < upperPoint.speed) {
          upperPoint = point;
        }
      }
    }

    // Exact match
    if (lowerPoint && lowerPoint.speed === targetSpeed) {
      return lowerPoint.consumption;
    }
    if (upperPoint && upperPoint.speed === targetSpeed) {
      return upperPoint.consumption;
    }

    // Interpolation
    if (lowerPoint && upperPoint) {
      const ratio =
        (targetSpeed - lowerPoint.speed) / (upperPoint.speed - lowerPoint.speed);
      return (
        lowerPoint.consumption +
        ratio * (upperPoint.consumption - lowerPoint.consumption)
      );
    }

    // Extrapolation not recommended
    return null;
  }

  /**
   * Find optimal speed for fuel efficiency
   * Returns speed (knots) that minimizes consumption per nautical mile
   */
  findOptimalSpeed(chartData: SpeedConsumptionChartData): number | null {
    const points = chartData.dataPoints;
    if (points.length < 2) return null;

    let optimalSpeed: number | null = null;
    let minConsumptionPerMile = Infinity;

    for (const point of points) {
      if (point.speed === 0) continue; // Avoid division by zero

      // Consumption per nautical mile = consumption (MT/day) / (speed (knots) * 24 hours)
      const consumptionPerMile = point.consumption / (point.speed * 24);

      if (consumptionPerMile < minConsumptionPerMile) {
        minConsumptionPerMile = consumptionPerMile;
        optimalSpeed = point.speed;
      }
    }

    return optimalSpeed;
  }
}
