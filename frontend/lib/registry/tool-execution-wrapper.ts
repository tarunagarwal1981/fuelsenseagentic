/**
 * Tool Execution Wrapper
 * 
 * Wraps tool implementations with metrics tracking and error handling.
 * Automatically records call metrics to the Tool Registry.
 */

import { ToolRegistry } from '@/lib/registry/tool-registry';
import type { ToolFunction } from '@/lib/types/tool-registry';

/**
 * Wrap a tool implementation with metrics tracking
 * 
 * Automatically records:
 * - Total calls
 * - Success/failure counts
 * - Latency (exponential moving average)
 * - Last called timestamp
 * 
 * @param toolId - Tool ID from registry
 * @param fn - Tool implementation function
 * @returns Wrapped function with metrics tracking
 */
export function withMetrics(toolId: string, fn: ToolFunction): ToolFunction {
  return async (...args: any[]) => {
    const registry = ToolRegistry.getInstance();
    const tool = registry.getById(toolId);
    
    if (!tool) {
      console.warn(`⚠️ [TOOL-WRAPPER] Tool ${toolId} not found in registry, skipping metrics`);
      return fn(...args);
    }
    
    const startTime = Date.now();
    let success = false;
    
    try {
      const result = await fn(...args);
      success = true;
      
      const duration = Date.now() - startTime;
      registry.recordCall(toolId, true, duration);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      registry.recordCall(toolId, false, duration);
      
      // Re-throw the error so callers can handle it
      throw error;
    }
  };
}

/**
 * Execute a tool with metrics tracking
 * 
 * Convenience function that wraps tool execution with metrics.
 * 
 * @param toolId - Tool ID from registry
 * @param args - Tool arguments
 * @returns Tool result
 */
export async function executeToolWithMetrics(
  toolId: string,
  ...args: any[]
): Promise<any> {
  const registry = ToolRegistry.getInstance();
  const tool = registry.getById(toolId);
  
  if (!tool) {
    throw new Error(`Tool ${toolId} not found in registry`);
  }
  
  const wrappedFn = withMetrics(toolId, tool.implementation);
  return wrappedFn(...args);
}

/**
 * Get tool metrics
 * 
 * @param toolId - Tool ID
 * @returns Tool metrics or null if not found
 */
export function getToolMetrics(toolId: string) {
  const registry = ToolRegistry.getInstance();
  const tool = registry.getById(toolId);
  
  if (!tool) {
    return null;
  }
  
  return {
    ...tool.metrics,
    reliability: tool.reliability,
    avgLatencyMs: tool.avgLatencyMs,
  };
}

/**
 * Get all tools metrics summary
 * 
 * @returns Summary of all tool metrics
 */
export function getAllToolMetrics() {
  const registry = ToolRegistry.getInstance();
  const tools = registry.getAll();
  
  return tools.map((tool) => ({
    id: tool.id,
    name: tool.name,
    metrics: {
      ...tool.metrics,
      reliability: tool.reliability,
      avgLatencyMs: tool.avgLatencyMs,
    },
  }));
}
