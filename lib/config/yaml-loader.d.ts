/**
 * YAML Configuration Loader
 *
 * Robust YAML configuration loader with schema validation, caching, and hot-reload support.
 * This is the foundation for the configuration-driven architecture.
 */
import { ZodSchema, ZodError } from 'zod';
/**
 * Error thrown when a configuration file is not found
 */
export declare class ConfigFileNotFoundError extends Error {
    constructor(filePath: string);
}
/**
 * Error thrown when YAML parsing fails
 */
export declare class YAMLParsingError extends Error {
    readonly lineNumber?: number | undefined;
    constructor(message: string, lineNumber?: number | undefined);
}
/**
 * Error thrown when schema validation fails
 */
export declare class ConfigValidationError extends Error {
    readonly zodError: ZodError;
    readonly filePath: string;
    constructor(message: string, zodError: ZodError, filePath: string);
    /**
     * Get formatted validation errors with field names
     */
    getFormattedErrors(): string;
}
/**
 * Error thrown when file access is denied
 */
export declare class ConfigPermissionError extends Error {
    constructor(filePath: string, reason: string);
}
export interface YAMLLoader {
    load<T>(filePath: string, schema: ZodSchema<T>): Promise<T>;
    loadAll<T>(directory: string, schema: ZodSchema<T>): Promise<Map<string, T>>;
    reload(filePath: string): Promise<void>;
    clearCache(): void;
    enableHotReload(): void;
    disableHotReload(): void;
}
/**
 * Get the singleton YAML loader instance
 */
export declare function getYAMLLoader(): YAMLLoader;
/**
 * Create a new YAML loader instance (for testing)
 */
export declare function createYAMLLoader(): YAMLLoader;
//# sourceMappingURL=yaml-loader.d.ts.map