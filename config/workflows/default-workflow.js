"use strict";
/**
 * Default Workflow Configuration
 *
 * Defines the default workflow for agent orchestration.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultWorkflowConfig = void 0;
exports.defaultWorkflowConfig = {
    name: 'default-workflow',
    description: 'Default workflow for bunker optimization',
    steps: [
        { agent: 'route-agent' },
        { agent: 'bunker-agent' },
    ],
    errorHandling: {
        retryAttempts: 2,
        timeout: 60000,
    },
};
//# sourceMappingURL=default-workflow.js.map