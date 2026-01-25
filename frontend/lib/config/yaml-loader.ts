/**
 * YAML Loader
 *
 * Generic YAML loading utilities with validation and hot-reload support.
 * Provides type-safe loading of YAML configuration files.
 */

import { readFileSync, existsSync, readdirSync, watch, FSWatcher } from 'fs';
import { join, basename, extname, resolve } from 'path';
import { parse as parseYAML } from 'yaml';
import type { ConfigValidationResult, ConfigValidationError } from '@/lib/types/config';

// ============================================================================
// Types
// ============================================================================

export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  additionalProperties?: boolean | JSONSchema;
}

export interface LoadYAMLOptions {
  validate?: boolean;
  schema?: JSONSchema;
  throwOnError?: boolean;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get the base config directory path
 */
export function getConfigDir(): string {
  return resolve(process.cwd(), 'config');
}

/**
 * Load a single YAML file and parse it
 *
 * @param path - Path to the YAML file (relative to config dir or absolute)
 * @param options - Loading options
 * @returns Parsed YAML content
 */
export function loadYAML<T>(path: string, options: LoadYAMLOptions = {}): T {
  const { validate = false, schema, throwOnError = true } = options;

  // Resolve path
  const fullPath = path.startsWith('/') ? path : join(getConfigDir(), path);

  if (!existsSync(fullPath)) {
    const error = `YAML file not found: ${fullPath}`;
    if (throwOnError) {
      throw new Error(error);
    }
    console.error(`❌ [YAML-LOADER] ${error}`);
    return {} as T;
  }

  try {
    const fileContent = readFileSync(fullPath, 'utf-8');
    const data = parseYAML(fileContent) as T;

    // Validate if schema provided
    if (validate && schema) {
      const validation = validateAgainstSchema(data, schema);
      if (!validation.valid) {
        const errorMsg = `YAML validation failed for ${path}: ${validation.errors.map((e) => e.message).join(', ')}`;
        if (throwOnError) {
          throw new Error(errorMsg);
        }
        console.error(`❌ [YAML-LOADER] ${errorMsg}`);
      }
    }

    return data;
  } catch (error: any) {
    if (error.message.includes('YAML validation failed')) {
      throw error;
    }
    const errorMsg = `Failed to parse YAML ${path}: ${error.message}`;
    if (throwOnError) {
      throw new Error(errorMsg);
    }
    console.error(`❌ [YAML-LOADER] ${errorMsg}`);
    return {} as T;
  }
}

/**
 * Load a single YAML file asynchronously
 */
export async function loadYAMLAsync<T>(
  path: string,
  options: LoadYAMLOptions = {}
): Promise<T> {
  // Use sync version wrapped in Promise for now
  // Could be made truly async with fs/promises
  return new Promise((resolve, reject) => {
    try {
      const result = loadYAML<T>(path, options);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Load all YAML files from a directory
 *
 * @param dir - Directory path (relative to config dir or absolute)
 * @returns Map of filename (without extension) to parsed content
 */
export function loadAllYAMLFromDirectory<T>(dir: string): Map<string, T> {
  const results = new Map<string, T>();
  const fullDir = dir.startsWith('/') ? dir : join(getConfigDir(), dir);

  if (!existsSync(fullDir)) {
    console.warn(`⚠️  [YAML-LOADER] Directory not found: ${fullDir}`);
    return results;
  }

  const files = readdirSync(fullDir);
  const yamlFiles = files.filter(
    (f) => extname(f) === '.yaml' || extname(f) === '.yml'
  );

  for (const file of yamlFiles) {
    const id = basename(file, extname(file));
    const filePath = join(fullDir, file);

    try {
      const data = loadYAML<T>(filePath, { throwOnError: false });
      if (Object.keys(data as object).length > 0) {
        results.set(id, data);
      }
    } catch (error: any) {
      console.error(`❌ [YAML-LOADER] Failed to load ${file}: ${error.message}`);
    }
  }

  console.log(`📁 [YAML-LOADER] Loaded ${results.size} files from ${dir}`);
  return results;
}

/**
 * Load all YAML files from a directory asynchronously
 */
export async function loadAllYAMLFromDirectoryAsync<T>(
  dir: string
): Promise<Map<string, T>> {
  return new Promise((resolve) => {
    const result = loadAllYAMLFromDirectory<T>(dir);
    resolve(result);
  });
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate YAML content against a JSON schema
 */
export function validateAgainstSchema(
  data: any,
  schema: JSONSchema,
  path: string = ''
): ConfigValidationResult {
  const errors: ConfigValidationError[] = [];
  const warnings: ConfigValidationError[] = [];

  // Type validation
  if (schema.type) {
    const actualType = Array.isArray(data) ? 'array' : typeof data;
    if (schema.type === 'integer') {
      if (typeof data !== 'number' || !Number.isInteger(data)) {
        errors.push({
          path,
          message: `Expected integer, got ${actualType}`,
          value: data,
        });
      }
    } else if (actualType !== schema.type && data !== undefined && data !== null) {
      errors.push({
        path,
        message: `Expected ${schema.type}, got ${actualType}`,
        value: data,
      });
    }
  }

  // Required fields
  if (schema.required && schema.type === 'object' && typeof data === 'object') {
    for (const field of schema.required) {
      if (!(field in data) || data[field] === undefined) {
        errors.push({
          path: path ? `${path}.${field}` : field,
          message: `Required field missing: ${field}`,
        });
      }
    }
  }

  // Enum validation
  if (schema.enum && data !== undefined) {
    if (!schema.enum.includes(data)) {
      errors.push({
        path,
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        value: data,
      });
    }
  }

  // Number constraints
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push({
        path,
        message: `Value ${data} is less than minimum ${schema.minimum}`,
        value: data,
      });
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push({
        path,
        message: `Value ${data} is greater than maximum ${schema.maximum}`,
        value: data,
      });
    }
  }

  // String constraints
  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push({
        path,
        message: `String length ${data.length} is less than minimum ${schema.minLength}`,
        value: data,
      });
    }
    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      errors.push({
        path,
        message: `String length ${data.length} is greater than maximum ${schema.maxLength}`,
        value: data,
      });
    }
    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(data)) {
        errors.push({
          path,
          message: `String does not match pattern: ${schema.pattern}`,
          value: data,
        });
      }
    }
  }

  // Nested object validation
  if (schema.properties && typeof data === 'object' && data !== null) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in data) {
        const nestedResult = validateAgainstSchema(
          data[key],
          propSchema,
          path ? `${path}.${key}` : key
        );
        errors.push(...nestedResult.errors);
        warnings.push(...nestedResult.warnings);
      }
    }
  }

  // Array validation
  if (schema.items && Array.isArray(data)) {
    data.forEach((item, index) => {
      const itemResult = validateAgainstSchema(
        item,
        schema.items!,
        `${path}[${index}]`
      );
      errors.push(...itemResult.errors);
      warnings.push(...itemResult.warnings);
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a YAML file against a schema
 */
export function validateYAML(
  path: string,
  schema: JSONSchema
): ConfigValidationResult {
  try {
    const data = loadYAML(path, { throwOnError: true });
    return validateAgainstSchema(data, schema);
  } catch (error: any) {
    return {
      valid: false,
      errors: [{ path, message: error.message }],
      warnings: [],
    };
  }
}

// ============================================================================
// Hot Reload (Development)
// ============================================================================

const watchers: Map<string, FSWatcher> = new Map();

/**
 * Watch a YAML file for changes (development only)
 *
 * @param path - Path to watch
 * @param onChange - Callback when file changes
 * @returns Cleanup function
 */
export function watchYAML<T>(
  path: string,
  onChange: (data: T) => void
): () => void {
  // Only watch in development
  if (process.env.NODE_ENV !== 'development') {
    console.log(
      `⏭️  [YAML-LOADER] Hot reload disabled in ${process.env.NODE_ENV} mode`
    );
    return () => {};
  }

  const fullPath = path.startsWith('/') ? path : join(getConfigDir(), path);

  if (!existsSync(fullPath)) {
    console.warn(`⚠️  [YAML-LOADER] Cannot watch non-existent file: ${fullPath}`);
    return () => {};
  }

  // Close existing watcher if any
  if (watchers.has(fullPath)) {
    watchers.get(fullPath)!.close();
  }

  let debounceTimer: NodeJS.Timeout | null = null;

  const watcher = watch(fullPath, (eventType) => {
    if (eventType === 'change') {
      // Debounce rapid changes
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        console.log(`🔄 [YAML-LOADER] File changed: ${path}`);
        try {
          const data = loadYAML<T>(fullPath, { throwOnError: false });
          onChange(data);
        } catch (error: any) {
          console.error(
            `❌ [YAML-LOADER] Failed to reload ${path}: ${error.message}`
          );
        }
      }, 100);
    }
  });

  watchers.set(fullPath, watcher);
  console.log(`👁️  [YAML-LOADER] Watching for changes: ${path}`);

  // Return cleanup function
  return () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    watcher.close();
    watchers.delete(fullPath);
    console.log(`🛑 [YAML-LOADER] Stopped watching: ${path}`);
  };
}

/**
 * Watch a directory for YAML file changes
 */
export function watchYAMLDirectory<T>(
  dir: string,
  onUpdate: (id: string, data: T | null) => void
): () => void {
  if (process.env.NODE_ENV !== 'development') {
    return () => {};
  }

  const fullDir = dir.startsWith('/') ? dir : join(getConfigDir(), dir);

  if (!existsSync(fullDir)) {
    console.warn(`⚠️  [YAML-LOADER] Cannot watch non-existent directory: ${fullDir}`);
    return () => {};
  }

  let debounceTimer: NodeJS.Timeout | null = null;

  const watcher = watch(fullDir, (eventType, filename) => {
    if (!filename) return;
    if (!filename.endsWith('.yaml') && !filename.endsWith('.yml')) return;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      const id = basename(filename, extname(filename));
      const filePath = join(fullDir, filename);

      if (existsSync(filePath)) {
        console.log(`🔄 [YAML-LOADER] File changed: ${filename}`);
        try {
          const data = loadYAML<T>(filePath, { throwOnError: false });
          onUpdate(id, data);
        } catch (error: any) {
          console.error(`❌ [YAML-LOADER] Failed to reload ${filename}: ${error.message}`);
        }
      } else {
        console.log(`🗑️  [YAML-LOADER] File deleted: ${filename}`);
        onUpdate(id, null);
      }
    }, 100);
  });

  watchers.set(fullDir, watcher);
  console.log(`👁️  [YAML-LOADER] Watching directory: ${dir}`);

  return () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    watcher.close();
    watchers.delete(fullDir);
    console.log(`🛑 [YAML-LOADER] Stopped watching directory: ${dir}`);
  };
}

/**
 * Stop all watchers
 */
export function stopAllWatchers(): void {
  watchers.forEach((watcher, path) => {
    watcher.close();
    console.log(`🛑 [YAML-LOADER] Stopped watching: ${path}`);
  });
  watchers.clear();
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Check if a YAML file exists
 */
export function yamlExists(path: string): boolean {
  const fullPath = path.startsWith('/') ? path : join(getConfigDir(), path);
  return existsSync(fullPath);
}

/**
 * List all YAML files in a directory
 */
export function listYAMLFiles(dir: string): string[] {
  const fullDir = dir.startsWith('/') ? dir : join(getConfigDir(), dir);

  if (!existsSync(fullDir)) {
    return [];
  }

  return readdirSync(fullDir)
    .filter((f) => extname(f) === '.yaml' || extname(f) === '.yml')
    .map((f) => basename(f, extname(f)));
}
