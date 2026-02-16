/**
 * Unified alert types for the left panel (alerts module).
 * Used by all alert sources (hull, fuel_sense, etc.) and future live alerts.
 */

/** Alert source identifier; card uses this for agent line and icon/color. */
export type AlertSource = 'hull' | 'fuel_sense';

/** Agent descriptor for the card "Agent:" line (multi-agent ready). */
export interface AlertAgent {
  id: AlertSource;
  name: string;
  color: string;
}

/**
 * Single alert item shown in the left panel.
 * One shape for all agents and for live push.
 */
export interface AlertItem {
  /** Unique id for dedup and future live updates (e.g. hull_imo_report_date). */
  id: string;
  /** Source(s) for this alert; card renders agent line from this. */
  source: AlertSource;
  vesselName: string;
  /** Formatted for display, e.g. "Date: 12 Jan". */
  date: string;
  message: string;
  /** Optional numeric metric to show in bold (e.g. excess_power_pct). */
  metric?: number;
  /** Optional timestamp for ordering and future live alerts. */
  createdAt?: number;
}

/**
 * Optional interface for alert providers (domain-backed, alerts module only).
 * Implementations return alerts for one source (e.g. hull).
 */
export interface AlertProvider {
  readonly name: AlertSource;
  /** Returns alerts (e.g. POOR hull per vessel). */
  getAlerts(options?: { vesselLimit?: number; correlationId?: string }): Promise<AlertItem[]>;
}
