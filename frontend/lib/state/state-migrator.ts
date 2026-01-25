/**
 * State Migrator
 *
 * Handles automatic migration of state between schema versions.
 * Ensures backward compatibility for existing conversations.
 */

import type { StateSchema, ValidationResult } from './state-schema';
import {
  STATE_SCHEMAS,
  CURRENT_STATE_VERSION,
  getSchemaVersions,
  compareVersions,
} from './state-schema';
import { StateValidator, getStateValidator } from './state-validator';

// ============================================================================
// Types
// ============================================================================

export interface MigrationResult {
  success: boolean;
  fromVersion: string;
  toVersion: string;
  migratedState: any;
  changes: MigrationChange[];
  validation: ValidationResult;
}

export interface MigrationChange {
  type: 'added' | 'removed' | 'renamed' | 'transformed';
  field: string;
  details: string;
}

interface VersionInfo {
  major: number;
  minor: number;
  patch: number;
}

// ============================================================================
// State Migrator Class
// ============================================================================

export class StateMigrator {
  private validator: StateValidator;

  constructor() {
    this.validator = getStateValidator();
  }

  /**
   * Migrate state to a target version
   */
  migrate(
    state: any,
    fromVersion: string,
    toVersion: string = CURRENT_STATE_VERSION
  ): MigrationResult {
    console.log(`🔄 [STATE-MIGRATOR] Migrating state: ${fromVersion} → ${toVersion}`);

    const changes: MigrationChange[] = [];

    // Validate source and target versions
    if (!STATE_SCHEMAS[fromVersion]) {
      throw new Error(`Unknown source schema version: ${fromVersion}`);
    }
    if (!STATE_SCHEMAS[toVersion]) {
      throw new Error(`Unknown target schema version: ${toVersion}`);
    }

    // No migration needed if same version
    if (fromVersion === toVersion) {
      console.log('✅ [STATE-MIGRATOR] No migration needed (same version)');
      return {
        success: true,
        fromVersion,
        toVersion,
        migratedState: state,
        changes: [],
        validation: this.validator.validate(state, toVersion),
      };
    }

    // Check migration direction
    const direction = compareVersions(fromVersion, toVersion);
    if (direction > 0) {
      throw new Error(
        `Downgrade migrations not supported: ${fromVersion} → ${toVersion}`
      );
    }

    // Apply migrations step by step
    let currentState = { ...state };
    const versions = getSchemaVersions();

    // Find start and end indices
    const startIdx = versions.indexOf(fromVersion);
    const endIdx = versions.indexOf(toVersion);

    // Apply each migration in sequence
    for (let i = startIdx; i < endIdx; i++) {
      const from = versions[i];
      const to = versions[i + 1];

      console.log(`   Step: ${from} → ${to}`);

      const stepResult = this.applyMigration(currentState, from, to);
      currentState = stepResult.state;
      changes.push(...stepResult.changes);
    }

    // Add schema version to migrated state
    currentState._schema_version = toVersion;
    changes.push({
      type: 'added',
      field: '_schema_version',
      details: `Set to ${toVersion}`,
    });

    // Validate final state
    const validation = this.validator.validate(currentState, toVersion);

    if (!validation.valid) {
      console.error('❌ [STATE-MIGRATOR] Migration produced invalid state');
      console.error('   Errors:', validation.errors);
      throw new Error(`Migration failed: ${validation.errors.join(', ')}`);
    }

    if (validation.warnings.length > 0) {
      console.warn('⚠️  [STATE-MIGRATOR] Migration warnings:', validation.warnings);
    }

    console.log(
      `✅ [STATE-MIGRATOR] Migration complete: ${changes.length} changes applied`
    );

    return {
      success: true,
      fromVersion,
      toVersion,
      migratedState: currentState,
      changes,
      validation,
    };
  }

  /**
   * Apply a single version migration
   */
  private applyMigration(
    state: any,
    fromVersion: string,
    toVersion: string
  ): { state: any; changes: MigrationChange[] } {
    const from = this.parseVersion(fromVersion);
    const to = this.parseVersion(toVersion);
    const changes: MigrationChange[] = [];

    let migratedState = { ...state };

    // Major version migrations
    if (from.major === 1 && to.major === 2) {
      const result = this.migrateV1toV2(migratedState);
      migratedState = result.state;
      changes.push(...result.changes);
    } else if (from.major === 2 && to.major === 3) {
      const result = this.migrateV2toV3(migratedState);
      migratedState = result.state;
      changes.push(...result.changes);
    } else if (from.major === to.major) {
      // Minor version migrations (additive only)
      const result = this.applyMinorMigration(migratedState, fromVersion, toVersion);
      migratedState = result.state;
      changes.push(...result.changes);
    }

    return { state: migratedState, changes };
  }

  /**
   * Migrate from v1.0.0 to v2.0.0
   */
  private migrateV1toV2(state: any): { state: any; changes: MigrationChange[] } {
    const changes: MigrationChange[] = [];
    const migrated = { ...state };

    // Add execution plan fields
    if (migrated.execution_plan === undefined) {
      migrated.execution_plan = null;
      changes.push({
        type: 'added',
        field: 'execution_plan',
        details: 'Added with default null',
      });
    }

    if (migrated.execution_result === undefined) {
      migrated.execution_result = null;
      changes.push({
        type: 'added',
        field: 'execution_result',
        details: 'Added with default null',
      });
    }

    if (migrated.workflow_stage === undefined) {
      migrated.workflow_stage = 0;
      changes.push({
        type: 'added',
        field: 'workflow_stage',
        details: 'Added with default 0',
      });
    }

    // Add agentic supervisor fields
    if (migrated.reasoning_history === undefined) {
      migrated.reasoning_history = [];
      changes.push({
        type: 'added',
        field: 'reasoning_history',
        details: 'Added with empty array',
      });
    }

    if (migrated.current_thought === undefined) {
      migrated.current_thought = null;
      changes.push({
        type: 'added',
        field: 'current_thought',
        details: 'Added with default null',
      });
    }

    if (migrated.next_action === undefined) {
      migrated.next_action = null;
      changes.push({
        type: 'added',
        field: 'next_action',
        details: 'Added with default null',
      });
    }

    if (migrated.error_recovery_attempts === undefined) {
      migrated.error_recovery_attempts = 0;
      changes.push({
        type: 'added',
        field: 'error_recovery_attempts',
        details: 'Added with default 0',
      });
    }

    // Add CII fields (null by default)
    if (migrated.cii_rating === undefined) {
      migrated.cii_rating = null;
      changes.push({
        type: 'added',
        field: 'cii_rating',
        details: 'Added for CII agent support',
      });
    }

    if (migrated.cii_recommendations === undefined) {
      migrated.cii_recommendations = null;
      changes.push({
        type: 'added',
        field: 'cii_recommendations',
        details: 'Added for CII agent support',
      });
    }

    // Add EU ETS fields (null by default)
    if (migrated.eu_ets_cost === undefined) {
      migrated.eu_ets_cost = null;
      changes.push({
        type: 'added',
        field: 'eu_ets_cost',
        details: 'Added for EU ETS agent support',
      });
    }

    if (migrated.emissions_breakdown === undefined) {
      migrated.emissions_breakdown = null;
      changes.push({
        type: 'added',
        field: 'emissions_breakdown',
        details: 'Added for EU ETS agent support',
      });
    }

    // Add compliance fields
    if (migrated.compliance_data === undefined) {
      migrated.compliance_data = null;
      changes.push({
        type: 'added',
        field: 'compliance_data',
        details: 'Added for compliance agent support',
      });
    }

    return { state: migrated, changes };
  }

  /**
   * Migrate from v2.0.0 to v3.0.0
   */
  private migrateV2toV3(state: any): { state: any; changes: MigrationChange[] } {
    const changes: MigrationChange[] = [];
    const migrated = { ...state };

    // Add hull performance fields
    if (migrated.hull_performance === undefined) {
      migrated.hull_performance = null;
      changes.push({
        type: 'added',
        field: 'hull_performance',
        details: 'Added for hull performance agent',
      });
    }

    if (migrated.fouling_assessment === undefined) {
      migrated.fouling_assessment = null;
      changes.push({
        type: 'added',
        field: 'fouling_assessment',
        details: 'Added for fouling analysis',
      });
    }

    if (migrated.propulsion_efficiency === undefined) {
      migrated.propulsion_efficiency = null;
      changes.push({
        type: 'added',
        field: 'propulsion_efficiency',
        details: 'Added for efficiency metrics',
      });
    }

    if (migrated.speed_optimization === undefined) {
      migrated.speed_optimization = null;
      changes.push({
        type: 'added',
        field: 'speed_optimization',
        details: 'Added for speed optimization',
      });
    }

    if (migrated.multi_port_plan === undefined) {
      migrated.multi_port_plan = null;
      changes.push({
        type: 'added',
        field: 'multi_port_plan',
        details: 'Added for multi-port planning',
      });
    }

    return { state: migrated, changes };
  }

  /**
   * Apply minor version migration (additive fields only)
   */
  private applyMinorMigration(
    state: any,
    fromVersion: string,
    toVersion: string
  ): { state: any; changes: MigrationChange[] } {
    const changes: MigrationChange[] = [];
    const migrated = { ...state };

    const toSchema = STATE_SCHEMAS[toVersion];
    const fromSchema = STATE_SCHEMAS[fromVersion];

    // Add new fields from target schema that don't exist in source
    for (const [fieldName, fieldSchema] of Object.entries(toSchema.fields)) {
      if (!(fieldName in fromSchema.fields) && !(fieldName in migrated)) {
        migrated[fieldName] = fieldSchema.default ?? null;
        changes.push({
          type: 'added',
          field: fieldName,
          details: `Added in ${toVersion}`,
        });
      }
    }

    return { state: migrated, changes };
  }

  /**
   * Detect the version of a state object
   */
  detectVersion(state: any): string {
    // Check explicit version field
    if (state._schema_version && STATE_SCHEMAS[state._schema_version]) {
      return state._schema_version;
    }

    // Infer from present fields (reverse version order - newest first)
    const versions = getSchemaVersions().reverse();

    // Check for v3 fields
    if ('hull_performance' in state || 'fouling_assessment' in state) {
      return '3.0.0';
    }

    // Check for v2 fields
    if (
      'execution_plan' in state ||
      'cii_rating' in state ||
      'eu_ets_cost' in state ||
      'reasoning_history' in state
    ) {
      return '2.0.0';
    }

    // Default to v1
    return '1.0.0';
  }

  /**
   * Auto-migrate state to current version if needed
   */
  autoMigrate(state: any): MigrationResult {
    const detectedVersion = this.detectVersion(state);

    if (detectedVersion === CURRENT_STATE_VERSION) {
      return {
        success: true,
        fromVersion: detectedVersion,
        toVersion: CURRENT_STATE_VERSION,
        migratedState: state,
        changes: [],
        validation: this.validator.validate(state, CURRENT_STATE_VERSION),
      };
    }

    return this.migrate(state, detectedVersion, CURRENT_STATE_VERSION);
  }

  /**
   * Check if state needs migration
   */
  needsMigration(state: any): boolean {
    const detectedVersion = this.detectVersion(state);
    return detectedVersion !== CURRENT_STATE_VERSION;
  }

  /**
   * Parse semantic version string
   */
  private parseVersion(version: string): VersionInfo {
    const [major, minor, patch] = version.split('.').map(Number);
    return { major: major || 0, minor: minor || 0, patch: patch || 0 };
  }

  /**
   * Get migration path between versions
   */
  getMigrationPath(fromVersion: string, toVersion: string): string[] {
    const versions = getSchemaVersions();
    const startIdx = versions.indexOf(fromVersion);
    const endIdx = versions.indexOf(toVersion);

    if (startIdx === -1 || endIdx === -1) {
      return [];
    }

    return versions.slice(startIdx, endIdx + 1);
  }

  /**
   * Get summary of what migration would do
   */
  getMigrationPreview(
    state: any,
    fromVersion: string,
    toVersion: string
  ): string[] {
    const path = this.getMigrationPath(fromVersion, toVersion);
    const preview: string[] = [];

    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i];
      const to = path[i + 1];
      preview.push(`${from} → ${to}:`);

      const toSchema = STATE_SCHEMAS[to];
      const fromSchema = STATE_SCHEMAS[from];

      // Find new fields
      for (const fieldName of Object.keys(toSchema.fields)) {
        if (!(fieldName in fromSchema.fields)) {
          preview.push(`  + ${fieldName}`);
        }
      }

      // Find deprecated fields
      for (const fieldName of toSchema.deprecated || []) {
        preview.push(`  - ${fieldName} (deprecated)`);
      }
    }

    return preview;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let migratorInstance: StateMigrator | null = null;

export function getStateMigrator(): StateMigrator {
  if (!migratorInstance) {
    migratorInstance = new StateMigrator();
  }
  return migratorInstance;
}

/**
 * Quick auto-migrate function
 */
export function autoMigrateState(state: any): any {
  const migrator = getStateMigrator();
  const result = migrator.autoMigrate(state);
  return result.migratedState;
}

/**
 * Check if state needs migration
 */
export function stateNeedsMigration(state: any): boolean {
  return getStateMigrator().needsMigration(state);
}

/**
 * Detect state version
 */
export function detectStateVersion(state: any): string {
  return getStateMigrator().detectVersion(state);
}
