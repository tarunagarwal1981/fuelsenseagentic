/**
 * Agent Loader
 *
 * Utilities for loading, validating, and registering agents from various sources.
 * Supports loading from YAML and JSON configuration files and programmatic registration.
 */

import { AgentRegistry } from '@/lib/registry/agent-registry';
import { ToolRegistry } from '@/lib/registry/tool-registry';
import type {
  AgentDefinition,
  AgentNodeFunction,
  ValidationResult,
} from '@/lib/types/agent-registry';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

/**
 * Load a single agent from a YAML file
 *
 * @param configPath - Path to YAML configuration file
 * @returns Parsed agent config (metadata only, no nodeFunction)
 */
export function loadAgentFromYaml(configPath: string): Record<string, unknown> {
  const fileContent = fs.readFileSync(configPath, 'utf-8');
  const parsed = yaml.parse(fileContent);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid YAML in ${configPath}`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Load all agents from a directory of YAML files
 *
 * @param configDir - Path to directory containing agent YAML files
 * @param nodeFunctionMap - Map of agent id -> node function (required for registration)
 * @returns Array of agent definitions ready for registration
 */
export function loadAgentsFromYamlDirectory(
  configDir: string,
  nodeFunctionMap: Record<string, AgentNodeFunction>
): AgentDefinition[] {
  const files = fs.readdirSync(configDir).filter((f) => f.endsWith('.yaml'));
  const definitions: AgentDefinition[] = [];

  for (const file of files) {
    const configPath = path.join(configDir, file);
    const config = loadAgentFromYaml(configPath);
    const id = config.id as string;
    if (!id) {
      console.warn(`⚠️ [AGENT-LOADER] Skipping ${file}: no id field`);
      continue;
    }
    const nodeFunction = nodeFunctionMap[id];
    if (!nodeFunction) {
      console.warn(
        `⚠️ [AGENT-LOADER] Skipping ${id}: no node function provided in nodeFunctionMap`
      );
      continue;
    }
    const definition = yamlConfigToAgentDefinition(config, nodeFunction);
    definitions.push(definition);
  }

  return definitions;
}

/**
 * Convert YAML config to AgentDefinition
 */
function yamlConfigToAgentDefinition(
  config: Record<string, unknown>,
  nodeFunction: AgentNodeFunction
): AgentDefinition {
  const now = new Date();
  const tools = config.tools as Record<string, string[]> | undefined;
  const execution = config.execution as Record<string, unknown> | undefined;
  const produces = config.produces as Record<string, string[]> | undefined;
  const consumes = config.consumes as Record<string, string[]> | undefined;
  const dependencies = config.dependencies as Record<string, string[]> | undefined;

  return {
    id: config.id as string,
    name: config.name as string,
    description: (config.description as string) || '',
    version: (config.metadata as Record<string, unknown>)?.version as string || '1.0.0',
    type: (config.type as AgentDefinition['type']) || 'specialist',
    domain: (config.domain as string[]) || [],
    capabilities: (config.capabilities as string[]) || [],
    intents: (config.intents as string[]) || [],
    produces: {
      stateFields: produces?.stateFields || [],
      messageTypes: produces?.messageTypes || [],
    },
    consumes: {
      required: consumes?.required || [],
      optional: consumes?.optional || [],
    },
    tools: {
      required: tools?.required || [],
      optional: tools?.optional || [],
    },
    dependencies: {
      upstream: dependencies?.upstream || [],
      downstream: dependencies?.downstream || [],
    },
    execution: {
      canRunInParallel: (execution?.canRunInParallel as boolean) ?? false,
      maxExecutionTimeMs: (execution?.maxExecutionTimeMs as number) ?? 30000,
      retryPolicy: {
        maxRetries: (execution?.retryPolicy as Record<string, number>)?.maxRetries ?? 2,
        backoffMs: (execution?.retryPolicy as Record<string, number>)?.backoffMs ?? 1000,
      },
    },
    implementation: `config/agents/${config.id}.yaml`,
    nodeFunction,
    metrics: {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      avgExecutionTimeMs: 0,
    },
    enabled: (config.enabled as boolean) ?? true,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Load agents from a configuration file (JSON or single YAML)
 *
 * @param configPath - Path to JSON or YAML configuration file
 * @param nodeFunctionMap - For YAML: map of agent id -> node function
 * @returns Array of loaded agent definitions
 */
export async function loadAgentsFromConfig(
  configPath: string,
  nodeFunctionMap?: Record<string, AgentNodeFunction>
): Promise<AgentDefinition[]> {
  try {
    const fileContent = fs.readFileSync(configPath, 'utf-8');

    if (configPath.endsWith('.json')) {
      const config = JSON.parse(fileContent);
      return Array.isArray(config.agents) ? config.agents : [];
    }

    if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
      const config = loadAgentFromYaml(configPath);
      const id = config.id as string;
      if (!id || !nodeFunctionMap?.[id]) {
        throw new Error(
          `YAML agent ${id} requires nodeFunctionMap to provide node function`
        );
      }
      return [yamlConfigToAgentDefinition(config, nodeFunctionMap[id])];
    }

    throw new Error('Unsupported config format. Use .json or .yaml');
  } catch (error: any) {
    throw new Error(`Failed to load agents from config: ${error.message}`);
  }
}

/**
 * Register a single agent with validation
 * 
 * @param definition - Agent definition to register
 * @returns Validation result
 * @throws Error if registration fails
 */
export function registerAgent(definition: AgentDefinition): ValidationResult {
  const registry = AgentRegistry.getInstance();
  const validation = validateAgentDefinition(definition);
  
  if (!validation.valid) {
    throw new Error(
      `Agent validation failed: ${validation.errors.join(', ')}`
    );
  }
  
  try {
    registry.register(definition);
    return {
      valid: true,
      errors: [],
      warnings: validation.warnings,
    };
  } catch (error: any) {
    return {
      valid: false,
      errors: [error.message],
      warnings: validation.warnings,
    };
  }
}

/**
 * Register multiple agents from an array
 * 
 * @param definitions - Array of agent definitions
 * @returns Array of validation results (one per agent)
 */
export function registerAgents(definitions: AgentDefinition[]): ValidationResult[] {
  return definitions.map((def) => {
    try {
      return registerAgent(def);
    } catch (error: any) {
      return {
        valid: false,
        errors: [error.message],
        warnings: [],
      };
    }
  });
}

/**
 * Validate an agent definition
 * 
 * Performs comprehensive validation including:
 * - Schema structure validation
 * - ID uniqueness check (if already registered)
 * - Dependency validation
 * - Tool availability check
 * - Semantic versioning check
 * 
 * @param definition - Agent definition to validate
 * @returns Validation result with errors and warnings
 */
export function validateAgentDefinition(
  definition: AgentDefinition
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const agentRegistry = AgentRegistry.getInstance();
  const toolRegistry = ToolRegistry.getInstance();
  
  // Basic structure validation
  if (!definition.id || typeof definition.id !== 'string') {
    errors.push('Agent ID is required and must be a string');
  }
  
  if (!definition.name || typeof definition.name !== 'string') {
    errors.push('Agent name is required and must be a string');
  }
  
  if (!definition.description || typeof definition.description !== 'string') {
    errors.push('Agent description is required and must be a string');
  }
  
  // Version validation (semver)
  if (!definition.version || typeof definition.version !== 'string') {
    errors.push('Agent version is required and must be a string');
  } else {
    const semverPattern = /^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?(\+[a-zA-Z0-9-]+)?$/;
    if (!semverPattern.test(definition.version)) {
      warnings.push(
        `Version '${definition.version}' does not follow semantic versioning (X.Y.Z[-prerelease][+build])`
      );
    }
  }
  
  // Validate domain
  if (!Array.isArray(definition.domain) || definition.domain.length === 0) {
    errors.push('Agent domain must be a non-empty array');
  }
  
  // Validate capabilities
  if (!Array.isArray(definition.capabilities)) {
    errors.push('Agent capabilities must be an array');
  }
  
  // Validate intents
  if (!Array.isArray(definition.intents)) {
    errors.push('Agent intents must be an array');
  }
  
  // Validate produces/consumes
  if (!definition.produces || typeof definition.produces !== 'object') {
    errors.push('Agent produces is required');
  } else {
    if (!Array.isArray(definition.produces.stateFields)) {
      errors.push('produces.stateFields must be an array');
    }
    if (!Array.isArray(definition.produces.messageTypes)) {
      errors.push('produces.messageTypes must be an array');
    }
  }
  
  if (!definition.consumes || typeof definition.consumes !== 'object') {
    errors.push('Agent consumes is required');
  } else {
    if (!Array.isArray(definition.consumes.required)) {
      errors.push('consumes.required must be an array');
    }
    if (!Array.isArray(definition.consumes.optional)) {
      errors.push('consumes.optional must be an array');
    }
  }
  
  // Validate tools
  if (definition.tools) {
    if (Array.isArray(definition.tools.required)) {
      for (const toolId of definition.tools.required) {
        if (!toolRegistry.has(toolId)) {
          warnings.push(
            `Required tool '${toolId}' is not yet registered in ToolRegistry. ` +
            `Ensure it is registered before using this agent.`
          );
        }
      }
    }
    
    if (Array.isArray(definition.tools.optional)) {
      for (const toolId of definition.tools.optional) {
        if (!toolRegistry.has(toolId)) {
          warnings.push(
            `Optional tool '${toolId}' is not yet registered in ToolRegistry.`
          );
        }
      }
    }
  }
  
  // Validate dependencies
  if (definition.dependencies) {
    if (Array.isArray(definition.dependencies.upstream)) {
      for (const depId of definition.dependencies.upstream) {
        if (!agentRegistry.has(depId)) {
          warnings.push(
            `Upstream dependency '${depId}' is not yet registered. ` +
            `Ensure it is registered before using this agent.`
          );
        }
      }
    }
    
    if (Array.isArray(definition.dependencies.downstream)) {
      for (const depId of definition.dependencies.downstream) {
        if (!agentRegistry.has(depId)) {
          warnings.push(
            `Downstream dependency '${depId}' is not yet registered.`
          );
        }
      }
    }
  }
  
  // Check for duplicate ID
  if (agentRegistry.has(definition.id)) {
    errors.push(`Agent with ID '${definition.id}' is already registered`);
  }
  
  // Validate implementation
  if (typeof definition.nodeFunction !== 'function') {
    errors.push('nodeFunction must be a function');
  }
  
  // Validate metrics initialization
  if (!definition.metrics) {
    warnings.push('Metrics not initialized. Default metrics will be used.');
  }
  
  // Timestamp validation
  if (!(definition.createdAt instanceof Date)) {
    errors.push('createdAt must be a Date object');
  }
  
  if (!(definition.updatedAt instanceof Date)) {
    errors.push('updatedAt must be a Date object');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check all dependencies exist
 * 
 * @returns Validation result
 */
export function checkDependencies(): ValidationResult {
  const agentRegistry = AgentRegistry.getInstance();
  const agents = agentRegistry.getAll();
  const errors: string[] = [];
  const warnings: string[] = [];
  
  for (const agent of agents) {
    for (const depId of agent.dependencies.upstream) {
      if (!agentRegistry.has(depId)) {
        errors.push(`Agent ${agent.id} depends on non-existent agent: ${depId}`);
      }
    }
    
    for (const depId of agent.dependencies.downstream) {
      if (!agentRegistry.has(depId)) {
        warnings.push(`Agent ${agent.id} has downstream dependency on non-existent agent: ${depId}`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Detect circular dependencies
 * 
 * @returns Array of cycles (each cycle is an array of agent IDs)
 */
export function detectCycles(): string[][] {
  const agentRegistry = AgentRegistry.getInstance();
  const graph = agentRegistry.getDependencyGraph();
  return graph.cycles;
}

/**
 * Create a default agent definition template
 * 
 * Useful for creating new agent definitions with required fields initialized.
 * 
 * @param id - Agent ID
 * @param name - Agent name
 * @param nodeFunction - Agent node function
 * @returns Partial agent definition with defaults filled in
 */
export function createAgentTemplate(
  id: string,
  name: string,
  nodeFunction: AgentDefinition['nodeFunction']
): Partial<AgentDefinition> {
  const now = new Date();
  
  return {
    id,
    name,
    description: '',
    version: '1.0.0',
    type: 'specialist',
    domain: [],
    capabilities: [],
    intents: [],
    produces: {
      stateFields: [],
      messageTypes: [],
    },
    consumes: {
      required: [],
      optional: [],
    },
    tools: {
      required: [],
      optional: [],
    },
    dependencies: {
      upstream: [],
      downstream: [],
    },
    execution: {
      canRunInParallel: false,
      maxExecutionTimeMs: 30000,
      retryPolicy: {
        maxRetries: 2,
        backoffMs: 1000,
      },
    },
    implementation: '',
    nodeFunction,
    metrics: {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      avgExecutionTimeMs: 0,
    },
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Export all registered agents to a JSON configuration file
 * 
 * @param outputPath - Path to write the JSON file
 * @returns Number of agents exported
 */
export function exportAgentsToConfig(outputPath: string): number {
  const registry = AgentRegistry.getInstance();
  const agents = registry.getAll();
  
  const config = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    agents: agents.map((agent) => {
      // Remove nodeFunction (not serializable)
      const { nodeFunction, ...serializableAgent } = agent;
      return serializableAgent;
    }),
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(config, null, 2), 'utf-8');
  console.log(`✅ [AGENT-LOADER] Exported ${agents.length} agents to ${outputPath}`);
  
  return agents.length;
}
