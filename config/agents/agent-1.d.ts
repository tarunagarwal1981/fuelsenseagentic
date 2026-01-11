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
export declare const agent1Config: Agent1Config;
//# sourceMappingURL=agent-1.d.ts.map