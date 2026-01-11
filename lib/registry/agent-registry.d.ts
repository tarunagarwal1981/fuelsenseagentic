/**
 * Agent Registry
 *
 * Centralized catalog of all agents with their capabilities, tools, and configurations.
 * Supports auto-registration pattern and YAML configuration loading.
 */
/**
 * Agent executor function type
 * Executes the agent with given input and returns output
 */
export type AgentExecutor = (input: any) => Promise<any>;
/**
 * Model configuration for LLM-based agents
 */
export interface ModelConfig {
    provider: string;
    name: string;
    temperature: number;
    max_tokens: number;
}
/**
 * Agent type classification
 */
export type AgentType = 'deterministic' | 'llm' | 'hybrid' | 'tool_based';
/**
 * Agent registration metadata
 */
export interface AgentRegistration {
    /** Unique agent identifier */
    id: string;
    /** Human-readable agent name */
    name: string;
    /** Agent type classification */
    type: AgentType;
    /** Agent description */
    description: string;
    /** What this agent produces/outputs */
    produces: string[];
    /** What this agent consumes/requires */
    consumes: {
        required: string[];
        optional: string[];
    };
    /** Tools available to this agent */
    available_tools: string[];
    /** Path to agent configuration file */
    config_file: string;
    /** Optional path to prompt file */
    prompt_file?: string;
    /** Model configuration for LLM-based agents */
    model?: ModelConfig;
    /** Path to agent implementation */
    implementation: string;
    /** Agent executor function */
    executor: AgentExecutor;
}
/**
 * Error thrown when attempting to register a duplicate agent ID
 */
export declare class DuplicateAgentError extends Error {
    readonly agentId: string;
    readonly existingAgent: AgentRegistration;
    constructor(agentId: string, existingAgent: AgentRegistration);
}
/**
 * Error thrown when a tool reference is invalid
 */
export declare class InvalidToolReferenceError extends Error {
    readonly toolName: string;
    readonly agentId: string;
    readonly availableTools: string[];
    constructor(toolName: string, agentId: string, availableTools: string[]);
}
/**
 * Error thrown when required fields are missing
 */
export declare class MissingRequiredFieldError extends Error {
    readonly agentId: string;
    readonly missingFields: string[];
    constructor(agentId: string, missingFields: string[]);
}
/**
 * Error thrown when configuration loading fails
 */
export declare class ConfigLoadError extends Error {
    readonly configPath: string;
    readonly originalError: Error;
    constructor(configPath: string, originalError: Error);
}
/**
 * Central registry for all agents
 *
 * Thread-safe singleton pattern for managing agent registrations.
 */
export declare class AgentRegistry {
    private static registry;
    private static initialized;
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
    static register(registration: AgentRegistration, options?: {
        skipToolValidation?: boolean;
    }): void;
    /**
     * Validate tool references exist
     *
     * @param skipIfEmpty - If true, skip validation if ToolRegistry is empty (for auto-registration)
     */
    private static validateToolReferences;
    /**
     * Get agent by ID
     *
     * @param id - Agent identifier
     * @returns Agent registration or null if not found
     */
    static get(id: string): AgentRegistration | null;
    /**
     * Get agents that produce a specific capability
     *
     * @param capability - Capability to search for
     * @returns Array of agents that produce this capability
     */
    static getByCapability(capability: string): AgentRegistration[];
    /**
     * List all registered agents
     *
     * @returns Array of all agent registrations
     */
    static listAll(): AgentRegistration[];
    /**
     * Load agent registration from YAML configuration file
     *
     * @param configPath - Path to YAML configuration file
     * @param executor - Agent executor function (must be provided separately)
     * @throws ConfigLoadError if loading or validation fails
     */
    static loadFromConfig(configPath: string, executor: AgentExecutor): Promise<void>;
    /**
     * Check if agent is registered
     *
     * @param id - Agent identifier
     * @returns True if agent is registered
     */
    static has(id: string): boolean;
    /**
     * Get count of registered agents
     *
     * @returns Number of registered agents
     */
    static count(): number;
    /**
     * Clear registry (for testing)
     */
    static clear(): void;
    /**
     * Export registry as JSON (for debugging/LLM consumption)
     *
     * @returns JSON string representation of registry
     */
    static toJSON(): string;
}
//# sourceMappingURL=agent-registry.d.ts.map