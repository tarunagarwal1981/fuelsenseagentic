/**
 * Tool Registry Tests
 * 
 * Comprehensive test suite for the Tool Registry system.
 * Tests all registry methods, validation logic, search functionality,
 * and edge cases including duplicate IDs and circular dependencies.
 */

import ToolRegistry from '@/lib/registry/tool-registry';
import { registerTool, validateToolDefinition, createToolTemplate } from '@/lib/registry/tool-loader';
import type { ToolDefinition, ToolCategory } from '@/lib/types/tool-registry';

/**
 * Create a mock tool definition for testing
 */
function createMockTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  const now = new Date();
  return {
    id: 'test_tool',
    name: 'Test Tool',
    description: 'A test tool for unit testing',
    version: '1.0.0',
    category: 'calculation',
    domain: ['testing'],
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Test input' },
      },
      required: ['input'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'string', description: 'Test output' },
      },
    },
    cost: 'free',
    avgLatencyMs: 100,
    maxLatencyMs: 1000,
    reliability: 1.0,
    dependencies: {
      external: [],
      internal: [],
    },
    agentIds: ['test_agent'],
    requiresAuth: false,
    implementation: async () => ({ result: 'success' }),
    metrics: {
      totalCalls: 0,
      successCalls: 0,
      failureCalls: 0,
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Run all tool registry tests
 */
export function testToolRegistry(): void {
  console.log('\n🧪 [TOOL-REGISTRY-TEST] Starting tool registry validation...\n');
  
  let allPassed = true;
  const registry = ToolRegistry.getInstance();
  
  // Clear registry before tests
  registry.clear();
  
  // Test 1: Register a tool
  console.log('📋 Test 1: Register a tool');
  try {
    const tool = createMockTool({ id: 'test_tool_1' });
    registry.register(tool);
    
    if (!registry.has('test_tool_1')) {
      console.error('❌ Test 1 FAILED: Tool not found after registration');
      allPassed = false;
    } else {
      console.log('✅ Test 1 PASSED: Tool registered successfully');
    }
  } catch (error: any) {
    console.error('❌ Test 1 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 2: Get tool by ID
  console.log('\n📋 Test 2: Get tool by ID');
  try {
    const tool = registry.getById('test_tool_1');
    
    if (!tool || tool.id !== 'test_tool_1') {
      console.error('❌ Test 2 FAILED: Could not retrieve tool by ID');
      allPassed = false;
    } else {
      console.log('✅ Test 2 PASSED: Tool retrieved by ID');
    }
  } catch (error: any) {
    console.error('❌ Test 2 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 3: Get tools by category
  console.log('\n📋 Test 3: Get tools by category');
  try {
    const routingTool = createMockTool({
      id: 'routing_tool',
      category: 'routing',
    });
    const weatherTool = createMockTool({
      id: 'weather_tool',
      category: 'weather',
    });
    
    registry.register(routingTool);
    registry.register(weatherTool);
    
    const routingTools = registry.getByCategory('routing');
    const weatherTools = registry.getByCategory('weather');
    
    if (routingTools.length < 1 || routingTools[0].category !== 'routing') {
      console.error('❌ Test 3 FAILED: Routing tools not found');
      allPassed = false;
    } else if (weatherTools.length < 1 || weatherTools[0].category !== 'weather') {
      console.error('❌ Test 3 FAILED: Weather tools not found');
      allPassed = false;
    } else {
      console.log(`✅ Test 3 PASSED: Found ${routingTools.length} routing tools, ${weatherTools.length} weather tools`);
    }
  } catch (error: any) {
    console.error('❌ Test 3 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 4: Get tools by agent
  console.log('\n📋 Test 4: Get tools by agent');
  try {
    const agentTool1 = createMockTool({
      id: 'agent_tool_1',
      agentIds: ['agent_a'],
    });
    const agentTool2 = createMockTool({
      id: 'agent_tool_2',
      agentIds: ['agent_a', 'agent_b'],
    });
    
    registry.register(agentTool1);
    registry.register(agentTool2);
    
    const agentATools = registry.getByAgent('agent_a');
    const agentBTools = registry.getByAgent('agent_b');
    
    if (agentATools.length < 2) {
      console.error(`❌ Test 4 FAILED: Expected 2 tools for agent_a, found ${agentATools.length}`);
      allPassed = false;
    } else if (agentBTools.length < 1) {
      console.error(`❌ Test 4 FAILED: Expected 1 tool for agent_b, found ${agentBTools.length}`);
      allPassed = false;
    } else {
      console.log(`✅ Test 4 PASSED: Found ${agentATools.length} tools for agent_a, ${agentBTools.length} for agent_b`);
    }
  } catch (error: any) {
    console.error('❌ Test 4 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 5: Search tools
  console.log('\n📋 Test 5: Search tools');
  try {
    const searchTool = createMockTool({
      id: 'search_tool',
      category: 'bunker',
      domain: ['bunker_planning'],
      reliability: 0.95,
      avgLatencyMs: 50,
    });
    
    registry.register(searchTool);
    
    // Search by category
    const categoryResults = registry.search({ category: 'bunker' });
    
    // Search by domain
    const domainResults = registry.search({ domain: 'bunker_planning' });
    
    // Search by reliability
    const reliabilityResults = registry.search({ minReliability: 0.9 });
    
    // Search by latency
    const latencyResults = registry.search({ maxLatencyMs: 100 });
    
    if (categoryResults.length < 1) {
      console.error('❌ Test 5 FAILED: Category search returned no results');
      allPassed = false;
    } else if (domainResults.length < 1) {
      console.error('❌ Test 5 FAILED: Domain search returned no results');
      allPassed = false;
    } else if (reliabilityResults.length < 1) {
      console.error('❌ Test 5 FAILED: Reliability search returned no results');
      allPassed = false;
    } else if (latencyResults.length < 1) {
      console.error('❌ Test 5 FAILED: Latency search returned no results');
      allPassed = false;
    } else {
      console.log('✅ Test 5 PASSED: All search criteria work correctly');
    }
  } catch (error: any) {
    console.error('❌ Test 5 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 6: Duplicate ID rejection
  console.log('\n📋 Test 6: Duplicate ID rejection');
  try {
    const tool1 = createMockTool({ id: 'duplicate_tool' });
    const tool2 = createMockTool({ id: 'duplicate_tool' });
    
    registry.register(tool1);
    
    try {
      registry.register(tool2);
      console.error('❌ Test 6 FAILED: Should have rejected duplicate ID');
      allPassed = false;
    } catch (error: any) {
      if (error.message.includes('already registered')) {
        console.log('✅ Test 6 PASSED: Duplicate ID correctly rejected');
      } else {
        console.error('❌ Test 6 FAILED: Wrong error message:', error.message);
        allPassed = false;
      }
    }
  } catch (error: any) {
    console.error('❌ Test 6 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 7: Circular dependency detection
  console.log('\n📋 Test 7: Circular dependency detection');
  try {
    const toolA = createMockTool({
      id: 'tool_a',
      dependencies: { external: [], internal: ['tool_b'] },
    });
    const toolB = createMockTool({
      id: 'tool_b',
      dependencies: { external: [], internal: ['tool_a'] },
    });
    
    registry.register(toolA);
    
    try {
      registry.register(toolB);
      console.error('❌ Test 7 FAILED: Should have detected circular dependency');
      allPassed = false;
    } catch (error: any) {
      if (error.message.includes('Circular dependency')) {
        console.log('✅ Test 7 PASSED: Circular dependency correctly detected');
      } else {
        console.error('❌ Test 7 FAILED: Wrong error message:', error.message);
        allPassed = false;
      }
    }
    
    // Clean up for next tests
    registry.clear();
  } catch (error: any) {
    console.error('❌ Test 7 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 8: Validation
  console.log('\n📋 Test 8: Tool validation');
  try {
    const invalidTool = createMockTool({
      id: '', // Invalid: empty ID
      name: '', // Invalid: empty name
    });
    
    const validation = registry.validate('nonexistent');
    if (validation.valid) {
      console.error('❌ Test 8 FAILED: Should have failed validation for nonexistent tool');
      allPassed = false;
    } else {
      console.log('✅ Test 8 PASSED: Validation correctly identifies nonexistent tool');
    }
    
    // Test validation of a registered tool
    const validTool = createMockTool({ id: 'valid_tool' });
    registry.register(validTool);
    const validValidation = registry.validate('valid_tool');
    
    if (!validValidation.valid) {
      console.error('❌ Test 8 FAILED: Valid tool should pass validation');
      allPassed = false;
    } else {
      console.log('✅ Test 8 PASSED: Valid tool passes validation');
    }
  } catch (error: any) {
    console.error('❌ Test 8 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 9: Metrics recording
  console.log('\n📋 Test 9: Metrics recording');
  try {
    const metricsTool = createMockTool({ id: 'metrics_tool' });
    registry.register(metricsTool);
    
    registry.recordCall('metrics_tool', true, 150);
    registry.recordCall('metrics_tool', true, 200);
    registry.recordCall('metrics_tool', false, 300);
    
    const tool = registry.getById('metrics_tool');
    if (!tool) {
      console.error('❌ Test 9 FAILED: Tool not found');
      allPassed = false;
    } else if (tool.metrics.totalCalls !== 3) {
      console.error(`❌ Test 9 FAILED: Expected 3 total calls, got ${tool.metrics.totalCalls}`);
      allPassed = false;
    } else if (tool.metrics.successCalls !== 2) {
      console.error(`❌ Test 9 FAILED: Expected 2 success calls, got ${tool.metrics.successCalls}`);
      allPassed = false;
    } else if (tool.metrics.failureCalls !== 1) {
      console.error(`❌ Test 9 FAILED: Expected 1 failure call, got ${tool.metrics.failureCalls}`);
      allPassed = false;
    } else if (!tool.metrics.lastCalledAt) {
      console.error('❌ Test 9 FAILED: lastCalledAt not set');
      allPassed = false;
    } else {
      console.log('✅ Test 9 PASSED: Metrics correctly recorded');
    }
  } catch (error: any) {
    console.error('❌ Test 9 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 10: Sorting by reliability and latency
  console.log('\n📋 Test 10: Sorting by reliability and latency');
  try {
    registry.clear();
    
    const tool1 = createMockTool({
      id: 'tool_low_reliability',
      reliability: 0.5,
      avgLatencyMs: 1000,
    });
    const tool2 = createMockTool({
      id: 'tool_high_reliability',
      reliability: 0.95,
      avgLatencyMs: 100,
    });
    
    registry.register(tool1);
    registry.register(tool2);
    
    const byReliability = registry.getByReliability();
    const byLatency = registry.getByLatency();
    
    if (byReliability[0].reliability < byReliability[1].reliability) {
      console.error('❌ Test 10 FAILED: Tools not sorted by reliability (descending)');
      allPassed = false;
    } else if (byLatency[0].avgLatencyMs > byLatency[1].avgLatencyMs) {
      console.error('❌ Test 10 FAILED: Tools not sorted by latency (ascending)');
      allPassed = false;
    } else {
      console.log('✅ Test 10 PASSED: Tools correctly sorted by reliability and latency');
    }
  } catch (error: any) {
    console.error('❌ Test 10 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 11: Exclude deprecated tools
  console.log('\n📋 Test 11: Exclude deprecated tools');
  try {
    registry.clear();
    
    const activeTool = createMockTool({ id: 'active_tool' });
    const deprecatedTool = createMockTool({
      id: 'deprecated_tool',
      deprecated: true,
    });
    
    registry.register(activeTool);
    registry.register(deprecatedTool);
    
    const allTools = registry.getAll();
    const activeOnly = registry.search({ excludeDeprecated: true });
    
    if (allTools.length !== 2) {
      console.error(`❌ Test 11 FAILED: Expected 2 total tools, got ${allTools.length}`);
      allPassed = false;
    } else if (activeOnly.length !== 1) {
      console.error(`❌ Test 11 FAILED: Expected 1 active tool, got ${activeOnly.length}`);
      allPassed = false;
    } else {
      console.log('✅ Test 11 PASSED: Deprecated tools correctly excluded');
    }
  } catch (error: any) {
    console.error('❌ Test 11 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 12: Clear registry
  console.log('\n📋 Test 12: Clear registry');
  try {
    registry.clear();
    
    if (registry.getCount() !== 0) {
      console.error(`❌ Test 12 FAILED: Expected 0 tools after clear, got ${registry.getCount()}`);
      allPassed = false;
    } else {
      console.log('✅ Test 12 PASSED: Registry cleared successfully');
    }
  } catch (error: any) {
    console.error('❌ Test 12 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 13: Validate tool definition with loader
  console.log('\n📋 Test 13: Validate tool definition with loader');
  try {
    const validTool = createMockTool({ id: 'loader_test_tool' });
    const validation = validateToolDefinition(validTool);
    
    if (!validation.valid) {
      console.error('❌ Test 13 FAILED: Valid tool should pass validation');
      console.error('   Errors:', validation.errors);
      allPassed = false;
    } else {
      console.log('✅ Test 13 PASSED: Tool definition validation works');
    }
    
    // Test invalid tool
    const invalidTool = createMockTool({
      id: '',
      name: '',
      description: '',
    });
    const invalidValidation = validateToolDefinition(invalidTool);
    
    if (invalidValidation.valid) {
      console.error('❌ Test 13 FAILED: Invalid tool should fail validation');
      allPassed = false;
    } else {
      console.log('✅ Test 13 PASSED: Invalid tool correctly rejected');
    }
  } catch (error: any) {
    console.error('❌ Test 13 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 14: Tool template creation
  console.log('\n📋 Test 14: Tool template creation');
  try {
    const template = createToolTemplate(
      'template_tool',
      'Template Tool',
      async () => ({ result: 'test' })
    );
    
    if (!template.id || template.id !== 'template_tool') {
      console.error('❌ Test 14 FAILED: Template ID not set correctly');
      allPassed = false;
    } else if (!template.name || template.name !== 'Template Tool') {
      console.error('❌ Test 14 FAILED: Template name not set correctly');
      allPassed = false;
    } else if (!template.implementation) {
      console.error('❌ Test 14 FAILED: Template implementation not set');
      allPassed = false;
    } else {
      console.log('✅ Test 14 PASSED: Tool template created correctly');
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
  testToolRegistry();
}
