/**
 * Agent and Tool Registry
 *
 * Declarative metadata system for agents and their tools.
 * Enables LLM-based supervisor planning and intelligent tool selection.
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Runnable } from '@langchain/core/runnables';
import type { z } from 'zod';
import { getToolExecutor } from './tools';

// ============================================================================
// Zod to JSON Schema Converter
// ============================================================================

/**
 * Convert a Zod schema to JSON Schema format for LLM tool binding
 * This is a simplified converter that handles common Zod types
 * 
 * @param zodSchema - The Zod schema to convert
 * @returns JSON Schema object
 */
export function zodSchemaToJsonSchema(zodSchema: z.ZodTypeAny): ToolParameterSchema {
  try {
    // Use LangChain's internal method if available, otherwise manual conversion
    const def = (zodSchema as any)._def;
    
    if (!def) {
      return { type: 'object', properties: {}, required: [] };
    }
    
    return convertZodDef(def);
  } catch (error) {
    console.warn('⚠️ [REGISTRY] Failed to convert Zod schema:', error);
    return { type: 'object', properties: {}, required: [] };
  }
}

/**
 * Recursively convert Zod definition to JSON Schema
 */
function convertZodDef(def: any): ToolParameterSchema {
  const typeName = def.typeName;
  
  if (typeName === 'ZodObject') {
    const shape = def.shape?.();
    const properties: Record<string, any> = {};
    const required: string[] = [];
    
    if (shape) {
      for (const [key, value] of Object.entries(shape)) {
        const fieldDef = (value as any)._def;
        properties[key] = convertZodFieldToProperty(value as any);
        
        // Check if field is required (not optional, not nullable, not with default)
        if (!isOptionalField(value as any)) {
          required.push(key);
        }
      }
    }
    
    return { type: 'object', properties, required };
  }
  
  return { type: 'object', properties: {}, required: [] };
}

/**
 * Convert a single Zod field to JSON Schema property
 */
function convertZodFieldToProperty(zodField: any): any {
  const def = zodField._def;
  const typeName = def?.typeName;
  const description = def?.description || '';
  
  // Handle optional wrapper
  if (typeName === 'ZodOptional') {
    const innerResult = convertZodFieldToProperty(def.innerType);
    return { ...innerResult, description: innerResult.description || description };
  }
  
  // Handle default wrapper
  if (typeName === 'ZodDefault') {
    const innerResult = convertZodFieldToProperty(def.innerType);
    return { ...innerResult, description: innerResult.description || description };
  }
  
  // Handle nullable wrapper
  if (typeName === 'ZodNullable') {
    const innerResult = convertZodFieldToProperty(def.innerType);
    return { ...innerResult, description: innerResult.description || description };
  }
  
  // Handle primitive types
  switch (typeName) {
    case 'ZodString':
      return { type: 'string', description };
    case 'ZodNumber':
      return { type: 'number', description };
    case 'ZodBoolean':
      return { type: 'boolean', description };
    case 'ZodArray':
      const itemType = def.type ? convertZodFieldToProperty(def.type) : { type: 'string' };
      return { type: 'array', items: itemType, description };
    case 'ZodObject':
      const objectSchema = convertZodDef(def);
      return { type: 'object', properties: objectSchema.properties, description };
    case 'ZodEnum':
      return { type: 'string', enum: def.values, description };
    default:
      return { type: 'string', description };
  }
}

/**
 * Check if a Zod field is optional
 */
function isOptionalField(zodField: any): boolean {
  const def = zodField._def;
  const typeName = def?.typeName;
  
  if (typeName === 'ZodOptional' || typeName === 'ZodDefault' || typeName === 'ZodNullable') {
    return true;
  }
  
  return false;
}

// ============================================================================
// Tool Schema Types
// ============================================================================

/**
 * JSON Schema for tool parameters (OpenAI function calling format)
 */
export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description?: string;
    items?: { type: string; properties?: Record<string, unknown> };
    properties?: Record<string, unknown>;
    required?: string[];
  }>;
  required?: string[];
}

/**
 * OpenAI function calling format for LLM binding
 */
export interface LLMToolBinding {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: ToolParameterSchema;
  };
}

// ============================================================================
// Tool Metadata
// ============================================================================

/**
 * Metadata for a tool available to an agent
 */
export interface ToolMetadata {
  /** Tool name (must match tool.name) */
  tool_name: string;
  /** Human-readable description of what the tool does */
  description: string;
  /** Conditions when this tool should be called */
  when_to_use: string[];
  /** Conditions when this tool should NOT be called */
  when_not_to_use: string[];
  /** Required state fields before tool can be used */
  prerequisites: string[];
  /** State fields this tool produces/updates */
  produces: string[];
  /** JSON Schema for tool parameters (for LLM binding) */
  schema?: ToolParameterSchema;
}

// ============================================================================
// Agent Registry Entry
// ============================================================================

/**
 * Registry entry for an agent
 */
export interface AgentRegistryEntry {
  /** Agent name (must match node name in graph) */
  agent_name: string;
  /** Human-readable description of agent's purpose */
  description: string;
  /** Tools available to this agent */
  available_tools: ToolMetadata[];
  /** Required state fields before agent can execute */
  prerequisites: string[];
  /** State fields this agent produces */
  outputs: string[];
  /** Whether this agent uses deterministic workflow (no LLM tool-calling) */
  is_deterministic?: boolean;
  /** Workflow steps for deterministic agents */
  workflow_steps?: string[];
}

// ============================================================================
// Agent Registry
// ============================================================================

/**
 * Central registry for all agents in the multi-agent system
 */
export class AgentRegistry {
  private static registry: Map<string, AgentRegistryEntry> = new Map();

  /**
   * Register an agent with the registry
   */
  static registerAgent(entry: AgentRegistryEntry): void {
    if (this.registry.has(entry.agent_name)) {
      console.warn(
        `⚠️ [REGISTRY] Agent ${entry.agent_name} already registered, overwriting`
      );
    }
    this.registry.set(entry.agent_name, entry);
    console.log(
      `✅ [REGISTRY] Registered agent: ${entry.agent_name} with ${entry.available_tools.length} tools`
    );
  }

  /**
   * Get agent metadata by name
   */
  static getAgent(name: string): AgentRegistryEntry | undefined {
    return this.registry.get(name);
  }

  /**
   * Get all registered agents
   */
  static getAllAgents(): AgentRegistryEntry[] {
    return Array.from(this.registry.values());
  }

  /**
   * Get agents that can produce a specific output
   */
  static getAgentsByCapability(capability: string): AgentRegistryEntry[] {
    return this.getAllAgents().filter((agent) =>
      agent.outputs.includes(capability)
    );
  }

  /**
   * Convert registry to JSON for LLM consumption
   */
  static toJSON(): string {
    return JSON.stringify(
      {
        agents: this.getAllAgents(),
        total_agents: this.registry.size,
      },
      null,
      2
    );
  }

  /**
   * Clear registry (for testing)
   */
  static clear(): void {
    this.registry.clear();
  }

  /**
   * Check if an agent is deterministic (no LLM tool-calling)
   * Deterministic agents execute a fixed workflow and don't need tool binding
   * 
   * @param agentName - The agent name to check
   * @returns true if the agent is deterministic
   */
  static isDeterministicAgent(agentName: string): boolean {
    const agent = this.registry.get(agentName);
    return agent?.is_deterministic === true;
  }

  /**
   * Get tool names for a specific agent
   *
   * @param agentName - The agent name
   * @returns Array of tool names available to the agent
   */
  static getToolNamesForAgent(agentName: string): string[] {
    const agent = this.registry.get(agentName);
    if (!agent) {
      return [];
    }
    return agent.available_tools.map((t) => t.tool_name);
  }

  /**
   * Get tool executors for a specific agent (for dynamic dispatch).
   * Returns an object mapping tool names to circuit-breaker-wrapped executors.
   * Agent nodes can use this for intent-based tool invocation.
   *
   * @param agentName - The agent name
   * @returns Object with tool names as keys and executor functions as values
   */
  static getToolsForAgent(agentName: string): Record<string, (input: unknown) => Promise<unknown>> {
    const agent = this.registry.get(agentName);
    if (!agent) {
      return {};
    }
    const result: Record<string, (input: unknown) => Promise<unknown>> = {};
    for (const tool of agent.available_tools) {
      const executor = getToolExecutor(tool.tool_name);
      if (executor) {
        result[tool.tool_name] = executor;
      }
    }
    return result;
  }

  /**
   * Get all unique tools from all agents for LLM binding
   * Returns tools in OpenAI function calling format
   * 
   * @returns Array of tools in LLM binding format
   */
  static getToolsForLLMBinding(): LLMToolBinding[] {
    const allTools: LLMToolBinding[] = [];
    const seenToolNames = new Set<string>();

    for (const agent of this.getAllAgents()) {
      // Skip deterministic agents - they don't use LLM tool calling
      if (agent.is_deterministic) {
        continue;
      }

      for (const tool of agent.available_tools) {
        // Deduplicate by tool name
        if (seenToolNames.has(tool.tool_name)) {
          continue;
        }
        seenToolNames.add(tool.tool_name);

        // Convert to LLM binding format
        const binding: LLMToolBinding = {
          type: 'function',
          function: {
            name: tool.tool_name,
            description: tool.description,
            parameters: tool.schema || {
              type: 'object',
              properties: {},
              required: [],
            },
          },
        };

        allTools.push(binding);
      }
    }

    console.log(`🔧 [REGISTRY] Generated ${allTools.length} tools for LLM binding`);
    return allTools;
  }

  /**
   * Bind tools to an LLM for supervisor planning
   * Uses the LLM's bindTools method with tools in OpenAI function format
   * 
   * @param llm - The base LLM to bind tools to
   * @returns LLM with tools bound (or original LLM if binding fails)
   */
  static bindToolsToSupervisor(llm: BaseChatModel): Runnable | BaseChatModel {
    const tools = this.getToolsForLLMBinding();
    
    if (tools.length === 0) {
      console.warn('⚠️ [REGISTRY] No tools available for LLM binding');
      return llm;
    }

    try {
      // Check if bindTools method exists on this LLM
      if (typeof llm.bindTools !== 'function') {
        console.warn('⚠️ [REGISTRY] LLM does not support bindTools method');
        return llm;
      }
      
      // LangChain's bindTools accepts OpenAI function format
      const llmWithTools = llm.bindTools(tools);
      console.log(`✅ [REGISTRY] Bound ${tools.length} tools to supervisor LLM`);
      console.log(`   Tools: ${tools.map(t => t.function.name).join(', ')}`);
      return llmWithTools;
    } catch (error) {
      console.error('❌ [REGISTRY] Failed to bind tools to LLM:', error);
      // Return original LLM as fallback
      return llm;
    }
  }

  /**
   * Validate that a tool exists for an agent
   * 
   * @param toolName - The tool name to validate
   * @param agentName - The agent name to check against
   * @returns true if the tool is available for the agent
   */
  static validateToolForAgent(toolName: string, agentName: string): boolean {
    const agent = this.registry.get(agentName);
    if (!agent) {
      return false;
    }
    return agent.available_tools.some(t => t.tool_name === toolName);
  }

  /**
   * Get total tool count across all non-deterministic agents
   * 
   * @returns Total number of unique tools
   */
  static getTotalToolCount(): number {
    return this.getToolsForLLMBinding().length;
  }
}

