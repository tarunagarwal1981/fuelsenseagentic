/**
 * LangGraph Workflow Configuration
 * 
 * Configuration for the LangGraph-based workflow implementation.
 */

export interface LangGraphWorkflowConfig {
  name: string;
  description: string;
  nodes: string[];
  edges: Array<{ from: string; to: string; condition?: string }>;
  initialState?: Record<string, any>;
}

export const langgraphWorkflowConfig: LangGraphWorkflowConfig = {
  name: 'langgraph-workflow',
  description: 'LangGraph-based multi-agent workflow',
  nodes: ['route-agent', 'bunker-agent', 'finalize'],
  edges: [
    { from: 'route-agent', to: 'bunker-agent' },
    { from: 'bunker-agent', to: 'finalize' },
  ],
  initialState: {},
};

