/**
 * Compression Metrics
 *
 * Tracks compression effectiveness and generates reports.
 */

import type { CompressionStats } from '@/lib/state/state-compressor';
import { logAgentExecution } from '@/lib/monitoring/axiom-logger';

// ============================================================================
// Types
// ============================================================================

export interface CompressionReport {
  period: { start: Date; end: Date };
  totalCheckpoints: number;
  averageCompressionRatio: number;
  totalBytesSaved: number;
  totalReferencesCreated: number;
  mostCompressedFields: Array<{ field: string; avgSavings: number }>;
  leastCompressedFields: Array<{ field: string; avgSavings: number }>;
}

// ============================================================================
// Compression Metrics Class
// ============================================================================

export class CompressionMetrics {
  private metrics: Array<{
    timestamp: Date;
    correlationId: string;
    threadId: string;
    stats: CompressionStats;
  }> = [];

  private readonly MAX_STORED_METRICS = 1000;

  /**
   * Track compression effectiveness
   */
  async trackCompression(
    threadId: string,
    stats: CompressionStats,
    correlationId: string
  ): Promise<void> {
    const compressionRatio =
      stats.originalSize > 0
        ? (1 - stats.compressedSize / stats.originalSize) * 100
        : 0;

    const metrics = {
      timestamp: new Date(),
      correlationId,
      threadId,
      stats,
      compressionRatio,
    };

    // Store in memory
    this.metrics.push(metrics);
    if (this.metrics.length > this.MAX_STORED_METRICS) {
      this.metrics.shift();
    }

    // Log to Axiom
    try {
      logAgentExecution('state_compressor', correlationId, 0, 'success', {
        threadId,
        originalSize: stats.originalSize,
        compressedSize: stats.compressedSize,
        savedBytes: stats.savedBytes,
        compressionRatio: compressionRatio.toFixed(1),
        referencesCreated: stats.referencesCreated,
        fieldsReferenced: stats.fieldsReferenced.join(','),
        service: 'state-compressor',
      });
    } catch (error) {
      console.warn('Failed to log compression metrics to Axiom:', error);
    }

    // Alert if compression is poor (< 20% reduction)
    if (compressionRatio < 20 && stats.originalSize > 1000) {
      console.warn(
        `⚠️  [${correlationId}] Low compression ratio: ${compressionRatio.toFixed(1)}% (original: ${stats.originalSize} bytes)`
      );
    }

    // Log success if compression is good (> 50% reduction)
    if (compressionRatio > 50) {
      console.log(
        `✅ [${correlationId}] Excellent compression: ${compressionRatio.toFixed(1)}% reduction (${stats.savedBytes} bytes saved)`
      );
    }
  }

  /**
   * Generate compression report
   */
  async generateCompressionReport(
    startDate: Date,
    endDate: Date
  ): Promise<CompressionReport> {
    // Filter metrics by date range
    const filteredMetrics = this.metrics.filter(
      (m) => m.timestamp >= startDate && m.timestamp <= endDate
    );

    if (filteredMetrics.length === 0) {
      return {
        period: { start: startDate, end: endDate },
        totalCheckpoints: 0,
        averageCompressionRatio: 0,
        totalBytesSaved: 0,
        totalReferencesCreated: 0,
        mostCompressedFields: [],
        leastCompressedFields: [],
      };
    }

    // Calculate aggregates
    let totalOriginalSize = 0;
    let totalCompressedSize = 0;
    let totalReferencesCreated = 0;
    const fieldSavings: Record<string, number[]> = {};

    for (const metric of filteredMetrics) {
      const { stats } = metric;
      totalOriginalSize += stats.originalSize;
      totalCompressedSize += stats.compressedSize;
      totalReferencesCreated += stats.referencesCreated;

      // Track savings per field
      for (const field of stats.fieldsReferenced) {
        if (!fieldSavings[field]) {
          fieldSavings[field] = [];
        }
        // Estimate field savings (rough approximation)
        const avgFieldSavings = stats.savedBytes / stats.referencesCreated;
        fieldSavings[field].push(avgFieldSavings);
      }
    }

    const averageCompressionRatio =
      totalOriginalSize > 0
        ? ((1 - totalCompressedSize / totalOriginalSize) * 100)
        : 0;
    const totalBytesSaved = totalOriginalSize - totalCompressedSize;

    // Calculate average savings per field
    const fieldAvgSavings = Object.entries(fieldSavings).map(([field, savings]) => ({
      field,
      avgSavings:
        savings.length > 0
          ? savings.reduce((a, b) => a + b, 0) / savings.length
          : 0,
    }));

    // Sort by average savings
    fieldAvgSavings.sort((a, b) => b.avgSavings - a.avgSavings);

    const mostCompressedFields = fieldAvgSavings.slice(0, 5);
    const leastCompressedFields = fieldAvgSavings.slice(-5).reverse();

    return {
      period: { start: startDate, end: endDate },
      totalCheckpoints: filteredMetrics.length,
      averageCompressionRatio,
      totalBytesSaved,
      totalReferencesCreated,
      mostCompressedFields,
      leastCompressedFields,
    };
  }

  /**
   * Get recent compression statistics
   */
  getRecentStats(limit: number = 10): CompressionStats[] {
    return this.metrics
      .slice(-limit)
      .map((m) => m.stats)
      .reverse();
  }

  /**
   * Get compression summary
   */
  getSummary(): {
    totalCheckpoints: number;
    averageCompressionRatio: number;
    totalBytesSaved: number;
    totalReferencesCreated: number;
  } {
    if (this.metrics.length === 0) {
      return {
        totalCheckpoints: 0,
        averageCompressionRatio: 0,
        totalBytesSaved: 0,
        totalReferencesCreated: 0,
      };
    }

    let totalOriginalSize = 0;
    let totalCompressedSize = 0;
    let totalReferencesCreated = 0;

    for (const metric of this.metrics) {
      totalOriginalSize += metric.stats.originalSize;
      totalCompressedSize += metric.stats.compressedSize;
      totalReferencesCreated += metric.stats.referencesCreated;
    }

    return {
      totalCheckpoints: this.metrics.length,
      averageCompressionRatio:
        totalOriginalSize > 0
          ? (1 - totalCompressedSize / totalOriginalSize) * 100
          : 0,
      totalBytesSaved: totalOriginalSize - totalCompressedSize,
      totalReferencesCreated,
    };
  }

  /**
   * Clear stored metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let metricsInstance: CompressionMetrics | null = null;

export function getCompressionMetrics(): CompressionMetrics {
  if (!metricsInstance) {
    metricsInstance = new CompressionMetrics();
  }
  return metricsInstance;
}
