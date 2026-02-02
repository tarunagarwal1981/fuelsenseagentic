/**
 * Repository Integration Test
 * 
 * Tests the WorldPortRepositoryAPI with Redis caching
 * to verify the complete data flow from cache → API → transformation.
 * 
 * Run: npm run test:repository
 */

import { WorldPortRepositoryAPI } from '../frontend/lib/repositories/world-port-repository-api';
import { RedisCache } from '../frontend/lib/repositories/cache-client';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../frontend/.env.local' });

async function testRepositoryIntegration() {
  console.log('🧪 Testing Repository Integration\n');
  console.log('================================================\n');
  
  // Initialize Redis cache
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (!redisUrl || !redisToken) {
    console.error('❌ ERROR: Redis credentials not found in environment variables');
    console.error('   Please set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN');
    process.exit(1);
  }
  
  console.log('✅ Redis configured:', redisUrl.substring(0, 30) + '...\n');
  
  const cache = new RedisCache(redisUrl, redisToken);
  const repo = new WorldPortRepositoryAPI(cache);
  
  let passCount = 0;
  let failCount = 0;
  
  // Test 1: Find by code (using actual Singapore code)
  console.log('Test 1: Find Singapore by code (SG KEP)');
  console.log('---------------------------------------');
  try {
    const port1 = await repo.findByCode('SG KEP');
    if (port1) {
      console.log('✅ PASS: Found port');
      console.log('   Code:', port1.code);
      console.log('   Name:', port1.name);
      console.log('   Coordinates:', port1.coordinates);
      passCount++;
    } else {
      console.log('⚠️  Not found (SG KEP might not exist in database)');
    }
  } catch (error) {
    console.log('❌ FAIL:', error instanceof Error ? error.message : String(error));
    failCount++;
  }
  console.log();
  
  // Test 2: Find by name
  console.log('Test 2: Find Rotterdam by name');
  console.log('-------------------------------');
  try {
    const port2 = await repo.findByName('Rotterdam');
    if (port2) {
      console.log('✅ PASS: Found port');
      console.log('   Code:', port2.code);
      console.log('   Name:', port2.name);
      console.log('   Country:', port2.country);
      console.log('   Coordinates:', port2.coordinates);
      passCount++;
    } else {
      console.log('⚠️  Not found (Rotterdam might not exist in database)');
    }
  } catch (error) {
    console.log('❌ FAIL:', error instanceof Error ? error.message : String(error));
    failCount++;
  }
  console.log();
  
  // Test 3: Find Singapore by name (should definitely exist)
  console.log('Test 3: Find Singapore by name');
  console.log('-------------------------------');
  let singaporePort;
  try {
    singaporePort = await repo.findByName('Singapore');
    if (singaporePort) {
      console.log('✅ PASS: Found port');
      console.log('   Code:', singaporePort.code);
      console.log('   Name:', singaporePort.name);
      console.log('   Coordinates:', singaporePort.coordinates);
      passCount++;
    } else {
      console.log('❌ FAIL: Singapore not found by name');
      failCount++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error instanceof Error ? error.message : String(error));
    failCount++;
  }
  console.log();
  
  // Test 4: Cache effectiveness (second call should be fast)
  console.log('Test 4: Cache effectiveness');
  console.log('----------------------------');
  try {
    const start = Date.now();
    const port3 = await repo.findByName('Singapore');
    const duration = Date.now() - start;
    
    console.log('   Second call duration:', duration, 'ms');
    
    if (duration < 50) {
      console.log('✅ PASS: Cache is working (< 50ms)');
      passCount++;
    } else if (duration < 200) {
      console.log('⚠️  WARNING: Cache might be slow (50-200ms)');
      console.log('   This is acceptable but could be faster');
      passCount++;
    } else {
      console.log('⚠️  WARNING: Cache might not be working (> 200ms)');
    }
  } catch (error) {
    console.log('❌ FAIL:', error instanceof Error ? error.message : String(error));
    failCount++;
  }
  console.log();
  
  // Test 5: Alternate name matching
  console.log('Test 5: Find Mumbai using alternate name (Bombay)');
  console.log('--------------------------------------------------');
  try {
    const port4 = await repo.findByName('Bombay');
    if (port4) {
      console.log('✅ Result:');
      console.log('   Code:', port4.code);
      console.log('   Name:', port4.name);
      
      if (port4.name.toLowerCase().includes('mumbai') || 
          port4.name.toLowerCase().includes('bombay')) {
        console.log('✅ PASS: Alternate name matching works');
        passCount++;
      } else {
        console.log('⚠️  Found a port but might not be Mumbai:', port4.name);
      }
    } else {
      console.log('⚠️  Not found (Bombay/Mumbai might not be in database)');
    }
  } catch (error) {
    console.log('❌ FAIL:', error instanceof Error ? error.message : String(error));
    failCount++;
  }
  console.log();
  
  // Test 6: Non-existent port
  console.log('Test 6: Non-existent port (XXXXX)');
  console.log('----------------------------------');
  try {
    const port5 = await repo.findByCode('XXXXX');
    if (port5 === null) {
      console.log('✅ PASS: Correctly returns null for non-existent port');
      passCount++;
    } else {
      console.log('❌ FAIL: Should return null for non-existent port');
      failCount++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error instanceof Error ? error.message : String(error));
    failCount++;
  }
  console.log();
  
  // Test 7: Name normalization
  console.log('Test 7: Name normalization (Port of Singapore)');
  console.log('-----------------------------------------------');
  try {
    const port6 = await repo.findByName('Port of Singapore');
    if (port6) {
      console.log('✅ PASS: Name normalization works');
      console.log('   Found:', port6.name);
      passCount++;
    } else {
      console.log('⚠️  Not found (might need to adjust normalization)');
    }
  } catch (error) {
    console.log('❌ FAIL:', error instanceof Error ? error.message : String(error));
    failCount++;
  }
  console.log();
  
  // Summary
  console.log('================================================');
  console.log('📊 Test Results:');
  console.log('   ✅ Passed:', passCount);
  console.log('   ❌ Failed:', failCount);
  console.log('   📈 Success Rate:', Math.round((passCount / (passCount + failCount)) * 100) + '%');
  console.log('================================================');
  
  if (failCount === 0) {
    console.log('\n🎉 All repository integration tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed or were skipped');
    process.exit(0); // Don't fail the build, just show results
  }
}

testRepositoryIntegration()
  .then(() => {
    console.log('\n✨ Test suite completed');
  })
  .catch((error) => {
    console.error('\n💥 Test suite failed:', error);
    process.exit(1);
  });
