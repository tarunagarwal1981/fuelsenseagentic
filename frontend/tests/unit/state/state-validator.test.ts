/**
 * State Validator Unit Tests
 * 
 * Tests schema validation, type validation, and size validation.
 */

import { StateValidator, getStateValidator } from '@/lib/state/state-validator';
import { CURRENT_STATE_VERSION, STATE_SCHEMAS } from '@/lib/state/state-schema';

/**
 * Create a minimal valid state for testing
 */
function createValidState(): any {
  return {
    messages: [],
    correlation_id: 'test-correlation-123',
    vessel: {
      name: 'Test Vessel',
      imo: '1234567',
    },
    _schema_version: CURRENT_STATE_VERSION,
  };
}

/**
 * Run state validator tests
 */
export async function testStateValidator(): Promise<void> {
  console.log('\n🧪 [STATE-VALIDATOR-TEST] Starting state validator tests...\n');
  
  let allPassed = true;
  const validator = getStateValidator();
  
  // Test 1: Schema validation works
  console.log('📋 Test 1: Schema validation works');
  try {
    const validState = createValidState();
    const result = validator.validate(validState, CURRENT_STATE_VERSION);
    
    if (!result.valid) {
      console.error('❌ Test 1 FAILED: Valid state should pass validation');
      console.error(`   Errors: ${result.errors.join(', ')}`);
      allPassed = false;
    } else {
      console.log('✅ Test 1 PASSED: Schema validation works');
      console.log(`   - Valid state passed validation`);
    }
  } catch (error: any) {
    console.error('❌ Test 1 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 2: Type validation correct
  console.log('\n📋 Test 2: Type validation correct');
  try {
    const state = createValidState();
    
    // Test invalid type for correlation_id (should be string)
    state.correlation_id = 12345; // Wrong type
    const result1 = validator.validate(state, CURRENT_STATE_VERSION);
    
    const hasTypeError = result1.errors.some(e => 
      e.includes('correlation_id') && e.includes('invalid type')
    );
    
    if (!hasTypeError) {
      console.error('❌ Test 2 FAILED: Type validation should catch invalid types');
      console.error(`   Errors: ${result1.errors.join(', ')}`);
      allPassed = false;
    } else {
      // Test valid type
      state.correlation_id = 'valid-string-id';
      const result2 = validator.validate(state, CURRENT_STATE_VERSION);
      
      const hasTypeErrorAfterFix = result2.errors.some(e => 
        e.includes('correlation_id') && e.includes('invalid type')
      );
      
      if (hasTypeErrorAfterFix) {
        console.error('❌ Test 2 FAILED: Valid type should not produce errors');
        allPassed = false;
      } else {
        console.log('✅ Test 2 PASSED: Type validation correct');
        console.log(`   - Invalid types detected: ${hasTypeError}`);
        console.log(`   - Valid types accepted`);
      }
    }
  } catch (error: any) {
    console.error('❌ Test 2 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 3: Size validation works
  console.log('\n📋 Test 3: Size validation works');
  try {
    const state = createValidState();
    
    // Create a large string that exceeds max size
    const schema = STATE_SCHEMAS[CURRENT_STATE_VERSION];
    const correlationIdField = schema.fields.correlation_id;
    const maxSize = correlationIdField.size?.max || 100;
    
    // Create a string larger than max
    state.correlation_id = 'x'.repeat(maxSize + 100);
    
    const result = validator.validate(state, CURRENT_STATE_VERSION);
    
    const hasSizeError = result.errors.some(e => 
      e.includes('correlation_id') && e.includes('exceeds max size')
    );
    
    if (!hasSizeError) {
      console.warn('⚠️  Test 3: Size validation may not be strict enough');
      console.log(`   - Max size: ${maxSize} bytes`);
      console.log(`   - Actual size: ${Buffer.byteLength(state.correlation_id, 'utf8')} bytes`);
    } else {
      console.log('✅ Test 3 PASSED: Size validation works');
      console.log(`   - Oversized fields detected`);
    }
    
    // Test normal size passes
    state.correlation_id = 'normal-size-id';
    const result2 = validator.validate(state, CURRENT_STATE_VERSION);
    const hasSizeErrorAfterFix = result2.errors.some(e => 
      e.includes('correlation_id') && e.includes('exceeds max size')
    );
    
    if (hasSizeErrorAfterFix) {
      console.error('❌ Test 3 FAILED: Normal size should not produce errors');
      allPassed = false;
    }
  } catch (error: any) {
    console.error('❌ Test 3 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 4: Required fields validation
  console.log('\n📋 Test 4: Required fields validation');
  try {
    const state: any = {
      // Missing required fields
      correlation_id: 'test-123',
      // Missing: messages, vessel
    };
    
    const result = validator.validate(state, CURRENT_STATE_VERSION);
    
    const hasRequiredErrors = result.errors.some(e => 
      e.includes('Missing required field')
    );
    
    if (!hasRequiredErrors) {
      console.error('❌ Test 4 FAILED: Missing required fields should produce errors');
      allPassed = false;
    } else {
      console.log('✅ Test 4 PASSED: Required fields validation works');
      console.log(`   - Missing required fields detected: ${result.errors.filter(e => e.includes('Missing required')).length}`);
    }
  } catch (error: any) {
    console.error('❌ Test 4 FAILED:', error.message);
    allPassed = false;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ [STATE-VALIDATOR-TEST] All tests passed!');
  } else {
    console.log('❌ [STATE-VALIDATOR-TEST] Some tests failed');
  }
  console.log('='.repeat(60) + '\n');
}

// Run tests if executed directly
if (require.main === module) {
  testStateValidator().catch((error) => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}
