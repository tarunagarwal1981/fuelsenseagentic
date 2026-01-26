/**
 * Service Container for Dependency Injection
 * 
 * Singleton pattern that initializes and provides access to:
 * - Infrastructure (Redis cache, Supabase database)
 * - Repositories (Port, Price, Vessel)
 * - Services (Route, Bunker, Weather)
 * 
 * Usage:
 * ```typescript
 * const container = ServiceContainer.getInstance();
 * const portRepo = container.getPortRepository();
 * const routeService = container.getRouteService();
 * ```
 */

import { RedisCache } from './cache-client';
import { createSupabaseClient } from './db-client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PortRepository } from './port-repository';
import { PriceRepository } from './price-repository';
import { VesselRepository } from './vessel-repository';
import { RouteService } from '@/lib/services/route.service';
import { BunkerService } from '@/lib/services/bunker.service';
import { WeatherService } from '@/lib/services/weather.service';
import { SeaRouteAPIClient } from '@/lib/services/sea-route-api-client';
import { OpenMeteoAPIClient } from '@/lib/services/open-meteo-api-client';

/**
 * Mock Supabase client for testing when Supabase is not configured
 * Throws errors when used, causing repositories to fall back to JSON
 */
class MockSupabaseClient {
  from(_table: string) {
    const createMockQuery = () => ({
      eq: (_column: string, _value: any) => createMockQuery(),
      in: (_column: string, _values: any[]) => createMockQuery(),
      order: (_column: string, _options?: any) => createMockQuery(),
      limit: (_limit: number) => Promise.resolve({ data: null, error: { message: 'Mock client - use JSON fallback' } }),
      single: () => Promise.resolve({ data: null, error: { message: 'Mock client - use JSON fallback' } }),
    });

    return {
      select: (_columns?: string) => createMockQuery(),
      insert: (_data: any) => ({
        select: (_columns?: string) => ({
          single: () => Promise.resolve({ data: null, error: { message: 'Mock client - use JSON fallback' } }),
        }),
      }),
      update: (_data: any) => createMockQuery(),
      delete: () => createMockQuery(),
    };
  }
}

/**
 * Mock cache implementation for when Redis is unavailable
 * Provides no-op methods to allow graceful degradation
 */
class MockCache {
  async get<T>(_key: string): Promise<T | null> {
    return null;
  }

  async set<T>(_key: string, _value: T, _ttl: number): Promise<void> {
    // No-op
  }

  async delete(_key: string): Promise<void> {
    // No-op
  }

  async clear(_pattern: string): Promise<number> {
    return 0;
  }
}

export class ServiceContainer {
  private static instance: ServiceContainer | null = null;

  private cache!: RedisCache | MockCache;
  private db!: SupabaseClient;
  private portRepo!: PortRepository;
  private priceRepo!: PriceRepository;
  private vesselRepo!: VesselRepository;
  private routeService!: RouteService;
  private bunkerService!: BunkerService;
  private weatherService!: WeatherService;
  private cacheEnabled: boolean = false;

  /**
   * Private constructor - use getInstance() instead
   */
  private constructor() {
    this.initializeInfrastructure();
    this.initializeRepositories();
    this.initializeServices();
  }

  /**
   * Get singleton instance of ServiceContainer
   * Creates instance on first call
   */
  public static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer();
    }
    return ServiceContainer.instance;
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    ServiceContainer.instance = null;
  }

  /**
   * Initialize infrastructure components (cache and database)
   */
  private initializeInfrastructure(): void {
    // Initialize Redis cache
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (redisUrl && redisToken) {
      try {
        this.cache = new RedisCache(redisUrl.trim(), redisToken.trim());
        this.cacheEnabled = true;
        console.log('[SERVICE-CONTAINER] Redis cache initialized');
      } catch (error) {
        console.warn(
          '[SERVICE-CONTAINER] Failed to initialize Redis cache, using mock cache:',
          error instanceof Error ? error.message : String(error)
        );
        this.cache = new MockCache();
        this.cacheEnabled = false;
      }
    } else {
      console.warn(
        '[SERVICE-CONTAINER] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set, caching disabled'
      );
      this.cache = new MockCache();
      this.cacheEnabled = false;
    }

    // Initialize Supabase client (gracefully handle missing credentials for testing)
    try {
      this.db = createSupabaseClient();
      console.log('[SERVICE-CONTAINER] Supabase client initialized');
    } catch (error) {
      // For testing: allow initialization without Supabase (repositories will use JSON fallback)
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Supabase configuration missing')) {
        console.warn(
          '[SERVICE-CONTAINER] Supabase not configured - repositories will use JSON fallback only'
        );
        // Create a mock Supabase client that throws on use (repositories will catch and fallback)
        this.db = new MockSupabaseClient() as any as SupabaseClient;
      } else {
        console.error(
          '[SERVICE-CONTAINER] Failed to initialize Supabase client:',
          errorMessage
        );
        throw error; // Re-throw non-configuration errors
      }
    }
  }

  /**
   * Initialize all repositories with infrastructure dependencies
   */
  private initializeRepositories(): void {
    try {
      this.portRepo = new PortRepository(this.cache as RedisCache, this.db);
      this.priceRepo = new PriceRepository(this.cache as RedisCache, this.db);
      this.vesselRepo = new VesselRepository(this.cache as RedisCache, this.db);

      console.log('[SERVICE-CONTAINER] Repositories initialized');
    } catch (error) {
      console.error(
        '[SERVICE-CONTAINER] Failed to initialize repositories:',
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  /**
   * Initialize all services with dependencies
   */
  private initializeServices(): void {
    try {
      // External API clients
      const seaRouteAPI = new SeaRouteAPIClient();
      const openMeteoAPI = new OpenMeteoAPIClient();

      // Initialize services
      this.routeService = new RouteService(
        this.portRepo,
        this.cache as RedisCache,
        seaRouteAPI
      );

      this.weatherService = new WeatherService(
        this.cache as RedisCache,
        openMeteoAPI,
        this.portRepo
      );

      this.bunkerService = new BunkerService(
        this.portRepo,
        this.priceRepo,
        this.routeService,
        this.cache as RedisCache
      );

      console.log('[SERVICE-CONTAINER] Services initialized');
    } catch (error) {
      console.error(
        '[SERVICE-CONTAINER] Failed to initialize services:',
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  /**
   * Get PortRepository instance
   */
  public getPortRepository(): PortRepository {
    return this.portRepo;
  }

  /**
   * Get PriceRepository instance
   */
  public getPriceRepository(): PriceRepository {
    return this.priceRepo;
  }

  /**
   * Get VesselRepository instance
   */
  public getVesselRepository(): VesselRepository {
    return this.vesselRepo;
  }

  /**
   * Get RouteService instance
   */
  public getRouteService(): RouteService {
    return this.routeService;
  }

  /**
   * Get BunkerService instance
   */
  public getBunkerService(): BunkerService {
    return this.bunkerService;
  }

  /**
   * Get WeatherService instance
   */
  public getWeatherService(): WeatherService {
    return this.weatherService;
  }

  /**
   * Get Redis cache instance (may be MockCache if Redis unavailable)
   */
  public getCache(): RedisCache | MockCache {
    return this.cache;
  }

  /**
   * Get Supabase database client
   */
  public getDatabase(): SupabaseClient {
    return this.db;
  }

  /**
   * Check if caching is enabled
   */
  public isCacheEnabled(): boolean {
    return this.cacheEnabled;
  }

  /**
   * Cleanup method for testing
   * Clears caches and resets state
   */
  public async cleanup(): Promise<void> {
    try {
      if (this.cacheEnabled && this.cache instanceof RedisCache) {
        // Clear all cache keys matching our pattern
        await this.cache.clear('fuelsense:*');
        console.log('[SERVICE-CONTAINER] Cache cleared');
      }
    } catch (error) {
      console.error('[SERVICE-CONTAINER] Error during cleanup:', error);
    }
  }
}
