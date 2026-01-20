/**
 * Template-Aware Response Formatter
 * 
 * Uses YAML templates to control response structure.
 * Falls back to existing formatter if no template found.
 */

import type { MultiAgentState } from '../multi-agent/state';
import { 
  formatResponse as existingFormatter, 
  type FormattedResponse 
} from './response-formatter';
import { 
  getTemplateLoader, 
  type ResponseTemplate,
  type TemplateSection,
  type BusinessRule
} from '../config/template-loader';
import { 
  extractContent, 
  getNestedValue as extractNestedValue,
  formatCostSummary as extractCostSummary,
  formatAlternativePort as extractAlternativePort
} from './content-extractors';
import { 
  getInsightExtractor, 
  type ExtractedInsight 
} from './insight-extractor';

// ============================================================================
// Extended Response Interface
// ============================================================================

export interface TemplateFormattedResponse extends FormattedResponse {
  // Metadata about template used
  template_metadata?: {
    query_type: string;
    template_name: string;
    version: string;
    sections_count: number;
    rules_applied: number;
  };
  
  // Organized sections by tier
  sections_by_tier?: {
    tier_1_visible: RenderedSection[];
    tier_2_expandable: RenderedSection[];
    tier_3_technical: RenderedSection[];
  };
  
  // Extracted insights (auto-identified from state)
  insights?: ExtractedInsight[];
}

export interface RenderedSection {
  id: string;
  title: string;
  tier: 1 | 2 | 3;
  priority: number;
  visible: boolean;
  collapsed: boolean;
  content: string;
  word_count: number;
  truncated: boolean;
}

// ============================================================================
// Main Formatter Function
// ============================================================================

/**
 * Format response using template configuration
 */
export function formatResponseWithTemplate(
  state: MultiAgentState,
  queryType?: string
): TemplateFormattedResponse {
  
  console.log(`🎨 [TEMPLATE-FORMATTER] Starting with query type: ${queryType || 'auto-detect'}`);
  
  // Step 1: Detect query type if not provided
  const detectedQueryType = queryType || detectQueryType(state);
  console.log(`🔍 [TEMPLATE-FORMATTER] Detected: ${detectedQueryType}`);
  
  // Step 2: Load template
  const loader = getTemplateLoader();
  const template = loader.loadTemplate(detectedQueryType);
  
  if (!template) {
    console.log(`⚠️ [TEMPLATE-FORMATTER] No template for ${detectedQueryType}, using default`);
    
    // Fallback to existing formatter
    return {
      ...existingFormatter(state),
      template_metadata: {
        query_type: detectedQueryType,
        template_name: 'default',
        version: '1.0.0',
        sections_count: 0,
        rules_applied: 0,
      },
    };
  }
  
  console.log(`✅ [TEMPLATE-FORMATTER] Using: ${template.template.name} v${template.template.version}`);
  
  // Step 3: Deep clone template to avoid mutating cached version
  const workingTemplate = deepCloneTemplate(template);
  
  // Step 4: Apply business rules (modifies working template)
  const rulesApplied = applyBusinessRules(state, workingTemplate);
  console.log(`📋 [TEMPLATE-FORMATTER] Applied ${rulesApplied} rules`);
  
  // Step 5: Render sections by tier
  const sectionsByTier = renderSectionsByTier(state, workingTemplate);
  console.log(`📊 [TEMPLATE-FORMATTER] Rendered: T1=${sectionsByTier.tier_1_visible.length}, T2=${sectionsByTier.tier_2_expandable.length}, T3=${sectionsByTier.tier_3_technical.length}`);
  
  // Step 6: Build text output from sections
  const textOutput = buildTextFromSections(sectionsByTier);
  
  // Step 7: Extract insights from state
  const extractor = getInsightExtractor();
  const insights = extractor.extractInsights(state);
  console.log(`💡 [TEMPLATE-FORMATTER] Extracted ${insights.length} insights`);
  
  // Step 8: Get structured data from existing formatter
  const existingResponse = existingFormatter(state);
  
  // Step 9: Build final text with insights prepended if critical
  const criticalInsights = insights.filter(i => i.priority === 'critical');
  const finalText = criticalInsights.length > 0
    ? buildTextWithInsights(criticalInsights, textOutput)
    : textOutput;
  
  return {
    ...existingResponse,
    text: finalText,
    template_metadata: {
      query_type: detectedQueryType,
      template_name: template.template.name,
      version: template.template.version,
      sections_count: 
        sectionsByTier.tier_1_visible.length +
        sectionsByTier.tier_2_expandable.length +
        sectionsByTier.tier_3_technical.length,
      rules_applied: rulesApplied,
    },
    sections_by_tier: sectionsByTier,
    insights: insights,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build text output with critical insights prepended
 */
function buildTextWithInsights(criticalInsights: ExtractedInsight[], baseText: string): string {
  if (criticalInsights.length === 0) {
    return baseText;
  }
  
  let insightsSection = '## ⚠️ Critical Alerts\n\n';
  
  for (const insight of criticalInsights) {
    insightsSection += `${insight.message}\n\n`;
  }
  
  insightsSection += '---\n\n';
  
  return insightsSection + baseText;
}

/**
 * Deep clone template to avoid mutating cached version
 */
function deepCloneTemplate(template: ResponseTemplate): ResponseTemplate {
  return JSON.parse(JSON.stringify(template));
}

/**
 * Auto-detect query type from state
 */
function detectQueryType(state: MultiAgentState): string {
  // Check which agents ran successfully
  const agentsCalled = new Set<string>();
  
  if (state.agent_status) {
    Object.entries(state.agent_status).forEach(([agent, status]) => {
      if (status === 'success') {
        agentsCalled.add(agent);
      }
    });
  }
  
  // Detection logic
  if (agentsCalled.has('bunker_agent')) {
    return 'bunker-planning';
  }
  
  if (agentsCalled.has('route_agent') && !agentsCalled.has('weather_agent') && !agentsCalled.has('bunker_agent')) {
    return 'route-only';
  }
  
  if (agentsCalled.has('cii_agent')) {
    return 'cii-rating';
  }
  
  if (agentsCalled.has('hull_agent')) {
    return 'hull-performance';
  }
  
  // Default to bunker-planning
  return 'bunker-planning';
}

/**
 * Apply business rules from template
 */
function applyBusinessRules(
  state: MultiAgentState,
  template: ResponseTemplate
): number {
  if (!template.template.business_rules) {
    return 0;
  }
  
  let rulesApplied = 0;
  
  for (const rule of template.template.business_rules) {
    try {
      const conditionMet = evaluateCondition(rule.condition, state);
      
      if (conditionMet) {
        console.log(`✅ [RULE] ${rule.name}: condition met, action=${rule.action}`);
        applyRuleAction(rule, template);
        rulesApplied++;
      } else {
        console.log(`⏭️ [RULE] ${rule.name}: condition not met`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ [RULE] Error in ${rule.name}:`, message);
    }
  }
  
  return rulesApplied;
}

/**
 * Evaluate condition expression against state
 */
function evaluateCondition(condition: string, state: MultiAgentState): boolean {
  try {
    // Handle common condition patterns
    // In production, use a proper expression evaluator or sandboxed eval
    
    // Pattern: "rob_safety_status && !rob_safety_status.overall_safe"
    if (condition.includes('rob_safety_status') && condition.includes('!') && condition.includes('overall_safe')) {
      return !!(state.rob_safety_status && !state.rob_safety_status.overall_safe);
    }
    
    // Pattern: "rob_safety_status && rob_safety_status.overall_safe"
    if (condition.includes('rob_safety_status') && condition.includes('overall_safe') && !condition.includes('!')) {
      return !!(state.rob_safety_status && state.rob_safety_status.overall_safe);
    }
    
    // Pattern: "bunker_analysis && bunker_analysis.alternatives && bunker_analysis.alternatives.length > 0"
    if (condition.includes('bunker_analysis.alternatives') && condition.includes('length')) {
      const alternatives = (state.bunker_analysis as any)?.alternatives;
      return !!(alternatives && alternatives.length > 0);
    }
    
    // Pattern: "!bunker_analysis || !bunker_analysis.alternatives || bunker_analysis.alternatives.length === 0"
    if (condition.includes('!bunker_analysis') || condition.includes('=== 0')) {
      const alternatives = (state.bunker_analysis as any)?.alternatives;
      return !(alternatives && alternatives.length > 0);
    }
    
    // Pattern: "compliance_data && compliance_data.eca_zones && compliance_data.eca_zones.has_eca_zones"
    if (condition.includes('compliance_data') && condition.includes('eca_zones') && condition.includes('has_eca_zones') && !condition.includes('!')) {
      return !!(state.compliance_data?.eca_zones?.has_eca_zones);
    }
    
    // Pattern: "!compliance_data || !compliance_data.eca_zones || !compliance_data.eca_zones.has_eca_zones"
    if (condition.includes('!compliance_data') || condition.includes('!eca_zones') || condition.includes('!has_eca_zones')) {
      return !(state.compliance_data?.eca_zones?.has_eca_zones);
    }
    
    // Pattern: "rob_tracking"
    if (condition === 'rob_tracking') {
      return !!state.rob_tracking;
    }
    
    // Pattern: "rob_waypoints && rob_waypoints.length > 0"
    if (condition.includes('rob_waypoints') && condition.includes('length')) {
      return !!(state.rob_waypoints && state.rob_waypoints.length > 0);
    }
    
    // Pattern: "bunker_ports && bunker_ports.length > 2"
    if (condition.includes('bunker_ports') && condition.includes('length > 2')) {
      return !!(state.bunker_ports && state.bunker_ports.length > 2);
    }
    
    // Pattern: "weather_forecast"
    if (condition === 'weather_forecast') {
      return !!state.weather_forecast;
    }
    
    // ========================================================================
    // SYNTHESIZED INSIGHTS CONDITIONS
    // ========================================================================
    
    // Pattern: "synthesized_insights && synthesized_insights.executive_insight"
    if (condition.includes('synthesized_insights') && condition.includes('executive_insight') && !condition.includes('some(')) {
      return !!(state.synthesized_insights?.executive_insight);
    }
    
    // Pattern: "synthesized_insights && synthesized_insights.strategic_priorities && synthesized_insights.strategic_priorities.length > 0"
    if (condition.includes('synthesized_insights') && condition.includes('strategic_priorities') && condition.includes('length')) {
      return !!(state.synthesized_insights?.strategic_priorities && 
                state.synthesized_insights.strategic_priorities.length > 0);
    }
    
    // Pattern: "synthesized_insights && synthesized_insights.cross_agent_connections && synthesized_insights.cross_agent_connections.length > 0"
    if (condition.includes('synthesized_insights') && condition.includes('cross_agent_connections') && condition.includes('length')) {
      return !!(state.synthesized_insights?.cross_agent_connections && 
                state.synthesized_insights.cross_agent_connections.length > 0);
    }
    
    // Pattern: "synthesized_insights && synthesized_insights.hidden_opportunities && synthesized_insights.hidden_opportunities.length > 0"
    if (condition.includes('synthesized_insights') && condition.includes('hidden_opportunities') && condition.includes('length')) {
      return !!(state.synthesized_insights?.hidden_opportunities && 
                state.synthesized_insights.hidden_opportunities.length > 0);
    }
    
    // Pattern: "synthesized_insights && synthesized_insights.risk_alerts && synthesized_insights.risk_alerts.length > 0"
    if (condition.includes('synthesized_insights') && condition.includes('risk_alerts') && condition.includes('length') && !condition.includes('some(')) {
      return !!(state.synthesized_insights?.risk_alerts && 
                state.synthesized_insights.risk_alerts.length > 0);
    }
    
    // Pattern: "synthesized_insights && synthesized_insights.risk_alerts && synthesized_insights.risk_alerts.some(r => r.severity === 'critical')"
    if (condition.includes('synthesized_insights') && condition.includes('risk_alerts') && condition.includes("severity === 'critical'")) {
      const riskAlerts = state.synthesized_insights?.risk_alerts;
      if (!riskAlerts || !Array.isArray(riskAlerts)) {
        return false;
      }
      return riskAlerts.some((r: any) => r.severity === 'critical');
    }
    
    // Pattern: "synthesized_insights && synthesized_insights.synthesis_metadata"
    if (condition.includes('synthesized_insights') && condition.includes('synthesis_metadata')) {
      return !!(state.synthesized_insights?.synthesis_metadata);
    }
    
    // ========================================================================
    // ROB TRACKING CONDITIONS (P0-5)
    // ========================================================================
    // Note: rob_tracking can be either ROBTrackingOutput or enhanced structure
    // Cast to any for dynamic property access
    
    // Pattern: "rob_tracking" - simple check for existence
    if (condition === 'rob_tracking') {
      return !!(state.rob_tracking);
    }
    
    // Cast to any for enhanced properties
    const robTracking = state.rob_tracking as any;
    
    // Pattern: "rob_tracking && !rob_tracking.overall_safe"
    if (condition.includes('rob_tracking') && condition.includes('!rob_tracking.overall_safe')) {
      return !!(robTracking && !robTracking.overall_safe);
    }
    
    // Pattern: "rob_tracking && rob_tracking.overall_safe"
    if (condition.includes('rob_tracking') && condition.includes('rob_tracking.overall_safe') && !condition.includes('!')) {
      return !!(robTracking?.overall_safe);
    }
    
    // Pattern: "rob_tracking && rob_tracking.with_bunker_still_unsafe"
    if (condition.includes('rob_tracking') && condition.includes('with_bunker_still_unsafe')) {
      return !!(robTracking?.with_bunker_still_unsafe);
    }
    
    // Pattern: "rob_tracking && rob_tracking.without_bunker"
    if (condition.includes('rob_tracking') && condition.includes('without_bunker') && !condition.includes('overall_safe')) {
      return !!(robTracking?.without_bunker);
    }
    
    // Pattern: "rob_tracking && !rob_tracking.without_bunker.overall_safe"
    if (condition.includes('rob_tracking') && condition.includes('without_bunker') && condition.includes('!') && condition.includes('overall_safe')) {
      return !!(robTracking?.without_bunker && !robTracking.without_bunker.overall_safe);
    }
    
    // Pattern: "rob_tracking && rob_tracking.without_bunker.overall_safe"
    if (condition.includes('rob_tracking') && condition.includes('without_bunker') && condition.includes('overall_safe') && !condition.includes('!')) {
      return !!(robTracking?.without_bunker?.overall_safe);
    }
    
    // Pattern: "rob_tracking && rob_tracking.with_bunker"
    if (condition.includes('rob_tracking') && condition.includes('with_bunker') && !condition.includes('still_unsafe') && !condition.includes('overall_safe')) {
      return !!(robTracking?.with_bunker);
    }
    
    // Pattern: "rob_tracking && !rob_tracking.with_bunker.overall_safe"
    if (condition.includes('rob_tracking') && condition.includes('with_bunker') && condition.includes('!') && condition.includes('overall_safe')) {
      return !!(robTracking?.with_bunker && !robTracking.with_bunker.overall_safe);
    }
    
    // Pattern: "rob_tracking && rob_tracking.days_until_empty"
    if (condition.includes('rob_tracking') && condition.includes('days_until_empty')) {
      return !!(robTracking?.days_until_empty || robTracking?.without_bunker?.days_until_empty);
    }
    
    // ========================================================================
    // MULTI-BUNKER PLAN CONDITIONS
    // ========================================================================
    
    // Pattern: "multi_bunker_plan && multi_bunker_plan.required && multi_bunker_plan.best_plan"
    // Note: Check for best_plan first (more specific pattern)
    if (condition.includes('multi_bunker_plan') && condition.includes('required') && condition.includes('best_plan')) {
      return !!(state.multi_bunker_plan && state.multi_bunker_plan.required && state.multi_bunker_plan.best_plan);
    }
    
    // Pattern: "multi_bunker_plan && multi_bunker_plan.required"
    if (condition.includes('multi_bunker_plan') && condition.includes('required')) {
      return !!(state.multi_bunker_plan && state.multi_bunker_plan.required);
    }
    
    // Pattern: "multi_bunker_plan" (simple existence check)
    if (condition === 'multi_bunker_plan') {
      return !!state.multi_bunker_plan;
    }
    
    // Default: false for safety
    console.warn(`⚠️ [CONDITION] Unknown pattern: ${condition}`);
    return false;
    
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error evaluating condition: ${condition}`, message);
    return false;
  }
}

/**
 * Apply rule action to template
 */
function applyRuleAction(rule: BusinessRule, template: ResponseTemplate): void {
  const section = template.template.sections.find(s => s.id === rule.target);
  
  if (!section) {
    console.warn(`⚠️ [RULE] Target section "${rule.target}" not found`);
    return;
  }
  
  switch (rule.action) {
    case 'move_to_tier_1':
      section.tier = 1;
      section.visibility = 'always';
      section.priority = 0; // Highest priority
      console.log(`📌 [RULE] Moved "${section.id}" to Tier 1`);
      break;
      
    case 'hide':
      section.visibility = 'conditional';
      // Mark as hidden by setting a special condition that always fails
      section.condition = '__hidden__';
      console.log(`👁️ [RULE] Hidden "${section.id}"`);
      break;
      
    case 'show':
      section.visibility = 'always';
      section.condition = undefined;
      console.log(`👁️ [RULE] Shown "${section.id}"`);
      break;
      
    case 'expand':
      section.collapsed = false;
      console.log(`📖 [RULE] Expanded "${section.id}"`);
      break;
      
    case 'collapse':
      section.collapsed = true;
      console.log(`📕 [RULE] Collapsed "${section.id}"`);
      break;
  }
}

/**
 * Render all sections organized by tier
 */
function renderSectionsByTier(
  state: MultiAgentState,
  template: ResponseTemplate
): {
  tier_1_visible: RenderedSection[];
  tier_2_expandable: RenderedSection[];
  tier_3_technical: RenderedSection[];
} {
  const result = {
    tier_1_visible: [] as RenderedSection[],
    tier_2_expandable: [] as RenderedSection[],
    tier_3_technical: [] as RenderedSection[],
  };
  
  for (const section of template.template.sections) {
    // Check if section should be rendered
    if (!shouldRenderSection(section, state)) {
      console.log(`⏭️ [SECTION] Skipping "${section.id}" (condition not met)`);
      continue;
    }
    
    // Render section content
    const content = renderSectionContent(section, state);
    
    // Skip sections with no content
    if (!content || content.trim() === '') {
      console.log(`⏭️ [SECTION] Skipping "${section.id}" (no content)`);
      continue;
    }
    
    // Calculate word count
    const wordCount = content.split(/\s+/).length;
    
    // Check if truncated
    const truncated = section.max_words ? wordCount > section.max_words : false;
    const finalContent = truncated 
      ? content.split(/\s+/).slice(0, section.max_words).join(' ') + '...'
      : content;
    
    const renderedSection: RenderedSection = {
      id: section.id,
      title: section.title,
      tier: section.tier,
      priority: section.priority,
      visible: section.visibility === 'always',
      collapsed: section.collapsed ?? true,
      content: finalContent,
      word_count: finalContent.split(/\s+/).length,
      truncated,
    };
    
    // Add to appropriate tier
    if (section.tier === 1) {
      result.tier_1_visible.push(renderedSection);
    } else if (section.tier === 2) {
      result.tier_2_expandable.push(renderedSection);
    } else if (section.tier === 3) {
      result.tier_3_technical.push(renderedSection);
    }
  }
  
  // Sort each tier by priority
  result.tier_1_visible.sort((a, b) => a.priority - b.priority);
  result.tier_2_expandable.sort((a, b) => a.priority - b.priority);
  result.tier_3_technical.sort((a, b) => a.priority - b.priority);
  
  return result;
}

/**
 * Check if section should be rendered
 */
function shouldRenderSection(section: TemplateSection, state: MultiAgentState): boolean {
  // Check for hidden marker from business rules
  if (section.condition === '__hidden__') {
    return false;
  }
  
  if (section.visibility === 'conditional' && section.condition) {
    return evaluateCondition(section.condition, state);
  }
  return true;
}

/**
 * Render section content from state data
 * 
 * Uses content extractors to pull data from state and format it
 * based on the template configuration.
 */
function renderSectionContent(section: TemplateSection, state: MultiAgentState): string {
  try {
    const statePath = section.content_source.state_path;
    const format = section.content_source.format;
    
    // Use content extractors for data extraction and formatting
    const content = extractContent(statePath, state, format);
    
    // If no content from extractor, try fallback
    if (!content || content.trim() === '') {
      // Try section-specific formatters as fallback
      const fallbackContent = formatDefaultContent(section, null, state);
      if (fallbackContent && fallbackContent.trim() !== '') {
        return fallbackContent;
      }
      return section.content_source.fallback || '';
    }
    
    return content;
    
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ [RENDER] Error rendering ${section.id}:`, message);
    return section.content_source.fallback || '';
  }
}

/**
 * Get data from state based on path
 */
function getStateData(state: MultiAgentState, path: string | string[]): any {
  const paths = Array.isArray(path) ? path : [path];
  
  for (const p of paths) {
    const value = getNestedValue(state, p);
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  
  return null;
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    // Handle array access like "alternatives[0]"
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      current = current?.[key]?.[parseInt(index, 10)];
    } else {
      current = current?.[part];
    }
    
    if (current === undefined || current === null) {
      return null;
    }
  }
  
  return current;
}

/**
 * Render template with data
 */
function renderTemplate(template: string, data: any): string {
  // Simple template rendering - replace {key} with data[key]
  return template.replace(/\{([^}]+)\}/g, (match, key) => {
    // Handle formatting like {value:,.0f}
    const [keyName, format] = key.split(':');
    const value = getNestedValue(data, keyName.trim());
    
    if (value === undefined || value === null) {
      return match; // Keep placeholder if no value
    }
    
    if (format) {
      return formatValue(value, format);
    }
    
    return String(value);
  });
}

/**
 * Format value based on format string
 */
function formatValue(value: any, format: string): string {
  // Handle number formatting like ",.0f"
  if (typeof value === 'number') {
    if (format.includes(',')) {
      return value.toLocaleString('en-US', {
        maximumFractionDigits: format.includes('.0') ? 0 : 2,
      });
    }
    if (format.includes('.1')) {
      return value.toFixed(1);
    }
    if (format.includes('.0')) {
      return value.toFixed(0);
    }
  }
  
  return String(value);
}

/**
 * Format data for section based on type
 */
function formatDataForSection(section: TemplateSection, data: any, state: MultiAgentState): string {
  const format = section.content_source.format;
  
  switch (format) {
    case 'table':
      return formatAsTable(data);
    case 'comparison_table':
      return formatAsComparisonTable(data);
    case 'timeline':
      return formatAsTimeline(data);
    case 'waypoints_list':
      return formatAsWaypointsList(data);
    case 'detailed_weather':
      return formatAsDetailedWeather(data);
    default:
      return formatDefaultContent(section, data, state);
  }
}

/**
 * Format data as table
 */
function formatAsTable(data: any[]): string {
  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }
  
  // Simple table formatting
  const headers = Object.keys(data[0]);
  let output = '| ' + headers.join(' | ') + ' |\n';
  output += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
  
  for (const row of data) {
    output += '| ' + headers.map(h => String(row[h] ?? '')).join(' | ') + ' |\n';
  }
  
  return output;
}

/**
 * Format data as comparison table
 */
function formatAsComparisonTable(data: any[]): string {
  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }
  
  let output = '| Port | Fuel Cost | Deviation | Total Cost | Rank |\n';
  output += '|------|-----------|-----------|------------|------|\n';
  
  for (const port of data.slice(0, 5)) {
    const fuelCost = port.fuel_cost_usd || port.fuel_cost || 0;
    const deviation = port.deviation_cost_usd || port.deviation_cost || 0;
    const total = port.total_cost_usd || port.total_cost || 0;
    const rank = port.rank || '-';
    
    output += `| ${port.port_name || port.port_code} `;
    output += `| $${fuelCost.toLocaleString('en-US', { maximumFractionDigits: 0 })} `;
    output += `| $${deviation.toLocaleString('en-US', { maximumFractionDigits: 0 })} `;
    output += `| **$${total.toLocaleString('en-US', { maximumFractionDigits: 0 })}** `;
    output += `| ${rank} |\n`;
  }
  
  return output;
}

/**
 * Format data as timeline
 */
function formatAsTimeline(data: any[]): string {
  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }
  
  let output = '';
  
  for (const point of data) {
    const hours = Math.floor(point.time_from_start_hours || 0);
    const minutes = Math.round(((point.time_from_start_hours || 0) % 1) * 60);
    const emoji = point.action === 'SWITCH_TO_MGO' ? '🔴' : '🟢';
    
    output += `${emoji} **${hours}h ${minutes}m** - ${point.action?.replace(/_/g, ' ') || 'Event'}\n`;
    if (point.location) {
      output += `   Location: ${point.location.lat?.toFixed(2)}°N, ${Math.abs(point.location.lon || 0).toFixed(2)}°${(point.location.lon || 0) >= 0 ? 'E' : 'W'}\n`;
    }
    output += '\n';
  }
  
  return output;
}

/**
 * Format data as waypoints list
 */
function formatAsWaypointsList(data: any[]): string {
  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }
  
  let output = '';
  
  for (let i = 0; i < data.length; i++) {
    const wp = data[i];
    const lat = wp.lat ?? wp[0];
    const lon = wp.lon ?? wp[1];
    
    if (lat !== undefined && lon !== undefined) {
      output += `${i + 1}. ${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E\n`;
    }
  }
  
  return output;
}

/**
 * Format detailed weather data
 */
function formatAsDetailedWeather(data: any): string {
  if (!data) {
    return '';
  }
  
  let output = '';
  
  if (Array.isArray(data)) {
    for (const point of data.slice(0, 5)) {
      output += `**${point.datetime || 'Unknown time'}**\n`;
      if (point.weather) {
        output += `  Wave Height: ${point.weather.wave_height_m?.toFixed(1) || '-'} m\n`;
        output += `  Wind Speed: ${point.weather.wind_speed_knots?.toFixed(0) || '-'} kts\n`;
        output += `  Sea State: ${point.weather.sea_state || '-'}\n`;
      }
      output += '\n';
    }
  }
  
  return output;
}

/**
 * Format default content for a section
 */
function formatDefaultContent(section: TemplateSection, data: any, state: MultiAgentState): string {
  // Handle specific section IDs with fallback formatters
  switch (section.id) {
    case 'primary_recommendation':
      return formatPrimaryRecommendation(state);
    case 'cost_summary':
      // Use extractor version which takes bunker_analysis
      return extractCostSummary(state.bunker_analysis);
    case 'critical_safety_alert':
      return formatSafetyAlert(state);
    case 'alternative_port':
      // Use extractor version which takes bunker_analysis
      return extractAlternativePort(state.bunker_analysis);
    case 'why_this_recommendation':
      return formatWhyRecommendation(state);
    case 'rob_tracking_summary':
      return formatROBSummary(state);
    case 'eca_compliance_summary':
      return formatECASummary(state);
    case 'route_summary':
      return formatRouteSummary(state);
    default:
      // Generic formatting - data may be null here
      if (data && typeof data === 'object') {
        return JSON.stringify(data, null, 2);
      }
      return data ? String(data) : '';
  }
}

// ============================================================================
// Section-Specific Formatters
// ============================================================================

function formatPrimaryRecommendation(state: MultiAgentState): string {
  const best = state.bunker_analysis?.best_option;
  if (!best) return '';
  
  let output = `**Recommended Port:** ${best.port_name} (${best.port_code})\n`;
  output += `**Estimated Cost:** $${(best.total_cost_usd || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}\n\n`;
  
  output += '**Why this port:**\n';
  output += `- Lowest total cost among ${state.bunker_analysis?.recommendations?.length || 0} ports analyzed\n`;
  
  if (best.distance_from_route_nm !== undefined && best.distance_from_route_nm < 10) {
    output += '- Minimal deviation from planned route\n';
  }
  
  if (state.port_weather_status) {
    const portWeather = state.port_weather_status.find(p => p.port_code === best.port_code);
    if (portWeather?.bunkering_feasible) {
      output += '- Safe weather conditions for bunkering\n';
    }
  }
  
  return output;
}

function formatSafetyAlert(state: MultiAgentState): string {
  if (!state.rob_safety_status || state.rob_safety_status.overall_safe) {
    return '';
  }
  
  let output = '**WARNING:** Safety concerns detected for this voyage.\n\n';
  
  for (const violation of state.rob_safety_status.violations) {
    output += `- ${violation}\n`;
  }
  
  output += '\n**Action Required:** Review fuel requirements and consider alternative bunkering options.';
  
  return output;
}

function formatWhyRecommendation(state: MultiAgentState): string {
  let output = '';
  
  // Vessel info
  if (state.vessel_profile) {
    const vp = state.vessel_profile;
    output += '**Your Vessel:**\n';
    output += `- Current ROB: ${vp.initial_rob?.VLSFO?.toFixed(0) || '-'} MT VLSFO, ${vp.initial_rob?.LSMGO?.toFixed(0) || '-'} MT LSMGO\n`;
    output += `- Tank Capacity: ${vp.capacity?.VLSFO?.toFixed(0) || '-'} MT VLSFO, ${vp.capacity?.LSMGO?.toFixed(0) || '-'} MT LSMGO\n`;
    output += `- Consumption: ${vp.consumption_vlsfo_per_day?.toFixed(1) || '-'} MT/day VLSFO, ${vp.consumption_lsmgo_per_day?.toFixed(1) || '-'} MT/day LSMGO\n\n`;
  }
  
  // Voyage requirements
  if (state.route_data) {
    const rd = state.route_data;
    const days = (rd.estimated_hours / 24).toFixed(1);
    output += '**Voyage Requirements:**\n';
    output += `- Distance: ${rd.distance_nm.toLocaleString('en-US', { maximumFractionDigits: 0 })} nm (~${days} days)\n`;
  }
  
  // ECA requirements
  if (state.eca_summary) {
    output += `- ECA Distance: ${state.eca_summary.eca_distance_nm.toFixed(0)} nm (${state.eca_summary.eca_percentage.toFixed(1)}% of route)\n`;
    output += `- MGO Required: ${state.eca_summary.total_lsmgo_mt.toFixed(0)} MT\n`;
  }
  
  return output;
}

function formatROBSummary(state: MultiAgentState): string {
  if (!state.rob_tracking) return '';
  
  const rt = state.rob_tracking;
  const safe = rt.overall_safe;
  
  let output = `**Voyage Safety:** ${safe ? '✅ Safe' : '⚠️ Warning'}\n`;
  
  if (state.rob_safety_status) {
    output += `**Minimum Safety Margin:** ${state.rob_safety_status.minimum_rob_days.toFixed(1)} days\n\n`;
  }
  
  output += '**Key Points:**\n';
  output += `- Final ROB: ${rt.final_rob.VLSFO.toFixed(0)} MT VLSFO, ${rt.final_rob.LSMGO.toFixed(0)} MT LSMGO\n`;
  
  if (state.rob_waypoints && state.rob_waypoints.length > 0) {
    const first = state.rob_waypoints[0];
    const last = state.rob_waypoints[state.rob_waypoints.length - 1];
    output += `- Departure: ${first.rob_after_action.VLSFO.toFixed(0)} MT VLSFO\n`;
    output += `- At Destination: ${last.rob_after_action.VLSFO.toFixed(0)} MT VLSFO (${last.safety_margin_days.toFixed(1)} days margin)\n`;
  }
  
  return output;
}

function formatECASummary(state: MultiAgentState): string {
  const eca = state.compliance_data?.eca_zones;
  if (!eca || !eca.has_eca_zones) return '';
  
  let output = `**ECA Zones Crossed:** ${eca.eca_zones_crossed.length}\n`;
  output += `**Total MGO Required:** ${eca.fuel_requirements.mgo_with_safety_margin_mt.toFixed(0)} MT\n\n`;
  
  output += '**Zones:**\n';
  for (const zone of eca.eca_zones_crossed) {
    output += `- ${zone.zone_name}: ${zone.distance_in_zone_nm.toFixed(0)} nm, ${zone.estimated_mgo_consumption_mt.toFixed(0)} MT MGO\n`;
  }
  
  output += '\n*Fuel switching managed by crew as per standard procedures*';
  
  return output;
}

function formatRouteSummary(state: MultiAgentState): string {
  if (!state.route_data) return '';
  
  const rd = state.route_data;
  const days = (rd.estimated_hours / 24).toFixed(1);
  
  let output = `**Origin:** ${rd.origin_port_code}\n`;
  output += `**Destination:** ${rd.destination_port_code}\n`;
  output += `**Distance:** ${rd.distance_nm.toLocaleString('en-US', { maximumFractionDigits: 0 })} nm\n`;
  output += `**Estimated Duration:** ${rd.estimated_hours.toFixed(0)} hours (~${days} days)\n`;
  output += `**Route Type:** ${rd.route_type || 'Direct'}\n`;
  
  return output;
}

/**
 * Build text output from rendered sections
 */
function buildTextFromSections(sectionsByTier: {
  tier_1_visible: RenderedSection[];
  tier_2_expandable: RenderedSection[];
  tier_3_technical: RenderedSection[];
}): string {
  const parts: string[] = [];
  
  // Tier 1: Always visible
  for (const section of sectionsByTier.tier_1_visible) {
    parts.push(`## ${section.title}\n\n${section.content}\n`);
  }
  
  // Tier 2: Expandable (Key Insights)
  if (sectionsByTier.tier_2_expandable.length > 0) {
    parts.push('\n---\n');
    parts.push('### Key Insights\n');
    for (const section of sectionsByTier.tier_2_expandable) {
      const openAttr = section.collapsed ? '' : ' open';
      parts.push(`<details${openAttr}>\n<summary><strong>${section.title}</strong></summary>\n\n${section.content}\n</details>\n\n`);
    }
  }
  
  // Tier 3: Technical expandable
  if (sectionsByTier.tier_3_technical.length > 0) {
    parts.push('\n---\n');
    parts.push('### Technical Details\n');
    for (const section of sectionsByTier.tier_3_technical) {
      const openAttr = section.collapsed ? '' : ' open';
      parts.push(`<details${openAttr}>\n<summary><strong>${section.title}</strong></summary>\n\n${section.content}\n</details>\n\n`);
    }
  }
  
  return parts.join('\n');
}
