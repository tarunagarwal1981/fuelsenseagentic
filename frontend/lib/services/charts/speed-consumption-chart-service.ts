/**
 * Speed-Consumption Chart Service
 *
 * Builds speed vs consumption chart data with ballast/laden separation,
 * polynomial fits, and baseline comparison.
 */

import { logCustomEvent, logError } from '@/lib/monitoring/axiom-logger';
import type { HullPerformanceAnalysis } from '@/lib/services/hull-performance-service';
import { calculatePolynomialRegression } from '@/lib/utils/polynomial-regression';
import { BaseChartService } from './base-chart-service';

/** Single speed-consumption point with required loading condition */
export interface SpeedConsumptionPoint {
  speed: number;
  consumption: number;
  condition: 'ballast' | 'laden';
  /** Report date (YYYY-MM-DD) from trend_data, for tooltip display */
  date?: string;
}

/** Polynomial regression result for curve fit (e.g. from polynomial-regression utils) */
export interface PolynomialFit {
  coefficients: [number, number, number];
  r_squared: number;
  equation_text: string;
}

/** Chart data with ballast/laden separation, actual + baseline, fits and statistics */
export interface SpeedConsumptionChartData {
  ballast: {
    actual: {
      dataPoints: SpeedConsumptionPoint[];
      polynomialFit?: PolynomialFit;
    };
    baseline: {
      dataPoints: Array<{ speed: number; consumption: number }>;
      polynomialFit?: PolynomialFit;
    };
  };
  laden: {
    actual: {
      dataPoints: SpeedConsumptionPoint[];
      polynomialFit?: PolynomialFit;
    };
    baseline: {
      dataPoints: Array<{ speed: number; consumption: number }>;
      polynomialFit?: PolynomialFit;
    };
  };
  statistics: {
    ballast: {
      avgSpeed: number;
      avgConsumption: number;
      speedRange: { min: number; max: number };
      consumptionRange: { min: number; max: number };
      correlation: number;
      dataPoints: number;
    };
    laden: {
      avgSpeed: number;
      avgConsumption: number;
      speedRange: { min: number; max: number };
      consumptionRange: { min: number; max: number };
      correlation: number;
      dataPoints: number;
    };
  };
}

export class SpeedConsumptionChartService extends BaseChartService {
  /**
   * Build chart-ready speed-consumption data with ballast/laden separation.
   * Separates trend_data by loading_condition, extracts baseline curves, computes
   * polynomial fits (when >= 3 points) and statistics. Logs start/complete to Axiom.
   */
  extractChartData(
    analysis: HullPerformanceAnalysis
  ): SpeedConsumptionChartData | null {
    try {
      logCustomEvent(
        'speed_consumption_chart_extract_start',
        this.correlationId,
        {},
        'info'
      );

      const trendData = analysis?.trend_data ?? [];
      const baselineCurves = analysis?.baseline_curves;

      // 1. Separate trend_data into ballast and laden by loading_condition
      const ballastActual = this.extractPointsByCondition(trendData, 'ballast');
      const ladenActual = this.extractPointsByCondition(trendData, 'laden');

      // 2. Extract baseline curves (speed, consumption)
      const ballastBaseline =
        baselineCurves?.ballast?.map((p) => ({
          speed: p.speed,
          consumption: p.consumption,
        })) ?? [];
      const ladenBaseline =
        baselineCurves?.laden?.map((p) => ({
          speed: p.speed,
          consumption: p.consumption,
        })) ?? [];

      // 3. Polynomial fits (x = speed, y = consumption); require >= 3 points
      const toRegressionPoints = (
        points: Array<{ speed: number; consumption: number }>
      ) => points.map((p) => ({ x: p.speed, y: p.consumption }));

      const ballastActualFit =
        ballastActual.length >= 3
          ? calculatePolynomialRegression(toRegressionPoints(ballastActual))
          : null;
      const ladenActualFit =
        ladenActual.length >= 3
          ? calculatePolynomialRegression(toRegressionPoints(ladenActual))
          : null;
      const ballastBaselineFit =
        ballastBaseline.length >= 3
          ? calculatePolynomialRegression(toRegressionPoints(ballastBaseline))
          : null;
      const ladenBaselineFit =
        ladenBaseline.length >= 3
          ? calculatePolynomialRegression(toRegressionPoints(ladenBaseline))
          : null;

      const has_ballast_fit = ballastActualFit != null;
      const has_laden_fit = ladenActualFit != null;

      // 4. Statistics via this.calculateStatistics()
      const ballastStats = this.calculateStatistics(ballastActual);
      const ladenStats = this.calculateStatistics(ladenActual);

      // 5. Build result
      const result: SpeedConsumptionChartData = {
        ballast: {
          actual: {
            dataPoints: ballastActual,
            polynomialFit: ballastActualFit
              ? {
                  coefficients: ballastActualFit.coefficients,
                  r_squared: ballastActualFit.r_squared,
                  equation_text: ballastActualFit.equation_text,
                }
              : undefined,
          },
          baseline: {
            dataPoints: ballastBaseline,
            polynomialFit: ballastBaselineFit
              ? {
                  coefficients: ballastBaselineFit.coefficients,
                  r_squared: ballastBaselineFit.r_squared,
                  equation_text: ballastBaselineFit.equation_text,
                }
              : undefined,
          },
        },
        laden: {
          actual: {
            dataPoints: ladenActual,
            polynomialFit: ladenActualFit
              ? {
                  coefficients: ladenActualFit.coefficients,
                  r_squared: ladenActualFit.r_squared,
                  equation_text: ladenActualFit.equation_text,
                }
              : undefined,
          },
          baseline: {
            dataPoints: ladenBaseline,
            polynomialFit: ladenBaselineFit
              ? {
                  coefficients: ladenBaselineFit.coefficients,
                  r_squared: ladenBaselineFit.r_squared,
                  equation_text: ladenBaselineFit.equation_text,
                }
              : undefined,
          },
        },
        statistics: {
          ballast: ballastStats,
          laden: ladenStats,
        },
      };

      logCustomEvent(
        'speed_consumption_chart_extract_complete',
        this.correlationId,
        {
          ballast_actual_points: ballastActual.length,
          laden_actual_points: ladenActual.length,
          ballast_baseline_points: ballastBaseline.length,
          laden_baseline_points: ladenBaseline.length,
          has_ballast_fit,
          has_laden_fit,
        },
        'info'
      );

      return result;
    } catch (err) {
      logError(this.correlationId, err, {
        context: 'SpeedConsumptionChartService.extractChartData',
      });
      return null;
    }
  }

  /**
   * Extract speed-consumption points for one loading condition from trend_data.
   */
  protected extractPointsByCondition(
    trendData: HullPerformanceAnalysis['trend_data'],
    condition: 'ballast' | 'laden'
  ): SpeedConsumptionPoint[] {
    if (!Array.isArray(trendData)) return [];
    return trendData
      .filter((d) => this.normalizeLoadingCondition(d.loading_condition) === condition)
      .map((d) => ({
        speed: d.speed,
        consumption: d.consumption,
        condition,
        date: d.date,
      }))
      .filter((p) => Number.isFinite(p.speed) && Number.isFinite(p.consumption));
  }

  /**
   * Compute statistics for a set of speed-consumption points.
   */
  protected computeConditionStatistics(
    points: SpeedConsumptionPoint[]
  ): SpeedConsumptionChartData['statistics']['ballast'] {
    return this.calculateStatistics(points);
  }

  /**
   * Normalize raw loading condition string to 'ballast' or 'laden'.
   * Converts to lowercase and trims; returns 'ballast' if string includes 'ballast', otherwise 'laden'.
   *
   * @param condition - Raw loading condition (e.g. from hull_performance.loading_condition)
   * @returns 'ballast' | 'laden'
   */
  private normalizeLoadingCondition(condition: string | undefined): 'ballast' | 'laden' {
    const s = (condition ?? '').toLowerCase().trim();
    return s.includes('ballast') ? 'ballast' : 'laden';
  }

  /**
   * Calculate statistics for speed-consumption points: averages, ranges, Pearson correlation, and count.
   * Uses Pearson r = Σ((x - x̄)(y - ȳ)) / sqrt(Σ(x - x̄)² × Σ(y - ȳ)²). Returns zeros for empty array.
   *
   * @param points - Speed-consumption points (x = speed, y = consumption)
   * @returns Object matching statistics.ballast / statistics.laden interface
   */
  private calculateStatistics(
    points: SpeedConsumptionPoint[]
  ): SpeedConsumptionChartData['statistics']['ballast'] {
    if (points.length === 0) {
      return {
        avgSpeed: 0,
        avgConsumption: 0,
        speedRange: { min: 0, max: 0 },
        consumptionRange: { min: 0, max: 0 },
        correlation: 0,
        dataPoints: 0,
      };
    }
    const n = points.length;
    const avgSpeed = points.reduce((s, p) => s + p.speed, 0) / n;
    const avgConsumption = points.reduce((s, p) => s + p.consumption, 0) / n;
    const speedMin = Math.min(...points.map((p) => p.speed));
    const speedMax = Math.max(...points.map((p) => p.speed));
    const consumptionMin = Math.min(...points.map((p) => p.consumption));
    const consumptionMax = Math.max(...points.map((p) => p.consumption));

    let correlation = 0;
    if (n >= 2) {
      const sumCov = points.reduce(
        (s, p) => s + (p.speed - avgSpeed) * (p.consumption - avgConsumption),
        0
      );
      const sumSqSpeed = points.reduce((s, p) => s + (p.speed - avgSpeed) ** 2, 0);
      const sumSqConsumption = points.reduce(
        (s, p) => s + (p.consumption - avgConsumption) ** 2,
        0
      );
      const denom = Math.sqrt(sumSqSpeed * sumSqConsumption);
      correlation = denom > 0 ? sumCov / denom : 0;
    }

    return {
      avgSpeed,
      avgConsumption,
      speedRange: { min: speedMin, max: speedMax },
      consumptionRange: { min: consumptionMin, max: consumptionMax },
      correlation,
      dataPoints: n,
    };
  }
}
