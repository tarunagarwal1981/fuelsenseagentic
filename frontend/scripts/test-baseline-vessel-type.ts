/**
 * Test that baseline is restricted to speed 8–15 for non–container/LPG/LNG vessels.
 * 1) Fetches vessel_details for the vessel IMO and prints type.
 * 2) Fetches hull performance + chart data and checks baseline points are in [8, 15] when type is e.g. bulk carrier.
 *
 * Run from frontend: npx tsx scripts/test-baseline-vessel-type.ts
 * With vessel name:  npx tsx scripts/test-baseline-vessel-type.ts "Neptune Star"
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { VesselDetailsClient } from '@/lib/clients/vessel-details-client';
import { fetchHullPerformance } from '@/lib/tools/hull-performance/fetch-hull-performance';
import { SpeedConsumptionChartService } from '@/lib/services/charts/speed-consumption-chart-service';

const cwd = process.cwd();
config({ path: resolve(cwd, '.env') });
config({ path: resolve(cwd, '.env.local') });

const BASELINE_SPEED_MIN = 8;
const BASELINE_SPEED_MAX = 15;

const VESSEL_NAME = process.argv[2]?.trim() || 'Neptune Star';
const CORRELATION_ID = 'test-baseline-vessel-type';

function checkBaselineSpeedRange(
  label: string,
  points: Array<{ speed: number; consumption: number }>
): { inRange: boolean; minSpeed: number; maxSpeed: number; outOfRange: number } {
  if (points.length === 0) {
    return { inRange: true, minSpeed: 0, maxSpeed: 0, outOfRange: 0 };
  }
  const speeds = points.map((p) => p.speed);
  const minSpeed = Math.min(...speeds);
  const maxSpeed = Math.max(...speeds);
  const outOfRange = points.filter(
    (p) => p.speed < BASELINE_SPEED_MIN || p.speed > BASELINE_SPEED_MAX
  ).length;
  return {
    inRange: outOfRange === 0,
    minSpeed,
    maxSpeed,
    outOfRange,
  };
}

async function main() {
  console.log('\n🔍 Baseline vessel-type test (8–15 kts for non-container/LPG/LNG)');
  console.log('----------------------------------------------------------------');
  console.log('Vessel name:', VESSEL_NAME);
  console.log('');

  const hullResult = await fetchHullPerformance(
    { vessel_identifier: { name: VESSEL_NAME }, time_period: { days: 90 } },
    CORRELATION_ID
  );

  if (!hullResult.success || !hullResult.data) {
    console.log('❌ Hull fetch failed:', hullResult.error ?? hullResult.message);
    process.exit(1);
  }

  const analysis = hullResult.data;
  const imo = analysis.vessel?.imo?.trim() ?? '';
  console.log('IMO from hull analysis:', imo || '(empty)');
  console.log('');

  const vesselDetailsClient = new VesselDetailsClient();
  let vesselType = '';
  try {
    const vessel = imo ? await vesselDetailsClient.getByIMO(imo) : null;
    vesselType = vessel?.type ?? '(not fetched)';
    console.log('Vessel type from vessel_details:', vesselType);
  } catch (e) {
    console.log('Vessel details fetch error:', e instanceof Error ? e.message : String(e));
  }
  console.log('');

  const chartService = new SpeedConsumptionChartService(CORRELATION_ID);
  const chartData = await chartService.extractChartData(analysis);

  if (!chartData) {
    console.log('❌ Speed-consumption chart extraction returned null');
    process.exit(1);
  }

  const ballastBaseline = chartData.ballast.baseline.dataPoints;
  const ladenBaseline = chartData.laden.baseline.dataPoints;

  const ballastCheck = checkBaselineSpeedRange('Ballast baseline', ballastBaseline);
  const ladenCheck = checkBaselineSpeedRange('Laden baseline', ladenBaseline);

  console.log('Baseline speed range check (expected 8–15 kts for non-container/LPG/LNG):');
  console.log('  Ballast baseline: points=', ballastBaseline.length, ' minSpeed=', ballastCheck.minSpeed.toFixed(1), ' maxSpeed=', ballastCheck.maxSpeed.toFixed(1), ' outOfRange=', ballastCheck.outOfRange);
  console.log('  Laden baseline:  points=', ladenBaseline.length, ' minSpeed=', ladenCheck.minSpeed.toFixed(1), ' maxSpeed=', ladenCheck.maxSpeed.toFixed(1), ' outOfRange=', ladenCheck.outOfRange);
  console.log('');

  const isContainerOrLpgOrLng =
    /container|lpg\s*tanker|lng\s*tanker/i.test(vesselType);
  const expectRestricted = !isContainerOrLpgOrLng;

  if (expectRestricted && (ballastCheck.outOfRange > 0 || ladenCheck.outOfRange > 0)) {
    console.log('❌ FAIL: Vessel type is not container/LPG/LNG but baseline has points outside 8–15 kts.');
    process.exit(1);
  }

  if (expectRestricted && ballastCheck.inRange && ladenCheck.inRange) {
    console.log('✅ PASS: Baseline restricted to 8–15 kts for vessel type:', vesselType);
  } else if (isContainerOrLpgOrLng) {
    console.log('✅ Vessel is container/LPG/LNG: full baseline allowed (no 8–15 restriction).');
  }

  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
