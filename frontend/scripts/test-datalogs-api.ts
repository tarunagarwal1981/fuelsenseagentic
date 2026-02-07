/**
 * Test Datalogs API (Noon Report / Transfer Data)
 *
 * Verifies connectivity and response shape for the FuelSense Datalogs API.
 * Base URL from NEXT_PUBLIC_FUELSENSE_API_URL or .env.local.
 *
 * Run from frontend: npx tsx scripts/test-datalogs-api.ts
 * Raw dump:         npx tsx scripts/test-datalogs-api.ts --raw
 * Single by ID:     npx tsx scripts/test-datalogs-api.ts --id <datalog-id>
 */

import { config } from 'dotenv';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env.local');
config({ path: envPath });

// Datalogs/noon report API - NOON_REPORT_API_URL or FuelSense base
const BASE_URL =
  process.env.NOON_REPORT_API_URL ||
  process.env.NEXT_PUBLIC_FUELSENSE_API_URL ||
  process.env.BUNKER_PRICING_API_URL ||
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

async function testTransferData() {
  console.log('\n📥 Test 1: GET /datalogs/transfer-data');
  console.log('--------------------------------------');
  const url = `${base}/datalogs/transfer-data`;
  console.log('URL:', url);
  try {
    const { ok, status, body, isJson } = await fetchJson(url);
    console.log('Status:', status);
    if (!isJson) {
      console.log('Response (text):', String(body).substring(0, 500));
      return;
    }
    if (!ok) {
      console.log('Error body:', JSON.stringify(body, null, 2).substring(0, 600));
      return;
    }
    const isArray = Array.isArray(body);
    const data = isArray ? body : (body as { data?: unknown }).data;
    const rows = Array.isArray(data) ? data : [body];
    console.log('Response type:', isArray ? 'array' : typeof body);
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      console.log('Top-level keys:', Object.keys(body as object));
    }
    console.log('Row count:', rows.length);
    if (rows.length > 0) {
      console.log('First row keys:', Object.keys(rows[0] as object));
      console.log('First row sample:');
      console.log(JSON.stringify(rows[0], null, 2));
    }
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : String(err));
  }
}

async function testRetrieveMultiple() {
  console.log('\n📋 Test 2: GET /datalogs (retrieve multiple)');
  console.log('--------------------------------------------');
  const url = `${base}/datalogs?limit=5`;
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
      console.log('First row sample:');
      console.log(JSON.stringify(rows[0], null, 2));
      const firstId = (rows[0] as { id?: string | number }).id;
      return firstId != null ? String(firstId) : null;
    }
    return null;
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function testRetrieveSingle(id: string) {
  console.log('\n📄 Test 3: GET /datalogs/' + id);
  console.log('----------------------------');
  const url = `${base}/datalogs/${encodeURIComponent(id)}`;
  console.log('URL:', url);
  try {
    const { ok, status, body, isJson } = await fetchJson(url);
    console.log('Status:', status);
    if (!isJson) {
      console.log('Response (text):', String(body).substring(0, 500));
      return;
    }
    if (!ok) {
      console.log('Error body:', JSON.stringify(body, null, 2).substring(0, 600));
      return;
    }
    console.log('Single datalog:');
    console.log(JSON.stringify(body, null, 2));
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : String(err));
  }
}

async function testFilterByIMO(imo: string) {
  console.log('\n🚢 Test 4: GET /datalogs filtered by IMO:', imo);
  console.log('---------------------------------------------');
  // NestJS CRUD filter: VESSEL_IMO||$eq||5000004
  const url = `${base}/datalogs?filter=VESSEL_IMO||$eq||${imo}&limit=5&sort=REPORT_DATE,DESC`;
  console.log('URL:', url);
  try {
    const { ok, status, body, isJson } = await fetchJson(url);
    console.log('Status:', status);
    if (!isJson) {
      console.log('Response (text):', String(body).substring(0, 300));
      return;
    }
    if (!ok) {
      console.log('Error:', JSON.stringify(body, null, 2).substring(0, 400));
      return;
    }
    const isArray = Array.isArray(body);
    const data = isArray ? body : (body as { data?: unknown }).data;
    const rows = Array.isArray(data) ? data : [];
    console.log('Row count:', rows.length);
    if (rows.length > 0) {
      const r = rows[0] as Record<string, unknown>;
      console.log(
        'Latest:',
        r.VESSEL_NAME,
        '|',
        r.REPORT_DATE,
        '| ROB_VLSFO:',
        r.ROB_VLSFO,
        '| ROB_LSMGO:',
        r.ROB_LSMGO
      );
    }
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : String(err));
  }
}

async function rawDump() {
  console.log('\n🔍 Raw dump: GET /datalogs?limit=3');
  console.log('-----------------------------------');
  const url = `${base}/datalogs?limit=3`;
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
  const idArg = args.find((a, i) => args[i - 1] === '--id');
  const testId = idArg || process.env.DATALOG_TEST_ID;

  console.log('Datalogs API – connectivity test');
  console.log('================================');
  console.log('Base URL:', base);
  if (raw) {
    await rawDump();
    return;
  }

  await testTransferData();
  const firstId = await testRetrieveMultiple();

  if (testId) {
    await testRetrieveSingle(testId);
  } else if (firstId) {
    console.log('\n💡 To test single GET, run: npx tsx scripts/test-datalogs-api.ts --id', firstId);
  }

  // Test IMO filter: npx tsx scripts/test-datalogs-api.ts --imo 5000004
  const imoIdx = args.indexOf('--imo');
  const testIMO = imoIdx >= 0 && args[imoIdx + 1] ? args[imoIdx + 1] : '5000004';
  await testFilterByIMO(testIMO);

  console.log('\n================================');
  console.log('✅ Datalogs API test completed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
