/**
 * ROB from Datalogs Service
 *
 * Builds a ROB (Remaining On Board) snapshot from the datalogs (data_logs) API
 * using policy-defined columns and non-zero-only filter. Used by bunker workflow
 * when data-policy has rob_source: datalogs.
 */

import { DatalogsClient, type DatalogRow } from '@/lib/clients/datalogs-client';
import type { DataPolicyConfig } from '@/lib/types/config';

const datalogsClient = new DatalogsClient();

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
