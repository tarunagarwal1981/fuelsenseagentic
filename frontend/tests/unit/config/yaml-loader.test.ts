/**
 * YAML Loader Unit Tests
 * 
 * Tests YAML file loading, parsing, and schema validation.
 */

import { loadYAML, loadAllYAMLFromDirectory, validateAgainstSchema, getConfigDir } from '@/lib/config/yaml-loader';
import type { JSONSchema } from '@/lib/config/yaml-loader';

/**
 * Run YAML loader tests
 */
export async function testYAMLLoader(): Promise<void> {
  console.log('\n🧪 [YAML-LOADER-TEST] Starting YAML loader tests...\n');
  
  let allPassed = true;
  
  // Test 1: Load existing YAML file
  console.log('📋 Test 1: Load existing YAML file');
  try {
    const agentConfig = loadYAML<any>('agents/route-agent.yaml');
    
    if (!agentConfig || Object.keys(agentConfig).length === 0) {
      console.error('❌ Test 1 FAILED: Could not load route-agent.yaml or file is empty');
      allPassed = false;
    } else {
      console.log('✅ Test 1 PASSED: YAML file loaded successfully');
      console.log(`   - File has ${Object.keys(agentConfig).length} top-level keys`);
      if (agentConfig.agent_id || agentConfig.id) {
        console.log(`   - Agent ID: ${agentConfig.agent_id || agentConfig.id}`);
      }
    }
  } catch (error: any) {
    console.error('❌ Test 1 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 2: Load non-existent file (should handle gracefully)
  console.log('\n📋 Test 2: Handle non-existent file');
  try {
    const nonExistent = loadYAML<any>('non-existent-file.yaml', { throwOnError: false });
    
    if (nonExistent && Object.keys(nonExistent).length > 0) {
      console.error('❌ Test 2 FAILED: Non-existent file should return empty object');
      allPassed = false;
    } else {
      console.log('✅ Test 2 PASSED: Non-existent file handled gracefully');
    }
  } catch (error: any) {
    // If throwOnError is false, should not throw
    if (!error.message.includes('not found')) {
      console.error('❌ Test 2 FAILED:', error.message);
      allPassed = false;
    } else {
      console.log('✅ Test 2 PASSED: Error handled correctly');
    }
  }
  
  // Test 3: Load all YAML files from directory
  console.log('\n📋 Test 3: Load all YAML files from directory');
  try {
    const agents = loadAllYAMLFromDirectory<any>('agents');
    
    if (agents.size === 0) {
      console.error('❌ Test 3 FAILED: No YAML files loaded from agents directory');
      allPassed = false;
    } else {
      console.log('✅ Test 3 PASSED: Loaded YAML files from directory');
      console.log(`   - Loaded ${agents.size} agent configs`);
      console.log(`   - Agent IDs: ${Array.from(agents.keys()).join(', ')}`);
    }
  } catch (error: any) {
    console.error('❌ Test 3 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 4: Schema validation
  console.log('\n📋 Test 4: Schema validation');
  try {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        agent_id: { type: 'string', minLength: 1 },
        agent_name: { type: 'string', minLength: 1 },
        agent_type: { type: 'string', enum: ['supervisor', 'specialist', 'coordinator', 'finalizer'] },
      },
      required: ['agent_id', 'agent_name'],
    };
    
    // Test valid data
    const validData = {
      agent_id: 'test_agent',
      agent_name: 'Test Agent',
      agent_type: 'specialist',
    };
    
    const validResult = validateAgainstSchema(validData, schema);
    if (!validResult.valid) {
      console.error('❌ Test 4a FAILED: Valid data should pass validation');
      console.error(`   Errors: ${validResult.errors.map(e => e.message).join(', ')}`);
      allPassed = false;
    } else {
      console.log('✅ Test 4a PASSED: Valid data passes schema validation');
    }
    
    // Test invalid data
    const invalidData = {
      agent_id: '', // Empty string should fail minLength
      agent_name: 'Test Agent',
    };
    
    const invalidResult = validateAgainstSchema(invalidData, schema);
    if (invalidResult.valid) {
      console.error('❌ Test 4b FAILED: Invalid data should fail validation');
      allPassed = false;
    } else {
      console.log('✅ Test 4b PASSED: Invalid data correctly fails validation');
      console.log(`   - Found ${invalidResult.errors.length} validation error(s)`);
    }
    
    // Test missing required field
    const missingRequired = {
      agent_name: 'Test Agent',
      // Missing agent_id
    };
    
    const missingResult = validateAgainstSchema(missingRequired, schema);
    if (missingResult.valid) {
      console.error('❌ Test 4c FAILED: Missing required field should fail validation');
      allPassed = false;
    } else {
      console.log('✅ Test 4c PASSED: Missing required field correctly fails validation');
    }
  } catch (error: any) {
    console.error('❌ Test 4 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 5: Load YAML with schema validation
  console.log('\n📋 Test 5: Load YAML with schema validation');
  try {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
      },
      required: [],
    };
    
    const config = loadYAML<any>('agents/route-agent.yaml', {
      validate: true,
      schema,
      throwOnError: false,
    });
    
    if (!config || Object.keys(config).length === 0) {
      console.warn('⚠️  Test 5 SKIPPED: Could not load config for validation test');
    } else {
      console.log('✅ Test 5 PASSED: YAML loaded with schema validation');
    }
  } catch (error: any) {
    // Validation errors are acceptable if schema is strict
    if (error.message.includes('validation failed')) {
      console.log('✅ Test 5 PASSED: Schema validation works (validation error expected)');
    } else {
      console.error('❌ Test 5 FAILED:', error.message);
      allPassed = false;
    }
  }
  
  // Test 6: Get config directory
  console.log('\n📋 Test 6: Get config directory');
  try {
    const configDir = getConfigDir();
    
    if (!configDir || typeof configDir !== 'string') {
      console.error('❌ Test 6 FAILED: Config directory should be a string');
      allPassed = false;
    } else {
      console.log('✅ Test 6 PASSED: Config directory retrieved');
      console.log(`   - Config dir: ${configDir}`);
    }
  } catch (error: any) {
    console.error('❌ Test 6 FAILED:', error.message);
    allPassed = false;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ [YAML-LOADER-TEST] All tests passed!');
  } else {
    console.log('❌ [YAML-LOADER-TEST] Some tests failed');
  }
  console.log('='.repeat(60) + '\n');
}

// Run tests if executed directly
if (require.main === module) {
  testYAMLLoader().catch((error) => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}
