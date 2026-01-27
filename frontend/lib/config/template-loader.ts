/**
 * Response Template Loader
 * 
 * Loads and caches YAML-based response templates.
 * Templates control response structure, sections, and business rules.
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// ============================================================================
// Types
// ============================================================================

export interface ResponseTemplate {
  template: {
    query_type: string;
    name: string;
    version: string;
    description?: string;
    sections: TemplateSection[];
    business_rules?: BusinessRule[];
  };
}

export interface TemplateSection {
  id: string;
  title?: string;  // Optional for tier 0 (map component)
  tier: 0 | 1 | 2 | 3;  // 0 = map (always visible), 1 = primary, 2 = priorities/risks, 3 = expandable details
  priority: number;
  visibility: 'always' | 'expandable' | 'conditional';
  collapsed?: boolean;
  max_words?: number;
  max_items?: number;  // For array rendering
  condition?: string;
  notes?: string;  // Documentation
  content_source: {
    state_path?: string | string[];  // Optional for component-based sections
    template?: string;
    format?: string;
    fallback?: string;
    component?: string;  // React component name
    props?: Record<string, string>;  // Props mapping
    render_as?: string;  // Render mode
  };
}

export interface BusinessRule {
  name: string;
  description?: string;
  condition: string;
  action: 'show' | 'hide' | 'move_to_tier_1' | 'collapse' | 'expand';
  target: string;
}

// ============================================================================
// Template Loader Class
// ============================================================================

export class TemplateLoader {
  private cache: Map<string, ResponseTemplate> = new Map();
  private templatesDir: string;
  
  constructor(templatesDir?: string) {
    this.templatesDir = templatesDir || this.resolveTemplatesDir();
    console.log(`📁 [TEMPLATE-LOADER] Templates directory: ${this.templatesDir}`);
  }
  
  /**
   * Resolve templates directory with the following priority:
   * 1. TEMPLATES_DIR environment variable (if set and exists)
   * 2. Project root config/response-templates
   * 3. Frontend config/response-templates
   * 4. Relative paths from __dirname
   * 5. Deployed paths (/var/task/...)
   */
  private resolveTemplatesDir(): string {
    if (process.env.TEMPLATES_DIR) {
      const envPath = path.resolve(process.env.TEMPLATES_DIR);
      if (fs.existsSync(envPath)) {
        console.log(`📁 [TEMPLATE-LOADER] Using env TEMPLATES_DIR: ${envPath}`);
        return envPath;
      }
      console.warn(
        `⚠️ [TEMPLATE-LOADER] TEMPLATES_DIR set but path doesn't exist: ${envPath}. Falling back to default resolution.`
      );
    }

    const possiblePaths = [
      path.join(process.cwd(), 'config', 'response-templates'),
      path.join(process.cwd(), 'frontend', 'config', 'response-templates'),
      path.join(__dirname, '..', '..', '..', 'config', 'response-templates'),
      path.join(__dirname, '..', '..', 'config', 'response-templates'),
      path.join(__dirname, '..', 'config', 'response-templates'),
      '/var/task/config/response-templates',
      '/var/task/frontend/config/response-templates',
      path.join(process.cwd(), '.next', 'server', 'config', 'response-templates'),
    ];

    for (const p of possiblePaths) {
      try {
        if (fs.existsSync(p)) {
          console.log(`✅ [TEMPLATE-LOADER] Resolved templates directory: ${p}`);
          console.log(`📁 [TEMPLATE-LOADER] Working directory: ${process.cwd()}`);
          return p;
        }
      } catch {
        // Path check failed, try next
      }
    }

    console.error('[TEMPLATE-LOADER] No templates directory found!');
    console.error('[TEMPLATE-LOADER] Attempted paths:');
    possiblePaths.forEach((p, i) => console.error(`  ${i + 1}. ${p}`));
    console.error('[TEMPLATE-LOADER] Set TEMPLATES_DIR env var to override.');
    throw new Error(
      'Templates directory not found. Set TEMPLATES_DIR environment variable or ensure config/response-templates exists in project root.'
    );
  }
  
  /**
   * Load a template by query type.
   * Falls back to default.yaml when the requested template is not found.
   */
  public loadTemplate(queryType: string): ResponseTemplate | null {
    if (this.cache.has(queryType)) {
      console.log(`✅ [TEMPLATE-LOADER] Cache hit: ${queryType}`);
      return this.cache.get(queryType)!;
    }

    const templatePath = path.join(this.templatesDir, `${queryType}.yaml`);

    if (!fs.existsSync(templatePath)) {
      console.warn(`⚠️ [TEMPLATE-LOADER] Template not found: ${queryType}.yaml`);
      const defaultPath = path.join(this.templatesDir, 'default.yaml');
      if (fs.existsSync(defaultPath)) {
        console.log('[TEMPLATE-LOADER] Using default template as fallback');
        return this.loadTemplate('default');
      }
      console.warn('[TEMPLATE-LOADER] No default template found');
      return null;
    }

    try {
      const fileContents = fs.readFileSync(templatePath, 'utf8');
      const template = yaml.load(fileContents) as ResponseTemplate;

      if (!template?.template) {
        throw new Error(`Invalid template format in ${queryType}.yaml: missing 'template' key`);
      }

      this.validateTemplate(template, queryType);
      this.cache.set(queryType, template);

      console.log(`✅ [TEMPLATE-LOADER] Loaded: ${template.template.name} v${template.template.version}`);
      console.log(`   Sections: ${template.template.sections.length}`);
      console.log(`   Rules: ${template.template.business_rules?.length || 0}`);

      return template;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ [TEMPLATE-LOADER] Error loading '${queryType}':`, message);
      if (queryType !== 'default') {
        console.log('[TEMPLATE-LOADER] Attempting default template as ultimate fallback');
        return this.loadTemplate('default');
      }
      return null;
    }
  }
  
  /**
   * Validate template structure
   */
  private validateTemplate(template: ResponseTemplate, queryType: string): void {
    if (!template.template) {
      throw new Error(`Template ${queryType} missing "template" root property`);
    }
    
    const t = template.template;
    
    if (!t.query_type) throw new Error('Missing query_type');
    if (!t.name) throw new Error('Missing name');
    if (!t.version) throw new Error('Missing version');
    if (!t.sections || t.sections.length === 0) throw new Error('Must have at least one section');
    
    // Validate each section
    t.sections.forEach((section, index) => {
      if (!section.id) throw new Error(`Section ${index} missing id`);
      // Title is optional for tier 0 (map component)
      if (!section.title && section.tier !== 0) {
        throw new Error(`Section ${section.id} missing title`);
      }
      if (![0, 1, 2, 3].includes(section.tier)) {
        throw new Error(`Section ${section.id} invalid tier: ${section.tier}`);
      }
      if (!section.content_source) {
        throw new Error(`Section ${section.id} missing content_source`);
      }
    });
    
    // Validate business rules
    if (t.business_rules) {
      t.business_rules.forEach((rule, index) => {
        if (!rule.name) throw new Error(`Rule ${index} missing name`);
        if (!rule.condition) throw new Error(`Rule ${rule.name} missing condition`);
        if (!rule.action) throw new Error(`Rule ${rule.name} missing action`);
        if (!rule.target) throw new Error(`Rule ${rule.name} missing target`);
      });
    }
  }
  
  /**
   * List all available templates
   */
  public listTemplates(): string[] {
    if (!fs.existsSync(this.templatesDir)) {
      return [];
    }
    
    return fs.readdirSync(this.templatesDir)
      .filter(file => file.endsWith('.yaml') && !file.startsWith('_'))
      .map(file => file.replace('.yaml', ''));
  }
  
  /**
   * Clear cache (useful for testing/hot reload)
   */
  public clearCache(): void {
    this.cache.clear();
    console.log('🗑️ [TEMPLATE-LOADER] Cache cleared');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let loaderInstance: TemplateLoader | null = null;

export function getTemplateLoader(): TemplateLoader {
  if (!loaderInstance) {
    loaderInstance = new TemplateLoader();
  }
  return loaderInstance;
}
