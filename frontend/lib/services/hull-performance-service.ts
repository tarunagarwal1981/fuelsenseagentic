/**
 * Hull Performance Service
 *
 * Service layer with business logic for hull performance analysis.
 * Aggregates repository data, applies condition thresholds, and shapes response for agents/UI.
 */

import { HullPerformanceRepository } from '@/lib/repositories/hull-performance-repository';
import type { HullPerformanceRecord } from '@/lib/api-clients/hull-performance-client';
import type { VesselPerformanceModelRecord } from '@/lib/api-clients/hull-performance-client';
import { logCustomEvent, logError } from '@/lib/monitoring/axiom-logger';
import { ExcessPowerChartService } from './charts/excess-power-chart-service';
import { SpeedLossChartService } from './charts/speed-loss-chart-service';
import { SpeedConsumptionChartService } from './charts/speed-consumption-chart-service';
import type { ExcessPowerChartData } from './charts/excess-power-chart-service';
import type { SpeedLossChartData } from './charts/speed-loss-chart-service';
import type { SpeedConsumptionChartData } from './charts/speed-consumption-chart-service';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type HullCondition = 'GOOD' | 'AVERAGE' | 'POOR';

export interface HullPerformanceAnalysis {
  vessel: {
    imo: string;
    name: string;
  };

  hull_condition: HullCondition;
  condition_indicator: '🟢' | '🟡' | '🔴';
  condition_message: string;

  latest_metrics: {
    report_date: string;
    excess_power_pct: number;
    speed_loss_pct: number;
    excess_fuel_consumption_pct: number;
    excess_fuel_consumption_mtd: number;
    actual_consumption: number;
    predicted_consumption: number;
    actual_speed: number;
  };

  component_breakdown: {
    hull_power_loss: number;
    engine_power_loss: number;
    propeller_power_loss: number;
  };

  cii_impact: {
    hull_impact: number;
    engine_impact: number;
    propeller_impact: number;
    total_impact: number;
  };

  trend_data: Array<{
    date: string;
    excess_power_pct: number;
    speed_loss_pct: number;
    excess_fuel_mtd: number;
    consumption: number;
    predicted_consumption: number;
    speed: number;
    loading_condition: string;
  }>;

  baseline_curves?: {
    laden: Array<{ speed: number; consumption: number; power: number }>;
    ballast: Array<{ speed: number; consumption: number; power: number }>;
  };

  analysis_period: {
    days: number;
    start_date: string;
    end_date: string;
    total_records: number;
  };

  metadata: {
    fetched_at: string;
    data_source: string;
    cache_hit: boolean;
  };
}

/**
 * Consolidated chart data from all chart services
 */
export interface HullPerformanceChartData {
  excessPower: ExcessPowerChartData | null;
  speedLoss: SpeedLossChartData | null;
  speedConsumption: SpeedConsumptionChartData | null;
}

// ---------------------------------------------------------------------------
// Business logic thresholds
// ---------------------------------------------------------------------------

const HULL_CONDITION_THRESHOLDS = {
  GOOD: {
    max: 15,
    indicator: '🟢' as const,
    message: 'Hull in good condition - no immediate action required',
  },
  AVERAGE: {
    min: 15,
    max: 25,
    indicator: '🟡' as const,
    message: 'Hull showing signs of fouling - monitor closely',
  },
  POOR: {
    min: 25,
    indicator: '🔴' as const,
    message: 'Hull heavily fouled - schedule cleaning immediately',
  },
};

/** Default analysis period (days) when user does not specify a time range: from vessel's last report date. */
const DEFAULT_ANALYSIS_DAYS = 180;
/** Wide fetch window (days) used to discover vessel's last report date when applying default period. */
const WIDE_FETCH_DAYS = 730;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class HullPerformanceService {
  private repository: HullPerformanceRepository;
  private correlationId: string;

  constructor(
    correlationId: string,
    repository: HullPerformanceRepository
  ) {
    this.correlationId = correlationId;
    this.repository = repository;
  }

  /**
   * Get comprehensive hull performance analysis for a vessel.
   * Main method called by the agent.
   */
  async analyzeVesselPerformance(
    vesselIdentifier: { imo?: string; name?: string },
    options?: {
      days?: number;
      startDate?: string;
      endDate?: string;
      includeBaseline?: boolean;
    }
  ): Promise<HullPerformanceAnalysis | null> {
    const startMs = Date.now();

    logCustomEvent(
      'hull_performance_analysis_start',
      this.correlationId,
      {
        vessel_imo: vesselIdentifier.imo ?? undefined,
        vessel_name: vesselIdentifier.name ?? undefined,
        days: options?.days,
        include_baseline: options?.includeBaseline ?? false,
      },
      'info'
    );

    try {
      const userSpecifiedPeriod =
        options?.days != null || !!(options?.startDate && options?.endDate);
      const dateRange = userSpecifiedPeriod
        ? options?.days != null
          ? { days: options.days }
          : options?.startDate && options?.endDate
            ? { startDate: options.startDate, endDate: options.endDate }
            : undefined
        : undefined;

      const result = await this.repository.getVesselPerformanceData(
        vesselIdentifier,
        dateRange ?? { days: WIDE_FETCH_DAYS }
      );

      if (!result.success) {
        logError(
          this.correlationId,
          new Error(result.error ?? 'Unknown repository error'),
          {
            service: 'HullPerformanceService',
            method: 'analyzeVesselPerformance',
            vessel_imo: vesselIdentifier.imo,
            vessel_name: vesselIdentifier.name,
          }
        );
        return null;
      }

      const records = result.data;
      let { metadata } = result;

      // Filter to only records that match the requested vessel (avoid showing another vessel's data)
      let recordsForVessel = this.filterRecordsByVessel(records, vesselIdentifier);

      // When user did not specify a period: use last N days (default 180) from this vessel's last report date
      if (!userSpecifiedPeriod && recordsForVessel.length > 0) {
        const lastReportDate = recordsForVessel.reduce(
          (latest, r) =>
            (new Date(r.report_date).getTime() > new Date(latest).getTime()
              ? r.report_date
              : latest),
          recordsForVessel[0].report_date
        );
        const requestedDays = options?.days ?? DEFAULT_ANALYSIS_DAYS;
        const endDate = new Date(lastReportDate);
        const cutoff = new Date(endDate);
        cutoff.setDate(cutoff.getDate() - requestedDays);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        recordsForVessel = recordsForVessel.filter(
          (r) => r.report_date >= cutoffStr
        );
        metadata = {
          ...metadata,
          date_range: {
            start: cutoffStr,
            end: lastReportDate.slice(0, 10),
          },
        };
      }

      // Filter to noon-at-sea only (case insensitive) when event is present
      const noonAtSeaNorm = 'noon at sea';
      const hasEvent = recordsForVessel.some((r) => (r.event ?? '').trim() !== '');
      if (hasEvent) {
        const before = recordsForVessel.length;
        recordsForVessel = recordsForVessel.filter((r) =>
          (r.event ?? '').trim().toLowerCase() === noonAtSeaNorm
        );
        if (before > 0 && recordsForVessel.length < before) {
          logCustomEvent(
            'hull_performance_noon_at_sea_filter',
            this.correlationId,
            {
              vessel_imo: vesselIdentifier.imo ?? undefined,
              vessel_name: vesselIdentifier.name ?? undefined,
              before,
              after: recordsForVessel.length,
            },
            'info'
          );
        }
      }

      const totalRecords = recordsForVessel.length;

      if (recordsForVessel.length === 0) {
        const durationMs = Date.now() - startMs;
        logCustomEvent(
          'hull_performance_analysis_complete',
          this.correlationId,
          {
            vessel_imo: vesselIdentifier.imo ?? undefined,
            vessel_name: vesselIdentifier.name ?? undefined,
            duration_ms: durationMs,
            total_records: 0,
            cache_hit: metadata.cache_hit,
            filtered_out: records.length - recordsForVessel.length,
          },
          'info'
        );
        return null;
      }

      if (recordsForVessel.length < records.length) {
        logCustomEvent(
          'hull_performance_vessel_filter',
          this.correlationId,
          {
            vessel_imo: vesselIdentifier.imo ?? undefined,
            vessel_name: vesselIdentifier.name ?? undefined,
            requested: records.length,
            after_filter: recordsForVessel.length,
          },
          'info'
        );
      }

      const sorted = [...recordsForVessel].sort(
        (a, b) => new Date(b.report_date).getTime() - new Date(a.report_date).getTime()
      );
      // Use latest record that has at least one non-zero/non-null key metric (avoid all-zero stubs)
      const latestRecord = this.findLatestMeaningfulRecord(sorted) ?? sorted[0];
      if (!this.hasMeaningfulMetrics(latestRecord)) {
        const durationMs = Date.now() - startMs;
        logCustomEvent(
          'hull_performance_analysis_complete',
          this.correlationId,
          {
            vessel_imo: vesselIdentifier.imo ?? undefined,
            vessel_name: vesselIdentifier.name ?? undefined,
            duration_ms: durationMs,
            total_records: totalRecords,
            cache_hit: metadata.cache_hit,
            reason: 'no_meaningful_metrics',
          },
          'info'
        );
        return null;
      }
      // Prefer requested identifier for display so output matches what the user asked for
      const imoStr = String(vesselIdentifier.imo ?? latestRecord.vessel_imo ?? '');
      const nameStr = vesselIdentifier.name || latestRecord.vessel_name || '';

      const { condition, indicator, message } = this.determineHullCondition(
        latestRecord.hull_roughness_power_loss
      );

      logCustomEvent(
        'hull_condition_determined',
        this.correlationId,
        {
          vessel_imo: imoStr,
          vessel_name: nameStr,
          hull_condition: condition,
          excess_power_pct: latestRecord.hull_roughness_power_loss,
        },
        'info'
      );

      const trendData = this.transformToTrendData(recordsForVessel);
      logCustomEvent(
        'trend_data_transformed',
        this.correlationId,
        {
          vessel_imo: imoStr,
          vessel_name: nameStr,
          trend_points: trendData.length,
        },
        'info'
      );

      let baseline_curves: HullPerformanceAnalysis['baseline_curves'] | undefined;
      if (options?.includeBaseline && imoStr) {
        const imoNum = parseInt(imoStr.replace(/\D/g, ''), 10);
        if (Number.isFinite(imoNum)) {
          baseline_curves = await this.getBaselineCurves(imoNum);
        }
      }

      const analysis: HullPerformanceAnalysis = {
        vessel: { imo: imoStr, name: nameStr },
        hull_condition: condition,
        condition_indicator: indicator,
        condition_message: message,
        latest_metrics: this.buildLatestMetricsFromNonZero(sorted),
        component_breakdown: {
          hull_power_loss: latestRecord.hull_roughness_power_loss,
          engine_power_loss: latestRecord.engine_power_loss,
          propeller_power_loss: latestRecord.propeller_fouling_power_loss,
        },
        cii_impact: {
          hull_impact: latestRecord.hull_cii_impact,
          engine_impact: latestRecord.engine_cii_impact,
          propeller_impact: latestRecord.propeller_cii_impact,
          total_impact:
            latestRecord.hull_cii_impact +
            latestRecord.engine_cii_impact +
            latestRecord.propeller_cii_impact,
        },
        trend_data: trendData,
        baseline_curves,
        analysis_period: {
          days:
            options?.days ??
            Math.ceil(
              (new Date(metadata.date_range.end).getTime() -
                new Date(metadata.date_range.start).getTime()) /
                (24 * 60 * 60 * 1000)
            ),
          start_date: metadata.date_range.start,
          end_date: metadata.date_range.end,
          total_records: totalRecords,
        },
        metadata: {
          fetched_at: new Date().toISOString(),
          data_source: metadata.source,
          cache_hit: metadata.cache_hit,
        },
      };

      const durationMs = Date.now() - startMs;
      logCustomEvent(
        'hull_performance_analysis_complete',
        this.correlationId,
        {
          vessel_imo: imoStr,
          vessel_name: nameStr,
          duration_ms: durationMs,
          total_records: totalRecords,
          cache_hit: metadata.cache_hit,
          hull_condition: condition,
        },
        'info'
      );

      return analysis;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError(this.correlationId, err instanceof Error ? err : new Error(message), {
        service: 'HullPerformanceService',
        method: 'analyzeVesselPerformance',
        vessel_imo: vesselIdentifier.imo,
        vessel_name: vesselIdentifier.name,
      });
      return null;
    }
  }

  /**
   * Extract all chart data using modular chart services
   */
  async extractChartData(
    analysis: HullPerformanceAnalysis
  ): Promise<HullPerformanceChartData> {
    const startTime = Date.now();

    logCustomEvent(
      'hull_performance_chart_extraction_start',
      this.correlationId,
      {
        vessel_imo: analysis.vessel.imo,
        data_points: analysis.trend_data?.length ?? 0,
      },
      'info'
    );

    // Initialize chart services
    const excessPowerService = new ExcessPowerChartService(this.correlationId);
    const speedLossService = new SpeedLossChartService(this.correlationId);
    const speedConsumptionService = new SpeedConsumptionChartService(this.correlationId);

    // Extract chart data in parallel (all services are independent)
    const [excessPower, speedLoss, speedConsumption] = await Promise.all([
      excessPowerService.extractChartData(analysis).catch(err => {
        logError(this.correlationId, err, {
          service: 'excess_power_chart',
          vessel_imo: analysis.vessel.imo,
        });
        return null;
      }),
      speedLossService.extractChartData(analysis).catch(err => {
        logError(this.correlationId, err, {
          service: 'speed_loss_chart',
          vessel_imo: analysis.vessel.imo,
        });
        return null;
      }),
      speedConsumptionService.extractChartData(analysis).catch(err => {
        logError(this.correlationId, err, {
          service: 'speed_consumption_chart',
          vessel_imo: analysis.vessel.imo,
        });
        return null;
      }),
    ]);

    const executionTime = Date.now() - startTime;
    logCustomEvent(
      'hull_performance_chart_extraction_complete',
      this.correlationId,
      {
        vessel_imo: analysis.vessel.imo,
        has_excess_power: excessPower !== null,
        has_speed_loss: speedLoss !== null,
        has_speed_consumption: speedConsumption !== null,
        execution_time_ms: executionTime,
      },
      'info'
    );

    return {
      excessPower,
      speedLoss,
      speedConsumption,
    };
  }

  /**
   * Filter records to only those for the requested vessel (by IMO or normalized name).
   * Ensures we never show another vessel's metrics when the API returns mixed/wrong data.
   */
  private filterRecordsByVessel(
    records: HullPerformanceRecord[],
    vesselIdentifier: { imo?: string; name?: string }
  ): HullPerformanceRecord[] {
    const requestedImo =
      vesselIdentifier.imo != null && vesselIdentifier.imo !== ''
        ? parseInt(String(vesselIdentifier.imo).replace(/\D/g, ''), 10)
        : null;
    const requestedNameNorm =
      vesselIdentifier.name != null && vesselIdentifier.name.trim() !== ''
        ? this.normalizeVesselName(vesselIdentifier.name)
        : '';

    if (requestedImo == null && !requestedNameNorm) return records;

    return records.filter((r) => {
      if (requestedImo != null && Number(r.vessel_imo) === requestedImo) return true;
      if (requestedNameNorm && this.normalizeVesselName(r.vessel_name) === requestedNameNorm)
        return true;
      return false;
    });
  }

  /** Normalize vessel name for comparison: trim, uppercase, collapse spaces. */
  private normalizeVesselName(name: string): string {
    return String(name ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' ');
  }

  /**
   * True if the record has at least one meaningful (non-zero, non-null) key metric.
   */
  private hasMeaningfulMetrics(r: HullPerformanceRecord): boolean {
    return (
      (r.hull_roughness_power_loss != null && r.hull_roughness_power_loss > 0) ||
      (r.consumption != null && r.consumption > 0) ||
      (r.speed != null && r.speed > 0) ||
      (r.predicted_consumption != null && r.predicted_consumption > 0) ||
      (r.hull_roughness_speed_loss != null && r.hull_roughness_speed_loss > 0) ||
      (r.hull_excess_fuel_oil != null && r.hull_excess_fuel_oil > 0) ||
      (r.hull_excess_fuel_oil_mtd != null && r.hull_excess_fuel_oil_mtd > 0)
    );
  }

  /**
   * From records sorted newest-first, return the first record that has at least one
   * non-zero/non-null key metric. If none, returns undefined.
   */
  private findLatestMeaningfulRecord(
    sortedNewestFirst: HullPerformanceRecord[]
  ): HullPerformanceRecord | undefined {
    return sortedNewestFirst.find((r) => this.hasMeaningfulMetrics(r));
  }

  /**
   * Determine hull condition from excess power %.
   */
  private determineHullCondition(excessPowerPct: number): {
    condition: HullCondition;
    indicator: '🟢' | '🟡' | '🔴';
    message: string;
  } {
    if (excessPowerPct <= HULL_CONDITION_THRESHOLDS.GOOD.max) {
      return {
        condition: 'GOOD',
        indicator: HULL_CONDITION_THRESHOLDS.GOOD.indicator,
        message: HULL_CONDITION_THRESHOLDS.GOOD.message,
      };
    }
    if (
      excessPowerPct >= HULL_CONDITION_THRESHOLDS.AVERAGE.min &&
      excessPowerPct < HULL_CONDITION_THRESHOLDS.POOR.min
    ) {
      return {
        condition: 'AVERAGE',
        indicator: HULL_CONDITION_THRESHOLDS.AVERAGE.indicator,
        message: HULL_CONDITION_THRESHOLDS.AVERAGE.message,
      };
    }
    return {
      condition: 'POOR',
      indicator: HULL_CONDITION_THRESHOLDS.POOR.indicator,
      message: HULL_CONDITION_THRESHOLDS.POOR.message,
    };
  }

  /**
   * Transform API records to trend data for charts (sorted by date ascending).
   */
  private transformToTrendData(
    records: HullPerformanceRecord[]
  ): HullPerformanceAnalysis['trend_data'] {
    const sorted = [...records].sort(
      (a, b) => new Date(a.report_date).getTime() - new Date(b.report_date).getTime()
    );
    return sorted.map((r) => ({
      date: r.report_date.slice(0, 10),
      excess_power_pct: r.hull_roughness_power_loss,
      speed_loss_pct: r.hull_roughness_speed_loss,
      excess_fuel_mtd: r.hull_excess_fuel_oil_mtd,
      consumption: r.consumption,
      predicted_consumption: r.predicted_consumption,
      speed: r.speed,
      loading_condition: r.loading_condition ?? '',
    }));
  }

  /**
   * Extract latest metrics from the most recent record.
   */
  private extractLatestMetrics(
    latestRecord: HullPerformanceRecord
  ): HullPerformanceAnalysis['latest_metrics'] {
    return {
      report_date: latestRecord.report_date,
      excess_power_pct: latestRecord.hull_roughness_power_loss,
      speed_loss_pct: latestRecord.hull_roughness_speed_loss,
      excess_fuel_consumption_pct: latestRecord.hull_excess_fuel_oil,
      excess_fuel_consumption_mtd: latestRecord.hull_excess_fuel_oil_mtd,
      actual_consumption: latestRecord.consumption,
      predicted_consumption: latestRecord.predicted_consumption,
      actual_speed: latestRecord.speed,
    };
  }

  /**
   * Build latest_metrics by taking, for each field, the first non-zero/non-null value
   * when scanning records newest-first. Uses report_date from the record that supplies
   * the primary metric (excess_power_pct) so the "Latest metrics (date)" label is meaningful.
   */
  private buildLatestMetricsFromNonZero(
    sortedNewestFirst: HullPerformanceRecord[]
  ): HullPerformanceAnalysis['latest_metrics'] {
    const pick = (getter: (r: HullPerformanceRecord) => number): number => {
      const r = sortedNewestFirst.find((rec) => {
        const v = getter(rec);
        return v != null && !Number.isNaN(v) && v > 0;
      });
      return r ? getter(r) : 0;
    };
    const primaryRecord = sortedNewestFirst.find(
      (r) => r.hull_roughness_power_loss != null && r.hull_roughness_power_loss > 0
    ) ?? sortedNewestFirst.find((r) => r.consumption != null && r.consumption > 0)
    ?? sortedNewestFirst[0];
    const report_date = primaryRecord?.report_date ?? '';
    return {
      report_date,
      excess_power_pct: pick((r) => r.hull_roughness_power_loss),
      speed_loss_pct: pick((r) => r.hull_roughness_speed_loss),
      excess_fuel_consumption_pct: pick((r) => r.hull_excess_fuel_oil),
      excess_fuel_consumption_mtd: pick((r) => r.hull_excess_fuel_oil_mtd),
      actual_consumption: pick((r) => r.consumption),
      predicted_consumption: pick((r) => r.predicted_consumption),
      actual_speed: pick((r) => r.speed),
    };
  }

  /**
   * Get baseline curves and format for charts (laden + ballast).
   * API returns all vessels; we filter by vessel_imo. Table load_type: Ballast = "Ballast",
   * Laden = "Design" or "Scantling"; if both Design and Scantling exist we use only Scantling.
   */
  private async getBaselineCurves(
    vesselImo: number
  ): Promise<HullPerformanceAnalysis['baseline_curves'] | undefined> {
    try {
      const allRows = await this.repository.getVesselBaselineCurves(vesselImo);
      const forVessel = allRows.filter((r) => Number(r.vessel_imo) === vesselImo);

      const toCurve = (rows: VesselPerformanceModelRecord[]) =>
        rows.map((r) => ({
          speed: r.speed_kts,
          consumption: r.me_consumption_,
          power: r.me_power_kw,
        }));

      const ballastRows = forVessel.filter((r) =>
        /^ballast$/i.test(String(r.load_type ?? '').trim())
      );
      const designRows = forVessel.filter((r) =>
        /^design$/i.test(String(r.load_type ?? '').trim())
      );
      const scantlingRows = forVessel.filter((r) =>
        /^scantling$/i.test(String(r.load_type ?? '').trim())
      );
      const ladenRows =
        scantlingRows.length > 0 ? scantlingRows : designRows;

      const ballast = toCurve(ballastRows).sort((a, b) => a.speed - b.speed);
      const laden = toCurve(ladenRows).sort((a, b) => a.speed - b.speed);

      if (laden.length === 0 && ballast.length === 0) {
        return undefined;
      }
      return { laden, ballast };
    } catch {
      return undefined;
    }
  }
}
