/**
 * Agent Configuration Loader
 *
 * Loads and validates agent configurations from YAML config files.
 */
import { z } from 'zod';
/**
 * Agent configuration schema
 */
export declare const agentConfigSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    tools: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    capabilities: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    model: z.ZodOptional<z.ZodString>;
    temperature: z.ZodOptional<z.ZodNumber>;
    maxIterations: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description: string;
    tools: string[];
    capabilities: string[];
    model?: string | undefined;
    maxIterations?: number | undefined;
    temperature?: number | undefined;
}, {
    name: string;
    description: string;
    model?: string | undefined;
    maxIterations?: number | undefined;
    temperature?: number | undefined;
    tools?: string[] | undefined;
    capabilities?: string[] | undefined;
}>;
export type AgentConfig = z.infer<typeof agentConfigSchema>;
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
export declare function loadAgentConfig(configPath: string): Promise<AgentConfig>;
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
export declare function loadAllAgentConfigs(directory?: string): Promise<Map<string, AgentConfig>>;
/**
 * Validate agent configuration (for manual validation)
 */
export declare function validateAgentConfig(config: unknown): config is AgentConfig;
//# sourceMappingURL=agent-loader.d.ts.map