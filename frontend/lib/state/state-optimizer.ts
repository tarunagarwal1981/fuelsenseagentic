/**
 * State Optimizer
 *
 * Reduces state size for efficient Redis storage.
 * Removes computed fields, compresses large arrays, and removes empty values.
 */

import type { StateSchema } from './state-schema';
import { STATE_SCHEMAS, CURRENT_STATE_VERSION, getCurrentSchema } from './state-schema';

// ============================================================================
// Types
// ============================================================================

export interface OptimizationResult {
  optimizedState: any;
  originalSize: number;
  optimizedSize: number;
  reductionBytes: number;
  reductionPercent: number;
  changes: OptimizationChange[];
}

export interface OptimizationChange {
  type: 'removed' | 'compressed' | 'truncated';
  field: string;
  originalSize: number;
  newSize: number;
  details: string;
}

export interface OptimizerOptions {
  /** Remove computed fields (can be regenerated) */
  removeComputed?: boolean;
  /** Remove deprecated fields */
  removeDeprecated?: boolean;
  /** Compress large arrays */
  compressArrays?: boolean;
  /** Remove null/undefined values */
  removeEmpty?: boolean;
  /** Maximum waypoints to keep */
  maxWaypoints?: number;
  /** Maximum ports to keep */
  maxPorts?: number;
  /** Maximum messages to keep (keeps recent) */
  maxMessages?: number;
  /** Remove large message content */
  truncateMessageContent?: boolean;
  /** Max content length per message */
  maxMessageContentLength?: number;
}

const DEFAULT_OPTIONS: Required<OptimizerOptions> = {
  removeComputed: true,
  removeDeprecated: true,
  compressArrays: true,
  removeEmpty: true,
  maxWaypoints: 50,
  maxPorts: 20,
  maxMessages: 30,
  truncateMessageContent: true,
  maxMessageContentLength: 2000,
};

// ============================================================================
// State Optimizer Class
// ============================================================================

export class StateOptimizer {
  private options: Required<OptimizerOptions>;

  constructor(options: OptimizerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Optimize state for storage
   */
  optimize(
    state: any,
    schemaVersion: string = CURRENT_STATE_VERSION
  ): OptimizationResult {
    const schema = STATE_SCHEMAS[schemaVersion];
    if (!schema) {
      return {
        optimizedState: state,
        originalSize: this.estimateSize(state),
        optimizedSize: this.estimateSize(state),
        reductionBytes: 0,
        reductionPercent: 0,
        changes: [],
      };
    }

    const originalSize = this.estimateSize(state);
    const changes: OptimizationChange[] = [];

    let optimized = { ...state };

    // 1. Remove computed fields
    if (this.options.removeComputed && schema.computed?.length > 0) {
      optimized = this.removeComputedFields(optimized, schema, changes);
    }

    // 2. Remove deprecated fields
    if (this.options.removeDeprecated && schema.deprecated && schema.deprecated.length > 0) {
      optimized = this.removeDeprecatedFields(optimized, schema, changes);
    }

    // 3. Compress large arrays
    if (this.options.compressArrays) {
      optimized = this.compressArrays(optimized, changes);
    }

    // 4. Truncate messages
    if (this.options.truncateMessageContent) {
      optimized = this.truncateMessages(optimized, changes);
    }

    // 5. Remove empty values
    if (this.options.removeEmpty) {
      optimized = this.removeEmptyValues(optimized, changes);
    }

    const optimizedSize = this.estimateSize(optimized);
    const reductionBytes = originalSize - optimizedSize;
    const reductionPercent = originalSize > 0
      ? Math.round((reductionBytes / originalSize) * 100)
      : 0;

    console.log(
      `🔧 [STATE-OPTIMIZER] Optimized: ${originalSize} → ${optimizedSize} bytes (${reductionPercent}% reduction)`
    );

    return {
      optimizedState: optimized,
      originalSize,
      optimizedSize,
      reductionBytes,
      reductionPercent,
      changes,
    };
  }

  /**
   * Remove computed fields (can be regenerated)
   */
  private removeComputedFields(
    state: any,
    schema: StateSchema,
    changes: OptimizationChange[]
  ): any {
    const optimized = { ...state };

    for (const field of schema.computed || []) {
      if (field in optimized) {
        const originalSize = this.estimateSize(optimized[field]);
        delete optimized[field];
        changes.push({
          type: 'removed',
          field,
          originalSize,
          newSize: 0,
          details: 'Computed field (can be regenerated)',
        });
      }
    }

    return optimized;
  }

  /**
   * Remove deprecated fields
   */
  private removeDeprecatedFields(
    state: any,
    schema: StateSchema,
    changes: OptimizationChange[]
  ): any {
    const optimized = { ...state };

    for (const field of schema.deprecated || []) {
      if (field in optimized) {
        const originalSize = this.estimateSize(optimized[field]);
        delete optimized[field];
        changes.push({
          type: 'removed',
          field,
          originalSize,
          newSize: 0,
          details: 'Deprecated field',
        });
      }
    }

    return optimized;
  }

  /**
   * Compress large arrays
   */
  private compressArrays(
    state: any,
    changes: OptimizationChange[]
  ): any {
    const optimized = { ...state };

    // Compress waypoints
    if (optimized.route?.waypoints?.length > this.options.maxWaypoints) {
      const waypoints = optimized.route.waypoints;
      const originalSize = this.estimateSize(waypoints);

      // Keep first 10, last 10, and sample in between
      const first = waypoints.slice(0, 10);
      const last = waypoints.slice(-10);
      const totalRemoved = waypoints.length - 20;

      optimized.route = {
        ...optimized.route,
        waypoints: [
          ...first,
          {
            _compressed: true,
            _removed_count: totalRemoved,
            _sample: waypoints[Math.floor(waypoints.length / 2)],
          },
          ...last,
        ],
        _original_waypoint_count: waypoints.length,
      };

      const newSize = this.estimateSize(optimized.route.waypoints);
      changes.push({
        type: 'compressed',
        field: 'route.waypoints',
        originalSize,
        newSize,
        details: `Reduced from ${waypoints.length} to ${optimized.route.waypoints.length} waypoints`,
      });
    }

    // Truncate ports list
    if (optimized.ports?.length > this.options.maxPorts) {
      const originalSize = this.estimateSize(optimized.ports);
      const originalCount = optimized.ports.length;

      optimized.ports = optimized.ports.slice(0, this.options.maxPorts);
      optimized._ports_truncated = true;
      optimized._total_ports_found = originalCount;

      const newSize = this.estimateSize(optimized.ports);
      changes.push({
        type: 'truncated',
        field: 'ports',
        originalSize,
        newSize,
        details: `Truncated from ${originalCount} to ${this.options.maxPorts} ports`,
      });
    }

    // Truncate nearby_ports list
    if (optimized.nearby_ports?.length > this.options.maxPorts) {
      const originalSize = this.estimateSize(optimized.nearby_ports);
      const originalCount = optimized.nearby_ports.length;

      optimized.nearby_ports = optimized.nearby_ports.slice(0, this.options.maxPorts);

      const newSize = this.estimateSize(optimized.nearby_ports);
      changes.push({
        type: 'truncated',
        field: 'nearby_ports',
        originalSize,
        newSize,
        details: `Truncated from ${originalCount} to ${this.options.maxPorts} ports`,
      });
    }

    // Compress reasoning_history
    if (optimized.reasoning_history?.length > 10) {
      const history = optimized.reasoning_history;
      const originalSize = this.estimateSize(history);

      // Keep last 5 and first 2
      optimized.reasoning_history = [
        ...history.slice(0, 2),
        { _compressed: true, _removed_count: history.length - 7 },
        ...history.slice(-5),
      ];

      const newSize = this.estimateSize(optimized.reasoning_history);
      changes.push({
        type: 'compressed',
        field: 'reasoning_history',
        originalSize,
        newSize,
        details: `Compressed from ${history.length} to ${optimized.reasoning_history.length} entries`,
      });
    }

    return optimized;
  }

  /**
   * Truncate message content
   */
  private truncateMessages(
    state: any,
    changes: OptimizationChange[]
  ): any {
    if (!Array.isArray(state.messages)) return state;

    const optimized = { ...state };
    const messages = [...optimized.messages];
    const maxLen = this.options.maxMessageContentLength;

    // Only keep recent messages
    if (messages.length > this.options.maxMessages) {
      const originalSize = this.estimateSize(messages);

      // Keep system message (first) and recent messages
      const systemMessages = messages.filter(
        (m: any) => m._getType?.() === 'system' || m.type === 'system'
      );
      const recentMessages = messages.slice(-(this.options.maxMessages - systemMessages.length));

      optimized.messages = [...systemMessages, ...recentMessages];
      optimized._messages_truncated = true;
      optimized._total_messages = messages.length;

      const newSize = this.estimateSize(optimized.messages);
      changes.push({
        type: 'truncated',
        field: 'messages',
        originalSize,
        newSize,
        details: `Truncated from ${messages.length} to ${optimized.messages.length} messages`,
      });
    }

    // Truncate long content in messages
    let contentTruncated = 0;
    optimized.messages = optimized.messages.map((msg: any) => {
      if (typeof msg.content === 'string' && msg.content.length > maxLen) {
        contentTruncated++;
        return {
          ...msg,
          content: msg.content.substring(0, maxLen) + '... [truncated]',
          _original_content_length: msg.content.length,
        };
      }
      return msg;
    });

    if (contentTruncated > 0) {
      changes.push({
        type: 'truncated',
        field: 'messages.content',
        originalSize: 0,
        newSize: 0,
        details: `Truncated content in ${contentTruncated} messages`,
      });
    }

    return optimized;
  }

  /**
   * Remove null, undefined, and empty values
   */
  private removeEmptyValues(
    state: any,
    changes: OptimizationChange[]
  ): any {
    const originalSize = this.estimateSize(state);
    const cleaned = this.cleanObject(state);
    const newSize = this.estimateSize(cleaned);

    if (newSize < originalSize) {
      changes.push({
        type: 'removed',
        field: '*',
        originalSize,
        newSize,
        details: `Removed null/undefined/empty values`,
      });
    }

    return cleaned;
  }

  /**
   * Recursively clean object of empty values
   */
  private cleanObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return undefined;
    }

    if (Array.isArray(obj)) {
      const cleaned = obj
        .map((item) => this.cleanObject(item))
        .filter((item) => item !== undefined);
      return cleaned.length > 0 ? cleaned : undefined;
    }

    if (typeof obj === 'object') {
      // Preserve special LangChain message types
      if (obj.constructor?.name?.includes('Message')) {
        return obj;
      }

      const cleaned: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        const cleanedValue = this.cleanObject(value);
        if (cleanedValue !== undefined && cleanedValue !== '') {
          cleaned[key] = cleanedValue;
        }
      }
      return Object.keys(cleaned).length > 0 ? cleaned : undefined;
    }

    return obj;
  }

  /**
   * Estimate size of a value in bytes
   */
  private estimateSize(value: any): number {
    try {
      return Buffer.byteLength(JSON.stringify(value), 'utf8');
    } catch {
      return 0;
    }
  }

  /**
   * Get size breakdown by field
   */
  getSizeBreakdown(state: any): Record<string, number> {
    const breakdown: Record<string, number> = {};

    for (const [key, value] of Object.entries(state)) {
      breakdown[key] = this.estimateSize(value);
    }

    // Sort by size (largest first)
    return Object.fromEntries(
      Object.entries(breakdown).sort(([, a], [, b]) => b - a)
    );
  }

  /**
   * Get optimization suggestions
   */
  getSuggestions(state: any): string[] {
    const suggestions: string[] = [];
    const breakdown = this.getSizeBreakdown(state);
    const totalSize = Object.values(breakdown).reduce((a, b) => a + b, 0);

    // Check for large fields
    for (const [field, size] of Object.entries(breakdown)) {
      if (size > totalSize * 0.3) {
        suggestions.push(
          `Field '${field}' is ${Math.round((size / totalSize) * 100)}% of state - consider compression`
        );
      }
    }

    // Check array sizes
    if (state.messages?.length > 20) {
      suggestions.push(
        `${state.messages.length} messages - consider truncating older messages`
      );
    }

    if (state.ports?.length > 30) {
      suggestions.push(
        `${state.ports.length} ports - consider limiting to top options`
      );
    }

    if (state.route?.waypoints?.length > 100) {
      suggestions.push(
        `${state.route.waypoints.length} waypoints - consider sampling or compression`
      );
    }

    // Check total size
    const schema = getCurrentSchema();
    if (totalSize > schema.maxTotalSize * 0.5) {
      suggestions.push(
        `State is ${Math.round((totalSize / schema.maxTotalSize) * 100)}% of limit - optimization recommended`
      );
    }

    return suggestions;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let optimizerInstance: StateOptimizer | null = null;

export function getStateOptimizer(options?: OptimizerOptions): StateOptimizer {
  if (!optimizerInstance) {
    optimizerInstance = new StateOptimizer(options);
  }
  return optimizerInstance;
}

/**
 * Quick optimize function
 */
export function optimizeState(
  state: any,
  schemaVersion: string = CURRENT_STATE_VERSION
): any {
  const optimizer = getStateOptimizer();
  const result = optimizer.optimize(state, schemaVersion);
  return result.optimizedState;
}
