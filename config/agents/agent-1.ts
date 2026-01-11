/**
 * Agent 1 Configuration
 * 
 * Placeholder for first agent in the 8-agent platform.
 * This will be configured with specific capabilities, tools, and behavior.
 */

export interface Agent1Config {
  name: string;
  description: string;
  tools: string[];
  capabilities: string[];
  model?: string;
  temperature?: number;
  maxIterations?: number;
}

export const agent1Config: Agent1Config = {
  name: 'agent-1',
  description: 'Placeholder agent - to be configured',
  tools: [],
  capabilities: [],
  model: 'claude-haiku-4-5-20251001',
  temperature: 0.7,
  maxIterations: 10,
};

