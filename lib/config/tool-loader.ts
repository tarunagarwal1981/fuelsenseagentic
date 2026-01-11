/**
 * Tool Configuration Loader
 * 
 * Loads and validates tool configurations from YAML config files.
 */

import { z } from 'zod';
import { getYAMLLoader } from './yaml-loader';

/**
 * JSON Schema type for tool schemas
 */
const jsonSchemaSchema = z.record(z.any());

/**
 * Tool configuration schema
 */
export const toolConfigSchema = z.object({
  name: z.string().min(1, 'Tool name is required'),
  description: z.string().min(1, 'Tool description is required'),
  implementation: z.string().min(1, 'Tool implementation path is required'),
  inputSchema: jsonSchemaSchema,
  outputSchema: jsonSchemaSchema.optional(),
  timeout: z.number().int().positive().optional(),
  retries: z.number().int().min(0).max(5).optional(),
});

export type ToolConfig = z.infer<typeof toolConfigSchema>;

/**
 * Load tool configuration from YAML file
 * 
 * @param configPath - Path to tool config file (relative to project root or absolute)
 * @returns Validated tool configuration
 * 
 * @example
 * ```typescript
 * const config = await loadToolConfig('config/tools/route-calculator.yaml');
 * ```
 */
export async function loadToolConfig(configPath: string): Promise<ToolConfig> {
  const loader = getYAMLLoader();
  return loader.load(configPath, toolConfigSchema);
}

/**
 * Load all tool configurations from a directory
 * 
 * @param directory - Directory containing tool config files (default: 'config/tools')
 * @returns Map of tool name to configuration
 * 
 * @example
 * ```typescript
 * const tools = await loadAllToolConfigs('config/tools');
 * const routeCalculator = tools.get('route-calculator');
 * ```
 */
export async function loadAllToolConfigs(
  directory: string = 'config/tools'
): Promise<Map<string, ToolConfig>> {
  const loader = getYAMLLoader();
  return loader.loadAll(directory, toolConfigSchema);
}

/**
 * Validate tool configuration (for manual validation)
 */
export function validateToolConfig(config: unknown): config is ToolConfig {
  try {
    toolConfigSchema.parse(config);
    return true;
  } catch {
    return false;
  }
}

