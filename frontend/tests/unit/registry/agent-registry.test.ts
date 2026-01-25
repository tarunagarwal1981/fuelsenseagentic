/**
 * Agent Registry Tests
 * 
 * Comprehensive test suite for the Agent Registry system.
 * Tests all registry methods, validation logic, dependency analysis,
 * and edge cases including circular dependencies and topological sorting.
 */

import { AgentRegistry } from '@/lib/registry/agent-registry';
import { registerAgent, validateAgentDefinition, createAgentTemplate } from '@/lib/registry/agent-loader';
import { buildDependencyGraph, detectCycles, topologicalSort, getParallelGroups } from '@/lib/registry/dependency-analyzer';
import type { AgentDefinition, AgentType } from '@/lib/types/agent-registry';

/**
 * Create a mock agent definition for testing
 */
function createMockAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  const now = new Date();
  return {
    id: 'test_agent',
    name: 'Test Agent',
    description: 'A test agent for unit testing',
    version: '1.0.0',
    type: 'specialist',
    domain: ['testing'],
    capabilities: ['test_capability'],
    intents: ['test_intent'],
    produces: {
      stateFields: ['test_output'],
      messageTypes: ['test_message'],
    },
    consumes: {
      required: ['test_input'],
      optional: [],
    },
    tools: {
      required: [],
      optional: [],
    },
    dependencies: {
      upstream: [],
      downstream: [],
    },
    execution: {
      canRunInParallel: false,
      maxExecutionTimeMs: 30000,
      retryPolicy: {
        maxRetries: 2,
        backoffMs: 1000,
      },
    },
    implementation: 'lib/test/test-agent.ts',
    nodeFunction: async (state: any) => ({ ...state, test_output: 'result' }),
    metrics: {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      avgExecutionTimeMs: 0,
    },
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Run all agent registry tests
 */
export function testAgentRegistry(): void {
  console.log('\n🧪 [AGENT-REGISTRY-TEST] Starting agent registry validation...\n');
  
  let allPassed = true;
  const registry = AgentRegistry.getInstance();
  
  // Clear registry before tests
  registry.clear();
  
  // Test 1: Register an agent
  console.log('📋 Test 1: Register an agent');
  try {
    const agent = createMockAgent({ id: 'test_agent_1' });
    registry.register(agent);
    
    if (!registry.has('test_agent_1')) {
      console.error('❌ Test 1 FAILED: Agent not found after registration');
      allPassed = false;
    } else {
      console.log('✅ Test 1 PASSED: Agent registered successfully');
    }
  } catch (error: any) {
    console.error('❌ Test 1 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 2: Get agent by ID
  console.log('\n📋 Test 2: Get agent by ID');
  try {
    const agent = registry.getById('test_agent_1');
    
    if (!agent || agent.id !== 'test_agent_1') {
      console.error('❌ Test 2 FAILED: Could not retrieve agent by ID');
      allPassed = false;
    } else {
      console.log('✅ Test 2 PASSED: Agent retrieved by ID');
    }
  } catch (error: any) {
    console.error('❌ Test 2 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 3: Get agents by domain
  console.log('\n📋 Test 3: Get agents by domain');
  try {
    const routingAgent = createMockAgent({
      id: 'routing_agent',
      domain: ['routing'],
    });
    const weatherAgent = createMockAgent({
      id: 'weather_agent',
      domain: ['weather'],
    });
    
    registry.register(routingAgent);
    registry.register(weatherAgent);
    
    const routingAgents = registry.getByDomain('routing');
    const weatherAgents = registry.getByDomain('weather');
    
    if (routingAgents.length < 1 || routingAgents[0].domain[0] !== 'routing') {
      console.error('❌ Test 3 FAILED: Routing agents not found');
      allPassed = false;
    } else if (weatherAgents.length < 1 || weatherAgents[0].domain[0] !== 'weather') {
      console.error('❌ Test 3 FAILED: Weather agents not found');
      allPassed = false;
    } else {
      console.log(`✅ Test 3 PASSED: Found ${routingAgents.length} routing agents, ${weatherAgents.length} weather agents`);
    }
  } catch (error: any) {
    console.error('❌ Test 3 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 4: Get agents by capability
  console.log('\n📋 Test 4: Get agents by capability');
  try {
    const capabilityAgent = createMockAgent({
      id: 'capability_agent',
      capabilities: ['optimize_cost'],
    });
    
    registry.register(capabilityAgent);
    
    const costOptimizers = registry.getByCapability('optimize_cost');
    
    if (costOptimizers.length < 1) {
      console.error('❌ Test 4 FAILED: Agents with capability not found');
      allPassed = false;
    } else {
      console.log(`✅ Test 4 PASSED: Found ${costOptimizers.length} agents with capability`);
    }
  } catch (error: any) {
    console.error('❌ Test 4 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 5: Find agents by intent
  console.log('\n📋 Test 5: Find agents by intent');
  try {
    const intentAgent = createMockAgent({
      id: 'intent_agent',
      intents: ['plan_bunker'],
    });
    
    registry.register(intentAgent);
    
    const bunkerPlanners = registry.findByIntent('plan_bunker');
    
    if (bunkerPlanners.length < 1) {
      console.error('❌ Test 5 FAILED: Agents with intent not found');
      allPassed = false;
    } else {
      console.log(`✅ Test 5 PASSED: Found ${bunkerPlanners.length} agents with intent`);
    }
  } catch (error: any) {
    console.error('❌ Test 5 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 6: Search agents
  console.log('\n📋 Test 6: Search agents');
  try {
    const searchAgent = createMockAgent({
      id: 'search_agent',
      domain: ['bunker_planning'],
      type: 'specialist',
      execution: {
        canRunInParallel: true,
        maxExecutionTimeMs: 30000,
        retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      },
      enabled: true,
    });
    
    registry.register(searchAgent);
    
    // Search by domain
    const domainResults = registry.search({ domain: 'bunker_planning' });
    
    // Search by type
    const typeResults = registry.search({ type: 'specialist' });
    
    // Search by parallel capability
    const parallelResults = registry.search({ canRunInParallel: true });
    
    // Search by enabled
    const enabledResults = registry.search({ enabled: true });
    
    if (domainResults.length < 1) {
      console.error('❌ Test 6 FAILED: Domain search returned no results');
      allPassed = false;
    } else if (typeResults.length < 1) {
      console.error('❌ Test 6 FAILED: Type search returned no results');
      allPassed = false;
    } else if (parallelResults.length < 1) {
      console.error('❌ Test 6 FAILED: Parallel search returned no results');
      allPassed = false;
    } else if (enabledResults.length < 1) {
      console.error('❌ Test 6 FAILED: Enabled search returned no results');
      allPassed = false;
    } else {
      console.log('✅ Test 6 PASSED: All search criteria work correctly');
    }
  } catch (error: any) {
    console.error('❌ Test 6 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 7: Duplicate ID rejection
  console.log('\n📋 Test 7: Duplicate ID rejection');
  try {
    const agent1 = createMockAgent({ id: 'duplicate_agent' });
    const agent2 = createMockAgent({ id: 'duplicate_agent' });
    
    registry.register(agent1);
    
    try {
      registry.register(agent2);
      console.error('❌ Test 7 FAILED: Should have rejected duplicate ID');
      allPassed = false;
    } catch (error: any) {
      if (error.message.includes('already registered')) {
        console.log('✅ Test 7 PASSED: Duplicate ID correctly rejected');
      } else {
        console.error('❌ Test 7 FAILED: Wrong error message:', error.message);
        allPassed = false;
      }
    }
  } catch (error: any) {
    console.error('❌ Test 7 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 8: Dependency graph construction
  console.log('\n📋 Test 8: Dependency graph construction');
  try {
    registry.clear();
    
    const agentA = createMockAgent({
      id: 'agent_a',
      dependencies: { upstream: [], downstream: ['agent_b'] },
    });
    const agentB = createMockAgent({
      id: 'agent_b',
      dependencies: { upstream: ['agent_a'], downstream: [] },
    });
    
    registry.register(agentA);
    registry.register(agentB);
    
    const graph = buildDependencyGraph();
    
    if (!graph.nodes.includes('agent_a') || !graph.nodes.includes('agent_b')) {
      console.error('❌ Test 8 FAILED: Graph nodes not correct');
      allPassed = false;
    } else if (graph.edges.length < 1) {
      console.error('❌ Test 8 FAILED: Graph edges not created');
      allPassed = false;
    } else {
      console.log(`✅ Test 8 PASSED: Dependency graph built with ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
    }
  } catch (error: any) {
    console.error('❌ Test 8 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 9: Circular dependency detection
  console.log('\n📋 Test 9: Circular dependency detection');
  try {
    registry.clear();
    
    const agentA = createMockAgent({
      id: 'agent_a',
      dependencies: { upstream: ['agent_b'], downstream: ['agent_b'] },
    });
    const agentB = createMockAgent({
      id: 'agent_b',
      dependencies: { upstream: ['agent_a'], downstream: ['agent_a'] },
    });
    
    registry.register(agentA);
    registry.register(agentB);
    
    const cycles = detectCycles();
    
    if (cycles.length === 0) {
      console.error('❌ Test 9 FAILED: Should have detected circular dependency');
      allPassed = false;
    } else {
      console.log(`✅ Test 9 PASSED: Detected ${cycles.length} cycle(s)`);
    }
  } catch (error: any) {
    console.error('❌ Test 9 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 10: Topological sort
  console.log('\n📋 Test 10: Topological sort');
  try {
    registry.clear();
    
    const agentA = createMockAgent({
      id: 'agent_a',
      dependencies: { upstream: [], downstream: ['agent_b', 'agent_c'] },
    });
    const agentB = createMockAgent({
      id: 'agent_b',
      dependencies: { upstream: ['agent_a'], downstream: [] },
    });
    const agentC = createMockAgent({
      id: 'agent_c',
      dependencies: { upstream: ['agent_a'], downstream: [] },
    });
    
    registry.register(agentA);
    registry.register(agentB);
    registry.register(agentC);
    
    const order = topologicalSort(['agent_a', 'agent_b', 'agent_c']);
    
    if (order[0] !== 'agent_a') {
      console.error('❌ Test 10 FAILED: Topological sort incorrect - agent_a should be first');
      allPassed = false;
    } else if (order.length !== 3) {
      console.error(`❌ Test 10 FAILED: Expected 3 agents in order, got ${order.length}`);
      allPassed = false;
    } else {
      console.log(`✅ Test 10 PASSED: Topological sort: ${order.join(' -> ')}`);
    }
  } catch (error: any) {
    console.error('❌ Test 10 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 11: Parallel groups
  console.log('\n📋 Test 11: Parallel groups');
  try {
    registry.clear();
    
    const agentA = createMockAgent({
      id: 'agent_a',
      execution: {
        canRunInParallel: true,
        maxExecutionTimeMs: 30000,
        retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      },
      dependencies: { upstream: [], downstream: [] },
    });
    const agentB = createMockAgent({
      id: 'agent_b',
      execution: {
        canRunInParallel: true,
        maxExecutionTimeMs: 30000,
        retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      },
      dependencies: { upstream: [], downstream: [] },
    });
    
    registry.register(agentA);
    registry.register(agentB);
    
    const groups = getParallelGroups(['agent_a', 'agent_b']);
    
    if (groups.length < 1 || groups[0].length < 2) {
      console.error('❌ Test 11 FAILED: Parallel groups not detected correctly');
      allPassed = false;
    } else {
      console.log(`✅ Test 11 PASSED: Found ${groups.length} parallel group(s)`);
    }
  } catch (error: any) {
    console.error('❌ Test 11 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 12: Metrics recording
  console.log('\n📋 Test 12: Metrics recording');
  try {
    registry.clear();
    
    const metricsAgent = createMockAgent({ id: 'metrics_agent' });
    registry.register(metricsAgent);
    
    registry.recordExecution('metrics_agent', true, 150);
    registry.recordExecution('metrics_agent', true, 200);
    registry.recordExecution('metrics_agent', false, 300);
    
    const agent = registry.getById('metrics_agent');
    if (!agent) {
      console.error('❌ Test 12 FAILED: Agent not found');
      allPassed = false;
    } else if (agent.metrics.totalExecutions !== 3) {
      console.error(`❌ Test 12 FAILED: Expected 3 total executions, got ${agent.metrics.totalExecutions}`);
      allPassed = false;
    } else if (agent.metrics.successfulExecutions !== 2) {
      console.error(`❌ Test 12 FAILED: Expected 2 successful executions, got ${agent.metrics.successfulExecutions}`);
      allPassed = false;
    } else if (agent.metrics.failedExecutions !== 1) {
      console.error(`❌ Test 12 FAILED: Expected 1 failed execution, got ${agent.metrics.failedExecutions}`);
      allPassed = false;
    } else if (!agent.metrics.lastExecutedAt) {
      console.error('❌ Test 12 FAILED: lastExecutedAt not set');
      allPassed = false;
    } else {
      console.log('✅ Test 12 PASSED: Metrics correctly recorded');
    }
  } catch (error: any) {
    console.error('❌ Test 12 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 13: Validation
  console.log('\n📋 Test 13: Agent validation');
  try {
    const invalidAgent = createMockAgent({
      id: '',
      name: '',
      description: '',
    });
    
    const validation = registry.validate('nonexistent');
    if (validation.valid) {
      console.error('❌ Test 13 FAILED: Should have failed validation for nonexistent agent');
      allPassed = false;
    } else {
      console.log('✅ Test 13 PASSED: Validation correctly identifies nonexistent agent');
    }
    
    // Test validation of a registered agent
    const validAgent = createMockAgent({ id: 'valid_agent' });
    registry.register(validAgent);
    const validValidation = registry.validate('valid_agent');
    
    if (!validValidation.valid) {
      console.error('❌ Test 13 FAILED: Valid agent should pass validation');
      allPassed = false;
    } else {
      console.log('✅ Test 13 PASSED: Valid agent passes validation');
    }
  } catch (error: any) {
    console.error('❌ Test 13 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 14: Agent template creation
  console.log('\n📋 Test 14: Agent template creation');
  try {
    const template = createAgentTemplate(
      'template_agent',
      'Template Agent',
      async (state: any) => ({ ...state, result: 'test' })
    );
    
    if (!template.id || template.id !== 'template_agent') {
      console.error('❌ Test 14 FAILED: Template ID not set correctly');
      allPassed = false;
    } else if (!template.name || template.name !== 'Template Agent') {
      console.error('❌ Test 14 FAILED: Template name not set correctly');
      allPassed = false;
    } else if (!template.nodeFunction) {
      console.error('❌ Test 14 FAILED: Template nodeFunction not set');
      allPassed = false;
    } else {
      console.log('✅ Test 14 PASSED: Agent template created correctly');
    }
  } catch (error: any) {
    console.error('❌ Test 14 FAILED:', error.message);
    allPassed = false;
  }
  
  // Final summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ ALL TESTS PASSED');
  } else {
    console.log('❌ SOME TESTS FAILED');
  }
  console.log('='.repeat(60) + '\n');
  
  // Clean up
  registry.clear();
}

// Run tests if this file is executed directly
if (require.main === module) {
  testAgentRegistry();
}
