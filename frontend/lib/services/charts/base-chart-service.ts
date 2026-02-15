/**
 * Base Chart Service
 *
 * Abstract base class providing common utilities for chart data services:
 * - Linear regression (least squares)
 * - Data validation and filtering
 * - Time series processing
 * - Statistical calculations
 *
 * All chart services extend this class.
 */

import { logCustomEvent, logError } from '@/lib/monitoring/axiom-logger';

// ============================================================================
// Common Interfaces
// ============================================================================

/**
 * Linear regression result
 */
export interface RegressionResult {
  slope: number;
  intercept: number;
  r2: number; // R-squared (coefficient of determination)
  equation: string; // Human-readable equation like "y = 2.5x + 10"
}

/**
 * Time series data point
 */
export interface TimeSeriesPoint {
  date: string; // ISO date string
  timestamp: number; // Unix timestamp (ms)
  value: number;
}

/**
 * Chart data validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
  filteredCount?: number; // How many points were filtered out
}

// ============================================================================
// Base Chart Service Class
// ============================================================================

export abstract class BaseChartService {
  protected correlationId: string;

  constructor(correlationId: string) {
    this.correlationId = correlationId;
  }

  // ==========================================================================
  // Regression Analysis
  // ==========================================================================

  /**
   * Calculate linear regression using least squares method
   * Formula: y = mx + b
   *
   * @param xValues - Independent variable (e.g., timestamps)
   * @param yValues - Dependent variable (e.g., excess power %)
   * @returns Regression coefficients and R-squared
   */
  protected calculateLinearRegression(
    xValues: number[],
    yValues: number[]
  ): RegressionResult {
    const n = xValues.length;

    // Validate input
    if (n < 2) {
      return {
        slope: 0,
        intercept: 0,
        r2: 0,
        equation: 'Insufficient data',
      };
    }

    if (xValues.length !== yValues.length) {
      logError(
        this.correlationId,
        new Error('X and Y arrays must have same length'),
        { xLength: xValues.length, yLength: yValues.length }
      );
      return { slope: 0, intercept: 0, r2: 0, equation: 'Data mismatch' };
    }

    // Calculate means
    const xMean = this.calculateMean(xValues);
    const yMean = this.calculateMean(yValues);

    // Calculate slope (m) using covariance / variance
    let numerator = 0; // Covariance
    let denominator = 0; // Variance of X

    for (let i = 0; i < n; i++) {
      const xDiff = xValues[i] - xMean;
      const yDiff = yValues[i] - yMean;
      numerator += xDiff * yDiff;
      denominator += xDiff * xDiff;
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;
    const intercept = yMean - slope * xMean;

    // Calculate R-squared (goodness of fit)
    const r2 = this.calculateRSquared(xValues, yValues, slope, intercept, yMean);

    // Generate equation string
    const equation = this.formatEquation(slope, intercept);

    logCustomEvent(
      'chart_regression_calculated',
      this.correlationId,
      {
        slope: slope.toFixed(6),
        intercept: intercept.toFixed(6),
        r2: r2.toFixed(4),
        data_points: n,
      },
      'info'
    );

    return { slope, intercept, r2, equation };
  }

  /**
   * Calculate R-squared (coefficient of determination)
   * Measures how well the regression line fits the data
   * Range: 0 (no fit) to 1 (perfect fit)
   */
  private calculateRSquared(
    xValues: number[],
    yValues: number[],
    slope: number,
    intercept: number,
    yMean: number
  ): number {
    let ssRes = 0; // Sum of squared residuals (errors)
    let ssTot = 0; // Total sum of squares

    for (let i = 0; i < xValues.length; i++) {
      const predicted = slope * xValues[i] + intercept;
      const actual = yValues[i];

      ssRes += Math.pow(actual - predicted, 2);
      ssTot += Math.pow(actual - yMean, 2);
    }

    // Handle edge case: all y values are identical
    if (ssTot === 0) return 1.0;

    const r2 = 1 - ssRes / ssTot;

    // Clamp between 0 and 1 (can be negative for terrible fits)
    return Math.max(0, Math.min(1, r2));
  }

  /**
   * Format regression equation as human-readable string
   */
  private formatEquation(slope: number, intercept: number): string {
    const slopeStr = slope >= 0 ? `${slope.toFixed(4)}x` : `${slope.toFixed(4)}x`;
    const interceptStr =
      intercept >= 0 ? `+ ${intercept.toFixed(2)}` : `- ${Math.abs(intercept).toFixed(2)}`;
    return `y = ${slopeStr} ${interceptStr}`;
  }

  // ==========================================================================
  // Statistical Utilities
  // ==========================================================================

  /**
   * Calculate arithmetic mean
   */
  protected calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
  }

  /**
   * Calculate standard deviation
   */
  protected calculateStdDev(values: number[]): number {
    if (values.length < 2) return 0;

    const mean = this.calculateMean(values);
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = this.calculateMean(squaredDiffs);

    return Math.sqrt(variance);
  }

  /**
   * Identify outliers using IQR method (1.5 * IQR rule)
   */
  protected identifyOutliers(values: number[]): number[] {
    if (values.length < 4) return [];

    const sorted = [...values].sort((a, b) => a - b);
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);

    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;

    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    return values.filter(val => val < lowerBound || val > upperBound);
  }

  // ==========================================================================
  // Data Validation & Filtering
  // ==========================================================================

  /**
   * Validate chart data meets minimum requirements
   */
  protected validateChartData(
    data: any[],
    minPoints: number = 2
  ): ValidationResult {
    if (!Array.isArray(data)) {
      return {
        isValid: false,
        errorMessage: 'Data must be an array',
      };
    }

    if (data.length < minPoints) {
      return {
        isValid: false,
        errorMessage: `Insufficient data points. Need at least ${minPoints}, got ${data.length}`,
      };
    }

    return { isValid: true };
  }

  /**
   * Filter out invalid data points (null, undefined, NaN, Infinity)
   */
  protected filterValidPoints<T extends Record<string, any>>(
    data: T[],
    requiredFields: (keyof T)[]
  ): { valid: T[]; filtered: number } {
    const valid = data.filter(point => {
      // Check all required fields are present and valid numbers
      return requiredFields.every(field => {
        const value = point[field];
        return (
          value != null &&
          typeof value === 'number' &&
          !isNaN(value) &&
          isFinite(value)
        );
      });
    });

    const filtered = data.length - valid.length;

    if (filtered > 0) {
      logCustomEvent(
        'chart_data_filtered',
        this.correlationId,
        {
          original_count: data.length,
          valid_count: valid.length,
          filtered_count: filtered,
        },
        'info'
      );
    }

    return { valid, filtered };
  }

  /**
   * Normalize timestamps to days since first data point
   * Useful for trend analysis where absolute dates don't matter
   */
  protected normalizeTimestamps(timestamps: number[]): number[] {
    if (timestamps.length === 0) return [];

    const minTimestamp = Math.min(...timestamps);
    const msPerDay = 24 * 60 * 60 * 1000;

    return timestamps.map(ts => (ts - minTimestamp) / msPerDay);
  }

  /**
   * Convert date string to Unix timestamp (ms)
   */
  protected dateToTimestamp(dateStr: string): number {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      logError(
        this.correlationId,
        new Error(`Invalid date string: ${dateStr}`),
        { dateStr }
      );
      return 0;
    }
    return date.getTime();
  }

  // ==========================================================================
  // Chart Data Formatting
  // ==========================================================================

  /**
   * Generate best-fit line data points from regression
   */
  protected generateBestFitLine(
    xValues: number[],
    regression: RegressionResult
  ): Array<{ x: number; y: number }> {
    return xValues.map(x => ({
      x,
      y: regression.slope * x + regression.intercept,
    }));
  }

  /**
   * Resample time series to fixed intervals (e.g., daily, weekly)
   * Useful for smoothing noisy data
   */
  protected resampleTimeSeries(
    points: TimeSeriesPoint[],
    intervalMs: number
  ): TimeSeriesPoint[] {
    if (points.length === 0) return [];

    const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
    const resampled: TimeSeriesPoint[] = [];

    let currentBucket: TimeSeriesPoint[] = [];
    let bucketStart = sorted[0].timestamp;

    for (const point of sorted) {
      if (point.timestamp < bucketStart + intervalMs) {
        currentBucket.push(point);
      } else {
        // Finalize current bucket
        if (currentBucket.length > 0) {
          const avgValue = this.calculateMean(currentBucket.map(p => p.value));
          resampled.push({
            date: new Date(bucketStart).toISOString().split('T')[0],
            timestamp: bucketStart,
            value: avgValue,
          });
        }

        // Start new bucket
        currentBucket = [point];
        bucketStart = point.timestamp;
      }
    }

    // Finalize last bucket
    if (currentBucket.length > 0) {
      const avgValue = this.calculateMean(currentBucket.map(p => p.value));
      resampled.push({
        date: new Date(bucketStart).toISOString().split('T')[0],
        timestamp: bucketStart,
        value: avgValue,
      });
    }

    return resampled;
  }
}
