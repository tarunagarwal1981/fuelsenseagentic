/**
 * Agent Configuration Loader
 * 
 * Loads and validates agent configurations from YAML config files.
 */

import { z } from 'zod';
import { getYAMLLoader } from './yaml-loader';

/**
 * Agent configuration schema
 */
export const agentConfigSchema = z.object({
  name: z.string().min(1, 'Agent name is required'),
  description: z.string().min(1, 'Agent description is required'),
  tools: z.array(z.string()).default([]).optional(),
  capabilities: z.array(z.string()).default([]).optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxIterations: z.number().int().positive().optional(),
});

export type AgentConfig = z.infer<typeof agentConfigSchema> & {
  tools: string[];
  capabilities: string[];
};

/**
 * Load agent configuration from YAML file
 * 
 * @param configPath - Path to agent config file (relative to project root or absolute)
 * @returns Validated agent configuration
 * 
 * @example
 * ```typescript
 * const config = await loadAgentConfig('config/agents/route-agent.yaml');
 * ```
 */
export async function loadAgentConfig(configPath: string): Promise<AgentConfig> {
  const loader = getYAMLLoader();
  const config = await loader.load(configPath, agentConfigSchema);
  return {
    ...config,
    tools: config.tools || [],
    capabilities: config.capabilities || [],
  };
}

/**
 * Load all agent configurations from a directory
 * 
 * @param directory - Directory containing agent config files (default: 'config/agents')
 * @returns Map of agent name to configuration
 * 
 * @example
 * ```typescript
 * const agents = await loadAllAgentConfigs('config/agents');
 * const routeAgent = agents.get('route-agent');
 * ```
 */
export async function loadAllAgentConfigs(
  directory: string = 'config/agents'
): Promise<Map<string, AgentConfig>> {
  const loader = getYAMLLoader();
  const configs = await loader.loadAll(directory, agentConfigSchema);
  const result = new Map<string, AgentConfig>();
  for (const [key, config] of configs.entries()) {
    result.set(key, {
      ...config,
      tools: config.tools || [],
      capabilities: config.capabilities || [],
    });
  }
  return result;
}

/**
 * Validate agent configuration (for manual validation)
 */
export function validateAgentConfig(config: unknown): config is AgentConfig {
  try {
    agentConfigSchema.parse(config);
    return true;
  } catch {
    return false;
  }
}

