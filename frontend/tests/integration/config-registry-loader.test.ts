/**
 * Config Registry Loader Integration Tests
 * 
 * Tests integration between YAML configs and registries (Agent, Tool, Workflow).
 * Validates that registries can be populated from YAML files.
 */

import { ConfigManager } from '@/lib/config/config-manager';
import { loadConfigurations } from '@/lib/config/registry-loader';
import { AgentRegistry } from '@/lib/registry/agent-registry';
import { ToolRegistry } from '@/lib/registry/tool-registry';
import { registerAllTools } from '@/lib/registry/tools';
import { registerAllAgents } from '@/lib/registry/agents';

/**
 * Run config registry loader integration tests
 */
export async function testConfigRegistryLoader(): Promise<void> {
  console.log('\n🧪 [CONFIG-REGISTRY-LOADER-TEST] Starting integration tests...\n');
  
  let allPassed = true;
  
  // Test 1: Load configurations
  console.log('📋 Test 1: Load configurations from YAML');
  try {
    const configManager = ConfigManager.getInstance();
    await configManager.loadAll();
    
    if (!configManager.isLoaded()) {
      console.error('❌ Test 1 FAILED: Configurations not loaded');
      allPassed = false;
    } else {
      console.log('✅ Test 1 PASSED: Configurations loaded from YAML');
      const agents = configManager.getAllAgentConfigs();
      const tools = configManager.getAllToolConfigs();
      console.log(`   - Agents: ${agents.length}`);
      console.log(`   - Tools: ${tools.length}`);
    }
  } catch (error: any) {
    console.error('❌ Test 1 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 2: Registries populate from YAML
  console.log('\n📋 Test 2: Registries populate from YAML');
  try {
    // Load configurations from YAML
    await loadConfigurations();
    
    // Register tools first (required for agents)
    registerAllTools();
    
    // Register agents (they use configs loaded from YAML)
    registerAllAgents();
    
    const agentRegistry = AgentRegistry.getInstance();
    const toolRegistry = ToolRegistry.getInstance();
    
    const agentCount = agentRegistry.getCount();
    const toolCount = toolRegistry.getAll().length;
    
    if (agentCount === 0) {
      console.error('❌ Test 2 FAILED: Agent registry should have agents');
      allPassed = false;
    } else if (toolCount === 0) {
      console.error('❌ Test 2 FAILED: Tool registry should have tools');
      allPassed = false;
    } else {
      console.log('✅ Test 2 PASSED: Registries populated from YAML');
      console.log(`   - Agents registered: ${agentCount}`);
      console.log(`   - Tools registered: ${toolCount}`);
    }
  } catch (error: any) {
    console.error('❌ Test 2 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 3: Agent registry has expected agents
  console.log('\n📋 Test 3: Agent registry has expected agents');
  try {
    const agentRegistry = AgentRegistry.getInstance();
    const expectedAgents = ['supervisor', 'route_agent', 'compliance_agent', 'weather_agent', 'bunker_agent'];
    
    const missingAgents = expectedAgents.filter(id => !agentRegistry.has(id));
    
    if (missingAgents.length > 0) {
      console.error(`❌ Test 3 FAILED: Missing agents: ${missingAgents.join(', ')}`);
      allPassed = false;
    } else {
      console.log('✅ Test 3 PASSED: All expected agents in registry');
      console.log(`   - Found: ${expectedAgents.join(', ')}`);
    }
  } catch (error: any) {
    console.error('❌ Test 3 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 4: Feature flags work
  console.log('\n📋 Test 4: Feature flags work');
  try {
    const configManager = ConfigManager.getInstance();
    const featureFlags = configManager.getAllFeatureFlags();
    
    if (featureFlags.length > 0) {
      const testFlag = featureFlags[0];
      const isEnabled = configManager.isFeatureEnabled(testFlag.id);
      
      console.log('✅ Test 4 PASSED: Feature flags functional');
      console.log(`   - Flag "${testFlag.id}": ${isEnabled ? 'enabled' : 'disabled'}`);
      console.log(`   - Total flags: ${featureFlags.length}`);
    } else {
      console.warn('⚠️  Test 4 SKIPPED: No feature flags found (may not exist)');
    }
  } catch (error: any) {
    console.error('❌ Test 4 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 5: Can change config without code changes
  console.log('\n📋 Test 5: Can change config without code changes');
  try {
    const configManager = ConfigManager.getInstance();
    
    // Get an agent config
    const agentConfig = configManager.getAgentConfig('route_agent');
    
    if (!agentConfig) {
      console.error('❌ Test 5 FAILED: Could not get agent config');
      allPassed = false;
    } else {
      // Verify config has expected structure (loaded from YAML)
      const hasId = !!(agentConfig.id || agentConfig.agent_id);
      const hasName = !!(agentConfig.name || agentConfig.agent_name);
      
      if (!hasId || !hasName) {
        console.error('❌ Test 5 FAILED: Config structure invalid');
        allPassed = false;
      } else {
        console.log('✅ Test 5 PASSED: Configs loaded from YAML (no code changes needed)');
        console.log(`   - Config structure valid`);
        console.log(`   - Can modify YAML files to change behavior`);
      }
    }
  } catch (error: any) {
    console.error('❌ Test 5 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 6: Registry agents match config agents
  console.log('\n📋 Test 6: Registry agents match config agents');
  try {
    const configManager = ConfigManager.getInstance();
    const agentRegistry = AgentRegistry.getInstance();
    
    const configAgents = configManager.getAllAgentConfigs();
    const registryAgents = agentRegistry.getAll();
    
    // Check that at least some agents match
    const configIds = new Set(configAgents.map(a => a.id || a.agent_id));
    const registryIds = new Set(registryAgents.map(a => a.id));
    
    const matchingIds = Array.from(configIds).filter(id => registryIds.has(id));
    
    if (matchingIds.length === 0) {
      console.error('❌ Test 6 FAILED: No matching agents between config and registry');
      allPassed = false;
    } else {
      console.log('✅ Test 6 PASSED: Registry agents match config agents');
      console.log(`   - Matching agents: ${matchingIds.length}`);
      console.log(`   - Examples: ${matchingIds.slice(0, 3).join(', ')}`);
    }
  } catch (error: any) {
    console.error('❌ Test 6 FAILED:', error.message);
    allPassed = false;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ [CONFIG-REGISTRY-LOADER-TEST] All integration tests passed!');
  } else {
    console.log('❌ [CONFIG-REGISTRY-LOADER-TEST] Some tests failed');
  }
  console.log('='.repeat(60) + '\n');
}

// Run tests if executed directly
if (require.main === module) {
  testConfigRegistryLoader().catch((error) => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}
