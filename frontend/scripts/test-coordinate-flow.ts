/**
 * Coordinate flow test script
 *
 * Verifies coordinate order consistency from ports → route API → waypoints → map.
 * Run from frontend: npx tsx scripts/test-coordinate-flow.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
const envPath = resolve(process.cwd(), '.env.local');
config({ path: envPath });

import { ServiceContainer } from '../lib/repositories/service-container';
import { validateCoordinates, arrayToObject } from '../lib/utils/coordinate-validator';

async function testCoordinateFlow() {
  const container = ServiceContainer.getInstance();
  const portRepo = container.getPortRepository();
  const routeService = container.getRouteService();

  console.log('🧪 [TEST] Starting coordinate flow test...\n');

  // Test 1: Port Lookup
  console.log('1️⃣ Testing Port Lookup:');
  const dubai = await portRepo.findByCode('AEJEA');
  const tokyo = await portRepo.findByCode('JPTYO');

  if (dubai && tokyo) {
    console.log('   Dubai (AEJEA):', dubai.coordinates, '← [lat, lon]');
    console.log('   Tokyo (JPTYO):', tokyo.coordinates, '← [lat, lon]');
    const dubaiObj = arrayToObject(dubai.coordinates);
    const tokyoObj = arrayToObject(tokyo.coordinates);
    console.log('   Dubai valid?', validateCoordinates(dubaiObj));
    console.log('   Tokyo valid?', validateCoordinates(tokyoObj));
  } else {
    console.log('   ❌ Port lookup failed (AEJEA:', !!dubai, ', JPTYO:', !!tokyo, ')');
    return;
  }

  // Test 2: Route Calculation
  console.log('\n2️⃣ Testing Route Calculation:');
  let route;
  try {
    route = await routeService.calculateRoute({
      origin: 'AEJEA',
      destination: 'JPTYO',
      speed: 14,
      departureDate: new Date(),
    });
  } catch (err) {
    console.error('   ❌ Route calculation failed:', err);
    return;
  }

  console.log('   Distance:', route.totalDistanceNm, 'nm');
  console.log('   Waypoints:', route.waypoints.length);
  const first = route.waypoints[0];
  const last = route.waypoints[route.waypoints.length - 1];
  console.log('   First waypoint:', first?.coordinates, '← [lat, lon]');
  console.log('   Last waypoint:', last?.coordinates, '← [lat, lon]');

  // Test 3: Validate Waypoints
  console.log('\n3️⃣ Validating Waypoints:');
  const invalidWaypoints = route.waypoints.filter((wp) => {
    const coords = arrayToObject(wp.coordinates);
    return !validateCoordinates(coords);
  });

  if (invalidWaypoints.length > 0) {
    console.error('   ❌ Found', invalidWaypoints.length, 'invalid waypoints');
    invalidWaypoints.slice(0, 3).forEach((wp, i) => {
      console.error('      Invalid waypoint', i, ':', wp.coordinates);
    });
  } else {
    console.log('   ✅ All waypoints valid ([lat, lon], in range)');
  }

  // Test 4: Origin/Destination coordinates for map
  console.log('\n4️⃣ Origin/Destination (for map):');
  console.log('   Origin:', route.origin.coordinates, '← { lat, lon }');
  console.log('   Destination:', route.destination.coordinates, '← { lat, lon }');
  console.log('   Origin valid?', validateCoordinates(route.origin.coordinates));
  console.log('   Destination valid?', validateCoordinates(route.destination.coordinates));

  console.log('\n✅ [TEST] Complete');
}

testCoordinateFlow().catch(console.error);
