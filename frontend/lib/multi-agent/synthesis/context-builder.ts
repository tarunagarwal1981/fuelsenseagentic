/**
 * Context Builder
 *
 * Produces compact, token-bounded string summaries from synthesis data for LLM consumption.
 * Used when LLM_FIRST_SYNTHESIS is enabled to keep context size manageable.
 *
 * ~4 chars ≈ 1 token; ~4K tokens ≈ 16K chars. We cap at ~12K chars to stay safe.
 */

import type { MultiAgentState } from '../state';
import type { AutoSynthesisResult, ExtractedData } from './auto-synthesis-engine';

const MAX_CONTEXT_CHARS = 12_000; // ~3K tokens
const MAX_VESSEL_NAMES = 50; // Truncate vessel list if larger
const MAX_JSON_FALLBACK_CHARS = 4_000;

/**
 * Build a compact context summary for the LLM from synthesis data.
 */
export function buildCompactContext(
  synthesis: AutoSynthesisResult,
  state: MultiAgentState
): string {
  const parts: string[] = [];

  // Routing context
  const rm = synthesis.context.routing_metadata;
  if (rm) {
    parts.push(`## ROUTING CONTEXT:\n`);
    parts.push(`- Matched intent: ${rm.matched_intent}`);
    parts.push(`- Primary domain: ${synthesis.context.primary_domain}`);
    parts.push(`- Query type: ${synthesis.context.query_type}`);
    parts.push(`- Agents executed: ${synthesis.context.agents_executed.join(', ')}`);
    parts.push('');
  }

  // Compact summaries per field
  for (const item of synthesis.extracted_data) {
    const summary = summarizeField(item.field_name, item.field_value);
    if (summary) {
      parts.push(`## ${item.field_name.toUpperCase().replace(/_/g, ' ')}:\n${summary}\n`);
    }
  }

  // Insights
  if (synthesis.insights.length > 0) {
    parts.push('## INSIGHTS:\n');
    synthesis.insights.forEach((insight) => {
      const text =
        typeof insight === 'object' && insight !== null && 'message' in insight
          ? String((insight as { message?: unknown }).message)
          : String(insight);
      parts.push(`- ${text}`);
    });
    parts.push('');
  }

  // Recommendations
  if (synthesis.recommendations.length > 0) {
    parts.push('## RECOMMENDATIONS:\n');
    synthesis.recommendations.forEach((rec) => {
      const text =
        typeof rec === 'object' && rec !== null && 'message' in rec
          ? String((rec as { message?: unknown }).message)
          : String(rec);
      parts.push(`- ${text}`);
    });
    parts.push('');
  }

  // Warnings
  if (synthesis.warnings.length > 0) {
    parts.push('## WARNINGS:\n');
    synthesis.warnings.forEach((warn) => {
      const text =
        typeof warn === 'object' && warn !== null && 'message' in warn
          ? String((warn as { message?: unknown }).message)
          : String(warn);
      parts.push(`- ${text}`);
    });
    parts.push('');
  }

  let result = parts.join('\n');

  // Fallback: if summary is too sparse and we have raw data, append compact JSON
  const availableData = synthesis.context.available_data;
  if (
    result.trim().length < 500 &&
    availableData &&
    Object.keys(availableData).length > 0
  ) {
    const jsonStr = JSON.stringify(availableData);
    if (jsonStr.length <= MAX_JSON_FALLBACK_CHARS) {
      result += `\n## RAW DATA:\n${jsonStr}`;
    } else {
      result += `\n## RAW DATA (truncated):\n${jsonStr.slice(0, MAX_JSON_FALLBACK_CHARS)}...`;
    }
  }

  // Cap total length
  if (result.length > MAX_CONTEXT_CHARS) {
    result = result.slice(0, MAX_CONTEXT_CHARS) + '\n\n[Context truncated for length]';
  }

  return result || 'No structured data available. Use general maritime knowledge.';
}

/**
 * Produce a compact summary for a single field.
 */
function summarizeField(fieldName: string, value: unknown): string {
  if (value == null) return '';

  switch (fieldName) {
    case 'vessel_specs':
      return summarizeVesselSpecs(value);
    case 'route_data':
      return summarizeRouteData(value);
    case 'bunker_analysis':
      return summarizeBunkerAnalysis(value);
    case 'weather_forecast':
    case 'weather_consumption':
      return summarizeWeatherData(value, fieldName);
    case 'vessel_comparison_analysis':
    case 'vessel_rankings':
    case 'recommended_vessel':
      return summarizeVesselComparison(value, fieldName);
    case 'bunker_ports':
      return summarizeBunkerPorts(value);
    case 'port_prices':
      return summarizePortPrices(value);
    case 'compliance_data':
      return summarizeCompliance(value);
    case 'rob_tracking':
      return summarizeRobTracking(value);
    case 'standalone_port_weather':
      return summarizeStandalonePortWeather(value);
    case 'noon_reports':
    case 'consumption_profiles':
      return summarizeGenericArray(value, fieldName);
    default:
      return summarizeGeneric(value);
  }
}

function summarizeVesselSpecs(value: unknown): string {
  const vessels = value as Array<Record<string, unknown>>;
  if (!Array.isArray(vessels) || vessels.length === 0) return '';

  const byType: Record<string, string[]> = {};
  vessels.forEach((v) => {
    const t = String(v?.vessel_type ?? v?.type ?? 'Unknown').toUpperCase();
    if (!byType[t]) byType[t] = [];
    const name = v?.vessel_name ?? v?.name ?? (v?.imo ? `IMO ${v.imo}` : null);
    if (name) byType[t].push(String(name));
  });

  const lines: string[] = [];
  for (const [type, names] of Object.entries(byType).sort(([, a], [, b]) => b.length - a.length)) {
    const display = names.length <= MAX_VESSEL_NAMES ? names : names.slice(0, MAX_VESSEL_NAMES);
    let line = `${type} (${names.length}): [${display.join(', ')}]`;
    if (names.length > MAX_VESSEL_NAMES) {
      line += ` ... and ${names.length - MAX_VESSEL_NAMES} more`;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

function summarizeRouteData(value: unknown): string {
  const r = value as Record<string, unknown>;
  const origin = r?.origin_port_name ?? r?.origin_port_code ?? 'Origin';
  const dest = r?.destination_port_name ?? r?.destination_port_code ?? 'Destination';
  const dist = typeof r?.distance_nm === 'number' ? r.distance_nm.toLocaleString() : '?';
  const hours = typeof r?.estimated_hours === 'number' ? r.estimated_hours : null;
  const days = hours != null ? (hours / 24).toFixed(1) : '?';
  const waypoints = Array.isArray(r?.waypoints) ? r.waypoints.length : 0;
  return `Origin ${origin} to ${dest}. ${dist} nm, ~${days} days. Waypoints: ${waypoints}.`;
}

function summarizeBunkerAnalysis(value: unknown): string {
  const a = value as Record<string, unknown>;
  const best = a?.best_option as Record<string, unknown> | undefined;
  const recs = a?.recommendations as unknown[] | undefined;
  const count = Array.isArray(recs) ? recs.length : 0;
  let out = '';
  if (best?.port_name) {
    out += `Best: ${best.port_name}`;
    if (typeof best.total_cost_usd === 'number') {
      out += `, $${best.total_cost_usd.toLocaleString()}`;
    }
    out += '. ';
  }
  if (count > 1) out += `${count} alternatives.`;
  return out.trim() || 'Bunker analysis available.';
}

function summarizeWeatherData(value: unknown, fieldName: string): string {
  if (fieldName === 'weather_consumption') {
    const w = value as Record<string, unknown>;
    const base = w?.base_consumption_mt;
    const adj = w?.weather_adjusted_consumption_mt;
    const inc = w?.consumption_increase_percent;
    let out = '';
    if (typeof base === 'number') out += `Base consumption: ${base} MT/day. `;
    if (typeof adj === 'number') out += `Adjusted: ${adj} MT/day. `;
    if (typeof inc === 'number') out += `Increase: ${inc}%.`;
    return out.trim() || 'Weather consumption data available.';
  }
  const arr = value as unknown[];
  if (Array.isArray(arr)) {
    return `Forecast at ${arr.length} positions.`;
  }
  return 'Weather forecast available.';
}

function summarizeVesselComparison(value: unknown, fieldName: string): string {
  if (fieldName === 'recommended_vessel') {
    return `Recommended vessel: ${String(value)}`;
  }
  const v = value as Record<string, unknown>;
  const rec = v?.recommended_vessel ?? v?.recommendedVessel;
  const rankings = v?.rankings ?? v?.rankings_list;
  let out = '';
  if (rec) out += `Recommended: ${rec}. `;
  if (Array.isArray(rankings) && rankings.length > 0) {
    out += `${rankings.length} vessels ranked.`;
  }
  return out.trim() || 'Vessel comparison available.';
}

function summarizeBunkerPorts(value: unknown): string {
  const arr = value as unknown[];
  if (!Array.isArray(arr)) return '';
  return `${arr.length} bunker ports along route.`;
}

function summarizePortPrices(value: unknown): string {
  const p = value as Record<string, unknown>;
  const byPort = p?.prices_by_port as Record<string, unknown> | undefined;
  if (byPort && typeof byPort === 'object') {
    const count = Object.keys(byPort).length;
    return `Prices for ${count} port(s).`;
  }
  return 'Port prices available.';
}

function summarizeCompliance(value: unknown): string {
  const c = value as Record<string, unknown>;
  const eca = c?.eca_zones as Record<string, unknown> | undefined;
  if (eca?.has_eca_zones) {
    return 'Route crosses ECA zones. MGO requirements calculated.';
  }
  return 'Compliance analysis completed.';
}

function summarizeRobTracking(value: unknown): string {
  const r = value as Record<string, unknown>;
  const safe = r?.overall_safe;
  const withBunker = r?.with_bunker as Record<string, unknown> | undefined;
  const withoutBunker = r?.without_bunker as Record<string, unknown> | undefined;
  let out = '';
  if (typeof safe === 'boolean') out += `Overall safe: ${safe}. `;
  if (withoutBunker?.days_until_empty != null) {
    out += `Days until empty (no bunker): ${withoutBunker.days_until_empty}. `;
  }
  if (withBunker?.overall_safe != null) {
    out += `With bunker: ${withBunker.overall_safe ? 'safe' : 'review needed'}.`;
  }
  return out.trim() || 'ROB tracking available.';
}

function summarizeStandalonePortWeather(value: unknown): string {
  const w = value as Record<string, unknown>;
  const port = w?.port_name ?? w?.port_code;
  const forecast = w?.forecast as Record<string, unknown> | undefined;
  let out = '';
  if (port) out += `Port: ${port}. `;
  if (forecast) {
    if (forecast.wave_height != null) out += `Wave: ${forecast.wave_height}m. `;
    if (forecast.wind_speed_10m != null) out += `Wind: ${forecast.wind_speed_10m} knots.`;
  }
  return out.trim() || 'Port weather forecast available.';
}

function summarizeGenericArray(value: unknown, fieldName: string): string {
  const arr = value as unknown[];
  if (Array.isArray(arr)) {
    return `${fieldName}: ${arr.length} item(s).`;
  }
  return summarizeGeneric(value);
}

function summarizeGeneric(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    const str = JSON.stringify(value);
    return str.length <= 500 ? str : str.slice(0, 500) + '...';
  }
  return String(value);
}
