/**
 * Configuration Type Definitions
 *
 * Comprehensive type definitions for YAML-based configuration system.
 * Supports agents, tools, workflows, business rules, and feature flags.
 */

// ============================================================================
// Agent Configuration
// ============================================================================

export type AgentType = 'supervisor' | 'specialist' | 'coordinator' | 'finalizer';
export type AgentExecutionType = 'deterministic' | 'llm' | 'hybrid';

export interface AgentLLMConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  systemPromptFile?: string;
}

export interface AgentRetryPolicy {
  maxRetries: number;
  backoffMs: number;
  backoffType?: 'linear' | 'exponential';
}

export interface AgentExecutionConfig {
  type?: AgentExecutionType;
  canRunInParallel: boolean;
  maxExecutionTimeMs: number;
  retryPolicy: AgentRetryPolicy;
  costPerCall?: number;
}

export interface AgentToolsConfig {
  required: string[];
  optional: string[];
}

export interface AgentDependenciesConfig {
  upstream: string[];
  downstream: string[];
}

export interface AgentProducesConfig {
  stateFields: string[];
  messageTypes?: string[];
}

export interface AgentConsumesConfig {
  required: string[];
  optional: string[];
}

export interface AgentValidationConfig {
  preExecution?: string[];
  postExecution?: string[];
}

export interface AgentHumanApprovalConfig {
  required: boolean;
  threshold?: {
    field: string;
    operator: '<' | '>' | '<=' | '>=' | '==' | '!=';
    value: number;
  };
}

export interface AgentMetadata {
  version: string;
  lastUpdated: string;
  maintainer?: string;
  documentation?: string;
}

export interface AgentConfig {
  // Identity
  id: string;
  name: string;
  description: string;
  type: AgentType;

  // LLM Configuration (optional for deterministic agents)
  llm?: AgentLLMConfig;

  // Domain and capabilities
  domain: string[];
  capabilities: string[];
  intents: string[];

  // Tools
  tools: AgentToolsConfig;

  // Dependencies
  dependencies: AgentDependenciesConfig;

  // Execution
  execution: AgentExecutionConfig;

  // Contract
  produces?: AgentProducesConfig;
  consumes?: AgentConsumesConfig;

  // Validation
  validation?: AgentValidationConfig;

  // Human approval
  humanApproval?: AgentHumanApprovalConfig;

  // Status
  enabled: boolean;
  featureFlag?: string;

  // Metadata
  metadata?: AgentMetadata;
}

// ============================================================================
// Tool Configuration
// ============================================================================

export type ToolCost = 'free' | 'api_call' | 'expensive';
export type ToolCategory =
  | 'routing'
  | 'weather'
  | 'bunker'
  | 'compliance'
  | 'vessel'
  | 'calculation'
  | 'validation';

export interface ToolRateLimitConfig {
  calls: number;
  windowMs: number;
}

export interface ToolDependenciesConfig {
  external: string[];
  internal: string[];
}

export interface ToolInputSchemaConfig {
  type: 'object';
  properties: Record<string, any>;
  required: string[];
}

export interface ToolOutputSchemaConfig {
  type: 'object';
  properties: Record<string, any>;
}

export interface ToolConfig {
  // Identity
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  domain?: string[];

  // Performance
  cost: ToolCost;
  avgLatencyMs: number;
  maxLatencyMs: number;
  reliability?: number;

  // Dependencies
  dependencies: ToolDependenciesConfig;

  // Usage
  agentIds: string[];
  requiresAuth: boolean;
  rateLimit?: ToolRateLimitConfig;

  // Schema (optional - can be defined in code)
  inputSchema?: ToolInputSchemaConfig;
  outputSchema?: ToolOutputSchemaConfig;

  // Status
  enabled: boolean;
  deprecated?: boolean;
  replacedBy?: string;

  // Metadata
  metadata?: {
    version: string;
    lastUpdated: string;
  };
}

// ============================================================================
// Workflow Configuration
// ============================================================================

export interface WorkflowStageConfig {
  id: string;
  agentId: string;
  order: number;
  required: boolean;
  skipIf?: Record<string, any>;
  parallelWith?: string[];
}

export interface WorkflowExecutionConfig {
  maxTotalTimeMs: number;
  allowParallelStages: boolean;
  continueOnError: boolean;
}

export interface WorkflowConfig {
  // Identity
  id: string;
  name: string;
  description: string;

  // Query matching
  queryTypes: string[];
  intentPatterns?: string[];

  // Stages
  stages: WorkflowStageConfig[];

  // Execution
  execution: WorkflowExecutionConfig;

  // Contract
  requiredInputs: string[];
  finalOutputs: string[];

  // Status
  enabled: boolean;

  // Metadata
  metadata?: {
    version: string;
    lastUpdated: string;
  };
}

// ============================================================================
// Business Rules Configuration
// ============================================================================

export type RuleCategory = 'safety' | 'cost' | 'compliance' | 'operational';
export type RuleSeverity = 'blocking' | 'warning' | 'info';
export type RuleAction =
  | 'add_warning'
  | 'block_operation'
  | 'require_approval'
  | 'add_info'
  | 'modify_value';

export interface BusinessRuleCondition {
  field: string;
  operator: '<' | '>' | '<=' | '>=' | '==' | '!=' | 'contains' | 'in';
  value: any;
}

export interface BusinessRuleDefinition {
  expression?: string; // JS expression
  conditions?: BusinessRuleCondition[]; // Structured conditions
  combinator?: 'AND' | 'OR';
}

export interface BusinessRule {
  // Identity
  id: string;
  name: string;
  description: string;
  category: RuleCategory;

  // Rule definition
  rule: {
    condition: string; // JS expression or structured condition
    action: RuleAction;
    priority: number; // 1 = highest
    severity: RuleSeverity;
  };

  // Parameters for rule evaluation
  parameters: Record<string, any>;

  // When to evaluate
  timing?: 'pre_execution' | 'post_execution' | 'always';
  appliesTo?: string[]; // Agent IDs or 'all'

  // Status
  enabled: boolean;

  // Metadata
  metadata?: {
    version: string;
    lastUpdated: string;
    rationale?: string;
  };
}

export interface BusinessRulesConfig {
  rules: BusinessRule[];
}

// ============================================================================
// Feature Flags Configuration
// ============================================================================

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage?: number; // 0-100
  enabledFor?: string[]; // Specific user IDs
  disabledFor?: string[]; // Specific user IDs
  expiresAt?: string; // ISO date string
  dependencies?: string[]; // Other feature flags that must be enabled
}

export interface FeatureFlagsConfig {
  features: FeatureFlag[];
}

// ============================================================================
// Validation Results
// ============================================================================

export interface ConfigValidationError {
  path: string;
  message: string;
  value?: any;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
  warnings: ConfigValidationError[];
}

// ============================================================================
// Configuration Metadata
// ============================================================================

export interface ConfigMetadata {
  loadedAt: Date;
  source: string;
  version?: string;
  checksum?: string;
}

// ============================================================================
// Aggregate Configuration Type
// ============================================================================

export interface FuelSenseConfig {
  agents: Map<string, AgentConfig>;
  tools: Map<string, ToolConfig>;
  workflows: Map<string, WorkflowConfig>;
  businessRules: Map<string, BusinessRule>;
  featureFlags: Map<string, FeatureFlag>;
  metadata: {
    loadedAt: Date;
    configVersion: string;
  };
}
