/**
 * Test vessel performance queries using our implemented APIs directly.
 * Verifies Datalogs, VesselDetails, and VesselPerformanceModel APIs.
 * No LLM/multi-agent required.
 *
 * Run: npx tsx scripts/test-vessel-queries.ts
 */

import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });

import { VesselDetailsClient } from '../lib/clients/vessel-details-client';
import { DatalogsClient } from '../lib/clients/datalogs-client';
import { VesselPerformanceModelClient } from '../lib/clients/vessel-performance-model-client';

const BASE = process.env.VESSEL_MASTER_API_URL || process.env.NOON_REPORT_API_URL || 'https://uat.fuelsense-api.dexpertsystems.com';

async function fetchAllVessels(): Promise<unknown[]> {
  const url = `${BASE.replace(/\/$/, '')}/vessel-details?limit=100`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`VesselDetails ${res.status}`);
  const body = await res.json();
  return Array.isArray(body) ? body : (body?.data || []);
}

async function fetchDatalogsByVesselAndDate(imo: string, dateStr: string): Promise<unknown[]> {
  // NestJS-type filter: REPORT_DATE on given date
  const url = `${BASE.replace(/\/$/, '')}/datalogs?filter=VESSEL_IMO||$eq||${imo}&limit=50&sort=REPORT_DATE,DESC`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Datalogs ${res.status}`);
  const body = await res.json();
  const rows = Array.isArray(body) ? body : (body?.data || []);
  const targetDate = new Date(dateStr).toISOString().slice(0, 10);
  return rows.filter((r: { REPORT_DATE?: string; UTC_DATE_TIME?: string }) => {
    const d = r.REPORT_DATE || r.UTC_DATE_TIME || '';
    return d.slice(0, 10) === targetDate;
  });
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║     VESSEL QUERY TEST – Direct API Calls (Datalogs, VesselDetails, VPM)      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  const vesselDetails = new VesselDetailsClient();
  const datalogs = new DatalogsClient();
  const vpm = new VesselPerformanceModelClient();

  // Pick a vessel from API (e.g. MARITIME EXPLORER, IMO 5000004)
  const TEST_VESSEL = 'MARITIME EXPLORER';
  const TEST_IMO = '5000004';

  // -------------------------------------------------------------------------
  // Query 1: How many vessels and types do we have?
  // -------------------------------------------------------------------------
  console.log('═'.repeat(80));
  console.log('📝 Query 1: How many vessels and types do we have?');
  console.log('   API: VesselDetails (vessel-details)');
  console.log('═'.repeat(80));
  try {
    const allVessels = await fetchAllVessels();
    const typeCount: Record<string, number> = {};
    for (const v of allVessels as { vesselType?: string; vesselSubType?: string }[]) {
      const t = v.vesselType || v.vesselSubType || 'Unknown';
      typeCount[t] = (typeCount[t] || 0) + 1;
    }
    console.log(`   ✅ Vessels: ${allVessels.length}`);
    console.log('   Types:');
    for (const [t, c] of Object.entries(typeCount).sort((a, b) => b[1] - a[1])) {
      console.log(`      - ${t}: ${c}`);
    }
  } catch (e) {
    console.log('   ❌', e instanceof Error ? e.message : e);
  }

  // -------------------------------------------------------------------------
  // Query 2: Speed consumption profile of <vessel>
  // -------------------------------------------------------------------------
  console.log('\n' + '═'.repeat(80));
  console.log(`📝 Query 2: What is the speed consumption profile of ${TEST_VESSEL}?`);
  console.log('   API: VesselPerformanceModelTable (vessel-performance-model-table)');
  console.log('═'.repeat(80));
  try {
    const profiles = await vpm.getByIMO(TEST_IMO);
    if (profiles.length === 0) {
      console.log('   ⚠️ No profiles found. Trying by name...');
      const byName = await vesselDetails.getByName(TEST_VESSEL);
      if (byName) {
        const p2 = await vpm.getByIMO(byName.imo);
        if (p2.length > 0) {
          console.log(`   ✅ Found ${p2.length} profile(s) for IMO ${byName.imo}`);
          p2.slice(0, 8).forEach((p, i) => {
            console.log(`      ${i + 1}. Speed ${p.speed} kt | ME ${p.consumption.main_engine.vlsfo} MT | ${p.load_condition}`);
          });
        } else console.log('   ❌ No consumption profiles');
      }
    } else {
      console.log(`   ✅ Found ${profiles.length} profile(s)`);
      profiles.slice(0, 10).forEach((p, i) => {
        console.log(`      ${i + 1}. Speed ${p.speed} kt | ME ${p.consumption.main_engine.vlsfo} MT | ${p.load_condition} | Beaufort ${p.beaufort_scale}`);
      });
    }
  } catch (e) {
    console.log('   ❌', e instanceof Error ? e.message : e);
  }

  // -------------------------------------------------------------------------
  // Query 3: When was the last noon report received for <vessel>?
  // -------------------------------------------------------------------------
  console.log('\n' + '═'.repeat(80));
  console.log(`📝 Query 3: When was the last noon report received for ${TEST_VESSEL}?`);
  console.log('   API: Datalogs (noon reports)');
  console.log('═'.repeat(80));
  try {
    const report = await datalogs.getLatestByIMO(TEST_IMO);
    if (!report) {
      const byName = await datalogs.getLatestByName(TEST_VESSEL);
      if (byName) {
        console.log(`   ✅ Last report: ${byName.timestamp}`);
        console.log(`      Vessel: ${byName.vessel_name} | ROB VLSFO: ${byName.rob.vlsfo} | LSMGO: ${byName.rob.lsmgo}`);
      } else console.log('   ❌ No noon report found');
    } else {
      console.log(`   ✅ Last report: ${report.timestamp}`);
      console.log(`      Vessel: ${report.vessel_name} | ROB VLSFO: ${report.rob.vlsfo} | LSMGO: ${report.rob.lsmgo}`);
    }
  } catch (e) {
    console.log('   ❌', e instanceof Error ? e.message : e);
  }

  // -------------------------------------------------------------------------
  // Query 4: Total fuel consumption on 20th January
  // -------------------------------------------------------------------------
  console.log('\n' + '═'.repeat(80));
  console.log(`📝 Query 4: What was the total fuel consumption of ${TEST_VESSEL} on 20th January?`);
  console.log('   API: Datalogs (noon reports, fuel consumption fields)');
  console.log('═'.repeat(80));
  try {
    // Use 2025-01-20 or 2026-01-20 - check what data exists
    const rows = await fetchDatalogsByVesselAndDate(TEST_IMO, '2025-01-20');
    if (rows.length === 0) {
      const alt = await fetchDatalogsByVesselAndDate(TEST_IMO, '2026-01-20');
      if (alt.length === 0) {
        console.log('   ⚠️ No reports for 2025-01-20 or 2026-01-20. Showing sample dates from latest reports...');
        const latest = await datalogs.getLatestByIMO(TEST_IMO);
        if (latest) console.log(`      Latest report date: ${latest.timestamp}`);
        const raw = await fetch(`${BASE.replace(/\/$/, '')}/datalogs?filter=VESSEL_IMO||$eq||${TEST_IMO}&limit=5&sort=REPORT_DATE,DESC`);
        const data = await raw.json();
        const arr = Array.isArray(data) ? data : (data?.data || []);
        for (const r of arr as { REPORT_DATE?: string; FUEL_CONSUMPTION_GO_DO?: number; ME_CONSUMPTION?: number }[]) {
          const d = (r.REPORT_DATE || '').slice(0, 10);
          const me = r.ME_CONSUMPTION ?? 0;
          const ae = r.FUEL_CONSUMPTION_GO_DO ?? 0;
          console.log(`      ${d}: ME ~${me} MT, GO/DO ~${ae} MT`);
        }
      } else {
        let total = 0;
        for (const r of alt as { ME_CONSUMPTION?: number; FUEL_CONSUMPTION_GO_DO?: number; FUEL_CONSUMPTION_HFO?: number }[]) {
          total += (r.ME_CONSUMPTION ?? 0) + (r.FUEL_CONSUMPTION_GO_DO ?? 0) + (r.FUEL_CONSUMPTION_HFO ?? 0);
        }
        console.log(`   ✅ 2026-01-20: ${alt.length} report(s), total consumption ~${total.toFixed(2)} MT`);
      }
    } else {
      let total = 0;
      for (const r of rows as { ME_CONSUMPTION?: number; FUEL_CONSUMPTION_GO_DO?: number; FUEL_CONSUMPTION_HFO?: number }[]) {
        total += (r.ME_CONSUMPTION ?? 0) + (r.FUEL_CONSUMPTION_GO_DO ?? 0) + (r.FUEL_CONSUMPTION_HFO ?? 0);
      }
      console.log(`   ✅ 2025-01-20: ${rows.length} report(s), total consumption ~${total.toFixed(2)} MT`);
    }
  } catch (e) {
    console.log('   ❌', e instanceof Error ? e.message : e);
  }

  console.log('\n' + '═'.repeat(80));
  console.log('✅ All 4 queries tested. APIs used: VesselDetails, Datalogs, VesselPerformanceModelTable');
  console.log('═'.repeat(80) + '\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
