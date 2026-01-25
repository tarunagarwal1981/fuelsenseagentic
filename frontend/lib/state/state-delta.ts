/**
 * State Delta
 *
 * Delta-based state updates (store only changes between checkpoints).
 * Further reduces storage by only storing modified fields.
 */

// ============================================================================
// Types
// ============================================================================

export interface FieldChange {
  type: 'added' | 'modified' | 'removed';
  oldValue: any;
  newValue: any;
}

export interface StateDeltaResult {
  changes: Record<string, FieldChange>;
  changeCount: number;
  deltaSize: number;
  fullStateSize: number;
  savingsPercent: number;
}

// ============================================================================
// State Delta Class
// ============================================================================

export class StateDelta {
  /**
   * Compute delta between two states
   */
  computeDelta(oldState: any, newState: any): StateDeltaResult {
    const changes: Record<string, FieldChange> = {};

    // Find added/modified fields
    for (const [key, value] of Object.entries(newState)) {
      // Skip internal fields
      if (key.startsWith('_')) continue;

      if (!(key in oldState)) {
        // New field
        changes[key] = {
          type: 'added',
          oldValue: undefined,
          newValue: value,
        };
      } else if (
        JSON.stringify(oldState[key]) !== JSON.stringify(value)
      ) {
        // Modified field
        changes[key] = {
          type: 'modified',
          oldValue: oldState[key],
          newValue: value,
        };
      }
    }

    // Find removed fields
    for (const key of Object.keys(oldState)) {
      // Skip internal fields
      if (key.startsWith('_')) continue;

      if (!(key in newState)) {
        changes[key] = {
          type: 'removed',
          oldValue: oldState[key],
          newValue: undefined,
        };
      }
    }

    const changeCount = Object.keys(changes).length;
    const deltaSize = Buffer.byteLength(JSON.stringify(changes), 'utf8');
    const fullStateSize = Buffer.byteLength(JSON.stringify(newState), 'utf8');
    const savingsPercent =
      fullStateSize > 0
        ? parseFloat(((1 - deltaSize / fullStateSize) * 100).toFixed(1))
        : 0;

    if (changeCount > 0) {
      console.log(
        `Δ Delta computed: ${changeCount} changes, ${deltaSize} bytes (${savingsPercent}% vs full state)`
      );
    }

    return {
      changes,
      changeCount,
      deltaSize,
      fullStateSize,
      savingsPercent,
    };
  }

  /**
   * Apply delta to base state
   */
  applyDelta(baseState: any, delta: StateDeltaResult): any {
    const newState = { ...baseState };

    for (const [key, change] of Object.entries(delta.changes)) {
      switch (change.type) {
        case 'added':
        case 'modified':
          newState[key] = change.newValue;
          break;
        case 'removed':
          delete newState[key];
          break;
      }
    }

    return newState;
  }

  /**
   * Determine if delta is beneficial
   */
  shouldUseDelta(delta: StateDeltaResult): boolean {
    // Use delta if it saves > 30% space
    return delta.savingsPercent > 30;
  }

  /**
   * Get summary of changes
   */
  getChangeSummary(delta: StateDeltaResult): {
    added: number;
    modified: number;
    removed: number;
  } {
    let added = 0;
    let modified = 0;
    let removed = 0;

    for (const change of Object.values(delta.changes)) {
      switch (change.type) {
        case 'added':
          added++;
          break;
        case 'modified':
          modified++;
          break;
        case 'removed':
          removed++;
          break;
      }
    }

    return { added, modified, removed };
  }

  /**
   * Check if delta is empty (no changes)
   */
  isEmpty(delta: StateDeltaResult): boolean {
    return delta.changeCount === 0;
  }

  /**
   * Merge multiple deltas into one
   */
  mergeDeltas(deltas: StateDeltaResult[]): StateDeltaResult {
    const mergedChanges: Record<string, FieldChange> = {};

    // Apply deltas in order
    for (const delta of deltas) {
      for (const [key, change] of Object.entries(delta.changes)) {
        mergedChanges[key] = change;
      }
    }

    const changeCount = Object.keys(mergedChanges).length;
    const deltaSize = Buffer.byteLength(
      JSON.stringify(mergedChanges),
      'utf8'
    );

    // Estimate full state size (would need actual state for accurate calculation)
    const fullStateSize = deltaSize * 2; // Rough estimate

    return {
      changes: mergedChanges,
      changeCount,
      deltaSize,
      fullStateSize,
      savingsPercent:
        fullStateSize > 0
          ? parseFloat(((1 - deltaSize / fullStateSize) * 100).toFixed(1))
          : 0,
    };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let deltaInstance: StateDelta | null = null;

export function getStateDelta(): StateDelta {
  if (!deltaInstance) {
    deltaInstance = new StateDelta();
  }
  return deltaInstance;
}
