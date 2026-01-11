/**
 * Agent-Specific Prompts Configuration
 * 
 * Prompts tailored for specific agent roles and capabilities.
 */

export interface AgentPromptConfig {
  agentName: string;
  systemPrompt: string;
  userPromptTemplate?: string;
  examples?: string[];
}

export const agentPrompts: Record<string, AgentPromptConfig> = {
  routeAgent: {
    agentName: 'route-agent',
    systemPrompt: 'You are a maritime route calculation expert.',
    userPromptTemplate: 'Calculate route from {origin} to {destination}',
    examples: [],
  },
  bunkerAgent: {
    agentName: 'bunker-agent',
    systemPrompt: 'You are a bunker fuel optimization expert.',
    userPromptTemplate: 'Find best bunker options for route: {route}',
    examples: [],
  },
};

