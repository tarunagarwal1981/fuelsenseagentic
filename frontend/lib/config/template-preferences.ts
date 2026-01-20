/**
 * Template Preferences Manager
 * 
 * Allows users to customize how response templates are rendered.
 * Supports verbosity levels, hidden sections, and always-expanded sections.
 */

import type { ResponseTemplate, TemplateSection } from './template-loader';

// ============================================================================
// Types
// ============================================================================

export interface UserTemplatePreferences {
  user_id: string;
  verbosity: 'concise' | 'balanced' | 'detailed';
  hidden_sections: string[];
  always_expanded_sections: string[];
  section_order_override?: Record<string, number>;
}

export const DEFAULT_PREFERENCES: UserTemplatePreferences = {
  user_id: 'default',
  verbosity: 'balanced',
  hidden_sections: [],
  always_expanded_sections: [],
};

// ============================================================================
// Template Preferences Manager
// ============================================================================

export class TemplatePreferencesManager {
  /**
   * Apply user preferences to a template
   * 
   * This modifies a deep clone of the template based on user preferences:
   * - Verbosity controls which tiers are shown and their collapsed state
   * - Hidden sections are filtered out
   * - Always expanded sections are forced to be expanded
   * - Section order can be overridden
   */
  public applyPreferences(
    template: ResponseTemplate,
    preferences: UserTemplatePreferences
  ): ResponseTemplate {
    // Deep clone to avoid mutating the original
    const customized: ResponseTemplate = JSON.parse(JSON.stringify(template));
    
    // Apply verbosity settings
    this.applyVerbosity(customized, preferences.verbosity);
    
    // Filter out hidden sections
    if (preferences.hidden_sections.length > 0) {
      customized.template.sections = customized.template.sections.filter(
        (section: TemplateSection) => !preferences.hidden_sections.includes(section.id)
      );
    }
    
    // Apply always-expanded sections
    if (preferences.always_expanded_sections.length > 0) {
      customized.template.sections.forEach((section: TemplateSection) => {
        if (preferences.always_expanded_sections.includes(section.id)) {
          section.collapsed = false;
        }
      });
    }
    
    // Apply section order override
    if (preferences.section_order_override) {
      this.applySectionOrder(customized, preferences.section_order_override);
    }
    
    console.log(`📋 [PREFERENCES] Applied preferences (verbosity: ${preferences.verbosity}, hidden: ${preferences.hidden_sections.length}, expanded: ${preferences.always_expanded_sections.length})`);
    
    return customized;
  }
  
  /**
   * Apply verbosity level to template sections
   */
  private applyVerbosity(
    template: ResponseTemplate,
    verbosity: UserTemplatePreferences['verbosity']
  ): void {
    switch (verbosity) {
      case 'concise':
        // Hide Tier 3 completely, collapse all Tier 2
        template.template.sections = template.template.sections.filter(
          (section: TemplateSection) => section.tier !== 3
        );
        template.template.sections.forEach((section: TemplateSection) => {
          if (section.tier === 2) {
            section.collapsed = true;
          }
        });
        break;
        
      case 'detailed':
        // Expand all Tier 2 sections, keep Tier 3
        template.template.sections.forEach((section: TemplateSection) => {
          if (section.tier === 2) {
            section.collapsed = false;
          }
        });
        break;
        
      case 'balanced':
      default:
        // Keep original settings from template
        break;
    }
  }
  
  /**
   * Apply custom section ordering
   */
  private applySectionOrder(
    template: ResponseTemplate,
    orderOverride: Record<string, number>
  ): void {
    template.template.sections.sort((a: TemplateSection, b: TemplateSection) => {
      const aOrder = orderOverride[a.id] ?? a.priority;
      const bOrder = orderOverride[b.id] ?? b.priority;
      
      // First sort by tier, then by custom order/priority
      if (a.tier !== b.tier) {
        return a.tier - b.tier;
      }
      return aOrder - bOrder;
    });
  }
  
  /**
   * Get list of all available section IDs from a template
   */
  public getAvailableSections(template: ResponseTemplate): string[] {
    return template.template.sections.map((section: TemplateSection) => section.id);
  }
  
  /**
   * Validate preferences against a template
   */
  public validatePreferences(
    preferences: UserTemplatePreferences,
    template: ResponseTemplate
  ): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    const availableSections = this.getAvailableSections(template);
    
    // Check for invalid hidden sections
    preferences.hidden_sections.forEach((sectionId) => {
      if (!availableSections.includes(sectionId)) {
        warnings.push(`Hidden section "${sectionId}" does not exist in template`);
      }
    });
    
    // Check for invalid always-expanded sections
    preferences.always_expanded_sections.forEach((sectionId) => {
      if (!availableSections.includes(sectionId)) {
        warnings.push(`Always-expanded section "${sectionId}" does not exist in template`);
      }
    });
    
    return {
      valid: warnings.length === 0,
      warnings,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let preferencesManagerInstance: TemplatePreferencesManager | null = null;

export function getTemplatePreferencesManager(): TemplatePreferencesManager {
  if (!preferencesManagerInstance) {
    preferencesManagerInstance = new TemplatePreferencesManager();
  }
  return preferencesManagerInstance;
}
