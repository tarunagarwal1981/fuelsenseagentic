/**
 * Test Bunker Pricing API by port name (e.g. Singapore).
 * Verifies that the API returns price data when queried by port name.
 * Use --raw to dump the API response shape (no filter, first 5 rows).
 *
 * Run from frontend: npx tsx scripts/test-bunker-api.ts [Port Name]
 * Raw dump:         npx tsx scripts/test-bunker-api.ts --raw
 */

import { config } from 'dotenv';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env.local');
config({ path: envPath });

import { RequestQueryBuilder, CondOperator } from '@nestjsx/crud-request';
import { BunkerPricingClient } from '@/lib/clients/bunker-pricing-client';

async function rawDump(baseURL: string, withFilter = false) {
  const qb = RequestQueryBuilder.create()
    .setLimit(withFilter ? 200 : 10)
    .sortBy({ field: 'date', order: 'DESC' });
  if (withFilter) {
    qb.setFilter({ field: 'port', operator: CondOperator.EQUALS, value: 'Singapore' });
  }
  const queryString = qb.query();
  const url = `${baseURL.replace(/\/$/, '')}/bunker-pricing${queryString ? '?' + queryString : ''}`;
  console.log('Raw GET:', url);
  console.log('');
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const body = await res.json();
  if (!res.ok) {
    console.log('HTTP', res.status, body);
    return;
  }
  const isArray = Array.isArray(body);
  const data = isArray ? body : (body as { data?: unknown }).data;
  const rows = Array.isArray(data) ? data : [];
  console.log('Response type:', isArray ? 'array' : typeof body);
  console.log('Top-level keys:', isArray ? '(array)' : Object.keys(body as object));
  console.log('Row count (this page):', rows.length);
  if (rows.length > 0) {
    console.log('First row keys:', Object.keys(rows[0] as object));
    console.log('First row (sample):', JSON.stringify(rows[0], null, 2));
    if (rows.length > 1) console.log('Second row (sample):', JSON.stringify(rows[1], null, 2));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const raw = args.includes('--raw');
  const portName = args.filter((a) => a !== '--raw' && a !== '--filter')[0]?.trim() || 'Singapore';
  const baseURL =
    process.env.NEXT_PUBLIC_FUELSENSE_API_URL ||
    process.env.BUNKER_PRICING_API_URL ||
    'https://uat.fuelsense-api.dexpertsystems.com/api';

  const base = baseURL.replace(/\/$/, '');
  console.log('Bunker Pricing API – test by port name');
  console.log('======================================');
  console.log(`Base URL: ${base}`);
  console.log(`Port name: ${portName}`);
  if (raw) console.log('Mode: raw response dump. Add --filter to include port=Singapore filter.');
  console.log('');

  if (raw) {
    try {
      const withFilter = args.includes('--filter');
      await rawDump(base, withFilter);
    } catch (err) {
      console.error('Raw fetch error:', err);
      process.exitCode = 1;
    }
    return;
  }

  const client = new BunkerPricingClient();
  try {
    const prices = await client.getByPortName(portName);
    if (prices.length === 0) {
      console.log('Result: No price rows returned for this port name.');
      console.log('Run with --raw to see actual API response shape.');
      process.exitCode = 1;
      return;
    }
    console.log(`Result: ${prices.length} price row(s) (latest per fuel type):`);
    for (const p of prices) {
      console.log(`  - ${p.fuelType}: $${p.priceUSD}/MT (date: ${p.date})`);
    }
    console.log('');
    console.log('API is returning data for this port name.');
  } catch (err) {
    console.error('Error calling API:', err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

main();
