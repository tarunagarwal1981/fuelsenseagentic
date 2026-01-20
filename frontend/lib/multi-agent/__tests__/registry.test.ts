/**
 * Registry Tests
 * 
 * Validates that agent registry is properly populated and functional.
 * Tests the new LLM binding capabilities and deterministic agent handling.
 */

// Load environment variables FIRST before any other imports
import './setup-env';

import { AgentRegistry } from '../registry';
// Import agent-nodes to trigger registrations
import '../agent-nodes';

/**
 * Test registry functionality
 */
export function testRegistry(): void {
  console.log('\n🧪 [REGISTRY-TEST] Starting registry validation...\n');
  
  // Test 1: Check that agents are registered (4 agents: route, compliance, weather, bunker)
  const allAgents = AgentRegistry.getAllAgents();
  console.log(`✅ Test 1: Found ${allAgents.length} registered agents`);
  
  if (allAgents.length < 3) {
    console.error(`❌ Test 1 FAILED: Expected at least 3 agents, found ${allAgents.length}`);
    return;
  }
  
  // Test 2: Check each agent has correct number of tools
  const routeAgent = AgentRegistry.getAgent('route_agent');
  const weatherAgent = AgentRegistry.getAgent('weather_agent');
  const bunkerAgent = AgentRegistry.getAgent('bunker_agent');
  const complianceAgent = AgentRegistry.getAgent('compliance_agent');
  
  console.log(`✅ Test 2: Agent retrieval works`);
  console.log(`   - route_agent: ${routeAgent?.available_tools.length || 0} tools`);
  console.log(`   - weather_agent: ${weatherAgent?.available_tools.length || 0} tools`);
  console.log(`   - bunker_agent: ${bunkerAgent?.available_tools.length || 0} tools (deterministic)`);
  console.log(`   - compliance_agent: ${complianceAgent?.available_tools.length || 0} tools (deterministic)`);
  
  if (!routeAgent || routeAgent.available_tools.length !== 2) {
    console.error(`❌ Test 2 FAILED: route_agent should have 2 tools, found ${routeAgent?.available_tools.length || 0}`);
    return;
  }
  
  if (!weatherAgent || weatherAgent.available_tools.length !== 3) {
    console.error(`❌ Test 2 FAILED: weather_agent should have 3 tools, found ${weatherAgent?.available_tools.length || 0}`);
    return;
  }
  
  // Bunker agent is deterministic and has 0 tools
  if (!bunkerAgent || bunkerAgent.available_tools.length !== 0) {
    console.error(`❌ Test 2 FAILED: bunker_agent should have 0 tools (deterministic), found ${bunkerAgent?.available_tools.length || 0}`);
    return;
  }
  
  // Test 3: Check getAgent() returns correct metadata
  console.log(`✅ Test 3: Agent metadata validation`);
  console.log(`   - route_agent description: ${routeAgent?.description.substring(0, 50)}...`);
  console.log(`   - weather_agent description: ${weatherAgent?.description.substring(0, 50)}...`);
  console.log(`   - bunker_agent description: ${bunkerAgent?.description.substring(0, 50)}...`);
  
  if (!routeAgent?.description || !weatherAgent?.description || !bunkerAgent?.description) {
    console.error(`❌ Test 3 FAILED: Agents missing descriptions`);
    return;
  }
  
  // Test 4: Check toJSON() produces valid JSON
  const registryJSON = AgentRegistry.toJSON();
  try {
    const parsed = JSON.parse(registryJSON);
    console.log(`✅ Test 4: toJSON() produces valid JSON`);
    console.log(`   - Total agents in JSON: ${parsed.total_agents}`);
    console.log(`   - Agents array length: ${parsed.agents?.length || 0}`);
    
    if (parsed.total_agents < 3 || parsed.agents?.length < 3) {
      console.error(`❌ Test 4 FAILED: JSON structure incorrect`);
      return;
    }
  } catch (error) {
    console.error(`❌ Test 4 FAILED: toJSON() produced invalid JSON:`, error);
    return;
  }
  
  // Test 5: Check tool metadata includes all required fields
  console.log(`✅ Test 5: Tool metadata validation`);
  let allToolsValid = true;
  
  for (const agent of allAgents) {
    for (const tool of agent.available_tools) {
      const hasName = !!tool.tool_name;
      const hasDescription = !!tool.description;
      const hasWhenToUse = Array.isArray(tool.when_to_use) && tool.when_to_use.length > 0;
      const hasWhenNotToUse = Array.isArray(tool.when_not_to_use);
      const hasPrerequisites = Array.isArray(tool.prerequisites);
      const hasProduces = Array.isArray(tool.produces);
      
      if (!hasName || !hasDescription || !hasWhenToUse || !hasWhenNotToUse || !hasPrerequisites || !hasProduces) {
        console.error(`❌ Test 5 FAILED: Tool ${tool.tool_name} missing required fields`);
        allToolsValid = false;
      }
    }
  }
  
  if (!allToolsValid) {
    return;
  }
  
  console.log(`✅ Test 5: All tools have required metadata fields`);
  
  // Test 6: Check isDeterministicAgent() works correctly
  console.log(`\n🧪 Test 6: isDeterministicAgent() validation`);
  
  const bunkerIsDeterministic = AgentRegistry.isDeterministicAgent('bunker_agent');
  const complianceIsDeterministic = AgentRegistry.isDeterministicAgent('compliance_agent');
  const routeIsDeterministic = AgentRegistry.isDeterministicAgent('route_agent');
  const weatherIsDeterministic = AgentRegistry.isDeterministicAgent('weather_agent');
  
  console.log(`   - bunker_agent deterministic: ${bunkerIsDeterministic}`);
  console.log(`   - compliance_agent deterministic: ${complianceIsDeterministic}`);
  console.log(`   - route_agent deterministic: ${routeIsDeterministic}`);
  console.log(`   - weather_agent deterministic: ${weatherIsDeterministic}`);
  
  if (!bunkerIsDeterministic) {
    console.error(`❌ Test 6 FAILED: bunker_agent should be deterministic`);
    return;
  }
  
  if (!complianceIsDeterministic) {
    console.error(`❌ Test 6 FAILED: compliance_agent should be deterministic`);
    return;
  }
  
  // route_agent and weather_agent are NOT deterministic (they use LLM tool calling)
  // Note: They don't have is_deterministic set, so they default to false
  
  console.log(`✅ Test 6: isDeterministicAgent() works correctly`);
  
  // Test 7: Check getToolsForLLMBinding() returns correct format
  console.log(`\n🧪 Test 7: getToolsForLLMBinding() validation`);
  
  const toolsForBinding = AgentRegistry.getToolsForLLMBinding();
  console.log(`   - Total tools for LLM binding: ${toolsForBinding.length}`);
  
  if (toolsForBinding.length === 0) {
    console.error(`❌ Test 7 FAILED: No tools available for LLM binding`);
    return;
  }
  
  // Check format of first tool
  const firstTool = toolsForBinding[0];
  const hasCorrectFormat = 
    firstTool.type === 'function' &&
    typeof firstTool.function === 'object' &&
    typeof firstTool.function.name === 'string' &&
    typeof firstTool.function.description === 'string' &&
    typeof firstTool.function.parameters === 'object';
  
  if (!hasCorrectFormat) {
    console.error(`❌ Test 7 FAILED: Tool format incorrect`);
    console.error(`   Got:`, JSON.stringify(firstTool, null, 2));
    return;
  }
  
  console.log(`   - First tool: ${firstTool.function.name}`);
  console.log(`   - Format: { type: 'function', function: { name, description, parameters } }`);
  console.log(`✅ Test 7: getToolsForLLMBinding() returns correct format`);
  
  // Test 8: Check getToolNamesForAgent() works correctly
  console.log(`\n🧪 Test 8: getToolNamesForAgent() validation`);
  
  const routeToolNames = AgentRegistry.getToolNamesForAgent('route_agent');
  const weatherToolNames = AgentRegistry.getToolNamesForAgent('weather_agent');
  const bunkerToolNames = AgentRegistry.getToolNamesForAgent('bunker_agent');
  
  console.log(`   - route_agent tools: ${routeToolNames.join(', ')}`);
  console.log(`   - weather_agent tools: ${weatherToolNames.join(', ')}`);
  console.log(`   - bunker_agent tools: ${bunkerToolNames.join(', ') || '(none - deterministic)'}`);
  
  if (routeToolNames.length !== 2) {
    console.error(`❌ Test 8 FAILED: route_agent should have 2 tool names`);
    return;
  }
  
  if (weatherToolNames.length !== 3) {
    console.error(`❌ Test 8 FAILED: weather_agent should have 3 tool names`);
    return;
  }
  
  if (bunkerToolNames.length !== 0) {
    console.error(`❌ Test 8 FAILED: bunker_agent should have 0 tool names (deterministic)`);
    return;
  }
  
  console.log(`✅ Test 8: getToolNamesForAgent() works correctly`);
  
  // Test 9: Check validateToolForAgent() works correctly
  console.log(`\n🧪 Test 9: validateToolForAgent() validation`);
  
  const validRouteToolCheck = AgentRegistry.validateToolForAgent('calculate_route', 'route_agent');
  const invalidRouteToolCheck = AgentRegistry.validateToolForAgent('find_bunker_ports', 'route_agent');
  const validWeatherToolCheck = AgentRegistry.validateToolForAgent('fetch_marine_weather', 'weather_agent');
  
  console.log(`   - 'calculate_route' valid for route_agent: ${validRouteToolCheck}`);
  console.log(`   - 'find_bunker_ports' valid for route_agent: ${invalidRouteToolCheck}`);
  console.log(`   - 'fetch_marine_weather' valid for weather_agent: ${validWeatherToolCheck}`);
  
  if (!validRouteToolCheck) {
    console.error(`❌ Test 9 FAILED: calculate_route should be valid for route_agent`);
    return;
  }
  
  if (invalidRouteToolCheck) {
    console.error(`❌ Test 9 FAILED: find_bunker_ports should NOT be valid for route_agent`);
    return;
  }
  
  if (!validWeatherToolCheck) {
    console.error(`❌ Test 9 FAILED: fetch_marine_weather should be valid for weather_agent`);
    return;
  }
  
  console.log(`✅ Test 9: validateToolForAgent() works correctly`);
  
  // Test 10: Check tools have schemas
  console.log(`\n🧪 Test 10: Tool schema validation`);
  
  let allToolsHaveSchemas = true;
  for (const agent of allAgents) {
    if (agent.is_deterministic) continue; // Skip deterministic agents
    
    for (const tool of agent.available_tools) {
      if (!tool.schema || typeof tool.schema !== 'object') {
        console.error(`❌ Test 10 FAILED: Tool ${tool.tool_name} missing schema`);
        allToolsHaveSchemas = false;
      }
    }
  }
  
  if (!allToolsHaveSchemas) {
    return;
  }
  
  console.log(`✅ Test 10: All non-deterministic agent tools have schemas`);
  
  // Summary
  console.log('\n✅ [REGISTRY-TEST] All tests passed!');
  console.log(`\n📊 Registry Summary:`);
  console.log(`   - Total agents: ${allAgents.length}`);
  console.log(`   - Deterministic agents: ${allAgents.filter(a => a.is_deterministic).length}`);
  console.log(`   - Total tools (all agents): ${allAgents.reduce((sum, a) => sum + a.available_tools.length, 0)}`);
  console.log(`   - Tools for LLM binding: ${toolsForBinding.length}`);
  console.log(`   - Agents: ${allAgents.map(a => a.agent_name).join(', ')}`);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testRegistry();
}

