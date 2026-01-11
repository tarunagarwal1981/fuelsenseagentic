/**
 * Agent Execution Engine
 *
 * Base engine for executing agents with configuration-driven behavior.
 * This engine loads agent configurations and executes them with the
 * appropriate tools and prompts.
 */
export interface AgentEngineConfig {
    agentName: string;
    configPath: string;
    tools: string[];
    model?: string;
    temperature?: number;
}
export declare class AgentEngine {
    private config;
    constructor(config: AgentEngineConfig);
    /**
     * Execute an agent with the given input
     */
    execute(input: string): Promise<any>;
    /**
     * Load agent configuration
     */
    loadConfig(): Promise<any>;
}
//# sourceMappingURL=agent-engine.d.ts.map