/**
 * Response Synthesis Engine
 *
 * Converts raw agent outputs into structured, stakeholder-ready insights.
 * Decoupled from formatting/presentation - focuses purely on data synthesis.
 */

import { ChatAnthropic } from '@langchain/anthropic';
import type { MultiAgentState } from '@/lib/multi-agent/state';
import type { PlanExecutionResult } from '@/lib/types/execution-plan';
import { extractCorrelationId } from '@/lib/utils/correlation';
import type {
  SynthesizedResponse,
  Insight,
  Recommendation,
  Warning,
  Alert,
  ExecutionMetrics,
  NextStep,
} from './types';

// ============================================================================
// Synthesis Engine Class
// ============================================================================

export class SynthesisEngine {
  /**
   * Synthesize response from execution result
   */
  async synthesize(
    state: MultiAgentState,
    executionResult: PlanExecutionResult
  ): Promise<SynthesizedResponse> {
    const correlationId = extractCorrelationId(state);
    console.log(`🔨 [SYNTHESIS-ENGINE] Synthesizing response for ${correlationId}...`);

    const synthesis: SynthesizedResponse = {
      // Metadata
      synthesizedAt: new Date(),
      correlationId,
      queryType: state.execution_plan?.queryType || 'unknown',
      success: executionResult.success,

      // Core data (structured)
      data: await this.extractCoreData(state, executionResult),

      // Insights (analyzed)
      insights: await this.generateInsights(state, executionResult),

      // Recommendations (actionable)
      recommendations: await this.generateRecommendations(
        state,
        executionResult
      ),

      // Warnings & Alerts
      warnings: await this.extractWarnings(state, executionResult),
      alerts: await this.extractAlerts(state, executionResult),

      // Metrics & Performance
      metrics: this.extractMetrics(executionResult),

      // Explanation & Reasoning
      reasoning: await this.generateReasoning(state, executionResult),

      // Next steps
      nextSteps: await this.generateNextSteps(state, executionResult),
    };

    console.log(`✅ [SYNTHESIS-ENGINE] Response synthesized`);
    console.log(`   Data fields: ${Object.keys(synthesis.data).length}`);
    console.log(`   Insights: ${synthesis.insights.length}`);
    console.log(`   Recommendations: ${synthesis.recommendations.length}`);
    console.log(`   Warnings: ${synthesis.warnings.length}`);
    console.log(`   Alerts: ${synthesis.alerts.length}`);

    return synthesis;
  }

  /**
   * Extract core structured data from state
   */
  private async extractCoreData(
    state: MultiAgentState,
    result: PlanExecutionResult
  ): Promise<Record<string, any>> {
    const data: Record<string, any> = {};

    // Route data
    if (state.route_data) {
      data.route = {
        origin: state.route_data.origin_port_code,
        destination: state.route_data.destination_port_code,
        distance_nm: state.route_data.distance_nm,
        estimated_hours: state.route_data.estimated_hours,
        waypoints_count: state.route_data.waypoints?.length || 0,
      };
    }

    // Bunker data
    if (state.bunker_analysis) {
      const bestOption = state.bunker_analysis.best_option;
      data.bunker = {
        best_option: {
          port_code: bestOption?.port_code,
          port_name: bestOption?.port_name,
          total_cost_usd: bestOption?.total_cost_usd,
          fuel_cost_usd: bestOption?.fuel_cost_usd,
          deviation_cost_usd: bestOption?.deviation_cost_usd,
        },
        alternatives_count: state.bunker_analysis.recommendations?.length || 0,
        max_savings_usd: state.bunker_analysis.max_savings_usd,
      };
    }

    // Weather data
    if (state.weather_forecast || state.weather_consumption) {
      data.weather = {
        forecast_points: state.weather_forecast?.length || 0,
        consumption_impact:
          state.weather_consumption?.consumption_increase_percent || 0,
        additional_fuel_needed:
          state.weather_consumption?.additional_fuel_needed_mt || 0,
      };
    }

    // CII data (if available) - removed as cii_rating doesn't exist in state
    // if (state.cii_rating) {
    //   data.cii = {
    //     rating: state.cii_rating.rating,
    //     cii_value: state.cii_rating.cii_value,
    //     required_cii: state.cii_rating.required_cii,
    //     improvement_needed:
    //       state.cii_rating.cii_value > state.cii_rating.required_cii,
    //   };
    // }

    // EU ETS data (if available) - removed as eu_ets_cost doesn't exist in state
    // if (state.eu_ets_cost) {
    //   data.eu_ets = {
    //     total_cost_usd: state.eu_ets_cost.total_cost_usd,
    //     allowances_required: state.eu_ets_cost.allowances_required,
    //     emissions_tonnes: state.eu_ets_cost.emissions_tonnes,
    //   };
    // }

    // Compliance data
    if (state.compliance_data) {
      data.compliance = {
        has_eca_zones: state.compliance_data.eca_zones?.has_eca_zones || false,
        total_eca_distance_nm: state.compliance_data.eca_zones?.total_eca_distance_nm || 0,
        eca_zones_crossed: state.compliance_data.eca_zones?.eca_zones_crossed?.length || 0,
      };
    }

    // Vessel data
    if (state.vessel_name || state.vessel_profile) {
      data.vessel = {
        name: state.vessel_name || state.vessel_profile?.vessel_name || 'Unknown',
        imo: state.vessel_profile?.vessel_data?.imo,
        capacity_mt: state.vessel_profile?.capacity?.VLSFO,
        operational_speed: state.vessel_profile?.operational_speed,
      };
    }

    // Vessel list/count (from vessel_info_agent)
    if (state.vessel_specs && state.vessel_specs.length > 0) {
      const typeCount: Record<string, number> = {};
      for (const v of state.vessel_specs) {
        const t = v.type || 'Unknown';
        typeCount[t] = (typeCount[t] || 0) + 1;
      }
      data.vessels = {
        count: state.vessel_specs.length,
        types: typeCount,
        sample: state.vessel_specs.slice(0, 5).map((v) => ({ name: v.name, imo: v.imo, type: v.type })),
      };
    }

    // Noon reports (from vessel_info_agent via fetch_noon_report)
    if (state.noon_reports && state.noon_reports.length > 0) {
      data.noon_reports = state.noon_reports.map((r) => ({
        imo: r.imo,
        vessel_name: r.vessel_name,
        timestamp: r.timestamp,
        position: r.position,
        rob: r.rob,
        speed: r.speed,
        next_port: r.next_port,
        distance_to_go: r.distance_to_go,
      }));
    }

    // Consumption profiles (from vessel_info_agent via fetch_consumption_profile)
    if (state.consumption_profiles && state.consumption_profiles.length > 0) {
      data.consumption_profiles = state.consumption_profiles.map((p) => ({
        imo: p.imo,
        speed: p.speed,
        weather_condition: p.weather_condition,
        load_condition: p.load_condition,
        consumption: p.consumption,
      }));
    }

    return data;
  }

  /**
   * Generate actionable insights
   */
  private async generateInsights(
    state: MultiAgentState,
    result: PlanExecutionResult
  ): Promise<Insight[]> {
    const insights: Insight[] = [];

    // Cost optimization insight
    if (
      state.bunker_analysis?.max_savings_usd &&
      state.bunker_analysis.max_savings_usd > 1000
    ) {
      const worstOption = state.bunker_analysis.worst_option;
      const savingsPercent = worstOption?.total_cost_usd
        ? (
            (state.bunker_analysis.max_savings_usd /
              worstOption.total_cost_usd) *
            100
          ).toFixed(1)
        : '0';

      insights.push({
        type: 'cost_optimization',
        priority: 'high',
        category: 'financial',
        title: 'Significant Cost Savings Available',
        description: `Optimal bunker port selection can save $${state.bunker_analysis.max_savings_usd.toLocaleString()} vs worst option`,
        impact: {
          financial: state.bunker_analysis.max_savings_usd,
          percentage: savingsPercent,
        },
        confidence: 0.95,
      });
    }

    // Weather risk insight
    const weatherConsumption = state.weather_consumption;
    if (weatherConsumption && weatherConsumption.consumption_increase_percent > 10) {
      const unsafeSegments = weatherConsumption.weather_alerts?.filter(
        (alert) => alert.severity === 'severe'
      ).length || 0;

      insights.push({
        type: 'weather_risk',
        priority: 'high',
        category: 'safety',
        title: 'High Weather Risk Detected',
        description: `${unsafeSegments} route segments have high weather risk`,
        impact: {
          safety: 'high',
          delay_hours: 0, // Weather delay not available in current data structure
        },
        confidence: 0.85,
      });
    }

    // CII performance insight - removed as cii_rating doesn't exist in state
    // if (state.cii_rating && state.cii_rating.rating === 'E') {
    //   insights.push({
    //     type: 'compliance_risk',
    //     priority: 'critical',
    //     category: 'regulatory',
    //     title: 'CII Rating Requires Action Plan',
    //     description:
    //       'Vessel CII rating is E, requiring corrective action plan per IMO regulations',
    //     impact: {
    //       regulatory: 'critical',
    //       deadline: '3 months',
    //     },
    //     confidence: 1.0,
    //   });
    // }

    // Multi-port bunker insight
    if (state.multi_bunker_plan) {
      insights.push({
        type: 'operational_complexity',
        priority: 'medium',
        category: 'operational',
        title: 'Multi-Port Bunkering Required',
        description: `Voyage consumption exceeds vessel capacity, requiring multiple bunker stops`,
        impact: {
          operational: 'high',
          additional_stops: 2,
        },
        confidence: 1.0,
      });
    }

    // ECA zone insight
    if (state.compliance_data?.eca_zones?.has_eca_zones) {
      insights.push({
        type: 'eca_compliance',
        priority: 'medium',
        category: 'regulatory',
        title: 'ECA Zones on Route',
        description: `Route passes through ${state.compliance_data.eca_zones.eca_zones_crossed.length} ECA zones requiring low-sulfur fuel`,
        impact: {
          regulatory: 'medium',
          fuel_switches: state.compliance_data.eca_zones.eca_zones_crossed.length,
        },
        confidence: 1.0,
      });
    }

    return insights;
  }

  /**
   * Generate actionable recommendations
   */
  private async generateRecommendations(
    state: MultiAgentState,
    result: PlanExecutionResult
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    // Primary bunker recommendation
    if (state.bunker_analysis?.best_option) {
      const bestOption = state.bunker_analysis.best_option;
      recommendations.push({
        id: 'bunker_primary',
        priority: 1,
        category: 'bunker_planning',
        action: 'Bunker at recommended port',
        details: {
          port: bestOption.port_name,
          port_code: bestOption.port_code,
          total_cost_usd: bestOption.total_cost_usd,
        },
        rationale: `Optimal balance of fuel cost ($${bestOption.fuel_cost_usd?.toLocaleString() || '0'}) and deviation cost ($${bestOption.deviation_cost_usd?.toLocaleString() || '0'})`,
        impact: {
          cost_savings_usd: state.bunker_analysis.max_savings_usd || 0,
          time_impact_hours: 0, // Deviation hours not available in current data structure
        },
        confidence: 0.95,
        urgency: 'high',
        owner: 'charterer',
      });
    }

    // Weather avoidance recommendation
    const weatherAlerts = state.weather_consumption?.weather_alerts?.filter(
      (alert) => alert.severity === 'severe'
    ).length || 0;
    if (weatherAlerts > 0) {
      recommendations.push({
        id: 'weather_avoidance',
        priority: 2,
        category: 'safety',
        action: 'Consider route adjustment for weather',
        details: {
          segments_affected: weatherAlerts,
          alternative_available: false,
        },
        rationale:
          'High weather risk on current route may cause delays or safety concerns',
        impact: {
          safety: 'high',
          delay_avoidance_hours: 0,
        },
        confidence: 0.8,
        urgency: 'high',
        owner: 'master',
      });
    }

    // CII improvement recommendation - removed as cii_rating doesn't exist in state
    // if (state.cii_rating && ['D', 'E'].includes(state.cii_rating.rating)) {
    //   recommendations.push({
    //     id: 'cii_improvement',
    //     priority: 3,
    //     category: 'compliance',
    //     action: 'Implement CII improvement measures',
    //     details: {
    //       current_rating: state.cii_rating.rating,
    //       target_rating: 'C',
    //       improvement_actions:
    //         state.cii_recommendations?.slice(0, 3) || [],
    //     },
    //     rationale: `Current CII rating ${state.cii_rating.rating} requires improvement to avoid regulatory penalties`,
    //     impact: {
    //       regulatory: 'critical',
    //       cii_improvement: state.cii_rating.improvement_potential || 0,
    //     },
    //     confidence: 0.9,
    //     urgency: 'medium',
    //     owner: 'technical_manager',
    //   });
    // }

    return recommendations;
  }

  /**
   * Extract warnings from state
   */
  private async extractWarnings(
    state: MultiAgentState,
    result: PlanExecutionResult
  ): Promise<Warning[]> {
    const warnings: Warning[] = [];

    // Execution warnings
    if (result.stagesFailed.length > 0) {
      warnings.push({
        level: 'warning',
        category: 'execution',
        message: `${result.stagesFailed.length} agent(s) failed during execution`,
        details: result.errors.map((e) => `${e.agentId}: ${e.error}`),
        impact: 'Analysis may be incomplete',
      });
    }

    // Data quality warnings
    if (state.port_prices?.stale_price_warnings && state.port_prices.stale_price_warnings.length > 0) {
      warnings.push({
        level: 'warning',
        category: 'data_quality',
        message: 'Some fuel prices are stale',
        details: state.port_prices.stale_price_warnings.map((w) => `${w.port_code} (${w.fuel_type})`),
        impact: 'Price recommendations may not reflect current market',
      });
    }

    // Capacity warnings - removed as capacity_exceeded doesn't exist in state
    // if (state.capacity_exceeded) {
    //   warnings.push({
    //     level: 'critical',
    //     category: 'safety',
    //     message: 'Bunker quantity exceeds vessel capacity',
    //     details: [
    //       `Requested: ${state.bunker_quantity_mt}MT`,
    //       `Capacity: ${state.vessel?.capacity_mt || 'unknown'}MT`,
    //     ],
    //     impact: 'Cannot complete voyage as planned',
    //   });
    // }

    // Degraded mode warning
    if (state.degraded_mode) {
      warnings.push({
        level: 'warning',
        category: 'system',
        message: 'System operating in degraded mode',
        details: state.missing_data || [],
        impact: 'Some features may be unavailable',
      });
    }

    return warnings;
  }

  /**
   * Extract critical alerts
   */
  private async extractAlerts(
    state: MultiAgentState,
    result: PlanExecutionResult
  ): Promise<Alert[]> {
    const alerts: Alert[] = [];

    // No bunker options alert
    if (
      !state.bunker_analysis ||
      state.bunker_analysis.recommendations?.length === 0
    ) {
      alerts.push({
        level: 'critical',
        type: 'no_bunker_options',
        title: 'No Viable Bunker Options Found',
        message:
          'Cannot proceed with cargo - no bunker ports available on route',
        action_required: 'Modify route or vessel selection',
        urgency: 'immediate',
      });
    }

    // Weather alert
    const severeWeatherAlerts = state.weather_consumption?.weather_alerts?.filter(
      (alert) => alert.severity === 'severe'
    ) || [];
    if (severeWeatherAlerts.length > 0) {
      alerts.push({
        level: 'critical',
        type: 'weather_danger',
        title: 'Critical Weather Conditions',
        message: severeWeatherAlerts.map((alert) => alert.description).join('; '),
        action_required:
          'Consider delaying departure or alternative route',
        urgency: 'immediate',
      });
    }

    // Compliance alert - removed as cii_rating doesn't exist in state
    // if (state.cii_rating?.rating === 'E') {
    //   alerts.push({
    //     level: 'high',
    //     type: 'compliance_violation',
    //     title: 'CII Rating E - Action Plan Required',
    //     message:
    //       'IMO regulations require corrective action plan within 3 months',
    //     action_required: 'Submit CII improvement plan to flag state',
    //     urgency: 'high',
    //   });
    // }

    return alerts;
  }

  /**
   * Extract performance metrics
   */
  private extractMetrics(result: PlanExecutionResult): ExecutionMetrics {
    const totalStages =
      result.stagesCompleted.length +
      result.stagesFailed.length +
      result.stagesSkipped.length;

    return {
      duration_ms: result.durationMs,
      stages_completed: result.stagesCompleted.length,
      stages_failed: result.stagesFailed.length,
      stages_skipped: result.stagesSkipped.length,
      llm_calls: result.costs.llmCalls,
      api_calls: result.costs.apiCalls,
      total_cost_usd: result.costs.actualCostUSD,
      success_rate:
        totalStages > 0
          ? (result.stagesCompleted.length / totalStages) * 100
          : 100,
    };
  }

  /**
   * Generate explanation of reasoning
   */
  private async generateReasoning(
    state: MultiAgentState,
    result: PlanExecutionResult
  ): Promise<string> {
    // Use LLM to generate natural language explanation
    try {
      const model = new ChatAnthropic({
        modelName: 'claude-sonnet-4-5',
        temperature: 0.3,
        maxTokens: 1000,
      });

      const routeInfo = state.route_data
        ? `${state.route_data.origin_port_code} → ${state.route_data.destination_port_code} (${state.route_data.distance_nm}nm)`
        : 'Unknown route';

      const bestOption = state.bunker_analysis?.best_option;
      const bestOptionInfo = bestOption
        ? `${bestOption.port_name} - Total: $${bestOption.total_cost_usd?.toLocaleString()}, Fuel: $${bestOption.fuel_cost_usd?.toLocaleString()}, Deviation: $${bestOption.deviation_cost_usd?.toLocaleString()}`
        : 'No option selected';

      const prompt = `Given this bunker planning analysis, explain the key reasoning in 2-3 paragraphs:

Route: ${routeInfo}

Best Option: ${bestOptionInfo}

Alternatives: ${state.bunker_analysis?.recommendations?.length || 0} other ports considered

Explain:
1. Why this port was selected
2. What tradeoffs were made
3. What the key decision factors were

Keep it concise and business-focused.`;

      const response = await model.invoke(prompt);
      return response.content.toString();
    } catch (error) {
      console.warn(
        '⚠️  Failed to generate reasoning, using fallback:',
        error
      );
      return 'Analysis completed successfully. See recommendations for details.';
    }
  }

  /**
   * Generate next steps
   */
  private async generateNextSteps(
    state: MultiAgentState,
    result: PlanExecutionResult
  ): Promise<NextStep[]> {
    const steps: NextStep[] = [];

    if (state.bunker_analysis?.best_option) {
      const bestOption = state.bunker_analysis.best_option;

      steps.push({
        order: 1,
        action: 'Contact bunker supplier',
        description: `Confirm fuel availability and pricing at ${bestOption.port_name}`,
        owner: 'operations',
        deadline: 'Within 24 hours',
        dependencies: [],
      });

      steps.push({
        order: 2,
        action: 'Confirm vessel schedule',
        description: 'Ensure bunker window aligns with port arrival time',
        owner: 'operations',
        deadline: 'Within 24 hours',
        dependencies: ['Contact bunker supplier'],
      });

      steps.push({
        order: 3,
        action: 'Place bunker order',
        description: `Order fuel at ${bestOption.port_name}`,
        owner: 'charterer',
        deadline: 'After confirmation',
        dependencies: ['Contact bunker supplier', 'Confirm vessel schedule'],
      });
    }

    return steps;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let engineInstance: SynthesisEngine | null = null;

export function getSynthesisEngine(): SynthesisEngine {
  if (!engineInstance) {
    engineInstance = new SynthesisEngine();
  }
  return engineInstance;
}
