/**
 * Supervisor Prompt Generator
 * 
 * Dynamically generates supervisor system prompts from the Agent Registry.
 * Instead of maintaining 500+ lines of hardcoded routing rules, this class
 * generates routing instructions on-the-fly from agent capability metadata.
 * 
 * This approach provides:
 * - Self-documenting routing logic (prompt reflects actual agent capabilities)
 * - Zero maintenance overhead when adding new agents
 * - Consistent routing behavior across all queries
 * - Easy debugging (prompt shows exactly what supervisor knows)
 * 
 * @example
 * ```typescript
 * const prompt = SupervisorPromptGenerator.generateSupervisorPrompt();
 * // Use prompt in supervisor agent LLM call
 * ```
 */

import { AgentRegistry } from '@/lib/registry/agent-registry';
import { CAPABILITY_DESCRIPTIONS } from '@/lib/registry/agents';
import type { AgentDefinition } from '@/lib/types/agent-registry';

/**
 * Supervisor Prompt Generator
 * 
 * Static utility class for generating supervisor system prompts
 * dynamically from the Agent Registry.
 */
export class SupervisorPromptGenerator {
  /**
   * Generate complete supervisor system prompt dynamically from agent registry
   * 
   * Builds a comprehensive prompt that includes:
   * - Available agents with their capabilities
   * - Capability-to-agent mapping table
   * - Agent dependency graph
   * - Routing examples for common query patterns
   * - Routing rules and best practices
   * 
   * This method should be called each time a supervisor prompt is needed,
   * as the registry may change (new agents added, agents enabled/disabled).
   * 
   * @returns Complete supervisor system prompt as string
   * 
   * @example
   * ```typescript
   * const prompt = SupervisorPromptGenerator.generateSupervisorPrompt();
   * const response = await llm.invoke(prompt + userQuery);
   * ```
   */
  static generateSupervisorPrompt(): string {
    const registry = AgentRegistry.getInstance();
    const allAgents = registry.getAll().filter(a => a.enabled);
    
    const prompt = `You are the Supervisor Agent for FuelSense 360, a maritime bunker planning system.

Your job is to analyze user queries, determine which specialized agents to delegate to,
and orchestrate the multi-agent workflow to provide comprehensive bunker planning recommendations.

## AVAILABLE AGENTS

${this.generateAgentCapabilitySection(allAgents)}

## ROUTING STRATEGY

1. **Analyze User Intent**: Understand what the user is asking for
2. **Identify Required Capabilities**: Map intent to capabilities needed
3. **Select Appropriate Agents**: Choose agents that have those capabilities
4. **Determine Execution Order**: Some agents depend on others' outputs
5. **Route to Next Agent**: Set next_agent to the selected agent ID

## CAPABILITY-TO-AGENT MAPPING

${this.generateCapabilityMapping()}

## AGENT DEPENDENCIES

${this.generateDependencyGraph(allAgents)}

## ROUTING EXAMPLES

${this.generateRoutingExamples()}

## IMPORTANT RULES

- Always check state before routing (don't re-run completed agents)
- Respect dependencies (e.g., bunker_agent needs route_data from route_agent)
- For multi-capability queries, route to agents sequentially
- When all required data is gathered, route to 'finalize'
- If query is unclear, route to entity extraction for clarification
- Skip agents whose required data is already in state
- For vessel comparison queries, ensure vessel_info_agent runs before vessel_selection_agent
- For ROB projection queries, ensure vessel_info_agent and route_agent run before rob_tracking_agent
- When intent requires a vessel-specific agent (bunker, hull, noon report, etc.) and state has vessel name but not IMO (or vice versa), route to entity_extractor or vessel_info_agent first to resolve vessel identifier via vessel_details API, then run the specialist so no agent fails for missing IMO/name

## YOUR RESPONSE

Set the next_agent field to the appropriate agent ID based on:
1. Current state (what data already exists)
2. User intent (what they're asking for)
3. Agent capabilities (which agent can fulfill the need)
4. Agent dependencies (what data is prerequisite)

Valid agent IDs: ${allAgents.map(a => a.id).join(', ')}
`;

    return prompt;
  }

  /**
   * Generate agent capability section
   * 
   * For each enabled agent in the registry, generates a detailed
   * section documenting:
   * - Agent name and ID
   * - Capabilities it provides
   * - Description of what it does
   * - When to use this agent
   * - Example queries it handles
   * - What data it produces
   * - What data it requires
   * 
   * @param agents Array of agent definitions to document
   * @returns Formatted markdown string with agent documentation
   * 
   * @private
   */
  private static generateAgentCapabilitySection(agents: AgentDefinition[]): string {
    return agents
      .filter(agent => agent.type !== 'supervisor') // Don't include supervisor itself
      .map(agent => {
        const capabilities = agent.capabilities?.join(', ') || 'none';
        const intents = agent.intents?.join(', ') || 'none';
        
        // Generate example queries from agent definition or use intents
        let examplesText = 'No examples available';
        if (agent.intents && agent.intents.length > 0) {
          examplesText = agent.intents
            .slice(0, 3) // Limit to 3 examples
            .map(intent => `"${this.intentToExampleQuery(intent)}"`)
            .join('\n  - ');
        }
        
        return `
### ${agent.name} (${agent.id})

**Capabilities**: ${capabilities}

**Intents**: ${intents}

**Description**: ${agent.description}

**Use When**: ${this.generateUseCases(agent)}

**Example Queries**:
  - ${examplesText}

**Produces**: ${agent.produces?.stateFields?.join(', ') || 'none'}

**Requires**: ${agent.consumes?.required?.join(', ') || 'none'}
`;
      })
      .join('\n---\n');
  }

  /**
   * Generate capability-to-agent mapping table
   * 
   * Creates a markdown table showing which agents provide
   * which capabilities. This helps the supervisor understand
   * which agent to route to for a given capability need.
   * 
   * @returns Markdown table mapping capabilities to agent IDs
   * 
   * @example
   * Output format:
   * ```
   * | Capability | Agents |
   * |------------|--------|
   * | vessel_lookup | vessel_info_agent |
   * | route_calculation | route_agent |
   * ```
   * 
   * @private
   */
  private static generateCapabilityMapping(): string {
    const capabilityMap = new Map<string, string[]>();
    
    const allAgents = AgentRegistry.getInstance().getAll();
    
    allAgents.forEach(agent => {
      if (!agent.enabled || agent.type === 'supervisor') return;
      
      agent.capabilities?.forEach(capability => {
        if (!capabilityMap.has(capability)) {
          capabilityMap.set(capability, []);
        }
        capabilityMap.get(capability)!.push(agent.id);
      });
    });
    
    let mapping = '| Capability | Agents | Description |\n|------------|--------|-------------|\n';
    
    // Sort capabilities alphabetically
    const sortedCapabilities = Array.from(capabilityMap.keys()).sort();
    
    sortedCapabilities.forEach(capability => {
      const agents = capabilityMap.get(capability) || [];
      const description = CAPABILITY_DESCRIPTIONS[capability] || 'No description';
      mapping += `| ${capability} | ${agents.join(', ')} | ${description} |\n`;
    });
    
    return mapping;
  }

  /**
   * Generate dependency graph showing agent execution order
   * 
   * Visualizes the dependencies between agents, showing:
   * - Which agents must run before this agent (upstream)
   * - Which agents depend on this agent's output (downstream)
   * 
   * This helps the supervisor understand valid execution orders
   * and avoid routing to agents whose prerequisites aren't met.
   * 
   * @param agents Array of agent definitions
   * @returns Formatted dependency graph as text
   * 
   * @example
   * Output format:
   * ```
   * route_agent:
   *   Depends on: supervisor
   *   Provides to: weather_agent, bunker_agent
   * ```
   * 
   * @private
   */
  private static generateDependencyGraph(agents: AgentDefinition[]): string {
    let graph = '';
    
    agents
      .filter(agent => agent.type !== 'supervisor')
      .forEach(agent => {
        const upstream = agent.dependencies?.upstream || [];
        const downstream = agent.dependencies?.downstream || [];
        
        if (upstream.length > 0 || downstream.length > 0) {
          graph += `\n**${agent.id}**:`;
          
          if (upstream.length > 0) {
            graph += `\n  - Depends on: ${upstream.join(', ')}`;
          }
          
          if (downstream.length > 0) {
            graph += `\n  - Provides to: ${downstream.join(', ')}`;
          }
          
          graph += '\n';
        }
      });
    
    return graph;
  }

  /**
   * Generate routing examples from common query patterns
   * 
   * Provides concrete examples of how to route different types
   * of queries through the agent workflow. These examples help
   * the supervisor learn routing patterns.
   * 
   * @returns Formatted routing examples as markdown
   * 
   * @private
   */
  private static generateRoutingExamples(): string {
    const examples = [
      {
        query: 'Compare MV Pacific Star and MV Atlantic Trader for Singapore to Rotterdam',
        intent: 'vessel_selection',
        capabilities_needed: ['vessel_lookup', 'vessel_comparison', 'route_calculation', 'bunker_analysis'],
        routing: 'vessel_info_agent → route_agent → bunker_agent → vessel_selection_agent → finalize',
        notes: 'Multi-vessel comparison requires vessel data, route, bunker costs, then comparison'
      },
      {
        query: 'What is the bunker cost at Colombo?',
        intent: 'bunker_planning',
        capabilities_needed: ['price_fetching', 'port_finding'],
        routing: 'bunker_agent → finalize',
        notes: 'Simple price query goes directly to bunker agent'
      },
      {
        query: 'Show me ROB for MV Pacific Star',
        intent: 'vessel_information',
        capabilities_needed: ['vessel_lookup', 'noon_report_fetch'],
        routing: 'vessel_info_agent → finalize',
        notes: 'Vessel data query goes to vessel info agent'
      },
      {
        query: 'Will MV Pacific Star have enough fuel for Singapore to Rotterdam?',
        intent: 'rob_projection',
        capabilities_needed: ['vessel_lookup', 'route_calculation', 'rob_calculation'],
        routing: 'vessel_info_agent → route_agent → rob_tracking_agent → finalize',
        notes: 'ROB projection needs vessel data and route first'
      },
      {
        query: 'Plan bunker from Singapore to Rotterdam for MV Pacific Star',
        intent: 'bunker_planning',
        capabilities_needed: ['vessel_lookup', 'route_calculation', 'weather_forecast', 'bunker_analysis'],
        routing: 'vessel_info_agent → route_agent → weather_agent → bunker_agent → finalize',
        notes: 'Complete bunker planning workflow'
      },
      {
        query: 'What is the weather forecast along the route?',
        intent: 'weather_analysis',
        capabilities_needed: ['route_calculation', 'weather_forecast'],
        routing: 'route_agent → weather_agent → finalize',
        notes: 'Weather queries need route data first'
      },
    ];
    
    return examples.map(ex => `
**Example**: "${ex.query}"
- **Intent**: ${ex.intent}
- **Capabilities Needed**: ${ex.capabilities_needed.join(', ')}
- **Routing Path**: ${ex.routing}
- **Notes**: ${ex.notes}
`).join('\n');
  }

  /**
   * Generate use cases for an agent based on its capabilities
   * 
   * Translates an agent's capabilities into human-readable
   * use case descriptions. This helps the supervisor understand
   * when to use each agent.
   * 
   * @param agent Agent definition
   * @returns Semicolon-separated string of use cases
   * 
   * @example
   * Input: Agent with capabilities ['vessel_lookup', 'noon_report_fetch']
   * Output: "Find vessel by name or IMO; Get latest noon report with ROB"
   * 
   * @private
   */
  private static generateUseCases(agent: AgentDefinition): string {
    const useCases: string[] = [];
    
    agent.capabilities?.forEach(capability => {
      const description = CAPABILITY_DESCRIPTIONS[capability];
      if (description) {
        useCases.push(description);
      }
    });
    
    return useCases.join('; ') || 'General purpose agent';
  }

  /**
   * Convert an intent to an example query
   * 
   * Helper method to generate plausible example queries
   * from intent names when explicit examples aren't provided.
   * 
   * @param intent Intent name (e.g., 'vessel_info', 'bunker_planning')
   * @returns Example query string
   * 
   * @example
   * intentToExampleQuery('vessel_info') // "Show vessel information"
   * intentToExampleQuery('bunker_planning') // "Plan bunker route"
   * 
   * @private
   */
  private static intentToExampleQuery(intent: string): string {
    // Map common intents to example queries
    const intentExamples: Record<string, string> = {
      vessel_info: 'Show vessel information',
      vessel_status: 'What is the vessel status?',
      show_vessel: 'Show me vessel details',
      get_rob: 'What is the current ROB?',
      vessel_details: 'Get vessel details',
      list_vessels: 'List all vessels',
      compare_vessels: 'Compare vessels for this voyage',
      which_vessel: 'Which vessel should I use?',
      best_ship: 'What is the best ship for this route?',
      vessel_selection: 'Select best vessel',
      plan_route: 'Plan route from A to B',
      calculate_distance: 'Calculate distance between ports',
      find_waypoints: 'Find route waypoints',
      check_weather: 'Check weather conditions',
      weather_forecast: 'Get weather forecast',
      plan_bunker: 'Plan bunker stops',
      find_fuel: 'Find bunker ports',
      cheapest_bunker: 'Find cheapest bunker port',
      check_compliance: 'Check regulatory compliance',
      validate_eca: 'Validate ECA zone requirements',
      rob_projection: 'Project ROB along route',
      fuel_check: 'Check fuel sufficiency',
    };
    
    return intentExamples[intent] || `Query about ${intent.replace(/_/g, ' ')}`;
  }

  /**
   * Get a list of all available agent IDs
   * 
   * Convenience method to get enabled agent IDs for validation
   * or dropdown menus.
   * 
   * @returns Array of enabled agent IDs
   * 
   * @example
   * ```typescript
   * const agentIds = SupervisorPromptGenerator.getAvailableAgentIds();
   * // ['vessel_info_agent', 'route_agent', 'bunker_agent', ...]
   * ```
   */
  static getAvailableAgentIds(): string[] {
    const registry = AgentRegistry.getInstance();
    return registry.getAll()
      .filter(a => a.enabled && a.type !== 'supervisor')
      .map(a => a.id);
  }

  /**
   * Generate a simplified prompt for testing or debugging
   * 
   * Creates a minimal version of the supervisor prompt with
   * just the essential information. Useful for:
   * - Testing with lower token counts
   * - Debugging routing issues
   * - Quick prototyping
   * 
   * @returns Simplified supervisor prompt
   * 
   * @example
   * ```typescript
   * const prompt = SupervisorPromptGenerator.generateSimplifiedPrompt();
   * // Much shorter than full prompt, but still functional
   * ```
   */
  static generateSimplifiedPrompt(): string {
    const registry = AgentRegistry.getInstance();
    const allAgents = registry.getAll().filter(a => a.enabled && a.type !== 'supervisor');
    
    const agentList = allAgents
      .map(a => `- ${a.id}: ${a.capabilities?.join(', ') || 'none'}`)
      .join('\n');
    
    return `You are the Supervisor Agent for FuelSense 360.

Route queries to appropriate agents based on their capabilities.

Available Agents:
${agentList}

Rules:
- Check state before routing (don't re-run completed agents)
- Respect dependencies (route_agent before bunker_agent, etc.)
- Route to 'finalize' when all data is gathered
- For hull performance, hull condition, fouling, or performance report queries, use hull_performance_agent (entity extraction runs first if needed).

Set next_agent to the appropriate agent ID.`;
  }

  /**
   * Generate routing statistics and insights
   * 
   * Analyzes the agent registry to provide insights about:
   * - Total number of agents
   * - Total number of capabilities
   * - Average capabilities per agent
   * - Agents with most dependencies
   * 
   * Useful for monitoring registry health and complexity.
   * 
   * @returns Statistics object
   * 
   * @example
   * ```typescript
   * const stats = SupervisorPromptGenerator.generateRoutingStats();
   * console.log(`Total agents: ${stats.totalAgents}`);
   * ```
   */
  static generateRoutingStats(): {
    totalAgents: number;
    totalCapabilities: number;
    avgCapabilitiesPerAgent: number;
    mostCapableAgent: string;
    mostDependencies: string;
  } {
    const registry = AgentRegistry.getInstance();
    const allAgents = registry.getAll().filter(a => a.enabled && a.type !== 'supervisor');
    
    const totalAgents = allAgents.length;
    
    // Count unique capabilities
    const allCapabilities = new Set<string>();
    allAgents.forEach(a => {
      a.capabilities?.forEach(cap => allCapabilities.add(cap));
    });
    const totalCapabilities = allCapabilities.size;
    
    // Calculate average
    const totalCaps = allAgents.reduce((sum, a) => sum + (a.capabilities?.length || 0), 0);
    const avgCapabilitiesPerAgent = totalCaps / totalAgents;
    
    // Find most capable agent
    let mostCapableAgent = 'none';
    let maxCaps = 0;
    allAgents.forEach(a => {
      const capCount = a.capabilities?.length || 0;
      if (capCount > maxCaps) {
        maxCaps = capCount;
        mostCapableAgent = a.id;
      }
    });
    
    // Find agent with most dependencies
    let mostDependencies = 'none';
    let maxDeps = 0;
    allAgents.forEach(a => {
      const depCount = (a.dependencies?.upstream?.length || 0) + (a.dependencies?.downstream?.length || 0);
      if (depCount > maxDeps) {
        maxDeps = depCount;
        mostDependencies = a.id;
      }
    });
    
    return {
      totalAgents,
      totalCapabilities,
      avgCapabilitiesPerAgent,
      mostCapableAgent,
      mostDependencies,
    };
  }
}
