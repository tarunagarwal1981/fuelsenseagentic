/**
 * ROB (Remaining on Board) Calculator tests.
 * - Basic calculation, zero ROB, high ROB, safety margin, weather factor, ECA, edge cases.
 */

import { calculateBunkerRequirement } from '@/lib/engines/rob-calculator';
import type { ROBCalculationParams, BunkerRequirement } from '@/lib/types/bunker';

describe('rob-calculator', () => {
  const baseParams: ROBCalculationParams = {
    currentROB: 500,
    vesselConsumption: 40,
    routeDistance: 3360,
    routeEstimatedHours: 240,
    weatherFactor: 1.1,
    safetyMargin: 0.15,
    speedKnots: 14,
  };

  describe('basic ROB calculation', () => {
    it('returns correct types and required fuel > voyage consumption', () => {
      const result = calculateBunkerRequirement(baseParams);

      expect(result).toMatchObject({
        needsBunkering: expect.any(Boolean),
        safetyMarginApplied: 0.15,
        weatherFactorApplied: 1.1,
      });
      expect(typeof result.voyageFuelConsumption).toBe('number');
      expect(typeof result.requiredFuel).toBe('number');
      expect(typeof result.bunkerQuantity).toBe('number');
      expect(result.requiredFuel).toBeGreaterThanOrEqual(result.voyageFuelConsumption);
      expect(result.voyageFuelConsumption).toBeGreaterThan(0);
    });

    it('voyage days from routeEstimatedHours when provided', () => {
      const result = calculateBunkerRequirement(baseParams);
      const expectedDays = 240 / 24;
      const expectedVoyageConsumption = expectedDays * 40 * 1.1;
      expect(result.voyageFuelConsumption).toBeCloseTo(expectedVoyageConsumption, 2);
      expect(result.requiredFuel).toBeCloseTo(expectedVoyageConsumption * 1.15, 2);
    });

    it('bunkerQuantity = max(0, requiredFuel - currentROB)', () => {
      const result = calculateBunkerRequirement(baseParams);
      const expectedRequired = result.voyageFuelConsumption * 1.15;
      expect(result.requiredFuel).toBeCloseTo(expectedRequired, 2);
      expect(result.bunkerQuantity).toBeCloseTo(Math.max(0, expectedRequired - 500), 2);
    });
  });

  describe('zero ROB', () => {
    it('full bunker needed when currentROB is 0', () => {
      const result = calculateBunkerRequirement({
        ...baseParams,
        currentROB: 0,
      });

      expect(result.needsBunkering).toBe(true);
      expect(result.bunkerQuantity).toBeCloseTo(result.requiredFuel, 2);
      expect(result.bunkerQuantity).toBeGreaterThan(0);
    });
  });

  describe('high ROB', () => {
    it('minimal or zero bunker when ROB exceeds required', () => {
      const result = calculateBunkerRequirement({
        ...baseParams,
        currentROB: 5000,
      });

      expect(result.bunkerQuantity).toBe(0);
      expect(result.needsBunkering).toBe(false);
      expect(result.requiredFuel).toBeGreaterThan(0);
    });

    it('small bunker when ROB slightly below required', () => {
      const result = calculateBunkerRequirement({
        ...baseParams,
        currentROB: 2499,
        routeEstimatedHours: 240,
      });
      const expectedRequired = (240 / 24) * 40 * 1.1 * 1.15;
      expect(result.requiredFuel).toBeCloseTo(expectedRequired, 0);
      expect(result.bunkerQuantity).toBeCloseTo(Math.max(0, expectedRequired - 2499), 0);
      expect(result.bunkerQuantity).toBeLessThan(500);
    });
  });

  describe('safety margin', () => {
    it('applies 15% default safety margin', () => {
      const result = calculateBunkerRequirement({
        ...baseParams,
        currentROB: 0,
        safetyMargin: 0.15,
      });
      expect(result.safetyMarginApplied).toBe(0.15);
      expect(result.requiredFuel).toBeCloseTo(result.voyageFuelConsumption * 1.15, 2);
    });

    it('applies custom safety margin', () => {
      const result = calculateBunkerRequirement({
        ...baseParams,
        currentROB: 0,
        safetyMargin: 0.2,
      });
      expect(result.safetyMarginApplied).toBe(0.2);
      expect(result.requiredFuel).toBeCloseTo(result.voyageFuelConsumption * 1.2, 2);
    });

    it('zero safety margin when explicitly 0', () => {
      const result = calculateBunkerRequirement({
        ...baseParams,
        currentROB: 0,
        safetyMargin: 0,
      });
      expect(result.requiredFuel).toBeCloseTo(result.voyageFuelConsumption, 2);
    });
  });

  describe('weather factor', () => {
    it('default weather factor 1.1 increases consumption', () => {
      const result = calculateBunkerRequirement({
        ...baseParams,
        weatherFactor: 1.1,
      });
      expect(result.weatherFactorApplied).toBe(1.1);
      const baseConsumption = (240 / 24) * 40;
      expect(result.voyageFuelConsumption).toBeCloseTo(baseConsumption * 1.1, 2);
    });

    it('higher weather factor increases required fuel', () => {
      const normal = calculateBunkerRequirement({ ...baseParams, weatherFactor: 1.0 });
      const heavy = calculateBunkerRequirement({ ...baseParams, weatherFactor: 1.2 });
      expect(heavy.voyageFuelConsumption).toBeGreaterThan(normal.voyageFuelConsumption);
      expect(heavy.requiredFuel).toBeGreaterThan(normal.requiredFuel);
    });
  });

  describe('ECA distance', () => {
    it('passes through ecaDistanceUsed when ecaDistance provided', () => {
      const result = calculateBunkerRequirement({
        ...baseParams,
        ecaDistance: 120,
      });
      expect(result.ecaDistanceUsed).toBe(120);
    });

    it('ecaDistanceUsed undefined when not provided', () => {
      const result = calculateBunkerRequirement(baseParams);
      expect(result.ecaDistanceUsed).toBeUndefined();
    });
  });

  describe('voyage time from distance/speed', () => {
    it('uses routeDistance and speedKnots when routeEstimatedHours not set', () => {
      const result = calculateBunkerRequirement({
        currentROB: 0,
        vesselConsumption: 30,
        routeDistance: 3360,
        speedKnots: 14,
      });
      const expectedHours = 3360 / 14;
      const expectedDays = expectedHours / 24;
      const expectedConsumption = expectedDays * 30 * 1.1;
      expect(result.voyageFuelConsumption).toBeCloseTo(expectedConsumption, 2);
    });

    it('prefers routeEstimatedHours when provided', () => {
      const withHours = calculateBunkerRequirement({
        ...baseParams,
        routeEstimatedHours: 200,
        routeDistance: 10000,
      });
      const expectedConsumption = (200 / 24) * 40 * 1.1;
      expect(withHours.voyageFuelConsumption).toBeCloseTo(expectedConsumption, 2);
    });
  });

  describe('edge cases', () => {
    it('zero route distance yields zero consumption and zero bunker', () => {
      const result = calculateBunkerRequirement({
        ...baseParams,
        routeDistance: 0,
        routeEstimatedHours: 0,
        currentROB: 0,
      });
      expect(result.voyageFuelConsumption).toBe(0);
      expect(result.requiredFuel).toBe(0);
      expect(result.bunkerQuantity).toBe(0);
      expect(result.needsBunkering).toBe(false);
    });

    it('negative currentROB is clamped to zero bunker quantity (formula uses max(0, required - currentROB))', () => {
      const result = calculateBunkerRequirement({
        ...baseParams,
        currentROB: -100,
      });
      expect(result.bunkerQuantity).toBeGreaterThan(result.requiredFuel);
      expect(result.needsBunkering).toBe(true);
    });

    it('excessive consumption still produces finite required fuel', () => {
      const result = calculateBunkerRequirement({
        currentROB: 0,
        vesselConsumption: 500,
        routeDistance: 10000,
        routeEstimatedHours: 500,
        speedKnots: 14,
      });
      expect(Number.isFinite(result.requiredFuel)).toBe(true);
      expect(result.requiredFuel).toBeGreaterThan(0);
      expect(result.bunkerQuantity).toBe(result.requiredFuel);
    });
  });

  describe('type safety', () => {
    it('return type satisfies BunkerRequirement', () => {
      const result: BunkerRequirement = calculateBunkerRequirement(baseParams);
      expect(result).toHaveProperty('voyageFuelConsumption');
      expect(result).toHaveProperty('requiredFuel');
      expect(result).toHaveProperty('bunkerQuantity');
      expect(result).toHaveProperty('needsBunkering');
      expect(result).toHaveProperty('safetyMarginApplied');
      expect(result).toHaveProperty('weatherFactorApplied');
    });
  });
});
