/**
 * Section Renderers
 *
 * Renders specific content sections for the Dynamic Template Renderer.
 * Each renderer produces markdown/HTML based on structure decisions from LLM Content Architect.
 */

import type { StructureDecision } from '@/lib/multi-agent/llm-content-architect';
import type { MultiAgentState } from '@/lib/multi-agent/state';

export interface SectionRenderer {
  render(data: Record<string, unknown>, structure: StructureDecision, state: MultiAgentState): string;
}

function fmt(n: number): string {
  return n.toLocaleString();
}

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

class FleetOverviewRenderer implements SectionRenderer {
  render(data: Record<string, unknown>, structure: StructureDecision, _state: MultiAgentState): string {
    const vessels = data.vessel_specs as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(vessels) || vessels.length === 0) return '';

    const byType: Record<string, number> = {};
    vessels.forEach((v) => {
      const t = String(v?.vessel_type ?? v?.type ?? 'Unknown').toUpperCase();
      byType[t] = (byType[t] ?? 0) + 1;
    });

    let out = '## Fleet Overview\n\n';
    out += `Our fleet consists of **${fmt(vessels.length)} vessels** across ${Object.keys(byType).length} vessel types.\n\n`;

    if (Object.keys(byType).length > 0) {
      out += '### Fleet Composition\n\n';
      out += '| Vessel Type | Count |\n|-------------|-------|\n';
      Object.entries(byType)
        .sort(([, a], [, b]) => b - a)
        .forEach(([type, n]) => {
          out += `| ${type} | ${n} |\n`;
        });
      out += '\n';
    }
    return out;
  }
}

class VesselDetailsTableRenderer implements SectionRenderer {
  render(data: Record<string, unknown>, structure: StructureDecision, _state: MultiAgentState): string {
    let vessels = data.vessel_specs as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(vessels) || vessels.length === 0) return '';

    const vesselTypeFilter = structure.filters?.vessel_type as string | undefined;
    if (vesselTypeFilter) {
      vessels = vessels.filter(
        (v) => String(v?.vessel_type ?? v?.type ?? '').toUpperCase() === vesselTypeFilter.toUpperCase()
      );
    }

    if (vessels.length === 0) {
      return `No vessels match the filter (${vesselTypeFilter ?? 'unknown'}).\n\n`;
    }

    const grouping = structure.grouping ?? 'by_type';
    const showAllNames = structure.show_all_names !== false;
    const collapsible = structure.collapsible ?? false;

    const grouped =
      grouping === 'by_type'
        ? groupBy(vessels, (v) => String(v?.vessel_type ?? v?.type ?? 'Unknown').toUpperCase())
        : { 'All Vessels': vessels };

    let out = '';
    const entries = Object.entries(grouped).sort(([, a], [, b]) => b.length - a.length);

    for (const [type, typeVessels] of entries) {
      const shouldCollapse = collapsible && typeVessels.length > 10;

      if (shouldCollapse) {
        out += `<details>\n<summary>**${type}** (${typeVessels.length} vessels)</summary>\n\n`;
      } else {
        out += `### ${type}\n\n`;
      }

      if (showAllNames) {
        out += '| # | Vessel Name | Type | DWT | Flag | Built |\n';
        out += '|---|-------------|------|-----|------|-------|\n';
        typeVessels.forEach((v, i) => {
          const name = v?.vessel_name ?? v?.name ?? 'Unknown';
          const vtype = v?.vessel_type ?? v?.type ?? '-';
          const deadweight = v?.deadweight ?? v?.deadweight_tonnage ?? '-';
          const dwStr =
            deadweight !== '-' && typeof deadweight === 'number' ? fmt(deadweight) : String(deadweight);
          const flag = v?.flag ?? '-';
          const built = v?.built_date ?? v?.year_built ?? '-';
          out += `| ${i + 1} | ${name} | ${vtype} | ${dwStr} | ${flag} | ${built} |\n`;
        });
        out += '\n';
      } else {
        out += `${typeVessels.length} vessels of this type.\n\n`;
      }

      if (shouldCollapse) {
        out += `</details>\n\n`;
      }
    }
    return out;
  }
}

class RouteSummaryRenderer implements SectionRenderer {
  render(data: Record<string, unknown>, _structure: StructureDecision, _state: MultiAgentState): string {
    const route = data.route_data as Record<string, unknown> | undefined;
    if (!route || typeof route !== 'object') return '';

    const origin = route.origin_port_name ?? route.origin_port_code ?? 'Origin';
    const dest = route.destination_port_name ?? route.destination_port_code ?? 'Destination';
    const dist =
      typeof route.distance_nm === 'number' ? fmt(route.distance_nm) : '?';
    const hours = typeof route.estimated_hours === 'number' ? route.estimated_hours : null;
    const days = hours != null ? (hours / 24).toFixed(1) : '?';

    let out = '## Route Information\n\n';
    out += `**${origin}** to **${dest}**\n\n`;
    out += `- **Distance:** ${dist} nm\n`;
    out += `- **Estimated duration:** ~${days} days\n`;
    return out;
  }
}

class BunkerAnalysisRenderer implements SectionRenderer {
  render(data: Record<string, unknown>, _structure: StructureDecision, _state: MultiAgentState): string {
    const analysis = data.bunker_analysis as Record<string, unknown> | undefined;
    if (!analysis || typeof analysis !== 'object') return '';

    const best = analysis.best_option as Record<string, unknown> | undefined;
    let out = '## Bunker Information\n\n';
    if (best?.port_name) {
      out += `**Best option:** ${best.port_name}`;
      if (typeof best.total_cost_usd === 'number') {
        out += ` ($${fmt(best.total_cost_usd)})`;
      }
      out += '\n\n';
    }
    return out;
  }
}

class GenericInfoRenderer implements SectionRenderer {
  render(
    data: Record<string, unknown>,
    _structure: StructureDecision,
    _state: MultiAgentState
  ): string {
    const insights = data._synthesis_insights as unknown[] | undefined;
    if (!Array.isArray(insights) || insights.length === 0) return '';

    let out = '## Information\n\n';
    insights.forEach((i) => {
      const msg = typeof i === 'object' && i !== null && 'message' in i ? (i as { message?: unknown }).message : i;
      out += `- ${String(msg ?? '')}\n`;
    });
    return out;
  }
}

const RENDERERS: Record<string, SectionRenderer> = {
  fleet_overview: new FleetOverviewRenderer(),
  vessel_details_table: new VesselDetailsTableRenderer(),
  route_summary: new RouteSummaryRenderer(),
  bunker_analysis: new BunkerAnalysisRenderer(),
  generic_info: new GenericInfoRenderer(),
};

export function getSectionRenderer(sectionId: string): SectionRenderer {
  return RENDERERS[sectionId] ?? new GenericInfoRenderer();
}
