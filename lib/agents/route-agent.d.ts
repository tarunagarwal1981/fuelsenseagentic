/**
 * Route Agent
 *
 * An AI agent that uses Claude to answer questions about maritime routes
 * and can execute the route calculator tool when needed.
 *
 * This agent implements the agentic loop pattern:
 * 1. Send user message to Claude with available tools
 * 2. Claude may request tool use
 * 3. Execute the requested tool
 * 4. Return tool results to Claude
 * 5. Continue until Claude provides a final text response
 */
/**
 * Configuration for the agent
 */
interface AgentConfig {
    /** Anthropic API key */
    apiKey: string;
    /** Claude model to use (default: claude-3-5-sonnet-20241022) */
    model?: string;
    /** Maximum number of tool use iterations (default: 10) */
    maxIterations?: number;
    /** Enable detailed logging (default: true) */
    enableLogging?: boolean;
    /** Automatically generate and show map visualization (default: true) */
    showMap?: boolean;
}
/**
 * Agent response structure
 */
export interface AgentResponse {
    /** Final text response from Claude */
    message: string;
    /** Number of tool calls made during the conversation */
    toolCalls: number;
    /** Total tokens used (if available) */
    tokensUsed?: {
        input: number;
        output: number;
    };
}
/**
 * Main agent function that handles the agentic loop
 *
 * This function:
 * 1. Initializes Claude with the route calculator tool
 * 2. Sends user message
 * 3. Handles tool_use responses by executing the tool
 * 4. Returns tool results back to Claude
 * 5. Continues until Claude provides a final text response
 *
 * @param userMessage - The user's question or request
 * @param config - Agent configuration
 * @returns Final response from Claude with metadata
 */
export declare function runRouteAgent(userMessage: string, config: AgentConfig): Promise<AgentResponse>;
/**
 * Convenience function to run the agent with environment variable configuration
 *
 * @param userMessage - The user's question or request
 * @param options - Optional overrides for default configuration
 * @returns Final response from Claude
 */
export declare function askRouteAgent(userMessage: string, options?: Partial<AgentConfig>): Promise<AgentResponse>;
export {};
//# sourceMappingURL=route-agent.d.ts.map