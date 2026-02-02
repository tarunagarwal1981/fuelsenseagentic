/**
 * Performance Benchmark for Port API Integration
 * 
 * Measures:
 * - First call (API + cache write)
 * - Cached call performance
 * - Sequential call performance
 * - Parallel call performance
 * 
 * Run: npm run benchmark
 */

import { ServiceContainer } from '../frontend/lib/repositories/service-container';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../frontend/.env.local' });

async function benchmark() {
  console.log('⚡ Performance Benchmark\n');
  console.log('================================================\n');
  
  console.log('🔧 Initializing ServiceContainer...');
  const container = ServiceContainer.getInstance();
  const repo = container.getPortRepository();
  console.log('✅ ServiceContainer initialized\n');
  
  // Benchmark 1: First call (cold cache) - using Singapore by name
  console.log('Benchmark 1: First call (cold cache)');
  console.log('-------------------------------------');
  const start1 = Date.now();
  const singapore = await repo.findByName('Singapore');
  const time1 = Date.now() - start1;
  console.log(`⏱️  First call: ${time1}ms`);
  console.log(`   Found: ${singapore?.name} (${singapore?.code})`);
  
  if (time1 < 1000) {
    console.log('✅ EXCELLENT: < 1000ms');
  } else if (time1 < 3000) {
    console.log('✅ GOOD: < 3000ms');
  } else {
    console.log('❌ SLOW: > 3000ms');
  }
  console.log();
  
  // Benchmark 2: Second call (warm cache)
  console.log('Benchmark 2: Second call (warm cache)');
  console.log('--------------------------------------');
  const start2 = Date.now();
  await repo.findByName('Singapore');
  const time2 = Date.now() - start2;
  console.log(`⏱️  Cached call: ${time2}ms`);
  
  if (time2 < 10) {
    console.log('✅ EXCELLENT: < 10ms (cache working perfectly)');
  } else if (time2 < 50) {
    console.log('✅ GOOD: < 50ms (cache working)');
  } else if (time2 < 200) {
    console.log('⚠️  ACCEPTABLE: 50-200ms (cache might be slow)');
  } else {
    console.log('❌ SLOW: > 200ms (cache might not be working)');
  }
  console.log();
  
  // Benchmark 3: 10 sequential calls (should be cached)
  console.log('Benchmark 3: 10 sequential calls (should be cached)');
  console.log('----------------------------------------------------');
  const start3 = Date.now();
  for (let i = 0; i < 10; i++) {
    await repo.findByName('Singapore');
  }
  const time3 = Date.now() - start3;
  const avg3 = time3 / 10;
  console.log(`⏱️  10 calls total: ${time3}ms (avg: ${avg3.toFixed(1)}ms per call)`);
  
  if (avg3 < 10) {
    console.log('✅ EXCELLENT: Average < 10ms');
  } else if (avg3 < 50) {
    console.log('✅ GOOD: Average < 50ms');
  } else {
    console.log('⚠️  SLOW: Average > 50ms');
  }
  console.log();
  
  // Benchmark 4: Parallel calls (different ports)
  console.log('Benchmark 4: 5 parallel calls (different ports)');
  console.log('------------------------------------------------');
  console.log('   Testing: Singapore, Rotterdam, Mumbai, Dubai, Hong Kong');
  const start4 = Date.now();
  const parallelResults = await Promise.all([
    repo.findByName('Singapore'),
    repo.findByName('Rotterdam'),
    repo.findByName('Mumbai'),
    repo.findByName('Dubai'),
    repo.findByName('Hong Kong'),
  ]);
  const time4 = Date.now() - start4;
  const successCount = parallelResults.filter(p => p !== null).length;
  
  console.log(`⏱️  5 parallel calls: ${time4}ms`);
  console.log(`   Found: ${successCount}/5 ports`);
  
  if (time4 < 1000) {
    console.log('✅ EXCELLENT: < 1000ms (great parallelization)');
  } else if (time4 < 3000) {
    console.log('✅ GOOD: < 3000ms (acceptable parallelization)');
  } else {
    console.log('❌ SLOW: > 3000ms (poor parallelization)');
  }
  console.log();
  
  // Benchmark 5: Cache hit rate on mixed calls
  console.log('Benchmark 5: Mixed calls (10 calls, 3 unique ports)');
  console.log('----------------------------------------------------');
  const start5 = Date.now();
  await Promise.all([
    repo.findByName('Singapore'),
    repo.findByName('Rotterdam'),
    repo.findByName('Mumbai'),
    repo.findByName('Singapore'), // Repeat
    repo.findByName('Rotterdam'), // Repeat
    repo.findByName('Mumbai'),     // Repeat
    repo.findByName('Singapore'), // Repeat
    repo.findByName('Rotterdam'), // Repeat
    repo.findByName('Mumbai'),     // Repeat
    repo.findByName('Singapore'), // Repeat
  ]);
  const time5 = Date.now() - start5;
  console.log(`⏱️  10 parallel calls (3 unique): ${time5}ms`);
  
  if (time5 < 500) {
    console.log('✅ EXCELLENT: Cache deduplication working perfectly');
  } else if (time5 < 1500) {
    console.log('✅ GOOD: Cache working well');
  } else {
    console.log('⚠️  SLOW: Might be making redundant API calls');
  }
  console.log();
  
  // Summary
  console.log('================================================');
  console.log('📊 Performance Summary:');
  console.log('================================================');
  console.log(`1. First call (API):         ${time1}ms ${time1 < 3000 ? '✅' : '❌'} (target: <3000ms)`);
  console.log(`2. Cached call:              ${time2}ms ${time2 < 50 ? '✅' : time2 < 200 ? '⚠️' : '❌'} (target: <50ms)`);
  console.log(`3. Sequential avg:           ${avg3.toFixed(1)}ms ${avg3 < 50 ? '✅' : '⚠️'} (target: <50ms)`);
  console.log(`4. Parallel (5 ports):       ${time4}ms ${time4 < 3000 ? '✅' : '❌'} (target: <3000ms)`);
  console.log(`5. Mixed parallel (3 ports): ${time5}ms ${time5 < 1500 ? '✅' : '⚠️'} (target: <1500ms)`);
  console.log('================================================');
  
  // Calculate performance grade
  const metrics = [
    time1 < 3000,
    time2 < 50,
    avg3 < 50,
    time4 < 3000,
    time5 < 1500
  ];
  const passCount = metrics.filter(m => m).length;
  const grade = passCount === 5 ? 'A+' : passCount === 4 ? 'A' : passCount === 3 ? 'B' : 'C';
  
  console.log(`\n🏆 Performance Grade: ${grade}`);
  console.log(`   Passed: ${passCount}/5 metrics\n`);
  
  if (passCount >= 4) {
    console.log('✅ PASS: Performance is production-ready!');
  } else if (passCount >= 3) {
    console.log('⚠️  ACCEPTABLE: Performance is usable but could be optimized');
  } else {
    console.log('❌ NEEDS IMPROVEMENT: Performance optimization required');
  }
  
  // Recommendations
  console.log('\n💡 Performance Insights:');
  if (time1 > 2000) {
    console.log('   ⚠️  API calls are slow - consider CDN or regional endpoints');
  }
  if (time2 > 100) {
    console.log('   ⚠️  Cache is slow - verify Redis configuration and latency');
  }
  if (avg3 > 50) {
    console.log('   ⚠️  Cache hit rate might be low - check cache TTL settings');
  }
  if (time4 > time1 * 3) {
    console.log('   ⚠️  Parallel calls not optimized - might be serializing');
  }
  if (passCount >= 4) {
    console.log('   ✅ All metrics performing well - system is optimized!');
  }
  
  console.log('\n✨ Benchmark completed!');
}

benchmark()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Benchmark failed:', error);
    console.error(error.stack);
    process.exit(1);
  });
