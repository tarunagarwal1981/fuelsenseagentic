/**
 * Insight Extractor
 * 
 * Auto-identifies actionable insights from MultiAgentState data.
 * Uses YAML-based rules for configurable insight extraction.
 */

import type { MultiAgentState } from '../multi-agent/state';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// ============================================================================
// Types
// ============================================================================

export interface ExtractedInsight {
  id: string;
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  metadata?: Record<string, any>;
}

interface InsightRule {
  id: string;
  category: string;
  priority: string;
  condition: string;
  template: string;
}

interface InsightRulesConfig {
  insights: InsightRule[];
}

// ============================================================================
// Insight Extractor Class
// ============================================================================

export class InsightExtractor {
  private rules: InsightRule[] = [];
  
  constructor() {
    this.loadRules();
  }
  
  /**
   * Load insight rules from YAML configuration
   */
  private loadRules(): void {
    const rulesPath = path.join(process.cwd(), 'config', 'insights', 'extraction-rules.yaml');
    
    if (!fs.existsSync(rulesPath)) {
      console.warn('⚠️ [INSIGHTS] Rules file not found:', rulesPath);
      return;
    }
    
    try {
      const content = fs.readFileSync(rulesPath, 'utf8');
      const data = yaml.load(content) as InsightRulesConfig;
      this.rules = data.insights || [];
      console.log(`✅ [INSIGHTS] Loaded ${this.rules.length} insight rules`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('❌ [INSIGHTS] Error loading rules:', message);
    }
  }
  
  /**
   * Extract all applicable insights from state
   */
  public extractInsights(state: MultiAgentState): ExtractedInsight[] {
    const insights: ExtractedInsight[] = [];
    
    for (const rule of this.rules) {
      try {
        if (this.evaluateCondition(rule.condition, state)) {
          const message = this.renderTemplate(rule.template, state);
          const metadata = this.extractMetadata(rule, state);
          
          insights.push({
            id: rule.id,
            category: rule.category,
            priority: rule.priority as ExtractedInsight['priority'],
            message,
            metadata,
          });
          
          console.log(`💡 [INSIGHT] Matched: ${rule.id}`);
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`❌ [INSIGHT] Error evaluating ${rule.id}:`, msg);
      }
    }
    
    // Sort by priority (critical first)
    const priorityOrder: Record<string, number> = { 
      critical: 0, 
      high: 1, 
      medium: 2, 
      low: 3 
    };
    insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    
    console.log(`📊 [INSIGHTS] Extracted ${insights.length} insights from ${this.rules.length} rules`);
    return insights;
  }
  
  /**
   * Evaluate a condition expression against state
   */
  private evaluateCondition(condition: string, state: MultiAgentState): boolean {
    try {
      // Handle bunker analysis conditions
      if (condition.includes('bunker_analysis.max_savings_usd')) {
        const threshold = this.extractNumber(condition);
        return (state.bunker_analysis?.max_savings_usd || 0) > threshold;
      }
      
      if (condition.includes('bunker_analysis.best_option.deviation_cost_usd')) {
        const threshold = this.extractNumber(condition);
        return ((state.bunker_analysis?.best_option as any)?.deviation_cost_usd || 999999) < threshold;
      }
      
      if (condition.includes('bunker_analysis.best_option.distance_from_route_nm')) {
        const threshold = this.extractNumber(condition);
        return (state.bunker_analysis?.best_option?.distance_from_route_nm || 999) < threshold;
      }
      
      // Handle ROB tracking conditions
      if (condition.includes('rob_tracking.minimum_rob_mt < 0')) {
        return ((state.rob_tracking as any)?.minimum_rob_mt || 0) < 0;
      }
      
      // Handle ROB safety status conditions
      if (condition.includes('rob_safety_status.minimum_rob_days')) {
        const margin = state.rob_safety_status?.minimum_rob_days;
        if (margin === undefined) return false;
        
        if (condition.includes('>= 3') && condition.includes('< 5')) {
          return margin >= 3 && margin < 5;
        }
        if (condition.includes('< 3')) {
          return margin < 3;
        }
        if (condition.includes('< 5')) {
          return margin < 5;
        }
      }
      
      if (condition.includes('rob_safety_status.violations.length > 0')) {
        return (state.rob_safety_status?.violations?.length || 0) > 0;
      }
      
      // Handle compliance conditions
      if (condition.includes('compliance_data.eca_zones.has_eca_zones')) {
        return state.compliance_data?.eca_zones?.has_eca_zones === true;
      }
      
      if (condition.includes('compliance_data.eca_zones.fuel_requirements.switching_points.length')) {
        const threshold = this.extractNumber(condition);
        const switchCount = state.compliance_data?.eca_zones?.fuel_requirements?.switching_points?.length || 0;
        return switchCount > threshold;
      }
      
      // Handle weather conditions
      if (condition.includes('weather_consumption.additional_fuel_needed_mt')) {
        const threshold = this.extractNumber(condition);
        return (state.weather_consumption?.additional_fuel_needed_mt || 0) > threshold;
      }
      
      if (condition.includes('port_weather_status.unsafe_count')) {
        const unsafeCount = state.port_weather_status?.filter(p => !p.bunkering_feasible).length || 0;
        return unsafeCount > 0;
      }
      
      // Handle route conditions
      if (condition.includes('route_data.estimated_hours')) {
        const threshold = this.extractNumber(condition);
        return (state.route_data?.estimated_hours || 0) > threshold;
      }
      
      // Handle bunker ports count
      if (condition.includes('bunker_ports.length')) {
        const threshold = this.extractNumber(condition);
        return (state.bunker_ports?.length || 0) > threshold;
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Extract numeric threshold from condition string
   */
  private extractNumber(condition: string): number {
    const match = condition.match(/[<>=]+\s*(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : 0;
  }
  
  /**
   * Render template with state data
   */
  private renderTemplate(template: string, state: MultiAgentState): string {
    let result = template;
    
    // Replace bunker analysis placeholders
    if (state.bunker_analysis) {
      const best = state.bunker_analysis.best_option;
      const savings = state.bunker_analysis.max_savings_usd || 0;
      const deviation = (best as any)?.deviation_cost_usd || 0;
      
      result = result.replace('{savings:,.0f}', savings.toLocaleString('en-US', { maximumFractionDigits: 0 }));
      result = result.replace('{deviation:,.0f}', deviation.toLocaleString('en-US', { maximumFractionDigits: 0 }));
      result = result.replace('{port_name}', best?.port_name || 'Unknown');
    }
    
    // Replace ROB safety status placeholders
    if (state.rob_safety_status) {
      const margin = state.rob_safety_status.minimum_rob_days;
      const violationCount = state.rob_safety_status.violations?.length || 0;
      
      result = result.replace('{margin:.1f}', margin?.toFixed(1) || 'N/A');
      result = result.replace('{violation_count}', String(violationCount));
    }
    
    // Replace compliance placeholders
    if (state.compliance_data?.eca_zones) {
      const eca = state.compliance_data.eca_zones;
      const zoneCount = eca.eca_zones_crossed?.length || 0;
      const mgoQty = eca.fuel_requirements?.mgo_with_safety_margin_mt || 0;
      const switchCount = eca.fuel_requirements?.switching_points?.length || 0;
      
      result = result.replace('{zone_count}', String(zoneCount));
      result = result.replace('{mgo_qty:.0f}', mgoQty.toFixed(0));
      result = result.replace('{switch_count}', String(switchCount));
    }
    
    // Replace weather placeholders
    if (state.weather_consumption) {
      const extraFuel = state.weather_consumption.additional_fuel_needed_mt || 0;
      result = result.replace('{extra_fuel:.0f}', extraFuel.toFixed(0));
    }
    
    // Replace port weather placeholders
    if (state.port_weather_status) {
      const unsafeCount = state.port_weather_status.filter(p => !p.bunkering_feasible).length;
      result = result.replace('{unsafe_count}', String(unsafeCount));
    }
    
    // Replace route placeholders
    if (state.route_data) {
      const days = state.route_data.estimated_hours / 24;
      result = result.replace('{days:.0f}', days.toFixed(0));
    }
    
    // Replace bunker ports placeholders
    if (state.bunker_ports) {
      result = result.replace('{port_count}', String(state.bunker_ports.length));
    }
    
    return result;
  }
  
  /**
   * Extract metadata for the insight
   */
  private extractMetadata(rule: InsightRule, state: MultiAgentState): Record<string, any> {
    const metadata: Record<string, any> = {};
    
    // Add relevant data based on category
    switch (rule.category) {
      case 'cost_optimization':
        if (state.bunker_analysis) {
          metadata.max_savings = state.bunker_analysis.max_savings_usd;
          metadata.best_port = state.bunker_analysis.best_option?.port_name;
        }
        break;
        
      case 'safety_critical':
      case 'safety_warning':
        if (state.rob_safety_status) {
          metadata.minimum_rob_days = state.rob_safety_status.minimum_rob_days;
          metadata.violations = state.rob_safety_status.violations;
        }
        break;
        
      case 'compliance_info':
      case 'compliance_warning':
        if (state.compliance_data?.eca_zones) {
          metadata.zone_count = state.compliance_data.eca_zones.eca_zones_crossed?.length;
          metadata.mgo_required = state.compliance_data.eca_zones.fuel_requirements?.mgo_with_safety_margin_mt;
        }
        break;
        
      case 'operational':
      case 'operational_info':
      case 'operational_warning':
        if (state.route_data) {
          metadata.distance_nm = state.route_data.distance_nm;
          metadata.estimated_hours = state.route_data.estimated_hours;
        }
        break;
    }
    
    return metadata;
  }
  
  /**
   * Reload rules (useful for hot-reload in development)
   */
  public reloadRules(): void {
    this.rules = [];
    this.loadRules();
  }
  
  /**
   * Get count of loaded rules
   */
  public getRuleCount(): number {
    return this.rules.length;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let extractorInstance: InsightExtractor | null = null;

export function getInsightExtractor(): InsightExtractor {
  if (!extractorInstance) {
    extractorInstance = new InsightExtractor();
  }
  return extractorInstance;
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetInsightExtractor(): void {
  extractorInstance = null;
}
