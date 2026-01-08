/**
 * Execution Plan Interfaces
 * 
 * Comprehensive TypeScript interfaces for execution plans in the multi-agent system.
 * Defines the structure for planning, execution, and validation.
 */

import type { AgentMetadata } from './agent-registry-v2';

// ============================================================================
// Core Execution Plan Interfaces
// ============================================================================

/**
 * Success criteria for validating agent execution
 */
export interface SuccessCriteria {
  /** State fields that MUST be populated for success */
  required_outputs: string[];
  /** Nice-to-have outputs (optional) */
  optional_outputs?: string[];
  /** Optional validation function name */
  validation_function?: string;
}

/**
 * Individual agent execution details within a stage
 */
export interface AgentExecution {
  /** Which agent to run */
  agent_id: string;
  /** Specific tools to use */
  assigned_tools: string[];
  /** What this agent should do */
  task_description: string;
  /** Execution priority (1 = highest) */
  priority: number;
  /** How many retries on failure */
  max_retries: number;
  /** How to validate success */
  success_criteria: SuccessCriteria;
}

/**
 * Execution stage containing agents that can run together
 */
export interface ExecutionStage {
  /** 1-indexed stage number */
  stage_number: number;
  /** Agents in this stage */
  agents: AgentExecution[];
  /** Can agents run in parallel? */
  can_run_parallel: boolean;
  /** Max time for this stage in milliseconds */
  timeout_ms: number;
  /** Optional human approval required */
  wait_for_approval?: boolean;
}

/**
 * Main execution plan structure
 */
export interface ExecutionPlan {
  /** Unique ID (format: "plan_1234567890_abc123") */
  plan_id: string;
  /** Original user query */
  query_intent: string;
  /** Timestamp when plan was created */
  created_at: number;
  /** Ordered stages */
  execution_stages: ExecutionStage[];
  /** Sum of stage times in milliseconds */
  estimated_total_time_ms: number;
  /** Estimated LLM + tool costs in USD */
  estimated_cost_usd: number;
  /** Agent IDs that must succeed */
  critical_path: string[];
  /** LLM's explanation of plan */
  reasoning: string;
}

// ============================================================================
// Result Interfaces
// ============================================================================

/**
 * Error details for execution failures
 */
export interface ExecutionError {
  /** Which agent failed */
  agent_id: string;
  /** Which stage */
  stage: number;
  /** Error message */
  error: string;
  /** Can we continue without this? */
  recoverable: boolean;
  /** When error occurred */
  timestamp: number;
}

/**
 * Execution outcome with status, timing, costs, and errors
 */
export interface ExecutionResult {
  /** Execution status */
  status: 'success' | 'partial_success' | 'failed' | 'rejected_by_user';
  /** Which plan was executed */
  plan_id: string;
  /** How many stages completed */
  stages_completed: number;
  /** Actual execution time in milliseconds */
  total_time_ms: number;
  /** Actual cost incurred in USD */
  total_cost_usd: number;
  /** Any errors encountered */
  errors: ExecutionError[];
  /** Non-fatal warnings */
  warnings: string[];
}

/**
 * Plan validation outcome
 */
export interface ValidationResult {
  /** Is plan valid? */
  valid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate an execution plan against agent registry
 * 
 * @param plan - The execution plan to validate
 * @param availableAgents - Available agents from registry
 * @returns Validation result with errors and warnings
 */
export function validateExecutionPlan(
  plan: ExecutionPlan,
  availableAgents: AgentMetadata[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Build agent map for quick lookup
  const agentMap = new Map<string, AgentMetadata>();
  for (const agent of availableAgents) {
    agentMap.set(agent.agent_id, agent);
  }

  // Track executed agents for dependency checking
  const executedAgents = new Set<string>();

  // Check all stages
  for (const stage of plan.execution_stages) {
    // Validate stage number
    if (stage.stage_number < 1) {
      errors.push(`Stage ${stage.stage_number} has invalid stage_number (must be >= 1)`);
    }

    // Check all agents in stage
    for (const agentExec of stage.agents) {
      // Check agent ID exists
      const agent = agentMap.get(agentExec.agent_id);
      if (!agent) {
        errors.push(`Agent ${agentExec.agent_id} not found in registry`);
        continue;
      }

      // Check all assigned tools are available
      for (const tool of agentExec.assigned_tools) {
        if (!agent.available_tools.includes(tool)) {
          errors.push(
            `Agent ${agentExec.agent_id} doesn't have tool ${tool}. ` +
            `Available: ${agent.available_tools.join(', ')}`
          );
        }
      }

      // Check prerequisites are satisfied
      for (const requiredState of agent.prerequisites.required_state) {
        // Check if this state is produced by an earlier agent
        let foundProducer = false;
        for (const executedAgentId of executedAgents) {
          const executedAgent = agentMap.get(executedAgentId);
          if (executedAgent) {
            if (
              executedAgent.produces.primary.includes(requiredState) ||
              executedAgent.produces.side_effects.includes(requiredState)
            ) {
              foundProducer = true;
              break;
            }
          }
        }

        if (!foundProducer) {
          warnings.push(
            `Agent ${agentExec.agent_id} requires state ${requiredState} but no earlier agent produces it`
          );
        }
      }

      // Check required agents have run
      for (const requiredAgent of agent.prerequisites.required_agents) {
        if (!executedAgents.has(requiredAgent)) {
          errors.push(
            `Agent ${agentExec.agent_id} depends on ${requiredAgent} which hasn't run yet`
          );
        }
      }

      // Check for circular dependencies (basic check)
      if (agent.prerequisites.required_agents.includes(agentExec.agent_id)) {
        errors.push(`Agent ${agentExec.agent_id} depends on itself (circular dependency)`);
      }
    }

    // Add this stage's agents to executed set
    stage.agents.forEach(a => executedAgents.add(a.agent_id));
  }

  // Check critical path agents exist
  for (const agentId of plan.critical_path) {
    if (!agentMap.has(agentId)) {
      warnings.push(`Critical path agent ${agentId} not found in registry`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Estimate plan cost based on agent execution
 * 
 * @param plan - The execution plan
 * @returns Estimated cost in USD
 */
export function estimatePlanCost(plan: ExecutionPlan): number {
  // Planning cost: $0.03-0.05 (LLM call for planning)
  const planningCost = 0.03;

  // Execution cost: ~$0.01 per agent for LLM calls
  // Most agents are deterministic, so minimal cost
  const agentCount = plan.execution_stages.reduce(
    (sum, stage) => sum + stage.agents.length,
    0
  );
  const executionCost = agentCount * 0.01;

  return planningCost + executionCost;
}

/**
 * Estimate plan execution time
 * Handles parallel stages correctly (takes max time for parallel, sum for sequential)
 * 
 * @param plan - The execution plan
 * @returns Estimated time in milliseconds
 */
export function estimatePlanTime(plan: ExecutionPlan): number {
  let totalTime = 0;

  for (const stage of plan.execution_stages) {
    if (stage.can_run_parallel && stage.agents.length > 1) {
      // Parallel: take longest agent time
      // Estimate 5000ms per agent as default
      const maxTime = Math.max(...stage.agents.map(() => 5000));
      totalTime += maxTime;
    } else {
      // Sequential: sum all agent times
      totalTime += stage.agents.length * 5000;
    }
  }

  return totalTime;
}

/**
 * Extract all agent IDs from plan
 * 
 * @param plan - The execution plan
 * @returns Array of unique agent IDs
 */
export function extractAllAgents(plan: ExecutionPlan): string[] {
  const agents: string[] = [];
  const seen = new Set<string>();

  for (const stage of plan.execution_stages) {
    for (const agentExec of stage.agents) {
      if (!seen.has(agentExec.agent_id)) {
        agents.push(agentExec.agent_id);
        seen.add(agentExec.agent_id);
      }
    }
  }

  return agents;
}

