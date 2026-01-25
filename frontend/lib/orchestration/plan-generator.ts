/**
 * Execution Plan Generator
 *
 * Generates complete execution plans from user queries using a single LLM call.
 * Reduces LLM calls from 5+ per query to just 2 (plan + finalize).
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { randomUUID } from 'crypto';
import type {
  ExecutionPlan,
  PlanStage,
  QueryClassification,
  QueryType,
  PlanEstimates,
  PlanValidation,
  ExecutionContext,
  PlanGenerationOptions,
} from '@/lib/types/execution-plan';
import { AgentRegistry } from '@/lib/registry/agent-registry';
import { ToolRegistry } from '@/lib/registry/tool-registry';
import { getConfigManager } from '@/lib/config/config-manager';
import type { MultiAgentState } from '@/lib/multi-agent/state';

// ============================================================================
// Plan Cache
// ============================================================================

interface CachedPlan {
  plan: ExecutionPlan;
  timestamp: number;
}

const planCache = new Map<string, CachedPlan>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100;

function getCacheKey(query: string, stateSignature: string): string {
  return `${query.substring(0, 100)}_${stateSignature}`;
}

function getStateSignature(state: Partial<MultiAgentState>): string {
  return [
    state.route_data ? 'R' : '',
    state.vessel_timeline ? 'VT' : '',
    state.weather_forecast ? 'W' : '',
    state.weather_consumption ? 'WC' : '',
    state.compliance_data ? 'C' : '',
    state.bunker_ports ? 'BP' : '',
    state.port_prices ? 'PP' : '',
    state.bunker_analysis ? 'BA' : '',
  ].join('');
}

function cleanCache(): void {
  const now = Date.now();
  for (const [key, cached] of planCache.entries()) {
    if (now - cached.timestamp > CACHE_TTL) {
      planCache.delete(key);
    }
  }
  if (planCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(planCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, planCache.size - MAX_CACHE_SIZE);
    for (const [key] of toRemove) {
      planCache.delete(key);
    }
  }
}

// ============================================================================
// Workflow Templates
// ============================================================================

interface WorkflowTemplate {
  id: string;
  name: string;
  queryTypes: QueryType[];
  stages: Array<{
    agentId: string;
    order: number;
    required: boolean;
    canRunInParallel: boolean;
    parallelGroup?: number;
  }>;
  maxDurationMs: number;
}

const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'bunker_planning',
    name: 'Bunker Planning Workflow',
    queryTypes: ['bunker_planning', 'cost_analysis'],
    stages: [
      { agentId: 'route_agent', order: 1, required: true, canRunInParallel: false },
      { agentId: 'compliance_agent', order: 2, required: false, canRunInParallel: true, parallelGroup: 1 },
      { agentId: 'weather_agent', order: 2, required: false, canRunInParallel: true, parallelGroup: 1 },
      { agentId: 'bunker_agent', order: 3, required: true, canRunInParallel: false },
      { agentId: 'finalize', order: 4, required: true, canRunInParallel: false },
    ],
    maxDurationMs: 120000,
  },
  {
    id: 'route_only',
    name: 'Route Calculation',
    queryTypes: ['route_calculation'],
    stages: [
      { agentId: 'route_agent', order: 1, required: true, canRunInParallel: false },
      { agentId: 'finalize', order: 2, required: true, canRunInParallel: false },
    ],
    maxDurationMs: 60000,
  },
  {
    id: 'weather_analysis',
    name: 'Weather Analysis',
    queryTypes: ['weather_analysis'],
    stages: [
      { agentId: 'route_agent', order: 1, required: true, canRunInParallel: false },
      { agentId: 'weather_agent', order: 2, required: true, canRunInParallel: false },
      { agentId: 'finalize', order: 3, required: true, canRunInParallel: false },
    ],
    maxDurationMs: 90000,
  },
  {
    id: 'compliance_check',
    name: 'Compliance Check',
    queryTypes: ['compliance', 'cii_rating', 'eu_ets'],
    stages: [
      { agentId: 'route_agent', order: 1, required: true, canRunInParallel: false },
      { agentId: 'compliance_agent', order: 2, required: true, canRunInParallel: false },
      { agentId: 'finalize', order: 3, required: true, canRunInParallel: false },
    ],
    maxDurationMs: 90000,
  },
];

// ============================================================================
// Plan Generator Class
// ============================================================================

export class ExecutionPlanGenerator {
  private model: ChatAnthropic;

  constructor() {
    this.model = new ChatAnthropic({
      modelName: 'claude-sonnet-4-5',
      temperature: 0.1,
      maxTokens: 2000,
    });
  }

  /**
   * Generate execution plan from user query and initial state
   * Uses a SINGLE LLM call for query classification and plan generation
   */
  async generatePlan(
    userQuery: string,
    initialState: Partial<MultiAgentState>,
    options: PlanGenerationOptions = {}
  ): Promise<ExecutionPlan> {
    const startTime = Date.now();

    // Check cache first
    if (!options.forceRegenerate) {
      const cacheKey = getCacheKey(userQuery, getStateSignature(initialState));
      const cached = planCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log('📋 [PLAN-GENERATOR] Using cached execution plan');
        return cached.plan;
      }
    }

    cleanCache();

    console.log('🎯 [PLAN-GENERATOR] Generating execution plan...');

    // Step 1: Classify query and generate plan in single LLM call
    const { classification, workflowId } = await this.classifyAndSelectWorkflow(
      userQuery,
      initialState
    );

    // Step 2: Get workflow template
    const workflow = WORKFLOW_TEMPLATES.find((w) => w.id === workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Step 3: Build plan stages
    const stages = await this.buildPlanStages(workflow, initialState, options);

    // Step 4: Validate plan
    const validation = this.validatePlan(stages, initialState);

    // Step 5: Compute estimates
    const estimates = this.computeEstimates(stages);

    // Step 6: Build execution context
    const context: ExecutionContext = {
      ...options.contextOverrides,
      correlationId: (initialState as any).correlation_id || randomUUID(),
      priority: options.contextOverrides?.priority || 'normal',
      timeout: workflow.maxDurationMs,
    };

    // Step 7: Create plan
    const plan: ExecutionPlan = {
      planId: randomUUID(),
      queryType: classification.queryType,
      createdAt: new Date(),
      workflowId: workflow.id,
      workflowVersion: '1.0.0',
      stages,
      validation,
      estimates,
      requiredState: this.computeRequiredState(stages),
      expectedOutputs: this.computeExpectedOutputs(stages),
      context,
      originalQuery: userQuery,
      classification,
      parallelGroups: this.extractParallelGroups(stages),
    };

    // Cache the plan
    const cacheKey = getCacheKey(userQuery, getStateSignature(initialState));
    planCache.set(cacheKey, { plan, timestamp: Date.now() });

    const duration = Date.now() - startTime;
    console.log(`✅ [PLAN-GENERATOR] Plan generated in ${duration}ms`);
    console.log(`   Workflow: ${plan.workflowId}`);
    console.log(`   Stages: ${plan.stages.length}`);
    console.log(`   Est. cost: $${plan.estimates.estimatedCostUSD.toFixed(4)}`);
    console.log(`   Est. duration: ${plan.estimates.estimatedDurationMs}ms`);

    return plan;
  }

  /**
   * Classify query and select workflow in a SINGLE LLM call
   */
  private async classifyAndSelectWorkflow(
    userQuery: string,
    state: Partial<MultiAgentState>
  ): Promise<{ classification: QueryClassification; workflowId: string }> {
    // Analyze current state
    const stateAnalysis = {
      hasRouteData: !!state.route_data,
      hasVesselTimeline: !!state.vessel_timeline,
      hasWeatherForecast: !!state.weather_forecast,
      hasWeatherConsumption: !!state.weather_consumption,
      hasComplianceData: !!state.compliance_data,
      hasBunkerPorts: !!state.bunker_ports,
      hasPortPrices: !!state.port_prices,
      hasBunkerAnalysis: !!state.bunker_analysis,
    };

    const systemPrompt = `You are a query classifier for a maritime fuel management system.

Classify the query and select the appropriate workflow.

QUERY TYPES:
- bunker_planning: Planning fuel bunkering, finding bunker ports, fuel costs
- route_calculation: Distance, duration, route between ports
- weather_analysis: Weather forecasts, sea conditions, weather impact
- cii_rating: Carbon Intensity Indicator calculations
- eu_ets: EU Emissions Trading System compliance
- compliance: General regulatory compliance (ECA zones, emissions)
- cost_analysis: Cost optimization, savings analysis
- general_inquiry: Other maritime questions

WORKFLOWS:
- bunker_planning: Full bunker optimization (route → compliance/weather → bunker → finalize)
- route_only: Simple route calculation (route → finalize)
- weather_analysis: Weather impact analysis (route → weather → finalize)
- compliance_check: Compliance validation (route → compliance → finalize)

CURRENT STATE:
${JSON.stringify(stateAnalysis, null, 2)}

RULES:
1. If bunker/fuel/refuel mentioned → bunker_planning workflow
2. If only distance/route/how far mentioned → route_only workflow
3. If weather/conditions mentioned without bunker → weather_analysis workflow
4. If ECA/emissions/compliance mentioned → compliance_check workflow
5. Extract entities: origin, destination, vessel, fuel types, quantities, dates

Return JSON:
{
  "queryType": "bunker_planning",
  "confidence": 0.95,
  "reasoning": "Query mentions bunker planning and fuel costs",
  "workflowId": "bunker_planning",
  "extractedEntities": {
    "origin": "Singapore",
    "destination": "Rotterdam",
    "fuelTypes": ["VLSFO"],
    "fuelQuantity": 500
  }
}`;

    try {
      const response = await this.model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(`Query: "${userQuery}"`),
      ]);

      const content =
        typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON in classification response');
      }

      const result = JSON.parse(jsonMatch[0]);

      const classification: QueryClassification = {
        queryType: result.queryType || 'bunker_planning',
        confidence: result.confidence || 0.8,
        reasoning: result.reasoning || 'Default classification',
        secondaryIntents: result.secondaryIntents,
        extractedEntities: result.extractedEntities,
      };

      return {
        classification,
        workflowId: result.workflowId || 'bunker_planning',
      };
    } catch (error) {
      console.error('❌ [PLAN-GENERATOR] Classification failed:', error);
      // Default to bunker planning
      return {
        classification: {
          queryType: 'bunker_planning',
          confidence: 0.5,
          reasoning: 'Default fallback due to classification error',
        },
        workflowId: 'bunker_planning',
      };
    }
  }

  /**
   * Build plan stages from workflow template
   */
  private async buildPlanStages(
    workflow: WorkflowTemplate,
    state: Partial<MultiAgentState>,
    options: PlanGenerationOptions
  ): Promise<PlanStage[]> {
    const stages: PlanStage[] = [];
    const agentRegistry = AgentRegistry.getInstance();
    const toolRegistry = ToolRegistry.getInstance();

    for (const templateStage of workflow.stages) {
      // Check if agent should be excluded
      if (options.excludeAgents?.includes(templateStage.agentId)) {
        continue;
      }

      // Get agent from registry
      const agent = agentRegistry.getById(templateStage.agentId);
      if (!agent) {
        console.warn(`⚠️ [PLAN-GENERATOR] Agent ${templateStage.agentId} not found in registry`);
        continue;
      }

      // Check if agent is enabled
      if (!agent.enabled) {
        console.warn(`⚠️ [PLAN-GENERATOR] Agent ${templateStage.agentId} is disabled`);
        continue;
      }

      // Get tools for this agent
      const toolsNeeded = [
        ...agent.tools.required,
        ...(options.includeOptionalAgents ? agent.tools.optional : []),
      ];

      // Compute dependencies
      const dependsOn = this.computeStageDependencies(agent, stages);

      // Build stage
      const stage: PlanStage = {
        stageId: `${templateStage.agentId}_stage`,
        order: templateStage.order,
        agentId: agent.id,
        agentName: agent.name,
        agentType: agent.type,
        required: templateStage.required,
        canRunInParallel: templateStage.canRunInParallel && (options.enableParallelExecution !== false),
        parallelGroup: templateStage.parallelGroup,
        dependsOn,
        provides: agent.produces?.stateFields || [],
        requires: agent.consumes?.required || [],
        toolsNeeded,
        estimatedDurationMs: this.estimateAgentDuration(agent),
        estimatedCost: this.estimateAgentCost(agent, toolsNeeded, toolRegistry),
        agentContext: {},
        taskDescription: `Execute ${agent.name}`,
        priority: templateStage.required ? 'critical' : 'important',
      };

      // Add skip conditions based on existing state
      stage.skipConditions = this.computeSkipConditions(agent, state);

      stages.push(stage);
    }

    return stages;
  }

  /**
   * Compute dependencies for a stage based on agent requirements
   */
  private computeStageDependencies(
    agent: any,
    existingStages: PlanStage[]
  ): string[] {
    const dependencies: string[] = [];

    // Find stages that produce what this agent needs
    for (const requiredField of agent.consumes?.required || []) {
      const producingStage = existingStages.find((stage) =>
        stage.provides.includes(requiredField)
      );
      if (producingStage && !dependencies.includes(producingStage.stageId)) {
        dependencies.push(producingStage.stageId);
      }
    }

    return dependencies;
  }

  /**
   * Compute skip conditions based on existing state
   */
  private computeSkipConditions(
    agent: any,
    state: Partial<MultiAgentState>
  ): PlanStage['skipConditions'] | undefined {
    const stateChecks: Record<string, any> = {};

    // Skip if all outputs already exist
    for (const field of agent.produces?.stateFields || []) {
      if ((state as any)[field]) {
        stateChecks[field] = { exists: true };
      }
    }

    if (Object.keys(stateChecks).length > 0) {
      return { stateChecks };
    }

    return undefined;
  }

  /**
   * Estimate agent execution duration
   */
  private estimateAgentDuration(agent: any): number {
    // Use metrics if available
    if (agent.metrics?.avgExecutionTimeMs > 0) {
      return agent.metrics.avgExecutionTimeMs;
    }

    // Default estimates based on agent type
    switch (agent.type) {
      case 'supervisor':
        return 2000;
      case 'specialist':
        return 5000;
      case 'finalizer':
        return 3000;
      default:
        return 5000;
    }
  }

  /**
   * Estimate agent execution cost
   */
  private estimateAgentCost(
    agent: any,
    toolsNeeded: string[],
    toolRegistry: ToolRegistry
  ): number {
    let cost = 0;

    // LLM cost if agent uses LLM
    if (agent.llm) {
      const tokensPerCall = agent.llm.maxTokens || 2000;
      const costPerToken = 0.000003; // Claude Sonnet pricing
      cost += tokensPerCall * costPerToken;
    }

    // Tool costs
    for (const toolId of toolsNeeded) {
      const tool = toolRegistry.getById(toolId);
      if (tool) {
        if (tool.cost === 'api_call') {
          cost += 0.001;
        } else if (tool.cost === 'expensive') {
          cost += 0.01;
        }
      }
    }

    return cost;
  }

  /**
   * Validate plan before execution
   */
  private validatePlan(
    stages: PlanStage[],
    state: Partial<MultiAgentState>
  ): PlanValidation {
    const validation: PlanValidation = {
      isValid: true,
      missingInputs: [],
      invalidAgents: [],
      invalidTools: [],
      warnings: [],
    };

    const agentRegistry = AgentRegistry.getInstance();
    const toolRegistry = ToolRegistry.getInstance();

    // Check all agents exist
    for (const stage of stages) {
      const agent = agentRegistry.getById(stage.agentId);
      if (!agent) {
        validation.isValid = false;
        validation.invalidAgents.push(stage.agentId);
      }
    }

    // Check all tools exist
    for (const stage of stages) {
      for (const toolId of stage.toolsNeeded) {
        const tool = toolRegistry.getById(toolId);
        if (!tool) {
          validation.invalidTools.push(toolId);
          // Tools missing is a warning, not a failure
          validation.warnings.push(`Tool ${toolId} not found in registry`);
        }
      }
    }

    // Check required state fields
    if (stages.length > 0) {
      const firstStageRequires = stages[0].requires;
      for (const field of firstStageRequires) {
        if (!(state as any)[field]) {
          validation.missingInputs.push(field);
          // Only invalid if no stage will produce it
          const willBeProduced = stages.some((s) => s.provides.includes(field));
          if (!willBeProduced && field !== 'messages') {
            validation.warnings.push(`Required field '${field}' is missing`);
          }
        }
      }
    }

    return validation;
  }

  /**
   * Compute total estimates
   */
  private computeEstimates(stages: PlanStage[]): PlanEstimates {
    const agentRegistry = AgentRegistry.getInstance();

    return {
      totalAgents: stages.length,
      llmCalls: stages.filter((s) => {
        const agent = agentRegistry.getById(s.agentId);
        return agent?.llm !== undefined;
      }).length,
      apiCalls: stages.reduce((sum, stage) => {
        const toolRegistry = ToolRegistry.getInstance();
        const apiTools = stage.toolsNeeded.filter((toolId) => {
          const tool = toolRegistry.getById(toolId);
          return tool?.cost === 'api_call';
        }).length;
        return sum + apiTools;
      }, 0),
      estimatedCostUSD: stages.reduce((sum, stage) => sum + stage.estimatedCost, 0),
      estimatedDurationMs: this.computeTotalDuration(stages),
    };
  }

  /**
   * Compute total duration considering parallel execution
   */
  private computeTotalDuration(stages: PlanStage[]): number {
    const parallelGroups = this.extractParallelGroups(stages);
    let totalDuration = 0;

    // Group stages by order
    const stagesByOrder = new Map<number, PlanStage[]>();
    for (const stage of stages) {
      const existing = stagesByOrder.get(stage.order) || [];
      existing.push(stage);
      stagesByOrder.set(stage.order, existing);
    }

    // For each order level, take max duration (parallel) or sum (sequential)
    for (const [order, orderStages] of stagesByOrder) {
      if (orderStages.some((s) => s.canRunInParallel)) {
        // Parallel - take maximum
        totalDuration += Math.max(...orderStages.map((s) => s.estimatedDurationMs));
      } else {
        // Sequential - take sum
        totalDuration += orderStages.reduce((sum, s) => sum + s.estimatedDurationMs, 0);
      }
    }

    return totalDuration;
  }

  /**
   * Get required state fields for the plan
   */
  private computeRequiredState(stages: PlanStage[]): string[] {
    if (stages.length === 0) return [];
    // First stage requirements that aren't produced by the plan
    const allProvided = new Set(stages.flatMap((s) => s.provides));
    return stages[0].requires.filter((r) => !allProvided.has(r));
  }

  /**
   * Get all outputs the plan will produce
   */
  private computeExpectedOutputs(stages: PlanStage[]): string[] {
    const outputs = new Set<string>();
    stages.forEach((stage) => {
      stage.provides.forEach((field) => outputs.add(field));
    });
    return Array.from(outputs);
  }

  /**
   * Extract parallel execution groups
   */
  private extractParallelGroups(
    stages: PlanStage[]
  ): ExecutionPlan['parallelGroups'] {
    const groups = new Map<number, string[]>();

    for (const stage of stages) {
      if (stage.parallelGroup !== undefined) {
        const existing = groups.get(stage.parallelGroup) || [];
        existing.push(stage.stageId);
        groups.set(stage.parallelGroup, existing);
      }
    }

    return Array.from(groups.entries()).map(([groupId, stageIds]) => ({
      groupId,
      stageIds,
    }));
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let planGeneratorInstance: ExecutionPlanGenerator | null = null;

export function getPlanGenerator(): ExecutionPlanGenerator {
  if (!planGeneratorInstance) {
    planGeneratorInstance = new ExecutionPlanGenerator();
  }
  return planGeneratorInstance;
}
