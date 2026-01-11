/**
 * Workflow Engine (Deterministic Execution)
 * 
 * The Workflow Engine executes the orchestrator's plan. It routes between
 * agents, manages state, enforces circuit breakers, and handles errors.
 * This is pure TypeScript - no LLM involvement.
 * 
 * Responsibilities:
 * - Parse execution plan from orchestrator
 * - Route to appropriate agents in sequence
 * - Maintain state across agent calls
 * - Enforce circuit breakers (prevent infinite loops)
 * - Handle errors gracefully
 * - Track performance metrics
 */

import { ExecutionPlan, AgentCall } from '../agents/orchestrator';
import { AgentRegistry, AgentRegistration, AgentExecutor } from '../registry/agent-registry';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Vessel profile information
 */
export interface VesselProfile {
  /** Vessel name */
  name: string;
  /** IMO number */
  imo?: string;
  /** Vessel type */
  type?: string;
  /** Additional vessel metadata */
  metadata?: Record<string, any>;
}

/**
 * Route data from route agent
 */
export interface RouteData {
  /** Origin port code */
  origin: string;
  /** Destination port code */
  destination: string;
  /** Distance in nautical miles */
  distance_nm: number;
  /** Estimated time in hours */
  estimated_hours: number;
  /** Route waypoints */
  waypoints: Array<{ lat: number; lon: number }>;
}

/**
 * Weather data from weather agent
 */
export interface WeatherData {
  /** Weather conditions along route */
  conditions: Array<{
    location: { lat: number; lon: number };
    wave_height_m: number;
    wind_speed_kt: number;
    weather_factor: number;
  }>;
  /** Overall weather risk */
  risk_level: 'Low' | 'Medium' | 'High';
}

/**
 * Bunker analysis from bunker planner agent
 */
export interface BunkerAnalysis {
  /** Recommended port */
  recommended_port?: {
    code: string;
    name: string;
    total_cost: number;
  };
  /** Alternative ports */
  alternative_ports?: Array<{
    code: string;
    name: string;
    total_cost: number;
  }>;
  /** Status */
  status: string;
  /** Message */
  message: string;
}

/**
 * CII rating from CII agent
 */
export interface CIIRating {
  /** CII rating (A-E) */
  rating: 'A' | 'B' | 'C' | 'D' | 'E';
  /** CII value */
  cii_value: number;
  /** Compliance status */
  compliant: boolean;
}

/**
 * EU ETS cost from ETS agent
 */
export interface ETSCost {
  /** Total ETS cost in EUR */
  total_cost_eur: number;
  /** CO2 emissions in tons */
  co2_emissions_tons: number;
  /** Cost per ton CO2 */
  cost_per_ton_eur: number;
}

/**
 * Warning message
 */
export interface Warning {
  /** Warning level */
  level: 'info' | 'warning' | 'error';
  /** Warning message */
  message: string;
  /** Timestamp */
  timestamp: number;
  /** Source agent */
  source?: string;
}

/**
 * Agent call history entry
 */
export interface AgentCallHistory {
  /** Agent name */
  agent: string;
  /** Called at timestamp */
  called_at: Date;
  /** Duration in milliseconds */
  duration_ms: number;
  /** Success status */
  success: boolean;
  /** Error if failed */
  error?: string;
}

/**
 * Workflow state
 */
export interface WorkflowState {
  // Query data
  /** User query */
  query: string;
  /** Query type */
  query_type: string;
  /** Vessel profile */
  vessel: VesselProfile;
  
  // Parameters
  /** Origin port code */
  origin_port?: string;
  /** Destination port code */
  destination_port?: string;
  /** Vessel speed in knots */
  vessel_speed_knots?: number;
  /** Fuel consumption rates */
  consumption?: {
    vlsfo_per_day: number;
    lsmgo_per_day: number;
  };
  
  // Agent outputs
  /** Route data from route agent */
  route_data?: RouteData;
  /** Weather data from weather agent */
  weather_data?: WeatherData;
  /** Bunker analysis from bunker planner */
  bunker_analysis?: BunkerAnalysis;
  /** CII rating from CII agent */
  cii_rating?: CIIRating;
  /** EU ETS cost from ETS agent */
  eu_ets_cost?: ETSCost;
  
  // Meta-data
  /** Agent execution history */
  agent_history: AgentCallHistory[];
  /** Errors encountered */
  errors: Error[];
  /** Warnings */
  warnings: Warning[];
  /** Start time timestamp */
  start_time: number;
  /** Current execution step */
  current_step?: number;
}

/**
 * Decision point evaluation result
 */
export interface DecisionPointResult {
  /** Action to take */
  action: 'continue' | 'stop' | 'branch';
  /** Branch target if action is 'branch' */
  branch_target?: string;
  /** Reason for decision */
  reason?: string;
}

/**
 * Agent input validation result
 */
export interface InputValidationResult {
  /** Whether inputs are valid */
  valid: boolean;
  /** Missing required inputs */
  missing: string[];
  /** Invalid inputs */
  invalid: string[];
}

/**
 * Workflow result
 */
export interface WorkflowResult {
  /** Execution status */
  status: 'completed' | 'failed' | 'cancelled' | 'timeout';
  /** Final state */
  final_state: WorkflowState;
  /** Total duration in milliseconds */
  duration_ms: number;
  /** Error if failed */
  error?: Error;
  /** Performance metrics */
  metrics: {
    total_agent_calls: number;
    successful_calls: number;
    failed_calls: number;
    average_call_duration_ms: number;
    total_llm_cost_usd?: number;
  };
}

/**
 * Circuit breaker limits
 */
const CIRCUIT_BREAKER_LIMITS = {
  /** Maximum total agent calls */
  max_total_agent_calls: 15,
  /** Maximum calls per individual agent */
  max_calls_per_agent: 3,
  /** Maximum execution time in seconds */
  max_execution_time_seconds: 120,
  /** Maximum LLM cost per query in USD */
  max_llm_cost_per_query: 0.05,
  /** Maximum state size in MB */
  max_state_size_mb: 10,
} as const;

/**
 * Agent retry configuration
 */
const RETRY_CONFIG = {
  /** Maximum retry attempts */
  max_retries: 2,
  /** Retry delay in milliseconds */
  retry_delay_ms: 1000,
} as const;

// ============================================================================
// WORKFLOW ENGINE INTERFACE
// ============================================================================

/**
 * Workflow Engine Interface
 */
export interface WorkflowEngine {
  /**
   * Execute workflow plan
   */
  execute(params: {
    execution_plan: ExecutionPlan;
    initial_state: WorkflowState;
  }): Promise<WorkflowResult>;
  
  /**
   * Pause workflow execution
   */
  pause(): void;
  
  /**
   * Resume paused workflow
   */
  resume(): void;
  
  /**
   * Cancel workflow execution
   */
  cancel(): void;
}

// ============================================================================
// WORKFLOW ENGINE IMPLEMENTATION
// ============================================================================

/**
 * Workflow Engine Implementation
 */
export class WorkflowEngineImpl implements WorkflowEngine {
  private isPaused: boolean = false;
  private isCancelled: boolean = false;
  private currentExecution: Promise<WorkflowResult> | null = null;

  /**
   * Execute workflow plan
   */
  async execute(params: {
    execution_plan: ExecutionPlan;
    initial_state: WorkflowState;
  }): Promise<WorkflowResult> {
    const { execution_plan, initial_state } = params;
    
    // Reset flags
    this.isPaused = false;
    this.isCancelled = false;
    
    // Initialize state
    let state: WorkflowState = {
      ...initial_state,
      start_time: Date.now(),
      agent_history: [],
      errors: [],
      warnings: [],
      current_step: 0,
    };
    
    const startTime = Date.now();
    let totalLLMCost = 0;
    
    try {
      // Execute agent sequence
      for (let i = 0; i < execution_plan.agent_sequence.length; i++) {
        // Check if cancelled
        if (this.isCancelled) {
          return this.createResult(state, 'cancelled', startTime, totalLLMCost);
        }
        
        // Wait if paused
        while (this.isPaused && !this.isCancelled) {
          await this.sleep(100);
        }
        
        if (this.isCancelled) {
          return this.createResult(state, 'cancelled', startTime, totalLLMCost);
        }
        
        const agentCall = execution_plan.agent_sequence[i];
        state.current_step = i + 1;
        
        // Check circuit breakers
        const circuitBreakerCheck = this.checkCircuitBreakers(state, startTime);
        if (!circuitBreakerCheck.passed) {
          state.errors.push(new Error(circuitBreakerCheck.reason));
          state.warnings.push({
            level: 'error',
            message: `Circuit breaker triggered: ${circuitBreakerCheck.reason}`,
            timestamp: Date.now(),
            source: 'workflow_engine',
          });
          return this.createResult(state, 'failed', startTime, totalLLMCost, new Error(circuitBreakerCheck.reason));
        }
        
        // Get agent from registry (try agent_name first, then try as id)
        let agent = AgentRegistry.get(agentCall.agent_name);
        if (!agent) {
          // Try to find by matching id or name
          const allAgents = AgentRegistry.listAll();
          agent = allAgents.find(a => a.id === agentCall.agent_name || a.name === agentCall.agent_name) || null;
        }
        if (!agent) {
          const error = new Error(`Agent '${agentCall.agent_name}' not found in registry`);
          state.errors.push(error);
          return this.createResult(state, 'failed', startTime, totalLLMCost, error);
        }
        
        // Validate inputs
        const validation = this.validateAgentInputs(agent, state);
        if (!validation.valid) {
          const error = new Error(`Missing required inputs for agent '${agentCall.agent_name}': ${validation.missing.join(', ')}`);
          state.errors.push(error);
          return this.createResult(state, 'failed', startTime, totalLLMCost, error);
        }
        
        // Call agent with retry logic
        let agentResult: any;
        let agentError: Error | null = null;
        let callDuration = 0;
        
        for (let retry = 0; retry <= RETRY_CONFIG.max_retries; retry++) {
          try {
            const callStartTime = Date.now();
            agentResult = await agent.executor(state);
            callDuration = Date.now() - callStartTime;
            
            // Track LLM cost if available
            if (agentResult?.llm_cost_usd) {
              totalLLMCost += agentResult.llm_cost_usd;
            }
            
            // Success - clear error and break retry loop
            agentError = null;
            break;
          } catch (error) {
            agentError = error instanceof Error ? error : new Error(String(error));
            
            if (retry < RETRY_CONFIG.max_retries) {
              // Wait before retry
              await this.sleep(RETRY_CONFIG.retry_delay_ms * (retry + 1));
              continue;
            } else {
              // All retries exhausted
              state.errors.push(agentError);
              state.warnings.push({
                level: 'error',
                message: `Agent '${agentCall.agent_name}' failed after ${RETRY_CONFIG.max_retries + 1} attempts: ${agentError.message}`,
                timestamp: Date.now(),
                source: agentCall.agent_name,
              });
              // Continue to next agent instead of failing entire workflow
              continue;
            }
          }
        }
        
        // Update state with agent result
        if (agentResult && !agentError) {
          state = this.updateState(state, agentResult, agent);
        }
        
        // Record history
        state.agent_history.push({
          agent: agentCall.agent_name,
          called_at: new Date(),
          duration_ms: callDuration,
          success: !agentError,
          error: agentError?.message,
        });
        
        // Check decision points
        const decision = this.evaluateDecisionPoint(agentCall, state);
        if (decision.action === 'stop') {
          break;
        }
        if (decision.action === 'branch') {
          // Handle conditional routing (simplified - would need more complex logic)
          state.warnings.push({
            level: 'info',
            message: `Branching to: ${decision.branch_target}`,
            timestamp: Date.now(),
            source: 'workflow_engine',
          });
        }
      }
      
      // Check for timeout
      const totalDuration = (Date.now() - startTime) / 1000;
      if (totalDuration > CIRCUIT_BREAKER_LIMITS.max_execution_time_seconds) {
        state.warnings.push({
          level: 'warning',
          message: `Workflow exceeded maximum execution time (${totalDuration.toFixed(2)}s > ${CIRCUIT_BREAKER_LIMITS.max_execution_time_seconds}s)`,
          timestamp: Date.now(),
          source: 'workflow_engine',
        });
        return this.createResult(state, 'timeout', startTime, totalLLMCost);
      }
      
      return this.createResult(state, 'completed', startTime, totalLLMCost);
      
    } catch (error) {
      const workflowError = error instanceof Error ? error : new Error(String(error));
      state.errors.push(workflowError);
      return this.createResult(state, 'failed', startTime, totalLLMCost, workflowError);
    }
  }
  
  /**
   * Pause workflow execution
   */
  pause(): void {
    this.isPaused = true;
  }
  
  /**
   * Resume paused workflow
   */
  resume(): void {
    this.isPaused = false;
  }
  
  /**
   * Cancel workflow execution
   */
  cancel(): void {
    this.isCancelled = true;
    this.isPaused = false;
  }
  
  /**
   * Check circuit breakers
   */
  private checkCircuitBreakers(
    state: WorkflowState,
    startTime: number
  ): { passed: boolean; reason?: string } {
    // Check max agent calls
    if (state.agent_history.length >= CIRCUIT_BREAKER_LIMITS.max_total_agent_calls) {
      return {
        passed: false,
        reason: `Maximum agent calls exceeded (${state.agent_history.length} >= ${CIRCUIT_BREAKER_LIMITS.max_total_agent_calls})`,
      };
    }
    
    // Check max calls per agent
    const agentCallCounts = new Map<string, number>();
    for (const call of state.agent_history) {
      const count = agentCallCounts.get(call.agent) || 0;
      agentCallCounts.set(call.agent, count + 1);
    }
    for (const [agent, count] of agentCallCounts.entries()) {
      if (count >= CIRCUIT_BREAKER_LIMITS.max_calls_per_agent) {
        return {
          passed: false,
          reason: `Maximum calls per agent exceeded for '${agent}' (${count} >= ${CIRCUIT_BREAKER_LIMITS.max_calls_per_agent})`,
        };
      }
    }
    
    // Check execution time
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    if (elapsedSeconds >= CIRCUIT_BREAKER_LIMITS.max_execution_time_seconds) {
      return {
        passed: false,
        reason: `Maximum execution time exceeded (${elapsedSeconds.toFixed(2)}s >= ${CIRCUIT_BREAKER_LIMITS.max_execution_time_seconds}s)`,
      };
    }
    
    // Check state size
    const stateSizeMB = this.calculateStateSizeMB(state);
    if (stateSizeMB > CIRCUIT_BREAKER_LIMITS.max_state_size_mb) {
      return {
        passed: false,
        reason: `State size exceeded (${stateSizeMB.toFixed(2)}MB > ${CIRCUIT_BREAKER_LIMITS.max_state_size_mb}MB)`,
      };
    }
    
    return { passed: true };
  }
  
  /**
   * Validate agent inputs
   */
  private validateAgentInputs(
    agent: AgentRegistration,
    state: WorkflowState
  ): InputValidationResult {
    const missing: string[] = [];
    const invalid: string[] = [];
    
    // Check required inputs
    for (const required of agent.consumes.required) {
      if (!this.hasStateValue(state, required)) {
        missing.push(required);
      }
    }
    
    return {
      valid: missing.length === 0 && invalid.length === 0,
      missing,
      invalid,
    };
  }
  
  /**
   * Check if state has a value for a given key
   */
  private hasStateValue(state: WorkflowState, key: string): boolean {
    // Check direct properties
    if (key in state && state[key as keyof WorkflowState] !== undefined) {
      return true;
    }
    
    // Check nested properties (e.g., "route_data.distance_nm")
    const parts = key.split('.');
    let current: any = state;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return false;
      }
    }
    
    return current !== undefined && current !== null;
  }
  
  /**
   * Update state with agent result
   */
  private updateState(
    state: WorkflowState,
    result: any,
    agent: AgentRegistration
  ): WorkflowState {
    const updatedState = { ...state };
    
    // Direct property updates (check result object directly)
    if (result.route_data) {
      updatedState.route_data = result.route_data;
    }
    if (result.weather_data) {
      updatedState.weather_data = result.weather_data;
    }
    if (result.bunker_analysis) {
      updatedState.bunker_analysis = result.bunker_analysis;
    }
    if (result.cii_rating) {
      updatedState.cii_rating = result.cii_rating;
    }
    if (result.eu_ets_cost) {
      updatedState.eu_ets_cost = result.eu_ets_cost;
    }
    
    // Update based on what agent produces (fallback)
    for (const capability of agent.produces) {
      if (result[capability] && !(capability in updatedState)) {
        (updatedState as any)[capability] = result[capability];
      }
    }
    
    return updatedState;
  }
  
  /**
   * Evaluate decision point
   */
  private evaluateDecisionPoint(
    agentCall: AgentCall,
    state: WorkflowState
  ): DecisionPointResult {
    // Simplified decision logic
    // In a full implementation, this would evaluate conditions from the execution plan
    
    // Check if we have critical errors
    if (state.errors.length > 0 && state.errors.some(e => e.message.includes('critical'))) {
      return { action: 'stop', reason: 'Critical error encountered' };
    }
    
    // Default: continue
    return { action: 'continue' };
  }
  
  /**
   * Calculate state size in MB
   */
  private calculateStateSizeMB(state: WorkflowState): number {
    const jsonString = JSON.stringify(state);
    const sizeBytes = new Blob([jsonString]).size;
    return sizeBytes / (1024 * 1024);
  }
  
  /**
   * Create workflow result
   */
  private createResult(
    state: WorkflowState,
    status: WorkflowResult['status'],
    startTime: number,
    totalLLMCost: number,
    error?: Error
  ): WorkflowResult {
    const duration_ms = Date.now() - startTime;
    const successfulCalls = state.agent_history.filter(h => h.success).length;
    const failedCalls = state.agent_history.filter(h => !h.success).length;
    const totalDuration = state.agent_history.reduce((sum, h) => sum + h.duration_ms, 0);
    const averageDuration = state.agent_history.length > 0 
      ? totalDuration / state.agent_history.length 
      : 0;
    
    return {
      status,
      final_state: state,
      duration_ms,
      error,
      metrics: {
        total_agent_calls: state.agent_history.length,
        successful_calls: successfulCalls,
        failed_calls: failedCalls,
        average_call_duration_ms: averageDuration,
        total_llm_cost_usd: totalLLMCost > 0 ? totalLLMCost : undefined,
      },
    };
  }
  
  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// EXPORT DEFAULT INSTANCE
// ============================================================================

/**
 * Default workflow engine instance
 */
export const workflowEngine = new WorkflowEngineImpl();

