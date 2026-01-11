"use strict";
/**
 * Agent Registry
 *
 * Centralized catalog of all agents with their capabilities, tools, and configurations.
 * Supports auto-registration pattern and YAML configuration loading.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRegistry = exports.ConfigLoadError = exports.MissingRequiredFieldError = exports.InvalidToolReferenceError = exports.DuplicateAgentError = void 0;
const zod_1 = require("zod");
const yaml_loader_1 = require("../config/yaml-loader");
const tool_registry_1 = require("./tool-registry");
// ============================================================================
// Error Types
// ============================================================================
/**
 * Error thrown when attempting to register a duplicate agent ID
 */
class DuplicateAgentError extends Error {
    agentId;
    existingAgent;
    constructor(agentId, existingAgent) {
        super(`Agent with ID '${agentId}' is already registered.\n` +
            `Existing agent: ${existingAgent.name} (${existingAgent.type})\n` +
            `Implementation: ${existingAgent.implementation}`);
        this.agentId = agentId;
        this.existingAgent = existingAgent;
        this.name = 'DuplicateAgentError';
    }
}
exports.DuplicateAgentError = DuplicateAgentError;
/**
 * Error thrown when a tool reference is invalid
 */
class InvalidToolReferenceError extends Error {
    toolName;
    agentId;
    availableTools;
    constructor(toolName, agentId, availableTools) {
        super(`Agent '${agentId}' references invalid tool '${toolName}'.\n` +
            `Available tools: ${availableTools.length > 0 ? availableTools.join(', ') : 'none'}`);
        this.toolName = toolName;
        this.agentId = agentId;
        this.availableTools = availableTools;
        this.name = 'InvalidToolReferenceError';
    }
}
exports.InvalidToolReferenceError = InvalidToolReferenceError;
/**
 * Error thrown when required fields are missing
 */
class MissingRequiredFieldError extends Error {
    agentId;
    missingFields;
    constructor(agentId, missingFields) {
        super(`Agent '${agentId}' is missing required fields: ${missingFields.join(', ')}`);
        this.agentId = agentId;
        this.missingFields = missingFields;
        this.name = 'MissingRequiredFieldError';
    }
}
exports.MissingRequiredFieldError = MissingRequiredFieldError;
/**
 * Error thrown when configuration loading fails
 */
class ConfigLoadError extends Error {
    configPath;
    originalError;
    constructor(configPath, originalError) {
        super(`Failed to load agent configuration from '${configPath}': ${originalError.message}`);
        this.configPath = configPath;
        this.originalError = originalError;
        this.name = 'ConfigLoadError';
    }
}
exports.ConfigLoadError = ConfigLoadError;
// ============================================================================
// Zod Schemas
// ============================================================================
/**
 * Model configuration schema
 */
const modelConfigSchema = zod_1.z.object({
    provider: zod_1.z.string().min(1, 'Provider is required'),
    name: zod_1.z.string().min(1, 'Model name is required'),
    temperature: zod_1.z.number().min(0).max(2),
    max_tokens: zod_1.z.number().int().positive(),
});
/**
 * Agent registration schema for validation
 */
const agentRegistrationSchema = zod_1.z.object({
    id: zod_1.z.string().min(1, 'Agent ID is required'),
    name: zod_1.z.string().min(1, 'Agent name is required'),
    type: zod_1.z.enum(['deterministic', 'llm', 'hybrid', 'tool_based']),
    description: zod_1.z.string().min(1, 'Description is required'),
    produces: zod_1.z.array(zod_1.z.string()).min(1, 'At least one capability must be produced'),
    consumes: zod_1.z.object({
        required: zod_1.z.array(zod_1.z.string()),
        optional: zod_1.z.array(zod_1.z.string()),
    }),
    available_tools: zod_1.z.array(zod_1.z.string()),
    config_file: zod_1.z.string().min(1, 'Config file path is required'),
    prompt_file: zod_1.z.string().optional(),
    model: modelConfigSchema.optional(),
    implementation: zod_1.z.string().min(1, 'Implementation path is required'),
    // executor is a function, so we skip validation for it
});
/**
 * YAML config schema (without executor)
 */
const agentRegistrationYAMLSchema = agentRegistrationSchema.omit({ executor: true });
// ============================================================================
// Agent Registry Class
// ============================================================================
/**
 * Central registry for all agents
 *
 * Thread-safe singleton pattern for managing agent registrations.
 */
class AgentRegistry {
    static registry = new Map();
    static initialized = false;
    /**
     * Register an agent
     *
     * @param registration - Agent registration metadata
     * @param options - Registration options
     * @param options.skipToolValidation - Skip tool validation (useful for auto-registration)
     * @throws DuplicateAgentError if agent ID already exists
     * @throws MissingRequiredFieldError if required fields are missing
     * @throws InvalidToolReferenceError if tool references are invalid
     */
    static register(registration, options) {
        // Validate schema
        try {
            agentRegistrationSchema.parse(registration);
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                const missingFields = error.errors
                    .filter((e) => e.code === 'invalid_type' && e.received === 'undefined')
                    .map((e) => e.path.join('.'));
                if (missingFields.length > 0) {
                    throw new MissingRequiredFieldError(registration.id || 'unknown', missingFields);
                }
                throw new Error(`Validation failed: ${error.message}`);
            }
            throw error;
        }
        // Check for duplicate ID
        if (this.registry.has(registration.id)) {
            const existing = this.registry.get(registration.id);
            throw new DuplicateAgentError(registration.id, existing);
        }
        // Validate tool references (skip if option is set or ToolRegistry is empty)
        if (!options?.skipToolValidation) {
            this.validateToolReferences(registration, true);
        }
        // Register agent
        this.registry.set(registration.id, registration);
        console.log(`✅ [AgentRegistry] Registered agent: ${registration.id} (${registration.name})`);
    }
    /**
     * Validate tool references exist
     *
     * @param skipIfEmpty - If true, skip validation if ToolRegistry is empty (for auto-registration)
     */
    static validateToolReferences(registration, skipIfEmpty = false) {
        const toolRegistry = (0, tool_registry_1.getToolRegistry)();
        const availableTools = toolRegistry.getAll().map((t) => t.name);
        // If ToolRegistry is empty and skipIfEmpty is true, skip validation
        // This allows agents to auto-register before tools are registered
        if (skipIfEmpty && availableTools.length === 0) {
            console.warn(`[AgentRegistry] Skipping tool validation for ${registration.id} - ToolRegistry is empty`);
            return;
        }
        for (const toolName of registration.available_tools) {
            if (!availableTools.includes(toolName)) {
                throw new InvalidToolReferenceError(toolName, registration.id, availableTools);
            }
        }
    }
    /**
     * Get agent by ID
     *
     * @param id - Agent identifier
     * @returns Agent registration or null if not found
     */
    static get(id) {
        return this.registry.get(id) || null;
    }
    /**
     * Get agents that produce a specific capability
     *
     * @param capability - Capability to search for
     * @returns Array of agents that produce this capability
     */
    static getByCapability(capability) {
        return Array.from(this.registry.values()).filter((agent) => agent.produces.includes(capability));
    }
    /**
     * List all registered agents
     *
     * @returns Array of all agent registrations
     */
    static listAll() {
        return Array.from(this.registry.values());
    }
    /**
     * Load agent registration from YAML configuration file
     *
     * @param configPath - Path to YAML configuration file
     * @param executor - Agent executor function (must be provided separately)
     * @throws ConfigLoadError if loading or validation fails
     */
    static async loadFromConfig(configPath, executor) {
        const loader = (0, yaml_loader_1.getYAMLLoader)();
        try {
            // Load YAML config
            const yamlConfig = await loader.load(configPath, agentRegistrationYAMLSchema);
            // Create full registration with executor
            const registration = {
                ...yamlConfig,
                executor,
            };
            // Register agent
            this.register(registration);
        }
        catch (error) {
            if (error instanceof yaml_loader_1.ConfigFileNotFoundError) {
                throw new ConfigLoadError(configPath, error);
            }
            if (error instanceof yaml_loader_1.ConfigValidationError) {
                throw new ConfigLoadError(configPath, error);
            }
            if (error instanceof Error) {
                throw new ConfigLoadError(configPath, error);
            }
            throw error;
        }
    }
    /**
     * Check if agent is registered
     *
     * @param id - Agent identifier
     * @returns True if agent is registered
     */
    static has(id) {
        return this.registry.has(id);
    }
    /**
     * Get count of registered agents
     *
     * @returns Number of registered agents
     */
    static count() {
        return this.registry.size;
    }
    /**
     * Clear registry (for testing)
     */
    static clear() {
        this.registry.clear();
        console.log('[AgentRegistry] Registry cleared');
    }
    /**
     * Export registry as JSON (for debugging/LLM consumption)
     *
     * @returns JSON string representation of registry
     */
    static toJSON() {
        const agents = this.listAll().map((agent) => ({
            id: agent.id,
            name: agent.name,
            type: agent.type,
            description: agent.description,
            produces: agent.produces,
            consumes: agent.consumes,
            available_tools: agent.available_tools,
            config_file: agent.config_file,
            prompt_file: agent.prompt_file,
            model: agent.model,
            implementation: agent.implementation,
            // Note: executor is not serialized
        }));
        return JSON.stringify({
            agents,
            total_agents: this.registry.size,
        }, null, 2);
    }
}
exports.AgentRegistry = AgentRegistry;
//# sourceMappingURL=agent-registry.js.map