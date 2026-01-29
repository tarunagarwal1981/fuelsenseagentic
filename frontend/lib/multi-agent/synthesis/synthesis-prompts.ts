/**
 * Synthesis Prompts
 * 
 * LLM prompt templates for different synthesis scenarios.
 * These prompts guide the synthesis LLM to generate strategic insights
 * by analyzing outputs from multiple specialist agents.
 */

import type { MultiAgentState } from '../state';
import { SYNTHESIS_PROMPT_V3 } from './synthesis-prompt-v3';

// ============================================================================
// Base Synthesis Prompt (v3 - Query Type Classification)
// ============================================================================

export async function buildBaseSynthesisPrompt(
  state: MultiAgentState,
  agentList: string[]
): Promise<string> {
  // Use embedded prompt (always available, no file system dependencies)
  const basePrompt = SYNTHESIS_PROMPT_V3;
  console.log(`✅ [SYNTHESIS] Using embedded v3 prompt (${basePrompt.length} chars)`);
  
  // Serialize agent outputs
  const agentOutputs = serializeAgentOutputsInternal(state, agentList);
  
  // Replace placeholder
  const finalPrompt = basePrompt.replace('{agent_outputs}', agentOutputs);
  
  return finalPrompt;
}

function serializeAgentOutputsInternal(state: MultiAgentState, agentList: string[]): string {
  const outputs: string[] = [];
  
  agentList.forEach(agentName => {
    const agentData = extractAgentDataInternal(state, agentName);
    if (agentData) {
      outputs.push(`\n=== ${agentName.toUpperCase()} OUTPUT ===\n${agentData}`);
    }
  });
  
  return outputs.join('\n');
}

function extractAgentDataInternal(state: MultiAgentState, agentName: string): string | null {
  // Extract relevant state data for each agent
  switch (agentName) {
    case 'route_agent':
      if (!state.route_data) return null;
      return JSON.stringify({
        distance_nm: state.route_data.distance_nm,
        estimated_hours: state.route_data.estimated_hours,
        waypoints_count: state.route_data.waypoints?.length || 0,
        origin: state.route_data.origin_port_name ?? state.route_data.origin_port_code,
        destination: state.route_data.destination_port_name ?? state.route_data.destination_port_code,
      }, null, 2);
      
    case 'weather_agent':
      if (!state.weather_forecast && !state.weather_consumption) return null;
      return JSON.stringify({
        forecast_points: state.weather_forecast?.length || 0,
        consumption_increase_percent: state.weather_consumption?.consumption_increase_percent,
        additional_fuel_mt: state.weather_consumption?.additional_fuel_needed_mt,
        weather_alerts_count: state.weather_consumption?.weather_alerts?.length || 0,
        voyage_summary: state.weather_consumption?.voyage_weather_summary,
      }, null, 2);
      
    case 'bunker_agent':
      if (!state.bunker_analysis) return null;
      return JSON.stringify({
        best_option: state.bunker_analysis.best_option,
        alternatives_count: state.bunker_analysis.recommendations?.length || 0,
        total_ports_found: state.bunker_ports?.length || 0,
        max_savings_usd: state.bunker_analysis.max_savings_usd,
        analysis_summary: state.bunker_analysis.analysis_summary,
      }, null, 2);
      
    case 'rob_agent':
      if (!state.rob_safety_status) return null;
      return JSON.stringify({
        overall_safe: state.rob_safety_status.overall_safe,
        minimum_days_remaining: state.rob_safety_status.minimum_rob_days,
        violations: state.rob_safety_status.violations,
      }, null, 2);
      
    default:
      return null;
  }
}

// getFallbackPrompt is no longer needed - using embedded SYNTHESIS_PROMPT_V3 instead

// Legacy synchronous version for backward compatibility
export function buildBaseSynthesisPromptSync(
  state: MultiAgentState,
  agentList: string[]
): string {
  const originalQuery = state.messages?.[0]?.content || 'Unknown query';
  
  return `You are a maritime strategy synthesis AI for FuelSense 360.

**User's Original Query:**
"${originalQuery}"

**Context:**
The user is a maritime professional (charterer, operator, or vessel manager) making critical decisions about:
- Bunker planning (where and when to refuel)
- Voyage optimization (route, speed, consumption)
- Compliance (ECA zones, EU ETS, FuelEU Maritime)
- Performance (CII rating, hull condition)
- Commercial viability (costs, margins, ROI)

**Your Role:**
Analyze outputs from ${agentList.length} specialist agents and synthesize strategic insights.
Your analysis helps users make faster, better decisions worth millions of dollars.

**Agent Outputs Available:**
${agentList.map(agent => `- ${agent}`).join('\n')}

**Your Tasks:**

1. Classify the query type (informational/decision-required/validation/comparison)
2. Generate the appropriate response structure
3. Apply filtering rules for details_to_surface
4. Include strategic priorities and critical risks as needed

**Output Format:**
Return ONLY valid JSON (no markdown, no explanation).`;
}

// ============================================================================
// Domain-Specific Prompt Enhancements
// ============================================================================

/**
 * Add domain-specific focus when hull + CII agents both ran
 */
export function addHullCIISynergyFocus(basePrompt: string): string {
  return basePrompt + `

**SPECIAL FOCUS: Hull Performance & CII Rating**

The hull and CII agents both ran. Pay special attention to:
1. How does hull fouling percentage affect CII rating?
2. What's the ROI of hull cleaning on CII improvement?
3. Compare hull cleaning vs speed optimization for CII
4. Calculate: Hull cleaning cost vs annual fuel savings from better CII rating
5. Urgency: If CII is D or E, hull cleaning becomes critical priority

Include specific calculations in your strategic priorities.`;
}

/**
 * Add commercial focus when commercial + technical agents ran
 */
export function addCommercialTechnicalFocus(basePrompt: string): string {
  return basePrompt + `

**SPECIAL FOCUS: Commercial Viability & Technical Optimization**

Commercial and technical agents both ran. Pay special attention to:
1. What's the TOTAL financial impact of all technical issues combined?
2. Which SINGLE action has the highest ROI?
3. What are the trade-offs between different optimization strategies?
4. Can technical optimizations turn a loss-making voyage into profit?
5. Calculate payback periods for recommended actions

Your executive insight MUST include total financial impact.`;
}

/**
 * Add compliance focus when multiple compliance agents ran
 */
export function addComplianceFocus(basePrompt: string): string {
  return basePrompt + `

**SPECIAL FOCUS: Regulatory Compliance**

Multiple compliance agents ran (ECA, EU ETS, FuelEU). Pay special attention to:
1. What's the COMBINED compliance cost across all regulations?
2. Are there opportunities to reduce compliance burden?
3. What's the regulatory risk (non-compliance penalties)?
4. Can route changes reduce compliance costs?
5. Future compliance changes that affect planning?

Include total compliance cost in your financial impact.`;
}

/**
 * Add safety focus if ROB safety issues detected
 */
export function addSafetyFocus(basePrompt: string, state: MultiAgentState): string {
  if (!state.rob_safety_status || state.rob_safety_status.overall_safe) {
    return basePrompt;
  }
  
  return basePrompt + `

**CRITICAL: Safety Issues Detected**

ROB safety status shows voyage is UNSAFE. This is CRITICAL PRIORITY.
- Minimum ROB: ${state.rob_safety_status.minimum_rob_days.toFixed(1)} days
- Safety violations: ${state.rob_safety_status.violations?.join(', ') || 'Unknown'}

Your strategic priorities MUST:
1. List safety fixes as Priority #1 (mark as "immediate" urgency)
2. Explain financial + operational consequences of running out of fuel
3. Recommend urgent bunkering or route changes

Mark safety as "critical" severity in risk_alerts.`;
}

// ============================================================================
// Prompt Builder (combines base + domain-specific)
// ============================================================================

export async function buildSynthesisPrompt(
  state: MultiAgentState,
  agentList: string[]
): Promise<string> {
  // Start with base prompt (async - loads from file)
  let prompt = await buildBaseSynthesisPrompt(state, agentList);
  
  // Add domain-specific focuses based on which agents ran
  const agentSet = new Set(agentList);
  
  // Hull + CII synergy
  if (agentSet.has('hull_agent') && agentSet.has('cii_agent')) {
    prompt = addHullCIISynergyFocus(prompt);
  }
  
  // Commercial + technical synergy
  if (agentSet.has('commercial_agent') && 
      (agentSet.has('hull_agent') || agentSet.has('bunker_agent') || agentSet.has('cii_agent'))) {
    prompt = addCommercialTechnicalFocus(prompt);
  }
  
  // Multiple compliance agents
  const complianceAgents = ['eca_agent', 'eu_ets_agent', 'fueleu_agent', 'compliance_agent'].filter(a => agentSet.has(a));
  if (complianceAgents.length >= 2) {
    prompt = addComplianceFocus(prompt);
  }
  
  // Safety critical
  if (state.rob_safety_status && !state.rob_safety_status.overall_safe) {
    prompt = addSafetyFocus(prompt, state);
  }
  
  return prompt;
}

// Synchronous version for backward compatibility
export function buildSynthesisPromptSync(
  state: MultiAgentState,
  agentList: string[]
): string {
  // Start with sync base prompt
  let prompt = buildBaseSynthesisPromptSync(state, agentList);
  
  // Add domain-specific focuses based on which agents ran
  const agentSet = new Set(agentList);
  
  // Hull + CII synergy
  if (agentSet.has('hull_agent') && agentSet.has('cii_agent')) {
    prompt = addHullCIISynergyFocus(prompt);
  }
  
  // Commercial + technical synergy
  if (agentSet.has('commercial_agent') && 
      (agentSet.has('hull_agent') || agentSet.has('bunker_agent') || agentSet.has('cii_agent'))) {
    prompt = addCommercialTechnicalFocus(prompt);
  }
  
  // Multiple compliance agents
  const complianceAgents = ['eca_agent', 'eu_ets_agent', 'fueleu_agent', 'compliance_agent'].filter(a => agentSet.has(a));
  if (complianceAgents.length >= 2) {
    prompt = addComplianceFocus(prompt);
  }
  
  // Safety critical
  if (state.rob_safety_status && !state.rob_safety_status.overall_safe) {
    prompt = addSafetyFocus(prompt, state);
  }
  
  return prompt;
}

// ============================================================================
// Agent Data Serialization
// ============================================================================

/**
 * Serialize agent outputs for LLM prompt
 */
export function serializeAgentOutputs(state: MultiAgentState, agentList: string[]): string {
  const outputs: string[] = [];
  
  for (const agent of agentList) {
    const data = extractAgentData(agent, state);
    if (data) {
      outputs.push(`\n## ${agent.toUpperCase()}\n${JSON.stringify(data, null, 2)}`);
    }
  }
  
  return outputs.join('\n');
}

/**
 * Extract relevant data for each agent type
 * Maps agent names to actual state fields
 */
function extractAgentData(agent: string, state: MultiAgentState): Record<string, unknown> | null {
  switch (agent) {
    case 'route_agent':
      if (!state.route_data) return null;
      return {
        distance_nm: state.route_data.distance_nm,
        estimated_hours: state.route_data.estimated_hours,
        route_type: state.route_data.route_type,
        origin: state.route_data.origin_port_name ?? state.route_data.origin_port_code,
        destination: state.route_data.destination_port_name ?? state.route_data.destination_port_code,
      };
    
    case 'bunker_agent':
      if (!state.bunker_analysis) return null;
      return {
        best_option: state.bunker_analysis.best_option,
        max_savings_usd: state.bunker_analysis.max_savings_usd,
        recommendations_count: state.bunker_analysis.recommendations?.length || 0,
        analysis_summary: state.bunker_analysis.analysis_summary,
      };
    
    case 'weather_agent':
      return {
        forecast_points: state.weather_forecast?.length || 0,
        consumption_increase_percent: state.weather_consumption?.consumption_increase_percent,
        additional_fuel_mt: state.weather_consumption?.additional_fuel_needed_mt,
        weather_alerts_count: state.weather_consumption?.weather_alerts?.length || 0,
        voyage_summary: state.weather_consumption?.voyage_weather_summary,
      };
    
    case 'compliance_agent':
      return {
        eca_zones: state.compliance_data?.eca_zones,
        eca_summary: state.eca_summary,
      };
    
    case 'rob_agent':
      return {
        overall_safe: state.rob_safety_status?.overall_safe,
        minimum_rob_days: state.rob_safety_status?.minimum_rob_days,
        violations: state.rob_safety_status?.violations,
      };
    
    // Future agents - return null for now
    case 'hull_agent':
    case 'cii_agent':
    case 'commercial_agent':
    case 'eca_agent':
    case 'eu_ets_agent':
    case 'fueleu_agent':
      // These agents don't have state fields yet
      // Will be populated when those agents are implemented
      return null;
    
    default:
      return null;
  }
}

// ============================================================================
// Full Prompt with Agent Data
// ============================================================================

/**
 * Build complete synthesis prompt including agent data
 */
export function buildFullSynthesisPrompt(
  state: MultiAgentState,
  agentList: string[]
): string {
  const systemPrompt = buildSynthesisPrompt(state, agentList);
  const agentData = serializeAgentOutputs(state, agentList);
  
  return `${systemPrompt}

---

**AGENT OUTPUTS:**
${agentData}

---

Now analyze the above agent outputs and return your synthesis as JSON.`;
}
