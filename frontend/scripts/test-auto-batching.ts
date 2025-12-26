/**
 * Test Automatic Batching in fetch_marine_weather Tool
 * 
 * Tests the automatic batching approach where the tool internally
 * processes positions in batches of 25, but the LLM just calls it once.
 * 
 * Run with: npx tsx frontend/scripts/test-auto-batching.ts
 */

// Load environment variables FIRST
import '../lib/multi-agent/__tests__/setup-env';

import { executeMarineWeatherTool } from '../lib/tools/marine-weather';
import { executeWeatherTimelineTool } from '../lib/tools/weather-timeline';

/**
 * Test automatic batching: Tool accepts all positions but processes in batches internally
 */
async function testAutomaticBatching() {
  console.log('🧪 Testing Automatic Batching in fetch_marine_weather Tool\n');
  console.log('='.repeat(80));
  console.log('Strategy: LLM calls tool ONCE with all positions');
  console.log('Tool internally processes in batches of 25 automatically');
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
    
    // Test: Call tool ONCE with ALL positions (simulating what LLM would do)
    console.log('📊 Testing: Call fetch_marine_weather ONCE with ALL positions');
    console.log('   The tool should automatically batch internally\n');
    
    const allPositions = vesselTimeline.map((pos: any) => ({
      lat: pos.lat,
      lon: pos.lon,
      datetime: pos.datetime
    }));
    
    console.log(`   Total positions: ${allPositions.length}`);
    console.log(`   Expected behavior: Tool processes in batches of 25 internally\n`);
    
    const startTime = Date.now();
    
    try {
      const result = await executeMarineWeatherTool({
        positions: allPositions
      });
      
      const duration = Date.now() - startTime;
      
      console.log('\n' + '='.repeat(80));
      console.log('📊 Test Results:\n');
      console.log(`   Duration: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
      console.log(`   Results: ${result.length} weather points`);
      console.log(`   Success rate: ${((result.length / allPositions.length) * 100).toFixed(1)}%`);
      
      if (result.length > 0) {
        console.log(`\n   Sample result:`);
        console.log(`      Position: ${result[0].position.lat}, ${result[0].position.lon}`);
        console.log(`      Weather: ${result[0].weather.wave_height_m}m waves, ${result[0].weather.wind_speed_knots}kt wind`);
        console.log(`      Confidence: ${result[0].forecast_confidence}`);
      }
      
      console.log('\n' + '='.repeat(80));
      
      if (duration < 30000) {
        console.log('✅ SUCCESS: Tool processed all positions quickly!');
        console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);
        console.log(`   This approach works - tool handles batching automatically`);
        console.log('\n   Next step: Implement this in the actual tool');
        process.exit(0);
      } else if (duration < 60000) {
        console.log('⚠️ PARTIAL SUCCESS: Tool processed but took longer than expected');
        console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);
        console.log(`   May need to optimize batching further`);
        process.exit(0);
      } else {
        console.log('❌ ISSUE: Tool took too long');
        console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);
        console.log(`   May need different batching strategy`);
        process.exit(1);
      }
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.log(`\n❌ Test failed:`);
      console.log(`   Duration: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
      console.log(`   Error: ${error.message}`);
      process.exit(1);
    }
    
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
testAutomaticBatching().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

