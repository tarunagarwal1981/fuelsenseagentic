/**
 * Default Workflow Configuration
 *
 * Defines the default workflow for agent orchestration.
 */
export interface WorkflowConfig {
    name: string;
    description: string;
    steps: WorkflowStep[];
    errorHandling?: ErrorHandlingConfig;
}
export interface WorkflowStep {
    agent: string;
    condition?: string;
    parallel?: boolean;
}
export interface ErrorHandlingConfig {
    retryAttempts: number;
    fallbackAgent?: string;
    timeout?: number;
}
export declare const defaultWorkflowConfig: WorkflowConfig;
//# sourceMappingURL=default-workflow.d.ts.map