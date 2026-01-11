/**
 * Tool Registry
 *
 * Central registry for managing tool configurations and metadata.
 * Provides registration, lookup, and discovery of available tools.
 */
export interface ToolMetadata {
    name: string;
    description: string;
    implementation: string;
    configPath: string;
}
export declare class ToolRegistry {
    private static registry;
    /**
     * Register a tool
     */
    static register(tool: ToolMetadata): void;
    /**
     * Get tool metadata by name
     */
    static get(name: string): ToolMetadata | undefined;
    /**
     * Get all registered tools
     */
    static getAll(): ToolMetadata[];
    /**
     * Clear registry (for testing)
     */
    static clear(): void;
}
/**
 * Get the singleton ToolRegistry instance
 */
export declare function getToolRegistry(): ToolRegistry;
//# sourceMappingURL=tool-registry.d.ts.map