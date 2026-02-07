/**
 * Template Renderer
 *
 * Renders templates with synthesis data in a structure that templates can access easily.
 * Supports flat access: {{vessel_specs}} instead of {{state.vessel_specs}}.
 */

import type { MultiAgentState } from '../multi-agent/state';
import type { AutoSynthesisResult } from '../multi-agent/synthesis/auto-synthesis-engine';
import type { LoadTemplateResult } from '../config/template-loader';
import { formatResponseWithTemplate } from './template-aware-formatter';
import { extractContent } from './content-extractors';

/**
 * Compute a primary one-liner summary from available data (avoids circular
 * dependency on final_recommendation which is built by this render).
 */
function computePrimarySummary(
  synthesis: AutoSynthesisResult,
  state: MultiAgentState
): string {
  const ad = synthesis.context.available_data || {};
  if (Array.isArray(ad.vessel_specs) && ad.vessel_specs.length > 0) {
    return extractContent('vessel_specs', { ...state, ...ad }, 'brief');
  }
  if (ad.route_data) {
    const r = ad.route_data as { origin_port_name?: string; destination_port_name?: string; estimated_hours?: number };
    const from = r.origin_port_name ?? 'Origin';
    const to = r.destination_port_name ?? 'Destination';
    const days = r.estimated_hours ? (r.estimated_hours / 24).toFixed(1) : '?';
    return `Route from **${from}** to **${to}** (≈${days} days).`;
  }
  if (ad.bunker_analysis) {
    return 'Bunker analysis and recommendations are available below.';
  }
  const insights = synthesis.insights;
  if (Array.isArray(insights) && insights.length > 0) {
    const first = insights[0];
    const msg = typeof first === 'object' && first !== null && 'message' in first ? (first as { message: string }).message : first;
    return String(msg ?? '').slice(0, 200);
  }
  return '';
}

/**
 * Render template with synthesis data.
 *
 * Passes synthesis context, insights, recommendations, warnings, and flattens
 * available_data for easy template access (e.g. {{vessel_specs}}).
 */
export async function render(
  loadResult: LoadTemplateResult,
  params: {
    synthesis: AutoSynthesisResult;
    state: MultiAgentState;
  }
): Promise<string> {
  const { synthesis, state } = params;

  if (!loadResult.exists || !loadResult.template) {
    throw new Error(loadResult.error || `Template not found: ${loadResult.name}`);
  }

  const primarySummary = computePrimarySummary(synthesis, state);

  // Build routing_context for templates (optional, for debug mode)
  const routingContext = synthesis.context.routing_metadata
    ? {
        classification_method: synthesis.context.routing_metadata.classification_method,
        confidence: synthesis.context.routing_metadata.confidence,
        primary_agent: synthesis.context.routing_metadata.target_agent,
        matched_intent: synthesis.context.routing_metadata.matched_intent,
      }
    : undefined;

  // Build enriched state: merge available_data at top level for flat access
  // (e.g. template can use {{vessel_specs}} instead of {{state.vessel_specs}})
  const enrichedState = {
    ...state,
    ...(synthesis.context.available_data || {}),
    primary_summary: primarySummary,
    // Routing context for observability (optional in templates, e.g. {{#if routing_context}})
    routing_context: routingContext,
    // Show routing metadata in template when SYNTHESIS_DEBUG=true
    show_routing_debug:
      process.env.SYNTHESIS_DEBUG === 'true' && !!routingContext,
    // Attach synthesis for any template that needs structured access
    _synthesis: {
      context: synthesis.context,
      insights: synthesis.insights,
      recommendations: synthesis.recommendations,
      warnings: synthesis.warnings,
      routing_metadata: synthesis.context.routing_metadata,
    },
  } as MultiAgentState & {
    primary_summary: string;
    routing_context?: typeof routingContext;
    show_routing_debug?: boolean;
  };

  const formatted = formatResponseWithTemplate(enrichedState, loadResult.name);
  return formatted.text;
}
