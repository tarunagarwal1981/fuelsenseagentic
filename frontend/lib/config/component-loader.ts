/**
 * Component Registry Loader
 * Loads and caches component registry configuration
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYAML } from 'yaml';
import { componentRegistrySchema } from './schemas/component-schema';
import type { ComponentRegistryConfig } from '@/lib/types/component-registry';

let cachedRegistry: ComponentRegistryConfig | null = null;

/**
 * Load component registry from YAML
 */
export function loadComponentRegistry(): ComponentRegistryConfig {
  if (cachedRegistry) {
    return cachedRegistry;
  }

  const configPath = join(process.cwd(), 'lib', 'config', 'component-registry.yaml');

  if (!existsSync(configPath)) {
    console.warn('[COMPONENT-LOADER] Registry not found, using empty registry');
    return {
      components: [],
      query_type_mappings: {},
      fallback: { strategy: 'text_only' },
    };
  }

  try {
    const fileContent = readFileSync(configPath, 'utf-8');
    const rawConfig = parseYAML(fileContent);

    // Validate with Zod
    const validationResult = componentRegistrySchema.safeParse(rawConfig);

    if (!validationResult.success) {
      console.error('[COMPONENT-LOADER] Validation failed:', validationResult.error);
      throw new Error('Component registry validation failed');
    }

    cachedRegistry = validationResult.data as ComponentRegistryConfig;
    console.log(
      `✅ [COMPONENT-LOADER] Loaded ${cachedRegistry.components.length} component definitions`
    );

    return cachedRegistry;
  } catch (error) {
    console.error('[COMPONENT-LOADER] Failed to load registry:', error);
    throw error;
  }
}

/**
 * Clear cache (useful for testing/hot-reload)
 */
export function clearComponentRegistryCache(): void {
  cachedRegistry = null;
}
