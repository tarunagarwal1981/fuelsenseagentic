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

export const defaultWorkflowConfig: WorkflowConfig = {
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

