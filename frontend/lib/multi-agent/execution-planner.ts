/**
 * Execution Planner
 * 
 * LLM-based execution planner that generates optimal execution plans for the multi-agent system.
 * Uses LLM to analyze queries, current state, and agent capabilities to create staged execution plans.
 */

import { LLMFactory } from './llm-factory';
import { AgentRegistryV2, type AgentMetadata } from './agent-registry-v2';
import type {
  ExecutionPlan,
  ExecutionStage,
  AgentExecution,
  ValidationResult,
} from './execution-plan';
import { validateExecutionPlan } from './execution-plan';
import type { MultiAgentState } from './state';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

// ============================================================================
// Cache Interface
// ============================================================================

interface CachedPlan {
  plan: ExecutionPlan;
  timestamp: number;
}

// ============================================================================
// Execution Planner Class
// ============================================================================

/**
 * LLM-based execution planner for multi-agent orchestration
 * 
 * Generates optimal execution plans by:
 * 1. Analyzing user query and current state
 * 2. Building dependency graph from agent metadata
 * 3. Using LLM to create staged execution plan
 * 4. Validating plan against registry
 * 5. Caching plans for performance
 */
export class ExecutionPlanner {
  private llm: BaseChatModel;
  private planCache: Map<string, CachedPlan>;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 100;

  /**
   * Initialize ExecutionPlanner
   * Sets up LLM with temperature 0.1 for consistent planning
   */
  constructor() {
    // Initialize LLM using factory
    this.llm = LLMFactory.getLLMForTask('supervisor_planning');

    // Set temperature to 0.1 if not already configured
    // LLMFactory returns LLM with temperature 0, so we need to set it to 0.1
    if ((this.llm as any).temperature === undefined || (this.llm as any).temperature !== 0.1) {
      (this.llm as any).temperature = 0.1;
      console.log('⚙️ [PLANNER] Set LLM temperature to 0.1');
    }

    // Initialize cache
    this.planCache = new Map();

    console.log('✅ [PLANNER] Initialized with LLM from factory');
  }

  /**
   * Generate optimal execution plan for query
   * Main entry point - checks cache, generates plan, validates
   * 
   * @param userQuery - User's query
   * @param currentState - Current multi-agent state
   * @returns Execution plan with staged agent execution
   */
  async generatePlan(
    userQuery: string,
    currentState: MultiAgentState
  ): Promise<ExecutionPlan> {
    console.log('📋 [PLANNER] Generating execution plan for:', userQuery);

    // Check cache first
    const cacheKey = this.getCacheKey(userQuery, currentState);
    const cached = this.planCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log('✅ [PLANNER] Using cached plan');
      return cached.plan;
    }

    // Clean cache periodically
    this.cleanCache();

    try {
      // Get agents and build context
      const agents = AgentRegistryV2.getAllAgents();
      const dependencyGraph = AgentRegistryV2.buildDependencyGraph();
      const stateSummary = this.summarizeState(currentState);

      // Build system prompt
      const systemPrompt = this.buildSystemPrompt(agents, dependencyGraph, stateSummary);

      // Call LLM with retry logic
      let plan: ExecutionPlan | null = null;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await this.llm.invoke([
            new SystemMessage(systemPrompt),
            new HumanMessage(`User Query: "${userQuery}"\n\nGenerate execution plan as JSON.`),
          ]);

          // Parse response
          const content =
            typeof response.content === 'string'
              ? response.content
              : JSON.stringify(response.content);

          // Remove markdown code blocks if present
          const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

          // Parse JSON
          const parsed = JSON.parse(cleanedContent);

          // Add metadata
          plan = {
            ...parsed,
            plan_id: this.generatePlanId(),
            query_intent: userQuery,
            created_at: Date.now(),
          };

          // Validate plan
          this.validatePlan(plan, agents);

          console.log('✅ [PLANNER] Plan generated successfully:', {
            stages: plan.execution_stages.length,
            agents: plan.critical_path,
            estimated_time: plan.estimated_total_time_ms,
          });

          break; // Success!
        } catch (error: any) {
          lastError = error;
          console.warn(`⚠️ [PLANNER] Attempt ${attempt + 1} failed:`, error.message);

          if (attempt < 1) {
            // Wait before retry (exponential backoff)
            await this.wait(Math.pow(2, attempt) * 1000);
          }
        }
      }

      // If all retries failed, use fallback
      if (!plan) {
        console.error('❌ [PLANNER] All attempts failed, using fallback plan');
        plan = this.generateFallbackPlan(userQuery, currentState);
      }

      // Cache the plan
      this.planCache.set(cacheKey, {
        plan,
        timestamp: Date.now(),
      });

      return plan;
    } catch (error: any) {
      console.error('❌ [PLANNER] Fatal error:', error);
      return this.generateFallbackPlan(userQuery, currentState);
    }
  }

  /**
   * Generate cache key from query and state
   * 
   * @param query - User query
   * @param state - Current state
   * @returns Cache key string
   */
  private getCacheKey(query: string, state: MultiAgentState): string {
    // Normalize query
    const normalized = query.toLowerCase().trim();

    // State signature: what data already exists
    const stateSig = [
      state.route_data ? 'R' : '',
      state.weather_forecast ? 'W' : '',
      state.weather_consumption ? 'WC' : '',
      state.bunker_ports ? 'B' : '',
      state.bunker_analysis ? 'BA' : '',
    ].join('');

    return `${normalized}_${stateSig}`;
  }

  /**
   * Summarize current state for LLM prompt
   * 
   * @param state - Current multi-agent state
   * @returns Object with boolean flags for available data
   */
  private summarizeState(state: MultiAgentState): object {
    return {
      has_route_data: !!state.route_data,
      has_vessel_timeline: !!state.vessel_timeline,
      has_weather_forecast: !!state.weather_forecast,
      has_weather_consumption: !!state.weather_consumption,
      has_bunker_ports: !!state.bunker_ports,
      has_port_prices: !!state.port_prices,
      has_bunker_analysis: !!state.bunker_analysis,
      has_port_weather_status: !!state.port_weather_status,
    };
  }

  /**
   * Build comprehensive system prompt for LLM
   * 
   * @param agents - Available agents
   * @param dependencies - Dependency graph
   * @param stateSummary - Current state summary
   * @returns System prompt string
   */
  private buildSystemPrompt(
    agents: AgentMetadata[],
    dependencies: Map<string, string[]>,
    stateSummary: object
  ): string {
    const dependencyObj = Object.fromEntries(dependencies);

    return `You are an expert execution planner for a multi-agent maritime fuel management system.

CRITICAL RULES FOR PLANNING:

1. PREREQUISITES: Agents can ONLY run if their prerequisites are met
   - Check prerequisites.required_state: these state fields must exist
   - Check prerequisites.required_agents: these agents must have run first
   
2. STATE OPTIMIZATION: Don't re-run agents if data already exists
   - If state has route_data, don't need route_agent again (unless query needs refresh)
   - If state has weather_forecast, don't need weather_agent again
   - If state has bunker_analysis, don't need bunker_agent again
   
3. PARALLELIZATION: Agents can run in parallel ONLY if:
   - Both have can_run_in_parallel: true
   - Neither depends on the other (check dependencies)
   - They don't modify the same state fields
   
4. TOOL ASSIGNMENT: Assign specific tools based on what's needed
   - Don't assign all tools, only what's needed for this query
   - Check tool availability in agent's available_tools
   - Required tools must always be assigned

QUERY CLASSIFICATION GUIDE:

Simple Queries (1-2 agents):
- "distance from X to Y" → route_agent only
- "how far is X to Y" → route_agent only
- "weather forecast X to Y" → route_agent + weather_agent
- "what are the weather conditions" → route_agent + weather_agent

Medium Queries (2-3 agents):
- "fuel consumption X to Y" → route_agent + weather_agent (with consumption)
- "how much fuel needed" → route_agent + weather_agent (with consumption)
- "find bunker port" → route_agent + weather_agent + bunker_agent
- "cheapest bunker" → route_agent + weather_agent + bunker_agent

Complex Queries (3+ agents, may need parallel):
- "optimize bunker with weather safety" → route + weather + bunker (weather used twice)
- "bunker plan with ECA compliance" → route + weather + bunker + compliance (parallel: weather+compliance)

PARALLELIZATION EXAMPLES:

✅ CAN run parallel:
- weather_agent + eu_ets_agent (different domains, both need route_data)
- bunker_agent + hull_performance_agent (different domains)

❌ CANNOT run parallel:
- route_agent + weather_agent (weather depends on route's vessel_timeline)
- route_agent + bunker_agent (bunker depends on route's route_data)
- weather_agent + bunker_agent (bunker may need weather's consumption data)

OUTPUT FORMAT:
Return ONLY valid JSON with this exact structure (no markdown, no comments):

{
  "execution_stages": [
    {
      "stage_number": 1,
      "agents": [
        {
          "agent_id": "route_agent",
          "assigned_tools": ["calculate_route", "calculate_weather_timeline"],
          "task_description": "Calculate route from Singapore to Rotterdam",
          "priority": 1,
          "max_retries": 2,
          "success_criteria": {
            "required_outputs": ["route_data", "vessel_timeline"]
          }
        }
      ],
      "can_run_parallel": false,
      "timeout_ms": 10000
    }
  ],
  "estimated_total_time_ms": 45000,
  "estimated_cost_usd": 0.05,
  "critical_path": ["route_agent", "weather_agent", "bunker_agent"],
  "reasoning": "Route must run first to generate vessel timeline, then weather to calculate consumption, then bunker to find optimal ports"
}

CURRENT CONTEXT:

Available Agents:
${JSON.stringify(agents, null, 2)}

Agent Dependencies:
${JSON.stringify(dependencyObj, null, 2)}

Current State Summary:
${JSON.stringify(stateSummary, null, 2)}

Generate the optimal execution plan based on the user's query.`;
  }

  /**
   * Validate generated plan
   * 
   * @param plan - Plan to validate
   * @param agents - Available agents
   * @throws Error if plan is invalid
   */
  private validatePlan(plan: ExecutionPlan, agents: AgentMetadata[]): void {
    const validationResult = validateExecutionPlan(plan, agents);

    if (!validationResult.valid) {
      throw new Error(
        `Plan validation failed:\n${validationResult.errors.join('\n')}`
      );
    }

    if (validationResult.warnings.length > 0) {
      console.warn('⚠️ [PLANNER] Plan validation warnings:', validationResult.warnings);
    }
  }

  /**
   * Generate fallback linear plan
   * Simple 3-stage plan: route → weather → bunker
   * Note: Finalize is NOT included - it runs automatically after execution
   * 
   * @param query - User query
   * @param state - Current state
   * @returns Fallback execution plan
   */
  private generateFallbackPlan(
    query: string,
    state: MultiAgentState
  ): ExecutionPlan {
    console.log('🔄 [PLANNER] Generating fallback linear plan');

    return {
      plan_id: this.generatePlanId(),
      query_intent: query,
      created_at: Date.now(),
      execution_stages: [
        {
          stage_number: 1,
          agents: [
            {
              agent_id: 'route_agent',
              assigned_tools: ['calculate_route', 'calculate_weather_timeline'],
              task_description: 'Calculate route and vessel timeline',
              priority: 1,
              max_retries: 2,
              success_criteria: {
                required_outputs: ['route_data', 'vessel_timeline'],
              },
            },
          ],
          can_run_parallel: false,
          timeout_ms: 10000,
        },
        {
          stage_number: 2,
          agents: [
            {
              agent_id: 'weather_agent',
              assigned_tools: ['fetch_marine_weather', 'calculate_weather_consumption'],
              task_description: 'Fetch weather and calculate consumption',
              priority: 1,
              max_retries: 2,
              success_criteria: {
                required_outputs: ['weather_forecast', 'weather_consumption'],
              },
            },
          ],
          can_run_parallel: false,
          timeout_ms: 15000,
        },
        {
          stage_number: 3,
          agents: [
            {
              agent_id: 'bunker_agent',
              assigned_tools: ['find_bunker_ports', 'get_fuel_prices', 'analyze_bunker_options'],
              task_description: 'Find and analyze bunker options',
              priority: 1,
              max_retries: 2,
              success_criteria: {
                required_outputs: ['bunker_analysis'],
              },
            },
          ],
          can_run_parallel: false,
          timeout_ms: 20000,
        },
      ],
      estimated_total_time_ms: 45000,
      estimated_cost_usd: 0.04,
      critical_path: ['route_agent', 'weather_agent', 'bunker_agent'],
      reasoning: 'Fallback linear plan: route → weather → bunker',
    };
  }

  /**
   * Generate unique plan ID
   * 
   * @returns Unique plan ID (format: "plan_1234567890_abc123")
   */
  private generatePlanId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `plan_${timestamp}_${random}`;
  }

  /**
   * Clean expired cache entries
   */
  private cleanCache(): void {
    const now = Date.now();

    // Remove expired entries
    for (const [key, cached] of this.planCache.entries()) {
      if (now - cached.timestamp > this.CACHE_TTL) {
        this.planCache.delete(key);
      }
    }

    // Remove oldest if too large
    if (this.planCache.size > this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.planCache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      );

      const toRemove = entries.slice(0, this.planCache.size - this.MAX_CACHE_SIZE);

      for (const [key] of toRemove) {
        this.planCache.delete(key);
      }
    }
  }

  /**
   * Wait helper for retry delays
   * 
   * @param ms - Milliseconds to wait
   * @returns Promise that resolves after delay
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

