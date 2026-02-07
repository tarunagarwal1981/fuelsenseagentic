/**
 * Auto-Discovering Synthesis Engine
 *
 * PROBLEM SOLVED: When you add a new agent, synthesis automatically knows how to extract its data.
 *
 * HOW IT WORKS:
 * 1. Reads Agent Registry to see what state fields each agent produces
 * 2. Checks if those fields exist in current state
 * 3. Extracts data using generic extraction rules
 * 4. No manual updates needed when adding agents
 *
 * EXAMPLE:
 * - You add vessel_selection_agent with produces: ['vessel_comparison_analysis']
 * - Synthesis engine discovers this from registry
 * - Automatically extracts vessel_comparison_analysis if it exists
 * - Routes to appropriate template
 */

import { AgentRegistry } from '@/lib/registry/agent-registry';
import type { MultiAgentState } from '@/lib/multi-agent/state';

const LOG_PREFIX = '[AUTO-SYNTHESIS]';

export interface SynthesisContext {
  /** What data is available */
  available_data: Record<string, unknown>;
  /** Which agents contributed */
  agents_executed: string[];
  /** What capabilities were used */
  capabilities_used: string[];
  /** Primary domain (bunker, vessel, route, compliance, etc.) */
  primary_domain: string;
  /** Query context */
  query_type: string;
  query_intent: string;
  /** Routing metadata from supervisor (optional) */
  routing_metadata?: {
    classification_method: string;
    confidence: number;
    target_agent: string;
    matched_intent: string;
  };
}

export interface ExtractedData {
  field_name: string;
  field_value: unknown;
  source_agent: string;
  data_type: string;
  importance: 'critical' | 'important' | 'supplementary';
}

export interface AutoSynthesisResult {
  context: SynthesisContext;
  extracted_data: ExtractedData[];
  insights: unknown[];
  recommendations: unknown[];
  warnings: unknown[];
}

export class AutoSynthesisEngine {
  /**
   * Main synthesis method - automatically discovers data
   */
  static synthesizeResponse(state: MultiAgentState): AutoSynthesisResult {
    console.log(`${LOG_PREFIX} 🔨 Starting auto-discovery synthesis...`);

    // Step 1: Discover what agents executed
    const executedAgents = this.discoverExecutedAgents(state);
    console.log(`${LOG_PREFIX} 📊 Agents executed: ${executedAgents.join(', ') || '(none)'}`);

    // Step 2: Discover what data is available
    const availableData = this.discoverAvailableData(state, executedAgents);
    console.log(`${LOG_PREFIX} 📊 Data fields found: ${availableData.length}`);

    // Step 3: Determine primary domain
    const primaryDomain = this.determinePrimaryDomain(executedAgents, availableData);
    console.log(`${LOG_PREFIX} 📊 Primary domain: ${primaryDomain}`);

    // Step 4: Extract data using generic extractors
    const extractedData = this.extractAllData(state, availableData);
    console.log(`${LOG_PREFIX} 📊 Extracted ${extractedData.length} data items`);

    // Step 5: Build synthesis context
    const context: SynthesisContext = {
      available_data: this.buildDataMap(extractedData),
      agents_executed: executedAgents,
      capabilities_used: this.getCapabilitiesUsed(executedAgents),
      primary_domain: primaryDomain,
      query_type: this.inferQueryType(primaryDomain, executedAgents),
      query_intent: this.inferQueryIntent(state),
      routing_metadata: state.routing_metadata
        ? {
            classification_method: state.routing_metadata.classification_method,
            confidence: state.routing_metadata.confidence,
            target_agent: state.routing_metadata.target_agent,
            matched_intent: state.routing_metadata.matched_intent,
          }
        : undefined,
    };

    console.log(
      `${LOG_PREFIX} ✅ Context built: ${context.query_type} (${context.primary_domain})`
    );

    return {
      context,
      extracted_data: extractedData,
      insights: this.generateInsights(context, extractedData),
      recommendations: this.generateRecommendations(context, extractedData),
      warnings: this.generateWarnings(context, extractedData),
    };
  }

  /**
   * Discover which agents executed by checking agent_status and execution_plan
   */
  private static discoverExecutedAgents(state: MultiAgentState): string[] {
    const executed: string[] = [];

    // Check agent_status (status: 'success' indicates completed)
    if (state.agent_status) {
      Object.keys(state.agent_status).forEach((agentId) => {
        const status = state.agent_status![agentId];
        if (status === 'success') {
          executed.push(agentId);
        }
      });
      console.log(`${LOG_PREFIX} Discovered ${executed.length} agents from agent_status`);
    }

    // Fallback: Check execution_plan completed stages
    if (state.execution_plan?.completedStages?.length) {
      state.execution_plan.completedStages.forEach((stageId) => {
        const stage = state.execution_plan!.stages.find((s) => s.stageId === stageId);
        if (stage?.agentId && !executed.includes(stage.agentId)) {
          executed.push(stage.agentId);
        }
      });
      console.log(
        `${LOG_PREFIX} Added ${state.execution_plan.completedStages.length} from execution_plan`
      );
    }

    // Fallback: Check state fields to infer which agents ran (registry-based)
    const registry = AgentRegistry.getInstance();
    const allAgents = registry.getAll();

    allAgents.forEach((agent) => {
      const produces = agent.produces?.stateFields || [];
      const hasProducedData = produces.some(
        (field) => state[field as keyof MultiAgentState] != null
      );

      if (hasProducedData && !executed.includes(agent.id)) {
        executed.push(agent.id);
        console.log(`${LOG_PREFIX} Inferred agent ${agent.id} from produced state fields`);
      }
    });

    return executed;
  }

  /**
   * Discover what data fields are available in state
   * Uses Agent Registry to know what each agent produces
   */
  private static discoverAvailableData(
    state: MultiAgentState,
    executedAgents: string[]
  ): Array<{ field: string; agent: string; type: string }> {
    const registry = AgentRegistry.getInstance();
    const available: Array<{ field: string; agent: string; type: string }> = [];

    executedAgents.forEach((agentId) => {
      const agent = registry.getById(agentId);
      if (!agent) {
        console.log(`${LOG_PREFIX} ⚠️ Agent ${agentId} not found in registry, skipping`);
        return;
      }

      const produces = agent.produces?.stateFields || [];

      produces.forEach((field) => {
        if (state[field as keyof MultiAgentState] != null) {
          available.push({
            field,
            agent: agentId,
            type: this.inferDataType(field),
          });
        }
      });
    });

    return available;
  }

  /**
   * Infer data type from field name (extensible - add new mappings for new domains)
   */
  private static inferDataType(fieldName: string): string {
    const typeMap: Record<string, string> = {
      route_data: 'route',
      bunker_analysis: 'bunker',
      bunker_ports: 'bunker',
      weather_forecast: 'weather',
      vessel_specs: 'vessel',
      vessel_comparison_analysis: 'vessel_comparison',
      rob_tracking: 'rob',
      compliance_data: 'compliance',
      cii_calculation: 'cii',
      eu_ets_calculation: 'eu_ets',
      hull_performance: 'hull',
      port_prices: 'bunker',
      weather_consumption: 'weather',
      port_weather_status: 'weather',
      vessel_timeline: 'route',
      multi_bunker_plan: 'bunker',
      vessel_rankings: 'vessel_comparison',
      recommended_vessel: 'vessel_comparison',
      noon_reports: 'vessel',
      consumption_profiles: 'vessel',
    };

    return typeMap[fieldName] ?? 'generic';
  }

  /**
   * Determine primary domain from executed agents
   */
  private static determinePrimaryDomain(
    executedAgents: string[],
    availableData: Array<{ field: string; agent: string; type: string }>
  ): string {
    const typeCounts: Record<string, number> = {};
    availableData.forEach((item) => {
      typeCounts[item.type] = (typeCounts[item.type] || 0) + 1;
    });

    let primaryDomain = 'general';
    let maxCount = 0;

    Object.entries(typeCounts).forEach(([type, count]) => {
      if (count > maxCount) {
        maxCount = count;
        primaryDomain = type;
      }
    });

    return primaryDomain;
  }

  /**
   * Extract all data using generic extractors
   */
  private static extractAllData(
    state: MultiAgentState,
    availableData: Array<{ field: string; agent: string; type: string }>
  ): ExtractedData[] {
    const extracted: ExtractedData[] = [];

    availableData.forEach((item) => {
      const fieldValue = state[item.field as keyof MultiAgentState];

      if (fieldValue != null) {
        extracted.push({
          field_name: item.field,
          field_value: fieldValue,
          source_agent: item.agent,
          data_type: item.type,
          importance: this.determineImportance(item.field, item.type),
        });
      }
    });

    return extracted;
  }

  /**
   * Determine importance of a data field (extensible - add new fields for new domains)
   */
  private static determineImportance(
    fieldName: string,
    _dataType: string
  ): 'critical' | 'important' | 'supplementary' {
    const critical = [
      'bunker_analysis',
      'vessel_comparison_analysis',
      'route_data',
      'vessel_specs',
      'compliance_data',
    ];

    const important = [
      'weather_forecast',
      'rob_tracking',
      'bunker_ports',
      'port_prices',
      'multi_bunker_plan',
      'vessel_rankings',
      'recommended_vessel',
    ];

    if (critical.includes(fieldName)) return 'critical';
    if (important.includes(fieldName)) return 'important';
    return 'supplementary';
  }

  /**
   * Build data map for template rendering
   */
  private static buildDataMap(extractedData: ExtractedData[]): Record<string, unknown> {
    const dataMap: Record<string, unknown> = {};

    extractedData.forEach((item) => {
      if (!dataMap[item.data_type]) {
        dataMap[item.data_type] = {};
      }

      (dataMap[item.data_type] as Record<string, unknown>)[item.field_name] =
        item.field_value;

      dataMap[item.field_name] = item.field_value;
    });

    return dataMap;
  }

  /**
   * Get capabilities used from executed agents
   */
  private static getCapabilitiesUsed(executedAgents: string[]): string[] {
    const registry = AgentRegistry.getInstance();
    const capabilities: string[] = [];

    executedAgents.forEach((agentId) => {
      const agent = registry.getById(agentId);
      if (agent?.capabilities) {
        agent.capabilities.forEach((cap) => {
          if (!capabilities.includes(cap)) {
            capabilities.push(cap);
          }
        });
      }
    });

    return capabilities;
  }

  /**
   * Infer query type from primary domain and agents (extensible - add new mappings)
   */
  private static inferQueryType(
    primaryDomain: string,
    _executedAgents: string[]
  ): string {
    const queryTypeMap: Record<string, string> = {
      bunker: 'bunker_planning',
      route: 'route_analysis',
      vessel: 'vessel_information',
      vessel_comparison: 'vessel_selection',
      weather: 'weather_forecast',
      rob: 'rob_projection',
      compliance: 'compliance_check',
      cii: 'cii_rating',
      eu_ets: 'emissions_reporting',
      hull: 'hull_performance',
    };

    return queryTypeMap[primaryDomain] ?? 'general_query';
  }

  /**
   * Infer query intent from state messages
   */
  private static inferQueryIntent(state: MultiAgentState): string {
    if (!state.messages || state.messages.length === 0) {
      return 'unknown';
    }

    const userMessage = state.messages[0].content.toString().toLowerCase();

    if (userMessage.includes('compare') || userMessage.includes('which')) {
      return 'comparison';
    }
    if (userMessage.includes('how many') || userMessage.includes('list')) {
      return 'listing';
    }
    if (userMessage.includes('best') || userMessage.includes('recommend')) {
      return 'recommendation';
    }
    if (userMessage.includes('can') || userMessage.includes('should')) {
      return 'feasibility';
    }
    if (userMessage.includes('what') || userMessage.includes('show')) {
      return 'information';
    }

    return 'general';
  }

  /**
   * Generate insights based on available data (extensible - add new domain blocks)
   */
  private static generateInsights(
    context: SynthesisContext,
    extractedData: ExtractedData[]
  ): unknown[] {
    const insights: unknown[] = [];

    const criticalDataCount = extractedData.filter(
      (d) => d.importance === 'critical'
    ).length;
    if (criticalDataCount > 0) {
      insights.push({
        type: 'data_completeness',
        message: `Analysis based on ${extractedData.length} data points from ${context.agents_executed.length} agents`,
        severity: 'info',
      });
    }

    if (context.primary_domain === 'bunker') {
      insights.push(...this.generateBunkerInsights(extractedData));
    }
    if (
      context.primary_domain === 'vessel' ||
      context.primary_domain === 'vessel_comparison'
    ) {
      insights.push(...this.generateVesselInsights(extractedData));
    }
    if (context.primary_domain === 'route') {
      insights.push(...this.generateRouteInsights(extractedData));
    }
    if (context.primary_domain === 'compliance') {
      insights.push(...this.generateComplianceInsights(extractedData));
    }

    return insights;
  }

  /**
   * Generate bunker-specific insights (extensible)
   */
  private static generateBunkerInsights(extractedData: ExtractedData[]): unknown[] {
    const insights: unknown[] = [];

    const bunkerData = extractedData.find((d) => d.field_name === 'bunker_analysis');
    if (bunkerData?.field_value) {
      const analysis = bunkerData.field_value as Record<string, unknown>;
      const best = analysis.best_option as Record<string, unknown> | undefined;
      if (best?.port_name) {
        insights.push({
          type: 'bunker_recommendation',
          message: `Recommended bunker port: ${best.port_name}`,
          severity: 'info',
        });
      }
      if (typeof best?.total_cost_usd === 'number') {
        insights.push({
          type: 'cost_estimate',
          message: `Estimated bunker cost: $${best.total_cost_usd.toLocaleString()}`,
          severity: 'info',
        });
      }
    }

    return insights;
  }

  /**
   * Generate vessel-specific insights (extensible)
   */
  private static generateVesselInsights(extractedData: ExtractedData[]): unknown[] {
    const insights: unknown[] = [];

    const vesselData = extractedData.find((d) => d.field_name === 'vessel_specs');
    if (vesselData?.field_value) {
      const vessels = vesselData.field_value as unknown[];
      if (Array.isArray(vessels)) {
        insights.push({
          type: 'fleet_size',
          message: `Fleet contains ${vessels.length} vessel${vessels.length !== 1 ? 's' : ''}`,
          severity: 'info',
        });
      }
    }

    const comparisonData = extractedData.find(
      (d) => d.field_name === 'vessel_comparison_analysis'
    );
    if (comparisonData?.field_value) {
      const comparison = comparisonData.field_value as Record<string, unknown>;
      const recommended = comparison.recommended_vessel;
      if (recommended) {
        insights.push({
          type: 'vessel_recommendation',
          message: `Recommended vessel: ${String(recommended)}`,
          severity: 'success',
        });
      }
    }

    const recommendedVessel = extractedData.find(
      (d) => d.field_name === 'recommended_vessel'
    );
    if (recommendedVessel?.field_value && !comparisonData) {
      insights.push({
        type: 'vessel_recommendation',
        message: `Recommended vessel: ${String(recommendedVessel.field_value)}`,
        severity: 'success',
      });
    }

    return insights;
  }

  /**
   * Generate route-specific insights (extensible)
   */
  private static generateRouteInsights(extractedData: ExtractedData[]): unknown[] {
    const insights: unknown[] = [];

    const routeData = extractedData.find((d) => d.field_name === 'route_data');
    if (routeData?.field_value) {
      const route = routeData.field_value as Record<string, unknown>;
      const distance = route.distance_nm as number | undefined;
      const routeType = route.route_type as string | undefined;
      if (typeof distance === 'number') {
        insights.push({
          type: 'route_distance',
          message: `Route distance: ${distance.toLocaleString()} nm`,
          severity: 'info',
        });
      }
      if (routeType) {
        insights.push({
          type: 'route_type',
          message: `Route type: ${routeType}`,
          severity: 'info',
        });
      }
    }

    return insights;
  }

  /**
   * Generate compliance-specific insights (extensible)
   */
  private static generateComplianceInsights(
    extractedData: ExtractedData[]
  ): unknown[] {
    const insights: unknown[] = [];

    const complianceData = extractedData.find(
      (d) => d.field_name === 'compliance_data'
    );
    if (complianceData?.field_value) {
      insights.push({
        type: 'compliance_analysis',
        message: 'ECA zone and compliance analysis completed',
        severity: 'info',
      });
    }

    return insights;
  }

  /**
   * Generate recommendations (extensible - add new domain blocks)
   */
  private static generateRecommendations(
    _context: SynthesisContext,
    _extractedData: ExtractedData[]
  ): unknown[] {
    return [];
  }

  /**
   * Generate warnings (extensible - add new domain blocks)
   */
  private static generateWarnings(
    _context: SynthesisContext,
    _extractedData: ExtractedData[]
  ): unknown[] {
    return [];
  }
}
