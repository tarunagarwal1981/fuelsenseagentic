/**
 * Template Selector
 *
 * Selects appropriate templates based on stakeholder, query type, and format.
 */

// ============================================================================
// Types
// ============================================================================

export interface TemplateInfo {
  stakeholder: string;
  queryType: string;
  format: string;
  path: string;
}

export interface RequestContext {
  stakeholder?: string;
  format?: string;
  verbosity?: 'summary' | 'detailed' | 'full';
  includeMetrics?: boolean;
  includeReasoning?: boolean;
  headers?: {
    accept?: string;
    'user-agent'?: string;
  };
}

export interface UserProfile {
  role?: string;
  preferences?: {
    format?: string;
    verbosity?: 'summary' | 'detailed' | 'full';
  };
}

// ============================================================================
// Template Selector Class
// ============================================================================

export class TemplateSelector {
  /**
   * Select appropriate template based on context
   */
  selectTemplate(
    queryType: string,
    stakeholder: string,
    format: string
  ): string {
    // Template ID format: {stakeholder}_{queryType}_{format}
    const templateId = `${stakeholder}_${queryType}_${format}`;

    console.log(`🎨 [TEMPLATE-SELECTOR] Selected template: ${templateId}`);

    return templateId;
  }

  /**
   * Detect stakeholder from request or user profile
   */
  detectStakeholder(
    request?: RequestContext,
    userProfile?: UserProfile
  ): string {
    // Check explicit request
    if (request?.stakeholder) {
      return request.stakeholder;
    }

    // Check user profile
    if (userProfile?.role) {
      const roleMapping: Record<string, string> = {
        charterer: 'charterer',
        operator: 'operator',
        compliance_officer: 'compliance',
        technical_manager: 'technical',
        master: 'operator',
        chief_engineer: 'technical',
        api: 'api',
      };
      return roleMapping[userProfile.role] || 'charterer';
    }

    // Default
    return 'charterer';
  }

  /**
   * Detect output format from request
   */
  detectFormat(request?: RequestContext): string {
    // Check explicit format
    if (request?.format) {
      return request.format;
    }

    // Check Accept header
    if (request?.headers?.accept) {
      if (request.headers.accept.includes('text/html')) return 'html';
      if (request.headers.accept.includes('application/json')) return 'json';
      if (request.headers.accept.includes('text/plain')) return 'text';
    }

    // Check user agent for mobile
    if (request?.headers?.['user-agent']?.includes('Mobile')) {
      return 'mobile';
    }

    // Default
    return 'text';
  }

  /**
   * Get available templates for query type
   */
  getAvailableTemplates(queryType: string): TemplateInfo[] {
    const stakeholders = ['charterer', 'operator', 'compliance', 'technical', 'api'];
    const formats = ['text', 'html', 'json', 'mobile'];

    const templates: TemplateInfo[] = [];

    for (const stakeholder of stakeholders) {
      for (const format of formats) {
        // Not all combinations exist - add common ones
        if (
          (stakeholder === 'api' && format === 'json') ||
          (stakeholder !== 'api' && ['text', 'html'].includes(format)) ||
          (stakeholder === 'charterer' && format === 'json')
        ) {
          templates.push({
            stakeholder,
            queryType,
            format,
            path: `${stakeholder}/${queryType}.${format}.hbs`,
          });
        }
      }
    }

    return templates;
  }

  /**
   * Select template with auto-detection
   */
  selectTemplateAuto(
    queryType: string,
    request?: RequestContext,
    userProfile?: UserProfile
  ): string {
    const stakeholder = this.detectStakeholder(request, userProfile);
    const format = this.detectFormat(request);

    return this.selectTemplate(queryType, stakeholder, format);
  }

  /**
   * Get fallback template if primary not found
   */
  getFallbackTemplate(queryType: string, format: string): string {
    // Fallback order: charterer -> operator -> api
    const fallbacks = ['charterer', 'operator', 'api'];

    for (const stakeholder of fallbacks) {
      const templateId = `${stakeholder}_${queryType}_${format}`;
      return templateId;
    }

    // Ultimate fallback
    return `api_${queryType}_json`;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let selectorInstance: TemplateSelector | null = null;

export function getTemplateSelector(): TemplateSelector {
  if (!selectorInstance) {
    selectorInstance = new TemplateSelector();
  }
  return selectorInstance;
}
