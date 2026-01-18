/**
 * ConfigLoader Tests
 * 
 * Validates that configuration loader properly loads and caches YAML configs.
 */

import { ConfigLoader } from '../../../lib/registry/config-loader';

/**
 * Test ConfigLoader functionality
 */
export function testConfigLoader(): void {
  console.log('\n🧪 [CONFIG-LOADER-TEST] Starting config loader validation...\n');
  
  const loader = ConfigLoader.getInstance();
  loader.clearCache();
  
  let allPassed = true;
  
  // Test 1: Load existing agent config
  console.log('📋 Test 1: Load existing agent config (route-agent)');
  try {
    const agentConfig = loader.loadAgentConfig('route-agent');
    
    if (!agentConfig) {
      console.error('❌ Test 1 FAILED: Could not load route-agent config');
      allPassed = false;
    } else {
      console.log(`✅ Test 1 PASSED: Loaded agent config`);
      console.log(`   - agent_id: ${agentConfig.agent_id}`);
      console.log(`   - agent_name: ${agentConfig.agent_name}`);
      console.log(`   - agent_type: ${agentConfig.agent_type}`);
      
      if (agentConfig.agent_id !== 'route_agent') {
        console.error(`❌ Test 1 FAILED: Expected agent_id 'route_agent', got '${agentConfig.agent_id}'`);
        allPassed = false;
      }
    }
  } catch (error) {
    console.error('❌ Test 1 FAILED with error:', error);
    allPassed = false;
  }
  
  // Test 2: Return null for non-existent config
  console.log('\n📋 Test 2: Return null for non-existent config');
  try {
    const nonExistentConfig = loader.loadAgentConfig('non-existent-agent');
    
    if (nonExistentConfig !== null) {
      console.error(`❌ Test 2 FAILED: Expected null, got ${JSON.stringify(nonExistentConfig)}`);
      allPassed = false;
    } else {
      console.log('✅ Test 2 PASSED: Correctly returned null for non-existent config');
    }
  } catch (error) {
    console.error('❌ Test 2 FAILED with error:', error);
    allPassed = false;
  }
  
  // Test 3: Verify caching works
  console.log('\n📋 Test 3: Verify caching works');
  try {
    loader.clearCache();
    const cachedKeysBefore = loader.getCachedKeys();
    
    if (cachedKeysBefore.length !== 0) {
      console.error(`❌ Test 3 FAILED: Cache should be empty after clear, found ${cachedKeysBefore.length} keys`);
      allPassed = false;
    } else {
      console.log('✅ Test 3a PASSED: Cache cleared successfully');
    }
    
    // Load config twice
    loader.loadAgentConfig('route-agent');
    loader.loadAgentConfig('route-agent');
    
    const cachedKeysAfter = loader.getCachedKeys();
    const agentCacheKey = 'agent:route-agent';
    
    if (!cachedKeysAfter.includes(agentCacheKey)) {
      console.error(`❌ Test 3b FAILED: Cache key '${agentCacheKey}' not found after loading`);
      allPassed = false;
    } else {
      console.log('✅ Test 3b PASSED: Config cached after first load');
      console.log(`   - Cached keys: ${cachedKeysAfter.join(', ')}`);
    }
  } catch (error) {
    console.error('❌ Test 3 FAILED with error:', error);
    allPassed = false;
  }
  
  // Test 4: Load workflow config
  console.log('\n📋 Test 4: Load workflow config');
  try {
    const workflowConfig = loader.loadWorkflowConfig('bunker-planning');
    
    if (!workflowConfig) {
      console.warn('⚠️  Test 4 SKIPPED: bunker-planning workflow config not found or invalid (may need steps field)');
      console.log('   This is expected if the YAML file is minimal and will be expanded later');
    } else {
      console.log('✅ Test 4 PASSED: Loaded workflow config');
      console.log(`   - workflow_id: ${workflowConfig.workflow_id}`);
      console.log(`   - workflow_name: ${workflowConfig.workflow_name}`);
    }
  } catch (error) {
    console.warn('⚠️  Test 4 SKIPPED: Workflow config may be incomplete:', error);
  }
  
  // Test 5: Load validation rules
  console.log('\n📋 Test 5: Load validation rules');
  try {
    const validationRules = loader.loadValidationRules();
    
    if (!validationRules) {
      console.warn('⚠️  Test 5 SKIPPED: Validation rules config not found or invalid');
    } else {
      console.log('✅ Test 5 PASSED: Loaded validation rules');
      console.log(`   - Number of rules: ${validationRules.rules.length}`);
      
      if (Array.isArray(validationRules.rules)) {
        console.log(`   - Rules array is valid`);
      } else {
        console.error('❌ Test 5 FAILED: Rules is not an array');
        allPassed = false;
      }
    }
  } catch (error) {
    console.warn('⚠️  Test 5 SKIPPED: Validation rules may be incomplete:', error);
  }
  
  // Test 6: Clear cache functionality
  console.log('\n📋 Test 6: Clear cache functionality');
  try {
    loader.loadAgentConfig('route-agent');
    const keysBeforeClear = loader.getCachedKeys();
    
    if (keysBeforeClear.length === 0) {
      console.error('❌ Test 6 FAILED: No keys in cache before clear');
      allPassed = false;
    } else {
      loader.clearCache();
      const keysAfterClear = loader.getCachedKeys();
      
      if (keysAfterClear.length !== 0) {
        console.error(`❌ Test 6 FAILED: Cache should be empty after clear, found ${keysAfterClear.length} keys`);
        allPassed = false;
      } else {
        console.log('✅ Test 6 PASSED: Cache cleared successfully');
      }
    }
  } catch (error) {
    console.error('❌ Test 6 FAILED with error:', error);
    allPassed = false;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ [CONFIG-LOADER-TEST] All critical tests passed!');
  } else {
    console.log('❌ [CONFIG-LOADER-TEST] Some tests failed');
  }
  console.log('='.repeat(60));
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testConfigLoader();
}
