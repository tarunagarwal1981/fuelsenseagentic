/**
 * State Compressor
 *
 * Compresses state by converting large immutable objects to references.
 * Reduces checkpoint size by 60-70% for conversations with repeated data.
 */

import type { StateReferenceStore } from './state-reference-store';

// ============================================================================
// Types
// ============================================================================

export interface CompressionStats {
  originalSize: number;
  compressedSize: number;
  savedBytes: number;
  referencesCreated: number;
  fieldsReferenced: string[];
}

export interface CompressionInfo {
  isCompressed: boolean;
  referenceCount: number;
  estimatedSize: number;
  fields: Array<{
    name: string;
    isReference: boolean;
    size: number;
  }>;
}

// ============================================================================
// State Compressor Class
// ============================================================================

export class StateCompressor {
  private referenceStore: StateReferenceStore;

  // Fields that should be stored as references (large, immutable)
  private readonly REFERENCEABLE_FIELDS = [
    'route', // ~1KB, immutable after calculation
    'ports', // ~2KB, immutable after search
    'prices', // ~1KB, immutable for query
    'weather', // ~2KB, immutable after fetch
    'analysis', // ~1.5KB, changes rarely
    'cii_rating', // ~0.8KB, immutable after calculation
    'eu_ets_cost', // ~0.6KB, immutable after calculation
    'hull_performance', // ~1KB, immutable after calculation
    'route_data', // Alternative field name
    'bunker_ports', // Alternative field name
    'port_prices', // Alternative field name
    'weather_forecast', // Alternative field name
    'weather_consumption', // Alternative field name
    'bunker_analysis', // Alternative field name
    'compliance_data', // ~1KB
    'emissions_breakdown', // ~0.8KB
  ];

  // Minimum size threshold for creating references (bytes)
  private readonly MIN_REFERENCE_SIZE = 500;

  constructor(referenceStore: StateReferenceStore) {
    this.referenceStore = referenceStore;
  }

  /**
   * Compress state by converting large objects to references
   */
  async compress(
    state: any,
    conversationId: string
  ): Promise<{ compressed: any; stats: CompressionStats }> {
    const stats: CompressionStats = {
      originalSize: this.calculateSize(state),
      compressedSize: 0,
      savedBytes: 0,
      referencesCreated: 0,
      fieldsReferenced: [],
    };

    const compressed = { ...state };

    // Convert large fields to references
    for (const field of this.REFERENCEABLE_FIELDS) {
      if (
        field in state &&
        state[field] !== null &&
        state[field] !== undefined
      ) {
        const value = state[field];
        const fieldSize = this.calculateSize(value);

        // Only create reference if object is > threshold
        if (fieldSize > this.MIN_REFERENCE_SIZE) {
          try {
            const referenceId = await this.referenceStore.store(
              field,
              value,
              { type: field, conversationId }
            );

            compressed[field] = this.referenceStore.createReference(referenceId);

            stats.referencesCreated++;
            stats.fieldsReferenced.push(field);
            // Reference string is ~50 bytes vs original size
            stats.savedBytes += fieldSize - 50;
          } catch (error) {
            console.error(
              `❌ Failed to create reference for ${field}:`,
              error
            );
            // Keep original value if reference creation fails
            compressed[field] = value;
          }
        }
      }
    }

    stats.compressedSize = this.calculateSize(compressed);
    stats.savedBytes = stats.originalSize - stats.compressedSize;

    const compressionRatio =
      stats.originalSize > 0
        ? ((1 - stats.compressedSize / stats.originalSize) * 100).toFixed(1)
        : '0.0';

    if (stats.referencesCreated > 0) {
      console.log(
        `🗜️  Compressed state: ${stats.originalSize} → ${stats.compressedSize} bytes (${compressionRatio}% reduction)`
      );
      console.log(`   References created: ${stats.referencesCreated}`);
      console.log(`   Fields: ${stats.fieldsReferenced.join(', ')}`);
    }

    return { compressed, stats };
  }

  /**
   * Decompress state by resolving references
   */
  async decompress(state: any): Promise<any> {
    const decompressed = { ...state };

    let referencesResolved = 0;
    const failedReferences: string[] = [];

    // Resolve all references
    for (const field of this.REFERENCEABLE_FIELDS) {
      if (field in state && this.referenceStore.isReference(state[field])) {
        try {
          const referenceId = this.referenceStore.extractReferenceId(
            state[field]
          );
          const value = await this.referenceStore.retrieve(referenceId);

          if (value !== null) {
            decompressed[field] = value;
            referencesResolved++;
          } else {
            failedReferences.push(field);
            console.error(
              `❌ Failed to resolve reference for field ${field}: ${referenceId}`
            );
            // Keep reference string if retrieval fails
            decompressed[field] = state[field];
          }
        } catch (error) {
          console.error(`❌ Error resolving reference for ${field}:`, error);
          decompressed[field] = state[field];
        }
      }
    }

    if (referencesResolved > 0) {
      console.log(
        `🔓 Decompressed state: resolved ${referencesResolved} references`
      );
    }

    if (failedReferences.length > 0) {
      console.warn(
        `⚠️  Failed to resolve ${failedReferences.length} references: ${failedReferences.join(', ')}`
      );
    }

    return decompressed;
  }

  /**
   * Check if state is compressed
   */
  isCompressed(state: any): boolean {
    for (const field of this.REFERENCEABLE_FIELDS) {
      if (field in state && this.referenceStore.isReference(state[field])) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get compression statistics
   */
  getCompressionStats(state: any): CompressionInfo {
    const fields = this.REFERENCEABLE_FIELDS.map((field) => ({
      name: field,
      isReference:
        field in state && this.referenceStore.isReference(state[field]),
      size: field in state ? this.calculateSize(state[field]) : 0,
    }));

    return {
      isCompressed: this.isCompressed(state),
      referenceCount: fields.filter((f) => f.isReference).length,
      estimatedSize: this.calculateSize(state),
      fields,
    };
  }

  /**
   * Calculate size of an object in bytes
   */
  private calculateSize(obj: any): number {
    try {
      return Buffer.byteLength(JSON.stringify(obj), 'utf8');
    } catch {
      // Handle circular references or non-serializable values
      return 0;
    }
  }

  /**
   * Get list of referenceable fields
   */
  getReferenceableFields(): string[] {
    return [...this.REFERENCEABLE_FIELDS];
  }

  /**
   * Add custom referenceable field
   */
  addReferenceableField(fieldName: string): void {
    if (!this.REFERENCEABLE_FIELDS.includes(fieldName)) {
      this.REFERENCEABLE_FIELDS.push(fieldName);
    }
  }
}

// ============================================================================
// Singleton Export (requires reference store)
// ============================================================================

let compressorInstance: StateCompressor | null = null;

export function getStateCompressor(referenceStore?: StateReferenceStore): StateCompressor {
  if (!compressorInstance && referenceStore) {
    compressorInstance = new StateCompressor(referenceStore);
  }
  if (!compressorInstance) {
    throw new Error('StateCompressor requires StateReferenceStore. Call with referenceStore parameter first.');
  }
  return compressorInstance;
}
