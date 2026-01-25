/**
 * Agent Registry Types
 * 
 * Comprehensive type definitions for the FuelSense 360 Agent Registry system.
 * Provides structured metadata for agent discovery, dependency tracking, and intelligent routing.
 */

/**
 * Agent type classification
 */
export type AgentType = 
  | 'supervisor'      // Orchestrates other agents
  | 'specialist'      // Domain-specific expert
  | 'coordinator'     // Manages multi-step workflows
  | 'finalizer';      // Synthesizes results

/**
 * LLM configuration for an agent
 */
export interface AgentLLMConfig {
  /** LLM model identifier */
  model: string;                      // 'claude-sonnet-4-5' | 'gpt-4o-mini'
  /** Temperature for generation (0-2) */
  temperature: number;
  /** Maximum tokens to generate */
  maxTokens: number;
  /** System prompt content or path to prompt file */
  systemPrompt?: string;
}

/**
 * Agent node function signature
 * All agent nodes must accept state and return updated state
 */
export type AgentNodeFunction = (state: any) => Promise<any>;

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Backoff delay in milliseconds */
  backoffMs: number;
}

/**
 * Execution configuration for an agent
 */
export interface ExecutionConfig {
  /** Whether this agent can run in parallel with others */
  canRunInParallel: boolean;
  /** Maximum execution time in milliseconds */
  maxExecutionTimeMs: number;
  /** Retry policy */
  retryPolicy: RetryPolicy;
}

/**
 * Agent metrics for monitoring
 */
export interface AgentMetrics {
  /** Total number of executions */
  totalExecutions: number;
  /** Number of successful executions */
  successfulExecutions: number;
  /** Number of failed executions */
  failedExecutions: number;
  /** Average execution time in milliseconds */
  avgExecutionTimeMs: number;
  /** Timestamp of last execution */
  lastExecutedAt?: Date;
}

/**
 * Complete agent definition with all metadata
 */
export interface AgentDefinition {
  // Identity
  /** Unique agent identifier (e.g., 'bunker_planner') */
  id: string;
  /** Human-readable agent name (e.g., 'Bunker Planning Agent') */
  name: string;
  /** Detailed description of what this agent does */
  description: string;
  /** Semantic version (e.g., '1.0.0') */
  version: string;
  
  // Agent Type
  /** Type of agent */
  type: AgentType;
  
  // LLM Configuration
  /** Optional LLM configuration (not needed for deterministic agents) */
  llm?: AgentLLMConfig;
  
  // Capabilities & Domain
  /** Domain tags (e.g., ['bunker_planning', 'route_optimization']) */
  domain: string[];
  /** Capabilities this agent provides (e.g., ['calculate_route', 'optimize_cost']) */
  capabilities: string[];
  /** Intents this agent handles (e.g., ['plan_bunker', 'optimize_route']) */
  intents: string[];
  
  // Input/Output Contract
  /** State fields and message types this agent produces */
  produces: {
    /** State fields this agent populates (e.g., ['route', 'waypoints']) */
    stateFields: string[];
    /** Message types it produces (e.g., ['route_calculated', 'error']) */
    messageTypes: string[];
  };
  /** State fields and message types this agent consumes */
  consumes: {
    /** Required state fields (e.g., ['vessel', 'origin', 'destination']) */
    required: string[];
    /** Optional state fields (e.g., ['weather', 'constraints']) */
    optional: string[];
  };
  
  // Tool Access
  /** Tools this agent can use */
  tools: {
    /** Required tools (must be available) */
    required: string[];
    /** Optional tools (can use if available) */
    optional: string[];
  };
  
  // Dependencies
  /** Agent dependencies */
  dependencies: {
    /** Agents that must run before this one */
    upstream: string[];
    /** Agents that depend on this one */
    downstream: string[];
  };
  
  // Execution Config
  /** Execution configuration */
  execution: ExecutionConfig;
  
  // Configuration Files
  /** Optional path to agent config file */
  configFile?: string;
  /** Optional path to prompt file */
  promptFile?: string;
  
  // Implementation
  /** Path to implementation file */
  implementation: string;
  /** Actual LangGraph node function */
  nodeFunction: AgentNodeFunction;
  
  // Monitoring
  /** Runtime metrics */
  metrics: AgentMetrics;
  
  // Access Control
  /** Whether this agent is enabled */
  enabled: boolean;
  /** Optional feature flag name */
  featureFlag?: string;
  
  // Metadata
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Whether this agent is deprecated */
  deprecated?: boolean;
  /** Agent ID that replaces this deprecated agent */
  replacedBy?: string;
}

/**
 * Search criteria for finding agents
 */
export interface AgentSearchCriteria {
  /** Filter by domain */
  domain?: string;
  /** Filter by capability */
  capability?: string;
  /** Filter by agent type */
  type?: AgentType;
  /** Filter by parallel execution capability */
  canRunInParallel?: boolean;
  /** Filter by enabled status */
  enabled?: boolean;
  /** Filter by intent */
  intent?: string;
}

/**
 * Agent dependency graph structure
 */
export interface AgentDependencyGraph {
  /** All agent IDs in the graph */
  nodes: string[];
  /** Dependency edges as [from, to] pairs */
  edges: Array<[string, string]>;
  /** Circular dependencies (should be empty) */
  cycles: string[][];
}

/**
 * Validation result for agent definitions
 */
export interface ValidationResult {
  /** Whether the agent definition is valid */
  valid: boolean;
  /** Array of validation errors */
  errors: string[];
  /** Array of validation warnings */
  warnings: string[];
}
