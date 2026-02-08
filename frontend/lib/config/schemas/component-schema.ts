import { z } from 'zod';

export const componentDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  component: z.string(),
  description: z.string(),
  required_state_fields: z.array(z.string()),
  optional_state_fields: z.array(z.string()).optional(),
  render_conditions: z.array(z.string()).optional(),
  produced_by: z.array(z.string()),
  priority: z.number().int().min(0),
  tier: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  props_mapping: z.record(z.string(), z.string()),
});

export const componentRegistrySchema = z.object({
  components: z.array(componentDefinitionSchema),
  query_type_mappings: z.record(
    z.string(),
    z.object({
      components: z.array(z.string()),
    })
  ),
  fallback: z.object({
    strategy: z.enum(['llm_synthesis', 'text_only']),
    llm_config: z
      .object({
        model: z.string(),
        temperature: z.number(),
        max_tokens: z.number(),
      })
      .optional(),
    always_show_as_text: z.array(z.string()).optional(),
  }),
});

export type ComponentDefinition = z.infer<typeof componentDefinitionSchema>;
export type ComponentRegistryConfig = z.infer<typeof componentRegistrySchema>;
