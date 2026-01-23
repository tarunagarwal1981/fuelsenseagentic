/**
 * Infrastructure Verification Script
 * 
 * Tests both Upstash Redis and Axiom connections to verify
 * the FuelSense infrastructure is properly configured.
 * 
 * Run with: npx tsx scripts/test-services.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
const envPath = resolve(process.cwd(), '.env.local');
config({ path: envPath });

import { AxiomWithoutBatching } from '@axiomhq/js';
import Redis from 'ioredis';

async function testServices() {
  console.log('🧪 Testing FuelSense Infrastructure...\n');
  console.log('='.repeat(60));

  // Test 1: Upstash Redis
  console.log('\n1️⃣ Testing Upstash Redis...');
  let redisSuccess = false;
  try {
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    
    if (!redisUrl || !redisToken) {
      console.log('⚠️  UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set, skipping Redis test');
      console.log(`   UPSTASH_REDIS_REST_URL: ${redisUrl ? '✅ Set' : '❌ Not set'}`);
      console.log(`   UPSTASH_REDIS_REST_TOKEN: ${redisToken ? '✅ Set' : '❌ Not set'}`);
    } else {
      console.log(`   Connecting to Redis...`);
      // Upstash Redis REST URL is https://<host>, need to convert to rediss://
      // Format: rediss://default:<token>@<host>:6379
      const urlObj = new URL(redisUrl);
      const host = urlObj.hostname;
      const encodedToken = encodeURIComponent(redisToken);
      const redisTcpUrl = `rediss://default:${encodedToken}@${host}:6379`;
      
      const redis = new Redis(redisTcpUrl, {
        tls: {
          rejectUnauthorized: false,
        },
      });
      
      // Test write
      const testKey = `test:timestamp:${Date.now()}`;
      const testValue = Date.now().toString();
      await redis.set(testKey, testValue);
      console.log(`   ✅ Write successful`);
      
      // Test read
      const value = await redis.get(testKey);
      console.log(`   ✅ Read successful`);
      
      // Verify value
      if (value === testValue) {
        console.log(`   ✅ Value verified: ${value}`);
        redisSuccess = true;
      } else {
        console.log(`   ⚠️  Value mismatch: expected ${testValue}, got ${value}`);
      }
      
      // Cleanup
      await redis.del(testKey);
      await redis.quit();
      console.log('   ✅ Redis connection test PASSED!');
    }
  } catch (error: any) {
    console.error('   ❌ Redis failed:', error.message);
    if (error.message?.includes('ECONNREFUSED')) {
      console.error('      → Check that UPSTASH_REDIS_REST_URL is correct');
    } else if (error.message?.includes('auth')) {
      console.error('      → Check Redis credentials');
    }
  }

  // Test 2: Axiom
  console.log('\n2️⃣ Testing Axiom...');
  let axiomSuccess = false;
  try {
    const token = process.env.AXIOM_TOKEN?.trim();
    const orgId = process.env.AXIOM_ORG_ID?.trim();
    const dataset = process.env.AXIOM_DATASET || 'fuelsense';
    
    if (!token) {
      console.log('⚠️  AXIOM_TOKEN not set, skipping Axiom test');
    } else {
      console.log(`   Dataset: ${dataset}`);
      console.log(`   Org ID: ${orgId || 'not set (optional)'}`);
      
      const axiom = new AxiomWithoutBatching({
        token,
        orgId: orgId || undefined,
        onError: (e) => {
          console.error('   ❌ Axiom client error:', e);
        },
      });
      
      const testEvent = {
        timestamp: new Date().toISOString(),
        _time: new Date().toISOString(),
        level: 'info',
        service: 'infrastructure-test',
        message: 'Test log from FuelSense infrastructure verification',
        test: true,
        correlation_id: `test-services-${Date.now()}`,
      };
      
      await axiom.ingest(dataset, [testEvent]);
      console.log('   ✅ Log ingested successfully');
      console.log(`   📊 Dataset: ${dataset}`);
      console.log(`   🔗 Correlation ID: ${testEvent.correlation_id}`);
      axiomSuccess = true;
      console.log('   ✅ Axiom connection test PASSED!');
    }
  } catch (error: any) {
    console.error('   ❌ Axiom failed:', error.message);
    if (error.message?.includes('Forbidden') || error.message?.includes('401')) {
      console.error('      → Check that AXIOM_TOKEN is valid');
      console.error('      → Verify token has "ingest" permission');
    } else if (error.message?.includes('404') || error.message?.includes('Not Found')) {
      console.error(`      → Dataset "${process.env.AXIOM_DATASET || 'fuelsense'}" may not exist`);
      console.error('      → Check AXIOM_DATASET environment variable');
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Summary:');
  console.log(`   Redis: ${redisSuccess ? '✅ PASSED' : '⚠️  SKIPPED or FAILED'}`);
  console.log(`   Axiom: ${axiomSuccess ? '✅ PASSED' : '⚠️  SKIPPED or FAILED'}`);
  
  if (redisSuccess && axiomSuccess) {
    console.log('\n🎉 All infrastructure tests PASSED!');
    console.log('\n💡 Your FuelSense infrastructure is ready to use.');
  } else {
    console.log('\n⚠️  Some tests were skipped or failed.');
    console.log('   Check the output above for details.');
  }
  console.log('\n');
}

testServices().catch((error) => {
  console.error('❌ Test script failed:', error);
  process.exit(1);
});
