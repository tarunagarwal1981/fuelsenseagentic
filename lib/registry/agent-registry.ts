/**
 * Agent Registry
 * 
 * Centralized catalog of all agents with their capabilities, tools, and configurations.
 * Supports auto-registration pattern and YAML configuration loading.
 */

import { z, ZodError } from 'zod';
import { getYAMLLoader, ConfigFileNotFoundError, ConfigValidationError } from '../config/yaml-loader';
import { ToolRegistry } from './tool-registry';

// ============================================================================
// Types and Interfaces
// ============================================================================

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

  // Capabilities
  /** What this agent produces/outputs */
  produces: string[];
  /** What this agent consumes/requires */
  consumes: {
    required: string[];
    optional: string[];
  };
  /** Tools available to this agent */
  available_tools: string[];

  // Configuration
  /** Path to agent configuration file */
  config_file: string;
  /** Optional path to prompt file */
  prompt_file?: string;

  // LLM config (if applicable)
  /** Model configuration for LLM-based agents */
  model?: ModelConfig;

  // Implementation
  /** Path to agent implementation */
  implementation: string;
  /** Agent executor function */
  executor: AgentExecutor;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when attempting to register a duplicate agent ID
 */
export class DuplicateAgentError extends Error {
  constructor(
    public readonly agentId: string,
    public readonly existingAgent: AgentRegistration
  ) {
    super(
      `Agent with ID '${agentId}' is already registered.\n` +
      `Existing agent: ${existingAgent.name} (${existingAgent.type})\n` +
      `Implementation: ${existingAgent.implementation}`
    );
    this.name = 'DuplicateAgentError';
  }
}

/**
 * Error thrown when a tool reference is invalid
 */
export class InvalidToolReferenceError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly agentId: string,
    public readonly availableTools: string[]
  ) {
    super(
      `Agent '${agentId}' references invalid tool '${toolName}'.\n` +
      `Available tools: ${availableTools.length > 0 ? availableTools.join(', ') : 'none'}`
    );
    this.name = 'InvalidToolReferenceError';
  }
}

/**
 * Error thrown when required fields are missing
 */
export class MissingRequiredFieldError extends Error {
  constructor(
    public readonly agentId: string,
    public readonly missingFields: string[]
  ) {
    super(
      `Agent '${agentId}' is missing required fields: ${missingFields.join(', ')}`
    );
    this.name = 'MissingRequiredFieldError';
  }
}

/**
 * Error thrown when configuration loading fails
 */
export class ConfigLoadError extends Error {
  constructor(
    public readonly configPath: string,
    public readonly originalError: Error
  ) {
    super(
      `Failed to load agent configuration from '${configPath}': ${originalError.message}`
    );
    this.name = 'ConfigLoadError';
  }
}

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Model configuration schema
 */
const modelConfigSchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
  name: z.string().min(1, 'Model name is required'),
  temperature: z.number().min(0).max(2),
  max_tokens: z.number().int().positive(),
});

/**
 * Agent registration schema for validation
 */
const agentRegistrationSchema = z.object({
  id: z.string().min(1, 'Agent ID is required'),
  name: z.string().min(1, 'Agent name is required'),
  type: z.enum(['deterministic', 'llm', 'hybrid', 'tool_based']),
  description: z.string().min(1, 'Description is required'),
  produces: z.array(z.string()).min(1, 'At least one capability must be produced'),
  consumes: z.object({
    required: z.array(z.string()),
    optional: z.array(z.string()),
  }),
  available_tools: z.array(z.string()),
  config_file: z.string().min(1, 'Config file path is required'),
  prompt_file: z.string().optional(),
  model: modelConfigSchema.optional(),
  implementation: z.string().min(1, 'Implementation path is required'),
  // executor is a function, so we skip validation for it
});

/**
 * YAML config schema (same as registration schema, executor added separately)
 */
const agentRegistrationYAMLSchema = agentRegistrationSchema;

// ============================================================================
// Agent Registry Class
// ============================================================================

/**
 * Central registry for all agents
 * 
 * Thread-safe singleton pattern for managing agent registrations.
 */
export class AgentRegistry {
  private static registry: Map<string, AgentRegistration> = new Map();

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
  static register(
    registration: AgentRegistration,
    options?: { skipToolValidation?: boolean }
  ): void {
    // Validate schema
    try {
      agentRegistrationSchema.parse(registration);
    } catch (error) {
      if (error instanceof ZodError) {
        const missingFields = error.errors
          .filter((e) => e.code === 'invalid_type' && e.received === 'undefined')
          .map((e) => e.path.join('.'));
        
        if (missingFields.length > 0) {
          throw new MissingRequiredFieldError(
            registration.id || 'unknown',
            missingFields
          );
        }
        throw new Error(`Validation failed: ${error.message}`);
      }
      throw error;
    }

    // Check for duplicate ID
    if (this.registry.has(registration.id)) {
      const existing = this.registry.get(registration.id)!;
      throw new DuplicateAgentError(registration.id, existing);
    }

    // Validate tool references (skip if option is set or ToolRegistry is empty)
    this.validateToolReferences(registration, !options?.skipToolValidation);

    // Register agent
    this.registry.set(registration.id, registration);
    console.log(
      `✅ [AgentRegistry] Registered agent: ${registration.id} (${registration.name})`
    );
  }

  /**
   * Validate tool references exist
   * 
   * @param skipIfEmpty - If true, skip validation if ToolRegistry is empty (for auto-registration)
   */
  private static validateToolReferences(
    registration: AgentRegistration,
    skipIfEmpty: boolean = false
  ): void {
    const availableTools = ToolRegistry.getAll().map((t: any) => t.name);

    // If ToolRegistry is empty and skipIfEmpty is true, skip validation
    // This allows agents to auto-register before tools are registered
    if (skipIfEmpty && availableTools.length === 0) {
      console.warn(
        `[AgentRegistry] Skipping tool validation for ${registration.id} - ToolRegistry is empty`
      );
      return;
    }

    for (const toolName of registration.available_tools) {
      if (!availableTools.includes(toolName)) {
        throw new InvalidToolReferenceError(
          toolName,
          registration.id,
          availableTools
        );
      }
    }
  }

  /**
   * Get agent by ID
   * 
   * @param id - Agent identifier
   * @returns Agent registration or null if not found
   */
  static get(id: string): AgentRegistration | null {
    return this.registry.get(id) || null;
  }

  /**
   * Get agents that produce a specific capability
   * 
   * @param capability - Capability to search for
   * @returns Array of agents that produce this capability
   */
  static getByCapability(capability: string): AgentRegistration[] {
    return Array.from(this.registry.values()).filter((agent) =>
      agent.produces.includes(capability)
    );
  }

  /**
   * List all registered agents
   * 
   * @returns Array of all agent registrations
   */
  static listAll(): AgentRegistration[] {
    return Array.from(this.registry.values());
  }

  /**
   * Load agent registration from YAML configuration file
   * 
   * @param configPath - Path to YAML configuration file
   * @param executor - Agent executor function (must be provided separately)
   * @throws ConfigLoadError if loading or validation fails
   */
  static async loadFromConfig(
    configPath: string,
    executor: AgentExecutor
  ): Promise<void> {
    const loader = getYAMLLoader();

    try {
      // Load YAML config
      const yamlConfig = await loader.load(
        configPath,
        agentRegistrationYAMLSchema
      );

      // Create full registration with executor
      // Note: executor is not in YAML, so we add it here
      const registration = {
        ...yamlConfig,
        executor,
      } as AgentRegistration;

      // Register agent
      this.register(registration);
    } catch (error) {
      if (error instanceof ConfigFileNotFoundError) {
        throw new ConfigLoadError(configPath, error);
      }
      if (error instanceof ConfigValidationError) {
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
  static has(id: string): boolean {
    return this.registry.has(id);
  }

  /**
   * Get count of registered agents
   * 
   * @returns Number of registered agents
   */
  static count(): number {
    return this.registry.size;
  }

  /**
   * Clear registry (for testing)
   */
  static clear(): void {
    this.registry.clear();
    console.log('[AgentRegistry] Registry cleared');
  }

  /**
   * Export registry as JSON (for debugging/LLM consumption)
   * 
   * @returns JSON string representation of registry
   */
  static toJSON(): string {
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

    return JSON.stringify(
      {
        agents,
        total_agents: this.registry.size,
      },
      null,
      2
    );
  }
}
