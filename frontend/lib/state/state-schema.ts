/**
 * State Schema Versioning System
 *
 * Defines versioned schemas for the multi-agent state.
 * Enables safe schema evolution without breaking existing conversations.
 *
 * Version History:
 * - v1.0.0: Initial Phase 1 schema (route, weather, bunker)
 * - v2.0.0: Add execution plan, CII, EU ETS support
 * - v3.0.0: Add hull performance, fouling assessment
 */

// ============================================================================
// Current Version
// ============================================================================

export const CURRENT_STATE_VERSION = '2.0.0';

// ============================================================================
// Types
// ============================================================================

/**
 * Field types for state schema
 */
export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'date'
  | 'route'
  | 'port[]'
  | 'bunker_analysis'
  | 'weather_data'
  | 'cii_rating'
  | 'eu_ets_calculation'
  | 'execution_plan'
  | 'execution_result'
  | 'message[]';

/**
 * Validation result structure
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Individual field schema definition
 */
export interface FieldSchema {
  name: string;
  type: FieldType;
  description: string;
  required: boolean;
  deprecated?: boolean;
  deprecatedSince?: string;
  replacedBy?: string;
  default?: any;
  validator?: (value: any) => ValidationResult;
  size?: {
    current: number;    // Expected bytes
    max: number;        // Max allowed bytes
  };
  nullable?: boolean;
}

/**
 * State schema definition with version
 */
export interface StateSchema {
  version: string;
  fields: Record<string, FieldSchema>;
  deprecated?: string[];
  required: string[];
  computed: string[];
  maxTotalSize: number;
  migratesFrom?: string;
}

// ============================================================================
// Schema v1.0.0 - Phase 1 (Initial)
// ============================================================================

export const StateSchemaV1: StateSchema = {
  version: '1.0.0',
  maxTotalSize: 30000, // 30KB

  fields: {
    // Core messaging
    messages: {
      name: 'messages',
      type: 'message[]',
      description: 'Conversation history (LangChain messages)',
      required: true,
      size: { current: 5000, max: 20000 },
    },
    correlation_id: {
      name: 'correlation_id',
      type: 'string',
      description: 'Request correlation ID for tracing',
      required: true,
      size: { current: 36, max: 100 },
    },

    // Agent coordination
    next_agent: {
      name: 'next_agent',
      type: 'string',
      description: 'Next agent to route to',
      required: false,
      nullable: true,
      size: { current: 20, max: 50 },
    },
    agent_context: {
      name: 'agent_context',
      type: 'object',
      description: 'Context for current agent execution',
      required: false,
      nullable: true,
      size: { current: 200, max: 1000 },
    },
    agent_errors: {
      name: 'agent_errors',
      type: 'object',
      description: 'Errors from agent executions',
      required: false,
      nullable: true,
      size: { current: 500, max: 2000 },
    },

    // Route data
    route: {
      name: 'route',
      type: 'route',
      description: 'Calculated maritime route with waypoints',
      required: false,
      nullable: true,
      size: { current: 1500, max: 3000 },
    },

    // Port data
    ports: {
      name: 'ports',
      type: 'port[]',
      description: 'Available bunker ports along route',
      required: false,
      nullable: true,
      size: { current: 2000, max: 5000 },
    },
    nearby_ports: {
      name: 'nearby_ports',
      type: 'port[]',
      description: 'Nearby bunker ports for alternatives',
      required: false,
      nullable: true,
      size: { current: 1000, max: 3000 },
    },

    // Price data
    prices: {
      name: 'prices',
      type: 'array',
      description: 'Fuel prices at ports',
      required: false,
      nullable: true,
      size: { current: 1000, max: 3000 },
    },

    // Bunker analysis
    analysis: {
      name: 'analysis',
      type: 'bunker_analysis',
      description: 'Bunker optimization analysis and recommendations',
      required: false,
      nullable: true,
      size: { current: 2000, max: 4000 },
    },

    // Weather data
    weather: {
      name: 'weather',
      type: 'weather_data',
      description: 'Weather analysis along route',
      required: false,
      nullable: true,
      size: { current: 2500, max: 5000 },
    },
    weather_impact: {
      name: 'weather_impact',
      type: 'object',
      description: 'Weather impact on consumption',
      required: false,
      nullable: true,
      size: { current: 500, max: 1500 },
    },

    // Vessel data
    vessel: {
      name: 'vessel',
      type: 'object',
      description: 'Vessel profile and specifications',
      required: true,
      size: { current: 600, max: 1500 },
    },

    // Finalization
    final_response: {
      name: 'final_response',
      type: 'string',
      description: 'Final formatted response to user',
      required: false,
      nullable: true,
      size: { current: 3000, max: 10000 },
    },
    final_recommendation: {
      name: 'final_recommendation',
      type: 'object',
      description: 'Structured final recommendation',
      required: false,
      nullable: true,
      size: { current: 2000, max: 5000 },
    },

    // Metadata
    degraded_mode: {
      name: 'degraded_mode',
      type: 'boolean',
      description: 'Whether running in degraded mode due to errors',
      required: false,
      default: false,
    },
    missing_data: {
      name: 'missing_data',
      type: 'array',
      description: 'List of missing data fields',
      required: false,
      nullable: true,
      size: { current: 200, max: 500 },
    },
    needs_clarification: {
      name: 'needs_clarification',
      type: 'boolean',
      description: 'Whether user clarification is needed',
      required: false,
      default: false,
    },
    clarification_question: {
      name: 'clarification_question',
      type: 'string',
      description: 'Question to ask user for clarification',
      required: false,
      nullable: true,
      size: { current: 200, max: 500 },
    },
  },

  required: ['messages', 'correlation_id', 'vessel'],
  computed: [],
  deprecated: [],
};

// ============================================================================
// Schema v2.0.0 - Phase 1 Extended (Current)
// ============================================================================

export const StateSchemaV2: StateSchema = {
  version: '2.0.0',
  maxTotalSize: 50000, // 50KB
  migratesFrom: '1.0.0',

  fields: {
    // Inherit all v1 fields
    ...StateSchemaV1.fields,

    // Schema version tracking
    _schema_version: {
      name: '_schema_version',
      type: 'string',
      description: 'Schema version of this state',
      required: false,
      size: { current: 10, max: 20 },
    },

    // Execution plan fields
    execution_plan: {
      name: 'execution_plan',
      type: 'execution_plan',
      description: 'Generated execution plan for workflow',
      required: false,
      nullable: true,
      size: { current: 1500, max: 3000 },
    },
    execution_result: {
      name: 'execution_result',
      type: 'execution_result',
      description: 'Result from plan execution',
      required: false,
      nullable: true,
      size: { current: 800, max: 2000 },
    },
    workflow_stage: {
      name: 'workflow_stage',
      type: 'number',
      description: 'Current workflow stage index',
      required: false,
      default: 0,
    },

    // Agentic supervisor fields
    reasoning_history: {
      name: 'reasoning_history',
      type: 'array',
      description: 'History of supervisor reasoning steps',
      required: false,
      nullable: true,
      size: { current: 1000, max: 3000 },
    },
    current_thought: {
      name: 'current_thought',
      type: 'string',
      description: 'Current supervisor thought',
      required: false,
      nullable: true,
      size: { current: 300, max: 1000 },
    },
    next_action: {
      name: 'next_action',
      type: 'object',
      description: 'Next action decided by supervisor',
      required: false,
      nullable: true,
      size: { current: 200, max: 500 },
    },

    // Error recovery
    error_recovery_attempts: {
      name: 'error_recovery_attempts',
      type: 'number',
      description: 'Count of error recovery attempts',
      required: false,
      default: 0,
    },

    // Agent overrides
    agent_overrides: {
      name: 'agent_overrides',
      type: 'object',
      description: 'Configuration overrides for agents',
      required: false,
      nullable: true,
      size: { current: 500, max: 2000 },
    },

    // CII Rating fields (future)
    cii_rating: {
      name: 'cii_rating',
      type: 'cii_rating',
      description: 'CII rating calculation result',
      required: false,
      nullable: true,
      size: { current: 800, max: 1500 },
    },
    cii_recommendations: {
      name: 'cii_recommendations',
      type: 'array',
      description: 'CII improvement recommendations',
      required: false,
      nullable: true,
      size: { current: 1000, max: 2000 },
    },

    // EU ETS fields (future)
    eu_ets_cost: {
      name: 'eu_ets_cost',
      type: 'eu_ets_calculation',
      description: 'EU ETS compliance cost calculation',
      required: false,
      nullable: true,
      size: { current: 600, max: 1200 },
    },
    emissions_breakdown: {
      name: 'emissions_breakdown',
      type: 'object',
      description: 'Detailed emissions breakdown by segment',
      required: false,
      nullable: true,
      size: { current: 800, max: 1500 },
    },

    // Compliance data
    compliance_data: {
      name: 'compliance_data',
      type: 'object',
      description: 'Regulatory compliance data (ECA, MARPOL, etc.)',
      required: false,
      nullable: true,
      size: { current: 1000, max: 2000 },
    },
    eca_segments: {
      name: 'eca_segments',
      type: 'array',
      description: 'ECA zone segments along route',
      required: false,
      nullable: true,
      size: { current: 500, max: 1500 },
    },
  },

  required: ['messages', 'correlation_id', 'vessel'],
  computed: ['workflow_stage', 'error_recovery_attempts'],
  deprecated: [],
};

// ============================================================================
// Schema v3.0.0 - Phase 2 (Hull Performance)
// ============================================================================

export const StateSchemaV3: StateSchema = {
  version: '3.0.0',
  maxTotalSize: 75000, // 75KB
  migratesFrom: '2.0.0',

  fields: {
    // Inherit all v2 fields
    ...StateSchemaV2.fields,

    // Hull performance fields
    hull_performance: {
      name: 'hull_performance',
      type: 'object',
      description:
        'Hull performance analysis data including condition, metrics, trends, and baselines',
      required: false,
      nullable: true,
      size: { current: 3000, max: 5000 },
    },
    hull_performance_charts: {
      name: 'hull_performance_charts',
      type: 'object',
      description:
        'Chart data for hull performance visualization (excess power trends, consumption comparison, baselines)',
      required: false,
      nullable: true,
      size: { current: 2000, max: 4000 },
    },
    fouling_assessment: {
      name: 'fouling_assessment',
      type: 'object',
      description: 'Hull fouling assessment',
      required: false,
      nullable: true,
      size: { current: 600, max: 1200 },
    },
    propulsion_efficiency: {
      name: 'propulsion_efficiency',
      type: 'object',
      description: 'Propulsion efficiency metrics',
      required: false,
      nullable: true,
      size: { current: 400, max: 800 },
    },

    // Speed optimization
    speed_optimization: {
      name: 'speed_optimization',
      type: 'object',
      description: 'Speed optimization recommendations',
      required: false,
      nullable: true,
      size: { current: 500, max: 1000 },
    },

    // Multi-port planning
    multi_port_plan: {
      name: 'multi_port_plan',
      type: 'object',
      description: 'Multi-port bunkering plan',
      required: false,
      nullable: true,
      size: { current: 2000, max: 4000 },
    },
  },

  required: ['messages', 'correlation_id', 'vessel'],
  computed: ['workflow_stage', 'error_recovery_attempts'],
  deprecated: [],
};

// ============================================================================
// Schema Registry
// ============================================================================

export const STATE_SCHEMAS: Record<string, StateSchema> = {
  '1.0.0': StateSchemaV1,
  '2.0.0': StateSchemaV2,
  '3.0.0': StateSchemaV3,
};

/**
 * Get schema by version
 */
export function getSchema(version: string): StateSchema | undefined {
  return STATE_SCHEMAS[version];
}

/**
 * Get current schema
 */
export function getCurrentSchema(): StateSchema {
  return STATE_SCHEMAS[CURRENT_STATE_VERSION];
}

/**
 * Get all schema versions in order
 */
export function getSchemaVersions(): string[] {
  return Object.keys(STATE_SCHEMAS).sort((a, b) => {
    const [aMaj, aMin, aPatch] = a.split('.').map(Number);
    const [bMaj, bMin, bPatch] = b.split('.').map(Number);
    if (aMaj !== bMaj) return aMaj - bMaj;
    if (aMin !== bMin) return aMin - bMin;
    return aPatch - bPatch;
  });
}

/**
 * Check if version is valid
 */
export function isValidVersion(version: string): boolean {
  return version in STATE_SCHEMAS;
}

/**
 * Compare two versions
 * Returns: -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareVersions(a: string, b: string): number {
  const [aMaj, aMin, aPatch] = a.split('.').map(Number);
  const [bMaj, bMin, bPatch] = b.split('.').map(Number);

  if (aMaj !== bMaj) return aMaj < bMaj ? -1 : 1;
  if (aMin !== bMin) return aMin < bMin ? -1 : 1;
  if (aPatch !== bPatch) return aPatch < bPatch ? -1 : 1;
  return 0;
}
