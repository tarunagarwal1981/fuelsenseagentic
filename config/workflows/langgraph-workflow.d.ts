/**
 * LangGraph Workflow Configuration
 *
 * Configuration for the LangGraph-based workflow implementation.
 */
export interface LangGraphWorkflowConfig {
    name: string;
    description: string;
    nodes: string[];
    edges: Array<{
        from: string;
        to: string;
        condition?: string;
    }>;
    initialState?: Record<string, any>;
}
export declare const langgraphWorkflowConfig: LangGraphWorkflowConfig;
//# sourceMappingURL=langgraph-workflow.d.ts.map