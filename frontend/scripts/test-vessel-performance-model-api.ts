/**
 * Test VesselPerformanceModelTable API (Baseline Profiles)
 *
 * Verifies connectivity and response shape for speed, consumption, power data.
 * Base URL from env or FuelSense UAT.
 *
 * Run from frontend: npx tsx scripts/test-vessel-performance-model-api.ts
 * Raw dump:         npx tsx scripts/test-vessel-performance-model-api.ts --raw
 * Filter by IMO:   npx tsx scripts/test-vessel-performance-model-api.ts --imo 5000004
 */

import { config } from 'dotenv';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env.local');
config({ path: envPath });

const BASE_URL =
  process.env.BASELINE_PROFILE_API_URL ||
  process.env.VESSEL_MASTER_API_URL ||
  process.env.NOON_REPORT_API_URL ||
  process.env.NEXT_PUBLIC_FUELSENSE_API_URL ||
  'https://uat.fuelsense-api.dexpertsystems.com';

const base = BASE_URL.replace(/\/$/, '');

async function fetchJson(url: string) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await res.json() : await res.text();
  return { ok: res.ok, status: res.status, body, isJson };
}

async function testRetrieveMultiple() {
  console.log('\n📋 Test 1: GET /vessel-performance-model-table (retrieve multiple)');
  console.log('------------------------------------------------------------------------');
  const url = `${base}/vessel-performance-model-table?limit=10`;
  console.log('URL:', url);
  try {
    const { ok, status, body, isJson } = await fetchJson(url);
    console.log('Status:', status);
    if (!isJson) {
      console.log('Response (text):', String(body).substring(0, 500));
      return null;
    }
    if (!ok) {
      console.log('Error body:', JSON.stringify(body, null, 2).substring(0, 600));
      return null;
    }
    const isArray = Array.isArray(body);
    const data = isArray ? body : (body as { data?: unknown }).data;
    const rows = Array.isArray(data) ? data : [];
    console.log('Response type:', isArray ? 'array' : typeof body);
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      console.log('Top-level keys:', Object.keys(body as object));
    }
    console.log('Row count:', rows.length);
    if (rows.length > 0) {
      console.log('First row keys:', Object.keys(rows[0] as object));
      console.log('\nFirst row (full):');
      console.log(JSON.stringify(rows[0], null, 2));
      if (rows.length > 1) {
        console.log('\nSecond row (full):');
        console.log(JSON.stringify(rows[1], null, 2));
      }
      return rows[0] as Record<string, unknown>;
    }
    return null;
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function testFilterByIMO(imo: string) {
  console.log('\n🚢 Test 2: GET /vessel-performance-model-table filtered by IMO:', imo);
  console.log('------------------------------------------------------------------------');
  // Try common field names for IMO
  const filters = [
    `imo||$eq||${imo}`,
    `IMO||$eq||${imo}`,
    `vessel_imo||$eq||${imo}`,
    `vesselImo||$eq||${imo}`,
  ];
  for (const filter of filters) {
    const url = `${base}/vessel-performance-model-table?filter=${encodeURIComponent(filter)}&limit=5`;
    console.log('URL:', url);
    try {
      const { ok, status, body, isJson } = await fetchJson(url);
      console.log('Status:', status);
      if (!isJson) {
        console.log('Response (text):', String(body).substring(0, 300));
        continue;
      }
      if (!ok) {
        console.log('Error:', JSON.stringify(body, null, 2).substring(0, 400));
        continue;
      }
      const isArray = Array.isArray(body);
      const data = isArray ? body : (body as { data?: unknown }).data;
      const rows = Array.isArray(data) ? data : [];
      console.log('Row count:', rows.length);
      if (rows.length > 0) {
        console.log('Match (first row):');
        console.log(JSON.stringify(rows[0], null, 2));
        return;
      }
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
    }
  }
  console.log('No matching filter found. Check API field names.');
}

async function rawDump() {
  console.log('\n🔍 Raw dump: GET /vessel-performance-model-table?limit=5');
  console.log('----------------------------------------------------------------');
  const url = `${base}/vessel-performance-model-table?limit=5`;
  const { ok, status, body, isJson } = await fetchJson(url);
  console.log('Status:', status);
  if (isJson) {
    console.log(JSON.stringify(body, null, 2));
  } else {
    console.log(String(body));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const raw = args.includes('--raw');
  const imoIdx = args.indexOf('--imo');
  const testIMO = imoIdx >= 0 && args[imoIdx + 1] ? args[imoIdx + 1] : null;

  console.log('VesselPerformanceModelTable API – Baseline Profiles (speed, consumption, power)');
  console.log('==============================================================================');
  console.log('Base URL:', base);
  if (raw) {
    await rawDump();
    return;
  }

  const firstRow = await testRetrieveMultiple();

  if (testIMO) {
    await testFilterByIMO(testIMO);
  } else if (firstRow) {
    // Try to extract IMO from first row for filter test
    const imo = firstRow.imo ?? firstRow.IMO ?? firstRow.vessel_imo ?? firstRow.vesselImo;
    if (imo != null) {
      console.log('\n💡 To test IMO filter: npx tsx scripts/test-vessel-performance-model-api.ts --imo', imo);
    }
  }

  console.log('\n================================');
  console.log('✅ VesselPerformanceModelTable API test completed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
