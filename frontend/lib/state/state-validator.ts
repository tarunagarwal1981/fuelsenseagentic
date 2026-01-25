/**
 * State Validator
 *
 * Validates multi-agent state against schema definitions.
 * Catches type mismatches, missing required fields, oversized data,
 * and deprecated field usage.
 */

import type { StateSchema, FieldSchema, FieldType, ValidationResult } from './state-schema';
import { STATE_SCHEMAS, CURRENT_STATE_VERSION, getCurrentSchema } from './state-schema';

// ============================================================================
// State Validator Class
// ============================================================================

export class StateValidator {
  private strictMode: boolean;

  constructor(options: { strictMode?: boolean } = {}) {
    this.strictMode = options.strictMode ?? false;
  }

  /**
   * Validate state against a schema version
   */
  validate(state: any, schemaVersion: string = CURRENT_STATE_VERSION): ValidationResult {
    const schema = STATE_SCHEMAS[schemaVersion];
    if (!schema) {
      return {
        valid: false,
        errors: [`Unknown schema version: ${schemaVersion}`],
        warnings: [],
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Check required fields are present
    this.validateRequiredFields(state, schema, errors);

    // 2. Validate each field in state
    this.validateFields(state, schema, errors, warnings);

    // 3. Check for unknown fields
    this.checkUnknownFields(state, schema, warnings);

    // 4. Check total state size
    this.validateTotalSize(state, schema, errors, warnings);

    // 5. Check for circular references
    if (this.hasCircularReference(state)) {
      errors.push('State contains circular references');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Quick validation check (returns boolean only)
   */
  isValid(state: any, schemaVersion: string = CURRENT_STATE_VERSION): boolean {
    const result = this.validate(state, schemaVersion);
    return result.valid;
  }

  /**
   * Validate required fields are present
   */
  private validateRequiredFields(
    state: any,
    schema: StateSchema,
    errors: string[]
  ): void {
    for (const fieldName of schema.required) {
      if (!(fieldName in state) || state[fieldName] === undefined) {
        errors.push(`Missing required field: ${fieldName}`);
      }
    }
  }

  /**
   * Validate each field against its schema
   */
  private validateFields(
    state: any,
    schema: StateSchema,
    errors: string[],
    warnings: string[]
  ): void {
    for (const [fieldName, value] of Object.entries(state)) {
      const fieldSchema = schema.fields[fieldName];

      // Skip unknown fields (handled separately)
      if (!fieldSchema) continue;

      // Skip null/undefined for nullable fields
      if ((value === null || value === undefined) && fieldSchema.nullable) {
        continue;
      }

      // Type validation
      if (value !== null && value !== undefined) {
        if (!this.validateType(value, fieldSchema.type)) {
          errors.push(
            `Field '${fieldName}' has invalid type: expected ${fieldSchema.type}, got ${typeof value}`
          );
        }
      }

      // Size validation
      if (fieldSchema.size && value !== null && value !== undefined) {
        const size = this.estimateSize(value);
        if (size > fieldSchema.size.max) {
          errors.push(
            `Field '${fieldName}' exceeds max size: ${size} bytes (max: ${fieldSchema.size.max})`
          );
        } else if (size > fieldSchema.size.current * 1.5) {
          warnings.push(
            `Field '${fieldName}' is larger than expected: ${size} bytes (expected: ~${fieldSchema.size.current})`
          );
        }
      }

      // Custom validator
      if (fieldSchema.validator && value !== null && value !== undefined) {
        const customResult = fieldSchema.validator(value);
        if (!customResult.valid) {
          errors.push(...customResult.errors.map((e) => `${fieldName}: ${e}`));
          warnings.push(...customResult.warnings.map((w) => `${fieldName}: ${w}`));
        }
      }

      // Deprecation warning
      if (fieldSchema.deprecated) {
        const replacementHint = fieldSchema.replacedBy
          ? `, use '${fieldSchema.replacedBy}' instead`
          : '';
        warnings.push(
          `Field '${fieldName}' is deprecated since ${fieldSchema.deprecatedSince || 'unknown'}${replacementHint}`
        );
      }
    }
  }

  /**
   * Check for unknown fields not in schema
   */
  private checkUnknownFields(
    state: any,
    schema: StateSchema,
    warnings: string[]
  ): void {
    for (const fieldName of Object.keys(state)) {
      // Skip internal fields
      if (fieldName.startsWith('_')) continue;

      if (!(fieldName in schema.fields)) {
        warnings.push(`Unknown field: '${fieldName}' (not in schema ${schema.version})`);
      }
    }
  }

  /**
   * Validate total state size
   */
  private validateTotalSize(
    state: any,
    schema: StateSchema,
    errors: string[],
    warnings: string[]
  ): void {
    const totalSize = this.estimateSize(state);

    if (totalSize > schema.maxTotalSize) {
      errors.push(
        `State size ${totalSize} bytes exceeds maximum ${schema.maxTotalSize} bytes`
      );
    } else if (totalSize > schema.maxTotalSize * 0.8) {
      warnings.push(
        `State size ${totalSize} bytes approaching limit of ${schema.maxTotalSize} bytes`
      );
    }
  }

  /**
   * Validate a value matches expected type
   */
  private validateType(value: any, expectedType: FieldType): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';

      case 'number':
        return typeof value === 'number' && !isNaN(value);

      case 'boolean':
        return typeof value === 'boolean';

      case 'date':
        return value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)));

      case 'array':
        return Array.isArray(value);

      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);

      case 'message[]':
        return Array.isArray(value);

      case 'route':
        return this.isValidRoute(value);

      case 'port[]':
        return Array.isArray(value) && value.every((p) => this.isValidPort(p));

      case 'bunker_analysis':
        return this.isValidBunkerAnalysis(value);

      case 'weather_data':
        return this.isValidWeatherData(value);

      case 'cii_rating':
        return this.isValidCIIRating(value);

      case 'eu_ets_calculation':
        return this.isValidETSCalculation(value);

      case 'execution_plan':
        return this.isValidExecutionPlan(value);

      case 'execution_result':
        return this.isValidExecutionResult(value);

      default:
        return true;
    }
  }

  // ========================================================================
  // Domain Type Validators
  // ========================================================================

  private isValidRoute(value: any): boolean {
    if (typeof value !== 'object' || value === null) return false;

    // Check for core route fields
    const hasDistance = typeof value.distance_nm === 'number' ||
                        typeof value.total_distance_nm === 'number' ||
                        typeof value.totalDistanceNM === 'number';

    const hasWaypoints = Array.isArray(value.waypoints) || Array.isArray(value.path);

    return hasDistance || hasWaypoints;
  }

  private isValidPort(value: any): boolean {
    if (typeof value !== 'object' || value === null) return false;

    // Check for port identifier
    const hasCode = typeof value.code === 'string' ||
                    typeof value.port_code === 'string' ||
                    typeof value.portCode === 'string';

    const hasName = typeof value.name === 'string' ||
                    typeof value.port_name === 'string' ||
                    typeof value.portName === 'string';

    return hasCode || hasName;
  }

  private isValidBunkerAnalysis(value: any): boolean {
    if (typeof value !== 'object' || value === null) return false;

    // Check for analysis structure
    const hasRecommendations = Array.isArray(value.recommendations) ||
                               Array.isArray(value.options);

    const hasBestOption = value.best_option !== undefined ||
                          value.bestOption !== undefined ||
                          value.recommended !== undefined;

    return hasRecommendations || hasBestOption;
  }

  private isValidWeatherData(value: any): boolean {
    if (typeof value !== 'object' || value === null) return false;

    // Check for weather structure
    const hasTimeline = Array.isArray(value.timeline) ||
                        Array.isArray(value.forecasts);

    const hasImpact = typeof value.impact === 'object' ||
                      typeof value.consumption_impact === 'number';

    return hasTimeline || hasImpact || Object.keys(value).length > 0;
  }

  private isValidCIIRating(value: any): boolean {
    if (typeof value !== 'object' || value === null) return false;

    const hasRating = typeof value.rating === 'string';
    const hasCIIValue = typeof value.cii_value === 'number' ||
                        typeof value.ciiValue === 'number' ||
                        typeof value.attained_cii === 'number';

    return hasRating || hasCIIValue;
  }

  private isValidETSCalculation(value: any): boolean {
    if (typeof value !== 'object' || value === null) return false;

    const hasCost = typeof value.total_cost_usd === 'number' ||
                    typeof value.totalCostUSD === 'number' ||
                    typeof value.ets_cost === 'number';

    const hasEmissions = typeof value.emissions_tonnes === 'number' ||
                         typeof value.emissionsTonnes === 'number';

    return hasCost || hasEmissions;
  }

  private isValidExecutionPlan(value: any): boolean {
    if (typeof value !== 'object' || value === null) return false;

    const hasPlanId = typeof value.planId === 'string';
    const hasStages = Array.isArray(value.stages);
    const hasWorkflow = typeof value.workflowId === 'string' ||
                        typeof value.queryType === 'string';

    return hasPlanId || hasStages || hasWorkflow;
  }

  private isValidExecutionResult(value: any): boolean {
    if (typeof value !== 'object' || value === null) return false;

    const hasPlanId = typeof value.planId === 'string';
    const hasSuccess = typeof value.success === 'boolean';
    const hasStages = Array.isArray(value.stagesCompleted) ||
                      Array.isArray(value.stagesFailed);

    return hasPlanId || hasSuccess || hasStages;
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  /**
   * Estimate size of a value in bytes
   */
  private estimateSize(value: any): number {
    try {
      return Buffer.byteLength(JSON.stringify(value), 'utf8');
    } catch {
      // Handle circular references or non-serializable values
      return 0;
    }
  }

  /**
   * Check for circular references
   */
  private hasCircularReference(obj: any, seen = new WeakSet()): boolean {
    if (obj && typeof obj === 'object') {
      if (seen.has(obj)) return true;
      seen.add(obj);

      for (const value of Object.values(obj)) {
        if (this.hasCircularReference(value, seen)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get a summary of state validation issues
   */
  getSummary(state: any, schemaVersion: string = CURRENT_STATE_VERSION): string {
    const result = this.validate(state, schemaVersion);

    const lines: string[] = [
      `State Validation Summary (schema ${schemaVersion})`,
      `  Status: ${result.valid ? '✅ Valid' : '❌ Invalid'}`,
      `  Errors: ${result.errors.length}`,
      `  Warnings: ${result.warnings.length}`,
    ];

    if (result.errors.length > 0) {
      lines.push('  Errors:');
      result.errors.forEach((e) => lines.push(`    - ${e}`));
    }

    if (result.warnings.length > 0) {
      lines.push('  Warnings:');
      result.warnings.forEach((w) => lines.push(`    - ${w}`));
    }

    return lines.join('\n');
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let validatorInstance: StateValidator | null = null;

export function getStateValidator(): StateValidator {
  if (!validatorInstance) {
    validatorInstance = new StateValidator();
  }
  return validatorInstance;
}

/**
 * Quick validation function
 */
export function validateState(
  state: any,
  schemaVersion: string = CURRENT_STATE_VERSION
): ValidationResult {
  return getStateValidator().validate(state, schemaVersion);
}

/**
 * Quick check if state is valid
 */
export function isStateValid(
  state: any,
  schemaVersion: string = CURRENT_STATE_VERSION
): boolean {
  return getStateValidator().isValid(state, schemaVersion);
}
