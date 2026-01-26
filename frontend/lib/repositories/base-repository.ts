/**
 * Base Repository Pattern with 3-Tier Fallback: Cache → Database → JSON Fallback
 * 
 * This abstract base class provides a consistent data access pattern:
 * 1. Try cache first (fastest)
 * 2. Try database (authoritative source)
 * 3. Try JSON fallback (static data)
 * 4. Return null if not found
 * 
 * All operations include error handling and graceful degradation.
 */

import { RedisCache } from './cache-client';
import { SupabaseClient } from '@supabase/supabase-js';
import { RepositoryConfig } from './types';
import * as fs from 'fs/promises';
import * as path from 'path';

export abstract class BaseRepository<T extends { id: string }> {
  protected cache: RedisCache;
  protected db: SupabaseClient;
  protected tableName: string;
  protected fallbackPath?: string;

  constructor(
    cache: RedisCache,
    db: SupabaseClient,
    config: RepositoryConfig
  ) {
    this.cache = cache;
    this.db = db;
    this.tableName = config.tableName;
    this.fallbackPath = config.fallbackPath;
  }

  /**
   * Generate cache key for an entity
   * Format: fuelsense:{tableName}:{id}
   * @param id Entity identifier
   * @returns Cache key string
   */
  protected getCacheKey(id: string): string {
    return `fuelsense:${this.tableName}:${id}`;
  }

  /**
   * Get cache TTL in seconds
   * Override in subclasses for custom TTL
   * @returns TTL in seconds (default: 3600 = 1 hour)
   */
  protected getCacheTTL(): number {
    return 3600; // 1 hour default
  }

  /**
   * Load entity from JSON fallback file
   * Reads from {fallbackPath}/{tableName}.json and finds by id
   * @param id Entity identifier
   * @returns Entity or null if not found
   */
  protected async loadFromFallback(id: string): Promise<T | null> {
    if (!this.fallbackPath) {
      return null;
    }

    try {
      const filePath = path.join(this.fallbackPath, `${this.tableName}.json`);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(fileContent);

      // Handle both array and object formats
      let entities: T[];
      if (Array.isArray(data)) {
        entities = data;
      } else if (typeof data === 'object') {
        // If it's an object, try to find the entity by id in values
        entities = Object.values(data) as T[];
      } else {
        return null;
      }

      // Find entity by id (support both 'id' and table-specific id fields)
      const entity = entities.find(
        (item) => item.id === id || (item as any)[`${this.tableName}_id`] === id
      );

      return entity || null;
    } catch (error) {
      // File doesn't exist or parse error - return null gracefully
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(
          `[BaseRepository] Error loading fallback for ${this.tableName}:${id}:`,
          error
        );
      }
      return null;
    }
  }

  /**
   * Invalidate cache for a specific entity or all entities in this table
   * @param id Optional entity ID. If not provided, invalidates all keys for this table
   */
  protected async invalidateCache(id?: string): Promise<void> {
    try {
      if (id) {
        const key = this.getCacheKey(id);
        await this.cache.delete(key);
      } else {
        const pattern = `fuelsense:${this.tableName}:*`;
        await this.cache.clear(pattern);
      }
    } catch (error) {
      console.error(
        `[BaseRepository] Error invalidating cache for ${this.tableName}:`,
        error
      );
      // Don't throw - cache invalidation failures shouldn't break operations
    }
  }

  /**
   * Find entity by ID with 3-tier fallback strategy
   * 1. Try cache
   * 2. Try database
   * 3. Try JSON fallback
   * 4. Return null
   * 
   * @param id Entity identifier
   * @returns Entity or null if not found
   */
  async findById(id: string): Promise<T | null> {
    const cacheKey = this.getCacheKey(id);

    // Step 1: Try cache
    try {
      const cached = await this.cache.get<T>(cacheKey);
      if (cached) {
        console.log(`[CACHE HIT] ${this.tableName}:${id}`);
        return cached;
      }
    } catch (error) {
      console.error(
        `[BaseRepository] Cache read error for ${this.tableName}:${id}:`,
        error
      );
    }

    // Step 2: Try database
    try {
      const { data, error } = await this.db
        .from(this.tableName)
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        throw error;
      }

      if (data) {
        // Cache the result for future requests
        await this.cache.set(cacheKey, data, this.getCacheTTL());
        console.log(`[DB HIT] ${this.tableName}:${id}`);
        return data as T;
      }
    } catch (error) {
      // Database error - log but continue to fallback
      console.error(
        `[BaseRepository] Database read error for ${this.tableName}:${id}:`,
        error
      );
    }

    // Step 3: Try JSON fallback
    try {
      const fallback = await this.loadFromFallback(id);
      if (fallback) {
        // Optionally cache fallback data (with shorter TTL)
        await this.cache.set(cacheKey, fallback, this.getCacheTTL());
        console.log(`[FALLBACK HIT] ${this.tableName}:${id}`);
        return fallback;
      }
    } catch (error) {
      console.error(
        `[BaseRepository] Fallback read error for ${this.tableName}:${id}:`,
        error
      );
    }

    // Step 4: Not found
    console.log(`[NOT FOUND] ${this.tableName}:${id}`);
    return null;
  }

  /**
   * Find all entities with optional filtering
   * @param filter Optional filter criteria
   * @returns Array of entities
   */
  async findAll(filter?: Partial<T>): Promise<T[]> {
    try {
      let query = this.db.from(this.tableName).select('*');

      // Apply filters if provided
      if (filter) {
        Object.entries(filter).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            query = query.eq(key, value);
          }
        });
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return (data || []) as T[];
    } catch (error) {
      console.error(
        `[BaseRepository] Error finding all ${this.tableName}:`,
        error
      );
      // Try fallback if database fails
      if (this.fallbackPath) {
        try {
          const filePath = path.join(this.fallbackPath, `${this.tableName}.json`);
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(fileContent);

          let entities: T[];
          if (Array.isArray(data)) {
            entities = data;
          } else if (typeof data === 'object') {
            entities = Object.values(data) as T[];
          } else {
            return [];
          }

          // Apply filters if provided
          if (filter) {
            return entities.filter((entity) => {
              return Object.entries(filter).every(
                ([key, value]) => entity[key as keyof T] === value
              );
            });
          }

          return entities;
        } catch (fallbackError) {
          console.error(
            `[BaseRepository] Fallback error for findAll ${this.tableName}:`,
            fallbackError
          );
        }
      }

      return [];
    }
  }

  /**
   * Create a new entity
   * @param data Entity data (without id)
   * @returns Created entity with id
   */
  async create(data: Omit<T, 'id'>): Promise<T> {
    try {
      const { data: created, error } = await this.db
        .from(this.tableName)
        .insert(data)
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (!created) {
        throw new Error('Failed to create entity');
      }

      // Cache the newly created entity
      const cacheKey = this.getCacheKey(created.id);
      await this.cache.set(cacheKey, created, this.getCacheTTL());

      return created as T;
    } catch (error) {
      console.error(
        `[BaseRepository] Error creating ${this.tableName}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Update an existing entity
   * @param id Entity identifier
   * @param data Partial entity data to update
   * @returns Updated entity
   */
  async update(id: string, data: Partial<T>): Promise<T> {
    try {
      const { data: updated, error } = await this.db
        .from(this.tableName)
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (!updated) {
        throw new Error(`Entity ${id} not found`);
      }

      // Invalidate and update cache
      const cacheKey = this.getCacheKey(id);
      await this.cache.set(cacheKey, updated, this.getCacheTTL());

      return updated as T;
    } catch (error) {
      console.error(
        `[BaseRepository] Error updating ${this.tableName}:${id}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Delete an entity
   * @param id Entity identifier
   */
  async delete(id: string): Promise<void> {
    try {
      const { error } = await this.db
        .from(this.tableName)
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }

      // Invalidate cache
      await this.invalidateCache(id);
    } catch (error) {
      console.error(
        `[BaseRepository] Error deleting ${this.tableName}:${id}:`,
        error
      );
      throw error;
    }
  }
}
