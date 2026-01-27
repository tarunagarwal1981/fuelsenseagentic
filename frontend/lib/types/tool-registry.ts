/**
 * Tool Registry Types
 * 
 * Comprehensive type definitions for the FuelSense 360 Tool Registry system.
 * Provides structured metadata for tool discovery, validation, and intelligent routing.
 */

/**
 * JSON Schema type for tool input/output validation
 * Supports standard JSON Schema Draft 7 specification
 */
export interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema | JSONSchema[];
  enum?: (string | number | boolean)[];
  description?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  default?: unknown;
  oneOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
  additionalProperties?: boolean | JSONSchema;
  [key: string]: unknown; // Allow additional JSON Schema properties
}

/**
 * Tool cost classification
 */
export type ToolCost = 
  | 'free'          // Pure computation, no external calls
  | 'api_call'      // External API, costs money
  | 'expensive';    // Heavy computation or expensive API

/**
 * Tool category classification
 */
export type ToolCategory = 
  | 'routing'
  | 'weather' 
  | 'bunker'
  | 'compliance'
  | 'vessel'
  | 'calculation'
  | 'validation';

/**
 * Tool function signature
 * All tools must return a Promise
 */
export type ToolFunction = (...args: any[]) => Promise<any>;

/**
 * Rate limit configuration for tools
 */
export interface RateLimit {
  /** Maximum number of calls allowed */
  calls: number;
  /** Time window in milliseconds */
  windowMs: number;
}

/**
 * Tool metrics for monitoring and performance tracking
 */
export interface ToolMetrics {
  /** Total number of times this tool has been called */
  totalCalls: number;
  /** Number of successful calls */
  successCalls: number;
  /** Number of failed calls */
  failureCalls: number;
  /** Timestamp of last tool call */
  lastCalledAt?: Date;
}

/**
 * Complete tool definition with all metadata
 */
export interface ToolDefinition {
  // Identity
  /** Unique tool identifier (e.g., 'calculate_route') */
  id: string;
  /** Human-readable tool name (e.g., 'Route Calculator') */
  name: string;
  /** Detailed description of what the tool does */
  description: string;
  /** Semantic version (e.g., '1.0.0') */
  version: string;
  
  // Classification
  /** Tool category for grouping and discovery */
  category: ToolCategory;
  /** Domain tags for cross-cutting concerns (e.g., ['bunker_planning', 'cii_analysis']) */
  domain: string[];
  
  // Schema
  /** JSON Schema for tool input parameters */
  inputSchema: {
    type: 'object';
    properties: Record<string, JSONSchema>;
    required: string[];
  };
  /** JSON Schema for tool output */
  outputSchema: {
    type: 'object';
    properties: Record<string, JSONSchema>;
    required?: string[];
  };
  
  // Operational Metadata
  /** Cost classification for resource planning */
  cost: ToolCost;
  /** Historical average latency in milliseconds */
  avgLatencyMs: number;
  /** Maximum acceptable latency before timeout (milliseconds) */
  maxLatencyMs: number;
  /** Reliability score (0-1), success rate over time */
  reliability: number;
  
  // Dependencies
  /** External service dependencies (e.g., ['searoute_api', 'open_meteo']) */
  dependencies: {
    external: string[];
    /** Internal tool IDs that this tool depends on */
    internal: string[];
  };
  
  // Access Control
  /** Agent IDs that can use this tool */
  agentIds: string[];
  /** Whether this tool requires authentication */
  requiresAuth: boolean;
  /** Optional rate limiting configuration */
  rateLimit?: RateLimit;
  
  // Implementation
  /** Actual function implementation */
  implementation: ToolFunction;
  
  // Monitoring
  /** Runtime metrics for this tool */
  metrics: ToolMetrics;
  
  // Metadata
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Whether this tool is deprecated */
  deprecated?: boolean;
  /** Tool ID that replaces this deprecated tool */
  replacedBy?: string;
}

/**
 * Search criteria for finding tools
 */
export interface ToolSearchCriteria {
  /** Filter by tool category */
  category?: ToolCategory;
  /** Filter by domain tag */
  domain?: string;
  /** Filter by agent ID */
  agentId?: string;
  /** Minimum reliability threshold (0-1) */
  minReliability?: number;
  /** Maximum acceptable latency (milliseconds) */
  maxLatencyMs?: number;
  /** Exclude deprecated tools */
  excludeDeprecated?: boolean;
  /** Filter by cost type */
  cost?: ToolCost;
}

/**
 * Validation result for tool definitions
 */
export interface ValidationResult {
  /** Whether the tool definition is valid */
  valid: boolean;
  /** Array of validation errors */
  errors: string[];
  /** Array of validation warnings */
  warnings: string[];
}
