/**
 * Hull Performance Test Utilities
 *
 * Mock factories and helpers for hull performance tests.
 * Use these in all hull performance tests for consistency.
 */

import type {
  HullPerformanceRecord,
  VesselPerformanceModelRecord,
} from '@/lib/api-clients/hull-performance-client';

// ---------------------------------------------------------------------------
// 1. Mock API Response Builders
// ---------------------------------------------------------------------------

export function buildMockHullPerformanceResponse(
  overrides?: Partial<HullPerformanceRecord>
): HullPerformanceRecord {
  return {
    id: 1,
    vessel_imo: 9876543,
    vessel_name: 'OCEAN PRIDE',
    report_date: '2024-12-01T00:00:00Z',
    utc_date_time: '2024-12-01T00:00:00Z',
    hull_roughness_power_loss: 18.5,
    hull_roughness_speed_loss: 3.2,
    hull_excess_fuel_oil: 12.5,
    hull_excess_fuel_oil_mtd: 2.4,
    speed: 14.5,
    consumption: 45.2,
    predicted_consumption: 42.8,
    distance_travelled_actual: 350,
    steaming_time_hrs: 24,
    windforce: 4,
    weather_category: 'Moderate',
    loading_condition: 'Laden',
    displacement: 75000,
    total_cargo: 50000,
    engine_power_loss: 5.2,
    propeller_fouling_power_loss: 3.1,
    engine_speed_loss: 1.5,
    propeller_fouling_speed_loss: 0.8,
    hull_cii_impact: 0.12,
    engine_cii_impact: 0.05,
    propeller_cii_impact: 0.03,
    expected_power: 8500,
    reported_me_power: 10000,
    predicted_me_power: 8500,
    normalised_consumption: 43.5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 2. Time Series Builder
// ---------------------------------------------------------------------------

export function buildMockTimeSeriesData(
  days: number,
  startDate: Date = new Date()
): HullPerformanceRecord[] {
  const records: HullPerformanceRecord[] = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() - i);

    // Simulate gradual performance degradation
    const excessPower = 10 + (i / days) * 15; // 10% to 25% degradation

    records.push(
      buildMockHullPerformanceResponse({
        report_date: date.toISOString(),
        utc_date_time: date.toISOString(),
        hull_roughness_power_loss: excessPower,
        hull_excess_fuel_oil_mtd: excessPower * 0.15,
      })
    );
  }

  return records;
}

// ---------------------------------------------------------------------------
// 3. Baseline Curve Builder
// ---------------------------------------------------------------------------

export function buildMockBaselineCurves(
  vesselImo: number
): VesselPerformanceModelRecord[] {
  const speeds = [10, 11, 12, 13, 14, 15, 16];
  const curves: VesselPerformanceModelRecord[] = [];

  speeds.forEach((speed, index) => {
    // Laden condition
    curves.push({
      id: index * 2 + 1,
      vessel_imo: vesselImo,
      speed_kts: speed,
      me_consumption_: 30 + (speed - 10) * 5, // Simple linear model
      me_power_kw: 6000 + (speed - 10) * 1000,
      beaufort_scale: 1,
      displacement: 75000,
      load_type: 'Laden',
      deadweight: 50000,
      sfoc: 180,
      me_rpm: 80 + speed * 2,
      sea_trial_rpm: 100,
    });

    // Ballast condition
    curves.push({
      id: index * 2 + 2,
      vessel_imo: vesselImo,
      speed_kts: speed,
      me_consumption_: 25 + (speed - 10) * 4, // Lower consumption in ballast
      me_power_kw: 5000 + (speed - 10) * 900,
      beaufort_scale: 1,
      displacement: 25000,
      load_type: 'Ballast',
      deadweight: 50000,
      sfoc: 175,
      me_rpm: 80 + speed * 2,
      sea_trial_rpm: 100,
    });
  });

  return curves;
}

// ---------------------------------------------------------------------------
// 4. Redis Mock Helper
// ---------------------------------------------------------------------------

export function createMockRedisClient(): {
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
  clear: () => void;
} {
  const store = new Map<string, string>();

  return {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string, ..._args: unknown[]) => {
      store.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    clear: () => store.clear(),
  };
}

// ---------------------------------------------------------------------------
// 5. Correlation ID Generator
// ---------------------------------------------------------------------------

export function generateTestCorrelationId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
