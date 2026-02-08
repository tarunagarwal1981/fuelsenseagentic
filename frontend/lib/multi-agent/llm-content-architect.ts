/**
 * LLM Content Architect
 *
 * Analyzes user queries and synthesis data to decide what content structure to show.
 * Used for unknown/complex query patterns in the hybrid template architecture.
 * LLM decides WHAT to show; templates format HOW it's displayed.
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import type { MultiAgentState } from './state';
import type { AutoSynthesisResult } from './synthesis/auto-synthesis-engine';
import { buildCompactContext } from './synthesis/context-builder';

export interface StructureDecision {
  intent: string;
  filters?: Record<string, unknown>;
  grouping?: string;
  sections: string[];
  show_all_names?: boolean;
  collapsible?: boolean;
  reasoning: string;
}

/**
 * Analyze user query and synthesis to decide response structure.
 * Returns a structured decision that the Dynamic Template Renderer uses.
 */
export async function analyzeQueryStructure(
  query: string,
  synthesis: AutoSynthesisResult,
  state: MultiAgentState
): Promise<StructureDecision> {
  const contextSummary = buildCompactContext(synthesis, state);
  const availableData = synthesis.context.available_data;

  const systemPrompt = `You are a maritime content architect for FuelSense 360. Your job is to decide WHAT content to show based on the user's query and available data - NOT to write the response.

AVAILABLE DATA SUMMARY:
${contextSummary}

AVAILABLE DATA KEYS: ${Object.keys(availableData || {}).join(', ')}

OUTPUT FORMAT (JSON only, no markdown):
{
  "intent": "list_vessels|count_summary|filtered_list|comparison|route_info|bunker_info|general",
  "filters": { "vessel_type": "BULK CARRIER" } or {} if no filter needed,
  "grouping": "by_type|none",
  "sections": ["fleet_overview", "vessel_details_table", "route_summary", "bunker_analysis", "generic_info"],
  "show_all_names": true|false,
  "collapsible": true|false,
  "reasoning": "Brief explanation of your decision"
}

RULES:
- intent "list_vessels": User wants vessel list. Use sections: fleet_overview, vessel_details_table. show_all_names: true.
- intent "count_summary": User asked "how many". Use sections: fleet_overview only. show_all_names: false.
- For "bulk carriers", "tankers", "containers": Set filters.vessel_type to the type (e.g. "BULK CARRIER", "OIL TANKER", "CONTAINER").
- For large fleets (>15 per type): collapsible: true.
- grouping "by_type": Group vessel lists by vessel type.
- Only include sections that match available data keys.
- If vessel_specs exists and user asked for list: include vessel_details_table.
- reasoning: 1 sentence explaining your decision.`;

  const userPrompt = `User query: "${query}"

Decide the response structure. Return only valid JSON.`;

  const llm = new ChatAnthropic({
    model: 'claude-3-5-haiku-20241022',
    temperature: 0.1,
  });

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ]);

  const content = response.content.toString();
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : content;

  try {
    const parsed = JSON.parse(jsonStr) as StructureDecision;
    if (!parsed.sections) parsed.sections = ['fleet_overview', 'vessel_details_table'];
    if (!parsed.reasoning) parsed.reasoning = 'Default structure for query.';
    return parsed;
  } catch {
    console.warn('[LLM-CONTENT-ARCHITECT] Failed to parse LLM response, using default');
    return {
      intent: 'list_vessels',
      filters: {},
      grouping: 'by_type',
      sections: ['fleet_overview', 'vessel_details_table'],
      show_all_names: true,
      collapsible: false,
      reasoning: 'Fallback default structure',
    };
  }
}
