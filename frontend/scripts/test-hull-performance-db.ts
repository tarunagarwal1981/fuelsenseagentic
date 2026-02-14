/**
 * Test Hull Performance DB connection (MySQL NewTable)
 *
 * Loads .env and .env.local and connects to the configured MySQL DB, then runs
 * queries against HULL_PERFORMANCE_DB_TABLE (e.g. NewTable). Includes Neptune star
 * lookup, distinct vessel names, and schema check.
 *
 * Run from frontend: npx tsx scripts/test-hull-performance-db.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import mysql from 'mysql2/promise';

// Load .env first, then .env.local (local overrides)
const cwd = process.cwd();
config({ path: resolve(cwd, '.env') });
config({ path: resolve(cwd, '.env.local') });

const host = process.env.HULL_PERFORMANCE_DB_HOST;
const port = parseInt(process.env.HULL_PERFORMANCE_DB_PORT ?? '3306', 10);
const database = process.env.HULL_PERFORMANCE_DB_DATABASE ?? 'fuelsense';
const user = process.env.HULL_PERFORMANCE_DB_USER;
const password = process.env.HULL_PERFORMANCE_DB_PASSWORD;
const table = process.env.HULL_PERFORMANCE_DB_TABLE ?? 'NewTable';

/** Expected columns for HullPerformanceRecord (from hull-performance-client.ts) */
const EXPECTED_COLUMNS = [
  'id',
  'vessel_imo',
  'vessel_name',
  'report_date',
  'utc_date_time',
  'hull_roughness_power_loss',
  'hull_roughness_speed_loss',
  'hull_excess_fuel_oil',
  'hull_excess_fuel_oil_mtd',
  'speed',
  'consumption',
  'predicted_consumption',
  'distance_travelled_actual',
  'steaming_time_hrs',
  'windforce',
  'weather_category',
  'loading_condition',
  'displacement',
  'total_cargo',
  'engine_power_loss',
  'propeller_fouling_power_loss',
  'engine_speed_loss',
  'propeller_fouling_speed_loss',
  'hull_cii_impact',
  'engine_cii_impact',
  'propeller_cii_impact',
  'expected_power',
  'reported_me_power',
  'predicted_me_power',
  'normalised_consumption',
];

async function main() {
  console.log('\n🔌 Hull Performance DB connection test');
  console.log('--------------------------------------');
  console.log('Host:', host ?? '(not set)');
  console.log('Port:', port);
  console.log('Database:', database);
  console.log('User:', user ?? '(not set)');
  console.log('Table:', table);

  if (!host || !user || !password) {
    console.error(
      '\n❌ Missing HULL_PERFORMANCE_DB_HOST, HULL_PERFORMANCE_DB_USER, or HULL_PERFORMANCE_DB_PASSWORD (set in .env or .env.local)'
    );
    process.exit(1);
  }

  let connection: mysql.Connection | null = null;
  try {
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
      connectTimeout: 10000,
    });
    console.log('\n✅ Connected to MySQL');

    const [rows] = await connection.execute(`SELECT COUNT(*) as cnt FROM \`${table}\``);
    const count = (rows as { cnt: number }[])[0]?.cnt ?? 0;
    console.log(`✅ Table "${table}" exists. Row count: ${count}`);

    let first: Record<string, unknown> | undefined;
    if (count > 0) {
      const [sample] = await connection.execute(`SELECT * FROM \`${table}\` LIMIT 1`);
      first = (sample as Record<string, unknown>[])[0];
      console.log('\n📋 Sample row keys:', first ? Object.keys(first).join(', ') : 'none');

      // Schema check: compare to HullPerformanceRecord expected columns
      const rowKeys = first ? new Set(Object.keys(first).map((k) => k.toLowerCase())) : new Set<string>();
      const missing: string[] = [];
      for (const col of EXPECTED_COLUMNS) {
        if (!rowKeys.has(col.toLowerCase())) {
          missing.push(col);
        }
      }
      if (missing.length > 0) {
        console.warn('\n⚠️  Schema: missing columns expected by HullPerformanceRecord:', missing.join(', '));
      } else {
        console.log('\n✅ Schema: all expected HullPerformanceRecord columns present in sample row.');
      }
    }

    // -------------------------------------------------------------------------
    // Neptune star section
    // -------------------------------------------------------------------------
    console.log('\n🔍 Neptune star lookup');
    console.log('----------------------');

    const neptuneStar = 'Neptune star';
    const neptuneStarCapitalS = 'Neptune Star';

    const [cnt1] = await connection.execute(
      `SELECT COUNT(*) as cnt FROM \`${table}\` WHERE vessel_name = ?`,
      [neptuneStar]
    );
    const countNeptuneStar = (cnt1 as { cnt: number }[])[0]?.cnt ?? 0;

    const [cnt2] = await connection.execute(
      `SELECT COUNT(*) as cnt FROM \`${table}\` WHERE vessel_name = ?`,
      [neptuneStarCapitalS]
    );
    const countNeptuneStarCapitalS = (cnt2 as { cnt: number }[])[0]?.cnt ?? 0;

    console.log(`   vessel_name = 'Neptune star'  → ${countNeptuneStar} rows`);
    console.log(`   vessel_name = 'Neptune Star'  → ${countNeptuneStarCapitalS} rows`);

    const vesselForDateRange = countNeptuneStar > 0 ? neptuneStar : countNeptuneStarCapitalS > 0 ? neptuneStarCapitalS : null;
    if (vesselForDateRange) {
      const [dateRows] = await connection.execute(
        `SELECT MIN(report_date) as min_date, MAX(report_date) as max_date FROM \`${table}\` WHERE vessel_name = ?`,
        [vesselForDateRange]
      );
      const dr = (dateRows as { min_date: string; max_date: string }[])[0];
      console.log(`   Date range for '${vesselForDateRange}': ${dr?.min_date ?? '—'} to ${dr?.max_date ?? '—'}`);
    }

    if (countNeptuneStar === 0 && countNeptuneStarCapitalS === 0) {
      console.log(
        '\n⚠️  No hull performance rows for Neptune star. Add test data or use a vessel name that exists in the table.'
      );
    } else if (countNeptuneStar === 0 && countNeptuneStarCapitalS > 0) {
      console.log(
        "\n⚠️  If count for 'Neptune star' is 0 but distinct names show 'Neptune Star', the DB client uses exact match; consider case-insensitive lookup (e.g. LOWER(vessel_name) = LOWER(?))."
      );
    }

    // Distinct vessel names (sample) to see exact spellings in table
    const [distinctRows] = await connection.execute(
      `SELECT DISTINCT vessel_name FROM \`${table}\` ORDER BY vessel_name LIMIT 50`
    );
    const names = (distinctRows as { vessel_name: string }[]).map((r) => r.vessel_name);
    console.log('\n📋 Distinct vessel_name in table (up to 50):', names.length ? names.join(', ') : 'none');
  } catch (err) {
    console.error('\n❌ Connection or query failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n✅ Connection closed.');
    }
  }
}

main();
