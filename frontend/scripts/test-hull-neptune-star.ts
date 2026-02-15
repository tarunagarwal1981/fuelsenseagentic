/**
 * Test hull performance fetch by vessel name "Neptune Star".
 * Verifies: (1) we get hull data by name, (2) vessel_imo on records, (3) baseline_curves.
 *
 * Run from frontend: npx tsx scripts/test-hull-neptune-star.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { fetchHullPerformance } from '@/lib/tools/hull-performance/fetch-hull-performance';

const cwd = process.cwd();
config({ path: resolve(cwd, '.env') });
config({ path: resolve(cwd, '.env.local') });

const VESSEL_NAME = 'Neptune Star';
const CORRELATION_ID = 'test-neptune-star';

async function main() {
  console.log('\n🔍 Hull performance test: vessel by name');
  console.log('----------------------------------------');
  console.log('Vessel name:', VESSEL_NAME);
  console.log('HULL_PERFORMANCE_SOURCE:', process.env.HULL_PERFORMANCE_SOURCE ?? '(not set, default api)');
  console.log('');

  const result = await fetchHullPerformance(
    {
      vessel_identifier: { name: VESSEL_NAME },
      time_period: { days: 90 },
    },
    CORRELATION_ID
  );

  if (!result.success) {
    console.log('❌ Fetch failed:', result.error ?? result.message ?? 'Unknown error');
    process.exit(1);
  }

  const data = result.data!;
  console.log('✅ Fetch succeeded');
  console.log('');
  console.log('Vessel (from analysis):', data.vessel);
  console.log('  → IMO used for display:', data.vessel.imo || '(empty)');
  console.log('  → Name:', data.vessel.name || '(empty)');
  console.log('');
  console.log('Hull condition:', data.hull_condition);
  console.log('Trend data points:', data.trend_data?.length ?? 0);
  if (data.trend_data?.length) {
    const first = data.trend_data[0] as { vessel_imo?: number; vessel_name?: string; date?: string } | undefined;
    console.log('  → First trend point vessel_imo:', first?.vessel_imo ?? '(n/a)');
  }
  console.log('');
  const baseline = data.baseline_curves;
  if (!baseline) {
    console.log('Baseline curves: ❌ not present (undefined)');
  } else {
    const ballast = baseline.ballast?.length ?? 0;
    const laden = baseline.laden?.length ?? 0;
    console.log('Baseline curves: ✅ present');
    console.log('  → Ballast points:', ballast);
    console.log('  → Laden points:', laden);
  }
  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
