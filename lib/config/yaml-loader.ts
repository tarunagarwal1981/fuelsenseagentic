/**
 * YAML Configuration Loader
 * 
 * Robust YAML configuration loader with schema validation, caching, and hot-reload support.
 * This is the foundation for the configuration-driven architecture.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ZodSchema, ZodError } from 'zod';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when a configuration file is not found
 */
export class ConfigFileNotFoundError extends Error {
  constructor(filePath: string) {
    super(`Configuration file not found: ${filePath}\nExpected path: ${path.resolve(filePath)}`);
    this.name = 'ConfigFileNotFoundError';
  }
}

/**
 * Error thrown when YAML parsing fails
 */
export class YAMLParsingError extends Error {
  constructor(message: string, public readonly lineNumber?: number) {
    super(`YAML parsing error${lineNumber ? ` at line ${lineNumber}` : ''}: ${message}`);
    this.name = 'YAMLParsingError';
  }
}

/**
 * Error thrown when schema validation fails
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly zodError: ZodError,
    public readonly filePath: string
  ) {
    super(`Configuration validation error in ${filePath}: ${message}`);
    this.name = 'ConfigValidationError';
  }

  /**
   * Get formatted validation errors with field names
   */
  getFormattedErrors(): string {
    const errors = this.zodError.errors.map((err) => {
      const path = err.path.join('.');
      return `  - ${path}: ${err.message}`;
    });
    return `Validation errors:\n${errors.join('\n')}`;
  }
}

/**
 * Error thrown when file access is denied
 */
export class ConfigPermissionError extends Error {
  constructor(filePath: string, reason: string) {
    super(`Permission error accessing ${filePath}: ${reason}\nPlease check file permissions.`);
    this.name = 'ConfigPermissionError';
  }
}

// ============================================================================
// Cache Types
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl?: number; // Optional TTL in milliseconds
  filePath: string;
  fileStats?: { mtime: number; size: number };
}

// ============================================================================
// YAML Loader Class
// ============================================================================

export interface YAMLLoader {
  load<T>(filePath: string, schema: ZodSchema<T>): Promise<T>;
  loadAll<T>(directory: string, schema: ZodSchema<T>): Promise<Map<string, T>>;
  reload(filePath: string): Promise<void>;
  clearCache(): void;
  enableHotReload(): void;
  disableHotReload(): void;
}

class YAMLLoaderImpl implements YAMLLoader {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private watchers: Map<string, any> = new Map();
  private hotReloadEnabled: boolean = false;
  private projectRoot: string;

  constructor() {
    // Find project root synchronously (for constructor)
    this.projectRoot = this.findProjectRootSync();
    
    // Enable hot-reload in development by default
    this.hotReloadEnabled = 
      process.env.NODE_ENV !== 'production' || 
      process.env.ENABLE_HOT_RELOAD === 'true';
    
    if (this.hotReloadEnabled) {
      console.log('[YAML Loader] Hot-reload enabled (development mode)');
    }
  }

  /**
   * Find project root directory synchronously
   */
  private findProjectRootSync(): string {
    let currentDir = __dirname;
    const maxDepth = 10;
    let depth = 0;

    // Try to find package.json by going up directories
    while (depth < maxDepth) {
      const packageJsonPath = path.join(currentDir, 'package.json');
      
      // Use synchronous check for constructor
      try {
        const fsSync = require('fs');
        if (fsSync.existsSync(packageJsonPath)) {
          return currentDir;
        }
      } catch {
        // Continue searching
      }
      
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break; // Reached filesystem root
      }
      currentDir = parentDir;
      depth++;
    }

    // Fallback to process.cwd()
    return process.cwd();
  }

  /**
   * Resolve file path relative to project root
   */
  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(this.projectRoot, filePath);
  }

  /**
   * Check if cache entry is still valid
   */
  private isCacheValid<T>(entry: CacheEntry<T>): boolean {
    // Check TTL
    if (entry.ttl) {
      const age = Date.now() - entry.timestamp;
      if (age > entry.ttl) {
        return false;
      }
    }

    // In development with hot-reload, check file modification time
    if (this.hotReloadEnabled && entry.fileStats) {
      // We'll check this when loading
      return true;
    }

    return true;
  }

  /**
   * Get file stats for cache validation
   */
  private async getFileStats(filePath: string): Promise<{ mtime: number; size: number } | null> {
    try {
      const stats = await fs.stat(filePath);
      return {
        mtime: stats.mtimeMs,
        size: stats.size,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if file has been modified since cache entry
   */
  private async isFileModified(entry: CacheEntry<any>): Promise<boolean> {
    if (!entry.fileStats) {
      return true; // No stats, assume modified
    }

    const currentStats = await this.getFileStats(entry.filePath);
    if (!currentStats) {
      return true; // File doesn't exist or can't be accessed
    }

    return (
      currentStats.mtime !== entry.fileStats.mtime ||
      currentStats.size !== entry.fileStats.size
    );
  }

  /**
   * Parse YAML file with error handling
   */
  private async parseYAML(filePath: string): Promise<any> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = yaml.load(content, {
        filename: filePath,
        onWarning: (warning: any) => {
          console.warn(`[YAML Loader] Warning in ${filePath}:`, warning.message);
        },
      });
      return parsed;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new ConfigFileNotFoundError(filePath);
      }
      
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        throw new ConfigPermissionError(filePath, error.message);
      }

      // Extract line number from js-yaml errors
      const lineMatch = error.message?.match(/line (\d+)/i);
      const lineNumber = lineMatch ? parseInt(lineMatch[1], 10) : undefined;
      
      throw new YAMLParsingError(error.message || 'Unknown YAML parsing error', lineNumber);
    }
  }

  /**
   * Validate parsed data against schema
   */
  private validateSchema<T>(data: any, schema: ZodSchema<T>, filePath: string): T {
    try {
      return schema.parse(data);
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.errors.map((e) => {
          const path = e.path.join('.');
          return `${path}: ${e.message}`;
        }).join('; ');
        throw new ConfigValidationError(message, error, filePath);
      }
      throw error;
    }
  }

  /**
   * Load and watch file for changes (development only)
   */
  private async watchFile(filePath: string): Promise<void> {
    if (!this.hotReloadEnabled) {
      return;
    }

    if (this.watchers.has(filePath)) {
      return; // Already watching
    }

    try {
      // Use Node.js fs.watch for file watching
      const fsSync = require('fs');
      const watcher = fsSync.watch(filePath, (eventType: string) => {
        if (eventType === 'change') {
          // File changed, clear cache for this file
          this.cache.delete(filePath);
        }
      });
      
      this.watchers.set(filePath, watcher);
    } catch (error) {
      // File watching failed, but don't throw - just log
      console.warn(`[YAML Loader] Could not watch file ${filePath}:`, error);
    }
  }

  /**
   * Load a single YAML configuration file
   */
  async load<T>(filePath: string, schema: ZodSchema<T>): Promise<T> {
    const resolvedPath = this.resolvePath(filePath);
    const cacheKey = resolvedPath;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      // In development, check if file was modified
      if (this.hotReloadEnabled) {
        const modified = await this.isFileModified(cached);
        if (!modified) {
          return cached.data;
        }
        // File was modified, clear cache and reload
        this.cache.delete(cacheKey);
      } else {
        return cached.data;
      }
    }

    // Load and parse YAML
    const parsed = await this.parseYAML(resolvedPath);

    // Validate against schema
    const validated = this.validateSchema(parsed, schema, resolvedPath);

    // Get file stats for cache
    const fileStats = await this.getFileStats(resolvedPath);

    // Store in cache
    this.cache.set(cacheKey, {
      data: validated,
      timestamp: Date.now(),
      filePath: resolvedPath,
      fileStats: fileStats || undefined,
    });

    // Watch file for changes (development only)
    await this.watchFile(resolvedPath);

    return validated;
  }

  /**
   * Load all YAML files from a directory
   */
  async loadAll<T>(directory: string, schema: ZodSchema<T>): Promise<Map<string, T>> {
    const resolvedDir = this.resolvePath(directory);
    const results = new Map<string, T>();

    try {
      const entries = await fs.readdir(resolvedDir, { withFileTypes: true });

      for (const entry of entries) {
        // Only process .yaml and .yml files
        if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
          const filePath = path.join(resolvedDir, entry.name);
          const key = path.basename(entry.name, path.extname(entry.name));

          try {
            const config = await this.load<T>(filePath, schema);
            results.set(key, config);
          } catch (error) {
            console.error(`[YAML Loader] Failed to load ${filePath}:`, error);
            // Continue loading other files
          }
        }
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new ConfigFileNotFoundError(resolvedDir);
      }
      throw error;
    }

    return results;
  }

  /**
   * Reload a specific configuration file
   */
  async reload(filePath: string): Promise<void> {
    const resolvedPath = this.resolvePath(filePath);
    const cacheKey = resolvedPath;

    // Clear cache entry
    this.cache.delete(cacheKey);

    // If we have a watcher, we don't need to do anything else
    // The next load will pick up the changes
  }

  /**
   * Clear entire cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[YAML Loader] Cache cleared');
  }

  /**
   * Enable hot-reload (development mode)
   */
  enableHotReload(): void {
    this.hotReloadEnabled = true;
    console.log('[YAML Loader] Hot-reload enabled');
  }

  /**
   * Disable hot-reload (production mode)
   */
  disableHotReload(): void {
    this.hotReloadEnabled = false;
    // Close all watchers
    for (const [, watcher] of this.watchers.entries()) {
      try {
        watcher.close();
      } catch {
        // Ignore errors when closing watchers
      }
    }
    this.watchers.clear();
    console.log('[YAML Loader] Hot-reload disabled');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let loaderInstance: YAMLLoaderImpl | null = null;

/**
 * Get the singleton YAML loader instance
 */
export function getYAMLLoader(): YAMLLoader {
  if (!loaderInstance) {
    loaderInstance = new YAMLLoaderImpl();
  }
  return loaderInstance;
}

/**
 * Create a new YAML loader instance (for testing)
 */
export function createYAMLLoader(): YAMLLoader {
  return new YAMLLoaderImpl();
}

