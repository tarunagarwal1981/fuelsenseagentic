"use strict";
/**
 * YAML Configuration Loader
 *
 * Robust YAML configuration loader with schema validation, caching, and hot-reload support.
 * This is the foundation for the configuration-driven architecture.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigPermissionError = exports.ConfigValidationError = exports.YAMLParsingError = exports.ConfigFileNotFoundError = void 0;
exports.getYAMLLoader = getYAMLLoader;
exports.createYAMLLoader = createYAMLLoader;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const zod_1 = require("zod");
// ============================================================================
// Error Types
// ============================================================================
/**
 * Error thrown when a configuration file is not found
 */
class ConfigFileNotFoundError extends Error {
    constructor(filePath) {
        super(`Configuration file not found: ${filePath}\nExpected path: ${path.resolve(filePath)}`);
        this.name = 'ConfigFileNotFoundError';
    }
}
exports.ConfigFileNotFoundError = ConfigFileNotFoundError;
/**
 * Error thrown when YAML parsing fails
 */
class YAMLParsingError extends Error {
    lineNumber;
    constructor(message, lineNumber) {
        super(`YAML parsing error${lineNumber ? ` at line ${lineNumber}` : ''}: ${message}`);
        this.lineNumber = lineNumber;
        this.name = 'YAMLParsingError';
    }
}
exports.YAMLParsingError = YAMLParsingError;
/**
 * Error thrown when schema validation fails
 */
class ConfigValidationError extends Error {
    zodError;
    filePath;
    constructor(message, zodError, filePath) {
        super(`Configuration validation error in ${filePath}: ${message}`);
        this.zodError = zodError;
        this.filePath = filePath;
        this.name = 'ConfigValidationError';
    }
    /**
     * Get formatted validation errors with field names
     */
    getFormattedErrors() {
        const errors = this.zodError.errors.map((err) => {
            const path = err.path.join('.');
            return `  - ${path}: ${err.message}`;
        });
        return `Validation errors:\n${errors.join('\n')}`;
    }
}
exports.ConfigValidationError = ConfigValidationError;
/**
 * Error thrown when file access is denied
 */
class ConfigPermissionError extends Error {
    constructor(filePath, reason) {
        super(`Permission error accessing ${filePath}: ${reason}\nPlease check file permissions.`);
        this.name = 'ConfigPermissionError';
    }
}
exports.ConfigPermissionError = ConfigPermissionError;
class YAMLLoaderImpl {
    cache = new Map();
    watchers = new Map();
    hotReloadEnabled = false;
    projectRoot;
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
    findProjectRootSync() {
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
            }
            catch {
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
    resolvePath(filePath) {
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        return path.resolve(this.projectRoot, filePath);
    }
    /**
     * Check if cache entry is still valid
     */
    isCacheValid(entry) {
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
    async getFileStats(filePath) {
        try {
            const stats = await fs.stat(filePath);
            return {
                mtime: stats.mtimeMs,
                size: stats.size,
            };
        }
        catch {
            return null;
        }
    }
    /**
     * Check if file has been modified since cache entry
     */
    async isFileModified(entry) {
        if (!entry.fileStats) {
            return true; // No stats, assume modified
        }
        const currentStats = await this.getFileStats(entry.filePath);
        if (!currentStats) {
            return true; // File doesn't exist or can't be accessed
        }
        return (currentStats.mtime !== entry.fileStats.mtime ||
            currentStats.size !== entry.fileStats.size);
    }
    /**
     * Parse YAML file with error handling
     */
    async parseYAML(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const parsed = yaml.load(content, {
                filename: filePath,
                onWarning: (warning) => {
                    console.warn(`[YAML Loader] Warning in ${filePath}:`, warning.message);
                },
            });
            return parsed;
        }
        catch (error) {
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
    validateSchema(data, schema, filePath) {
        try {
            return schema.parse(data);
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
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
    async watchFile(filePath) {
        if (!this.hotReloadEnabled) {
            return;
        }
        if (this.watchers.has(filePath)) {
            return; // Already watching
        }
        try {
            // Use Node.js fs.watch for file watching
            const fsSync = require('fs');
            const watcher = fsSync.watch(filePath, (eventType) => {
                if (eventType === 'change') {
                    // File changed, clear cache for this file
                    this.cache.delete(filePath);
                }
            });
            this.watchers.set(filePath, watcher);
        }
        catch (error) {
            // File watching failed, but don't throw - just log
            console.warn(`[YAML Loader] Could not watch file ${filePath}:`, error);
        }
    }
    /**
     * Load a single YAML configuration file
     */
    async load(filePath, schema) {
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
            }
            else {
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
            fileStats,
        });
        // Watch file for changes (development only)
        await this.watchFile(resolvedPath);
        return validated;
    }
    /**
     * Load all YAML files from a directory
     */
    async loadAll(directory, schema) {
        const resolvedDir = this.resolvePath(directory);
        const results = new Map();
        try {
            const entries = await fs.readdir(resolvedDir, { withFileTypes: true });
            for (const entry of entries) {
                // Only process .yaml and .yml files
                if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
                    const filePath = path.join(resolvedDir, entry.name);
                    const key = path.basename(entry.name, path.extname(entry.name));
                    try {
                        const config = await this.load(filePath, schema);
                        results.set(key, config);
                    }
                    catch (error) {
                        console.error(`[YAML Loader] Failed to load ${filePath}:`, error);
                        // Continue loading other files
                    }
                }
            }
        }
        catch (error) {
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
    async reload(filePath) {
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
    clearCache() {
        this.cache.clear();
        console.log('[YAML Loader] Cache cleared');
    }
    /**
     * Enable hot-reload (development mode)
     */
    enableHotReload() {
        this.hotReloadEnabled = true;
        console.log('[YAML Loader] Hot-reload enabled');
    }
    /**
     * Disable hot-reload (production mode)
     */
    disableHotReload() {
        this.hotReloadEnabled = false;
        // Close all watchers
        for (const [filePath, watcher] of this.watchers.entries()) {
            try {
                watcher.close();
            }
            catch {
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
let loaderInstance = null;
/**
 * Get the singleton YAML loader instance
 */
function getYAMLLoader() {
    if (!loaderInstance) {
        loaderInstance = new YAMLLoaderImpl();
    }
    return loaderInstance;
}
/**
 * Create a new YAML loader instance (for testing)
 */
function createYAMLLoader() {
    return new YAMLLoaderImpl();
}
//# sourceMappingURL=yaml-loader.js.map