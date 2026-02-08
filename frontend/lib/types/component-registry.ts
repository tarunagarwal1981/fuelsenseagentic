/**
 * Component Registry Types
 */

export interface ComponentDefinition {
  id: string;
  name: string;
  component: string;
  description: string;
  required_state_fields: string[];
  optional_state_fields?: string[];
  render_conditions?: string[];
  produced_by: string[];
  priority: number;
  tier: 0 | 1 | 2 | 3;
  props_mapping: Record<string, string>;
}

export interface QueryTypeMapping {
  components: string[];
}

export interface FallbackConfig {
  strategy: 'llm_synthesis' | 'text_only';
  llm_config?: {
    model: string;
    temperature: number;
    max_tokens: number;
  };
  always_show_as_text?: string[];
}

export interface ComponentRegistryConfig {
  components: ComponentDefinition[];
  query_type_mappings: Record<string, QueryTypeMapping>;
  fallback: FallbackConfig;
}

export interface MatchedComponent {
  id: string;
  component: string;
  props: Record<string, unknown>;
  tier: number;
  priority: number;
  canRender: boolean;
  missingFields?: string[];
}
