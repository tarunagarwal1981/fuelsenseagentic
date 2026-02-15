/**
 * Speed-Consumption Chart Service
 *
 * Builds speed vs consumption chart data with ballast/laden separation,
 * polynomial fits, and baseline comparison. Filters points by min speed/consumption
 * from config/charts.yaml (defaults: min_speed 5, min_consumption 5).
 * For baseline: container / LPG tanker / LNG tanker plot full baseline; other vessel
 * types plot baseline only in speed range 8–15 kts (from vessel_details vessel_type).
 */

import { logCustomEvent, logError } from '@/lib/monitoring/axiom-logger';
import type { HullPerformanceAnalysis } from '@/lib/services/hull-performance-service';
import { calculateExponentialRegression } from '@/lib/utils/exponential-regression';
import { loadYAML } from '@/lib/config/yaml-loader';
import { VesselDetailsClient } from '@/lib/clients/vessel-details-client';
import { BaseChartService } from './base-chart-service';

const BASELINE_SPEED_MIN_OTHER = 8;
const BASELINE_SPEED_MAX_OTHER = 15;

/** Hard stops for all vessel types */
const AXIS_SPEED_MAX = 25;
const AXIS_CONSUMPTION_MAX_CONTAINER_LPG_LNG = 200;
const AXIS_CONSUMPTION_MAX_OTHER = 50;

/** Vessel types that plot full baseline; others use speed 8–15 only (case insensitive). */
function isContainerOrLpgOrLngTanker(vesselType: string): boolean {
  const t = String(vesselType ?? '').trim().toLowerCase();
  return (
    t.includes('container') ||
    t.includes('lpg tanker') ||
    t.includes('lng tanker')
  );
}

/** Chart config from config/charts.yaml */
interface ChartsConfig {
  speed_consumption?: {
    min_speed?: number;
    min_consumption?: number;
  };
}

const DEFAULT_MIN_SPEED = 5;
const DEFAULT_MIN_CONSUMPTION = 5;

function getChartThresholds(): { minSpeed: number; minConsumption: number } {
  try {
    const config = loadYAML<ChartsConfig>('charts.yaml', { throwOnError: false });
    const sc = config?.speed_consumption;
    return {
      minSpeed: typeof sc?.min_speed === 'number' && Number.isFinite(sc.min_speed) ? sc.min_speed : DEFAULT_MIN_SPEED,
      minConsumption: typeof sc?.min_consumption === 'number' && Number.isFinite(sc.min_consumption) ? sc.min_consumption : DEFAULT_MIN_CONSUMPTION,
    };
  } catch {
    return { minSpeed: DEFAULT_MIN_SPEED, minConsumption: DEFAULT_MIN_CONSUMPTION };
  }
}

/** Single speed-consumption point with required loading condition */
export interface SpeedConsumptionPoint {
  speed: number;
  consumption: number;
  condition: 'ballast' | 'laden';
  /** Report date (YYYY-MM-DD) from trend_data, for tooltip display */
  date?: string;
}

/** Exponential fit: y = a * exp(b*x) */
export interface ExponentialFit {
  a: number;
  b: number;
  r_squared: number;
  equation_text: string;
}

/** Chart data with ballast/laden separation, actual + baseline, fits and statistics */
export interface SpeedConsumptionChartData {
  ballast: {
    actual: {
      dataPoints: SpeedConsumptionPoint[];
      exponentialFit?: ExponentialFit;
    };
    baseline: {
      dataPoints: Array<{ speed: number; consumption: number }>;
      exponentialFit?: ExponentialFit;
    };
  };
  laden: {
    actual: {
      dataPoints: SpeedConsumptionPoint[];
      exponentialFit?: ExponentialFit;
    };
    baseline: {
      dataPoints: Array<{ speed: number; consumption: number }>;
      exponentialFit?: ExponentialFit;
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
  /** Hard stops for axes: speed max 25 kts, consumption max 200 (container/LPG/LNG) or 50 (others) */
  axisLimits?: { maxSpeed: number; maxConsumption: number };
}

export class SpeedConsumptionChartService extends BaseChartService {
  /**
   * Build chart-ready speed-consumption data with ballast/laden separation.
   * Fetches vessel_type from vessel_details; container/LPG tanker/LNG tanker plot full
   * baseline, others plot baseline only in speed range 8–15 kts. Logs start/complete to Axiom.
   */
  async extractChartData(
    analysis: HullPerformanceAnalysis
  ): Promise<SpeedConsumptionChartData | null> {
    try {
      logCustomEvent(
        'speed_consumption_chart_extract_start',
        this.correlationId,
        {},
        'info'
      );

      const trendData = analysis?.trend_data ?? [];
      const baselineCurves = analysis?.baseline_curves;
      const { minSpeed, minConsumption } = getChartThresholds();

      // Vessel type from vessel_details: container / LPG tanker / LNG tanker → full baseline; else 8–15 kts only
      let plotBaselineFullRange = false; // default restricted (8–15) so we don't show full baseline when type unknown/fetch fails
      const imo = analysis?.vessel?.imo?.trim();
      if (imo) {
        try {
          const vesselDetailsClient = new VesselDetailsClient();
          const vessel = await vesselDetailsClient.getByIMO(imo);
          const vesselType = vessel?.type ?? '';
          plotBaselineFullRange = isContainerOrLpgOrLngTanker(vesselType);
          logCustomEvent(
            'speed_consumption_vessel_type',
            this.correlationId,
            { vessel_imo: imo, vessel_type: vesselType, plot_baseline_full_range: plotBaselineFullRange },
            'info'
          );
        } catch (err) {
          logCustomEvent(
            'speed_consumption_vessel_type_fetch_error',
            this.correlationId,
            { vessel_imo: imo, error: err instanceof Error ? err.message : String(err) },
            'warn'
          );
          // Keep plotBaselineFullRange false so baseline is restricted to 8–15 on error
        }
      }

      // 1. Separate trend_data into ballast and laden by loading_condition
      const ballastActual = this.extractPointsByCondition(trendData, 'ballast').filter(
        (p) => p.speed > minSpeed && p.consumption > minConsumption
      );
      const ladenActual = this.extractPointsByCondition(trendData, 'laden').filter(
        (p) => p.speed > minSpeed && p.consumption > minConsumption
      );

      // 2. Extract baseline curves (speed, consumption), filter by thresholds, then by speed range for non-container/LPG/LNG
      const baselineSpeedFilter = (p: { speed: number; consumption: number }) => {
        if (p.speed <= minSpeed || p.consumption <= minConsumption) return false;
        if (plotBaselineFullRange) return true;
        return p.speed >= BASELINE_SPEED_MIN_OTHER && p.speed <= BASELINE_SPEED_MAX_OTHER;
      };
      const ballastBaseline = (baselineCurves?.ballast?.map((p) => ({
        speed: p.speed,
        consumption: p.consumption,
      })) ?? []).filter(baselineSpeedFilter);
      const ladenBaseline = (baselineCurves?.laden?.map((p) => ({
        speed: p.speed,
        consumption: p.consumption,
      })) ?? []).filter(baselineSpeedFilter);

      // 2b. Hard stops: speed max 25 kts, consumption max 200 (container/LPG/LNG) or 50 (others)
      const maxConsumption = plotBaselineFullRange
        ? AXIS_CONSUMPTION_MAX_CONTAINER_LPG_LNG
        : AXIS_CONSUMPTION_MAX_OTHER;
      const clipToAxisLimits = <T extends { speed: number; consumption: number }>(points: T[]): T[] =>
        points.filter(
          (p) =>
            Number.isFinite(p.speed) &&
            Number.isFinite(p.consumption) &&
            p.speed >= 0 &&
            p.speed <= AXIS_SPEED_MAX &&
            p.consumption >= 0 &&
            p.consumption <= maxConsumption
        );
      const ballastActualClipped = clipToAxisLimits(ballastActual);
      const ladenActualClipped = clipToAxisLimits(ladenActual);
      const ballastBaselineClipped = clipToAxisLimits(ballastBaseline);
      const ladenBaselineClipped = clipToAxisLimits(ladenBaseline);

      // 2c. Add three baseline points (speed 8, 10, 15) to actual for comparison on chart
      const BASELINE_SPEEDS = [8, 10, 15] as const;
      const interpolateConsumptionAtSpeed = (
        points: Array<{ speed: number; consumption: number }>,
        speed: number
      ): number | null => {
        const sorted = [...points].sort((a, b) => a.speed - b.speed);
        if (sorted.length === 0) return null;
        if (speed <= sorted[0].speed) return sorted[0].consumption;
        if (speed >= sorted[sorted.length - 1].speed) return sorted[sorted.length - 1].consumption;
        for (let i = 0; i < sorted.length - 1; i++) {
          const a = sorted[i];
          const b = sorted[i + 1];
          if (speed >= a.speed && speed <= b.speed) {
            const t = (speed - a.speed) / (b.speed - a.speed);
            return a.consumption + t * (b.consumption - a.consumption);
          }
        }
        return null;
      };
      const addBaselinePointsToActual = (
        actual: SpeedConsumptionPoint[],
        baselineForInterpolation: Array<{ speed: number; consumption: number }>,
        condition: 'ballast' | 'laden'
      ): SpeedConsumptionPoint[] => {
        const added: SpeedConsumptionPoint[] = [];
        for (const s of BASELINE_SPEEDS) {
          const c = interpolateConsumptionAtSpeed(baselineForInterpolation, s);
          if (c != null && Number.isFinite(c) && c >= 0 && c <= maxConsumption && s <= AXIS_SPEED_MAX) {
            added.push({ speed: s, consumption: c, condition });
          }
        }
        return [...actual, ...added];
      };
      // Use unclipped baseline for interpolation so 8/10/15 kts points are added whenever baseline has data (even if clipped would be empty)
      const ballastActualWithBaseline = addBaselinePointsToActual(
        ballastActualClipped,
        ballastBaseline,
        'ballast'
      );
      const ladenActualWithBaseline = addBaselinePointsToActual(
        ladenActualClipped,
        ladenBaseline,
        'laden'
      );

      // 3. Exponential fits y = a*exp(b*x) (x = speed, y = consumption); require >= 2 points with y > 0
      const toRegressionPoints = (
        points: Array<{ speed: number; consumption: number }>
      ) => points.map((p) => ({ x: p.speed, y: p.consumption }));

      const ballastActualFit =
        ballastActualWithBaseline.length >= 2
          ? calculateExponentialRegression(toRegressionPoints(ballastActualWithBaseline))
          : null;
      const ladenActualFit =
        ladenActualWithBaseline.length >= 2
          ? calculateExponentialRegression(toRegressionPoints(ladenActualWithBaseline))
          : null;
      const ballastBaselineFit =
        ballastBaselineClipped.length >= 2
          ? calculateExponentialRegression(toRegressionPoints(ballastBaselineClipped))
          : null;
      const ladenBaselineFit =
        ladenBaselineClipped.length >= 2
          ? calculateExponentialRegression(toRegressionPoints(ladenBaselineClipped))
          : null;

      const has_ballast_fit = ballastActualFit != null;
      const has_laden_fit = ladenActualFit != null;

      // 4. Statistics via this.calculateStatistics() (on actual + baseline points)
      const ballastStats = this.calculateStatistics(ballastActualWithBaseline);
      const ladenStats = this.calculateStatistics(ladenActualWithBaseline);

      // 5. Build result (actual + 3 baseline points, axis limits for UI)
      const result: SpeedConsumptionChartData = {
        ballast: {
          actual: {
            dataPoints: ballastActualWithBaseline,
            exponentialFit: ballastActualFit
              ? {
                  a: ballastActualFit.a,
                  b: ballastActualFit.b,
                  r_squared: ballastActualFit.r_squared,
                  equation_text: ballastActualFit.equation_text,
                }
              : undefined,
          },
          baseline: {
            dataPoints: ballastBaselineClipped,
            exponentialFit: ballastBaselineFit
              ? {
                  a: ballastBaselineFit.a,
                  b: ballastBaselineFit.b,
                  r_squared: ballastBaselineFit.r_squared,
                  equation_text: ballastBaselineFit.equation_text,
                }
              : undefined,
          },
        },
        laden: {
          actual: {
            dataPoints: ladenActualWithBaseline,
            exponentialFit: ladenActualFit
              ? {
                  a: ladenActualFit.a,
                  b: ladenActualFit.b,
                  r_squared: ladenActualFit.r_squared,
                  equation_text: ladenActualFit.equation_text,
                }
              : undefined,
          },
          baseline: {
            dataPoints: ladenBaselineClipped,
            exponentialFit: ladenBaselineFit
              ? {
                  a: ladenBaselineFit.a,
                  b: ladenBaselineFit.b,
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
        axisLimits: { maxSpeed: AXIS_SPEED_MAX, maxConsumption },
      };

      logCustomEvent(
        'speed_consumption_chart_extract_complete',
        this.correlationId,
        {
          ballast_actual_points: ballastActualWithBaseline.length,
          laden_actual_points: ladenActualWithBaseline.length,
          ballast_baseline_points: ballastBaselineClipped.length,
          laden_baseline_points: ladenBaselineClipped.length,
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
