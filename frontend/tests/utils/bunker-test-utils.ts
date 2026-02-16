/**
 * Test utilities for bunker agent and related tests.
 */

import type { BunkerQueryType } from '@/lib/types/bunker';
import type { VesselComparison } from '@/lib/types/bunker';
import {
  mockRouteData,
  mockAgentState,
  type BunkerQueryTypeForMock,
} from '@/tests/mocks/bunker-mocks';

/**
 * Create a mock state object for the given query type.
 * Delegates to mockAgentState and ensures route_data has waypoints.
 */
export function createMockState(queryType: BunkerQueryTypeForMock, overrides?: Record<string, unknown>): Record<string, unknown> {
  const route = mockRouteData(overrides?.route_data as Record<string, unknown> | undefined);
  return mockAgentState(queryType, {
    ...overrides,
    route_data: { ...route, waypoints: route.waypoints?.length ? route.waypoints : [{ lat: 1.26, lon: 103.82 }, { lat: 51.92, lon: 4.48 }] },
  } as any);
}

/**
 * Assert that a bunker analysis object has the expected shape and optional query type.
 */
export function assertBunkerAnalysis(
  analysis: unknown,
  expectedType?: BunkerQueryType
): asserts analysis is Record<string, unknown> {
  expect(analysis).toBeDefined();
  expect(typeof analysis).toBe('object');
  const a = analysis as Record<string, unknown>;
  expect(a.recommendations).toBeDefined();
  expect(Array.isArray(a.recommendations)).toBe(true);
  expect(a.best_option).toBeDefined();
  expect(a.analysis_summary).toBeDefined();
  if (expectedType) {
    expect(a.query_type).toBe(expectedType);
  }
}

/**
 * Compare vessel rankings: same order and same vessel ids.
 */
export function compareVesselRankings(
  actual: VesselComparison[],
  expectedOrder: string[]
): void {
  expect(actual.length).toBe(expectedOrder.length);
  actual.forEach((v, i) => {
    expect(v.vessel_id).toBe(expectedOrder[i]);
  });
}

/**
 * Validate that state messages array has at least the expected count and contains expected types.
 */
export function validateStateMessages(
  messages: unknown[] | undefined,
  expectedMinCount: number,
  expectedTypes?: string[]
): void {
  expect(messages).toBeDefined();
  expect(Array.isArray(messages)).toBe(true);
  expect((messages as unknown[]).length).toBeGreaterThanOrEqual(expectedMinCount);
  if (expectedTypes?.length) {
    const types = (messages as { _getType?: () => string }[]).map((m) => m._getType?.() ?? 'unknown');
    for (const t of expectedTypes) {
      expect(types).toContain(t);
    }
  }
}

/**
 * Round to 2 decimals for cost comparisons.
 */
export function roundCost(n: number): number {
  return Math.round(n * 100) / 100;
}
