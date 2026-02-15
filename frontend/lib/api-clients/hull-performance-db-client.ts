/**
 * Hull Performance DB Client (testing bypass)
 *
 * Reads hull performance data directly from MySQL table hull_performance_temp
 * when HULL_PERFORMANCE_SOURCE=db. Same interface as HullPerformanceClient so
 * the repository can use either. Revert to API by setting HULL_PERFORMANCE_SOURCE=api.
 */

import mysql from 'mysql2/promise';
import type {
  HullPerformanceRecord,
  VesselPerformanceModelRecord,
} from '@/lib/api-clients/hull-performance-client';
import { logError } from '@/lib/monitoring/axiom-logger';

/** TEMPORARY: Remove before commit. Overrides when env is missing. Copy values from .env. */
const HARDCODED_HULL_DB = {

  host: 'fleetsense-uat-db.cxso8a2oes25.ap-south-1.rds.amazonaws.com',
  port: 3306,
  database: 'fuelsense',
  user: 'fuelsense_user',
  password: 'P@$$word@123!',
  table: 'NewTable',

};

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapRowToHullPerformanceRecord(row: Record<string, unknown>): HullPerformanceRecord {
  return {
    id: toNum(row.id),
    vessel_imo: toNum(row.vessel_imo),
    vessel_name: String(row.vessel_name ?? ''),
    report_date: row.report_date instanceof Date ? row.report_date.toISOString() : String(row.report_date ?? ''),
    utc_date_time: row.utc_date_time instanceof Date ? row.utc_date_time.toISOString() : String(row.utc_date_time ?? ''),

    hull_roughness_power_loss: toNum(row.hull_roughness_power_loss),
    hull_roughness_speed_loss: toNum(row.hull_roughness_speed_loss),
    hull_excess_fuel_oil: toNum(row.hull_excess_fuel_oil),
    hull_excess_fuel_oil_mtd: toNum(row.hull_excess_fuel_oil_mtd),

    speed: toNum(row.speed),
    consumption: toNum(row.consumption),
    predicted_consumption: toNum(row.predicted_consumption),
    distance_travelled_actual: toNum(row.distance_travelled_actual),
    steaming_time_hrs: toNum(row.steaming_time_hrs),

    windforce: toNum(row.windforce),
    weather_category: String(row.weather_category ?? ''),
    loading_condition: String(row.loading_condition ?? ''),
    event: row.event != null ? String(row.event).trim() : undefined,
    displacement: toNum(row.displacement),
    total_cargo: toNum(row.total_cargo),

    engine_power_loss: toNum(row.engine_power_loss),
    propeller_fouling_power_loss: toNum(row.propeller_fouling_power_loss),
    engine_speed_loss: toNum(row.engine_speed_loss),
    propeller_fouling_speed_loss: toNum(row.propeller_fouling_speed_loss),

    hull_cii_impact: toNum(row.hull_cii_impact),
    engine_cii_impact: toNum(row.engine_cii_impact),
    propeller_cii_impact: toNum(row.propeller_cii_impact),

    expected_power: toNum(row.expected_power),
    reported_me_power: toNum(row.reported_me_power),
    predicted_me_power: toNum(row.predicted_me_power),

    normalised_consumption: toNum(row.normalised_consumption),
  };
}

function getConfig(): {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  table: string;
} {
  const host = process.env.HULL_PERFORMANCE_DB_HOST ?? '';
  const user = process.env.HULL_PERFORMANCE_DB_USER ?? '';
  const password = process.env.HULL_PERFORMANCE_DB_PASSWORD ?? '';
  if (!host || !user || !password) {
    console.warn('[Hull DB] Using hardcoded config - remove before commit');
    return {
      host: HARDCODED_HULL_DB.host,
      port: HARDCODED_HULL_DB.port,
      database: HARDCODED_HULL_DB.database,
      user: HARDCODED_HULL_DB.user,
      password: HARDCODED_HULL_DB.password,
      table: HARDCODED_HULL_DB.table,
    };
  }
  return {
    host,
    port: parseInt(process.env.HULL_PERFORMANCE_DB_PORT ?? '3306', 10),
    database: process.env.HULL_PERFORMANCE_DB_DATABASE ?? 'fuelsense',
    user,
    password,
    table: process.env.HULL_PERFORMANCE_DB_TABLE ?? 'NewTable',
  };
}

/**
 * DB client with same interface as HullPerformanceClient.
 * Use when HULL_PERFORMANCE_SOURCE=db for testing (reads hull_performance_temp).
 */
export class HullPerformanceDbClient {
  private correlationId?: string;

  constructor(correlationId?: string) {
    this.correlationId = correlationId;
  }

  async getHullPerformance(params: {
    vessel_imo?: number;
    vessel_name?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<HullPerformanceRecord[]> {
    const cid = this.correlationId ?? 'unknown';
    let connection: mysql.Connection | null = null;
    try {
      const config = getConfig();
      connection = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
      });

      const conditions: string[] = [];
      const values: unknown[] = [];

      if (params.vessel_imo != null) {
        conditions.push('vessel_imo = ?');
        values.push(params.vessel_imo);
      }
      if (params.vessel_name != null) {
        conditions.push('LOWER(vessel_name) = LOWER(?)');
        values.push(params.vessel_name);
      }
      if (params.start_date != null) {
        conditions.push('DATE(report_date) >= ?');
        values.push(params.start_date);
      }
      if (params.end_date != null) {
        conditions.push('DATE(report_date) <= ?');
        values.push(params.end_date);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = Math.min(params.limit ?? 5000, 10000);
      const offset = params.offset ?? 0;
      const sql = `SELECT * FROM \`${config.table}\` ${where} ORDER BY report_date DESC LIMIT ? OFFSET ?`;
      values.push(limit, offset);

      const [rows] = await connection.execute(sql, values);
      const list = Array.isArray(rows) ? rows : [];
      return list.map((row) => mapRowToHullPerformanceRecord(row as Record<string, unknown>));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError(cid, err instanceof Error ? err : new Error(message), {
        client: 'HullPerformanceDbClient',
        method: 'getHullPerformance',
        params,
      });
      throw new Error(`Hull Performance DB: ${message}`);
    } finally {
      if (connection) {
        try {
          await connection.end();
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * Baseline curves: not read from DB in this bypass. Returns empty array.
   * Revert to API for full baseline support.
   */
  async getVesselPerformanceModel(_params: {
    vessel_imo: number;
    load_type?: 'Laden' | 'Ballast';
  }): Promise<VesselPerformanceModelRecord[]> {
    return [];
  }
}
