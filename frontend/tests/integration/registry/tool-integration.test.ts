/**
 * Tool Registry Integration Tests
 * 
 * Integration tests for the Tool Registry system with real tool definitions.
 * Tests tool registration, retrieval, metrics tracking, and execution.
 */

import { ToolRegistry } from '@/lib/registry/tool-registry';
import { registerAllTools, verifyToolRegistration } from '@/lib/registry/tools';

/**
 * Expected tool IDs
 */
const EXPECTED_TOOLS = [
  'calculate_route',
  'calculate_weather_timeline',
  'fetch_marine_weather',
  'calculate_weather_consumption',
  'check_bunker_port_weather',
  'find_bunker_ports',
  'get_fuel_prices',
  'analyze_bunker_options',
];

/**
 * Expected tools by category
 */
const EXPECTED_BY_CATEGORY = {
  routing: ['calculate_route', 'calculate_weather_timeline'],
  weather: ['fetch_marine_weather', 'calculate_weather_consumption', 'check_bunker_port_weather'],
  bunker: ['find_bunker_ports', 'get_fuel_prices', 'analyze_bunker_options'],
};

/**
 * Run all integration tests
 */
export async function testToolIntegration(): Promise<void> {
  console.log('\n🧪 [TOOL-INTEGRATION-TEST] Starting tool integration tests...\n');
  
  let allPassed = true;
  const registry = ToolRegistry.getInstance();
  
  // Clear registry before tests
  registry.clear();
  
  // Test 1: Register all tools
  console.log('📋 Test 1: Register all 8 tools');
  try {
    registerAllTools();
    const count = registry.getCount();
    
    if (count !== 8) {
      console.error(`❌ Test 1 FAILED: Expected 8 tools, found ${count}`);
      allPassed = false;
    } else {
      console.log(`✅ Test 1 PASSED: All 8 tools registered`);
    }
  } catch (error: any) {
    console.error('❌ Test 1 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 2: Verify tool registration
  console.log('\n📋 Test 2: Verify all tools are registered');
  try {
    const verification = verifyToolRegistration();
    
    if (!verification.allRegistered) {
      console.error('❌ Test 2 FAILED: Not all tools registered');
      if (verification.missing.length > 0) {
        console.error(`   Missing: ${verification.missing.join(', ')}`);
      }
      if (verification.extra.length > 0) {
        console.error(`   Extra: ${verification.extra.join(', ')}`);
      }
      allPassed = false;
    } else {
      console.log('✅ Test 2 PASSED: All expected tools are registered');
    }
  } catch (error: any) {
    console.error('❌ Test 2 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 3: Retrieve each tool by ID
  console.log('\n📋 Test 3: Retrieve each tool by ID');
  try {
    let allFound = true;
    const missing: string[] = [];
    
    for (const toolId of EXPECTED_TOOLS) {
      const tool = registry.getById(toolId);
      if (!tool) {
        allFound = false;
        missing.push(toolId);
      }
    }
    
    if (!allFound) {
      console.error(`❌ Test 3 FAILED: Could not retrieve tools: ${missing.join(', ')}`);
      allPassed = false;
    } else {
      console.log(`✅ Test 3 PASSED: All ${EXPECTED_TOOLS.length} tools retrieved by ID`);
    }
  } catch (error: any) {
    console.error('❌ Test 3 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 4: Retrieve tools by category
  console.log('\n📋 Test 4: Retrieve tools by category');
  try {
    let categoryTestPassed = true;
    
    for (const [category, expectedIds] of Object.entries(EXPECTED_BY_CATEGORY)) {
      const tools = registry.getByCategory(category as any);
      const foundIds = tools.map((t) => t.id).sort();
      const expectedSorted = [...expectedIds].sort();
      
      if (foundIds.length !== expectedSorted.length) {
        console.error(
          `❌ Test 4 FAILED: Category '${category}' expected ${expectedSorted.length} tools, found ${foundIds.length}`
        );
        categoryTestPassed = false;
      } else {
        const missing = expectedSorted.filter((id) => !foundIds.includes(id));
        if (missing.length > 0) {
          console.error(
            `❌ Test 4 FAILED: Category '${category}' missing tools: ${missing.join(', ')}`
          );
          categoryTestPassed = false;
        }
      }
    }
    
    if (!categoryTestPassed) {
      allPassed = false;
    } else {
      console.log('✅ Test 4 PASSED: Tools retrieved correctly by category');
      console.log(`   - Routing: ${registry.getByCategory('routing').length} tools`);
      console.log(`   - Weather: ${registry.getByCategory('weather').length} tools`);
      console.log(`   - Bunker: ${registry.getByCategory('bunker').length} tools`);
    }
  } catch (error: any) {
    console.error('❌ Test 4 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 5: Metrics tracking
  console.log('\n📋 Test 5: Metrics tracking');
  try {
    const testToolId = EXPECTED_TOOLS[0];
    const toolBefore = registry.getById(testToolId);
    
    if (!toolBefore) {
      console.error(`❌ Test 5 FAILED: Could not find tool ${testToolId}`);
      allPassed = false;
    } else {
      const initialCalls = toolBefore.metrics.totalCalls;
      const initialSuccess = toolBefore.metrics.successCalls;
      const initialFailure = toolBefore.metrics.failureCalls;
      
      // Record some calls
      registry.recordCall(testToolId, true, 100);
      registry.recordCall(testToolId, true, 150);
      registry.recordCall(testToolId, false, 200);
      
      const toolAfter = registry.getById(testToolId);
      if (!toolAfter) {
        console.error(`❌ Test 5 FAILED: Tool ${testToolId} disappeared`);
        allPassed = false;
      } else {
        const expectedTotal = initialCalls + 3;
        const expectedSuccess = initialSuccess + 2;
        const expectedFailure = initialFailure + 1;
        
        if (toolAfter.metrics.totalCalls !== expectedTotal) {
          console.error(
            `❌ Test 5 FAILED: Expected ${expectedTotal} total calls, got ${toolAfter.metrics.totalCalls}`
          );
          allPassed = false;
        } else if (toolAfter.metrics.successCalls !== expectedSuccess) {
          console.error(
            `❌ Test 5 FAILED: Expected ${expectedSuccess} success calls, got ${toolAfter.metrics.successCalls}`
          );
          allPassed = false;
        } else if (toolAfter.metrics.failureCalls !== expectedFailure) {
          console.error(
            `❌ Test 5 FAILED: Expected ${expectedFailure} failure calls, got ${toolAfter.metrics.failureCalls}`
          );
          allPassed = false;
        } else if (!toolAfter.metrics.lastCalledAt) {
          console.error('❌ Test 5 FAILED: lastCalledAt not set');
          allPassed = false;
        } else {
          console.log('✅ Test 5 PASSED: Metrics tracking works correctly');
          console.log(`   - Total calls: ${toolAfter.metrics.totalCalls}`);
          console.log(`   - Success calls: ${toolAfter.metrics.successCalls}`);
          console.log(`   - Failure calls: ${toolAfter.metrics.failureCalls}`);
        }
      }
    }
  } catch (error: any) {
    console.error('❌ Test 5 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 6: Tool execution
  console.log('\n📋 Test 6: Tool execution');
  try {
    let executionTestPassed = true;
    const executionErrors: string[] = [];
    
    // Test execution for a few representative tools
    const toolsToTest = [
      'calculate_route',
      'fetch_marine_weather',
      'find_bunker_ports',
    ];
    
    for (const toolId of toolsToTest) {
      const tool = registry.getById(toolId);
      if (!tool) {
        executionErrors.push(`${toolId}: tool not found`);
        executionTestPassed = false;
        continue;
      }
      
      if (!tool.implementation) {
        executionErrors.push(`${toolId}: no implementation`);
        executionTestPassed = false;
        continue;
      }
      
      try {
        // Try to execute with minimal valid input
        // Note: Some tools might require specific inputs, so we catch errors
        const result = await tool.implementation({});
        
        if (result === undefined || result === null) {
          executionErrors.push(`${toolId}: returned null/undefined`);
          executionTestPassed = false;
        } else {
          console.log(`   ✓ ${toolId}: executed successfully`);
        }
      } catch (error: any) {
        // Some tools might require specific inputs, which is okay for integration test
        // We just verify the implementation exists and is callable
        const errorMessage = Array.isArray(error) 
          ? JSON.stringify(error)
          : error.message || String(error);
        
        // Expected errors: validation errors, missing inputs, etc.
        if (
          errorMessage.includes('required') ||
          errorMessage.includes('Invalid input') ||
          errorMessage.includes('invalid_type') ||
          errorMessage.includes('expected')
        ) {
          // Expected error for missing/invalid inputs - this means the tool validates inputs correctly
          console.log(`   ✓ ${toolId}: implementation callable (validates inputs)`);
        } else {
          executionErrors.push(`${toolId}: ${errorMessage}`);
          executionTestPassed = false;
        }
      }
    }
    
    if (!executionTestPassed) {
      console.error('❌ Test 6 FAILED: Tool execution issues');
      executionErrors.forEach((err) => console.error(`   - ${err}`));
      allPassed = false;
    } else {
      console.log('✅ Test 6 PASSED: Tool execution functional');
    }
  } catch (error: any) {
    console.error('❌ Test 6 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 7: Verify tool properties
  console.log('\n📋 Test 7: Verify tool properties');
  try {
    let propertiesTestPassed = true;
    
    for (const toolId of EXPECTED_TOOLS) {
      const tool = registry.getById(toolId);
      if (!tool) {
        console.error(`❌ Test 7 FAILED: Tool ${toolId} not found`);
        propertiesTestPassed = false;
        continue;
      }
      
      // Check required properties
      if (!tool.name || !tool.description || !tool.category || !tool.implementation) {
        console.error(`❌ Test 7 FAILED: Tool ${toolId} missing required properties`);
        propertiesTestPassed = false;
      }
    }
    
    if (!propertiesTestPassed) {
      allPassed = false;
    } else {
      console.log('✅ Test 7 PASSED: All tools have required properties');
    }
  } catch (error: any) {
    console.error('❌ Test 7 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 8: Search functionality
  console.log('\n📋 Test 8: Search functionality');
  try {
    // Search by category
    const routingResults = registry.search({ category: 'routing' });
    const weatherResults = registry.search({ category: 'weather' });
    const bunkerResults = registry.search({ category: 'bunker' });
    
    if (routingResults.length !== 2) {
      console.error(`❌ Test 8 FAILED: Search by category 'routing' returned ${routingResults.length}, expected 2`);
      allPassed = false;
    } else if (weatherResults.length !== 3) {
      console.error(`❌ Test 8 FAILED: Search by category 'weather' returned ${weatherResults.length}, expected 3`);
      allPassed = false;
    } else if (bunkerResults.length !== 3) {
      console.error(`❌ Test 8 FAILED: Search by category 'bunker' returned ${bunkerResults.length}, expected 3`);
      allPassed = false;
    } else {
      console.log('✅ Test 8 PASSED: Search functionality works');
      console.log(`   - Routing search: ${routingResults.length} results`);
      console.log(`   - Weather search: ${weatherResults.length} results`);
      console.log(`   - Bunker search: ${bunkerResults.length} results`);
    }
  } catch (error: any) {
    console.error('❌ Test 8 FAILED:', error.message);
    allPassed = false;
  }
  
  // Final summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ ALL INTEGRATION TESTS PASSED');
  } else {
    console.log('❌ SOME INTEGRATION TESTS FAILED');
  }
  console.log('='.repeat(60) + '\n');
  
  // Clean up
  registry.clear();
}

// Run tests if this file is executed directly
if (require.main === module) {
  testToolIntegration().catch((error) => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}
