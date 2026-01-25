/**
 * Template Engine
 *
 * Renders synthesized responses using Handlebars templates.
 * Supports multiple stakeholders and output formats.
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

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

interface TemplateContext {
  [key: string]: any;
}

// ============================================================================
// Simple Template Engine (No External Dependencies)
// ============================================================================

/**
 * Simple template engine that replaces {{variable}} placeholders
 * Supports basic conditionals and loops
 */
export class TemplateEngine {
  private templates: Map<string, string> = new Map();
  private templateDir: string;

  constructor(templateDir: string = 'config/response-templates') {
    this.templateDir = templateDir;
  }

  /**
   * Render synthesized response using template
   */
  async render(
    synthesis: any,
    templateId: string,
    options?: RenderOptions
  ): Promise<string> {
    const template = await this.getTemplate(templateId);

    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Prepare context
    const context = this.prepareContext(synthesis, options || {});

    try {
      const rendered = this.renderTemplate(template, context);
      return rendered;
    } catch (error: any) {
      console.error(`❌ Template rendering failed for ${templateId}:`, error);
      throw new Error(`Template rendering failed: ${error.message}`);
    }
  }

  /**
   * Get or load template
   */
  private async getTemplate(templateId: string): Promise<string | null> {
    // Check cache
    if (this.templates.has(templateId)) {
      return this.templates.get(templateId)!;
    }

    // Load template from file
    const templatePath = this.resolveTemplatePath(templateId);
    if (!existsSync(templatePath)) {
      console.warn(`⚠️  Template not found: ${templatePath}`);
      return null;
    }

    try {
      const templateSource = readFileSync(templatePath, 'utf-8');
      this.templates.set(templateId, templateSource);
      return templateSource;
    } catch (error) {
      console.error(`❌ Failed to load template from ${templatePath}:`, error);
      return null;
    }
  }

  /**
   * Resolve template path from ID
   */
  private resolveTemplatePath(templateId: string): string {
    // Template ID format: {stakeholder}_{queryType}_{format}
    // Example: charterer_bunker_planning_text

    const parts = templateId.split('_');
    const stakeholder = parts[0];
    const format = parts[parts.length - 1];
    const queryType = parts.slice(1, -1).join('_');

    // Try multiple possible paths
    const possiblePaths = [
      join(process.cwd(), this.templateDir, stakeholder, `${queryType}.${format}.hbs`),
      join(process.cwd(), this.templateDir, stakeholder, `${queryType}.${format}.txt`),
      join(process.cwd(), this.templateDir, stakeholder, `${queryType}.${format}`),
      join(process.cwd(), 'frontend', this.templateDir, stakeholder, `${queryType}.${format}.hbs`),
    ];

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    // Return first path as default (will fail gracefully)
    return possiblePaths[0];
  }

  /**
   * Prepare context for template rendering
   */
  private prepareContext(synthesis: any, options: RenderOptions): TemplateContext {
    return {
      ...synthesis,
      options: options || {},

      // Computed fields
      hasAlerts: synthesis.alerts?.length > 0,
      hasWarnings: synthesis.warnings?.length > 0,
      hasCriticalIssues:
        synthesis.alerts?.some((a: any) => a.level === 'critical') || false,

      // Format helpers (will be used in template)
      _formatCurrency: (value: number) =>
        `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      _formatDate: (date: Date | string) => {
        const d = typeof date === 'string' ? new Date(date) : date;
        return d.toLocaleDateString('en-US');
      },
      _formatDuration: (ms: number) => `${(ms / 1000).toFixed(1)}s`,
    };
  }

  /**
   * Simple template rendering (replaces {{variable}} placeholders)
   * Supports basic conditionals {{#if var}}...{{/if}} and loops {{#each array}}...{{/each}}
   */
  private renderTemplate(template: string, context: TemplateContext): string {
    let result = template;

    // Handle conditionals {{#if var}}...{{/if}}
    result = result.replace(
      /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (match, condition, content) => {
        const value = this.getNestedValue(context, condition.trim());
        if (this.isTruthy(value)) {
          return this.renderTemplate(content, context);
        }
        return '';
      }
    );

    // Handle loops {{#each array}}...{{/each}}
    result = result.replace(
      /\{\{#each\s+([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
      (match, arrayPath, content) => {
        const array = this.getNestedValue(context, arrayPath.trim());
        if (Array.isArray(array)) {
          return array
            .map((item, index) => {
              const itemContext = {
                ...context,
                ...item,
                '@index': index,
                '@first': index === 0,
                '@last': index === array.length - 1,
              };
              // Replace @last and @index in content
              let itemContent = content;
              itemContent = itemContent.replace(/\{\{@last\}\}/g, String(index === array.length - 1));
              itemContent = itemContent.replace(/\{\{@first\}\}/g, String(index === 0));
              itemContent = itemContent.replace(/\{\{@index\}\}/g, String(index));
              return this.renderTemplate(itemContent, itemContext);
            })
            .join('');
        }
        return '';
      }
    );

      // Handle nested property access {{data.route.origin}}
      result = result.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
        const trimmedPath = path.trim();

        // Skip if statements and each loops (already handled)
        if (
          trimmedPath.startsWith('#if') ||
          trimmedPath.startsWith('#each') ||
          trimmedPath.startsWith('/')
        ) {
          return match;
        }

        // Handle @last, @first, @index (loop context)
        if (trimmedPath === '@last' || trimmedPath === '@first' || trimmedPath === '@index') {
          const value = this.getNestedValue(context, trimmedPath);
          return value !== undefined && value !== null ? String(value) : '';
        }

        // Handle helpers like {{currency value}} or {{number value}}
        if (trimmedPath.includes(' ')) {
          const [helper, ...args] = trimmedPath.split(' ');
          return this.applyHelper(helper, args, context);
        }

        // Regular property access
        const value = this.getNestedValue(context, trimmedPath);
        return value !== undefined && value !== null ? String(value) : '';
      });

    return result;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, prop) => {
      if (current === null || current === undefined) return undefined;
      return current[prop];
    }, obj);
  }

  /**
   * Check if value is truthy
   */
  private isTruthy(value: any): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return Boolean(value);
  }

  /**
   * Apply template helper function
   */
  private applyHelper(helper: string, args: string[], context: TemplateContext): string {
    const value = this.getNestedValue(context, args[0]);

    switch (helper) {
      case 'currency':
        return `$${Number(value || 0).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;

      case 'number':
        const decimals = args[1] ? parseInt(args[1]) : 0;
        return Number(value || 0).toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });

      case 'percent':
        const dec = args[1] ? parseInt(args[1]) : 1;
        return `${Number(value || 0).toFixed(dec)}%`;

      case 'date':
        const format = args[1] || 'short';
        const date = typeof value === 'string' ? new Date(value) : value;
        if (!(date instanceof Date)) return String(value);
        if (format === 'long') {
          return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        }
        return date.toLocaleDateString('en-US');

      case 'duration':
        const unit = args[1] || 'auto';
        const ms = Number(value || 0);
        if (unit === 'auto') {
          if (ms < 1000) return `${ms}ms`;
          if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
          if (ms < 3600000) return `${(ms / 60000).toFixed(1)}min`;
          return `${(ms / 3600000).toFixed(1)}h`;
        } else if (unit === 's') {
          return `${(ms / 1000).toFixed(1)}s`;
        } else if (unit === 'min') {
          return `${(ms / 60000).toFixed(1)}min`;
        } else if (unit === 'h') {
          return `${(ms / 3600000).toFixed(1)}h`;
        }
        return `${ms}ms`;

      case 'uppercase':
        return String(value || '').toUpperCase();

      case 'lowercase':
        return String(value || '').toLowerCase();

      case 'truncate':
        const length = args[1] ? parseInt(args[1]) : 100;
        const str = String(value || '');
        return str.length <= length ? str : str.substring(0, length) + '...';

      case 'eq':
        const val1 = this.getNestedValue(context, args[0]);
        const val2 = args[1]?.startsWith('"') || args[1]?.startsWith("'")
          ? args[1].slice(1, -1)
          : this.getNestedValue(context, args[1]);
        return val1 === val2 ? 'true' : '';

      case 'gt':
        const num1 = Number(this.getNestedValue(context, args[0]) || 0);
        const num2 = Number(args[1] || 0);
        return num1 > num2 ? 'true' : '';

      case 'lt':
        const num3 = Number(this.getNestedValue(context, args[0]) || 0);
        const num4 = Number(args[1] || 0);
        return num3 < num4 ? 'true' : '';

      default:
        return String(value || '');
    }
  }

  /**
   * Clear template cache
   */
  clearCache(): void {
    this.templates.clear();
    console.log('🧹 Template cache cleared');
  }

  /**
   * Preload templates
   */
  async preloadTemplates(templateIds: string[]): Promise<void> {
    await Promise.all(templateIds.map((id) => this.getTemplate(id)));
    console.log(`✅ Preloaded ${templateIds.length} templates`);
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let engineInstance: TemplateEngine | null = null;

export function getTemplateEngine(templateDir?: string): TemplateEngine {
  if (!engineInstance) {
    engineInstance = new TemplateEngine(templateDir);
  }
  return engineInstance;
}
