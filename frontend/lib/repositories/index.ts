/**
 * Repository pattern exports
 * Base repository with 3-tier fallback: Cache → Database → JSON Fallback
 */

export { BaseRepository } from './base-repository';
export { RedisCache } from './cache-client';
export { createSupabaseClient, getSupabaseClient } from './db-client';
export { PortRepository } from './port-repository';
export { PriceRepository } from './price-repository';
export { VesselRepository } from './vessel-repository';
export { WorldPortRepositoryCSV } from './world-port-repository';
export { ServiceContainer } from './service-container';
export type {
  RepositoryConfig,
  QueryFilter,
  Port,
  FuelPrice,
  PriceQuery,
  VesselProfile,
  VesselCurrentState,
  VesselMasterData,
  VesselConsumptionProfile,
  WorldPortEntry,
  IWorldPortRepository,
} from './types';

