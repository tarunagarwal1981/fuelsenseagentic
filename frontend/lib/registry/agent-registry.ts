/**
 * Agent Registry
 * 
 * Centralized registry for all agents in the FuelSense 360 multi-agent architecture.
 * Provides agent discovery, dependency tracking, and intelligent routing capabilities.
 * 
 * Features:
 * - Singleton pattern for global access
 * - In-memory storage with Map for O(1) lookups
 * - Advanced search and filtering
 * - Dependency graph analysis
 * - Validation and cycle detection
 * - Metrics tracking
 */

import type {
  AgentDefinition,
  AgentType,
  AgentSearchCriteria,
  ValidationResult,
  AgentDependencyGraph,
} from '@/lib/types/agent-registry';
import { ToolRegistry } from '@/lib/registry/tool-registry';

export class AgentRegistry {
  private static instance: AgentRegistry;
  private agents: Map<string, AgentDefinition> = new Map();

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry();
    }
    return AgentRegistry.instance;
  }

  /**
   * Register an agent with the registry
   * 
   * @param agent - Agent definition to register
   * @throws Error if agent ID already exists or validation fails
   */
  register(agent: AgentDefinition): void {
    // Validate agent definition
    const validation = this.validateAgentDefinition(agent);
    if (!validation.valid) {
      throw new Error(
        `Failed to register agent ${agent.id}: ${validation.errors.join(', ')}`
      );
    }

    // Check for duplicate ID
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent with ID '${agent.id}' is already registered`);
    }

    // Verify all required tools exist in ToolRegistry
    const toolRegistry = ToolRegistry.getInstance();
    for (const toolId of agent.tools.required) {
      if (!toolRegistry.has(toolId)) {
        throw new Error(
          `Agent ${agent.id} requires tool '${toolId}' which is not registered`
        );
      }
    }

    // Register the agent
    this.agents.set(agent.id, { ...agent });
    console.log(`✅ [AGENT-REGISTRY] Registered agent: ${agent.id} (${agent.name})`);
  }

  /**
   * Get an agent by its ID
   * 
   * @param agentId - Unique agent identifier
   * @returns Agent definition or undefined if not found
   */
  getById(agentId: string): AgentDefinition | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents in a specific domain
   * 
   * @param domain - Domain tag to filter by
   * @returns Array of agent definitions
   */
  getByDomain(domain: string): AgentDefinition[] {
    return Array.from(this.agents.values()).filter((agent) =>
      agent.domain.includes(domain)
    );
  }

  /**
   * Get all agents with a specific capability
   * 
   * @param capability - Capability to search for
   * @returns Array of agent definitions
   */
  getByCapability(capability: string): AgentDefinition[] {
    return Array.from(this.agents.values()).filter((agent) =>
      agent.capabilities.includes(capability)
    );
  }

  /**
   * Get all registered agents
   * 
   * @returns Array of all agent definitions
   */
  getAll(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  /**
   * Find agents by intent
   * 
   * @param intent - Intent to search for
   * @returns Array of agent definitions that handle this intent
   */
  findByIntent(intent: string): AgentDefinition[] {
    return Array.from(this.agents.values()).filter((agent) =>
      agent.intents.includes(intent)
    );
  }

  /**
   * Get all agents with a specific intent (alias for findByIntent)
   * 
   * @param intent - Intent to search for
   * @returns Array of agent definitions that handle this intent
   */
  getByIntent(intent: string): AgentDefinition[] {
    return this.findByIntent(intent);
  }

  /**
   * Search agents by multiple criteria
   * 
   * @param criteria - Search criteria object
   * @returns Array of matching agent definitions
   */
  search(criteria: AgentSearchCriteria): AgentDefinition[] {
    let results = Array.from(this.agents.values());

    // Filter by domain
    if (criteria.domain) {
      results = results.filter((agent) => agent.domain.includes(criteria.domain!));
    }

    // Filter by capability
    if (criteria.capability) {
      results = results.filter((agent) =>
        agent.capabilities.includes(criteria.capability!)
      );
    }

    // Filter by type
    if (criteria.type) {
      results = results.filter((agent) => agent.type === criteria.type);
    }

    // Filter by parallel execution capability
    if (criteria.canRunInParallel !== undefined) {
      results = results.filter(
        (agent) => agent.execution.canRunInParallel === criteria.canRunInParallel
      );
    }

    // Filter by enabled status
    if (criteria.enabled !== undefined) {
      results = results.filter((agent) => agent.enabled === criteria.enabled);
    }

    // Filter by intent
    if (criteria.intent) {
      results = results.filter((agent) => agent.intents.includes(criteria.intent!));
    }

    // Exclude deprecated agents
    results = results.filter((agent) => !agent.deprecated);

    return results;
  }

  /**
   * Validate an agent definition
   * 
   * @param agentId - Agent ID to validate (if agent is already registered)
   * @returns Validation result with errors and warnings
   */
  validate(agentId: string): ValidationResult {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return {
        valid: false,
        errors: [`Agent with ID '${agentId}' not found`],
        warnings: [],
      };
    }

    return this.validateAgentDefinition(agent);
  }

  /**
   * Get dependency graph for all agents
   * 
   * @returns Dependency graph with nodes, edges, and cycles
   */
  getDependencyGraph(): AgentDependencyGraph {
    const nodes = Array.from(this.agents.keys());
    const edges: Array<[string, string]> = [];
    const cycles: string[][] = [];

    // Build edges from dependencies
    for (const agent of this.agents.values()) {
      for (const upstreamId of agent.dependencies.upstream) {
        if (this.agents.has(upstreamId)) {
          edges.push([upstreamId, agent.id]);
        }
      }
    }

    // Detect cycles using DFS
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string): string[] | null => {
      if (recStack.has(nodeId)) {
        // Found a cycle
        const cycleStart = path.indexOf(nodeId);
        return [...path.slice(cycleStart), nodeId];
      }

      if (visited.has(nodeId)) {
        return null;
      }

      visited.add(nodeId);
      recStack.add(nodeId);
      path.push(nodeId);

      // Check all downstream dependencies
      const agent = this.agents.get(nodeId);
      if (agent) {
        for (const downstreamId of agent.dependencies.downstream) {
          const cycle = dfs(downstreamId);
          if (cycle) {
            recStack.delete(nodeId);
            path.pop();
            return cycle;
          }
        }
      }

      recStack.delete(nodeId);
      path.pop();
      return null;
    };

    for (const nodeId of nodes) {
      if (!visited.has(nodeId)) {
        const cycle = dfs(nodeId);
        if (cycle) {
          cycles.push(cycle);
        }
      }
    }

    return { nodes, edges, cycles };
  }

  /**
   * Get execution order for a list of agents (topological sort)
   * 
   * @param agentIds - Array of agent IDs to order
   * @returns Array of agent IDs in valid execution order
   * @throws Error if circular dependencies detected
   */
  getExecutionOrder(agentIds: string[]): string[] {
    const graph = this.getDependencyGraph();

    // Check for cycles in the subset
    const subsetNodes = new Set(agentIds);
    const subsetCycles = graph.cycles.filter((cycle) =>
      cycle.every((node) => subsetNodes.has(node))
    );

    if (subsetCycles.length > 0) {
      throw new Error(
        `Circular dependencies detected: ${subsetCycles.map((c) => c.join(' -> ')).join(', ')}`
      );
    }

    // Build adjacency list for the subset
    const adjList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    for (const agentId of agentIds) {
      adjList.set(agentId, []);
      inDegree.set(agentId, 0);
    }

    // Add edges within the subset
    for (const [from, to] of graph.edges) {
      if (subsetNodes.has(from) && subsetNodes.has(to)) {
        adjList.get(from)!.push(to);
        inDegree.set(to, (inDegree.get(to) || 0) + 1);
      }
    }

    // Kahn's algorithm for topological sort
    const queue: string[] = [];
    const result: string[] = [];

    // Find all nodes with no incoming edges
    for (const agentId of agentIds) {
      if (inDegree.get(agentId) === 0) {
        queue.push(agentId);
      }
    }

    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);

      for (const neighbor of adjList.get(node) || []) {
        const newInDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newInDegree);
        if (newInDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // Check if all nodes were processed
    if (result.length !== agentIds.length) {
      throw new Error('Could not determine execution order - circular dependencies detected');
    }

    return result;
  }

  /**
   * Get agents that can run in parallel
   * 
   * @param agentIds - Array of agent IDs to check
   * @returns Array of agent ID groups that can run in parallel
   */
  getParallelGroups(agentIds: string[]): string[][] {
    const groups: string[][] = [];
    const graph = this.getDependencyGraph();
    const subsetNodes = new Set(agentIds);

    // Build dependency map
    const dependsOn = new Map<string, Set<string>>();
    for (const agentId of agentIds) {
      dependsOn.set(agentId, new Set());
    }

    for (const [from, to] of graph.edges) {
      if (subsetNodes.has(from) && subsetNodes.has(to)) {
        dependsOn.get(to)!.add(from);
      }
    }

    // Group agents that have no dependencies on each other
    const processed = new Set<string>();
    const currentGroup: string[] = [];

    for (const agentId of agentIds) {
      if (processed.has(agentId)) continue;

      const agent = this.agents.get(agentId);
      if (!agent || !agent.execution.canRunInParallel) continue;

      // Check if this agent can run with any in current group
      let canAddToGroup = true;
      for (const groupMember of currentGroup) {
        const memberDependsOnAgent = dependsOn.get(groupMember)?.has(agentId);
        const agentDependsOnMember = dependsOn.get(agentId)?.has(groupMember);

        if (memberDependsOnAgent || agentDependsOnMember) {
          canAddToGroup = false;
          break;
        }
      }

      if (canAddToGroup) {
        currentGroup.push(agentId);
        processed.add(agentId);
      }
    }

    if (currentGroup.length > 0) {
      groups.push([...currentGroup]);
    }

    return groups;
  }

  /**
   * Clear all registered agents (for testing)
   */
  clear(): void {
    this.agents.clear();
    console.log('🧹 [AGENT-REGISTRY] Cleared all agents');
  }

  /**
   * Get total number of registered agents
   */
  getCount(): number {
    return this.agents.size;
  }

  /**
   * Check if an agent exists
   * 
   * @param agentId - Agent ID to check
   * @returns True if agent is registered
   */
  has(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  /**
   * Record agent execution metrics
   * 
   * @param agentId - Agent ID
   * @param success - Whether execution was successful
   * @param executionTimeMs - Execution time in milliseconds
   */
  recordExecution(agentId: string, success: boolean, executionTimeMs: number): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      console.warn(`⚠️ [AGENT-REGISTRY] Cannot record execution for unknown agent: ${agentId}`);
      return;
    }

    agent.metrics.totalExecutions++;
    if (success) {
      agent.metrics.successfulExecutions++;
    } else {
      agent.metrics.failedExecutions++;
    }
    agent.metrics.lastExecutedAt = new Date();

    // Update average execution time (exponential moving average)
    const alpha = 0.1;
    agent.metrics.avgExecutionTimeMs =
      alpha * executionTimeMs + (1 - alpha) * agent.metrics.avgExecutionTimeMs;
  }

  /**
   * Internal: Validate an agent definition
   */
  private validateAgentDefinition(agent: AgentDefinition): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate ID
    if (!agent.id || typeof agent.id !== 'string' || agent.id.trim() === '') {
      errors.push('Agent ID is required and must be a non-empty string');
    } else if (!/^[a-z0-9_]+$/.test(agent.id)) {
      errors.push('Agent ID must contain only lowercase letters, numbers, and underscores');
    }

    // Validate name
    if (!agent.name || typeof agent.name !== 'string' || agent.name.trim() === '') {
      errors.push('Agent name is required and must be a non-empty string');
    }

    // Validate description
    if (!agent.description || typeof agent.description !== 'string' || agent.description.trim() === '') {
      errors.push('Agent description is required and must be a non-empty string');
    }

    // Validate version
    if (!agent.version || typeof agent.version !== 'string') {
      errors.push('Agent version is required and must be a string');
    } else if (!/^\d+\.\d+\.\d+/.test(agent.version)) {
      warnings.push(`Agent version '${agent.version}' does not follow semantic versioning (X.Y.Z)`);
    }

    // Validate type
    const validTypes: AgentType[] = ['supervisor', 'specialist', 'coordinator', 'finalizer'];
    if (!validTypes.includes(agent.type)) {
      errors.push(`Invalid agent type '${agent.type}'. Must be one of: ${validTypes.join(', ')}`);
    }

    // Validate domain
    if (!Array.isArray(agent.domain) || agent.domain.length === 0) {
      errors.push('Agent domain must be a non-empty array');
    }

    // Validate capabilities
    if (!Array.isArray(agent.capabilities)) {
      errors.push('Agent capabilities must be an array');
    }

    // Validate intents
    if (!Array.isArray(agent.intents)) {
      errors.push('Agent intents must be an array');
    }

    // Validate produces
    if (!agent.produces || typeof agent.produces !== 'object') {
      errors.push('Agent produces must be an object');
    } else {
      if (!Array.isArray(agent.produces.stateFields)) {
        errors.push('produces.stateFields must be an array');
      }
      if (!Array.isArray(agent.produces.messageTypes)) {
        errors.push('produces.messageTypes must be an array');
      }
    }

    // Validate consumes
    if (!agent.consumes || typeof agent.consumes !== 'object') {
      errors.push('Agent consumes must be an object');
    } else {
      if (!Array.isArray(agent.consumes.required)) {
        errors.push('consumes.required must be an array');
      }
      if (!Array.isArray(agent.consumes.optional)) {
        errors.push('consumes.optional must be an array');
      }
    }

    // Validate tools
    if (!agent.tools || typeof agent.tools !== 'object') {
      errors.push('Agent tools must be an object');
    } else {
      if (!Array.isArray(agent.tools.required)) {
        errors.push('tools.required must be an array');
      }
      if (!Array.isArray(agent.tools.optional)) {
        errors.push('tools.optional must be an array');
      }
    }

    // Validate dependencies
    if (!agent.dependencies || typeof agent.dependencies !== 'object') {
      errors.push('Agent dependencies must be an object');
    } else {
      if (!Array.isArray(agent.dependencies.upstream)) {
        errors.push('dependencies.upstream must be an array');
      }
      if (!Array.isArray(agent.dependencies.downstream)) {
        errors.push('dependencies.downstream must be an array');
      }
    }

    // Validate execution config
    if (!agent.execution || typeof agent.execution !== 'object') {
      errors.push('Agent execution config is required');
    } else {
      if (typeof agent.execution.canRunInParallel !== 'boolean') {
        errors.push('execution.canRunInParallel must be a boolean');
      }
      if (typeof agent.execution.maxExecutionTimeMs !== 'number' || agent.execution.maxExecutionTimeMs < 0) {
        errors.push('execution.maxExecutionTimeMs must be a non-negative number');
      }
      if (!agent.execution.retryPolicy || typeof agent.execution.retryPolicy !== 'object') {
        errors.push('execution.retryPolicy is required');
      } else {
        if (typeof agent.execution.retryPolicy.maxRetries !== 'number' || agent.execution.retryPolicy.maxRetries < 0) {
          errors.push('retryPolicy.maxRetries must be a non-negative number');
        }
        if (typeof agent.execution.retryPolicy.backoffMs !== 'number' || agent.execution.retryPolicy.backoffMs < 0) {
          errors.push('retryPolicy.backoffMs must be a non-negative number');
        }
      }
    }

    // Validate LLM config (if present)
    if (agent.llm) {
      if (!agent.llm.model || typeof agent.llm.model !== 'string') {
        errors.push('llm.model is required and must be a string');
      }
      if (typeof agent.llm.temperature !== 'number' || agent.llm.temperature < 0 || agent.llm.temperature > 2) {
        errors.push('llm.temperature must be a number between 0 and 2');
      }
      if (typeof agent.llm.maxTokens !== 'number' || agent.llm.maxTokens < 1) {
        errors.push('llm.maxTokens must be a positive number');
      }
    }

    // Validate implementation
    if (!agent.implementation || typeof agent.implementation !== 'string') {
      errors.push('Agent implementation path is required');
    }
    if (typeof agent.nodeFunction !== 'function') {
      errors.push('Agent nodeFunction must be a function');
    }

    // Validate metrics
    if (!agent.metrics || typeof agent.metrics !== 'object') {
      errors.push('Agent metrics object is required');
    } else {
      if (typeof agent.metrics.totalExecutions !== 'number' || agent.metrics.totalExecutions < 0) {
        errors.push('metrics.totalExecutions must be a non-negative number');
      }
      if (typeof agent.metrics.successfulExecutions !== 'number' || agent.metrics.successfulExecutions < 0) {
        errors.push('metrics.successfulExecutions must be a non-negative number');
      }
      if (typeof agent.metrics.failedExecutions !== 'number' || agent.metrics.failedExecutions < 0) {
        errors.push('metrics.failedExecutions must be a non-negative number');
      }
      if (agent.metrics.successfulExecutions + agent.metrics.failedExecutions > agent.metrics.totalExecutions) {
        errors.push('successfulExecutions + failedExecutions cannot exceed totalExecutions');
      }
    }

    // Validate timestamps
    if (!(agent.createdAt instanceof Date)) {
      errors.push('createdAt must be a Date object');
    }
    if (!(agent.updatedAt instanceof Date)) {
      errors.push('updatedAt must be a Date object');
    }

    // Validate deprecated/replacedBy
    if (agent.deprecated && !agent.replacedBy) {
      warnings.push('Deprecated agent should specify replacedBy agent ID');
    }
    if (agent.replacedBy && !agent.deprecated) {
      warnings.push('Agent specifies replacedBy but is not marked as deprecated');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

// Export singleton instance getter as default
export default AgentRegistry.getInstance();
