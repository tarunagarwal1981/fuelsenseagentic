/**
 * Context-Aware Template Selector
 *
 * Selects the most appropriate template based on synthesis context from AutoSynthesisEngine.
 * Uses primary_domain and query_type to choose templates - no hardcoded agent checks.
 *
 * EXTENSIBLE: Add new domain → template mappings to DOMAIN_TEMPLATES or QUERY_TYPE_TEMPLATES.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import type { SynthesisContext } from '@/lib/multi-agent/synthesis/auto-synthesis-engine';

const LOG_PREFIX = '[TEMPLATE-SELECTOR]';

// ============================================================================
// Domain → Template Mappings (extensible - add new domains here)
// ============================================================================

const DOMAIN_TEMPLATES: Record<string, string> = {
  bunker: 'bunker-planning',
  route: 'route-only',
  vessel: 'vessel_information',
  vessel_comparison: 'vessel_comparison',
  weather: 'bunker-planning', // Weather often accompanies bunker
  rob: 'rob_projection',
  compliance: 'compliance_report',
  cii: 'cii-rating',
  eu_ets: 'emissions-report',
  hull: 'hull-performance',
  generic: 'informational',
};

// ============================================================================
// Query Type → Template Mappings (extensible - add new query types here)
// ============================================================================

const QUERY_TYPE_TEMPLATES: Record<string, string> = {
  bunker_planning: 'bunker-planning',
  route_analysis: 'route-only',
  vessel_information: 'vessel_information',
  vessel_selection: 'vessel_comparison',
  weather_forecast: 'bunker-planning',
  rob_projection: 'rob_projection',
  compliance_check: 'compliance_report',
  cii_rating: 'cii-rating',
  emissions_reporting: 'emissions-report',
  hull_performance: 'hull-performance',
  general_query: 'informational',
};

// ============================================================================
// Context-Aware Template Selector
// ============================================================================

export class ContextAwareTemplateSelector {
  /**
   * Select template based on synthesis context
   *
   * AUTOMATIC TEMPLATE SELECTION:
   * - Looks at primary_domain from synthesis
   * - Checks query_type
   * - Selects most appropriate template
   * - Falls back gracefully if template doesn't exist
   */
  static selectTemplate(context: SynthesisContext): string {
    console.log(
      `${LOG_PREFIX} 🎨 Selecting template for ${context.primary_domain}/${context.query_type}`
    );

    // Try domain-specific template first
    const domainTemplate = this.getDomainTemplate(context.primary_domain);
    if (domainTemplate && this.templateExists(domainTemplate)) {
      console.log(`${LOG_PREFIX} ✅ Using domain template: ${domainTemplate}`);
      return domainTemplate;
    }

    // Try query-type template
    const queryTemplate = this.getQueryTypeTemplate(context.query_type);
    if (queryTemplate && this.templateExists(queryTemplate)) {
      console.log(`${LOG_PREFIX} ✅ Using query-type template: ${queryTemplate}`);
      return queryTemplate;
    }

    // Fallback: try domain/query even if not verified, then generic
    if (domainTemplate) {
      console.log(`${LOG_PREFIX} ⚠️ Domain template ${domainTemplate} may not exist, using anyway`);
      return domainTemplate;
    }
    if (queryTemplate) {
      console.log(`${LOG_PREFIX} ⚠️ Query template ${queryTemplate} may not exist, using anyway`);
      return queryTemplate;
    }

    // Ultimate fallback
    console.log(`${LOG_PREFIX} ⚠️ Using fallback template: informational`);
    return 'informational';
  }

  /**
   * Get template for domain (extensible - add to DOMAIN_TEMPLATES)
   */
  private static getDomainTemplate(domain: string): string | null {
    return DOMAIN_TEMPLATES[domain] ?? null;
  }

  /**
   * Get template for query type (extensible - add to QUERY_TYPE_TEMPLATES)
   */
  private static getQueryTypeTemplate(queryType: string): string | null {
    return QUERY_TYPE_TEMPLATES[queryType] ?? null;
  }

  /**
   * Check if template exists (checks YAML in template directories).
   * Template loader will fall back to default.yaml when template not found.
   */
  static templateExists(templateName: string): boolean {
    const possibleDirs = [
      join(process.cwd(), 'config', 'response-templates'),
      join(process.cwd(), 'frontend', 'config', 'response-templates'),
    ];

    for (const dir of possibleDirs) {
      const yamlPath = join(dir, `${templateName}.yaml`);
      if (existsSync(yamlPath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Add a new domain → template mapping (for runtime extensibility)
   */
  static addDomainMapping(domain: string, template: string): void {
    (DOMAIN_TEMPLATES as Record<string, string>)[domain] = template;
    console.log(`${LOG_PREFIX} Added domain mapping: ${domain} → ${template}`);
  }

  /**
   * Add a new query type → template mapping (for runtime extensibility)
   */
  static addQueryTypeMapping(queryType: string, template: string): void {
    (QUERY_TYPE_TEMPLATES as Record<string, string>)[queryType] = template;
    console.log(`${LOG_PREFIX} Added query type mapping: ${queryType} → ${template}`);
  }
}
