/**
 * Test vessel-performance-model-table: IMO filtering and load_type values.
 * Neptune Star IMO = 5004001. Table has load_type: Ballast | Design | Scantling
 * (Laden = Design or Scantling; prefer Scantling when both exist).
 *
 * Run from frontend: npx tsx scripts/test-baseline-load-types.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import {
  HullPerformanceClient,
  type VesselPerformanceModelRecord,
} from '@/lib/api-clients/hull-performance-client';

const cwd = process.cwd();
config({ path: resolve(cwd, '.env') });
config({ path: resolve(cwd, '.env.local') });

const NEPTUNE_STAR_IMO = 5004001;

/** Fetch raw JSON to inspect API field names */
async function fetchRawVesselPerformanceModel(vesselImo: number, loadType?: string): Promise<unknown> {
  const base =
    (process.env.HULL_PERFORMANCE_API_URL ||
      process.env.NEXT_PUBLIC_FUELSENSE_API_URL ||
      'https://uat.fuelsense-api.dexpertsystems.com').replace(/\/$/, '');
  const params = new URLSearchParams({ vessel_imo: String(vesselImo) });
  if (loadType) params.set('load_type', loadType);
  const url = `${base}/vessel-performance-model-table?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function countByLoadType(rows: VesselPerformanceModelRecord[]) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const lt = String(r.load_type ?? '').trim() || '(empty)';
    map.set(lt, (map.get(lt) ?? 0) + 1);
  }
  return Object.fromEntries([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

function countByImo(rows: VesselPerformanceModelRecord[]) {
  const map = new Map<number, number>();
  for (const r of rows) {
    const imo = r.vessel_imo ?? 0;
    map.set(imo, (map.get(imo) ?? 0) + 1);
  }
  return Object.fromEntries([...map.entries()].sort((a, b) => a[0] - b[0]));
}

async function main() {
  console.log('\n🔍 Vessel-performance-model: IMO filter + load_type inspection');
  console.log('----------------------------------------------------------------');
  console.log('Vessel: Neptune Star, IMO:', NEPTUNE_STAR_IMO);
  console.log('');

  // 0) Raw response shape and counts by vesselImo / loadType
  console.log('0) Raw API response (requested vessel_imo=' + NEPTUNE_STAR_IMO + '):');
  try {
    const raw = await fetchRawVesselPerformanceModel(NEPTUNE_STAR_IMO);
    const arr = Array.isArray(raw) ? raw : (raw as { data?: unknown[] })?.data;
    const rows = Array.isArray(arr) ? arr : [];
    console.log('   Total rows returned:', rows.length);
    if (rows.length > 0) {
      const first = rows[0] as Record<string, unknown>;
      console.log('   First row keys:', Object.keys(first).join(', '));
      console.log('   First row vesselImo:', first.vesselImo, '| loadType:', first.loadType);
    }
    const byImo: Record<number, number> = {};
    const byLoadType: Record<string, number> = {};
    for (const r of rows as Record<string, unknown>[]) {
      const imo = Number(r.vesselImo ?? r.vessel_imo ?? 0);
      byImo[imo] = (byImo[imo] ?? 0) + 1;
      const lt = String(r.loadType ?? r.load_type ?? '').trim() || '(empty)';
      byLoadType[lt] = (byLoadType[lt] ?? 0) + 1;
    }
    console.log('   Count by vesselImo:', byImo);
    console.log('   Count by loadType:', byLoadType);
    const forNeptune = rows.filter((r: Record<string, unknown>) => Number(r.vesselImo ?? r.vessel_imo) === NEPTUNE_STAR_IMO);
    console.log('   Rows for Neptune Star IMO ' + NEPTUNE_STAR_IMO + ':', forNeptune.length);
    if (forNeptune.length > 0) {
      const ltCount: Record<string, number> = {};
      for (const r of forNeptune as Record<string, unknown>[]) {
        const lt = String(r.loadType ?? r.load_type ?? '').trim() || '(empty)';
        ltCount[lt] = (ltCount[lt] ?? 0) + 1;
      }
      console.log('   For this IMO, by loadType:', ltCount);
    }
  } catch (e) {
    console.log('   Error:', e instanceof Error ? e.message : String(e));
  }
  console.log('');

  const client = new HullPerformanceClient('test-baseline-load-types');

  // 1) No load_type – get all rows for this IMO (what the API returns when we pass vessel_imo only)
  console.log('1) GET with vessel_imo only (no load_type):');
  let allRows: VesselPerformanceModelRecord[];
  try {
    allRows = await client.getVesselPerformanceModel({ vessel_imo: NEPTUNE_STAR_IMO });
  } catch (err) {
    console.log('   Error:', err instanceof Error ? err.message : String(err));
    allRows = [];
  }
  console.log('   Total rows:', allRows.length);
  console.log('   vessel_imo values (count by IMO):', countByImo(allRows));
  console.log('   load_type values (count by load_type):', countByLoadType(allRows));
  if (allRows.length > 0) {
    const distinctLoadTypes = [...new Set(allRows.map((r) => String(r.load_type ?? '').trim()))].filter(Boolean);
    console.log('   Distinct load_type in table:', distinctLoadTypes.join(', '));
    console.log('   Sample row load_type:', (allRows[0] as VesselPerformanceModelRecord).load_type);
  }
  console.log('');

  // 2) With load_type=Ballast
  console.log('2) GET with vessel_imo + load_type=Ballast:');
  let ballastRows: VesselPerformanceModelRecord[];
  try {
    ballastRows = await client.getVesselPerformanceModel({
      vessel_imo: NEPTUNE_STAR_IMO,
      load_type: 'Ballast',
    });
  } catch (err) {
    console.log('   Error:', err instanceof Error ? err.message : String(err));
    ballastRows = [];
  }
  console.log('   Rows:', ballastRows.length);
  console.log('   load_type counts:', countByLoadType(ballastRows));
  console.log('');

  // 3) With load_type=Laden (API sends "Laden" – table may have Design/Scantling)
  console.log('3) GET with vessel_imo + load_type=Laden:');
  let ladenRows: VesselPerformanceModelRecord[];
  try {
    ladenRows = await client.getVesselPerformanceModel({
      vessel_imo: NEPTUNE_STAR_IMO,
      load_type: 'Laden',
    });
  } catch (err) {
    console.log('   Error:', err instanceof Error ? err.message : String(err));
    ladenRows = [];
  }
  console.log('   Rows:', ladenRows.length);
  console.log('   load_type counts:', countByLoadType(ladenRows));
  if (ladenRows.length > 0) {
    const distinct = [...new Set(ladenRows.map((r) => String(r.load_type ?? '').trim()))].filter(Boolean);
    console.log('   Distinct load_type in response:', distinct.join(', '));
  }
  console.log('');

  // 4) Summary and recommendation
  console.log('Summary:');
  console.log('  - If "vessel_imo only" returns multiple IMOs, API may not be filtering by IMO.');
  console.log('  - Table load_type: Ballast = Ballast; Laden = Design or Scantling (prefer Scantling if both).');
  console.log('  - If load_type=Laden returns 0 rows, API may expect Design/Scantling; we should fetch without');
  console.log('    load_type for Laden and filter client-side: take Scantling if present, else Design.');
  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
