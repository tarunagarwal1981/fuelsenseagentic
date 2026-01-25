/**
 * Comprehensive Registry Tests Runner
 * 
 * Runs all comprehensive unit tests for Tool, Agent, and Workflow registries.
 */

import { testToolRegistryComprehensive } from './tool-registry.test';
import { testAgentRegistryComprehensive } from './agent-registry.test';
import { testWorkflowRegistryComprehensive } from './workflow-registry.test';

/**
 * Run all comprehensive registry tests
 */
export function runAllRegistryTests(): void {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 COMPREHENSIVE REGISTRY TESTS');
  console.log('='.repeat(70));
  
  const results = {
    tool: false,
    agent: false,
    workflow: false,
  };
  
  // Run Tool Registry tests
  try {
    testToolRegistryComprehensive();
    results.tool = true;
  } catch (error: any) {
    console.error('\n❌ Tool Registry tests failed:', error.message);
    results.tool = false;
  }
  
  // Run Agent Registry tests
  try {
    testAgentRegistryComprehensive();
    results.agent = true;
  } catch (error: any) {
    console.error('\n❌ Agent Registry tests failed:', error.message);
    results.agent = false;
  }
  
  // Run Workflow Registry tests
  try {
    testWorkflowRegistryComprehensive();
    results.workflow = true;
  } catch (error: any) {
    console.error('\n❌ Workflow Registry tests failed:', error.message);
    results.workflow = false;
  }
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`Tool Registry:     ${results.tool ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Agent Registry:    ${results.agent ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Workflow Registry: ${results.workflow ? '✅ PASSED' : '❌ FAILED'}`);
  
  const allPassed = results.tool && results.agent && results.workflow;
  console.log('\n' + '='.repeat(70));
  if (allPassed) {
    console.log('✅ ALL COMPREHENSIVE REGISTRY TESTS PASSED!');
  } else {
    console.log('❌ SOME TESTS FAILED');
  }
  console.log('='.repeat(70) + '\n');
  
  process.exit(allPassed ? 0 : 1);
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllRegistryTests();
}
