/**
 * Tool Configuration Loader
 *
 * Loads and validates tool configurations from YAML config files.
 */
import { z } from 'zod';
/**
 * Tool configuration schema
 */
export declare const toolConfigSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    implementation: z.ZodString;
    inputSchema: z.ZodRecord<z.ZodString, z.ZodAny>;
    outputSchema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    timeout: z.ZodOptional<z.ZodNumber>;
    retries: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description: string;
    implementation: string;
    inputSchema: Record<string, any>;
    outputSchema?: Record<string, any> | undefined;
    timeout?: number | undefined;
    retries?: number | undefined;
}, {
    name: string;
    description: string;
    implementation: string;
    inputSchema: Record<string, any>;
    outputSchema?: Record<string, any> | undefined;
    timeout?: number | undefined;
    retries?: number | undefined;
}>;
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
export declare function loadToolConfig(configPath: string): Promise<ToolConfig>;
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
export declare function loadAllToolConfigs(directory?: string): Promise<Map<string, ToolConfig>>;
/**
 * Validate tool configuration (for manual validation)
 */
export declare function validateToolConfig(config: unknown): config is ToolConfig;
//# sourceMappingURL=tool-loader.d.ts.map