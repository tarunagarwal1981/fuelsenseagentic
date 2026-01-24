/**
 * Tool Loader
 * 
 * Utilities for loading, validating, and registering tools from various sources.
 * Supports loading from configuration files, directories, and programmatic registration.
 */

import ToolRegistry from '@/lib/registry/tool-registry';
import type {
  ToolDefinition,
  ValidationResult,
  JSONSchema,
} from '@/lib/types/tool-registry';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Load tools from a YAML configuration file
 * 
 * @param configPath - Path to YAML configuration file
 * @returns Array of loaded tool definitions
 * @throws Error if file cannot be read or parsed
 * 
 * @example
 * ```typescript
 * const tools = await loadToolsFromConfig('./config/tools.yaml');
 * tools.forEach(tool => ToolRegistry.getInstance().register(tool));
 * ```
 */
export async function loadToolsFromConfig(
  configPath: string
): Promise<ToolDefinition[]> {
  try {
    const fileContent = fs.readFileSync(configPath, 'utf-8');
    
    // For now, we'll support JSON format
    // YAML support can be added later with a YAML parser
    if (configPath.endsWith('.json')) {
      const config = JSON.parse(fileContent);
      return Array.isArray(config.tools) ? config.tools : [];
    }
    
    // TODO: Add YAML parsing support when needed
    throw new Error('YAML format not yet supported. Use JSON format.');
  } catch (error: any) {
    throw new Error(`Failed to load tools from config: ${error.message}`);
  }
}

/**
 * Register a single tool with validation
 * 
 * @param definition - Tool definition to register
 * @returns Validation result
 * @throws Error if registration fails
 */
export function registerTool(definition: ToolDefinition): ValidationResult {
  const registry = ToolRegistry.getInstance();
  const validation = validateToolDefinition(definition);
  
  if (!validation.valid) {
    throw new Error(
      `Tool validation failed: ${validation.errors.join(', ')}`
    );
  }
  
  try {
    registry.register(definition);
    return {
      valid: true,
      errors: [],
      warnings: validation.warnings,
    };
  } catch (error: any) {
    return {
      valid: false,
      errors: [error.message],
      warnings: validation.warnings,
    };
  }
}

/**
 * Register multiple tools from an array
 * 
 * @param definitions - Array of tool definitions
 * @returns Array of validation results (one per tool)
 */
export function registerTools(definitions: ToolDefinition[]): ValidationResult[] {
  return definitions.map((def) => {
    try {
      return registerTool(def);
    } catch (error: any) {
      return {
        valid: false,
        errors: [error.message],
        warnings: [],
      };
    }
  });
}

/**
 * Auto-discover and register tools from a directory
 * 
 * Looks for TypeScript/JavaScript files that export tool definitions.
 * Expected pattern: Each file exports a ToolDefinition or an array of ToolDefinition.
 * 
 * @param directoryPath - Path to directory containing tool definition files
 * @param pattern - File pattern to match (default: '*.tool.ts' or '*.tool.js')
 * @returns Array of validation results
 * 
 * @example
 * ```typescript
 * // In a file: tools/route-calculator.tool.ts
 * export const routeCalculatorTool: ToolDefinition = { ... };
 * 
 * // Load all tools
 * const results = await registerToolsFromDirectory('./tools');
 * ```
 */
export async function registerToolsFromDirectory(
  directoryPath: string,
  pattern: string = '*.tool.{ts,js}'
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  
  try {
    if (!fs.existsSync(directoryPath)) {
      throw new Error(`Directory does not exist: ${directoryPath}`);
    }
    
    const files = fs.readdirSync(directoryPath);
    const toolFiles = files.filter((file) => 
      file.endsWith('.tool.ts') || file.endsWith('.tool.js')
    );
    
    for (const file of toolFiles) {
      const filePath = path.join(directoryPath, file);
      try {
        // Dynamic import would be needed for runtime loading
        // For now, this is a placeholder that expects manual registration
        console.warn(
          `⚠️ [TOOL-LOADER] Runtime loading from ${filePath} not yet implemented. ` +
          `Please use registerTool() or loadToolsFromConfig() instead.`
        );
      } catch (error: any) {
        results.push({
          valid: false,
          errors: [`Failed to load ${file}: ${error.message}`],
          warnings: [],
        });
      }
    }
  } catch (error: any) {
    throw new Error(`Failed to load tools from directory: ${error.message}`);
  }
  
  return results;
}

/**
 * Validate a tool definition
 * 
 * Performs comprehensive validation including:
 * - Schema structure validation
 * - ID uniqueness check (if already registered)
 * - Dependency validation
 * - Semantic versioning check
 * 
 * @param definition - Tool definition to validate
 * @returns Validation result with errors and warnings
 */
export function validateToolDefinition(
  definition: ToolDefinition
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const registry = ToolRegistry.getInstance();
  
  // Basic structure validation
  if (!definition.id || typeof definition.id !== 'string') {
    errors.push('Tool ID is required and must be a string');
  }
  
  if (!definition.name || typeof definition.name !== 'string') {
    errors.push('Tool name is required and must be a string');
  }
  
  if (!definition.description || typeof definition.description !== 'string') {
    errors.push('Tool description is required and must be a string');
  }
  
  // Version validation (semver)
  if (!definition.version || typeof definition.version !== 'string') {
    errors.push('Tool version is required and must be a string');
  } else {
    const semverPattern = /^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?(\+[a-zA-Z0-9-]+)?$/;
    if (!semverPattern.test(definition.version)) {
      warnings.push(
        `Version '${definition.version}' does not follow semantic versioning (X.Y.Z[-prerelease][+build])`
      );
    }
  }
  
  // Schema validation
  if (!definition.inputSchema || typeof definition.inputSchema !== 'object') {
    errors.push('Input schema is required');
  } else {
    const schemaErrors = validateJSONSchema(definition.inputSchema, 'inputSchema');
    errors.push(...schemaErrors);
  }
  
  if (!definition.outputSchema || typeof definition.outputSchema !== 'object') {
    errors.push('Output schema is required');
  } else {
    const schemaErrors = validateJSONSchema(definition.outputSchema, 'outputSchema');
    errors.push(...schemaErrors);
  }
  
  // Dependency validation
  if (definition.dependencies) {
    if (Array.isArray(definition.dependencies.internal)) {
      for (const depId of definition.dependencies.internal) {
        if (!registry.has(depId)) {
          warnings.push(
            `Internal dependency '${depId}' is not yet registered. ` +
            `Ensure it is registered before using this tool.`
          );
        }
      }
    }
  }
  
  // Check for duplicate ID
  if (registry.has(definition.id)) {
    errors.push(`Tool with ID '${definition.id}' is already registered`);
  }
  
  // Implementation validation
  if (typeof definition.implementation !== 'function') {
    errors.push('Implementation must be a function');
  }
  
  // Metrics initialization check
  if (!definition.metrics) {
    warnings.push('Metrics not initialized. Default metrics will be used.');
  }
  
  // Timestamp validation
  if (!(definition.createdAt instanceof Date)) {
    errors.push('createdAt must be a Date object');
  }
  
  if (!(definition.updatedAt instanceof Date)) {
    errors.push('updatedAt must be a Date object');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate JSON Schema structure
 * 
 * @param schema - JSON Schema object to validate
 * @param context - Context name for error messages
 * @returns Array of error messages
 */
export function validateJSONSchema(
  schema: any,
  context: string = 'schema'
): string[] {
  const errors: string[] = [];
  
  if (!schema || typeof schema !== 'object') {
    errors.push(`${context} must be an object`);
    return errors;
  }
  
  if (schema.type !== 'object') {
    errors.push(`${context}.type must be 'object'`);
  }
  
  if (!schema.properties || typeof schema.properties !== 'object') {
    errors.push(`${context}.properties must be an object`);
  } else {
    // Validate each property schema
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (!propSchema || typeof propSchema !== 'object') {
        errors.push(`${context}.properties.${key} must be an object`);
      }
    }
  }
  
  if (schema.required) {
    if (!Array.isArray(schema.required)) {
      errors.push(`${context}.required must be an array`);
    } else {
      // Check that all required fields exist in properties
      const propertyKeys = schema.properties ? Object.keys(schema.properties) : [];
      for (const requiredField of schema.required) {
        if (typeof requiredField !== 'string') {
          errors.push(`${context}.required must contain only strings`);
        } else if (!propertyKeys.includes(requiredField)) {
          errors.push(
            `${context}.required field '${requiredField}' not found in properties`
          );
        }
      }
    }
  }
  
  return errors;
}

/**
 * Create a default tool definition template
 * 
 * Useful for creating new tool definitions with required fields initialized.
 * 
 * @param id - Tool ID
 * @param name - Tool name
 * @param implementation - Tool implementation function
 * @returns Partial tool definition with defaults filled in
 */
export function createToolTemplate(
  id: string,
  name: string,
  implementation: ToolDefinition['implementation']
): Partial<ToolDefinition> {
  const now = new Date();
  
  return {
    id,
    name,
    description: '',
    version: '1.0.0',
    category: 'calculation',
    domain: [],
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {},
    },
    cost: 'free',
    avgLatencyMs: 0,
    maxLatencyMs: 5000,
    reliability: 1.0,
    dependencies: {
      external: [],
      internal: [],
    },
    agentIds: [],
    requiresAuth: false,
    implementation,
    metrics: {
      totalCalls: 0,
      successCalls: 0,
      failureCalls: 0,
    },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Export all registered tools to a JSON configuration file
 * 
 * @param outputPath - Path to write the JSON file
 * @returns Number of tools exported
 */
export function exportToolsToConfig(outputPath: string): number {
  const registry = ToolRegistry.getInstance();
  const tools = registry.getAll();
  
  const config = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    tools: tools.map((tool) => {
      // Remove implementation function (not serializable)
      const { implementation, ...serializableTool } = tool;
      return serializableTool;
    }),
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(config, null, 2), 'utf-8');
  console.log(`✅ [TOOL-LOADER] Exported ${tools.length} tools to ${outputPath}`);
  
  return tools.length;
}
