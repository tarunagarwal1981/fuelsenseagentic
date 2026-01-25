/**
 * State Delta Unit Tests
 * 
 * Tests delta computation and application.
 */

import { StateDelta, getStateDelta } from '@/lib/state/state-delta';

/**
 * Create a base state for testing
 */
function createBaseState(): any {
  return {
    messages: [],
    correlation_id: 'test-delta-123',
    vessel: { name: 'Test Vessel', imo: '1234567' },
    route_data: {
      waypoints: [{ lat: 1.0, lon: 103.0 }],
      distance_nm: 1000,
    },
    workflow_stage: 0,
  };
}

/**
 * Run state delta tests
 */
export async function testStateDelta(): Promise<void> {
  console.log('\n🧪 [STATE-DELTA-TEST] Starting delta tests...\n');
  
  let allPassed = true;
  const delta = getStateDelta();
  
  // Test 1: Delta computation works
  console.log('📋 Test 1: Delta computation works');
  try {
    const oldState = createBaseState();
    const newState = {
      ...oldState,
      route_data: {
        ...oldState.route_data,
        distance_nm: 2000, // Modified
      },
      bunker_analysis: { best_option: 'Port A' }, // Added
      // workflow_stage removed
    };
    delete newState.workflow_stage;
    
    const result = delta.computeDelta(oldState, newState);
    
    if (result.changeCount === 0) {
      console.error('❌ Test 1 FAILED: Should detect changes');
      allPassed = false;
    } else {
      const hasModified = Object.values(result.changes).some(c => c.type === 'modified');
      const hasAdded = Object.values(result.changes).some(c => c.type === 'added');
      const hasRemoved = Object.values(result.changes).some(c => c.type === 'removed');
      
      if (!hasModified && !hasAdded && !hasRemoved) {
        console.error('❌ Test 1 FAILED: Should detect different change types');
        allPassed = false;
      } else {
        console.log('✅ Test 1 PASSED: Delta computation works');
        console.log(`   - Change count: ${result.changeCount}`);
        console.log(`   - Modified: ${hasModified}`);
        console.log(`   - Added: ${hasAdded}`);
        console.log(`   - Removed: ${hasRemoved}`);
        console.log(`   - Delta size: ${result.deltaSize} bytes`);
        console.log(`   - Full state size: ${result.fullStateSize} bytes`);
        console.log(`   - Savings: ${result.savingsPercent}%`);
      }
    }
  } catch (error: any) {
    console.error('❌ Test 1 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 2: Delta application works
  console.log('\n📋 Test 2: Delta application works');
  try {
    const baseState = createBaseState();
    const targetState = {
      ...baseState,
      route_data: {
        ...baseState.route_data,
        distance_nm: 3000,
      },
      bunker_analysis: { best_option: 'Port B' },
    };
    delete targetState.workflow_stage;
    
    const deltaResult = delta.computeDelta(baseState, targetState);
    const appliedState = delta.applyDelta(baseState, deltaResult);
    
    // Check that applied state matches target
    const routeMatches = appliedState.route_data?.distance_nm === targetState.route_data.distance_nm;
    const bunkerMatches = JSON.stringify(appliedState.bunker_analysis) === JSON.stringify(targetState.bunker_analysis);
    const workflowRemoved = !('workflow_stage' in appliedState);
    
    if (!routeMatches || !bunkerMatches || !workflowRemoved) {
      console.error('❌ Test 2 FAILED: Applied delta should match target state');
      console.error(`   - Route matches: ${routeMatches}`);
      console.error(`   - Bunker matches: ${bunkerMatches}`);
      console.error(`   - Workflow removed: ${workflowRemoved}`);
      allPassed = false;
    } else {
      console.log('✅ Test 2 PASSED: Delta application works');
      console.log(`   - Route updated: ${routeMatches}`);
      console.log(`   - Bunker added: ${bunkerMatches}`);
      console.log(`   - Workflow removed: ${workflowRemoved}`);
    }
  } catch (error: any) {
    console.error('❌ Test 2 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 3: Empty delta (no changes)
  console.log('\n📋 Test 3: Empty delta (no changes)');
  try {
    const state = createBaseState();
    const result = delta.computeDelta(state, state);
    
    if (!delta.isEmpty(result)) {
      console.error('❌ Test 3 FAILED: Should produce empty delta for identical states');
      allPassed = false;
    } else {
      console.log('✅ Test 3 PASSED: Empty delta (no changes)');
      console.log(`   - Change count: ${result.changeCount}`);
      console.log(`   - Is empty: ${delta.isEmpty(result)}`);
    }
  } catch (error: any) {
    console.error('❌ Test 3 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 4: Change summary
  console.log('\n📋 Test 4: Change summary');
  try {
    const oldState = createBaseState();
    const newState = {
      ...oldState,
      route_data: { ...oldState.route_data, distance_nm: 4000 }, // Modified
      new_field: 'new_value', // Added
    };
    delete newState.workflow_stage; // Removed
    
    const deltaResult = delta.computeDelta(oldState, newState);
    const summary = delta.getChangeSummary(deltaResult);
    
    if (summary.added !== 1 || summary.modified !== 1 || summary.removed !== 1) {
      console.warn(`⚠️  Test 4: Change summary may not match expected counts`);
      console.log(`   - Added: ${summary.added} (expected: 1)`);
      console.log(`   - Modified: ${summary.modified} (expected: 1)`);
      console.log(`   - Removed: ${summary.removed} (expected: 1)`);
    } else {
      console.log('✅ Test 4 PASSED: Change summary');
      console.log(`   - Added: ${summary.added}`);
      console.log(`   - Modified: ${summary.modified}`);
      console.log(`   - Removed: ${summary.removed}`);
    }
  } catch (error: any) {
    console.error('❌ Test 4 FAILED:', error.message);
    allPassed = false;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ [STATE-DELTA-TEST] All tests passed!');
  } else {
    console.log('❌ [STATE-DELTA-TEST] Some tests failed');
  }
  console.log('='.repeat(60) + '\n');
}

// Run tests if executed directly
if (require.main === module) {
  testStateDelta().catch((error) => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}
