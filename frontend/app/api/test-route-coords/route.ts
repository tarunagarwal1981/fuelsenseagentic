/**
 * Test endpoint to debug coordinate flow: Port lookup → Route calculation → Waypoint generation.
 * GET /api/test-route-coords
 * Tests AEJEA (Dubai) → JPTYO (Tokyo) and returns validation + first/last waypoint distances.
 */

import { ServiceContainer } from '@/lib/repositories/service-container';
import { haversineDistance } from '@/lib/utils/coordinate-validator';

export const runtime = 'nodejs';

export async function GET(_req: Request) {
  try {
    const container = ServiceContainer.getInstance();
    const portRepo = container.getPortRepository();
    const routeService = container.getRouteService();

    console.log('🧪 [TEST] Starting route coordinate test...');

    // Step 1: Lookup ports
    console.log('📍 [TEST] Step 1: Looking up ports...');
    const dubai = await portRepo.findByCode('AEJEA');
    const tokyo = await portRepo.findByCode('JPTYO');

    if (!dubai || !tokyo) {
      return Response.json({
        success: false,
        error: 'Ports not found',
        dubai: !!dubai,
        tokyo: !!tokyo,
      });
    }

    console.log('   Dubai coordinates:', dubai.coordinates);
    console.log('   Tokyo coordinates:', tokyo.coordinates);

    // Step 2: Calculate route
    console.log('📊 [TEST] Step 2: Calculating route...');
    const route = await routeService.calculateRoute({
      origin: 'AEJEA',
      destination: 'JPTYO',
      speed: 14,
      departureDate: new Date(),
    });

    console.log('   Route distance:', route.totalDistanceNm, 'nm');
    console.log('   Waypoint count:', route.waypoints.length);

    // Step 3: Validate waypoints
    console.log('✅ [TEST] Step 3: Validating waypoints...');

    const firstWp = route.waypoints[0];
    const lastWp = route.waypoints[route.waypoints.length - 1];

    const firstWpCoords = Array.isArray(firstWp.coordinates)
      ? { lat: firstWp.coordinates[0], lon: firstWp.coordinates[1] }
      : firstWp.coordinates;

    const lastWpCoords = Array.isArray(lastWp.coordinates)
      ? { lat: lastWp.coordinates[0], lon: lastWp.coordinates[1] }
      : lastWp.coordinates;

    const dubaiCoords = { lat: dubai.coordinates[0], lon: dubai.coordinates[1] };
    const tokyoCoords = { lat: tokyo.coordinates[0], lon: tokyo.coordinates[1] };

    const firstWpDistFromOrigin = haversineDistance(firstWpCoords, dubaiCoords);
    const lastWpDistFromDest = haversineDistance(lastWpCoords, tokyoCoords);

    console.log('   First WP distance from Dubai:', firstWpDistFromOrigin.toFixed(2), 'nm');
    console.log('   Last WP distance from Tokyo:', lastWpDistFromDest.toFixed(2), 'nm');

    // Return comprehensive debug info
    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      ports: {
        origin: {
          code: 'AEJEA',
          name: dubai.name,
          coordinates: dubai.coordinates,
        },
        destination: {
          code: 'JPTYO',
          name: tokyo.name,
          coordinates: tokyo.coordinates,
        },
      },
      route: {
        distance_nm: route.totalDistanceNm,
        duration_hours: route.estimatedHours,
        waypoint_count: route.waypoints.length,
        route_type: route.routeType,
      },
      waypoints: {
        first: {
          coordinates: firstWpCoords,
          distance_from_origin_nm: parseFloat(firstWpDistFromOrigin.toFixed(2)),
        },
        last: {
          coordinates: lastWpCoords,
          distance_from_destination_nm: parseFloat(lastWpDistFromDest.toFixed(2)),
        },
      },
      validation: {
        first_waypoint_valid: firstWpDistFromOrigin < 100,
        last_waypoint_valid: lastWpDistFromDest < 100,
        issues: [
          ...(firstWpDistFromOrigin > 100
            ? [`First waypoint ${firstWpDistFromOrigin.toFixed(0)}nm from origin (expected <100nm)`]
            : []),
          ...(lastWpDistFromDest > 100
            ? [`Last waypoint ${lastWpDistFromDest.toFixed(0)}nm from destination (expected <100nm)`]
            : []),
        ],
      },
    });
  } catch (error) {
    console.error('❌ [TEST] Error:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
