/**
 * State Migrator Unit Tests
 * 
 * Tests migration v1→v2, version detection, and migration flow.
 */

import { StateMigrator, getStateMigrator } from '@/lib/state/state-migrator';
import { CURRENT_STATE_VERSION } from '@/lib/state/state-schema';

/**
 * Create a v1.0.0 state for testing
 */
function createV1State(): any {
  return {
    messages: [],
    correlation_id: 'test-correlation-123',
    vessel: {
      name: 'Test Vessel',
      imo: '1234567',
    },
    // v1 fields only - no v2 fields
    route: {
      waypoints: [],
      distance_nm: 1000,
    },
  };
}

/**
 * Run state migrator tests
 */
export async function testStateMigrator(): Promise<void> {
  console.log('\n🧪 [STATE-MIGRATOR-TEST] Starting state migrator tests...\n');
  
  let allPassed = true;
  const migrator = getStateMigrator();
  
  // Test 1: Migration v1→v2 works
  console.log('📋 Test 1: Migration v1→v2 works');
  try {
    const v1State = createV1State();
    
    // Migrate from v1 to v2
    const result = migrator.migrate(v1State, '1.0.0', '2.0.0');
    
    if (!result.success) {
      console.error('❌ Test 1 FAILED: Migration should succeed');
      console.error(`   Errors: ${result.validation.errors.join(', ')}`);
      allPassed = false;
    } else {
      // Check that v2 fields were added
      const hasExecutionPlan = 'execution_plan' in result.migratedState;
      const hasExecutionResult = 'execution_result' in result.migratedState;
      const hasWorkflowStage = 'workflow_stage' in result.migratedState;
      const hasReasoningHistory = 'reasoning_history' in result.migratedState;
      const hasCIIRating = 'cii_rating' in result.migratedState;
      const hasSchemaVersion = result.migratedState._schema_version === '2.0.0';
      
      if (!hasExecutionPlan || !hasExecutionResult || !hasWorkflowStage || 
          !hasReasoningHistory || !hasCIIRating || !hasSchemaVersion) {
        console.error('❌ Test 1 FAILED: Migration did not add all required v2 fields');
        console.error(`   execution_plan: ${hasExecutionPlan}`);
        console.error(`   execution_result: ${hasExecutionResult}`);
        console.error(`   workflow_stage: ${hasWorkflowStage}`);
        console.error(`   reasoning_history: ${hasReasoningHistory}`);
        console.error(`   cii_rating: ${hasCIIRating}`);
        console.error(`   _schema_version: ${hasSchemaVersion}`);
        allPassed = false;
      } else {
        console.log('✅ Test 1 PASSED: Migration v1→v2 works');
        console.log(`   - Changes applied: ${result.changes.length}`);
        console.log(`   - From version: ${result.fromVersion}`);
        console.log(`   - To version: ${result.toVersion}`);
        console.log(`   - Validation: ${result.validation.valid ? 'passed' : 'failed'}`);
      }
    }
  } catch (error: any) {
    console.error('❌ Test 1 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 2: Version detection works
  console.log('\n📋 Test 2: Version detection works');
  try {
    // Test v1 detection
    const v1State = createV1State();
    const detectedV1 = migrator.detectVersion(v1State);
    
    if (detectedV1 !== '1.0.0') {
      console.error(`❌ Test 2 FAILED: Should detect v1.0.0, got ${detectedV1}`);
      allPassed = false;
    } else {
      // Test v2 detection
      const v2State = {
        ...v1State,
        execution_plan: null,
        _schema_version: '2.0.0',
      };
      const detectedV2 = migrator.detectVersion(v2State);
      
      if (detectedV2 !== '2.0.0') {
        console.error(`❌ Test 2 FAILED: Should detect v2.0.0, got ${detectedV2}`);
        allPassed = false;
      } else {
        // Test explicit version field
        const explicitV2State = {
          ...v1State,
          _schema_version: '2.0.0',
        };
        const detectedExplicit = migrator.detectVersion(explicitV2State);
        
        if (detectedExplicit !== '2.0.0') {
          console.error(`❌ Test 2 FAILED: Should detect explicit version 2.0.0, got ${detectedExplicit}`);
          allPassed = false;
        } else {
          console.log('✅ Test 2 PASSED: Version detection works');
          console.log(`   - v1 detection: ${detectedV1}`);
          console.log(`   - v2 detection: ${detectedV2}`);
          console.log(`   - Explicit version: ${detectedExplicit}`);
        }
      }
    }
  } catch (error: any) {
    console.error('❌ Test 2 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 3: Auto-migration works
  console.log('\n📋 Test 3: Auto-migration works');
  try {
    const v1State = createV1State();
    const result = migrator.autoMigrate(v1State);
    
    if (!result.success) {
      console.error('❌ Test 3 FAILED: Auto-migration should succeed');
      allPassed = false;
    } else {
      const finalVersion = result.migratedState._schema_version;
      if (finalVersion !== CURRENT_STATE_VERSION) {
        console.error(`❌ Test 3 FAILED: Should migrate to ${CURRENT_STATE_VERSION}, got ${finalVersion}`);
        allPassed = false;
      } else {
        console.log('✅ Test 3 PASSED: Auto-migration works');
        console.log(`   - Detected version: ${result.fromVersion}`);
        console.log(`   - Migrated to: ${result.toVersion}`);
        console.log(`   - Changes: ${result.changes.length}`);
      }
    }
  } catch (error: any) {
    console.error('❌ Test 3 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 4: No migration needed for current version
  console.log('\n📋 Test 4: No migration needed for current version');
  try {
    const currentState = {
      ...createV1State(),
      _schema_version: CURRENT_STATE_VERSION,
      execution_plan: null,
      execution_result: null,
      workflow_stage: 0,
      reasoning_history: [],
      cii_rating: null,
    };
    
    const result = migrator.migrate(currentState, CURRENT_STATE_VERSION, CURRENT_STATE_VERSION);
    
    if (!result.success || result.changes.length > 0) {
      console.error('❌ Test 4 FAILED: Same version should not require migration');
      allPassed = false;
    } else {
      console.log('✅ Test 4 PASSED: No migration needed for current version');
      console.log(`   - Changes: ${result.changes.length}`);
    }
  } catch (error: any) {
    console.error('❌ Test 4 FAILED:', error.message);
    allPassed = false;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ [STATE-MIGRATOR-TEST] All tests passed!');
  } else {
    console.log('❌ [STATE-MIGRATOR-TEST] Some tests failed');
  }
  console.log('='.repeat(60) + '\n');
}

// Run tests if executed directly
if (require.main === module) {
  testStateMigrator().catch((error) => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}
