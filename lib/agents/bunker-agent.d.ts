import { AgentRegistration } from '../registry/agent-registry';
/**
 * Configuration for the bunker agent
 */
interface BunkerAgentConfig {
    /** Anthropic API key */
    apiKey: string;
    /** Claude model to use */
    model?: string;
    /** Maximum number of tool use iterations */
    maxIterations?: number;
    /** Enable detailed logging */
    enableLogging?: boolean;
    /** Automatically generate and show map visualization */
    showMap?: boolean;
}
/**
 * Bunker Optimization Agent
 *
 * A multi-tool agent that can:
 * 1. Calculate maritime routes between ports
 * 2. Find bunker ports along routes
 * 3. Provide optimization recommendations
 * 4. Visualize routes and ports on maps
 */
export declare function runBunkerAgent(userMessage: string, config: BunkerAgentConfig): Promise<void>;
/**
 * Convenience function to run the bunker agent with environment variable configuration
 *
 * @param userMessage - The user's question or request
 * @param options - Optional overrides for default configuration
 */
export declare function askBunkerAgent(userMessage: string, options?: Partial<BunkerAgentConfig>): Promise<void>;
/**
 * Agent registration metadata
 * Auto-registers this agent with the AgentRegistry on import
 */
export declare const agentRegistration: AgentRegistration;
export {};
//# sourceMappingURL=bunker-agent.d.ts.map