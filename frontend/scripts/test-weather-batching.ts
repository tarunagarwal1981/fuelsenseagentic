/**
 * Test Weather API Batching Strategy
 * 
 * Tests fetching weather data in batches of 25 positions at a time
 * instead of sending all positions at once to the LLM.
 * 
 * Run with: npx tsx frontend/scripts/test-weather-batching.ts
 */

// Load environment variables FIRST
import '../lib/multi-agent/__tests__/setup-env';

import { executeMarineWeatherTool } from '../lib/tools/marine-weather';
import { executeWeatherTimelineTool } from '../lib/tools/weather-timeline';

/**
 * Test batching strategy: Process positions in batches of 25
 */
async function testBatchingStrategy() {
  console.log('🧪 Testing Weather API Batching Strategy\n');
  console.log('='.repeat(80));
  
  try {
    // Load cached route for Singapore to Rotterdam
    const cachedRoutesModule = await import('../lib/data/cached-routes.json');
    const cachedRoutes = cachedRoutesModule.default || cachedRoutesModule;
    const route = cachedRoutes.routes.find((r: any) => r.id === 'SGSIN-NLRTM');
    
    if (!route) {
      throw new Error('Cached route SGSIN-NLRTM not found');
    }
  
    console.log(`✅ Loaded cached route: ${route.origin_name} → ${route.destination_name}`);
    console.log(`   Waypoints: ${route.waypoints.length}`);
    
    // Calculate vessel timeline
    console.log('\n⏱️ Calculating vessel timeline...');
    const vesselTimeline = await executeWeatherTimelineTool({
      waypoints: route.waypoints,
      vessel_speed_knots: 14,
      departure_datetime: '2024-12-25T08:00:00Z',
      sampling_interval_hours: 12
    });
    
    console.log(`✅ Vessel timeline calculated: ${vesselTimeline.length} positions\n`);
    
    // Test Strategy 1: Send all positions at once (current approach)
    console.log('📊 Strategy 1: Send ALL positions at once (current approach)');
    console.log('='.repeat(80));
    const strategy1Start = Date.now();
    
    try {
      const allAtOnceResult = await executeMarineWeatherTool({
        positions: vesselTimeline.map((pos: any) => ({
          lat: pos.lat,
          lon: pos.lon,
          datetime: pos.datetime
        }))
      });
      
      const strategy1Duration = Date.now() - strategy1Start;
      console.log(`✅ Strategy 1 completed:`);
      console.log(`   Duration: ${strategy1Duration}ms (${(strategy1Duration / 1000).toFixed(2)}s)`);
      console.log(`   Results: ${allAtOnceResult.length} weather points`);
      console.log(`   Success rate: ${((allAtOnceResult.length / vesselTimeline.length) * 100).toFixed(1)}%`);
    } catch (error: any) {
      const strategy1Duration = Date.now() - strategy1Start;
      console.log(`❌ Strategy 1 failed:`);
      console.log(`   Duration: ${strategy1Duration}ms (${(strategy1Duration / 1000).toFixed(2)}s)`);
      console.log(`   Error: ${error.message}`);
    }
    
    // Test Strategy 2: Batch positions in groups of 25
    console.log('\n📊 Strategy 2: Batch positions in groups of 25');
    console.log('='.repeat(80));
    const strategy2Start = Date.now();
    const BATCH_SIZE = 25;
    
    const allPositions = vesselTimeline.map((pos: any) => ({
      lat: pos.lat,
      lon: pos.lon,
      datetime: pos.datetime
    }));
    
    const batches: typeof allPositions[] = [];
    for (let i = 0; i < allPositions.length; i += BATCH_SIZE) {
      batches.push(allPositions.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`   Total positions: ${allPositions.length}`);
    console.log(`   Batch size: ${BATCH_SIZE}`);
    console.log(`   Number of batches: ${batches.length}`);
    
    const batchedResults: any[] = [];
    let batchSuccessCount = 0;
    let batchFailureCount = 0;
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchStart = Date.now();
      
      console.log(`\n   Processing batch ${i + 1}/${batches.length} (${batch.length} positions)...`);
      
      try {
        const batchResult = await executeMarineWeatherTool({
          positions: batch
        });
        
        const batchDuration = Date.now() - batchStart;
        batchedResults.push(...batchResult);
        batchSuccessCount++;
        
        console.log(`   ✅ Batch ${i + 1} completed: ${batchResult.length} results in ${batchDuration}ms`);
      } catch (error: any) {
        const batchDuration = Date.now() - batchStart;
        batchFailureCount++;
        console.log(`   ❌ Batch ${i + 1} failed: ${error.message} (${batchDuration}ms)`);
        
        // Continue with next batch even if one fails
      }
      
      // Small delay between batches to avoid rate limiting
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
      }
    }
    
    const strategy2Duration = Date.now() - strategy2Start;
    
    console.log('\n✅ Strategy 2 completed:');
    console.log(`   Total duration: ${strategy2Duration}ms (${(strategy2Duration / 1000).toFixed(2)}s)`);
    console.log(`   Total results: ${batchedResults.length} weather points`);
    console.log(`   Success rate: ${((batchedResults.length / vesselTimeline.length) * 100).toFixed(1)}%`);
    console.log(`   Successful batches: ${batchSuccessCount}/${batches.length}`);
    console.log(`   Failed batches: ${batchFailureCount}/${batches.length}`);
    
    // Comparison
    console.log('\n' + '='.repeat(80));
    console.log('📊 Comparison:\n');
    console.log(`   Strategy 1 (all at once):`);
    console.log(`      - Would send ${vesselTimeline.length} positions to LLM`);
    console.log(`      - LLM processes large JSON payload`);
    console.log(`      - Single API call with many positions`);
    console.log(`\n   Strategy 2 (batched 25 at a time):`);
    console.log(`      - Sends ${BATCH_SIZE} positions per batch to LLM`);
    console.log(`      - LLM processes smaller JSON payloads`);
    console.log(`      - Multiple API calls with fewer positions each`);
    console.log(`      - More resilient (one batch failure doesn't stop others)`);
    
    console.log('\n' + '='.repeat(80));
    console.log('💡 Recommendation:');
    
    if (batchedResults.length >= allPositions.length * 0.8) {
      console.log('✅ Batching strategy works well!');
      console.log('   - Reduces LLM processing time per call');
      console.log('   - More resilient to failures');
      console.log('   - Better error handling');
      console.log('\n   Implementation: Modify weather agent to:');
      console.log('   1. Split vessel_timeline into batches of 25');
      console.log('   2. Call fetch_marine_weather for each batch');
      console.log('   3. Combine results');
      console.log('   4. Continue to calculate_weather_consumption with combined results');
    } else {
      console.log('⚠️ Batching strategy needs improvement');
      console.log('   - Some batches failed');
      console.log('   - May need to adjust batch size or retry logic');
    }
    
    process.exit(0);
    
  } catch (error: any) {
    console.error('\n❌ Test Error:');
    console.error(`   ${error.message}`);
    if (error.stack) {
      console.error(`   ${error.stack.split('\n').slice(1, 3).join('\n')}`);
    }
    process.exit(1);
  }
}

// Run test
testBatchingStrategy().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

