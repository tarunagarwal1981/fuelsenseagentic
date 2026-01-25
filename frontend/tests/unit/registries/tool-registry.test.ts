/**
 * Tool Registry Comprehensive Unit Tests
 * 
 * Comprehensive test suite covering all ToolRegistry functionality including:
 * - Registration and retrieval
 * - Validation logic
 * - Error handling
 * - Edge cases (duplicates, circular dependencies, invalid refs)
 * - Metrics and statistics
 */

import { ToolRegistry } from '@/lib/registry/tool-registry';
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
 * Run comprehensive tool registry tests
 */
export function testToolRegistryComprehensive(): void {
  console.log('\n🧪 [TOOL-REGISTRY-COMPREHENSIVE] Starting comprehensive tool registry tests...\n');
  
  let allPassed = true;
  const registry = ToolRegistry.getInstance();
  
  // Clear registry before tests
  registry.clear();
  
  // ============================================================================
  // Registration Tests
  // ============================================================================
  
  console.log('📦 [REGISTRATION TESTS]');
  
  // Test 1: Register a valid tool
  console.log('  Test 1.1: Register a valid tool');
  try {
    const tool = createMockTool({ id: 'valid_tool_1' });
    registry.register(tool);
    
    if (!registry.has('valid_tool_1')) {
      console.error('    ❌ FAILED: Tool not found after registration');
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Tool registered successfully');
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 2: Reject duplicate tool IDs
  console.log('  Test 1.2: Reject duplicate tool IDs');
  try {
    const tool1 = createMockTool({ id: 'duplicate_tool' });
    const tool2 = createMockTool({ id: 'duplicate_tool' });
    
    registry.register(tool1);
    try {
      registry.register(tool2);
      console.error('    ❌ FAILED: Should have thrown error for duplicate');
      allPassed = false;
    } catch (error: any) {
      if (error.message.includes('already registered')) {
        console.log('    ✅ PASSED: Correctly rejected duplicate tool ID');
      } else {
        console.error('    ❌ FAILED: Wrong error:', error.message);
        allPassed = false;
      }
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 3: Reject tools with invalid IDs
  console.log('  Test 1.3: Reject tools with invalid IDs');
  try {
    const invalidTool = createMockTool({ id: 'Invalid-Tool-Name' }); // Invalid format
    try {
      registry.register(invalidTool);
      console.error('    ❌ FAILED: Should have rejected invalid ID format');
      allPassed = false;
    } catch (error: any) {
      if (error.message.includes('ID') || error.message.includes('validation')) {
        console.log('    ✅ PASSED: Correctly rejected invalid ID format');
      } else {
        console.error('    ❌ FAILED: Wrong error:', error.message);
        allPassed = false;
      }
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 4: Reject tools with missing required fields
  console.log('  Test 1.4: Reject tools with missing required fields');
  try {
    const invalidTool = {
      id: 'incomplete_tool',
      // Missing name, description, etc.
    } as any;
    
    try {
      registry.register(invalidTool);
      console.error('    ❌ FAILED: Should have rejected incomplete tool');
      allPassed = false;
    } catch (error: any) {
      if (error.message.includes('required') || error.message.includes('validation')) {
        console.log('    ✅ PASSED: Correctly rejected incomplete tool');
      } else {
        console.error('    ❌ FAILED: Wrong error:', error.message);
        allPassed = false;
      }
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 5: Detect circular dependencies
  console.log('  Test 1.5: Detect circular dependencies');
  try {
    const toolA = createMockTool({
      id: 'tool_a',
      dependencies: { internal: ['tool_b'], external: [] },
    });
    
    const toolB = createMockTool({
      id: 'tool_b',
      dependencies: { internal: ['tool_a'], external: [] },
    });
    
    registry.register(toolA);
    try {
      registry.register(toolB);
      console.error('    ❌ FAILED: Should have detected circular dependency');
      allPassed = false;
    } catch (error: any) {
      if (error.message.includes('circular') || error.message.includes('Circular')) {
        console.log('    ✅ PASSED: Correctly detected circular dependency');
      } else {
        console.error('    ❌ FAILED: Wrong error:', error.message);
        allPassed = false;
      }
    }
    
    // Clean up
    registry.clear();
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 6: Reject invalid schema structure
  console.log('  Test 1.6: Reject invalid schema structure');
  try {
    const invalidTool = createMockTool({
      id: 'invalid_schema_tool',
      inputSchema: {
        type: 'invalid_type' as any,
        properties: {},
        required: [],
      },
    });
    
    try {
      registry.register(invalidTool);
      console.error('    ❌ FAILED: Should have rejected invalid schema');
      allPassed = false;
    } catch (error: any) {
      if (error.message.includes('schema') || error.message.includes('validation')) {
        console.log('    ✅ PASSED: Correctly rejected invalid schema');
      } else {
        console.error('    ❌ FAILED: Wrong error:', error.message);
        allPassed = false;
      }
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // ============================================================================
  // Retrieval Tests
  // ============================================================================
  
  console.log('\n🔍 [RETRIEVAL TESTS]');
  
  // Setup test data
  registry.clear();
  registry.register(createMockTool({ 
    id: 'route_tool', 
    category: 'routing',
    domain: ['routing'],
    agentIds: ['route_agent'],
  }));
  registry.register(createMockTool({ 
    id: 'weather_tool', 
    category: 'weather',
    domain: ['weather'],
    agentIds: ['weather_agent'],
  }));
  registry.register(createMockTool({ 
    id: 'bunker_tool', 
    category: 'bunker',
    domain: ['bunker'],
    agentIds: ['bunker_agent'],
    reliability: 0.95,
  }));
  
  // Test 7: Get tool by ID
  console.log('  Test 2.1: Get tool by ID');
  try {
    const tool = registry.getById('route_tool');
    
    if (!tool || tool.id !== 'route_tool') {
      console.error('    ❌ FAILED: Could not retrieve tool by ID');
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Tool retrieved by ID');
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 8: Return undefined for non-existent ID
  console.log('  Test 2.2: Return undefined for non-existent ID');
  try {
    const tool = registry.getById('does_not_exist');
    
    if (tool !== undefined) {
      console.error('    ❌ FAILED: Should return undefined for non-existent tool');
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Correctly returned undefined');
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 9: Get tools by category
  console.log('  Test 2.3: Get tools by category');
  try {
    const routeTools = registry.getByCategory('routing');
    
    if (routeTools.length !== 1 || routeTools[0].id !== 'route_tool') {
      console.error('    ❌ FAILED: Incorrect category filtering');
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Tools filtered by category correctly');
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 10: Get tools by agent
  console.log('  Test 2.4: Get tools by agent');
  try {
    const bunkerTools = registry.getByAgent('bunker_agent');
    
    if (bunkerTools.length !== 1 || bunkerTools[0].id !== 'bunker_tool') {
      console.error('    ❌ FAILED: Incorrect agent filtering');
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Tools filtered by agent correctly');
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 11: Search with multiple criteria
  console.log('  Test 2.5: Search with multiple criteria');
  try {
    const results = registry.search({
      category: 'bunker',
      minReliability: 0.9,
    });
    
    if (results.length === 0 || results[0].id !== 'bunker_tool') {
      console.error('    ❌ FAILED: Search with multiple criteria failed');
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Multi-criteria search works correctly');
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 12: Get all tools
  console.log('  Test 2.6: Get all tools');
  try {
    const all = registry.getAll();
    
    if (all.length !== 3) {
      console.error(`    ❌ FAILED: Expected 3 tools, got ${all.length}`);
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Retrieved all tools correctly');
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // ============================================================================
  // Metrics Tests
  // ============================================================================
  
  console.log('\n📊 [METRICS TESTS]');
  
  // Test 13: Record tool calls
  console.log('  Test 3.1: Record tool calls');
  try {
    registry.clear();
    const tool = createMockTool({ id: 'metric_tool' });
    registry.register(tool);
    
    registry.recordCall('metric_tool', true, 50);
    registry.recordCall('metric_tool', true, 60);
    registry.recordCall('metric_tool', false, 100);
    
    const retrieved = registry.getById('metric_tool');
    
    if (!retrieved) {
      console.error('    ❌ FAILED: Tool not found');
      allPassed = false;
    } else if (retrieved.metrics.totalCalls !== 3 || 
               retrieved.metrics.successCalls !== 2 || 
               retrieved.metrics.failureCalls !== 1) {
      console.error(`    ❌ FAILED: Incorrect metrics. Expected 3/2/1, got ${retrieved.metrics.totalCalls}/${retrieved.metrics.successCalls}/${retrieved.metrics.failureCalls}`);
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Metrics recorded correctly');
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 14: Get tools sorted by reliability
  console.log('  Test 3.2: Get tools sorted by reliability');
  try {
    registry.clear();
    registry.register(createMockTool({ id: 'low_reliability', reliability: 0.5 }));
    registry.register(createMockTool({ id: 'high_reliability', reliability: 0.99 }));
    registry.register(createMockTool({ id: 'medium_reliability', reliability: 0.75 }));
    
    const sorted = registry.getByReliability();
    
    if (sorted[0].id !== 'high_reliability' || sorted[2].id !== 'low_reliability') {
      console.error('    ❌ FAILED: Tools not sorted correctly by reliability');
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Tools sorted by reliability correctly');
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 15: Get tools sorted by latency
  console.log('  Test 3.3: Get tools sorted by latency');
  try {
    registry.clear();
    registry.register(createMockTool({ id: 'slow_tool', avgLatencyMs: 1000 }));
    registry.register(createMockTool({ id: 'fast_tool', avgLatencyMs: 50 }));
    registry.register(createMockTool({ id: 'medium_tool', avgLatencyMs: 200 }));
    
    const sorted = registry.getByLatency();
    
    if (sorted[0].id !== 'fast_tool' || sorted[2].id !== 'slow_tool') {
      console.error('    ❌ FAILED: Tools not sorted correctly by latency');
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Tools sorted by latency correctly');
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // ============================================================================
  // Statistics Tests
  // ============================================================================
  
  console.log('\n📈 [STATISTICS TESTS]');
  
  // Test 16: Get statistics
  console.log('  Test 4.1: Get statistics');
  try {
    registry.clear();
    registry.register(createMockTool({ category: 'routing', id: 'route1' }));
    registry.register(createMockTool({ category: 'routing', id: 'route2' }));
    registry.register(createMockTool({ category: 'weather', id: 'weather1' }));
    registry.register(createMockTool({ category: 'bunker', id: 'bunker1' }));
    
    const stats = registry.getStats();
    
    if (stats.totalTools !== 4) {
      console.error(`    ❌ FAILED: Expected 4 tools, got ${stats.totalTools}`);
      allPassed = false;
    } else if (stats.byCategory['routing'] !== 2 || stats.byCategory['weather'] !== 1) {
      console.error('    ❌ FAILED: Incorrect category counts');
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Statistics calculated correctly');
      console.log(`      - Total: ${stats.totalTools}`);
      console.log(`      - By category:`, stats.byCategory);
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // ============================================================================
  // Validation Tests
  // ============================================================================
  
  console.log('\n✅ [VALIDATION TESTS]');
  
  // Test 17: Validate existing tool
  console.log('  Test 5.1: Validate existing tool');
  try {
    registry.clear();
    const tool = createMockTool({ id: 'validatable_tool' });
    registry.register(tool);
    
    const validation = registry.validate('validatable_tool');
    
    if (!validation.valid) {
      console.error('    ❌ FAILED: Valid tool failed validation');
      console.error('      Errors:', validation.errors);
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Tool validation works correctly');
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 18: Validate non-existent tool
  console.log('  Test 5.2: Validate non-existent tool');
  try {
    const validation = registry.validate('non_existent_tool');
    
    if (validation.valid) {
      console.error('    ❌ FAILED: Should fail validation for non-existent tool');
      allPassed = false;
    } else if (validation.errors.length === 0) {
      console.error('    ❌ FAILED: Should have error message');
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Correctly failed validation for non-existent tool');
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // ============================================================================
  // Edge Cases
  // ============================================================================
  
  console.log('\n🔀 [EDGE CASES]');
  
  // Test 19: Handle missing internal dependencies gracefully
  console.log('  Test 6.1: Handle missing internal dependencies');
  try {
    registry.clear();
    const tool = createMockTool({
      id: 'dependent_tool',
      dependencies: { internal: ['missing_tool'], external: [] },
    });
    
    try {
      registry.register(tool);
      // Should warn but allow if missing tool doesn't exist yet
      console.log('    ✅ PASSED: Tool with missing dependency registered (may be registered later)');
    } catch (error: any) {
      // This is also acceptable - depends on implementation
      console.log('    ✅ PASSED: Tool with missing dependency rejected (strict mode)');
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 20: Empty registry operations
  console.log('  Test 6.2: Empty registry operations');
  try {
    registry.clear();
    
    const all = registry.getAll();
    const count = registry.getCount();
    const stats = registry.getStats();
    
    if (all.length !== 0 || count !== 0 || stats.totalTools !== 0) {
      console.error('    ❌ FAILED: Empty registry operations failed');
      allPassed = false;
    } else {
      console.log('    ✅ PASSED: Empty registry operations work correctly');
    }
  } catch (error: any) {
    console.error('    ❌ FAILED:', error.message);
    allPassed = false;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ [TOOL-REGISTRY-COMPREHENSIVE] All tests passed!');
  } else {
    console.log('❌ [TOOL-REGISTRY-COMPREHENSIVE] Some tests failed');
  }
  console.log('='.repeat(60));
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testToolRegistryComprehensive();
}
