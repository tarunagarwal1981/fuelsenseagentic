"use strict";
/**
 * Agent-Specific Prompts Configuration
 *
 * Prompts tailored for specific agent roles and capabilities.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentPrompts = void 0;
exports.agentPrompts = {
    routeAgent: {
        agentName: 'route-agent',
        systemPrompt: 'You are a maritime route calculation expert.',
        userPromptTemplate: 'Calculate route from {origin} to {destination}',
        examples: [],
    },
    bunkerAgent: {
        agentName: 'bunker-agent',
        systemPrompt: 'You are a bunker fuel optimization expert.',
        userPromptTemplate: 'Find best bunker options for route: {route}',
        examples: [],
    },
};
//# sourceMappingURL=agent-prompts.js.map