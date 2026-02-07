/**
 * Agent Registry Types - FuelSense 360
 *
 * Production-grade type definitions for the Agent Registry system.
 * Supports dynamic registration, capability-based routing, and execution planning.
 */

// ============================================================================
// Execution Context
// ============================================================================

/**
 * Context passed to agents during execution
 */
export interface ExecutionContext {
  /** Correlation ID for distributed tracing */
  correlationId: string;
  /** Current multi-agent state snapshot */
  state?: Record<string, unknown>;
  /** Agent context from supervisor (port overrides, task description, etc.) */
  agentContext?: Record<string, unknown>;
  /** Request metadata */
  metadata?: {
    /** User query or intent */
    query?: string;
    /** Extracted entities from EntityExtractionAgent */
    entities?: Record<string, unknown>;
    /** Feature flags active for this request */
    featureFlags?: string[];
  };
}

// ============================================================================
// Agent Handler
// ============================================================================

/**
 * Agent handler function signature
 * Receives input and execution context, returns result
 */
export type AgentHandler = (
  input: unknown,
  context: ExecutionContext
) => Promise<unknown>;

// ============================================================================
// Agent Metadata
// ============================================================================

/**
 * Runtime metadata for agent health and metrics
 */
export interface AgentMetadata {
  /** Average execution time in milliseconds */
  avgExecutionTime: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Timestamp of last health check */
  lastHealthCheck: number;
  /** Total executions */
  totalExecutions?: number;
  /** Successful executions */
  successfulExecutions?: number;
}

// ============================================================================
// Agent Registration
// ============================================================================

/**
 * Agent status
 */
export type AgentStatus = 'active' | 'inactive' | 'maintenance';

/**
 * Full agent registration schema
 */
export interface AgentRegistration {
  /** Unique agent ID (e.g., 'entity-extraction', 'route-agent') */
  id: string;
  /** Human-readable name */
  name: string;
  /** Semantic version (e.g., '1.0.0') */
  version: string;
  /** Capabilities this agent provides (e.g., ['vessel_lookup', 'imo_resolution']) */
  capabilities: string[];
  /** Priority for execution ordering (lower = higher priority) */
  priority: number;
  /** Other agent IDs this depends on */
  dependencies: string[];
  /** The actual agent handler function */
  handler: AgentHandler;
  /** Current status */
  status: AgentStatus;
  /** Runtime metadata */
  metadata: AgentMetadata;
  /** Optional feature flag for beta agents */
  featureFlag?: string;
  /** Intents this agent handles (for execution plan routing) */
  intents?: string[];
  /** LangGraph node name for supervisor routing (e.g., 'route_agent') */
  graphNodeName?: string;
}

// ============================================================================
// Registration Input (without computed metadata)
// ============================================================================

/**
 * Input for registering an agent (metadata has defaults)
 */
export interface AgentRegistrationInput
  extends Omit<AgentRegistration, 'metadata'> {
  metadata?: Partial<AgentMetadata>;
}

// ============================================================================
// Execution Plan
// ============================================================================

/**
 * Result of getExecutionPlan - ordered agent chain
 */
export type ExecutionPlan = AgentRegistration[];
