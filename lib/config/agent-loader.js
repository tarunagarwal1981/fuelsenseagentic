"use strict";
/**
 * Agent Configuration Loader
 *
 * Loads and validates agent configurations from YAML config files.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentConfigSchema = void 0;
exports.loadAgentConfig = loadAgentConfig;
exports.loadAllAgentConfigs = loadAllAgentConfigs;
exports.validateAgentConfig = validateAgentConfig;
const zod_1 = require("zod");
const yaml_loader_1 = require("./yaml-loader");
/**
 * Agent configuration schema
 */
exports.agentConfigSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Agent name is required'),
    description: zod_1.z.string().min(1, 'Agent description is required'),
    tools: zod_1.z.array(zod_1.z.string()).default([]),
    capabilities: zod_1.z.array(zod_1.z.string()).default([]),
    model: zod_1.z.string().optional(),
    temperature: zod_1.z.number().min(0).max(2).optional(),
    maxIterations: zod_1.z.number().int().positive().optional(),
});
/**
 * Load agent configuration from YAML file
 *
 * @param configPath - Path to agent config file (relative to project root or absolute)
 * @returns Validated agent configuration
 *
 * @example
 * ```typescript
 * const config = await loadAgentConfig('config/agents/route-agent.yaml');
 * ```
 */
async function loadAgentConfig(configPath) {
    const loader = (0, yaml_loader_1.getYAMLLoader)();
    return loader.load(configPath, exports.agentConfigSchema);
}
/**
 * Load all agent configurations from a directory
 *
 * @param directory - Directory containing agent config files (default: 'config/agents')
 * @returns Map of agent name to configuration
 *
 * @example
 * ```typescript
 * const agents = await loadAllAgentConfigs('config/agents');
 * const routeAgent = agents.get('route-agent');
 * ```
 */
async function loadAllAgentConfigs(directory = 'config/agents') {
    const loader = (0, yaml_loader_1.getYAMLLoader)();
    return loader.loadAll(directory, exports.agentConfigSchema);
}
/**
 * Validate agent configuration (for manual validation)
 */
function validateAgentConfig(config) {
    try {
        exports.agentConfigSchema.parse(config);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=agent-loader.js.map