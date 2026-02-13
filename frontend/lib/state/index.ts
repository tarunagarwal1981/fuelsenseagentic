/**
 * State Management Module
 *
 * Provides schema versioning, validation, migration, and optimization
 * for the multi-agent state.
 */

// Schema definitions
export {
  CURRENT_STATE_VERSION,
  STATE_SCHEMAS,
  StateSchemaV1,
  StateSchemaV2,
  StateSchemaV3,
  getSchema,
  getCurrentSchema,
  getSchemaVersions,
  isValidVersion,
  compareVersions,
} from './state-schema';

export type {
  StateSchema,
  FieldSchema,
  FieldType,
  ValidationResult,
} from './state-schema';

// Validator
export {
  StateValidator,
  getStateValidator,
  validateState,
  isStateValid,
} from './state-validator';

// Migrator
export {
  StateMigrator,
  getStateMigrator,
  autoMigrateState,
  stateNeedsMigration,
  detectStateVersion,
} from './state-migrator';

export type { MigrationResult, MigrationChange } from './state-migrator';

// Reference Store
export {
  StateReferenceStore,
} from './state-reference-store';

export type { ReferenceMetadata, RedisLike } from './state-reference-store';

// Compressor
export {
  StateCompressor,
} from './state-compressor';

export type {
  CompressionStats,
  CompressionInfo,
} from './state-compressor';

// Delta
export {
  StateDelta,
  getStateDelta,
} from './state-delta';

export type {
  FieldChange,
  StateDeltaResult,
} from './state-delta';

export type { HullPerformanceState } from './state-types';

// ============================================================================
// Convenience Functions
// ============================================================================

import { StateValidator, getStateValidator } from './state-validator';
import { StateMigrator, getStateMigrator } from './state-migrator';
import { StateOptimizer, getStateOptimizer } from './state-optimizer';
import { CURRENT_STATE_VERSION } from './state-schema';

/**
 * Process state before saving to checkpoint
 * - Adds version
 * - Validates
 * - Optimizes for storage
 */
export function prepareStateForCheckpoint(state: any): {
  state: any;
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const validator = getStateValidator();
  const optimizer = getStateOptimizer();

  // Add version
  const versionedState = {
    ...state,
    _schema_version: CURRENT_STATE_VERSION,
  };

  // Validate
  const validation = validator.validate(versionedState, CURRENT_STATE_VERSION);

  if (!validation.valid) {
    console.error('❌ [STATE] Validation failed before checkpoint:', validation.errors);
  }

  if (validation.warnings.length > 0) {
    console.warn('⚠️  [STATE] Validation warnings:', validation.warnings);
  }

  // Optimize
  const { optimizedState } = optimizer.optimize(versionedState, CURRENT_STATE_VERSION);

  return {
    state: optimizedState,
    valid: validation.valid,
    errors: validation.errors,
    warnings: validation.warnings,
  };
}

/**
 * Process state after loading from checkpoint
 * - Detects version
 * - Migrates if needed
 * - Validates
 */
export function processCheckpointState(state: any): {
  state: any;
  migrated: boolean;
  fromVersion: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const migrator = getStateMigrator();
  const validator = getStateValidator();

  // Detect version
  const fromVersion = migrator.detectVersion(state);
  let processedState = state;
  let migrated = false;

  // Migrate if needed
  if (fromVersion !== CURRENT_STATE_VERSION) {
    console.log(`📦 [STATE] Migrating checkpoint from ${fromVersion} to ${CURRENT_STATE_VERSION}`);
    try {
      const result = migrator.migrate(state, fromVersion, CURRENT_STATE_VERSION);
      processedState = result.migratedState;
      migrated = true;
    } catch (error: any) {
      console.error('❌ [STATE] Migration failed:', error.message);
      return {
        state,
        migrated: false,
        fromVersion,
        valid: false,
        errors: [`Migration failed: ${error.message}`],
        warnings: [],
      };
    }
  }

  // Validate
  const validation = validator.validate(processedState, CURRENT_STATE_VERSION);

  return {
    state: processedState,
    migrated,
    fromVersion,
    valid: validation.valid,
    errors: validation.errors,
    warnings: validation.warnings,
  };
}

/**
 * Get state health report
 */
export function getStateHealthReport(state: any): string {
  const validator = getStateValidator();
  const optimizer = getStateOptimizer();
  const migrator = getStateMigrator();

  const version = migrator.detectVersion(state);
  const validation = validator.validate(state, version);
  const breakdown = optimizer.getSizeBreakdown(state);
  const suggestions = optimizer.getSuggestions(state);
  const totalSize = Object.values(breakdown).reduce((a, b) => a + b, 0);

  const lines: string[] = [
    '📊 State Health Report',
    '======================',
    '',
    `Schema Version: ${version}`,
    `Current Version: ${CURRENT_STATE_VERSION}`,
    `Needs Migration: ${version !== CURRENT_STATE_VERSION ? 'Yes' : 'No'}`,
    '',
    `Validation: ${validation.valid ? '✅ Valid' : '❌ Invalid'}`,
    `  Errors: ${validation.errors.length}`,
    `  Warnings: ${validation.warnings.length}`,
    '',
    `Size: ${totalSize} bytes`,
    '',
    'Size Breakdown (top 5):',
  ];

  const topFields = Object.entries(breakdown).slice(0, 5);
  topFields.forEach(([field, size]) => {
    const percent = Math.round((size / totalSize) * 100);
    lines.push(`  ${field}: ${size} bytes (${percent}%)`);
  });

  if (suggestions.length > 0) {
    lines.push('');
    lines.push('Suggestions:');
    suggestions.forEach((s) => lines.push(`  - ${s}`));
  }

  if (validation.errors.length > 0) {
    lines.push('');
    lines.push('Errors:');
    validation.errors.forEach((e) => lines.push(`  ❌ ${e}`));
  }

  if (validation.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    validation.warnings.forEach((w) => lines.push(`  ⚠️  ${w}`));
  }

  return lines.join('\n');
}
