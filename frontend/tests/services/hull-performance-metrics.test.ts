/**
 * Hull Performance Metrics Service Unit Tests
 *
 * Tests for getExcessPowerAndSpeedLossFromBestFit:
 * - Empty list returns 0/0
 * - Single point returns that point's value
 * - Two or more points: last y of linear regression
 * - 6-month window filter
 */

import { getExcessPowerAndSpeedLossFromBestFit } from '@/lib/services/hull-performance-metrics';
import { buildMockHullPerformanceResponse } from '@/tests/utils/hull-performance-test-utils';

describe('getExcessPowerAndSpeedLossFromBestFit', () => {
  it('returns 0/0 for empty records', () => {
    const result = getExcessPowerAndSpeedLossFromBestFit([]);
    expect(result.excessPowerPct).toBe(0);
    expect(result.speedLossPct).toBe(0);
  });

  it('returns single point value when only one valid point in window', () => {
    const record = buildMockHullPerformanceResponse({
      report_date: '2025-01-15T00:00:00Z',
      hull_roughness_power_loss: 12,
      hull_roughness_speed_loss: 2.5,
    });
    const result = getExcessPowerAndSpeedLossFromBestFit([record], {
      months: 6,
    });
    expect(result.excessPowerPct).toBe(12);
    expect(result.speedLossPct).toBe(2.5);
  });

  it('returns last y of linear regression when two or more points', () => {
    const r1 = buildMockHullPerformanceResponse({
      report_date: '2025-01-10T00:00:00Z',
      hull_roughness_power_loss: 8,
      hull_roughness_speed_loss: 1,
    });
    const r2 = buildMockHullPerformanceResponse({
      report_date: '2025-01-15T00:00:00Z',
      hull_roughness_power_loss: 12,
      hull_roughness_speed_loss: 3,
    });
    const result = getExcessPowerAndSpeedLossFromBestFit([r1, r2], {
      months: 6,
    });
    // Linear fit through (t1, 8) and (t2, 12): line passes through both; last y = 12
    expect(result.excessPowerPct).toBeCloseTo(12, 5);
    // Same for speed loss: last y = 3
    expect(result.speedLossPct).toBeCloseTo(3, 5);
  });

  it('uses last y of best-fit for three points with trend', () => {
    const base = new Date('2025-03-01T00:00:00Z').getTime();
    const day = 24 * 60 * 60 * 1000;
    const records = [
      buildMockHullPerformanceResponse({
        report_date: new Date(base).toISOString(),
        hull_roughness_power_loss: 10,
        hull_roughness_speed_loss: 2,
      }),
      buildMockHullPerformanceResponse({
        report_date: new Date(base + 30 * day).toISOString(),
        hull_roughness_power_loss: 15,
        hull_roughness_speed_loss: 3,
      }),
      buildMockHullPerformanceResponse({
        report_date: new Date(base + 60 * day).toISOString(),
        hull_roughness_power_loss: 20,
        hull_roughness_speed_loss: 4,
      }),
    ];
    const result = getExcessPowerAndSpeedLossFromBestFit(records, {
      months: 6,
    });
    // Linear regression: slope = 10/60 days in value per ms; at last x, y = 20
    expect(result.excessPowerPct).toBeCloseTo(20, 5);
    expect(result.speedLossPct).toBeCloseTo(4, 5);
  });

  it('filters to last N months from latest report_date', () => {
    const old = buildMockHullPerformanceResponse({
      report_date: '2024-06-01T00:00:00Z',
      hull_roughness_power_loss: 100,
      hull_roughness_speed_loss: 50,
    });
    const recent = buildMockHullPerformanceResponse({
      report_date: '2025-01-15T00:00:00Z',
      hull_roughness_power_loss: 5,
      hull_roughness_speed_loss: 2,
    });
    const result = getExcessPowerAndSpeedLossFromBestFit([old, recent], {
      months: 6,
    });
    // Only "recent" is within 6 months of 2025-01-15; so single point -> 5 and 2
    expect(result.excessPowerPct).toBe(5);
    expect(result.speedLossPct).toBe(2);
  });

  it('skips invalid or NaN values and uses remaining points', () => {
    const r1 = buildMockHullPerformanceResponse({
      report_date: '2025-01-10T00:00:00Z',
      hull_roughness_power_loss: 10,
      hull_roughness_speed_loss: 2,
    });
    const r2 = buildMockHullPerformanceResponse({
      report_date: '2025-01-15T00:00:00Z',
      hull_roughness_power_loss: 14,
      hull_roughness_speed_loss: 3,
    });
    const rNaN = buildMockHullPerformanceResponse({
      report_date: '2025-01-12T00:00:00Z',
      hull_roughness_power_loss: Number.NaN,
      hull_roughness_speed_loss: 2.5,
    });
    const result = getExcessPowerAndSpeedLossFromBestFit([r1, rNaN, r2], {
      months: 6,
    });
    // Excess power: r1 and r2 only (rNaN skipped); last y = 14
    expect(result.excessPowerPct).toBeCloseTo(14, 5);
    // Speed loss: all three valid; regression over 3 points, last y near 3
    expect(result.speedLossPct).toBeCloseTo(3, 1);
  });

  it('defaults to 6 months when options omitted', () => {
    const record = buildMockHullPerformanceResponse({
      report_date: '2025-01-15T00:00:00Z',
      hull_roughness_power_loss: 7,
      hull_roughness_speed_loss: 1.5,
    });
    const result = getExcessPowerAndSpeedLossFromBestFit([record]);
    expect(result.excessPowerPct).toBe(7);
    expect(result.speedLossPct).toBe(1.5);
  });

  it('excludes zeros before regression (same as chart)', () => {
    const base = new Date('2025-03-01T00:00:00Z').getTime();
    const day = 24 * 60 * 60 * 1000;
    const records = [
      buildMockHullPerformanceResponse({
        report_date: new Date(base).toISOString(),
        hull_roughness_power_loss: 10,
        hull_roughness_speed_loss: 2,
      }),
      buildMockHullPerformanceResponse({
        report_date: new Date(base + 30 * day).toISOString(),
        hull_roughness_power_loss: 0,
        hull_roughness_speed_loss: 0,
      }),
      buildMockHullPerformanceResponse({
        report_date: new Date(base + 60 * day).toISOString(),
        hull_roughness_power_loss: 20,
        hull_roughness_speed_loss: 4,
      }),
    ];
    const result = getExcessPowerAndSpeedLossFromBestFit(records, { months: 6 });
    // Regression over (t1, 10) and (t3, 20) only; last y = 20
    expect(result.excessPowerPct).toBeCloseTo(20, 5);
    expect(result.speedLossPct).toBeCloseTo(4, 5);
  });

  it('excludes IQR outliers before regression (same as chart, 3x threshold)', () => {
    const base = new Date('2025-03-01T00:00:00Z').getTime();
    const day = 24 * 60 * 60 * 1000;
    const records = [
      buildMockHullPerformanceResponse({
        report_date: new Date(base).toISOString(),
        hull_roughness_power_loss: 10,
        hull_roughness_speed_loss: 2,
      }),
      buildMockHullPerformanceResponse({
        report_date: new Date(base + 15 * day).toISOString(),
        hull_roughness_power_loss: 11,
        hull_roughness_speed_loss: 2.1,
      }),
      buildMockHullPerformanceResponse({
        report_date: new Date(base + 30 * day).toISOString(),
        hull_roughness_power_loss: 12,
        hull_roughness_speed_loss: 2.2,
      }),
      buildMockHullPerformanceResponse({
        report_date: new Date(base + 45 * day).toISOString(),
        hull_roughness_power_loss: 13,
        hull_roughness_speed_loss: 2.3,
      }),
      buildMockHullPerformanceResponse({
        report_date: new Date(base + 60 * day).toISOString(),
        hull_roughness_power_loss: 200,
        hull_roughness_speed_loss: 50,
      }),
    ];
    const result = getExcessPowerAndSpeedLossFromBestFit(records, { months: 6 });
    // With 5 points, Q1/Q3 from 10,11,12,13; 200 is outlier. Regression over first four only.
    expect(result.excessPowerPct).toBeLessThan(25);
    expect(result.speedLossPct).toBeLessThan(5);
  });
});
