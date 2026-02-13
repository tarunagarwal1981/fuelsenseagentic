/**
 * State-related TypeScript types
 *
 * Interfaces for structured state fields (hull performance, etc.)
 * used by schema, validation, and multi-agent state.
 */

/**
 * Hull performance analysis state shape.
 * Matches the structure produced by the Hull Performance Agent and HullPerformanceService.
 */
export interface HullPerformanceState {
  vessel: {
    imo: string;
    name: string;
  };
  hull_condition: 'GOOD' | 'AVERAGE' | 'POOR';
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
