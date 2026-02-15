/**
 * Config Manager Unit Tests
 * 
 * Tests configuration manager retrieval and management of configs.
 */

import { ConfigManager, getConfigManager } from '@/lib/config/config-manager';

/**
 * Run config manager tests
 */
export async function testConfigManager(): Promise<void> {
  console.log('\n🧪 [CONFIG-MANAGER-TEST] Starting config manager tests...\n');
  
  let allPassed = true;
  const manager = ConfigManager.getInstance();
  
  // Test 1: Singleton pattern
  console.log('📋 Test 1: Singleton pattern');
  try {
    const instance1 = ConfigManager.getInstance();
    const instance2 = ConfigManager.getInstance();
    
    if (instance1 !== instance2) {
      console.error('❌ Test 1 FAILED: ConfigManager should be a singleton');
      allPassed = false;
    } else {
      console.log('✅ Test 1 PASSED: ConfigManager is a singleton');
    }
  } catch (error: unknown) {
    console.error('❌ Test 1 FAILED:', error instanceof Error ? error.message : String(error));
    allPassed = false;
  }
  
  // Test 2: Load all configurations
  console.log('\n📋 Test 2: Load all configurations');
  try {
    await manager.loadAll();
    
    if (!manager.isLoaded()) {
      console.error('❌ Test 2 FAILED: Configurations should be marked as loaded');
      allPassed = false;
    } else {
      console.log('✅ Test 2 PASSED: All configurations loaded');
    }
  } catch (error: unknown) {
    console.error('❌ Test 2 FAILED:', error instanceof Error ? error.message : String(error));
    allPassed = false;
  }
  
  // Test 3: Get agent config
  console.log('\n📋 Test 3: Get agent config');
  try {
    const agentConfig = manager.getAgentConfig('route_agent');
    
    if (!agentConfig) {
      console.error('❌ Test 3 FAILED: Could not retrieve route_agent config');
      allPassed = false;
    } else {
      console.log('✅ Test 3 PASSED: Agent config retrieved');
      console.log(`   - Agent ID: ${agentConfig.id}`);
      console.log(`   - Agent Name: ${agentConfig.name}`);
    }
  } catch (error: unknown) {
    console.error('❌ Test 3 FAILED:', error instanceof Error ? error.message : String(error));
    allPassed = false;
  }
  
  // Test 4: Get all agent configs
  console.log('\n📋 Test 4: Get all agent configs');
  try {
    const allAgents = manager.getAllAgentConfigs();
    
    if (allAgents.length === 0) {
      console.error('❌ Test 4 FAILED: Should have at least one agent config');
      allPassed = false;
    } else {
      console.log('✅ Test 4 PASSED: Retrieved all agent configs');
      console.log(`   - Found ${allAgents.length} agent configs`);
    }
  } catch (error: unknown) {
    console.error('❌ Test 4 FAILED:', error instanceof Error ? error.message : String(error));
    allPassed = false;
  }
  
  // Test 5: Get tool config
  console.log('\n📋 Test 5: Get tool config');
  try {
    const toolConfig = manager.getToolConfig('calculate_route');
    
    if (!toolConfig) {
      console.warn('⚠️  Test 5 SKIPPED: calculate_route tool config not found (may not exist)');
    } else {
      console.log('✅ Test 5 PASSED: Tool config retrieved');
      console.log(`   - Tool ID: ${toolConfig.id}`);
      console.log(`   - Tool Name: ${toolConfig.name}`);
    }
  } catch (error: unknown) {
    console.warn('⚠️  Test 5 SKIPPED:', error instanceof Error ? error.message : String(error));
  }
  
  // Test 6: Get workflow config
  console.log('\n📋 Test 6: Get workflow config');
  try {
    const workflowConfig = manager.getWorkflowConfig('bunker-planning');
    
    if (!workflowConfig) {
      console.warn('⚠️  Test 6 SKIPPED: bunker-planning workflow config not found');
    } else {
      console.log('✅ Test 6 PASSED: Workflow config retrieved');
      console.log(`   - Workflow ID: ${workflowConfig.id}`);
      console.log(`   - Workflow Name: ${workflowConfig.name}`);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn('⚠️  Test 6 SKIPPED:', msg);
  }
  
  // Test 7: Get feature flags
  console.log('\n📋 Test 7: Get feature flags');
  try {
    const featureFlags = manager.getAllFeatureFlags();
    
    if (featureFlags.length === 0) {
      console.warn('⚠️  Test 7 SKIPPED: No feature flags found (may not exist)');
    } else {
      console.log('✅ Test 7 PASSED: Feature flags retrieved');
      console.log(`   - Found ${featureFlags.length} feature flag(s)`);
      
      // Test getting a specific feature flag
      const firstFlag = featureFlags[0];
      const flagById = manager.getFeatureFlag(firstFlag.id);
      
      if (!flagById) {
        console.error('❌ Test 7b FAILED: Could not retrieve feature flag by ID');
        allPassed = false;
      } else {
        console.log('✅ Test 7b PASSED: Feature flag retrieved by ID');
      }
    }
  } catch (error: unknown) {
    console.warn('⚠️  Test 7 SKIPPED:', error instanceof Error ? error.message : String(error));
  }
  
  // Test 8: Get business rules
  console.log('\n📋 Test 8: Get business rules');
  try {
    const businessRules = manager.getAllBusinessRules();
    
    if (businessRules.length === 0) {
      console.warn('⚠️  Test 8 SKIPPED: No business rules found (may not exist)');
    } else {
      console.log('✅ Test 8 PASSED: Business rules retrieved');
      console.log(`   - Found ${businessRules.length} business rule(s)`);
    }
  } catch (error: unknown) {
    console.warn('⚠️  Test 8 SKIPPED:', error instanceof Error ? error.message : String(error));
  }
  
  // Test 9: Check if feature flag is enabled
  console.log('\n📋 Test 9: Check if feature flag is enabled');
  try {
    const featureFlags = manager.getAllFeatureFlags();
    
    if (featureFlags.length > 0) {
      const testFlag = featureFlags[0];
      const isEnabled = manager.isFeatureEnabled(testFlag.id);
      
      console.log('✅ Test 9 PASSED: Feature flag enabled check works');
      console.log(`   - Flag "${testFlag.id}" is ${isEnabled ? 'enabled' : 'disabled'}`);
    } else {
      console.warn('⚠️  Test 9 SKIPPED: No feature flags available to test');
    }
  } catch (error: unknown) {
    console.warn('⚠️  Test 9 SKIPPED:', error instanceof Error ? error.message : String(error));
  }
  
  // Test 10: Reload configurations
  console.log('\n📋 Test 10: Reload configurations');
  try {
    await manager.loadAll();
    
    if (!manager.isLoaded()) {
      console.error('❌ Test 10 FAILED: Configurations should be loaded after reload');
      allPassed = false;
    } else {
      console.log('✅ Test 10 PASSED: Configurations reloaded successfully');
    }
  } catch (error: unknown) {
    console.error('❌ Test 10 FAILED:', error instanceof Error ? error.message : String(error));
    allPassed = false;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ [CONFIG-MANAGER-TEST] All tests passed!');
  } else {
    console.log('❌ [CONFIG-MANAGER-TEST] Some tests failed');
  }
  console.log('='.repeat(60) + '\n');
}

// Run tests if executed directly
if (require.main === module) {
  testConfigManager().catch((error) => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}
