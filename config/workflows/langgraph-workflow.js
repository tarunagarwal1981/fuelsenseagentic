"use strict";
/**
 * LangGraph Workflow Configuration
 *
 * Configuration for the LangGraph-based workflow implementation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.langgraphWorkflowConfig = void 0;
exports.langgraphWorkflowConfig = {
    name: 'langgraph-workflow',
    description: 'LangGraph-based multi-agent workflow',
    nodes: ['route-agent', 'bunker-agent', 'finalize'],
    edges: [
        { from: 'route-agent', to: 'bunker-agent' },
        { from: 'bunker-agent', to: 'finalize' },
    ],
    initialState: {},
};
//# sourceMappingURL=langgraph-workflow.js.map