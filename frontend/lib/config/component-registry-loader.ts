/**
 * Component Registry Loader
 *
 * Loads and validates the component registry YAML configuration.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYAML } from 'yaml';
import { componentRegistrySchema } from './schemas/component-schema';
import type { ComponentRegistryConfig } from '@/lib/types/component-registry';

const CONFIG_PATH = join(process.cwd(), 'lib/config/component-registry.yaml');

/**
 * Load the component registry configuration and validate with Zod schema
 */
export function loadComponentRegistry(): ComponentRegistryConfig {
  const fullPath = CONFIG_PATH;

  if (!existsSync(fullPath)) {
    throw new Error(`Component registry not found: ${fullPath}`);
  }

  const fileContent = readFileSync(fullPath, 'utf-8');
  const raw = parseYAML(fileContent);

  const result = componentRegistrySchema.safeParse(raw);

  if (!result.success) {
    const errors = result.error.issues
      .map((e) => `${e.path.map((p) => String(p)).join('.')}: ${e.message}`)
      .join('; ');
    throw new Error(`Component registry validation failed: ${errors}`);
  }

  return result.data as ComponentRegistryConfig;
}
