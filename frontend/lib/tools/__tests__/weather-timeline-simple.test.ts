/**
 * Simple test for Weather Timeline Tool
 * 
 * This is a simplified test that can be run manually to verify the tool works.
 * Run with: tsx frontend/lib/tools/__tests__/weather-timeline-simple.test.ts
 */

import { executeWeatherTimelineTool } from '../weather-timeline';

async function simpleTest() {
  console.log('Testing Weather Timeline Tool...\n');
  
  const testWaypoints = [
    { lat: 1.29, lon: 103.85 }, // Singapore
    { lat: 22.54, lon: 59.08 }, // Jebel Ali
  ];

  try {
    const result = await executeWeatherTimelineTool({
      waypoints: testWaypoints,
      vessel_speed_knots: 14,
      departure_datetime: '2024-12-25T08:00:00Z',
      sampling_interval_hours: 12,
    });

    console.log(`✅ Success! Generated ${result.length} positions\n`);
    
    console.log('First 3 positions:');
    result.slice(0, 3).forEach((pos, i) => {
      console.log(`  ${i + 1}. Lat: ${pos.lat.toFixed(4)}, Lon: ${pos.lon.toFixed(4)}`);
      console.log(`     Datetime: ${pos.datetime}`);
      console.log(`     Distance: ${pos.distance_from_start_nm.toFixed(2)} nm`);
      console.log(`     Segment: ${pos.segment_index}\n`);
    });
    
    if (result.length > 3) {
      console.log('Last position:');
      const last = result[result.length - 1];
      console.log(`  Lat: ${last.lat.toFixed(4)}, Lon: ${last.lon.toFixed(4)}`);
      console.log(`  Datetime: ${last.datetime}`);
      console.log(`  Distance: ${last.distance_from_start_nm.toFixed(2)} nm`);
      console.log(`  Segment: ${last.segment_index}\n`);
    }
    
    // Verify first position
    if (result[0].distance_from_start_nm === 0) {
      console.log('✅ First position starts at zero distance');
    } else {
      console.log('❌ First position should start at zero distance');
    }
    
    // Verify datetime progression
    let valid = true;
    for (let i = 1; i < result.length; i++) {
      const prev = new Date(result[i - 1].datetime);
      const curr = new Date(result[i].datetime);
      if (curr <= prev) {
        valid = false;
        break;
      }
    }
    if (valid) {
      console.log('✅ Datetime progression is valid');
    } else {
      console.log('❌ Datetime progression is invalid');
    }
    
    // Verify distance progression
    valid = true;
    for (let i = 1; i < result.length; i++) {
      if (result[i].distance_from_start_nm < result[i - 1].distance_from_start_nm) {
        valid = false;
        break;
      }
    }
    if (valid) {
      console.log('✅ Distance progression is valid');
    } else {
      console.log('❌ Distance progression is invalid');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
    }
    process.exit(1);
  }
}

simpleTest();

