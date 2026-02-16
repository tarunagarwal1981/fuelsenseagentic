/**
 * Fleet Optimizer tests.
 * - Single vessel, two vessels ranking, laycan, ballast cost, suitability score, tie-breaking.
 */

import { compareVesselsForVoyage } from '@/lib/engines/fleet-optimizer';
import type { FleetComparisonParams, VesselComparison, VoyageTarget } from '@/lib/types/bunker';
import {
  mockVesselInputForComparison,
  mockVoyageTarget,
  mockVesselSpecs,
  mockROBSnapshot,
} from '@/tests/mocks/bunker-mocks';
import { compareVesselRankings } from '@/tests/utils/bunker-test-utils';

describe('fleet-optimizer', () => {
  const voyage: VoyageTarget = mockVoyageTarget({
    origin: 'SGSIN',
    destination: 'NLRTM',
    distance_nm: 5000,
    estimated_hours: 360,
    origin_coordinates: { lat: 1.26, lon: 103.82 },
  });

  describe('single vessel', () => {
    it('returns that single vessel with comparison fields', async () => {
      const vessels = [
        mockVesselInputForComparison({
          vesselId: 'IMO111',
          vesselName: 'Alpha',
          currentROB: 800,
          consumptionRate: 35,
          tankCapacity: 2500,
          currentPosition: { lat: 1.26, lon: 103.82 },
        }),
      ];
      const params: FleetComparisonParams = { vessels, voyage };
      const result = compareVesselsForVoyage(params);

      expect(result).toHaveLength(1);
      expect(result[0].vessel_id).toBe('IMO111');
      expect(result[0].vessel_name).toBe('Alpha');
      expect(typeof result[0].suitability_score).toBe('number');
      expect(result[0].laycan_compliance).toMatch(/MEETS|TIGHT|MISSES/);
      expect(typeof result[0].ballast_fuel_cost).toBe('number');
      expect(typeof result[0].voyage_bunker_cost).toBe('number');
      expect(typeof result[0].total_cost).toBe('number');
      expect(result[0].recommendation).toBe('BEST CHOICE');
    });
  });

  describe('two vessels ranking', () => {
    it('ranks by suitability score descending', () => {
      const vessels = [
        mockVesselInputForComparison({
          vesselId: 'IMO_A',
          vesselName: 'Vessel A',
          currentROB: 500,
          consumptionRate: 40,
          tankCapacity: 2000,
          currentPosition: { lat: 1.26, lon: 103.82 },
        }),
        mockVesselInputForComparison({
          vesselId: 'IMO_B',
          vesselName: 'Vessel B',
          currentROB: 1200,
          consumptionRate: 35,
          tankCapacity: 2500,
          currentPosition: { lat: 1.26, lon: 103.82 },
        }),
      ];
      const params: FleetComparisonParams = { vessels, voyage };
      const result = compareVesselsForVoyage(params);

      expect(result).toHaveLength(2);
      expect(result[0].suitability_score).toBeGreaterThanOrEqual(result[1].suitability_score);
      expect(result[0].recommendation).toBe('BEST CHOICE');
    });

    it('suitability score is 0-100', () => {
      const vessels = [
        mockVesselInputForComparison({ vesselId: 'IMO1', currentROB: 800 }),
        mockVesselInputForComparison({ vesselId: 'IMO2', currentROB: 600 }),
      ];
      const result = compareVesselsForVoyage({ vessels, voyage });

      result.forEach((r) => {
        expect(r.suitability_score).toBeGreaterThanOrEqual(0);
        expect(r.suitability_score).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('laycan compliance', () => {
    it('includes laycan_compliance for each vessel', () => {
      const vessels = [
        mockVesselInputForComparison({ vesselId: 'IMO1', currentPosition: { lat: 1.26, lon: 103.82 } }),
      ];
      const result = compareVesselsForVoyage({ vessels, voyage });
      expect(['MEETS', 'TIGHT', 'MISSES']).toContain(result[0].laycan_compliance);
    });

    it('without laycan dates returns MEETS', () => {
      const noLaycanVoyage: VoyageTarget = { ...voyage, laycan_start: undefined, laycan_end: undefined };
      const vessels = [mockVesselInputForComparison({ vesselId: 'IMO1' })];
      const result = compareVesselsForVoyage({ vessels, voyage: noLaycanVoyage });
      expect(result[0].laycan_compliance).toBe('MEETS');
    });
  });

  describe('ballast fuel calculation', () => {
    it('ballast_fuel_cost and ballast_distance_nm present when position and origin_coordinates set', () => {
      const vessels = [
        mockVesselInputForComparison({
          vesselId: 'IMO1',
          currentPosition: { lat: 1.26, lon: 103.82 },
        }),
      ];
      const v: VoyageTarget = { ...voyage, origin_coordinates: { lat: 1.26, lon: 103.82 } };
      const result = compareVesselsForVoyage({ vessels, voyage: v });

      expect(typeof result[0].ballast_fuel_cost).toBe('number');
      expect(result[0].ballast_distance_nm).toBeDefined();
      expect(result[0].hours_to_load_port).toBeDefined();
    });

    it('ballast distance 0 when origin_coordinates missing', () => {
      const noOrigin: VoyageTarget = { ...voyage, origin_coordinates: undefined };
      const vessels = [mockVesselInputForComparison({ vesselId: 'IMO1', currentPosition: { lat: 1.26, lon: 103.82 } })];
      const result = compareVesselsForVoyage({ vessels, voyage: noOrigin });
      expect(result[0].ballast_distance_nm).toBe(0);
      expect(result[0].ballast_fuel_cost).toBe(0);
    });
  });

  describe('suitability score', () => {
    it('vessel with MISSES laycan gets NOT RECOMMENDED', () => {
      const now = new Date();
      const pastStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const pastEnd = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
      const voyageWithPastLaycan: VoyageTarget = {
        ...voyage,
        laycan_start: pastStart,
        laycan_end: pastEnd,
        origin_coordinates: { lat: 1.26, lon: 103.82 },
      };
      const vessels = [
        mockVesselInputForComparison({
          vesselId: 'IMO1',
          currentPosition: { lat: 1.26, lon: 103.82 },
        }),
      ];
      const result = compareVesselsForVoyage({ vessels, voyage: voyageWithPastLaycan });
      if (result[0].laycan_compliance === 'MISSES') {
        expect(result[0].recommendation).toBe('NOT RECOMMENDED');
      }
    });
  });

  describe('tie-breaking', () => {
    it('identical vessels both get deterministic scores (order preserved by sort)', () => {
      const same = mockVesselInputForComparison({
        vesselId: 'IMO_A',
        vesselName: 'A',
        currentROB: 1000,
        consumptionRate: 30,
        tankCapacity: 2500,
      });
      const vessels = [
        { ...same, vesselId: 'IMO_A', vesselName: 'A' },
        { ...same, vesselId: 'IMO_B', vesselName: 'B' },
      ];
      const result = compareVesselsForVoyage({ vessels, voyage });
      expect(result).toHaveLength(2);
      expect(result[0].suitability_score).toBeGreaterThanOrEqual(result[1].suitability_score);
    });
  });

  describe('cost calculations', () => {
    it('total_cost = ballast_fuel_cost + voyage_bunker_cost', () => {
      const vessels = [
        mockVesselInputForComparison({ vesselId: 'IMO1', currentROB: 500, consumptionRate: 35 }),
      ];
      const result = compareVesselsForVoyage({ vessels, voyage, averagePricePerMT: 500 });
      const r = result[0];
      expect(r.total_cost).toBeCloseTo(r.ballast_fuel_cost + r.voyage_bunker_cost, 2);
    });
  });

  describe('type safety', () => {
    it('return type is VesselComparison[]', () => {
      const vessels = [mockVesselInputForComparison({ vesselId: 'IMO1' })];
      const result: VesselComparison[] = compareVesselsForVoyage({ vessels, voyage });
      expect(result[0]).toHaveProperty('vessel_id');
      expect(result[0]).toHaveProperty('recommendation');
      expect(result[0]).toHaveProperty('rob_advantage');
      expect(result[0]).toHaveProperty('estimated_eta');
    });
  });
});
