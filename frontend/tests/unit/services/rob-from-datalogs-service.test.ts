/**
 * Unit tests for rob-from-datalogs-service.
 * getCurrentStateFromDatalogs: maps DatalogRow to VesselCurrentState with correct current_rob.
 */

import type { DatalogRow } from '@/lib/clients/datalogs-client';
import {
  getCurrentStateFromDatalogs,
  getRobFromDatalogs,
} from '@/lib/services/rob-from-datalogs-service';

declare global {
  var __datalogsMockGetLatest: jest.Mock;
}

jest.mock('@/lib/clients/datalogs-client', () => {
  const fn = jest.fn();
  global.__datalogsMockGetLatest = fn;
  return {
    DatalogsClient: jest.fn().mockImplementation(() => ({
      getLatestRawByIMO: fn,
    })),
  };
});

function getMock(): jest.Mock {
  return global.__datalogsMockGetLatest;
}

describe('rob-from-datalogs-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCurrentStateFromDatalogs', () => {
    it('returns null for empty IMO', async () => {
      expect(await getCurrentStateFromDatalogs('')).toBeNull();
      expect(await getCurrentStateFromDatalogs('   ')).toBeNull();
      expect(getMock()).not.toHaveBeenCalled();
    });

    it('returns null when API returns no row', async () => {
      getMock().mockResolvedValueOnce(null);

      const result = await getCurrentStateFromDatalogs('1234567');

      expect(result).toBeNull();
      expect(getMock()).toHaveBeenCalledWith('1234567');
    });

    it('maps DatalogRow to VesselCurrentState with correct current_rob', async () => {
      const mockRow: DatalogRow = {
        VESSEL_IMO: '9123456',
        VESSEL_NAME: 'Test Vessel',
        REPORT_DATE: '2025-02-15T12:00:00Z',
        UTC_DATE_TIME: '2025-02-15T12:00:00Z',
        ROB_VLSFO: 450,
        ROB_LSMGO: 80,
        FROM_PORT: 'Singapore',
        TO_PORT: 'Rotterdam',
        LATITUDE: 1.28,
        LONGITUDE: 103.85,
        DISTANCETOGO: 1200,
      };
      getMock().mockResolvedValueOnce(mockRow);

      const result = await getCurrentStateFromDatalogs('9123456');

      expect(result).not.toBeNull();
      expect(result!.vessel_imo).toBe('9123456');
      expect(result!.vessel_name).toBe('Test Vessel');
      expect(result!.current_rob).toEqual({
        VLSFO: 450,
        LSMGO: 80,
      });
      expect(result!.current_voyage.from_port).toBe('Singapore');
      expect(result!.current_voyage.to_port).toBe('Rotterdam');
      expect(result!.current_position.latitude).toBe(1.28);
      expect(result!.current_position.longitude).toBe(103.85);
      expect(result!.last_report_date).toEqual(new Date('2025-02-15T12:00:00Z'));
    });

    it('includes optional ROB fields when non-zero', async () => {
      const mockRow: DatalogRow = {
        VESSEL_IMO: '9123456',
        VESSEL_NAME: 'Test',
        REPORT_DATE: '2025-02-15T12:00:00Z',
        ROB_VLSFO: 100,
        ROB_LSMGO: 20,
        ROB_MDO: 5,
        ROB_HSFO: 10,
      };
      getMock().mockResolvedValueOnce(mockRow);

      const result = await getCurrentStateFromDatalogs('9123456');

      expect(result!.current_rob).toMatchObject({
        VLSFO: 100,
        LSMGO: 20,
        MDO: 5,
        HSFO: 10,
      });
    });
  });

  describe('getRobFromDatalogs', () => {
    it('returns null when policy rob_source is not datalogs', async () => {
      const result = await getRobFromDatalogs('9123456', null);
      expect(result).toBeNull();

      const result2 = await getRobFromDatalogs('9123456', {
        id: 'bunker',
        domain: 'bunker',
        rob_source: 'other',
      } as any);
      expect(result2).toBeNull();

      expect(getMock()).not.toHaveBeenCalled();
    });
  });
});
