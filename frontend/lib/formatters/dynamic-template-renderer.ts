/**
 * Dynamic Template Renderer
 *
 * Renders response content based on LLM Content Architect's structure decisions.
 * Used for unknown/complex query patterns in the hybrid architecture.
 */

import type { StructureDecision } from '@/lib/multi-agent/llm-content-architect';
import type { AutoSynthesisResult } from '@/lib/multi-agent/synthesis/auto-synthesis-engine';
import type { MultiAgentState } from '@/lib/multi-agent/state';
import { getSectionRenderer } from './section-renderers';

/**
 * Render response using structure decision from LLM Content Architect.
 * Applies filters and grouping, then renders each section.
 */
export async function renderWithStructure(
  structure: StructureDecision,
  synthesis: AutoSynthesisResult,
  state: MultiAgentState
): Promise<string> {
  const data = { ...synthesis.context.available_data } as Record<string, unknown>;

  if (synthesis.insights?.length) {
    data._synthesis_insights = synthesis.insights;
  }

  const renderedSections: string[] = [];

  for (const sectionId of structure.sections) {
    const renderer = getSectionRenderer(sectionId);
    const content = renderer.render(data, structure, state);
    if (content.trim()) {
      renderedSections.push(content);
    }
  }

  if (renderedSections.length === 0) {
    const vesselCount = Array.isArray(data.vessel_specs) ? data.vessel_specs.length : 0;
    if (vesselCount > 0) {
      return `Our fleet contains **${vesselCount} vessels**. No matching data for the requested format.`;
    }
    return 'No data available for the requested information.';
  }

  return renderedSections.join('\n\n');
}
