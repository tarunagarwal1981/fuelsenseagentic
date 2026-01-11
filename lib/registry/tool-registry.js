"use strict";
/**
 * Tool Registry
 *
 * Central registry for managing tool configurations and metadata.
 * Provides registration, lookup, and discovery of available tools.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolRegistry = void 0;
exports.getToolRegistry = getToolRegistry;
class ToolRegistry {
    static registry = new Map();
    /**
     * Register a tool
     */
    static register(tool) {
        this.registry.set(tool.name, tool);
    }
    /**
     * Get tool metadata by name
     */
    static get(name) {
        return this.registry.get(name);
    }
    /**
     * Get all registered tools
     */
    static getAll() {
        return Array.from(this.registry.values());
    }
    /**
     * Clear registry (for testing)
     */
    static clear() {
        this.registry.clear();
    }
}
exports.ToolRegistry = ToolRegistry;
/**
 * Get the singleton ToolRegistry instance
 */
function getToolRegistry() {
    return ToolRegistry;
}
//# sourceMappingURL=tool-registry.js.map