/**
 * Template Engine
 *
 * Renders synthesized responses using Handlebars templates.
 * Supports multiple stakeholders and output formats.
 * Uses Handlebars.compile() so {{#if (eq ...)}}, {{#each}}, {{#unless}} etc. render correctly.
 */

import Handlebars from 'handlebars';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Types
// ============================================================================

export interface RenderOptions {
  stakeholder?: 'charterer' | 'operator' | 'compliance' | 'technical' | 'api';
  format?: 'text' | 'html' | 'json' | 'mobile';
  verbosity?: 'summary' | 'detailed' | 'full';
  includeMetrics?: boolean;
  includeReasoning?: boolean;
}

/** Optional full state for mapping route/bunker data into template context (data.route, data.bunker) */
export type TemplateState = Record<string, unknown>;

interface TemplateContext {
  [key: string]: unknown;
}

// ============================================================================
// Handlebars Helpers (registered once)
// ============================================================================

let helpersRegistered = false;

function registerHandlebarsHelpers(): void {
  if (helpersRegistered) return;
  helpersRegistered = true;

  // Comparison (for {{#if (eq a b)}} and similar)
  Handlebars.registerHelper('eq', function (a: unknown, b: unknown) {
    return a === b;
  });
  Handlebars.registerHelper('ne', function (a: unknown, b: unknown) {
    return a !== b;
  });
  Handlebars.registerHelper('lt', function (a: unknown, b: unknown) {
    return Number(a) < Number(b);
  });
  Handlebars.registerHelper('gt', function (a: unknown, b: unknown) {
    return Number(a) > Number(b);
  });
  Handlebars.registerHelper('lte', function (a: unknown, b: unknown) {
    return Number(a) <= Number(b);
  });
  Handlebars.registerHelper('gte', function (a: unknown, b: unknown) {
    return Number(a) >= Number(b);
  });

  // Formatting (for {{currency x}}, {{number x 0}}, etc.)
  Handlebars.registerHelper('currency', function (value: unknown) {
    const n = Number(value ?? 0);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  });
  Handlebars.registerHelper('number', function (value: unknown, decimals?: number) {
    const n = Number(value ?? 0);
    const d = typeof decimals === 'number' ? decimals : 0;
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    }).format(n);
  });
  Handlebars.registerHelper('percent', function (value: unknown, decimals?: number) {
    const n = Number(value ?? 0);
    const d = typeof decimals === 'number' ? decimals : 1;
    return `${n.toFixed(d)}%`;
  });
  Handlebars.registerHelper('date', function (value: unknown, format?: string) {
    if (value == null) return '';
    const d = typeof value === 'string' ? new Date(value) : (value as Date);
    const date = d instanceof Date ? d : new Date(String(value));
    if (isNaN(date.getTime())) return String(value);
    if (format === 'long') {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
    return date.toLocaleDateString('en-US');
  });
  Handlebars.registerHelper('duration', function (value: unknown, unit?: string) {
    const hrs = Number(value ?? 0);
    const u = (unit ?? 'auto') as string;
    if (u === 'h') {
      return `${hrs.toFixed(0)}h`;
    }
    if (u === 'min') {
      return `${(hrs * 60).toFixed(0)}min`;
    }
    if (u === 's') {
      return `${(hrs * 3600).toFixed(0)}s`;
    }
    // auto: treat as hours
    if (hrs < 1) return `${(hrs * 60).toFixed(0)}min`;
    return `${hrs.toFixed(0)}h`;
  });
  Handlebars.registerHelper('uppercase', function (value: unknown) {
    return String(value ?? '').toUpperCase();
  });
  Handlebars.registerHelper('lowercase', function (value: unknown) {
    return String(value ?? '').toLowerCase();
  });
}

// ============================================================================
// Template Engine
// ============================================================================

export class TemplateEngine {
  private compiled: Map<string, Handlebars.TemplateDelegate> = new Map();
  private templateDir: string;

  constructor(templateDir: string = 'config/response-templates') {
    this.templateDir = templateDir;
    registerHandlebarsHelpers();
  }

  /**
   * Render synthesized response using Handlebars template.
   * @param synthesis - Synthesis result (insights, recommendations, warnings, alerts, etc.)
   * @param templateId - e.g. charterer_bunker_planning_text
   * @param options - Render options
   * @param state - Optional full state; when provided, maps route_data/bunker_analysis into data.route / data.bunker for templates
   */
  async render(
    synthesis: unknown,
    templateId: string,
    options?: RenderOptions,
    state?: TemplateState
  ): Promise<string> {
    const templateSource = await this.getTemplate(templateId);
    if (!templateSource) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const context = this.prepareContext(synthesis, options ?? {}, state);

    try {
      let fn = this.compiled.get(templateId);
      if (!fn) {
        fn = Handlebars.compile(templateSource, { strict: false });
        this.compiled.set(templateId, fn);
      }
      const rendered = fn(context);
      return rendered;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ [TEMPLATE-ENGINE] Handlebars render failed for ${templateId}:`, msg);
      throw new Error(`Template rendering failed: ${msg}`);
    }
  }

  private async getTemplate(templateId: string): Promise<string | null> {
    const templatePath = this.resolveTemplatePath(templateId);
    if (!existsSync(templatePath)) {
      console.warn(`⚠️ [TEMPLATE-ENGINE] Template not found: ${templatePath}`);
      return null;
    }
    try {
      return readFileSync(templatePath, 'utf-8');
    } catch (err) {
      console.error(`❌ [TEMPLATE-ENGINE] Failed to read ${templatePath}:`, err);
      return null;
    }
  }

  private resolveTemplatePath(templateId: string): string {
    const parts = templateId.split('_');
    const stakeholder = parts[0];
    const format = parts[parts.length - 1];
    const queryType = parts.slice(1, -1).join('_');

    const possiblePaths = [
      join(process.cwd(), this.templateDir, stakeholder, `${queryType}.${format}.hbs`),
      join(process.cwd(), this.templateDir, stakeholder, `${queryType}.${format}.txt`),
      join(process.cwd(), 'frontend', this.templateDir, stakeholder, `${queryType}.${format}.hbs`),
      join(process.cwd(), 'frontend', 'config', 'response-templates', stakeholder, `${queryType}.${format}.hbs`),
    ];

    for (const p of possiblePaths) {
      if (existsSync(p)) return p;
    }
    return possiblePaths[0];
  }

  /**
   * Build context for Handlebars. Merges synthesis with optional state-derived data.route / data.bunker.
   */
  private prepareContext(
    synthesis: unknown,
    options: RenderOptions,
    state?: TemplateState
  ): TemplateContext {
    const s = (synthesis ?? {}) as Record<string, unknown>;
    const base: TemplateContext = {
      ...s,
      options: options ?? {},
      success: (s.success as boolean) ?? true,
      hasAlerts: Array.isArray(s.alerts) && (s.alerts as unknown[]).length > 0,
      hasWarnings: Array.isArray(s.warnings) && (s.warnings as unknown[]).length > 0,
      hasCriticalIssues:
        Array.isArray(s.alerts) &&
        (s.alerts as { level?: string }[]).some((a) => a.level === 'critical'),
    };

    if (state) {
      base.data = this.mapStateToData(state);
      base.correlationId = (state as { correlation_id?: string }).correlation_id ?? (state as { correlationId?: string }).correlationId;
      base.synthesizedAt = (s as { synthesizedAt?: unknown }).synthesizedAt ?? new Date();
    }

    return base;
  }

  /**
   * Map full state into data.route and data.bunker for charterer-style templates.
   */
  private mapStateToData(state: TemplateState): { route?: Record<string, unknown>; bunker?: Record<string, unknown> } {
    const routeData = state.route_data as Record<string, unknown> | undefined;
    const bunkerData = state.bunker_analysis as Record<string, unknown> | undefined;
    const multiBunker = state.multi_bunker_plan as Record<string, unknown> | undefined;

    const origin = routeData?.origin_port ?? routeData?.origin ?? routeData?.origin_port_code;
    const dest = routeData?.destination_port ?? routeData?.destination ?? routeData?.destination_port_code;
    const originName = routeData?.origin_port_name ?? (typeof origin === 'object' && origin !== null ? (origin as Record<string, unknown>).name as string : undefined);
    const destName = routeData?.destination_port_name ?? (typeof dest === 'object' && dest !== null ? (dest as Record<string, unknown>).name as string : undefined);
    const distanceNm =
      (routeData?.totalDistanceNm as number) ??
      (routeData?.distance_nm as number) ??
      (routeData?.distance as number);
    const estHours = (routeData?.estimatedHours as number) ?? (routeData?.estimated_hours as number);

    const waypointsCount = (routeData?.waypoints as unknown[] | undefined)?.length ?? (routeData?.waypoints_count as number) ?? 0;
    const originStr = typeof origin === 'object' && origin !== null ? (origin as Record<string, unknown>).port_code ?? (origin as Record<string, unknown>).code ?? String(origin) : String(origin ?? '');
    const destStr = typeof dest === 'object' && dest !== null ? (dest as Record<string, unknown>).port_code ?? (dest as Record<string, unknown>).code ?? String(dest) : String(dest ?? '');
    const route = {
      origin: originName ?? originStr,
      destination: destName ?? destStr,
      origin_port_code: routeData?.origin_port_code ?? originStr,
      destination_port_code: routeData?.destination_port_code ?? destStr,
      origin_port_name: originName,
      destination_port_name: destName,
      origin_coordinates: routeData?.origin_coordinates,
      destination_coordinates: routeData?.destination_coordinates,
      distance_nm: distanceNm ?? 0,
      estimated_hours: estHours ?? 0,
      waypoints_count: waypointsCount,
      waypoints: routeData?.waypoints,
    };

    const recs = (bunkerData?.recommendations ?? []) as unknown[];
    const best = (bunkerData?.best_option ?? recs[0]) as Record<string, unknown> | undefined;
    const bunker = {
      best_option: best
        ? {
            port_name: (best as { port_name?: string }).port_name ?? (best as { name?: string }).name ?? '',
            port_code: (best as { port_code?: string }).port_code ?? (best as { code?: string }).code ?? '',
            fuel_cost_usd: (best as { fuel_cost_usd?: number }).fuel_cost_usd ?? (best as { total_cost?: number }).total_cost ?? 0,
            deviation_cost_usd: (best as { deviation_cost_usd?: number }).deviation_cost_usd ?? (best as { deviation_fuel_cost?: number }).deviation_fuel_cost ?? 0,
            total_cost_usd: (best as { total_cost_usd?: number }).total_cost_usd ?? (best as { total_cost?: number }).total_cost ?? 0,
          }
        : undefined,
      max_savings_usd: (bunkerData?.max_savings_usd as number) ?? (bunkerData?.savings as number) ?? 0,
      alternatives_count: Array.isArray(recs) ? recs.length : 0,
    };

    return { route, bunker };
  }

  clearCache(): void {
    this.compiled.clear();
    console.log('🧹 [TEMPLATE-ENGINE] Template cache cleared');
  }

  async preloadTemplates(templateIds: string[]): Promise<void> {
    await Promise.all(templateIds.map((id) => this.getTemplate(id)));
    console.log(`✅ [TEMPLATE-ENGINE] Preloaded ${templateIds.length} templates`);
  }
}

// ============================================================================
// Singleton
// ============================================================================

let engineInstance: TemplateEngine | null = null;

export function getTemplateEngine(templateDir?: string): TemplateEngine {
  if (!engineInstance) {
    engineInstance = new TemplateEngine(templateDir);
  }
  return engineInstance;
}
