/**
 * Test Runner
 * 
 * Executes all test suites for the multi-agent system.
 */

// Load environment variables FIRST before any other imports
import './setup-env';

import { testRegistry } from './registry.test';
import { testPlanning } from './planning.test';

async function runAllTests() {
  console.log('🚀 [TEST-RUNNER] Starting test suite...\n');
  console.log('='.repeat(60));
  
  let allPassed = true;
  
  try {
    // Run registry tests
    console.log('\n📋 Running Registry Tests...');
    console.log('-'.repeat(60));
    testRegistry();
    console.log('✅ Registry tests completed\n');
  } catch (error) {
    console.error('❌ Registry tests failed:', error);
    allPassed = false;
  }
  
  try {
    // Run planning tests
    console.log('\n📋 Running Planning Tests...');
    console.log('-'.repeat(60));
    await testPlanning();
    console.log('✅ Planning tests completed\n');
  } catch (error) {
    console.error('❌ Planning tests failed:', error);
    allPassed = false;
  }
  
  console.log('='.repeat(60));
  if (allPassed) {
    console.log('\n✅ [TEST-RUNNER] All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ [TEST-RUNNER] Some tests failed');
    process.exit(1);
  }
}

// Run tests if executed directly
runAllTests().catch((error) => {
  console.error('❌ [TEST-RUNNER] Fatal error:', error);
  process.exit(1);
});

export { runAllTests };

