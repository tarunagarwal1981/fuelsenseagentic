/**
 * Synthesis Content Renderers
 * 
 * Format synthesized insights for display in response templates.
 * Updated for v3 schema with query type classification.
 */

import type { MultiAgentState } from '../multi-agent/state';

// ============================================================================
// Types (for clarity, extracted from state)
// ============================================================================

type SynthesizedInsights = NonNullable<MultiAgentState['synthesized_insights']>;
type StrategicPriority = SynthesizedInsights['strategic_priorities'][number];
type CrossAgentConnection = SynthesizedInsights['cross_agent_connections'][number];
type HiddenOpportunity = SynthesizedInsights['hidden_opportunities'][number];
type CriticalRisk = SynthesizedInsights['critical_risks'][number];

// ============================================================================
// Query Response Renderer (NEW - v3)
// ============================================================================

/**
 * Render the primary response based on query type
 */
export function renderQueryResponse(state: MultiAgentState): string {
  const synthesis = state.synthesized_insights;
  
  if (!synthesis || !synthesis.response) {
    return '';
  }
  
  const { query_type, response } = synthesis;
  
  switch (query_type) {
    case 'informational':
      if (!response.informational) return '';
      let info = `**${response.informational.answer}**\n\n`;
      if (response.informational.key_facts?.length > 0) {
        info += '**Key Facts:**\n';
        response.informational.key_facts.forEach(fact => {
          info += `- ${fact}\n`;
        });
      }
      if (response.informational.additional_context) {
        info += `\n*${response.informational.additional_context}*`;
      }
      return info.trim();
      
    case 'decision-required':
      if (!response.decision) return '';
      const riskEmoji: Record<string, string> = {
        safe: '🟢',
        caution: '🟡',
        critical: '🔴',
      };
      let decision = `**Recommendation:** ${response.decision.action}\n\n`;
      decision += `**Primary Metric:** ${response.decision.primary_metric}\n`;
      decision += `**Risk Level:** ${riskEmoji[response.decision.risk_level] || '⚪'} ${response.decision.risk_level}\n`;
      decision += `**Confidence:** ${response.decision.confidence}%`;
      return decision;
      
    case 'validation':
      if (!response.validation) return '';
      const resultEmoji: Record<string, string> = {
        feasible: '✅',
        not_feasible: '❌',
        risky: '⚠️',
      };
      let validation = `${resultEmoji[response.validation.result] || '❓'} **${response.validation.result.replace('_', ' ').toUpperCase()}**\n\n`;
      validation += `${response.validation.explanation}\n`;
      if (response.validation.consequence) {
        validation += `\n**If ignored:** ${response.validation.consequence}\n`;
      }
      if (response.validation.alternative) {
        validation += `\n**Alternative:** ${response.validation.alternative}`;
      }
      return validation.trim();
      
    case 'comparison':
      if (!response.comparison) return '';
      let comparison = `🏆 **Winner: ${response.comparison.winner}**\n`;
      comparison += `*${response.comparison.winner_reason}*\n\n`;
      if (response.comparison.runner_up) {
        comparison += `🥈 **Runner-up:** ${response.comparison.runner_up}\n\n`;
      }
      if (response.comparison.comparison_factors?.length > 0) {
        comparison += `**Factors compared:** ${response.comparison.comparison_factors.join(', ')}`;
      }
      return comparison.trim();
      
    default:
      return '';
  }
}

// ============================================================================
// Strategic Priorities Renderer
// ============================================================================

/**
 * Render strategic priorities with urgency indicators
 */
export function renderStrategicPriorities(state: MultiAgentState): string {
  const synthesis = state.synthesized_insights;
  
  if (!synthesis || !synthesis.strategic_priorities || synthesis.strategic_priorities.length === 0) {
    return '';
  }
  
  let output = '';
  
  // Sort by priority number
  const sorted = [...synthesis.strategic_priorities].sort((a, b) => a.priority - b.priority);
  
  sorted.forEach((priority: StrategicPriority) => {
    const urgencyEmoji: Record<string, string> = {
      immediate: '🔴',
      today: '🟡',
      this_week: '🟢',
    };
    const emoji = urgencyEmoji[priority.urgency] || '⚪';
    
    output += `**${priority.priority}. ${priority.action}** ${emoji}\n`;
    output += `   *Why:* ${priority.why}\n`;
    output += `   *Impact:* ${priority.impact}\n`;
    output += '\n';
  });
  
  return output.trim();
}

/**
 * Render strategic priorities from raw data (for format application)
 */
export function renderStrategicPrioritiesFromData(priorities: StrategicPriority[]): string {
  if (!priorities || priorities.length === 0) {
    return '';
  }
  
  let output = '';
  
  const sorted = [...priorities].sort((a, b) => a.priority - b.priority);
  
  sorted.forEach((priority: StrategicPriority) => {
    const urgencyEmoji: Record<string, string> = {
      immediate: '🔴',
      today: '🟡',
      this_week: '🟢',
    };
    const emoji = urgencyEmoji[priority.urgency] || '⚪';
    
    output += `**${priority.priority}. ${priority.action}** ${emoji}\n`;
    output += `   *Why:* ${priority.why}\n`;
    output += `   *Impact:* ${priority.impact}\n`;
    output += '\n';
  });
  
  return output.trim();
}

// ============================================================================
// Cross-Agent Connections Renderer
// ============================================================================

/**
 * Render cross-agent connections
 */
export function renderCrossAgentConnections(state: MultiAgentState): string {
  const synthesis = state.synthesized_insights;
  
  if (!synthesis || !synthesis.cross_agent_connections || synthesis.cross_agent_connections.length === 0) {
    return '';
  }
  
  return renderCrossAgentConnectionsFromData(synthesis.cross_agent_connections);
}

/**
 * Render cross-agent connections from raw data
 */
export function renderCrossAgentConnectionsFromData(connections: CrossAgentConnection[]): string {
  if (!connections || connections.length === 0) {
    return '';
  }
  
  let output = '';
  
  connections.forEach((connection: CrossAgentConnection) => {
    // Format agent names nicely
    const agentNames = connection.agents_involved
      .map(a => a.replace('_agent', '').replace(/_/g, ' '))
      .map(a => a.charAt(0).toUpperCase() + a.slice(1))
      .join(' + ');
    
    output += `🔗 **${agentNames}**\n`;
    output += `${connection.insight}\n`;
    
    if (connection.confidence !== undefined) {
      const confidencePercent = (connection.confidence * 100).toFixed(0);
      output += `*Confidence: ${confidencePercent}%*\n`;
    }
    
    output += '\n';
  });
  
  return output.trim();
}

// ============================================================================
// Hidden Opportunities Renderer
// ============================================================================

/**
 * Render hidden opportunities with effort badges
 */
export function renderHiddenOpportunities(state: MultiAgentState): string {
  const synthesis = state.synthesized_insights;
  
  if (!synthesis || !synthesis.hidden_opportunities || synthesis.hidden_opportunities.length === 0) {
    return '';
  }
  
  return renderHiddenOpportunitiesFromData(synthesis.hidden_opportunities);
}

/**
 * Render hidden opportunities from raw data
 */
export function renderHiddenOpportunitiesFromData(opportunities: HiddenOpportunity[]): string {
  if (!opportunities || opportunities.length === 0) {
    return '';
  }
  
  let output = '';
  
  opportunities.forEach((opp: HiddenOpportunity) => {
    const effortBadge: Record<string, string> = {
      low: '🟢 Low Effort',
      medium: '🟡 Medium Effort',
      high: '🔴 High Effort',
    };
    const badge = effortBadge[opp.effort_required] || '';
    
    output += `💡 **${opp.opportunity}** (${badge})\n`;
    output += `   ${opp.potential_value}\n\n`;
  });
  
  return output.trim();
}

// ============================================================================
// Critical Risks Renderer (formerly Risk Alerts)
// ============================================================================

/**
 * Render critical risks sorted by severity
 */
export function renderCriticalRisks(state: MultiAgentState): string {
  const synthesis = state.synthesized_insights;
  
  if (!synthesis || !synthesis.critical_risks || synthesis.critical_risks.length === 0) {
    return '';
  }
  
  return renderCriticalRisksFromData(synthesis.critical_risks);
}

/**
 * Render critical risks from raw data
 */
export function renderCriticalRisksFromData(risks: CriticalRisk[]): string {
  if (!risks || risks.length === 0) {
    return '';
  }
  
  let output = '';
  
  // Sort by severity (critical first)
  const severityOrder: Record<string, number> = { critical: 0, high: 1 };
  const sorted = [...risks].sort(
    (a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2)
  );
  
  sorted.forEach((risk: CriticalRisk) => {
    const severityEmoji: Record<string, string> = {
      critical: '🚨',
      high: '⚠️',
    };
    const emoji = severityEmoji[risk.severity] || '⚠️';
    
    output += `${emoji} **${risk.risk}**\n`;
    output += `   *Consequence:* ${risk.consequence}\n`;
    output += `   *Mitigation:* ${risk.mitigation}\n`;
    output += '\n';
  });
  
  return output.trim();
}

// Legacy alias for backward compatibility
export const renderRiskAlerts = renderCriticalRisks;
export const renderRiskAlertsFromData = renderCriticalRisksFromData;

// ============================================================================
// Details to Surface Renderer (NEW - v3)
// ============================================================================

/**
 * Get what details should be surfaced based on filtering decisions
 */
export function getDetailsToSurface(state: MultiAgentState): {
  show_multi_port_analysis: boolean;
  show_alternatives: boolean;
  show_rob_waypoints: boolean;
  show_weather_details: boolean;
  show_eca_details: boolean;
} {
  const synthesis = state.synthesized_insights;
  
  if (!synthesis || !synthesis.details_to_surface) {
    return {
      show_multi_port_analysis: false,
      show_alternatives: false,
      show_rob_waypoints: false,
      show_weather_details: false,
      show_eca_details: false,
    };
  }
  
  return synthesis.details_to_surface;
}

// ============================================================================
// Synthesis Metadata Renderer
// ============================================================================

/**
 * Render synthesis metadata for transparency
 */
export function renderSynthesisMetadata(state: MultiAgentState): string {
  const synthesis = state.synthesized_insights;
  
  if (!synthesis || !synthesis.synthesis_metadata) {
    return '';
  }
  
  const meta = synthesis.synthesis_metadata;
  
  let output = '**Synthesis Information:**\n';
  output += `- Query Type: ${synthesis.query_type}\n`;
  output += `- Agents Analyzed: ${meta.agents_analyzed?.join(', ') || 'Unknown'}\n`;
  output += `- Model: ${meta.synthesis_model || 'Unknown'}\n`;
  
  if (meta.synthesis_timestamp) {
    const date = new Date(meta.synthesis_timestamp);
    output += `- Generated: ${date.toISOString()}\n`;
  }
  
  if (meta.confidence_score !== undefined) {
    const confidence = (meta.confidence_score * 100).toFixed(0);
    output += `- Confidence: ${confidence}%\n`;
  }
  
  // Add filtering rationale
  if (meta.filtering_rationale) {
    if (meta.filtering_rationale.why_surfaced?.length > 0) {
      output += `- Surfaced: ${meta.filtering_rationale.why_surfaced.join('; ')}\n`;
    }
    if (meta.filtering_rationale.why_hidden?.length > 0) {
      output += `- Hidden: ${meta.filtering_rationale.why_hidden.join('; ')}\n`;
    }
  }
  
  return output;
}

// ============================================================================
// Legacy Compatibility - Executive Insight
// ============================================================================

/**
 * Render executive insight (legacy - now uses response object)
 * @deprecated Use renderQueryResponse instead
 */
export function renderExecutiveInsight(state: MultiAgentState): string {
  const synthesis = state.synthesized_insights;
  
  if (!synthesis || !synthesis.response) {
    return '';
  }
  
  // Map from new response format to legacy executive insight
  switch (synthesis.query_type) {
    case 'decision-required':
      return synthesis.response.decision?.action || '';
    case 'informational':
      return synthesis.response.informational?.answer || '';
    case 'validation':
      return synthesis.response.validation?.explanation || '';
    case 'comparison':
      return `${synthesis.response.comparison?.winner}: ${synthesis.response.comparison?.winner_reason}` || '';
    default:
      return '';
  }
}
