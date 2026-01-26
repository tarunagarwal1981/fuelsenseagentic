/**
 * Redis cache client wrapper using Upstash Redis REST API
 * Provides a simple interface for cache operations with error handling
 */

import { Redis } from '@upstash/redis';

export class RedisCache {
  private client: Redis;

  constructor(url: string, token: string) {
    try {
      this.client = new Redis({
        url,
        token,
      });
    } catch (error) {
      console.error('[RedisCache] Failed to initialize Redis client:', error);
      throw error;
    }
  }

  /**
   * Get a value from cache
   * @param key Cache key
   * @returns Cached value or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get<T>(key);
      return value ?? null;
    } catch (error) {
      console.error(`[RedisCache] Error getting key "${key}":`, error);
      return null;
    }
  }

  /**
   * Set a value in cache with TTL
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Time to live in seconds
   */
  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    try {
      await this.client.set(key, value, { ex: ttl });
    } catch (error) {
      console.error(`[RedisCache] Error setting key "${key}":`, error);
      // Don't throw - cache failures should be graceful
    }
  }

  /**
   * Delete a specific key from cache
   * @param key Cache key to delete
   */
  async delete(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      console.error(`[RedisCache] Error deleting key "${key}":`, error);
      // Don't throw - cache failures should be graceful
    }
  }

  /**
   * Clear all keys matching a pattern
   * Uses SCAN for production-safe pattern matching (avoids blocking)
   * @param pattern Redis key pattern (e.g., "fuelsense:ports:*")
   * @returns Number of keys deleted
   */
  async clear(pattern: string): Promise<number> {
    try {
      const allKeys: string[] = [];
      let cursor = '0';

      // Use SCAN to iterate through keys matching the pattern
      do {
        const [nextCursor, keys] = await this.client.scan(cursor, {
          match: pattern,
          count: 100, // Process 100 keys at a time
        });
        allKeys.push(...(keys as string[]));
        cursor = nextCursor as string;
      } while (cursor !== '0');

      if (allKeys.length === 0) {
        return 0;
      }

      // Delete all keys in batches (Upstash supports multiple keys in del)
      const deleted = await this.client.del(...allKeys);
      return deleted as number;
    } catch (error) {
      console.error(`[RedisCache] Error clearing pattern "${pattern}":`, error);
      return 0;
    }
  }
}
