/**
 * Component Registry Verification Tests
 *
 * Verifies:
 * 1. YAML file is valid and loads without errors
 * 2. Types are exported correctly
 * 3. Zod schema validates the YAML structure
 */

import { loadComponentRegistry } from '@/lib/config/component-registry-loader';
import {
  componentDefinitionSchema,
  componentRegistrySchema,
  type ComponentDefinition,
  type ComponentRegistryConfig,
} from '@/lib/config/schemas/component-schema';
import type {
  MatchedComponent,
  FallbackConfig,
  QueryTypeMapping,
} from '@/lib/types/component-registry';

describe('Component Registry', () => {
  describe('YAML loading', () => {
    it('loads component-registry.yaml without errors', () => {
      expect(() => loadComponentRegistry()).not.toThrow();
    });

    it('returns valid ComponentRegistryConfig structure', () => {
      const config = loadComponentRegistry();

      expect(config).toHaveProperty('components');
      expect(config).toHaveProperty('query_type_mappings');
      expect(config).toHaveProperty('fallback');
      expect(Array.isArray(config.components)).toBe(true);
      expect(typeof config.query_type_mappings).toBe('object');
      expect(typeof config.fallback).toBe('object');
    });
  });

  describe('Zod schema validation', () => {
    it('validates loaded config against componentRegistrySchema', () => {
      const config = loadComponentRegistry();
      const result = componentRegistrySchema.safeParse(config);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.components.length).toBeGreaterThan(0);
      }
    });

    it('validates each component against componentDefinitionSchema', () => {
      const config = loadComponentRegistry();

      for (const component of config.components) {
        const result = componentDefinitionSchema.safeParse(component);
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid component structure', () => {
      const invalidComponent = {
        id: 'test',
        // missing: name, component, description, required_state_fields, produced_by, priority, tier, props_mapping
      };
      const result = componentDefinitionSchema.safeParse(invalidComponent);
      expect(result.success).toBe(false);
    });
  });

  describe('Type exports', () => {
    it('ComponentDefinition has required fields', () => {
      const config = loadComponentRegistry();
      const def: ComponentDefinition = config.components[0];

      expect(def.id).toBeDefined();
      expect(def.name).toBeDefined();
      expect(def.component).toBeDefined();
      expect(def.description).toBeDefined();
      expect(Array.isArray(def.required_state_fields)).toBe(true);
      expect(Array.isArray(def.produced_by)).toBe(true);
      expect(typeof def.priority).toBe('number');
      expect([0, 1, 2, 3]).toContain(def.tier);
      expect(typeof def.props_mapping).toBe('object');
    });

    it('QueryTypeMapping has components array', () => {
      const config = loadComponentRegistry();
      const mapping: QueryTypeMapping =
        config.query_type_mappings.bunker_planning;

      expect(Array.isArray(mapping.components)).toBe(true);
      expect(mapping.components.length).toBeGreaterThan(0);
    });

    it('FallbackConfig has valid strategy', () => {
      const config = loadComponentRegistry();
      const fallback: FallbackConfig = config.fallback;

      expect(['llm_synthesis', 'text_only']).toContain(fallback.strategy);
      if (fallback.llm_config) {
        expect(fallback.llm_config.model).toBeDefined();
        expect(typeof fallback.llm_config.temperature).toBe('number');
        expect(typeof fallback.llm_config.max_tokens).toBe('number');
      }
    });

    it('MatchedComponent interface is usable', () => {
      const matched: MatchedComponent = {
        id: 'route_map',
        component: 'RouteMap',
        props: { route: {} },
        tier: 0,
        priority: 0,
        canRender: true,
      };
      expect(matched.canRender).toBe(true);
    });
  });

  describe('Registry content', () => {
    it('contains expected component IDs', () => {
      const config = loadComponentRegistry();
      const ids = config.components.map((c) => c.id);

      expect(ids).toContain('route_map');
      expect(ids).toContain('bunker_comparison');
      expect(ids).toContain('eca_compliance');
      expect(ids).toContain('weather_timeline');
    });

    it('query_type_mappings reference valid component IDs', () => {
      const config = loadComponentRegistry();
      const validIds = new Set(config.components.map((c) => c.id));

      for (const [queryType, mapping] of Object.entries(
        config.query_type_mappings
      )) {
        for (const componentId of mapping.components) {
          expect(validIds.has(componentId)).toBe(true);
        }
      }
    });
  });
});
