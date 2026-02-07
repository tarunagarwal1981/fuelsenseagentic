/**
 * Handlebars Template Helpers
 *
 * Custom helpers for common formatting needs in response templates.
 * Use: {{formatNumber count}}, {{formatCurrency cost}}, {{pluralize count "vessel"}}, etc.
 */

import Handlebars from 'handlebars';

/**
 * Register custom Handlebars helpers for template rendering
 */
export function registerTemplateHelpers(): void {
  // Format number with commas
  Handlebars.registerHelper('formatNumber', function (num: unknown) {
    const n = typeof num === 'number' ? num : Number(num ?? 0);
    return Number.isNaN(n) ? '0' : n.toLocaleString();
  });

  // Format currency
  Handlebars.registerHelper('formatCurrency', function (amount: unknown) {
    const n = typeof amount === 'number' ? amount : Number(amount ?? 0);
    return Number.isNaN(n) ? '$0' : `$${n.toLocaleString()}`;
  });

  // Pluralize
  Handlebars.registerHelper('pluralize', function (count: unknown, singular: string, plural?: string) {
    const n = Number(count ?? 0);
    if (n === 1) return singular;
    return plural ?? `${singular}s`;
  });

  // Format date
  Handlebars.registerHelper('formatDate', function (dateStr: unknown) {
    if (dateStr == null || dateStr === '') return 'N/A';
    const date = new Date(String(dateStr));
    if (isNaN(date.getTime())) return String(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  });

  // Array length
  Handlebars.registerHelper('length', function (arr: unknown) {
    return Array.isArray(arr) ? arr.length : 0;
  });

  // Increment (for indexing)
  Handlebars.registerHelper('inc', function (num: unknown) {
    return Number(num ?? 0) + 1;
  });

  // Conditional block: {{#ifCond v1 "==" v2}}...{{/ifCond}}
  Handlebars.registerHelper('ifCond', function (
    this: unknown,
    v1: unknown,
    operator: string,
    v2: unknown,
    options: Handlebars.HelperOptions
  ) {
    let result = false;
    switch (operator) {
      case '==':
        result = (v1 as any) == v2;
        break;
      case '===':
        result = v1 === v2;
        break;
      case '!=':
        result = (v1 as any) != v2;
        break;
      case '!==':
        result = v1 !== v2;
        break;
      case '<':
        result = Number(v1) < Number(v2);
        break;
      case '<=':
        result = Number(v1) <= Number(v2);
        break;
      case '>':
        result = Number(v1) > Number(v2);
        break;
      case '>=':
        result = Number(v1) >= Number(v2);
        break;
      default:
        result = false;
    }
    return result ? options.fn(this) : options.inverse(this);
  });
}
