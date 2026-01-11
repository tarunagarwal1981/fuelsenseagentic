"use strict";
/**
 * System Prompts Configuration
 *
 * Centralized system prompts for agents.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemPrompts = void 0;
exports.systemPrompts = {
    default: {
        name: 'default',
        content: 'You are a helpful maritime bunker optimization assistant.',
        variables: [],
    },
    routeAgent: {
        name: 'route-agent',
        content: 'You are a maritime route calculation expert. Calculate optimal routes between ports.',
        variables: [],
    },
    bunkerAgent: {
        name: 'bunker-agent',
        content: 'You are a bunker fuel optimization expert. Find the best bunker options for vessels.',
        variables: [],
    },
};
//# sourceMappingURL=system-prompts.js.map