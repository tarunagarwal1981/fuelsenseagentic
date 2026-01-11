"use strict";
/**
 * Tool Configuration Loader
 *
 * Loads and validates tool configurations from YAML config files.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolConfigSchema = void 0;
exports.loadToolConfig = loadToolConfig;
exports.loadAllToolConfigs = loadAllToolConfigs;
exports.validateToolConfig = validateToolConfig;
const zod_1 = require("zod");
const yaml_loader_1 = require("./yaml-loader");
/**
 * JSON Schema type for tool schemas
 */
const jsonSchemaSchema = zod_1.z.record(zod_1.z.any());
/**
 * Tool configuration schema
 */
exports.toolConfigSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Tool name is required'),
    description: zod_1.z.string().min(1, 'Tool description is required'),
    implementation: zod_1.z.string().min(1, 'Tool implementation path is required'),
    inputSchema: jsonSchemaSchema,
    outputSchema: jsonSchemaSchema.optional(),
    timeout: zod_1.z.number().int().positive().optional(),
    retries: zod_1.z.number().int().min(0).max(5).optional(),
});
/**
 * Load tool configuration from YAML file
 *
 * @param configPath - Path to tool config file (relative to project root or absolute)
 * @returns Validated tool configuration
 *
 * @example
 * ```typescript
 * const config = await loadToolConfig('config/tools/route-calculator.yaml');
 * ```
 */
async function loadToolConfig(configPath) {
    const loader = (0, yaml_loader_1.getYAMLLoader)();
    return loader.load(configPath, exports.toolConfigSchema);
}
/**
 * Load all tool configurations from a directory
 *
 * @param directory - Directory containing tool config files (default: 'config/tools')
 * @returns Map of tool name to configuration
 *
 * @example
 * ```typescript
 * const tools = await loadAllToolConfigs('config/tools');
 * const routeCalculator = tools.get('route-calculator');
 * ```
 */
async function loadAllToolConfigs(directory = 'config/tools') {
    const loader = (0, yaml_loader_1.getYAMLLoader)();
    return loader.loadAll(directory, exports.toolConfigSchema);
}
/**
 * Validate tool configuration (for manual validation)
 */
function validateToolConfig(config) {
    try {
        exports.toolConfigSchema.parse(config);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=tool-loader.js.map