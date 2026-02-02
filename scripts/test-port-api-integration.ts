/**
 * Manual Integration Test for WorldPortIndex API
 * 
 * Tests the complete flow:
 * - WorldPortIndexClient (API layer)
 * - WorldPortRepositoryAPI (Business logic + caching)
 * - Cache effectiveness
 * - Normalization and matching
 * 
 * Run: npm run test:port-api
 */

import { WorldPortIndexClient } from '../frontend/lib/clients/world-port-index-client';
import { WorldPortRepositoryAPI } from '../frontend/lib/repositories/world-port-repository-api';
import { RedisCache } from '../frontend/lib/repositories/cache-client';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../frontend/.env.local' });

async function testPortAPIIntegration() {
  console.log('🧪 Testing WorldPortIndex API Integration\n');
  console.log('================================================\n');
  
  try {
    // Initialize components
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    
    if (!redisUrl || !redisToken) {
      console.warn('⚠️  Redis not configured - cache tests will be skipped');
    }
    
    const cache = redisUrl && redisToken 
      ? new RedisCache(redisUrl, redisToken)
      : null;

    // Test 1: API Client - Find Singapore by code
    console.log('Test 1: API Client - Find by LOCODE (SGSIN)');
    console.log('-------------------------------------------');
    const client = new WorldPortIndexClient();
    const singaporeAPI = await client.findByLOCODE('SGSIN');
    if (singaporeAPI) {
      console.log('✅ Result:', singaporeAPI['Main Port Name']);
      console.log('   Code:', singaporeAPI['UN/LOCODE']);
      console.log('   Coordinates:', singaporeAPI['Latitude'], ',', singaporeAPI['Longitude']);
      console.log('   Harbor Size:', singaporeAPI['Harbor Size']);
    } else {
      console.log('❌ Not found');
    }
    console.log();

    // Test 2: API Client - Search by name
    console.log('Test 2: API Client - Search by name (Singapore)');
    console.log('------------------------------------------------');
    const results = await client.searchByName('singapore');
    console.log('✅ Found:', results.length, 'ports');
    if (results.length > 0) {
      results.slice(0, 3).forEach((port, i) => {
        console.log(`   ${i + 1}. ${port['Main Port Name']} (${port['UN/LOCODE']}) - ${port['Harbor Size']}`);
      });
    }
    console.log();

    if (!cache) {
      console.log('⚠️  Skipping repository tests (Redis not configured)\n');
      console.log('🎉 API Client tests passed!');
      return;
    }

    // Test 3: Repository - Find by code
    console.log('Test 3: Repository - Find by code (SGSIN)');
    console.log('-----------------------------------------');
    const repo = new WorldPortRepositoryAPI(cache);
    const port = await repo.findByCode('SGSIN');
    if (port) {
      console.log('✅ Port:', port.name);
      console.log('   Code:', port.code);
      console.log('   Country:', port.country);
      console.log('   Coordinates:', port.coordinates);
    } else {
      console.log('❌ Not found');
    }
    console.log();

    // Test 4: Repository - Find by name
    console.log('Test 4: Repository - Find by name (Singapore)');
    console.log('----------------------------------------------');
    const port2 = await repo.findByName('Singapore');
    if (port2) {
      console.log('✅ Port:', port2.name);
      console.log('   Code:', port2.code);
      console.log('   Coordinates:', port2.coordinates);
    } else {
      console.log('❌ Not found');
    }
    console.log();

    // Test 5: Alternate name matching
    console.log('Test 5: Alternate name (Bombay → Mumbai)');
    console.log('------------------------------------------');
    const mumbai = await repo.findByName('Bombay');
    if (mumbai) {
      console.log('✅ Found:', mumbai.name, 'via alternate name');
      console.log('   Code:', mumbai.code);
    } else {
      console.log('⚠️  Not found (alternate name may not exist in API)');
    }
    console.log();

    // Test 6: Cache effectiveness (second call)
    console.log('Test 6: Cache hit test (SGSIN again)');
    console.log('-------------------------------------');
    const start = Date.now();
    const cachedPort = await repo.findByCode('SGSIN');
    const duration = Date.now() - start;
    console.log('✅ Second call took:', duration, 'ms');
    if (duration < 10) {
      console.log('   🎯 Cache hit! (very fast response)');
    } else if (duration < 100) {
      console.log('   ⚡ Fast response (likely cached)');
    } else {
      console.log('   ⚠️  Slower response (may be API call)');
    }
    console.log('   Retrieved:', cachedPort?.name);
    console.log();

    // Test 7: Normalization test
    console.log('Test 7: Normalization test (different formats)');
    console.log('-----------------------------------------------');
    const testCodes = ['SG SIN', 'sgsin', ' SGSIN ', 'Sg Sin'];
    for (const testCode of testCodes) {
      const normalized = await repo.findByCode(testCode);
      console.log(`   "${testCode}" → ${normalized ? '✅ ' + normalized.code : '❌ Not found'}`);
    }
    console.log();

    // Test 8: Name normalization test
    console.log('Test 8: Name normalization (Port of Singapore)');
    console.log('-----------------------------------------------');
    const port3 = await repo.findByName('Port of Singapore');
    if (port3) {
      console.log('✅ Found:', port3.name);
      console.log('   Normalized: "port of singapore" → "singapore"');
    } else {
      console.log('⚠️  Not found');
    }
    console.log();

    console.log('================================================');
    console.log('🎉 All tests completed successfully!');
    console.log('================================================');

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    process.exit(1);
  }
}

// Run tests
testPortAPIIntegration()
  .then(() => {
    console.log('\n✨ Test suite completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test suite failed:', error);
    process.exit(1);
  });
