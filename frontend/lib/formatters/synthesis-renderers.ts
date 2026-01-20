/**
 * Synthesis Content Renderers
 * 
 * Format synthesized insights for display in response templates.
 */

import type { MultiAgentState } from '../multi-agent/state';

// ============================================================================
// Types (for clarity, extracted from state)
// ============================================================================

type SynthesizedInsights = NonNullable<MultiAgentState['synthesized_insights']>;
type StrategicPriority = SynthesizedInsights['strategic_priorities'][number];
type CrossAgentConnection = SynthesizedInsights['cross_agent_connections'][number];
type HiddenOpportunity = NonNullable<SynthesizedInsights['hidden_opportunities']>[number];
type RiskAlert = NonNullable<SynthesizedInsights['risk_alerts']>[number];

// ============================================================================
// Executive Insight Renderer
// ============================================================================

/**
 * Render the executive insight as a simple string
 */
export function renderExecutiveInsight(state: MultiAgentState): string {
  const synthesis = state.synthesized_insights;
  
  if (!synthesis || !synthesis.executive_insight) {
    return '';
  }
  
  return synthesis.executive_insight;
}

// ============================================================================
// Strategic Priorities Renderer
// ============================================================================

/**
 * Render strategic priorities with urgency indicators and ROI
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
      planned: '🟡',
      optional: '🟢',
    };
    const emoji = urgencyEmoji[priority.urgency] || '⚪';
    
    output += `**${priority.priority}. ${priority.action}** ${emoji}\n`;
    output += `   *Why:* ${priority.rationale}\n`;
    output += `   *Impact:* ${priority.impact}\n`;
    
    if (priority.estimated_roi) {
      output += `   *ROI:* ${priority.estimated_roi}\n`;
    }
    
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
      planned: '🟡',
      optional: '🟢',
    };
    const emoji = urgencyEmoji[priority.urgency] || '⚪';
    
    output += `**${priority.priority}. ${priority.action}** ${emoji}\n`;
    output += `   *Why:* ${priority.rationale}\n`;
    output += `   *Impact:* ${priority.impact}\n`;
    
    if (priority.estimated_roi) {
      output += `   *ROI:* ${priority.estimated_roi}\n`;
    }
    
    output += '\n';
  });
  
  return output.trim();
}

// ============================================================================
// Cross-Agent Connections Renderer
// ============================================================================

/**
 * Render cross-agent connections with type indicators
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
    const typeEmoji: Record<string, string> = {
      synergy: '🤝',
      contradiction: '⚠️',
      cause_effect: '➡️',
      alternative: '🔄',
    };
    const emoji = typeEmoji[connection.connection_type] || '🔗';
    
    // Format agent names nicely
    const agentNames = connection.agents_involved
      .map(a => a.replace('_agent', '').replace(/_/g, ' '))
      .map(a => a.charAt(0).toUpperCase() + a.slice(1))
      .join(' + ');
    
    output += `${emoji} **${agentNames}**\n`;
    output += `${connection.insight}\n`;
    
    if (connection.financial_impact) {
      output += `*Financial Impact:* ${connection.financial_impact}\n`;
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
    const badge = effortBadge[opp.effort] || '';
    
    output += `💡 **${opp.opportunity}** (${badge})\n`;
    output += `   ${opp.value}\n\n`;
  });
  
  return output.trim();
}

// ============================================================================
// Risk Alerts Renderer
// ============================================================================

/**
 * Render risk alerts sorted by severity
 */
export function renderRiskAlerts(state: MultiAgentState): string {
  const synthesis = state.synthesized_insights;
  
  if (!synthesis || !synthesis.risk_alerts || synthesis.risk_alerts.length === 0) {
    return '';
  }
  
  return renderRiskAlertsFromData(synthesis.risk_alerts);
}

/**
 * Render risk alerts from raw data
 */
export function renderRiskAlertsFromData(risks: RiskAlert[]): string {
  if (!risks || risks.length === 0) {
    return '';
  }
  
  let output = '';
  
  // Sort by severity
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...risks].sort(
    (a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4)
  );
  
  sorted.forEach((risk: RiskAlert) => {
    const severityEmoji: Record<string, string> = {
      critical: '🚨',
      high: '⚠️',
      medium: '⚡',
      low: 'ℹ️',
    };
    const emoji = severityEmoji[risk.severity] || '⚠️';
    
    output += `${emoji} **${risk.risk}**\n`;
    output += `   *How to mitigate:* ${risk.mitigation}\n`;
    
    if (risk.financial_exposure) {
      output += `   *Financial Exposure:* ${risk.financial_exposure}\n`;
    }
    
    output += '\n';
  });
  
  return output.trim();
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
  
  return output;
}
