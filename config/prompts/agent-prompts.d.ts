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
export declare const agentPrompts: Record<string, AgentPromptConfig>;
//# sourceMappingURL=agent-prompts.d.ts.map