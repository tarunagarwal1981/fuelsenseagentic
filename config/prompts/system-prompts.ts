/**
 * System Prompts Configuration
 * 
 * Centralized system prompts for agents.
 */

export interface SystemPromptConfig {
  name: string;
  content: string;
  variables?: string[];
}

export const systemPrompts: Record<string, SystemPromptConfig> = {
  default: {
    name: 'default',
    content: 'You are a helpful maritime bunker optimization assistant.',
    variables: [],
  },
  routeAgent: {
    name: 'route-agent',
    content: 'You are a maritime route calculation expert. Calculate optimal routes between ports.',
    variables: [],
  },
  bunkerAgent: {
    name: 'bunker-agent',
    content: 'You are a bunker fuel optimization expert. Find the best bunker options for vessels.',
    variables: [],
  },
};

