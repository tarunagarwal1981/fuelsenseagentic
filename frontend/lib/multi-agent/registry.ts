/**
 * Agent and Tool Registry
 * 
 * Declarative metadata system for agents and their tools.
 * Enables LLM-based supervisor planning and intelligent tool selection.
 */

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
}

