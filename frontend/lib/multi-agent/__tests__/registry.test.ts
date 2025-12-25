/**
 * Registry Tests
 * 
 * Validates that agent registry is properly populated and functional.
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
  
  // Test 1: Check that 3 agents are registered
  const allAgents = AgentRegistry.getAllAgents();
  console.log(`✅ Test 1: Found ${allAgents.length} registered agents`);
  
  if (allAgents.length !== 3) {
    console.error(`❌ Test 1 FAILED: Expected 3 agents, found ${allAgents.length}`);
    return;
  }
  
  // Test 2: Check each agent has correct number of tools
  const routeAgent = AgentRegistry.getAgent('route_agent');
  const weatherAgent = AgentRegistry.getAgent('weather_agent');
  const bunkerAgent = AgentRegistry.getAgent('bunker_agent');
  
  console.log(`✅ Test 2: Agent retrieval works`);
  console.log(`   - route_agent: ${routeAgent?.available_tools.length || 0} tools`);
  console.log(`   - weather_agent: ${weatherAgent?.available_tools.length || 0} tools`);
  console.log(`   - bunker_agent: ${bunkerAgent?.available_tools.length || 0} tools`);
  
  if (!routeAgent || routeAgent.available_tools.length !== 2) {
    console.error(`❌ Test 2 FAILED: route_agent should have 2 tools, found ${routeAgent?.available_tools.length || 0}`);
    return;
  }
  
  if (!weatherAgent || weatherAgent.available_tools.length !== 3) {
    console.error(`❌ Test 2 FAILED: weather_agent should have 3 tools, found ${weatherAgent?.available_tools.length || 0}`);
    return;
  }
  
  if (!bunkerAgent || bunkerAgent.available_tools.length !== 3) {
    console.error(`❌ Test 2 FAILED: bunker_agent should have 3 tools, found ${bunkerAgent?.available_tools.length || 0}`);
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
    
    if (parsed.total_agents !== 3 || parsed.agents?.length !== 3) {
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
  
  // Summary
  console.log('\n✅ [REGISTRY-TEST] All tests passed!');
  console.log(`\n📊 Registry Summary:`);
  console.log(`   - Total agents: ${allAgents.length}`);
  console.log(`   - Total tools: ${allAgents.reduce((sum, a) => sum + a.available_tools.length, 0)}`);
  console.log(`   - Agents: ${allAgents.map(a => a.agent_name).join(', ')}`);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testRegistry();
}

