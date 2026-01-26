/**
 * Agent-Tool Connection Verification
 * 
 * Verifies all agents reference refactored tools correctly.
 * Checks tool names, schemas, and execution functions.
 */

import 'dotenv/config';
import { registerAllTools } from '@/lib/registry/tools';
import { registerAllAgents } from '@/lib/registry/agents';
import { ToolRegistry } from '@/lib/registry/tool-registry';
import { AgentRegistry } from '@/lib/registry/agent-registry';

// Expected tool-to-agent mappings
const EXPECTED_TOOL_AGENT_MAPPINGS: Record<string, string[]> = {
  calculate_route: ['route_agent'],
  calculate_weather_timeline: ['route_agent'],
  fetch_marine_weather: ['weather_agent'],
  calculate_weather_consumption: ['weather_agent'],
  check_bunker_port_weather: ['weather_agent', 'bunker_agent'],
  find_bunker_ports: ['bunker_agent'],
  get_fuel_prices: ['bunker_agent'],
  analyze_bunker_options: ['bunker_agent'],
};

interface VerificationResult {
  toolId: string;
  registered: boolean;
  agentReferences: string[];
  expectedAgents: string[];
  matches: boolean;
  schemaValid: boolean;
  implementationExists: boolean;
}

const results: VerificationResult[] = [];

function verifyToolAgentConnections(): void {
  console.log('\n🔍 [VERIFICATION] Verifying agent-tool connections...\n');

  // Initialize registries
  registerAllTools();
  registerAllAgents();

  const toolRegistry = ToolRegistry.getInstance();
  const agentRegistry = AgentRegistry.getInstance();

  // Check each expected tool
  for (const [toolId, expectedAgents] of Object.entries(EXPECTED_TOOL_AGENT_MAPPINGS)) {
    const tool = toolRegistry.getById(toolId);
    const registered = tool !== undefined;

    // Find which agents reference this tool
    const agentReferences: string[] = [];
    for (const agent of agentRegistry.getAll()) {
      const requiredTools = agent.tools.required || [];
      const optionalTools = agent.tools.optional || [];
      
      if (requiredTools.includes(toolId) || optionalTools.includes(toolId)) {
        agentReferences.push(agent.id);
      }
    }

    // Check if schemas match
    const schemaValid = tool ? tool.inputSchema !== undefined : false;

    // Check if implementation exists
    const implementationExists = tool ? typeof tool.implementation === 'function' : false;

    // Verify agent references match expected
    const matches = 
      expectedAgents.every(agentId => agentReferences.includes(agentId)) &&
      agentReferences.every(agentId => expectedAgents.includes(agentId));

    results.push({
      toolId,
      registered,
      agentReferences,
      expectedAgents,
      matches,
      schemaValid,
      implementationExists,
    });
  }

  // Print results
  console.log('='.repeat(80));
  console.log('📊 VERIFICATION RESULTS');
  console.log('='.repeat(80));

  let allPassed = true;

  for (const result of results) {
    const status = result.registered && result.matches && result.schemaValid && result.implementationExists;
    const icon = status ? '✅' : '❌';
    
    console.log(`\n${icon} ${result.toolId}`);
    console.log(`   Registered: ${result.registered ? '✅' : '❌'}`);
    console.log(`   Schema Valid: ${result.schemaValid ? '✅' : '❌'}`);
    console.log(`   Implementation Exists: ${result.implementationExists ? '✅' : '❌'}`);
    console.log(`   Expected Agents: ${result.expectedAgents.join(', ')}`);
    console.log(`   Referenced By: ${result.agentReferences.length > 0 ? result.agentReferences.join(', ') : 'NONE'}`);
    
    if (!result.matches) {
      console.log(`   ⚠️  MISMATCH: Expected ${result.expectedAgents.join(', ')}, found ${result.agentReferences.join(', ') || 'NONE'}`);
      allPassed = false;
    }

    if (!status) {
      allPassed = false;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`\n${allPassed ? '✅' : '❌'} Overall Status: ${allPassed ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`);
  console.log('='.repeat(80));

  // Check for deprecated tool references
  console.log('\n🔍 Checking for deprecated tool references...');
  const deprecatedTools = ['get-fuel-prices', 'check-bunker-port-weather', 'fetch-marine-weather'];
  let deprecatedFound = false;

  for (const agent of agentRegistry.getAll()) {
    const allTools = [
      ...(agent.tools.required || []),
      ...(agent.tools.optional || []),
    ];

    for (const toolId of allTools) {
      if (deprecatedTools.includes(toolId)) {
        console.log(`   ⚠️  Agent ${agent.id} references deprecated tool: ${toolId}`);
        deprecatedFound = true;
      }
    }
  }

  if (!deprecatedFound) {
    console.log('   ✅ No deprecated tool references found');
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📋 SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Tools Checked: ${results.length}`);
  console.log(`Registered: ${results.filter(r => r.registered).length}`);
  console.log(`Valid Schemas: ${results.filter(r => r.schemaValid).length}`);
  console.log(`Valid Implementations: ${results.filter(r => r.implementationExists).length}`);
  console.log(`Correct Agent References: ${results.filter(r => r.matches).length}`);
  console.log('='.repeat(80));

  if (!allPassed) {
    process.exit(1);
  }
}

// Run verification
if (require.main === module) {
  verifyToolAgentConnections();
}

export { verifyToolAgentConnections };
