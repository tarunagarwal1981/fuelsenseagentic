/**
 * Agent Registry Index
 * 
 * Central registration point for all agents in the FuelSense 360 system.
 * Call registerAllAgents() at application startup to initialize the registry.
 */

import { AgentRegistry } from '@/lib/registry/agent-registry';

// Import all agent definitions
import { supervisorAgent } from './supervisor-agent';
import { routeAgent } from './route-agent';
import { complianceAgent } from './compliance-agent';
import { weatherAgent } from './weather-agent';
import { bunkerAgent } from './bunker-agent';
import { finalizeAgent } from './finalize-agent';

/**
 * Register all agents with the Agent Registry
 * 
 * This function should be called at application startup to initialize
 * the agent registry with all available agents.
 * 
 * @throws Error if agent registration fails (e.g., duplicate IDs, validation errors)
 */
export function registerAllAgents(): void {
  const registry = AgentRegistry.getInstance();
  
  // Clear registry first (useful for testing/reloading)
  registry.clear();
  
  const agents = [
    // Orchestration
    supervisorAgent,
    
    // Specialists (in execution order)
    routeAgent,
    complianceAgent,
    weatherAgent,
    bunkerAgent,
    
    // Finalizer
    finalizeAgent,
  ];
  
  let registeredCount = 0;
  let errorCount = 0;
  
  for (const agent of agents) {
    try {
      registry.register(agent);
      registeredCount++;
    } catch (error: any) {
      console.error(`❌ [AGENT-REGISTRY] Failed to register agent ${agent.id}:`, error.message);
      errorCount++;
    }
  }
  
  if (errorCount > 0) {
    throw new Error(
      `Failed to register ${errorCount} of ${agents.length} agents. ` +
      `Successfully registered ${registeredCount} agents.`
    );
  }
  
  console.log(`✅ [AGENT-REGISTRY] Successfully registered ${registeredCount} agents`);
  console.log(`   Supervisor: 1 agent`);
  console.log(`   Specialists: 4 agents (route, compliance, weather, bunker)`);
  console.log(`   Finalizer: 1 agent`);
}

/**
 * Get all registered agent IDs
 * 
 * @returns Array of agent IDs
 */
export function getAllAgentIds(): string[] {
  const registry = AgentRegistry.getInstance();
  return registry.getAll().map((agent) => agent.id);
}

/**
 * Verify all expected agents are registered
 * 
 * @returns Object with verification results
 */
export function verifyAgentRegistration(): {
  allRegistered: boolean;
  missing: string[];
  extra: string[];
} {
  const registry = AgentRegistry.getInstance();
  const registeredIds = new Set(registry.getAll().map((agent) => agent.id));
  
  const expectedAgents = [
    'supervisor',
    'route_agent',
    'compliance_agent',
    'weather_agent',
    'bunker_agent',
    'finalize',
  ];
  
  const expectedSet = new Set(expectedAgents);
  const missing = expectedAgents.filter((id) => !registeredIds.has(id));
  const extra = Array.from(registeredIds).filter((id) => !expectedSet.has(id));
  
  return {
    allRegistered: missing.length === 0,
    missing,
    extra,
  };
}

/**
 * Get execution order for all agents
 * 
 * @returns Array of agent IDs in valid execution order
 */
export function getAgentExecutionOrder(): string[] {
  const registry = AgentRegistry.getInstance();
  const allIds = registry.getAll().map((a) => a.id);
  
  try {
    return registry.getExecutionOrder(allIds);
  } catch (error) {
    console.error('❌ [AGENT-REGISTRY] Failed to get execution order:', error);
    // Return default order
    return ['supervisor', 'route_agent', 'compliance_agent', 'weather_agent', 'bunker_agent', 'finalize'];
  }
}

// Export individual agents for direct access if needed
export {
  supervisorAgent,
  routeAgent,
  complianceAgent,
  weatherAgent,
  bunkerAgent,
  finalizeAgent,
};
