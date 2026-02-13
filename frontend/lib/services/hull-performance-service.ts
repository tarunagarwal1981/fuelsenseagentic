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
      const dateRange = options?.days != null
        ? { days: options.days }
        : options?.startDate && options?.endDate
          ? { startDate: options.startDate, endDate: options.endDate }
          : undefined;

      const result = await this.repository.getVesselPerformanceData(
        vesselIdentifier,
        dateRange ?? { days: 90 }
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
      const { metadata } = result;
      const totalRecords = records.length;

      if (records.length === 0) {
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
          },
          'info'
        );
        return null;
      }

      const sorted = [...records].sort(
        (a, b) => new Date(b.report_date).getTime() - new Date(a.report_date).getTime()
      );
      const latestRecord = sorted[0];
      const imoStr = String(latestRecord.vessel_imo ?? vesselIdentifier.imo ?? '');
      const nameStr = latestRecord.vessel_name || vesselIdentifier.name || '';

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

      const trendData = this.transformToTrendData(records);
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
        latest_metrics: this.extractLatestMetrics(latestRecord),
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
   * Get baseline curves and format for charts (laden + ballast).
   */
  private async getBaselineCurves(
    vesselImo: number
  ): Promise<HullPerformanceAnalysis['baseline_curves'] | undefined> {
    try {
      const [ladenRows, ballastRows] = await Promise.all([
        this.repository.getVesselBaselineCurves(vesselImo, 'Laden'),
        this.repository.getVesselBaselineCurves(vesselImo, 'Ballast'),
      ]);

      const toCurve = (rows: VesselPerformanceModelRecord[]) =>
        rows.map((r) => ({
          speed: r.speed_kts,
          consumption: r.me_consumption_,
          power: r.me_power_kw,
        }));

      const laden = toCurve(ladenRows).sort((a, b) => a.speed - b.speed);
      const ballast = toCurve(ballastRows).sort((a, b) => a.speed - b.speed);

      if (laden.length === 0 && ballast.length === 0) {
        return undefined;
      }
      return { laden, ballast };
    } catch {
      return undefined;
    }
  }
}
