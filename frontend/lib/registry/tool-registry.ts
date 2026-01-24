/**
 * Tool Registry
 * 
 * Centralized registry for all tools in the FuelSense 360 multi-agent architecture.
 * Provides tool discovery, validation, and intelligent routing capabilities.
 * 
 * Features:
 * - Singleton pattern for global access
 * - In-memory storage with Map for O(1) lookups
 * - Advanced search and filtering
 * - Validation and dependency checking
 * - Metrics tracking
 */

import type {
  ToolDefinition,
  ToolCategory,
  ToolSearchCriteria,
  ValidationResult,
  JSONSchema,
} from '@/lib/types/tool-registry';

export class ToolRegistry {
  private static instance: ToolRegistry;
  private tools: Map<string, ToolDefinition> = new Map();

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  /**
   * Register a tool with the registry
   * 
   * @param tool - Tool definition to register
   * @throws Error if tool ID already exists or validation fails
   */
  register(tool: ToolDefinition): void {
    // Validate tool definition
    const validation = this.validateToolDefinition(tool);
    if (!validation.valid) {
      throw new Error(
        `Failed to register tool ${tool.id}: ${validation.errors.join(', ')}`
      );
    }

    // Check for duplicate ID
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool with ID '${tool.id}' is already registered`);
    }

    // Check for circular dependencies
    const circularCheck = this.checkCircularDependencies(tool.id, tool.dependencies.internal);
    if (!circularCheck.valid) {
      throw new Error(
        `Circular dependency detected for tool ${tool.id}: ${circularCheck.errors.join(', ')}`
      );
    }

    // Register the tool
    this.tools.set(tool.id, { ...tool });
    console.log(`✅ [TOOL-REGISTRY] Registered tool: ${tool.id} (${tool.name})`);
  }

  /**
   * Get a tool by its ID
   * 
   * @param toolId - Unique tool identifier
   * @returns Tool definition or undefined if not found
   */
  getById(toolId: string): ToolDefinition | undefined {
    return this.tools.get(toolId);
  }

  /**
   * Get all tools in a specific category
   * 
   * @param category - Tool category to filter by
   * @returns Array of tool definitions
   */
  getByCategory(category: ToolCategory): ToolDefinition[] {
    return Array.from(this.tools.values()).filter(
      (tool) => tool.category === category
    );
  }

  /**
   * Get all registered tools
   * 
   * @returns Array of all tool definitions
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all tools available to a specific agent
   * 
   * @param agentId - Agent identifier
   * @returns Array of tool definitions available to the agent
   */
  getByAgent(agentId: string): ToolDefinition[] {
    return Array.from(this.tools.values()).filter((tool) =>
      tool.agentIds.includes(agentId)
    );
  }

  /**
   * Search tools by multiple criteria
   * 
   * @param criteria - Search criteria object
   * @returns Array of matching tool definitions
   */
  search(criteria: ToolSearchCriteria): ToolDefinition[] {
    let results = Array.from(this.tools.values());

    // Filter by category
    if (criteria.category) {
      results = results.filter((tool) => tool.category === criteria.category);
    }

    // Filter by domain
    if (criteria.domain) {
      results = results.filter((tool) => tool.domain.includes(criteria.domain!));
    }

    // Filter by agent ID
    if (criteria.agentId) {
      results = results.filter((tool) =>
        tool.agentIds.includes(criteria.agentId!)
      );
    }

    // Filter by minimum reliability
    if (criteria.minReliability !== undefined) {
      results = results.filter(
        (tool) => tool.reliability >= criteria.minReliability!
      );
    }

    // Filter by maximum latency
    if (criteria.maxLatencyMs !== undefined) {
      results = results.filter(
        (tool) => tool.avgLatencyMs <= criteria.maxLatencyMs!
      );
    }

    // Filter by cost
    if (criteria.cost) {
      results = results.filter((tool) => tool.cost === criteria.cost);
    }

    // Exclude deprecated tools
    if (criteria.excludeDeprecated) {
      results = results.filter((tool) => !tool.deprecated);
    }

    return results;
  }

  /**
   * Validate a tool definition
   * 
   * @param toolId - Tool ID to validate (if tool is already registered)
   * @returns Validation result with errors and warnings
   */
  validate(toolId: string): ValidationResult {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return {
        valid: false,
        errors: [`Tool with ID '${toolId}' not found`],
        warnings: [],
      };
    }

    return this.validateToolDefinition(tool);
  }

  /**
   * Clear all registered tools (for testing)
   */
  clear(): void {
    this.tools.clear();
    console.log('🧹 [TOOL-REGISTRY] Cleared all tools');
  }

  /**
   * Get total number of registered tools
   */
  getCount(): number {
    return this.tools.size;
  }

  /**
   * Check if a tool exists
   * 
   * @param toolId - Tool ID to check
   * @returns True if tool is registered
   */
  has(toolId: string): boolean {
    return this.tools.has(toolId);
  }

  /**
   * Update tool metrics after a call
   * 
   * @param toolId - Tool ID
   * @param success - Whether the call was successful
   * @param latencyMs - Call latency in milliseconds
   */
  recordCall(toolId: string, success: boolean, latencyMs: number): void {
    const tool = this.tools.get(toolId);
    if (!tool) {
      console.warn(`⚠️ [TOOL-REGISTRY] Cannot record call for unknown tool: ${toolId}`);
      return;
    }

    tool.metrics.totalCalls++;
    if (success) {
      tool.metrics.successCalls++;
    } else {
      tool.metrics.failureCalls++;
    }
    tool.metrics.lastCalledAt = new Date();

    // Update reliability (exponential moving average)
    const alpha = 0.1; // Smoothing factor
    tool.reliability =
      alpha * (success ? 1 : 0) + (1 - alpha) * tool.reliability;

    // Update average latency (exponential moving average)
    tool.avgLatencyMs =
      alpha * latencyMs + (1 - alpha) * tool.avgLatencyMs;
  }

  /**
   * Get tools sorted by reliability (highest first)
   */
  getByReliability(): ToolDefinition[] {
    return Array.from(this.tools.values()).sort(
      (a, b) => b.reliability - a.reliability
    );
  }

  /**
   * Get tools sorted by latency (lowest first)
   */
  getByLatency(): ToolDefinition[] {
    return Array.from(this.tools.values()).sort(
      (a, b) => a.avgLatencyMs - b.avgLatencyMs
    );
  }

  /**
   * Internal: Validate a tool definition
   */
  private validateToolDefinition(tool: ToolDefinition): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate ID
    if (!tool.id || typeof tool.id !== 'string' || tool.id.trim() === '') {
      errors.push('Tool ID is required and must be a non-empty string');
    } else if (!/^[a-z0-9_]+$/.test(tool.id)) {
      errors.push('Tool ID must contain only lowercase letters, numbers, and underscores');
    }

    // Validate name
    if (!tool.name || typeof tool.name !== 'string' || tool.name.trim() === '') {
      errors.push('Tool name is required and must be a non-empty string');
    }

    // Validate description
    if (!tool.description || typeof tool.description !== 'string' || tool.description.trim() === '') {
      errors.push('Tool description is required and must be a non-empty string');
    }

    // Validate version (semver)
    if (!tool.version || typeof tool.version !== 'string') {
      errors.push('Tool version is required and must be a string');
    } else if (!/^\d+\.\d+\.\d+/.test(tool.version)) {
      warnings.push(`Tool version '${tool.version}' does not follow semantic versioning (X.Y.Z)`);
    }

    // Validate category
    const validCategories: ToolCategory[] = [
      'routing',
      'weather',
      'bunker',
      'compliance',
      'vessel',
      'calculation',
      'validation',
    ];
    if (!validCategories.includes(tool.category)) {
      errors.push(`Invalid category '${tool.category}'. Must be one of: ${validCategories.join(', ')}`);
    }

    // Validate domain
    if (!Array.isArray(tool.domain)) {
      errors.push('Domain must be an array of strings');
    } else if (tool.domain.length === 0) {
      warnings.push('Tool has no domain tags');
    }

    // Validate input schema
    if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
      errors.push('Input schema is required');
    } else {
      const schemaErrors = this.validateJSONSchema(tool.inputSchema, 'inputSchema');
      errors.push(...schemaErrors);
    }

    // Validate output schema
    if (!tool.outputSchema || typeof tool.outputSchema !== 'object') {
      errors.push('Output schema is required');
    } else {
      const schemaErrors = this.validateJSONSchema(tool.outputSchema, 'outputSchema');
      errors.push(...schemaErrors);
    }

    // Validate cost
    const validCosts: Array<ToolDefinition['cost']> = ['free', 'api_call', 'expensive'];
    if (!validCosts.includes(tool.cost)) {
      errors.push(`Invalid cost '${tool.cost}'. Must be one of: ${validCosts.join(', ')}`);
    }

    // Validate latency values
    if (typeof tool.avgLatencyMs !== 'number' || tool.avgLatencyMs < 0) {
      errors.push('avgLatencyMs must be a non-negative number');
    }
    if (typeof tool.maxLatencyMs !== 'number' || tool.maxLatencyMs < 0) {
      errors.push('maxLatencyMs must be a non-negative number');
    }
    if (tool.maxLatencyMs < tool.avgLatencyMs) {
      warnings.push('maxLatencyMs is less than avgLatencyMs, which may cause premature timeouts');
    }

    // Validate reliability
    if (typeof tool.reliability !== 'number' || tool.reliability < 0 || tool.reliability > 1) {
      errors.push('reliability must be a number between 0 and 1');
    }

    // Validate dependencies
    if (!tool.dependencies || typeof tool.dependencies !== 'object') {
      errors.push('Dependencies object is required');
    } else {
      if (!Array.isArray(tool.dependencies.external)) {
        errors.push('dependencies.external must be an array');
      }
      if (!Array.isArray(tool.dependencies.internal)) {
        errors.push('dependencies.internal must be an array');
      }
    }

    // Validate agent IDs
    if (!Array.isArray(tool.agentIds) || tool.agentIds.length === 0) {
      warnings.push('Tool has no assigned agent IDs');
    }

    // Validate implementation
    if (typeof tool.implementation !== 'function') {
      errors.push('Implementation must be a function');
    }

    // Validate metrics
    if (!tool.metrics || typeof tool.metrics !== 'object') {
      errors.push('Metrics object is required');
    } else {
      if (typeof tool.metrics.totalCalls !== 'number' || tool.metrics.totalCalls < 0) {
        errors.push('metrics.totalCalls must be a non-negative number');
      }
      if (typeof tool.metrics.successCalls !== 'number' || tool.metrics.successCalls < 0) {
        errors.push('metrics.successCalls must be a non-negative number');
      }
      if (typeof tool.metrics.failureCalls !== 'number' || tool.metrics.failureCalls < 0) {
        errors.push('metrics.failureCalls must be a non-negative number');
      }
      if (tool.metrics.successCalls + tool.metrics.failureCalls > tool.metrics.totalCalls) {
        errors.push('successCalls + failureCalls cannot exceed totalCalls');
      }
    }

    // Validate timestamps
    if (!(tool.createdAt instanceof Date)) {
      errors.push('createdAt must be a Date object');
    }
    if (!(tool.updatedAt instanceof Date)) {
      errors.push('updatedAt must be a Date object');
    }

    // Validate deprecated/replacedBy
    if (tool.deprecated && !tool.replacedBy) {
      warnings.push('Deprecated tool should specify replacedBy tool ID');
    }
    if (tool.replacedBy && !tool.deprecated) {
      warnings.push('Tool specifies replacedBy but is not marked as deprecated');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Internal: Validate JSON Schema structure
   */
  private validateJSONSchema(schema: any, context: string): string[] {
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
    }

    if (!Array.isArray(schema.required)) {
      errors.push(`${context}.required must be an array`);
    } else {
      // Check that all required fields exist in properties
      const propertyKeys = schema.properties ? Object.keys(schema.properties) : [];
      for (const requiredField of schema.required) {
        if (!propertyKeys.includes(requiredField)) {
          errors.push(`${context}.required field '${requiredField}' not found in properties`);
        }
      }
    }

    return errors;
  }

  /**
   * Internal: Check for circular dependencies
   * Uses DFS to detect cycles in the dependency graph
   */
  private checkCircularDependencies(
    toolId: string,
    dependencies: string[],
    visited: Set<string> = new Set(),
    recStack: Set<string> = new Set(),
    path: string[] = []
  ): ValidationResult {
    const errors: string[] = [];

    // If we're currently exploring this node (in recursion stack), we found a cycle
    if (recStack.has(toolId)) {
      const cycleStart = path.indexOf(toolId);
      const cycle = [...path.slice(cycleStart), toolId].join(' -> ');
      errors.push(`Circular dependency detected: ${cycle}`);
      return { valid: false, errors, warnings: [] };
    }

    // If already visited and not in recursion stack, no cycle
    if (visited.has(toolId)) {
      return { valid: true, errors: [], warnings: [] };
    }

    // Mark as visited and add to recursion stack
    visited.add(toolId);
    recStack.add(toolId);
    path.push(toolId);

    // Check all dependencies
    for (const depId of dependencies) {
      const depTool = this.tools.get(depId);
      if (depTool) {
        const depCheck = this.checkCircularDependencies(
          depId,
          depTool.dependencies.internal,
          visited,
          recStack,
          path
        );
        if (!depCheck.valid) {
          errors.push(...depCheck.errors);
        }
      }
    }

    // Remove from recursion stack (backtrack)
    recStack.delete(toolId);
    path.pop();

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
    };
  }
}

// Export singleton instance getter as default
export default ToolRegistry.getInstance();
