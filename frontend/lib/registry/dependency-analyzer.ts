/**
 * Dependency Analyzer
 * 
 * Utilities for analyzing agent dependency graphs, detecting cycles,
 * and determining execution order.
 */

import { AgentRegistry } from '@/lib/registry/agent-registry';
import type { AgentDependencyGraph } from '@/lib/types/agent-registry';

/**
 * Build a complete dependency graph for all registered agents
 * 
 * @returns Dependency graph with nodes, edges, and cycles
 */
export function buildDependencyGraph(): AgentDependencyGraph {
  const registry = AgentRegistry.getInstance();
  return registry.getDependencyGraph();
}

/**
 * Detect circular dependencies in the agent graph
 * 
 * @returns Array of cycles (each cycle is an array of agent IDs)
 */
export function detectCycles(): string[][] {
  const graph = buildDependencyGraph();
  return graph.cycles;
}

/**
 * Get topological sort (execution order) for a set of agents
 * 
 * @param agentIds - Array of agent IDs to order
 * @returns Array of agent IDs in valid execution order
 * @throws Error if circular dependencies detected
 */
export function topologicalSort(agentIds: string[]): string[] {
  const registry = AgentRegistry.getInstance();
  return registry.getExecutionOrder(agentIds);
}

/**
 * Get agents that can run in parallel
 * 
 * @param agentIds - Array of agent IDs to check
 * @returns Array of agent ID groups that can run in parallel
 */
export function getParallelGroups(agentIds: string[]): string[][] {
  const registry = AgentRegistry.getInstance();
  return registry.getParallelGroups(agentIds);
}

/**
 * Check if two agents can run in parallel
 * 
 * @param agentId1 - First agent ID
 * @param agentId2 - Second agent ID
 * @returns True if agents can run in parallel
 */
export function canRunInParallel(agentId1: string, agentId2: string): boolean {
  const registry = AgentRegistry.getInstance();
  const agent1 = registry.getById(agentId1);
  const agent2 = registry.getById(agentId2);

  if (!agent1 || !agent2) {
    return false;
  }

  // Both must allow parallel execution
  if (!agent1.execution.canRunInParallel || !agent2.execution.canRunInParallel) {
    return false;
  }

  // Check if they depend on each other
  const graph = buildDependencyGraph();
  const hasDependency = graph.edges.some(
    ([from, to]) =>
      (from === agentId1 && to === agentId2) || (from === agentId2 && to === agentId1)
  );

  return !hasDependency;
}

/**
 * Get all upstream dependencies for an agent
 * 
 * @param agentId - Agent ID
 * @returns Array of upstream agent IDs (transitive closure)
 */
export function getUpstreamDependencies(agentId: string): string[] {
  const registry = AgentRegistry.getInstance();
  const agent = registry.getById(agentId);

  if (!agent) {
    return [];
  }

  const upstream = new Set<string>();
  const visited = new Set<string>();

  const dfs = (currentId: string) => {
    if (visited.has(currentId)) {
      return;
    }
    visited.add(currentId);

    const currentAgent = registry.getById(currentId);
    if (currentAgent) {
      for (const depId of currentAgent.dependencies.upstream) {
        upstream.add(depId);
        dfs(depId);
      }
    }
  };

  dfs(agentId);
  return Array.from(upstream);
}

/**
 * Get all downstream dependencies for an agent
 * 
 * @param agentId - Agent ID
 * @returns Array of downstream agent IDs (transitive closure)
 */
export function getDownstreamDependencies(agentId: string): string[] {
  const registry = AgentRegistry.getInstance();
  const agent = registry.getById(agentId);

  if (!agent) {
    return [];
  }

  const downstream = new Set<string>();
  const visited = new Set<string>();

  const dfs = (currentId: string) => {
    if (visited.has(currentId)) {
      return;
    }
    visited.add(currentId);

    const currentAgent = registry.getById(currentId);
    if (currentAgent) {
      for (const depId of currentAgent.dependencies.downstream) {
        downstream.add(depId);
        dfs(depId);
      }
    }
  };

  dfs(agentId);
  return Array.from(downstream);
}

/**
 * Validate that all dependencies exist
 * 
 * @returns Object with validation results
 */
export function validateDependencies(): {
  valid: boolean;
  missing: Array<{ agentId: string; missingDeps: string[] }>;
} {
  const registry = AgentRegistry.getInstance();
  const agents = registry.getAll();
  const missing: Array<{ agentId: string; missingDeps: string[] }> = [];

  for (const agent of agents) {
    const missingDeps: string[] = [];

    for (const depId of agent.dependencies.upstream) {
      if (!registry.has(depId)) {
        missingDeps.push(depId);
      }
    }

    for (const depId of agent.dependencies.downstream) {
      if (!registry.has(depId)) {
        missingDeps.push(depId);
      }
    }

    if (missingDeps.length > 0) {
      missing.push({ agentId: agent.id, missingDeps });
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}
