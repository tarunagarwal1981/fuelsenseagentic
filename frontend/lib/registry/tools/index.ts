/**
 * Tool Registry Index
 * 
 * Central registration point for all tools in the FuelSense 360 system.
 * Call registerAllTools() at application startup to initialize the registry.
 */

import { ToolRegistry } from '@/lib/registry/tool-registry';

// Import all tool definitions
import {
  calculateRouteTool,
  calculateWeatherTimelineTool,
} from './routing-tools';

import {
  fetchMarineWeatherTool,
  calculateWeatherConsumptionTool,
  checkBunkerPortWeatherTool,
} from './weather-tools';

import {
  findBunkerPortsTool,
  getFuelPricesTool,
  analyzeBunkerOptionsTool,
} from './bunker-tools';

import {
  fetchNoonReportTool,
  fetchVesselSpecsTool,
  fetchConsumptionProfileTool,
} from './vessel-performance-tools';

/**
 * Register all tools with the Tool Registry
 * 
 * This function should be called at application startup to initialize
 * the tool registry with all available tools.
 * 
 * @throws Error if tool registration fails (e.g., duplicate IDs, validation errors)
 */
export function registerAllTools(): void {
  const registry = ToolRegistry.getInstance();
  
  // Clear registry first (useful for testing/reloading)
  registry.clear();
  
  const tools = [
    // Routing tools
    calculateRouteTool,
    calculateWeatherTimelineTool,
    
    // Weather tools
    fetchMarineWeatherTool,
    calculateWeatherConsumptionTool,
    checkBunkerPortWeatherTool,
    
    // Bunker tools
    findBunkerPortsTool,
    getFuelPricesTool,
    analyzeBunkerOptionsTool,

    // Vessel performance tools
    fetchNoonReportTool,
    fetchVesselSpecsTool,
    fetchConsumptionProfileTool,
  ];
  
  let registeredCount = 0;
  let errorCount = 0;
  
  for (const tool of tools) {
    try {
      registry.register(tool);
      registeredCount++;
    } catch (error: any) {
      console.error(`❌ [TOOL-REGISTRY] Failed to register tool ${tool.id}:`, error.message);
      errorCount++;
    }
  }
  
  if (errorCount > 0) {
    throw new Error(
      `Failed to register ${errorCount} of ${tools.length} tools. ` +
      `Successfully registered ${registeredCount} tools.`
    );
  }
  
  console.log(`✅ [TOOL-REGISTRY] Successfully registered ${registeredCount} tools`);
  console.log(`   Routing: 2 tools`);
  console.log(`   Weather: 3 tools`);
  console.log(`   Bunker: 3 tools`);
  console.log(`   Vessel Performance: 3 tools`);
}

/**
 * Get all registered tool IDs
 * 
 * @returns Array of tool IDs
 */
export function getAllToolIds(): string[] {
  const registry = ToolRegistry.getInstance();
  return registry.getAll().map((tool) => tool.id);
}

/**
 * Verify all expected tools are registered
 * 
 * @returns Object with verification results
 */
export function verifyToolRegistration(): {
  allRegistered: boolean;
  missing: string[];
  extra: string[];
} {
  const registry = ToolRegistry.getInstance();
  const registeredIds = new Set(registry.getAll().map((tool) => tool.id));
  
  const expectedTools = [
    'calculate_route',
    'calculate_weather_timeline',
    'fetch_marine_weather',
    'calculate_weather_consumption',
    'check_bunker_port_weather',
    'find_bunker_ports',
    'get_fuel_prices',
    'analyze_bunker_options',
    'fetch_noon_report',
    'fetch_vessel_specs',
    'fetch_consumption_profile',
  ];
  
  const expectedSet = new Set(expectedTools);
  const missing = expectedTools.filter((id) => !registeredIds.has(id));
  const extra = Array.from(registeredIds).filter((id) => !expectedSet.has(id));
  
  return {
    allRegistered: missing.length === 0,
    missing,
    extra,
  };
}

// Export individual tools for direct access if needed
export {
  calculateRouteTool,
  calculateWeatherTimelineTool,
  fetchMarineWeatherTool,
  calculateWeatherConsumptionTool,
  checkBunkerPortWeatherTool,
  findBunkerPortsTool,
  getFuelPricesTool,
  analyzeBunkerOptionsTool,
  fetchNoonReportTool,
  fetchVesselSpecsTool,
  fetchConsumptionProfileTool,
};
