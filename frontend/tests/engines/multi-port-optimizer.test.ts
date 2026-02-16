/**
 * Multi-Port Optimizer tests.
 * - Capacity split, price optimization, strategic, cost calculations, single port preferred, edge cases.
 */

import {
  shouldConsiderMultiPort,
  optimizeMultiPortBunkering,
  attachSavingsVsSingle,
} from '@/lib/engines/multi-port-optimizer';
import type { MultiPortParams, MultiPortStrategy, BunkerPortOption } from '@/lib/types/bunker';
import { mockBunkerPortOption } from '@/tests/mocks/bunker-mocks';

describe('multi-port-optimizer', () => {
  const twoPorts: BunkerPortOption[] = [
    mockBunkerPortOption({ port_code: 'SGSIN', port_name: 'Singapore', price_per_mt: 520, deviation_nm: 0 }),
    mockBunkerPortOption({ port_code: 'AEFJR', port_name: 'Fujairah', price_per_mt: 480, deviation_nm: 50 }),
  ];

  describe('shouldConsiderMultiPort', () => {
    it('returns false when port options < 2', () => {
      const result = shouldConsiderMultiPort(
        { bunkerQuantity: 3000, requiredFuel: 3000 },
        { tankCapacity: 2500 },
        [twoPorts[0]],
        undefined
      );
      expect(result).toBe(false);
    });

    it('returns true when total fuel > 80% of tank capacity', () => {
      const result = shouldConsiderMultiPort(
        { bunkerQuantity: 2500, requiredFuel: 2500 },
        { tankCapacity: 2500 },
        twoPorts,
        undefined
      );
      expect(result).toBe(true);
    });

    it('returns true when voyage duration > 20 days', () => {
      const result = shouldConsiderMultiPort(
        { bunkerQuantity: 500, requiredFuel: 1000 },
        { tankCapacity: 3000 },
        twoPorts,
        25
      );
      expect(result).toBe(true);
    });

    it('returns true when price difference between ports >= 5%', () => {
      const ports: BunkerPortOption[] = [
        mockBunkerPortOption({ price_per_mt: 400 }),
        mockBunkerPortOption({ price_per_mt: 450 }),
      ];
      const result = shouldConsiderMultiPort(
        { bunkerQuantity: 500, requiredFuel: 500 },
        { tankCapacity: 3000 },
        ports,
        undefined
      );
      expect(result).toBe(true);
    });

    it('returns false when capacity 0', () => {
      const result = shouldConsiderMultiPort(
        { bunkerQuantity: 1000, requiredFuel: 1000 },
        { tankCapacity: 0 },
        twoPorts,
        undefined
      );
      expect(result).toBe(false);
    });
  });

  describe('optimizeMultiPortBunkering', () => {
    it('returns null when availablePorts.length < 2', () => {
      const params: MultiPortParams = {
        totalFuelRequired: 2000,
        tankCapacity: 2500,
        currentROB: 500,
        availablePorts: [twoPorts[0]],
      };
      expect(optimizeMultiPortBunkering(params)).toBeNull();
    });

    it('capacity split scenario: fuel required exceeds tank space', () => {
      const params: MultiPortParams = {
        totalFuelRequired: 3000,
        tankCapacity: 2500,
        currentROB: 500,
        availablePorts: twoPorts,
        deviationCostPerNm: 2,
      };
      const result = optimizeMultiPortBunkering(params);
      expect(result).not.toBeNull();
      expect(result!.strategy_type).toBe('CAPACITY_SPLIT');
      expect(result!.ports).toHaveLength(2);
      const fillFirst = Math.min(2500 - 500, 3000);
      const fillSecond = Math.max(0, 3000 - fillFirst);
      expect(fillSecond).toBeGreaterThan(0);
      expect(result!.ports[0].bunker_quantity).toBeCloseTo(fillFirst, 0);
      expect(result!.ports[1].bunker_quantity).toBeCloseTo(fillSecond, 0);
    });

    it('price optimization scenario: two ports when fuel exceeds single-stop capacity', () => {
      const params: MultiPortParams = {
        totalFuelRequired: 2500,
        tankCapacity: 2500,
        currentROB: 500,
        availablePorts: twoPorts,
        deviationCostPerNm: 2,
      };
      const result = optimizeMultiPortBunkering(params);
      expect(result).not.toBeNull();
      expect(result!.ports.length).toBeGreaterThanOrEqual(1);
      expect(result!.total_bunker_cost).toBeGreaterThan(0);
      expect(result!.total_deviation_cost).toBeGreaterThanOrEqual(0);
    });

    it('cost calculations: total_cost = total_bunker_cost + total_deviation_cost', () => {
      const params: MultiPortParams = {
        totalFuelRequired: 3000,
        tankCapacity: 2500,
        currentROB: 500,
        availablePorts: twoPorts,
        deviationCostPerNm: 2,
      };
      const result = optimizeMultiPortBunkering(params);
      expect(result).not.toBeNull();
      expect(result!.total_cost).toBeCloseTo(
        result!.total_bunker_cost + result!.total_deviation_cost,
        2
      );
    });

    it('deviation cost included', () => {
      const portsWithDeviation: BunkerPortOption[] = [
        mockBunkerPortOption({ deviation_nm: 20, price_per_mt: 500 }),
        mockBunkerPortOption({ deviation_nm: 30, price_per_mt: 480 }),
      ];
      const params: MultiPortParams = {
        totalFuelRequired: 3000,
        tankCapacity: 2500,
        currentROB: 500,
        availablePorts: portsWithDeviation,
        deviationCostPerNm: 2,
      };
      const result = optimizeMultiPortBunkering(params);
      expect(result).not.toBeNull();
      expect(result!.total_deviation_cost).toBe((20 + 30) * 2);
    });

    it('returns null when total fuel fits in one stop (no multi-port benefit)', () => {
      const params: MultiPortParams = {
        totalFuelRequired: 1000,
        tankCapacity: 2500,
        currentROB: 500,
        availablePorts: twoPorts,
      };
      const result = optimizeMultiPortBunkering(params);
      expect(result).toBeNull();
    });
  });

  describe('attachSavingsVsSingle', () => {
    it('sets savings_vs_single_port when single cost is higher', () => {
      const strategy: MultiPortStrategy = {
        strategy_type: 'PRICE_OPTIMIZATION',
        ports: [],
        total_bunker_cost: 400000,
        total_deviation_cost: 100,
        total_cost: 400100,
        savings_vs_single_port: 0,
        time_impact_hours: 25,
        recommendation: 'Test',
      };
      const singlePortTotalCost = 450000;
      const out = attachSavingsVsSingle(strategy, singlePortTotalCost);
      expect(out.savings_vs_single_port).toBe(49900);
    });

    it('savings_vs_single_port is 0 when single is cheaper', () => {
      const strategy: MultiPortStrategy = {
        strategy_type: 'CAPACITY_SPLIT',
        ports: [],
        total_bunker_cost: 500000,
        total_deviation_cost: 200,
        total_cost: 500200,
        savings_vs_single_port: 0,
        time_impact_hours: 30,
        recommendation: 'Test',
      };
      const out = attachSavingsVsSingle(strategy, 400000);
      expect(out.savings_vs_single_port).toBe(0);
    });
  });

  describe('edge case: no multi-port benefit', () => {
    it('returns null when fuel fits in tank and one stop suffices', () => {
      const params: MultiPortParams = {
        totalFuelRequired: 800,
        tankCapacity: 2500,
        currentROB: 1200,
        availablePorts: twoPorts,
      };
      const result = optimizeMultiPortBunkering(params);
      expect(result).toBeNull();
    });
  });
});
