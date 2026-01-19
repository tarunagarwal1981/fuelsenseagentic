/**
 * Planning Tests
 * 
 * Validates execution plan generation from supervisor planner.
 */

// Load environment variables FIRST before any other imports
import './setup-env';

import { generateExecutionPlan } from '../supervisor-planner';
import { AgentRegistry } from '../registry';
import type { MultiAgentState } from '../state';
// Import agent-nodes to trigger registrations
import '../agent-nodes';

/**
 * Test execution plan generation
 */
export async function testPlanning(): Promise<void> {
  console.log('\n🧪 [PLANNING-TEST] Starting planning validation...\n');
  
  // Check if API keys are available
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    console.log('⚠️ [PLANNING-TEST] Skipping - API keys not available');
    console.log('   Set ANTHROPIC_API_KEY or OPENAI_API_KEY to run planning tests');
    console.log('✅ [PLANNING-TEST] Test skipped (requires API keys)');
    return;
  }
  
  // Get registered agents
  const availableAgents = AgentRegistry.getAllAgents();
  console.log(`✅ Loaded ${availableAgents.length} agents from registry`);
  
  // Create test state
  const testState: Partial<MultiAgentState> = {
    messages: [],
    route_data: null,
    vessel_timeline: null,
    weather_forecast: null,
    weather_consumption: null,
    port_weather_status: null,
    bunker_ports: null,
    port_prices: null,
    bunker_analysis: null,
        multi_bunker_plan: null,
    agent_errors: {},
    agent_status: {},
  };
  
  // Test query
  const testQuery = 'Calculate route from Singapore to Rotterdam with bunker planning';
  console.log(`📝 Test query: "${testQuery}"`);
  
  try {
    // Generate execution plan
    console.log('\n🔄 Generating execution plan...');
    const plan = await generateExecutionPlan(
      testQuery,
      testState as MultiAgentState,
      availableAgents
    );
    
    // Test 1: Plan generated successfully
    console.log(`✅ Test 1: Plan generated successfully`);
    console.log(`   - Execution order: ${plan.execution_order.join(' → ')}`);
    console.log(`   - Reasoning: ${plan.reasoning.substring(0, 100)}...`);
    console.log(`   - Estimated time: ${plan.estimated_total_time}s`);
    
    // Test 2: route_agent is first in execution_order
    if (plan.execution_order[0] !== 'route_agent') {
      console.error(`❌ Test 2 FAILED: Expected route_agent first, got ${plan.execution_order[0]}`);
      return;
    }
    console.log(`✅ Test 2: route_agent is first in execution_order`);
    
    // Test 3: Tools assigned correctly
    console.log(`✅ Test 3: Tool assignments validation`);
    for (const agentName of plan.execution_order) {
      const tools = plan.agent_tool_assignments[agentName] || [];
      console.log(`   - ${agentName}: ${tools.length} tools (${tools.join(', ')})`);
      
      if (tools.length === 0) {
        console.warn(`⚠️ Warning: ${agentName} has no tools assigned`);
      }
    }
    
    // Test 4: route_agent has calculate_route in required_tools
    const routeTools = plan.agent_tool_assignments['route_agent'] || [];
    if (!routeTools.includes('calculate_route')) {
      console.error(`❌ Test 4 FAILED: route_agent missing calculate_route tool`);
      return;
    }
    console.log(`✅ Test 4: route_agent has calculate_route tool`);
    
    // Test 5: No circular dependencies (agents appear only once)
    const uniqueAgents = new Set(plan.execution_order);
    if (uniqueAgents.size !== plan.execution_order.length) {
      console.error(`❌ Test 5 FAILED: Circular dependency detected - agents appear multiple times`);
      return;
    }
    console.log(`✅ Test 5: No circular dependencies`);
    
    // Test 6: All assigned tools exist in agent's available tools
    console.log(`✅ Test 6: Tool validation`);
    let allToolsValid = true;
    for (const [agentName, toolNames] of Object.entries(plan.agent_tool_assignments)) {
      const agent = AgentRegistry.getAgent(agentName);
      if (!agent) {
        console.error(`❌ Test 6 FAILED: Agent ${agentName} not found in registry`);
        allToolsValid = false;
        continue;
      }
      
      // Deterministic agents should have empty tool arrays
      if (AgentRegistry.isDeterministicAgent(agentName)) {
        if (toolNames.length !== 0) {
          console.error(`❌ Test 6 FAILED: Deterministic agent ${agentName} should have 0 tools, got ${toolNames.length}`);
          allToolsValid = false;
        }
        continue;
      }
      
      const availableToolNames = agent.available_tools.map(t => t.tool_name);
      for (const toolName of toolNames) {
        if (!availableToolNames.includes(toolName)) {
          console.error(`❌ Test 6 FAILED: Tool ${toolName} not available for agent ${agentName}`);
          allToolsValid = false;
        }
      }
    }
    
    if (!allToolsValid) {
      return;
    }
    console.log(`✅ Test 6: All assigned tools are valid`);
    
    // Test 7: Deterministic agents have no tool assignments
    console.log(`✅ Test 7: Deterministic agent validation`);
    const deterministicAgents = plan.execution_order.filter(
      agentName => AgentRegistry.isDeterministicAgent(agentName)
    );
    
    for (const agentName of deterministicAgents) {
      const tools = plan.agent_tool_assignments[agentName] || [];
      if (tools.length > 0) {
        console.error(`❌ Test 7 FAILED: Deterministic agent ${agentName} should have 0 tools after validation`);
        return;
      }
      console.log(`   - ${agentName}: 0 tools (deterministic - correct)`);
    }
    console.log(`✅ Test 7: Deterministic agents have no tool assignments`);
    
    // Summary
    console.log('\n✅ [PLANNING-TEST] All tests passed!');
    console.log(`\n📊 Plan Summary:`);
    console.log(`   - Agents in plan: ${plan.execution_order.length}`);
    console.log(`   - Deterministic agents: ${deterministicAgents.length}`);
    console.log(`   - Total tools assigned: ${Object.values(plan.agent_tool_assignments)
      .reduce((sum, tools) => sum + tools.length, 0)}`);
    console.log(`   - Execution order: ${plan.execution_order.join(' → ')}`);
    
  } catch (error) {
    console.error('❌ [PLANNING-TEST] Plan generation failed:', error);
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testPlanning().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

