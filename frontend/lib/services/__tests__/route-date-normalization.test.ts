/**
 * Unit tests for cache date normalization (Fix #2).
 * Redis/JSON turns Date into string; normalizeDate/normalizeCachedRoute restore Date.
 * Uses tsx runner (no Jest dependency).
 */

import { fileURLToPath } from 'node:url';
import { normalizeDate, normalizeCachedRoute } from '../route.service';

const __filename = fileURLToPath(import.meta.url);

// ============================================================================
// Test Utilities
// ============================================================================

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✅ ${message}`);
    testsPassed++;
  } else {
    console.log(`  ❌ ${message}`);
    testsFailed++;
  }
}

// ============================================================================
// normalizeDate tests
// ============================================================================

function testNormalizeDateReturnsDateAsIs(): void {
  const date = new Date('2025-01-27T10:00:00Z');
  const result = normalizeDate(date);
  assert(result === date, 'returns Date as-is');
}

function testNormalizeDateConvertsIsoString(): void {
  const result = normalizeDate('2025-01-27T10:00:00Z');
  assert(result instanceof Date, 'ISO string becomes Date');
  assert(result.getTime() === new Date('2025-01-27T10:00:00Z').getTime(), 'ISO string parses correctly');
}

function testNormalizeDateHandlesNull(): void {
  const result = normalizeDate(null);
  assert(result.getTime() === 0, 'null yields epoch');
}

function testNormalizeDateHandlesInvalidString(): void {
  const result = normalizeDate('not-a-date');
  assert(result.getTime() === 0, 'invalid string yields epoch');
}

function testNormalizeDateHandlesEmptyString(): void {
  const result = normalizeDate('');
  assert(result.getTime() === 0, 'empty string yields epoch');
}

// ============================================================================
// normalizeCachedRoute tests
// ============================================================================

function testNormalizeCachedRouteNormalizesAllDateFields(): void {
  const cached = {
    origin: {} as any,
    destination: {} as any,
    waypoints: [],
    totalDistanceNm: 100,
    timeline: [
      {
        waypoint: {} as any,
        eta: '2025-01-27T10:00:00Z',
        distanceFromStartNm: 0,
      },
    ],
    ecaSegments: [
      {
        startWaypointIndex: 0,
        endWaypointIndex: 1,
        zoneName: 'ECA',
        distanceNm: 50,
        startTime: '2025-01-27T10:00:00Z',
        endTime: '2025-01-27T12:00:00Z',
      },
    ],
    estimatedHours: 24,
    routeType: 'direct',
  };

  const result = normalizeCachedRoute(cached as any);

  assert(result.timeline[0].eta instanceof Date, 'timeline[0].eta is Date');
  assert(result.ecaSegments[0].startTime instanceof Date, 'ecaSegments[0].startTime is Date');
  assert(result.ecaSegments[0].endTime instanceof Date, 'ecaSegments[0].endTime is Date');
}

function testNormalizeCachedRouteHandlesEmptyArrays(): void {
  const cached = {
    origin: {} as any,
    destination: {} as any,
    waypoints: [],
    totalDistanceNm: 100,
    timeline: [],
    ecaSegments: [],
    estimatedHours: 24,
    routeType: 'direct',
  };

  const result = normalizeCachedRoute(cached as any);

  assert(result.timeline.length === 0, 'timeline stays empty');
  assert(result.ecaSegments.length === 0, 'ecaSegments stays empty');
}

// ============================================================================
// Runner
// ============================================================================

export function runRouteDateNormalizationTests(): void {
  testsPassed = 0;
  testsFailed = 0;

  console.log('\n📋 Cache Date Normalization Tests');
  console.log('-'.repeat(50));

  console.log('\n  normalizeDate:');
  testNormalizeDateReturnsDateAsIs();
  testNormalizeDateConvertsIsoString();
  testNormalizeDateHandlesNull();
  testNormalizeDateHandlesInvalidString();
  testNormalizeDateHandlesEmptyString();

  console.log('\n  normalizeCachedRoute:');
  testNormalizeCachedRouteNormalizesAllDateFields();
  testNormalizeCachedRouteHandlesEmptyArrays();

  console.log('\n' + '='.repeat(50));
  console.log(`📊 Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('='.repeat(50));

  if (testsFailed > 0) {
    throw new Error(`${testsFailed} cache date normalization tests failed`);
  }
}

// Run if executed directly (tsx lib/services/__tests__/route-date-normalization.test.ts)
if (process.argv[1] === __filename || process.argv[1]?.endsWith('route-date-normalization.test.ts')) {
  try {
    runRouteDateNormalizationTests();
    console.log('\n✅ All cache date normalization tests passed!');
    process.exit(0);
  } catch (err: unknown) {
    console.error('\n❌ Tests failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
