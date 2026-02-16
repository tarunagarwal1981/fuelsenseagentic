/**
 * Port Repository Unit Tests
 *
 * PortRepository delegates to WorldPortRepositoryAPI (World Port Index API + cache).
 * No Supabase or JSON fallback; findBunkerPorts/findNearby return [] (not implemented).
 */

import { PortRepository } from '@/lib/repositories/port-repository';
import { RedisCache } from '@/lib/repositories/cache-client';
import { WorldPortRepositoryAPI } from '@/lib/repositories/world-port-repository-api';
import { Port } from '@/lib/repositories/types';
import type { WorldPortEntry } from '@/lib/repositories/types';

const mockFindByCode = jest.fn();
const mockFindByName = jest.fn();

jest.mock('@/lib/repositories/world-port-repository-api', () => ({
  WorldPortRepositoryAPI: jest.fn().mockImplementation(() => ({
    findByCode: mockFindByCode,
    findByName: mockFindByName,
  })),
}));

describe('PortRepository', () => {
  let portRepository: PortRepository;
  let mockCache: jest.Mocked<RedisCache>;

  const worldPortEntrySGSIN: WorldPortEntry = {
    id: 'SGSIN',
    code: 'SGSIN',
    name: 'Singapore',
    countryCode: 'SG',
    coordinates: [1.2897, 103.8501],
  };

  const expectedPortSGSIN: Port = {
    id: 'SGSIN',
    code: 'SGSIN',
    name: 'Singapore',
    country: 'SG',
    coordinates: [1.2897, 103.8501],
    bunkerCapable: false,
    fuelsAvailable: [],
    timezone: '',
  };

  beforeEach(() => {
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
    } as unknown as jest.Mocked<RedisCache>;
    portRepository = new PortRepository(mockCache);
    jest.clearAllMocks();
  });

  describe('findByCode', () => {
    it('returns transformed Port when API returns WorldPortEntry', async () => {
      mockFindByCode.mockResolvedValue(worldPortEntrySGSIN);

      const result = await portRepository.findByCode('SGSIN');

      expect(result).toEqual(expectedPortSGSIN);
      expect(mockFindByCode).toHaveBeenCalledWith('SGSIN');
    });

    it('returns null when API returns null', async () => {
      mockFindByCode.mockResolvedValue(null);

      const result = await portRepository.findByCode('INVALID');

      expect(result).toBeNull();
      expect(mockFindByCode).toHaveBeenCalledWith('INVALID');
    });

    it('uses id and code from WorldPortEntry', async () => {
      const entry: WorldPortEntry = {
        id: 'AEFJR',
        code: 'AEFJR',
        name: 'Fujairah',
        countryCode: 'AE',
        coordinates: [25.28, 55.33],
      };
      mockFindByCode.mockResolvedValue(entry);

      const result = await portRepository.findByCode('AEFJR');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('AEFJR');
      expect(result!.code).toBe('AEFJR');
      expect(result!.name).toBe('Fujairah');
      expect(result!.country).toBe('AE');
      expect(result!.coordinates).toEqual([25.28, 55.33]);
      expect(result!.bunkerCapable).toBe(false);
      expect(result!.fuelsAvailable).toEqual([]);
    });
  });

  describe('findByName', () => {
    it('returns transformed Port when API returns WorldPortEntry', async () => {
      mockFindByName.mockResolvedValue(worldPortEntrySGSIN);

      const result = await portRepository.findByName('Singapore');

      expect(result).toEqual(expectedPortSGSIN);
      expect(mockFindByName).toHaveBeenCalledWith('Singapore');
    });

    it('returns null when API returns null', async () => {
      mockFindByName.mockResolvedValue(null);

      const result = await portRepository.findByName('Unknown Port');

      expect(result).toBeNull();
    });
  });

  describe('findBunkerPorts', () => {
    it('returns empty array (not implemented with World Port Index API)', async () => {
      const result = await portRepository.findBunkerPorts();

      expect(result).toEqual([]);
      expect(mockFindByCode).not.toHaveBeenCalled();
      expect(mockFindByName).not.toHaveBeenCalled();
    });
  });

  describe('findNearby', () => {
    it('returns empty array (not implemented with World Port Index API)', async () => {
      const result = await portRepository.findNearby(1.2897, 103.8501, 50);

      expect(result).toEqual([]);
    });
  });
});
