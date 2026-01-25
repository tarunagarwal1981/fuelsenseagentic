/**
 * State Reference Store
 *
 * Reference-based storage for large immutable state objects.
 * Reduces checkpoint size by storing large objects once and referencing them.
 */

import { createHash } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface ReferenceMetadata {
  type?: string;
  conversationId?: string;
  createdAt: string;
  size: number;
}

interface StoredReference {
  data: any;
  metadata: ReferenceMetadata;
}

// ============================================================================
// Redis Interface (abstracted for compatibility)
// ============================================================================

export interface RedisLike {
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<void>;
  exists(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  del(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
}

// ============================================================================
// State Reference Store Class
// ============================================================================

export class StateReferenceStore {
  private redis: RedisLike;
  private readonly PREFIX = 'state_ref:';
  private readonly TTL_DAYS = 30; // Keep references for 30 days

  constructor(redis: RedisLike) {
    this.redis = redis;
  }

  /**
   * Store object and return reference ID
   */
  async store<T>(
    key: string,
    value: T,
    metadata?: { type?: string; conversationId?: string }
  ): Promise<string> {
    const referenceId = this.generateReferenceId(key, value);
    const redisKey = `${this.PREFIX}${referenceId}`;

    // Check if already exists
    const exists = await this.redis.exists(redisKey);
    if (exists) {
      console.log(`♻️  Reference ${referenceId} already exists, reusing`);
      // Extend TTL
      await this.redis.expire(redisKey, this.TTL_DAYS * 24 * 60 * 60);
      return referenceId;
    }

    // Store with metadata
    const stored: StoredReference = {
      data: value,
      metadata: {
        type: metadata?.type || 'unknown',
        conversationId: metadata?.conversationId,
        createdAt: new Date().toISOString(),
        size: Buffer.byteLength(JSON.stringify(value), 'utf8'),
      },
    };

    await this.redis.setex(
      redisKey,
      this.TTL_DAYS * 24 * 60 * 60,
      JSON.stringify(stored)
    );

    console.log(
      `💾 Stored reference ${referenceId} (${stored.metadata.size} bytes)`
    );

    return referenceId;
  }

  /**
   * Retrieve object by reference ID
   */
  async retrieve<T>(referenceId: string): Promise<T | null> {
    const redisKey = `${this.PREFIX}${referenceId}`;
    const data = await this.redis.get(redisKey);

    if (!data) {
      console.warn(
        `⚠️  Reference ${referenceId} not found (may have expired)`
      );
      return null;
    }

    const stored: StoredReference = JSON.parse(data);

    // Extend TTL on access
    await this.redis.expire(redisKey, this.TTL_DAYS * 24 * 60 * 60);

    return stored.data;
  }

  /**
   * Check if value is a reference
   */
  isReference(value: any): boolean {
    return typeof value === 'string' && value.startsWith('ref:');
  }

  /**
   * Extract reference ID from reference string
   */
  extractReferenceId(reference: string): string {
    return reference.replace('ref:', '');
  }

  /**
   * Create reference string from ID
   */
  createReference(referenceId: string): string {
    return `ref:${referenceId}`;
  }

  /**
   * Generate deterministic reference ID from content
   */
  private generateReferenceId(key: string, value: any): string {
    const content = JSON.stringify(value);
    const hash = createHash('sha256').update(content).digest('hex');
    return `${key}_${hash.substring(0, 16)}`;
  }

  /**
   * Delete reference (cleanup)
   */
  async delete(referenceId: string): Promise<boolean> {
    const redisKey = `${this.PREFIX}${referenceId}`;
    const result = await this.redis.del(redisKey);
    return result > 0;
  }

  /**
   * Get all references for conversation
   */
  async getConversationReferences(conversationId: string): Promise<string[]> {
    const pattern = `${this.PREFIX}*`;
    const keys = await this.redis.keys(pattern);

    const references: string[] = [];
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const stored: StoredReference = JSON.parse(data);
        if (stored.metadata.conversationId === conversationId) {
          references.push(key.replace(this.PREFIX, ''));
        }
      }
    }

    return references;
  }

  /**
   * Cleanup expired references
   */
  async cleanup(conversationId?: string): Promise<number> {
    const pattern = `${this.PREFIX}*`;
    const keys = await this.redis.keys(pattern);

    let deleted = 0;
    for (const key of keys) {
      if (conversationId) {
        const data = await this.redis.get(key);
        if (data) {
          const stored: StoredReference = JSON.parse(data);
          if (stored.metadata.conversationId === conversationId) {
            await this.redis.del(key);
            deleted++;
          }
        }
      }
    }

    console.log(`🧹 Cleaned up ${deleted} references`);
    return deleted;
  }

  /**
   * Get reference metadata without retrieving full data
   */
  async getMetadata(referenceId: string): Promise<ReferenceMetadata | null> {
    const redisKey = `${this.PREFIX}${referenceId}`;
    const data = await this.redis.get(redisKey);

    if (!data) {
      return null;
    }

    const stored: StoredReference = JSON.parse(data);
    return stored.metadata;
  }

  /**
   * Batch retrieve multiple references
   */
  async batchRetrieve<T>(referenceIds: string[]): Promise<Map<string, T>> {
    const results = new Map<string, T>();

    await Promise.all(
      referenceIds.map(async (id) => {
        const value = await this.retrieve<T>(id);
        if (value !== null) {
          results.set(id, value);
        }
      })
    );

    return results;
  }
}

// ============================================================================
// Singleton Export (requires Redis adapter)
// ============================================================================

let referenceStoreInstance: StateReferenceStore | null = null;

export function getStateReferenceStore(redis?: RedisLike): StateReferenceStore {
  if (!referenceStoreInstance && redis) {
    referenceStoreInstance = new StateReferenceStore(redis);
  }
  if (!referenceStoreInstance) {
    throw new Error('StateReferenceStore requires Redis adapter. Call with redis parameter first.');
  }
  return referenceStoreInstance;
}
