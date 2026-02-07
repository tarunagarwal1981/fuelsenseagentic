/**
 * Agent Registry - FuelSense 360
 *
 * Production-grade central registry for agents with:
 * - Singleton pattern with lazy initialization
 * - Dynamic registration/deregistration
 * - Health check and availability tracking
 * - Capability-based routing and execution planning
 * - Axiom observability and circuit breaker integration
 */

import type {
  AgentRegistration,
  AgentRegistrationInput,
  AgentHandler,
  ExecutionContext,
  ExecutionPlan,
} from './types/AgentTypes';
import { logAgentExecution, logError } from '@/lib/monitoring/axiom-logger';
import { getCorrelationId } from '@/lib/monitoring/correlation-context';
import { isFeatureEnabled } from '@/lib/config/feature-flags';
import CircuitBreaker from 'opossum';
import { getCorrelationId as getCid } from '@/lib/monitoring/correlation-context';
import { logError as logErr } from '@/lib/monitoring/axiom-logger';

// ============================================================================
// Intent to Capability Mapping
// ============================================================================

const INTENT_CAPABILITY_MAP: Record<string, string[]> = {
  bunker_planning: ['route_calculation', 'weather_forecast', 'bunker_analysis'],
  voyage_optimization: ['route_calculation', 'weather_forecast', 'bunker_analysis'],
  emissions_calc: ['route_calculation', 'compliance_check', 'emissions_data'],
  performance_analysis: ['route_calculation', 'consumption_profile', 'performance_metrics'],
  compliance_check: ['route_calculation', 'eca_validation', 'compliance_data'],
  route_calculation: ['route_calculation'],
  weather_analysis: ['weather_forecast', 'weather_consumption'],
  entity_extraction: ['entity_extraction'],
};

// ============================================================================
// Default Metadata
// ============================================================================

function createDefaultMetadata(): AgentRegistration['metadata'] {
  return {
    avgExecutionTime: 0,
    successRate: 1,
    lastHealthCheck: 0,
    totalExecutions: 0,
    successfulExecutions: 0,
  };
}

// ============================================================================
// Agent Registry
// ============================================================================

export class AgentRegistry {
  private static instance: AgentRegistry | null = null;
  private agents: Map<string, AgentRegistration> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private initialized = false;

  private constructor() {}

  /**
   * Get singleton instance (lazy initialization)
   */
  static getInstance(): AgentRegistry {
    if (AgentRegistry.instance === null) {
      AgentRegistry.instance = new AgentRegistry();
    }
    return AgentRegistry.instance;
  }

  /**
   * Reset singleton (for testing)
   */
  static resetInstance(): void {
    if (AgentRegistry.instance) {
      AgentRegistry.instance.agents.clear();
      AgentRegistry.instance.circuitBreakers.clear();
      AgentRegistry.instance.initialized = false;
      AgentRegistry.instance = null;
    }
  }

  /**
   * Register an agent
   */
  registerAgent(config: AgentRegistrationInput): void {
    const metadata = {
      ...createDefaultMetadata(),
      ...config.metadata,
    };

    const registration: AgentRegistration = {
      ...config,
      metadata,
    };

    // Feature flag check
    if (config.featureFlag && !isFeatureEnabled(config.featureFlag)) {
      console.warn(
        `⚠️ [AGENT-REGISTRY] Agent ${config.id} disabled by feature flag: ${config.featureFlag}`
      );
      registration.status = 'inactive';
    }

    this.agents.set(config.id, registration);

    // Log to Axiom
    const cid = getCorrelationId() || 'system';
    logAgentExecution('agent_registry', cid, 0, 'registered', {
      agent_id: config.id,
      agent_name: config.name,
      version: config.version,
      capabilities: config.capabilities,
      priority: config.priority,
      status: registration.status,
    });

    console.log(
      `✅ [AGENT-REGISTRY] Registered: ${config.id} (${config.name}) v${config.version}`
    );
  }

  /**
   * Deregister an agent
   */
  deregisterAgent(id: string): boolean {
    const removed = this.agents.delete(id);
    this.circuitBreakers.delete(id);
    if (removed) {
      console.log(`🗑️ [AGENT-REGISTRY] Deregistered: ${id}`);
    }
    return removed;
  }

  /**
   * Get agent by ID
   */
  getAgent(id: string): AgentRegistration | null {
    return this.agents.get(id) ?? null;
  }

  /**
   * Get agents by capability
   */
  getAgentsByCapability(capability: string): AgentRegistration[] {
    return Array.from(this.agents.values()).filter(
      (a) => a.status === 'active' && a.capabilities.includes(capability)
    );
  }

  /**
   * Execute an agent with context
   */
  async executeAgent(
    id: string,
    input: unknown,
    context: ExecutionContext
  ): Promise<unknown> {
    const agent = this.getAgent(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }
    if (agent.status !== 'active') {
      throw new Error(`Agent ${id} is not active (status: ${agent.status})`);
    }

    const cid = context.correlationId || getCorrelationId() || 'unknown';
    const start = Date.now();

    try {
      const result = await agent.handler(input, context);

      // Update metrics
      const duration = Date.now() - start;
      this.updateMetrics(id, duration, true);

      logAgentExecution(id, cid, duration, 'success', {
        agent_id: id,
        duration_ms: duration,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.updateMetrics(id, duration, false);

      logError(cid, error, {
        agent_id: id,
        duration_ms: duration,
        execution: 'failed',
      });

      throw error;
    }
  }

  /**
   * Health check for an agent
   */
  async healthCheck(id: string): Promise<boolean> {
    const agent = this.getAgent(id);
    if (!agent) return false;
    if (agent.status !== 'active') return false;

    const now = Date.now();
    agent.metadata.lastHealthCheck = now;

    // Simple health: agent exists and is active
    // For deeper checks, the handler could expose a health method
    return true;
  }

  /**
   * Get execution plan for an intent (ordered agent chain)
   */
  getExecutionPlan(intent: string): ExecutionPlan {
    const capabilities = INTENT_CAPABILITY_MAP[intent] ?? [intent];
    const neededCapabilities = new Set(capabilities);

    const plan: AgentRegistration[] = [];
    const added = new Set<string>();

    // Topological sort by dependencies and priority
    const allAgents = Array.from(this.agents.values()).filter(
      (a) => a.status === 'active'
    );

    // Build dependency graph
    const getDeps = (a: AgentRegistration) => a.dependencies;
    const visit = (agent: AgentRegistration) => {
      if (added.has(agent.id)) return;
      for (const depId of getDeps(agent)) {
        const dep = this.getAgent(depId);
        if (dep && !added.has(depId)) {
          visit(dep);
        }
      }
      const hasNeededCapability = agent.capabilities.some((c) =>
        neededCapabilities.has(c)
      );
      if (hasNeededCapability) {
        plan.push(agent);
        added.add(agent.id);
      }
    };

    // Sort by priority, then visit
    const sorted = [...allAgents].sort((a, b) => a.priority - b.priority);
    for (const agent of sorted) {
      visit(agent);
    }

    // Deduplicate while preserving order
    const seen = new Set<string>();
    return plan.filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
  }

  /**
   * Get execution plan as LangGraph node names for supervisor routing.
   * Returns ordered array of graph node names (e.g., ['route_agent', 'weather_agent', 'bunker_agent']).
   * Always appends 'finalize' for synthesis.
   */
  getExecutionPlanAsNodeNames(intent: string): string[] {
    const plan = this.getExecutionPlan(intent);
    const nodeNames = plan
      .map((a) => a.graphNodeName)
      .filter((n): n is string => !!n);
    // Always end with finalize for synthesis
    if (nodeNames.length > 0 && !nodeNames.includes('finalize')) {
      nodeNames.push('finalize');
    }
    return nodeNames;
  }

  /**
   * Register circuit breaker for an agent (optional resilience layer)
   */
  registerCircuitBreaker(
    id: string,
    executor: (input: unknown) => Promise<unknown>,
    options?: { timeout?: number }
  ): void {
    const opts = {
      timeout: options?.timeout ?? 30_000,
      errorThresholdPercentage: 50,
      resetTimeout: 30_000,
    };
    const breaker = new CircuitBreaker(executor as (input: any) => Promise<any>, opts);
    breaker.fallback(() => ({ error: `Agent ${id} unavailable. Circuit open.` }));
    breaker.on('open', () => {
      logErr(getCid() || 'system', new Error(`[CIRCUIT] agent_${id}: opened`), {
        agent_id: id,
        circuit_event: 'open',
      });
    });
    this.circuitBreakers.set(id, breaker);
  }

  /**
   * Get all registered agent IDs
   */
  getAllAgentIds(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Get registry health status
   */
  getHealthStatus(): Record<
    string,
    { status: AgentRegistration['status']; lastHealthCheck: number }
  > {
    const status: Record<
      string,
      { status: AgentRegistration['status']; lastHealthCheck: number }
    > = {};
    for (const [id, agent] of this.agents) {
      status[id] = {
        status: agent.status,
        lastHealthCheck: agent.metadata.lastHealthCheck,
      };
    }
    return status;
  }

  /**
   * Get circuit breaker status for observability
   */
  getCircuitBreakerStatus(): Record<
    string,
    { state: string; failures: number }
  > {
    const status: Record<string, { state: string; failures: number }> = {};
    for (const [id, b] of this.circuitBreakers) {
      const state = (b as any).opened ? 'OPEN' : (b as any).halfOpen ? 'HALF_OPEN' : 'CLOSED';
      status[id] = {
        state,
        failures: (b.stats as any)?.failures ?? 0,
      };
    }
    return status;
  }

  /**
   * Initialize registry (load from config)
   */
  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    console.log('🔧 [AGENT-REGISTRY] Initialized');
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private updateMetrics(id: string, durationMs: number, success: boolean): void {
    const agent = this.agents.get(id);
    if (!agent) return;

    const m = agent.metadata;
    m.totalExecutions = (m.totalExecutions ?? 0) + 1;
    if (success) {
      m.successfulExecutions = (m.successfulExecutions ?? 0) + 1;
    }
    m.successRate =
      (m.successfulExecutions ?? 0) / (m.totalExecutions ?? 1);
    m.avgExecutionTime =
      (m.avgExecutionTime * ((m.totalExecutions ?? 1) - 1) + durationMs) /
      (m.totalExecutions ?? 1);
  }
}
