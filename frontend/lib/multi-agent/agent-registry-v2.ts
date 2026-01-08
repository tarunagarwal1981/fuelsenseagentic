/**
 * Agent Registry V2
 * 
 * Enhanced agent registry with dependency tracking and parallelization support.
 * 
 * CRITICAL: This is a SEPARATE registry from the existing AgentRegistry.
 * Do NOT extend or wrap the existing AgentRegistry. Both will coexist during migration.
 */

// ============================================================================
// Agent Metadata Interface
// ============================================================================

/**
 * Comprehensive metadata for an agent in the multi-agent system
 */
export interface AgentMetadata {
  /** Unique identifier */
  agent_id: string;
  /** Human-readable name */
  agent_name: string;
  /** Version number */
  version: string;
  /** Domain: "route_planning", "weather_analysis", "bunker_planning", etc. */
  domain: string;
  /** What this agent does */
  description: string;
  /** Structured prerequisites */
  prerequisites: {
    /** State fields needed (e.g., ["route_data"]) */
    required_state: string[];
    /** State fields that enhance results */
    optional_state: string[];
    /** Agents that must run first */
    required_agents: string[];
  };
  /** Structured outputs */
  produces: {
    /** Main outputs created */
    primary: string[];
    /** Other state fields modified */
    side_effects: string[];
  };
  /** Tools this agent can use */
  available_tools: string[];
  /** Tools that must be available */
  required_tools: string[];
  /** Typical execution time in milliseconds */
  avg_execution_time_ms: number;
  /** Can run parallel with others? */
  can_run_in_parallel: boolean;
  /** Execution priority */
  priority: 'critical' | 'high' | 'medium' | 'low';
}

// ============================================================================
// Agent Registry V2 Class
// ============================================================================

/**
 * Central registry for all agents in the multi-agent system (V2)
 * 
 * Features:
 * - Dependency graph building
 * - Parallelization detection
 * - Domain-based queries
 * - JSON export for LLM prompts
 */
export class AgentRegistryV2 {
  private static agents: Map<string, AgentMetadata> = new Map();

  /**
   * Register a new agent with full metadata
   * 
   * @param metadata - Agent metadata to register
   * @throws Error if agent_id already exists or required fields are missing
   */
  static register(metadata: AgentMetadata): void {
    // Validate no duplicate agent_id
    if (this.agents.has(metadata.agent_id)) {
      throw new Error(`Agent ${metadata.agent_id} already registered`);
    }

    // Validate required fields
    if (!metadata.agent_id || !metadata.domain || !metadata.agent_name) {
      throw new Error('Missing required agent metadata fields: agent_id, domain, or agent_name');
    }

    // Validate prerequisites structure
    if (!metadata.prerequisites || !Array.isArray(metadata.prerequisites.required_state)) {
      throw new Error(`Agent ${metadata.agent_id} has invalid prerequisites structure`);
    }

    // Validate produces structure
    if (!metadata.produces || !Array.isArray(metadata.produces.primary)) {
      throw new Error(`Agent ${metadata.agent_id} has invalid produces structure`);
    }

    this.agents.set(metadata.agent_id, metadata);
    console.log(`✅ [REGISTRY-V2] Registered agent: ${metadata.agent_id} (${metadata.domain})`);
  }

  /**
   * Get agent by ID
   * 
   * @param agent_id - Agent identifier
   * @returns Agent metadata or undefined if not found
   */
  static getAgent(agent_id: string): AgentMetadata | undefined {
    return this.agents.get(agent_id);
  }

  /**
   * Get all registered agents
   * 
   * @returns Array of all agent metadata
   */
  static getAllAgents(): AgentMetadata[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by domain
   * 
   * @param domain - Domain to filter by
   * @returns Array of agents in the specified domain
   */
  static getAgentsByDomain(domain: string): AgentMetadata[] {
    return this.getAllAgents().filter(a => a.domain === domain);
  }

  /**
   * Build dependency graph
   * Returns Map of agent_id -> array of agent_ids it depends on
   * 
   * Automatically infers dependencies from:
   * 1. Explicit required_agents
   * 2. Implicit dependencies from state requirements (which agents produce needed state)
   * 
   * @returns Dependency graph as Map<agent_id, dependencies[]>
   */
  static buildDependencyGraph(): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    for (const agent of this.getAllAgents()) {
      const dependencies: string[] = [];

      // Add explicit agent dependencies
      if (agent.prerequisites.required_agents) {
        dependencies.push(...agent.prerequisites.required_agents);
      }

      // Add implicit dependencies from state requirements
      if (agent.prerequisites.required_state) {
        for (const stateField of agent.prerequisites.required_state) {
          // Find which agents produce this state field
          const producers = this.getAllAgents().filter(
            a =>
              a.produces.primary.includes(stateField) ||
              a.produces.side_effects.includes(stateField)
          );

          // Add these agents as dependencies
          dependencies.push(...producers.map(p => p.agent_id));
        }
      }

      // Remove duplicates and self-references
      const uniqueDeps = [...new Set(dependencies)].filter(dep => dep !== agent.agent_id);
      graph.set(agent.agent_id, uniqueDeps);
    }

    return graph;
  }

  /**
   * Get groups of agents that can run in parallel
   * 
   * Groups agents that:
   * - Have can_run_in_parallel: true
   * - Don't depend on each other
   * - Don't have circular dependencies
   * 
   * @returns Array of agent ID groups that can run in parallel
   */
  static getParallelizableGroups(): string[][] {
    const groups: string[][] = [];
    const allAgents = this.getAllAgents();
    const dependencyGraph = this.buildDependencyGraph();

    for (const agent of allAgents) {
      if (!agent.can_run_in_parallel) continue;

      let addedToGroup = false;

      // Try to add to existing group
      for (const group of groups) {
        const canJoinGroup = group.every(groupAgentId => {
          const groupDeps = dependencyGraph.get(groupAgentId) || [];
          const agentDeps = dependencyGraph.get(agent.agent_id) || [];

          // Check no circular dependencies
          return (
            !groupDeps.includes(agent.agent_id) && !agentDeps.includes(groupAgentId)
          );
        });

        if (canJoinGroup) {
          group.push(agent.agent_id);
          addedToGroup = true;
          break;
        }
      }

      // Create new group if couldn't join existing
      if (!addedToGroup) {
        groups.push([agent.agent_id]);
      }
    }

    return groups;
  }

  /**
   * Export registry as JSON for LLM prompts
   * 
   * @returns JSON string representation of all agents
   */
  static toJSON(): string {
    const agents = this.getAllAgents();
    return JSON.stringify(agents, null, 2);
  }

  /**
   * Clear all agents (for testing)
   */
  static clear(): void {
    this.agents.clear();
    console.log('🧹 [REGISTRY-V2] Cleared all agents');
  }
}

// ============================================================================
// Agent Registration
// ============================================================================

// Register route_agent
AgentRegistryV2.register({
  agent_id: 'route_agent',
  agent_name: 'Route Planning Agent',
  version: '1.0.0',
  domain: 'route_planning',
  description: 'Calculates maritime routes between ports and generates vessel timeline',
  prerequisites: {
    required_state: [],
    optional_state: [],
    required_agents: [],
  },
  produces: {
    primary: ['route_data', 'vessel_timeline'],
    side_effects: [],
  },
  available_tools: ['calculate_route', 'calculate_weather_timeline'],
  required_tools: ['calculate_route'],
  avg_execution_time_ms: 3000,
  can_run_in_parallel: false, // Must run first
  priority: 'critical',
});

// Register weather_agent
AgentRegistryV2.register({
  agent_id: 'weather_agent',
  agent_name: 'Weather Analysis Agent',
  version: '1.0.0',
  domain: 'weather_analysis',
  description:
    'Analyzes weather impact on voyages and calculates weather-adjusted consumption',
  prerequisites: {
    required_state: ['vessel_timeline'],
    optional_state: [],
    required_agents: ['route_agent'],
  },
  produces: {
    primary: ['weather_forecast', 'weather_consumption', 'port_weather_status'],
    side_effects: [],
  },
  available_tools: [
    'fetch_marine_weather',
    'calculate_weather_consumption',
    'check_bunker_port_weather',
  ],
  required_tools: ['fetch_marine_weather'],
  avg_execution_time_ms: 5000,
  can_run_in_parallel: true,
  priority: 'critical',
});

// Register bunker_agent
AgentRegistryV2.register({
  agent_id: 'bunker_agent',
  agent_name: 'Bunker Optimization Agent',
  version: '1.0.0',
  domain: 'bunker_planning',
  description: 'Finds and analyzes bunker port options along route',
  prerequisites: {
    required_state: ['route_data'],
    optional_state: ['weather_consumption', 'port_weather_status'],
    required_agents: ['route_agent'],
  },
  produces: {
    primary: ['bunker_ports', 'port_prices', 'bunker_analysis'],
    side_effects: [],
  },
  available_tools: ['find_bunker_ports', 'get_fuel_prices', 'analyze_bunker_options'],
  required_tools: ['find_bunker_ports', 'get_fuel_prices'],
  avg_execution_time_ms: 8000,
  can_run_in_parallel: true,
  priority: 'critical',
});

