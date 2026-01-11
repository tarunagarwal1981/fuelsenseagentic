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
export declare const systemPrompts: Record<string, SystemPromptConfig>;
//# sourceMappingURL=system-prompts.d.ts.map