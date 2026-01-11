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

export class ToolRegistry {
  private static registry: Map<string, ToolMetadata> = new Map();

  /**
   * Register a tool
   */
  static register(tool: ToolMetadata): void {
    this.registry.set(tool.name, tool);
  }

  /**
   * Get tool metadata by name
   */
  static get(name: string): ToolMetadata | undefined {
    return this.registry.get(name);
  }

  /**
   * Get all registered tools
   */
  static getAll(): ToolMetadata[] {
    return Array.from(this.registry.values());
  }

  /**
   * Clear registry (for testing)
   */
  static clear(): void {
    this.registry.clear();
  }
}

/**
 * Get the singleton ToolRegistry instance
 */
export function getToolRegistry(): ToolRegistry {
  return ToolRegistry;
}

