/**
 * Workflow Orchestration Engine
 *
 * Engine for orchestrating multi-agent workflows.
 * Handles workflow execution, state management, and
 * agent coordination.
 */
export interface WorkflowEngineConfig {
    workflowName: string;
    configPath: string;
    agents: string[];
}
export declare class WorkflowEngine {
    private config;
    constructor(config: WorkflowEngineConfig);
    /**
     * Execute a workflow with the given input
     */
    execute(input: string): Promise<any>;
    /**
     * Load workflow configuration
     */
    loadConfig(): Promise<any>;
}
//# sourceMappingURL=workflow-engine.d.ts.map