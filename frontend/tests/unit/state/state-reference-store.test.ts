/**
 * State Reference Store Unit Tests
 * 
 * Tests reference store/retrieve functionality.
 */

import { StateReferenceStore, type RedisLike } from '@/lib/state/state-reference-store';

/**
 * Mock Redis adapter for testing
 */
class MockRedis implements RedisLike {
  private store: Map<string, { value: string; ttl?: number }> = new Map();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    
    // Check TTL (simplified - just check if expired)
    if (entry.ttl && entry.ttl < Date.now()) {
      this.store.delete(key);
      return null;
    }
    
    return entry.value;
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    const ttl = Date.now() + seconds * 1000;
    this.store.set(key, { value, ttl });
  }

  async exists(key: string): Promise<number> {
    return this.store.has(key) ? 1 : 0;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return 0;
    entry.ttl = Date.now() + seconds * 1000;
    return 1;
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return Array.from(this.store.keys()).filter(key => regex.test(key));
  }

  // Helper for testing
  clear(): void {
    this.store.clear();
  }
}

/**
 * Run state reference store tests
 */
export async function testStateReferenceStore(): Promise<void> {
  console.log('\n🧪 [STATE-REFERENCE-STORE-TEST] Starting reference store tests...\n');
  
  let allPassed = true;
  const mockRedis = new MockRedis();
  const store = new StateReferenceStore(mockRedis);
  
  // Test 1: Store and retrieve reference
  console.log('📋 Test 1: Store and retrieve reference');
  try {
    const testData = {
      waypoints: [
        { lat: 1.0, lon: 103.0, name: 'Singapore' },
        { lat: 51.0, lon: 4.0, name: 'Rotterdam' },
      ],
      distance_nm: 8500,
    };
    
    const referenceId = await store.store('route', testData, {
      type: 'route',
      conversationId: 'test-123',
    });
    
    if (!referenceId) {
      console.error('❌ Test 1 FAILED: Should return reference ID');
      allPassed = false;
    } else {
      const retrieved = await store.retrieve(referenceId);
      
      if (!retrieved) {
        console.error('❌ Test 1 FAILED: Should retrieve stored data');
        allPassed = false;
      } else {
        const retrievedData = retrieved as typeof testData;
        const matches = JSON.stringify(retrievedData) === JSON.stringify(testData);
        
        if (!matches) {
          console.error('❌ Test 1 FAILED: Retrieved data should match original');
          allPassed = false;
        } else {
          console.log('✅ Test 1 PASSED: Store and retrieve reference');
          console.log(`   - Reference ID: ${referenceId}`);
          console.log(`   - Data size: ${Buffer.byteLength(JSON.stringify(testData), 'utf8')} bytes`);
        }
      }
    }
  } catch (error: any) {
    console.error('❌ Test 1 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 2: Reuse existing reference
  console.log('\n📋 Test 2: Reuse existing reference');
  try {
    mockRedis.clear();
    const testData = { port: 'SGSIN', name: 'Singapore' };
    
    const refId1 = await store.store('port', testData);
    const refId2 = await store.store('port', testData); // Same data
    
    if (refId1 !== refId2) {
      console.error('❌ Test 2 FAILED: Should reuse same reference ID for same data');
      console.error(`   First ID: ${refId1}`);
      console.error(`   Second ID: ${refId2}`);
      allPassed = false;
    } else {
      console.log('✅ Test 2 PASSED: Reuse existing reference');
      console.log(`   - Reference ID reused: ${refId1}`);
    }
  } catch (error: any) {
    console.error('❌ Test 2 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 3: Reference string creation
  console.log('\n📋 Test 3: Reference string creation');
  try {
    const referenceId = 'test_ref_12345';
    const refString = store.createReference(referenceId);
    
    if (refString !== 'ref:test_ref_12345') {
      console.error(`❌ Test 3 FAILED: Should create ref: prefix, got ${refString}`);
      allPassed = false;
    } else {
      const isRef = store.isReference(refString);
      const extractedId = store.extractReferenceId(refString);
      
      if (!isRef || extractedId !== referenceId) {
        console.error('❌ Test 3 FAILED: Reference detection/extraction should work');
        allPassed = false;
      } else {
        console.log('✅ Test 3 PASSED: Reference string creation');
        console.log(`   - Reference string: ${refString}`);
        console.log(`   - Is reference: ${isRef}`);
        console.log(`   - Extracted ID: ${extractedId}`);
      }
    }
  } catch (error: any) {
    console.error('❌ Test 3 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 4: Retrieve non-existent reference
  console.log('\n📋 Test 4: Retrieve non-existent reference');
  try {
    const retrieved = await store.retrieve('non_existent_ref_12345');
    
    if (retrieved !== null) {
      console.error('❌ Test 4 FAILED: Should return null for non-existent reference');
      allPassed = false;
    } else {
      console.log('✅ Test 4 PASSED: Retrieve non-existent reference');
      console.log(`   - Returns null as expected`);
    }
  } catch (error: any) {
    console.error('❌ Test 4 FAILED:', error.message);
    allPassed = false;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ [STATE-REFERENCE-STORE-TEST] All tests passed!');
  } else {
    console.log('❌ [STATE-REFERENCE-STORE-TEST] Some tests failed');
  }
  console.log('='.repeat(60) + '\n');
}

// Run tests if executed directly
if (require.main === module) {
  testStateReferenceStore().catch((error) => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}
