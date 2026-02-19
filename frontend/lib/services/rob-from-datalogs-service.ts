/**
 * ROB from Datalogs Service
 *
 * Builds a ROB (Remaining On Board) snapshot from the datalogs (data_logs) API
 * using policy-defined columns and non-zero-only filter. Used by bunker workflow
 * when data-policy has rob_source: datalogs.
 *
 * Also provides getCurrentStateFromDatalogs(imo) to build VesselCurrentState from
 * the latest data_logs row for use in vessel planning (no Supabase).
 */

import { DatalogsClient, type DatalogRow } from '@/lib/clients/datalogs-client';
import type { VesselCurrentState } from '@/lib/repositories/types';
import type { DataPolicyConfig } from '@/lib/types/config';

const datalogsClient = new DatalogsClient();

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseReportDate(row: DatalogRow): Date {
  const raw = row.REPORT_DATE || row.UTC_DATE_TIME;
  if (raw && typeof raw === 'string') {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/** Fuel-type key used in app (e.g. VLSFO, LSMGO). Column ROB_* maps to this. */
export type RobFuelTypeKey =
  | 'VLSFO'
  | 'LSMGO'
  | 'HSFO'
  | 'ULSFO'
  | 'MDO'
  | 'LNG';

/** ROB snapshot: fuel type -> value (mt). Only non-zero entries when rob_filter is non_zero_only. */
export type RobSnapshot = Partial<Record<RobFuelTypeKey, number>>;

const COLUMN_TO_FUEL_KEY: Record<string, RobFuelTypeKey> = {
  ROB_VLSFO: 'VLSFO',
  ROB_LSMGO: 'LSMGO',
  ROB_HSFO: 'HSFO',
  ROB_ULSFO: 'ULSFO',
  ROB_MDO: 'MDO',
  ROB_LNG: 'LNG',
};

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Get ROB snapshot from datalogs for a vessel by IMO.
 * Uses policy rob_columns and rob_filter (non_zero_only); only includes
 * fuel types that are non-zero and non-null when filter is set.
 *
 * @param imo - Vessel IMO (caller should resolve name→IMO via VesselIdentifierService first if needed)
 * @param policy - Data-policy with rob_source, rob_columns, rob_filter
 * @returns Snapshot keyed by fuel type, or null if no datalog row or policy not datalogs
 */
export async function getRobFromDatalogs(
  imo: string,
  policy: DataPolicyConfig | null | undefined
): Promise<RobSnapshot | null> {
  if (!imo?.trim()) return null;
  if (!policy || policy.rob_source !== 'datalogs') return null;

  const row = await datalogsClient.getLatestRawByIMO(imo.trim());
  if (!row) return null;

  const columns = policy.rob_columns ?? [
    'ROB_VLSFO',
    'ROB_LSMGO',
    'ROB_HSFO',
    'ROB_ULSFO',
    'ROB_MDO',
    'ROB_LNG',
  ];
  const nonZeroOnly = policy.rob_filter === 'non_zero_only';

  const snapshot: RobSnapshot = {};

  for (const col of columns) {
    const fuelKey = COLUMN_TO_FUEL_KEY[col];
    if (!fuelKey) continue;
    const raw = (row as Record<string, unknown>)[col];
    const value = toNumber(raw);
    if (value === null) continue;
    if (nonZeroOnly && value <= 0) continue;
    snapshot[fuelKey] = value;
  }

  return Object.keys(snapshot).length > 0 ? snapshot : null;
}

/**
 * Get vessel current state (including ROB) from the data_logs API.
 * Used by VesselService.getVesselForVoyagePlanning so ROB comes from APIs only (no Supabase).
 *
 * @param imo - Vessel IMO
 * @returns VesselCurrentState or null if no datalog row for the IMO
 */
export async function getCurrentStateFromDatalogs(
  imo: string
): Promise<VesselCurrentState | null> {
  if (!imo?.trim()) return null;

  const row = await datalogsClient.getLatestRawByIMO(imo.trim());
  if (!row) return null;

  const reportDate = parseReportDate(row);
  const current_rob: VesselCurrentState['current_rob'] = {
    VLSFO: toNum(row.ROB_VLSFO),
    LSMGO: toNum(row.ROB_LSMGO),
    ...(row.ROB_MDO != null && toNum(row.ROB_MDO) > 0 ? { MDO: toNum(row.ROB_MDO) } : {}),
    ...(row.ROB_HSFO != null && toNum(row.ROB_HSFO) > 0 ? { HSFO: toNum(row.ROB_HSFO) } : {}),
  };

  const fromPort = typeof row.FROM_PORT === 'string' ? row.FROM_PORT.trim() : '';
  const toPort = typeof row.TO_PORT === 'string' ? row.TO_PORT.trim() : '';

  return {
    vessel_imo: String(row.VESSEL_IMO ?? imo),
    vessel_name: String(row.VESSEL_NAME ?? ''),
    current_rob,
    current_voyage: {
      voyage_number: '',
      from_port: fromPort,
      to_port: toPort,
      voyage_start_date: reportDate,
      voyage_end_date: reportDate,
      distance_to_go: row.DISTANCETOGO != null ? toNum(row.DISTANCETOGO) : undefined,
    },
    current_position: {
      latitude: toNum(row.LATITUDE),
      longitude: toNum(row.LONGITUDE),
      timestamp: reportDate,
    },
    vessel_activity: '',
    load_type:
      typeof row.LOAD_TYPE === 'string' && row.LOAD_TYPE.trim()
        ? row.LOAD_TYPE.trim()
        : '',
    last_report_date: reportDate,
  };
}
