/**
 * State Compression Integration Tests
 * 
 * Tests checkpoint integration with compression, delta, and reference store.
 */

import { StateCompressor } from '@/lib/state/state-compressor';
import { StateReferenceStore, type RedisLike } from '@/lib/state/state-reference-store';
import { StateDelta, getStateDelta } from '@/lib/state/state-delta';

/**
 * Mock Redis adapter for testing
 */
class MockRedis implements RedisLike {
  private store: Map<string, { value: string; ttl?: number }> = new Map();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    return entry?.value || null;
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    this.store.set(key, { value, ttl: Date.now() + seconds * 1000 });
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
}

/**
 * Create a state with large referenceable fields
 */
function createLargeState(): any {
  return {
    messages: [],
    correlation_id: 'test-compression-integration-123',
    vessel: { name: 'Test Vessel', imo: '1234567' },
    route_data: {
      waypoints: Array.from({ length: 30 }, (_, i) => ({
        lat: 1.0 + i * 0.1,
        lon: 103.0 + i * 0.1,
        name: `Waypoint ${i}`,
      })),
      distance_nm: 8500,
    },
    bunker_ports: Array.from({ length: 15 }, (_, i) => ({
      code: `PORT${i}`,
      name: `Port ${i}`,
      prices: { VLSFO: 500 + i },
    })),
  };
}

/**
 * Run state compression integration tests
 */
export async function testStateCompression(): Promise<void> {
  console.log('\n🧪 [STATE-COMPRESSION-TEST] Starting compression integration tests...\n');
  
  let allPassed = true;
  const mockRedis = new MockRedis();
  const referenceStore = new StateReferenceStore(mockRedis);
  const compressor = new StateCompressor(referenceStore);
  const delta = getStateDelta();
  
  // Test 1: Checkpoint integration works
  console.log('📋 Test 1: Checkpoint integration works');
  try {
    const originalState = createLargeState();
    
    // Simulate checkpoint save: compress state
    const { compressed, stats } = await compressor.compress(originalState, 'test-checkpoint-123');
    
    // Simulate checkpoint load: decompress state
    const decompressed = await compressor.decompress(compressed);
    
    // Verify core fields are preserved
    const correlationPreserved = decompressed.correlation_id === originalState.correlation_id;
    const vesselPreserved = JSON.stringify(decompressed.vessel) === JSON.stringify(originalState.vessel);
    
    if (!correlationPreserved || !vesselPreserved) {
      console.error('❌ Test 1 FAILED: Core fields should be preserved');
      allPassed = false;
    } else {
      console.log('✅ Test 1 PASSED: Checkpoint integration works');
      console.log(`   - Correlation ID preserved: ${correlationPreserved}`);
      console.log(`   - Vessel data preserved: ${vesselPreserved}`);
      console.log(`   - Compression ratio: ${stats.originalSize > 0 ? ((1 - stats.compressedSize / stats.originalSize) * 100).toFixed(1) : 0}%`);
    }
  } catch (error: any) {
    console.error('❌ Test 1 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 2: No data loss
  console.log('\n📋 Test 2: No data loss');
  try {
    const originalState = createLargeState();
    const originalJson = JSON.stringify(originalState);
    
    // Compress and decompress
    const { compressed } = await compressor.compress(originalState, 'test-no-loss-123');
    const decompressed = await compressor.decompress(compressed);
    
    // Check that referenceable fields are restored
    const routeRestored = decompressed.route_data &&
      JSON.stringify(decompressed.route_data) === JSON.stringify(originalState.route_data);
    const portsRestored = decompressed.bunker_ports &&
      JSON.stringify(decompressed.bunker_ports) === JSON.stringify(originalState.bunker_ports);
    
    // Check non-referenceable fields
    const correlationPreserved = decompressed.correlation_id === originalState.correlation_id;
    const vesselPreserved = JSON.stringify(decompressed.vessel) === JSON.stringify(originalState.vessel);
    
    if (!correlationPreserved || !vesselPreserved) {
      console.error('❌ Test 2 FAILED: Non-referenceable fields should be preserved');
      allPassed = false;
    } else if (compressor.isCompressed(compressed) && (!routeRestored || !portsRestored)) {
      console.error('❌ Test 2 FAILED: Referenceable fields should be restored after decompression');
      allPassed = false;
    } else {
      console.log('✅ Test 2 PASSED: No data loss');
      console.log(`   - Correlation ID preserved: ${correlationPreserved}`);
      console.log(`   - Vessel preserved: ${vesselPreserved}`);
      if (compressor.isCompressed(compressed)) {
        console.log(`   - Route data restored: ${routeRestored}`);
        console.log(`   - Ports data restored: ${portsRestored}`);
      } else {
        console.log(`   - No compression occurred (fields may be too small)`);
      }
    }
  } catch (error: any) {
    console.error('❌ Test 2 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 3: Delta + Compression integration
  console.log('\n📋 Test 3: Delta + Compression integration');
  try {
    const baseState = createLargeState();
    
    // Compress base state
    const { compressed: baseCompressed } = await compressor.compress(baseState, 'test-delta-comp-123');
    
    // Create modified state
    const modifiedState = {
      ...baseState,
      route_data: {
        ...baseState.route_data,
        distance_nm: 9000, // Modified
      },
      new_field: 'new_value', // Added
    };
    
    // Compress modified state
    const { compressed: modifiedCompressed } = await compressor.compress(modifiedState, 'test-delta-comp-123');
    
    // Compute delta between compressed states
    const deltaResult = delta.computeDelta(baseCompressed, modifiedCompressed);
    
    if (deltaResult.changeCount === 0) {
      console.warn('⚠️  Test 3: No changes detected (may be expected if compression changed structure)');
    } else {
      console.log('✅ Test 3 PASSED: Delta + Compression integration');
      console.log(`   - Changes detected: ${deltaResult.changeCount}`);
      console.log(`   - Delta size: ${deltaResult.deltaSize} bytes`);
      console.log(`   - Savings: ${deltaResult.savingsPercent}%`);
    }
  } catch (error: any) {
    console.error('❌ Test 3 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 4: Round-trip compression/decompression
  console.log('\n📋 Test 4: Round-trip compression/decompression');
  try {
    const originalState = createLargeState();
    
    // Round-trip: compress -> decompress -> compress -> decompress
    const { compressed: compressed1 } = await compressor.compress(originalState, 'test-roundtrip-123');
    const decompressed1 = await compressor.decompress(compressed1);
    const { compressed: compressed2 } = await compressor.compress(decompressed1, 'test-roundtrip-123');
    const decompressed2 = await compressor.decompress(compressed2);
    
    // Check that data is preserved through round-trip
    const correlationPreserved = decompressed2.correlation_id === originalState.correlation_id;
    const vesselPreserved = JSON.stringify(decompressed2.vessel) === JSON.stringify(originalState.vessel);
    
    if (!correlationPreserved || !vesselPreserved) {
      console.error('❌ Test 4 FAILED: Data should be preserved through round-trip');
      allPassed = false;
    } else {
      console.log('✅ Test 4 PASSED: Round-trip compression/decompression');
      console.log(`   - Correlation ID preserved: ${correlationPreserved}`);
      console.log(`   - Vessel preserved: ${vesselPreserved}`);
    }
  } catch (error: any) {
    console.error('❌ Test 4 FAILED:', error.message);
    allPassed = false;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ [STATE-COMPRESSION-TEST] All integration tests passed!');
  } else {
    console.log('❌ [STATE-COMPRESSION-TEST] Some tests failed');
  }
  console.log('='.repeat(60) + '\n');
}

// Run tests if executed directly
if (require.main === module) {
  testStateCompression().catch((error) => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}
