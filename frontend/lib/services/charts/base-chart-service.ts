/**
 * Base chart service: shared data cleaning and validation for professional-grade charts.
 * Subclasses can use filterValidPoints and filterNonZeroPoints for robust series data.
 */

import { logCustomEvent } from '@/lib/monitoring/axiom-logger';

export abstract class BaseChartService {
  protected readonly correlationId: string;

  constructor(correlationId: string) {
    this.correlationId = correlationId;
  }

  /**
   * Filter to points where all given value fields are valid (non-null, finite numbers).
   */
  protected filterValidPoints<T extends Record<string, unknown>>(
    data: T[],
    valueFields: (keyof T)[]
  ): T[] {
    return data.filter((point) =>
      valueFields.every((field) => {
        const v = point[field];
        return typeof v === 'number' && Number.isFinite(v);
      })
    );
  }

  /**
   * Filter out zero values and nulls for cleaner charts
   * Also removes extreme outliers that would skew visualization
   */
  protected filterNonZeroPoints<T extends Record<string, any>>(
    data: T[],
    valueFields: (keyof T)[],
    options?: {
      removeZeros?: boolean;
      removeNegatives?: boolean;
      removeOutliers?: boolean;
      outlierThreshold?: number; // IQR multiplier (default: 3.0 for extreme outliers)
    }
  ): { valid: T[]; filtered: number; stats: { zeros: number; negatives: number; outliers: number } } {
    const opts = {
      removeZeros: options?.removeZeros ?? true,
      removeNegatives: options?.removeNegatives ?? false,
      removeOutliers: options?.removeOutliers ?? true,
      outlierThreshold: options?.outlierThreshold ?? 3.0,
    };

    let zeros = 0;
    let negatives = 0;
    let outliers = 0;

    // First pass: remove zeros and negatives
    let filtered = data.filter((point) => {
      return valueFields.every((field) => {
        const value = point[field];

        // Remove nulls/undefined
        if (value == null) return false;

        // Remove zeros if requested
        if (opts.removeZeros && value === 0) {
          zeros++;
          return false;
        }

        // Remove negatives if requested
        if (opts.removeNegatives && value < 0) {
          negatives++;
          return false;
        }

        return true;
      });
    });

    // Second pass: remove outliers if requested
    if (opts.removeOutliers && filtered.length >= 4) {
      const initialCount = filtered.length;

      // For each value field, identify outliers
      valueFields.forEach((field) => {
        const values = filtered.map((p) => p[field] as number);
        const outlierIndices = this.identifyOutlierIndices(values, opts.outlierThreshold);

        // Mark points as outliers
        filtered = filtered.filter((_, index) => !outlierIndices.has(index));
      });

      outliers = initialCount - filtered.length;
    }

    const totalFiltered = data.length - filtered.length;

    if (totalFiltered > 0) {
      logCustomEvent(
        'chart_data_cleaned',
        this.correlationId,
        {
          original_count: data.length,
          valid_count: filtered.length,
          filtered_count: totalFiltered,
          zeros_removed: zeros,
          negatives_removed: negatives,
          outliers_removed: outliers,
        },
        'info'
      );
    }

    return {
      valid: filtered,
      filtered: totalFiltered,
      stats: { zeros, negatives, outliers },
    };
  }

  /**
   * Identify outlier indices using IQR method with configurable threshold
   */
  private identifyOutlierIndices(values: number[], iqrMultiplier: number = 3.0): Set<number> {
    if (values.length < 4) return new Set();

    const sorted = [...values].sort((a, b) => a - b);
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);

    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;

    const lowerBound = q1 - iqrMultiplier * iqr;
    const upperBound = q3 + iqrMultiplier * iqr;

    const outlierIndices = new Set<number>();
    values.forEach((val, index) => {
      if (val < lowerBound || val > upperBound) {
        outlierIndices.add(index);
      }
    });

    return outlierIndices;
  }
}
