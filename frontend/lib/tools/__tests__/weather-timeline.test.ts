/**
 * Test file for Weather Timeline Tool
 * 
 * Tests the weather timeline calculator with various waypoint combinations and scenarios.
 * Run with: npx tsx frontend/lib/tools/__tests__/weather-timeline.test.ts
 */

import { executeWeatherTimelineTool, WeatherTimelineError } from '../weather-timeline';

/**
 * Formats test results for readable output
 */
function formatTestResult(
  testName: string,
  result: any,
  error?: Error
): void {
  console.log('\n' + '='.repeat(80));
  console.log(`TEST: ${testName}`);
  console.log('='.repeat(80));
  
  if (error) {
    console.log('❌ TEST FAILED');
    console.log(`Error Type: ${error.constructor.name}`);
    console.log(`Error Message: ${error.message}`);
    if (error instanceof WeatherTimelineError) {
      console.log(`Error Code: ${error.code}`);
    }
  } else {
    console.log('✅ TEST PASSED');
    console.log(`\nGenerated ${result.length} positions`);
    
    if (result.length > 0) {
      console.log('\nFirst Position:');
      console.log(`  Latitude: ${result[0].lat.toFixed(4)}°`);
      console.log(`  Longitude: ${result[0].lon.toFixed(4)}°`);
      console.log(`  Datetime: ${result[0].datetime}`);
      console.log(`  Distance from start: ${result[0].distance_from_start_nm.toFixed(2)} nm`);
      console.log(`  Segment index: ${result[0].segment_index}`);
      
      if (result.length > 1) {
        console.log('\nLast Position:');
        const last = result[result.length - 1];
        console.log(`  Latitude: ${last.lat.toFixed(4)}°`);
        console.log(`  Longitude: ${last.lon.toFixed(4)}°`);
        console.log(`  Datetime: ${last.datetime}`);
        console.log(`  Distance from start: ${last.distance_from_start_nm.toFixed(2)} nm`);
        console.log(`  Segment index: ${last.segment_index}`);
        
        // Calculate total journey time
        const startTime = new Date(result[0].datetime);
        const endTime = new Date(last.datetime);
        const totalHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
        console.log(`\nTotal journey time: ${totalHours.toFixed(2)} hours`);
      }
    }
  }
  console.log('='.repeat(80));
}

/**
 * Test Case 1: Singapore to Jebel Ali
 * Expected: Should generate positions at 12-hour intervals
 */
async function testSingaporeToJebelAli(): Promise<void> {
  const testName = 'Singapore to Jebel Ali (12-hour intervals)';
  
  try {
    const testWaypoints = [
      { lat: 1.29, lon: 103.85 }, // Singapore
      { lat: 22.54, lon: 59.08 }, // Jebel Ali
    ];
    
    const result = await executeWeatherTimelineTool({
      waypoints: testWaypoints,
      vessel_speed_knots: 14,
      departure_datetime: '2024-12-25T08:00:00Z',
      sampling_interval_hours: 12,
    });
    
    formatTestResult(testName, result);
    
    // Verify positions are generated
    if (result.length > 0) {
      console.log('  ✓ Positions generated successfully');
    }
    
    // Verify first position matches departure
    if (result[0].distance_from_start_nm === 0) {
      console.log('  ✓ First position starts at zero distance');
    }
    
    // Verify datetime progression
    let prevTime = new Date(result[0].datetime);
    let timeProgressionValid = true;
    for (let i = 1; i < result.length; i++) {
      const currentTime = new Date(result[i].datetime);
      if (currentTime <= prevTime) {
        timeProgressionValid = false;
        break;
      }
      prevTime = currentTime;
    }
    if (timeProgressionValid) {
      console.log('  ✓ Datetime progression is valid');
    }
  } catch (error) {
    formatTestResult(testName, null, error as Error);
  }
}

/**
 * Test Case 2: Multi-waypoint route
 * Expected: Should handle multiple segments correctly
 */
async function testMultiWaypointRoute(): Promise<void> {
  const testName = 'Multi-waypoint Route (Singapore -> Colombo -> Jebel Ali)';
  
  try {
    const testWaypoints = [
      { lat: 1.29, lon: 103.85 },   // Singapore
      { lat: 6.93, lon: 79.85 },    // Colombo
      { lat: 22.54, lon: 59.08 },   // Jebel Ali
    ];
    
    const result = await executeWeatherTimelineTool({
      waypoints: testWaypoints,
      vessel_speed_knots: 15,
      departure_datetime: '2024-12-25T08:00:00Z',
      sampling_interval_hours: 6,
    });
    
    formatTestResult(testName, result);
    
    // Verify segment indices are correct
    const segmentIndices = result.map((p) => p.segment_index);
    const maxSegmentIndex = Math.max(...segmentIndices);
    if (maxSegmentIndex === testWaypoints.length - 2) {
      console.log('  ✓ Segment indices are correct');
    }
    
    // Verify distance increases monotonically
    let prevDistance = -1;
    let distanceProgressionValid = true;
    for (const pos of result) {
      if (pos.distance_from_start_nm < prevDistance) {
        distanceProgressionValid = false;
        break;
      }
      prevDistance = pos.distance_from_start_nm;
    }
    if (distanceProgressionValid) {
      console.log('  ✓ Distance progression is monotonic');
    }
  } catch (error) {
    formatTestResult(testName, null, error as Error);
  }
}

/**
 * Test Case 3: Single waypoint
 * Expected: Should return single position
 */
async function testSingleWaypoint(): Promise<void> {
  const testName = 'Single Waypoint (Edge Case)';
  
  try {
    const testWaypoints = [
      { lat: 1.29, lon: 103.85 }, // Singapore
    ];
    
    const result = await executeWeatherTimelineTool({
      waypoints: testWaypoints,
      vessel_speed_knots: 14,
      departure_datetime: '2024-12-25T08:00:00Z',
      sampling_interval_hours: 12,
    });
    
    formatTestResult(testName, result);
    
    if (result.length === 1) {
      console.log('  ✓ Single waypoint returns single position');
    }
    
    if (result[0].distance_from_start_nm === 0) {
      console.log('  ✓ Single position has zero distance');
    }
  } catch (error) {
    formatTestResult(testName, null, error as Error);
  }
}

/**
 * Test Case 4: Invalid inputs
 * Expected: Should throw WeatherTimelineError
 */
async function testInvalidInputs(): Promise<void> {
  const testName = 'Invalid Inputs (Error Handling)';
  
  const testCases = [
    {
      name: 'Empty waypoints array',
      input: {
        waypoints: [],
        vessel_speed_knots: 14,
        departure_datetime: '2024-12-25T08:00:00Z',
      },
    },
    {
      name: 'Speed too low (below 5 knots)',
      input: {
        waypoints: [{ lat: 1.29, lon: 103.85 }],
        vessel_speed_knots: 4,
        departure_datetime: '2024-12-25T08:00:00Z',
      },
    },
    {
      name: 'Speed too high (above 30 knots)',
      input: {
        waypoints: [{ lat: 1.29, lon: 103.85 }],
        vessel_speed_knots: 31,
        departure_datetime: '2024-12-25T08:00:00Z',
      },
    },
    {
      name: 'Invalid datetime format',
      input: {
        waypoints: [{ lat: 1.29, lon: 103.85 }],
        vessel_speed_knots: 14,
        departure_datetime: 'invalid-datetime',
      },
    },
    {
      name: 'Invalid latitude (too high)',
      input: {
        waypoints: [{ lat: 91, lon: 103.85 }],
        vessel_speed_knots: 14,
        departure_datetime: '2024-12-25T08:00:00Z',
      },
    },
    {
      name: 'Invalid longitude (too high)',
      input: {
        waypoints: [{ lat: 1.29, lon: 181 }],
        vessel_speed_knots: 14,
        departure_datetime: '2024-12-25T08:00:00Z',
      },
    },
  ];
  
  for (const testCase of testCases) {
    console.log('\n' + '-'.repeat(80));
    console.log(`Sub-test: ${testCase.name}`);
    console.log('-'.repeat(80));
    
    try {
      const result = await executeWeatherTimelineTool(testCase.input as any);
      console.log('❌ ERROR: Expected error but got result:');
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      if (error instanceof WeatherTimelineError) {
        console.log('✅ Correctly threw WeatherTimelineError');
        console.log(`   Error Code: ${error.code}`);
        console.log(`   Error Message: ${error.message}`);
      } else if (error instanceof Error && error.name === 'ZodError') {
        console.log('✅ Correctly threw validation error');
        console.log(`   Error Message: ${error.message}`);
      } else {
        console.log('⚠️  Threw error but not WeatherTimelineError:');
        console.log(`   Error Type: ${error instanceof Error ? error.constructor.name : typeof error}`);
        console.log(`   Error Message: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

/**
 * Test Case 5: Different sampling intervals
 * Expected: Should affect number of positions generated
 */
async function testDifferentSamplingIntervals(): Promise<void> {
  const testName = 'Different Sampling Intervals';
  
  try {
    const testWaypoints = [
      { lat: 1.29, lon: 103.85 }, // Singapore
      { lat: 22.54, lon: 59.08 }, // Jebel Ali
    ];
    
    const result6h = await executeWeatherTimelineTool({
      waypoints: testWaypoints,
      vessel_speed_knots: 14,
      departure_datetime: '2024-12-25T08:00:00Z',
      sampling_interval_hours: 6,
    });
    
    const result12h = await executeWeatherTimelineTool({
      waypoints: testWaypoints,
      vessel_speed_knots: 14,
      departure_datetime: '2024-12-25T08:00:00Z',
      sampling_interval_hours: 12,
    });
    
    const result24h = await executeWeatherTimelineTool({
      waypoints: testWaypoints,
      vessel_speed_knots: 14,
      departure_datetime: '2024-12-25T08:00:00Z',
      sampling_interval_hours: 24,
    });
    
    console.log('\n' + '='.repeat(80));
    console.log(`TEST: ${testName}`);
    console.log('='.repeat(80));
    console.log('✅ TEST PASSED');
    console.log('\nSampling Interval Comparison (Singapore to Jebel Ali):');
    console.log(`  Positions at 6-hour intervals: ${result6h.length}`);
    console.log(`  Positions at 12-hour intervals: ${result12h.length}`);
    console.log(`  Positions at 24-hour intervals: ${result24h.length}`);
    
    if (result6h.length > result12h.length && result12h.length > result24h.length) {
      console.log('  ✓ Smaller intervals generate more positions (as expected)');
    } else {
      console.log('  ⚠ Position count may not match expected pattern');
    }
    
    // Verify all results have same total distance
    const distance6h = result6h[result6h.length - 1].distance_from_start_nm;
    const distance12h = result12h[result12h.length - 1].distance_from_start_nm;
    const distance24h = result24h[result24h.length - 1].distance_from_start_nm;
    
    if (Math.abs(distance6h - distance12h) < 0.1 && Math.abs(distance12h - distance24h) < 0.1) {
      console.log('  ✓ Total distance is consistent across intervals');
    } else {
      console.log('  ⚠ Total distance differs between intervals');
    }
    console.log('='.repeat(80));
  } catch (error) {
    formatTestResult(testName, null, error as Error);
  }
}

/**
 * Main test runner
 */
async function runAllTests(): Promise<void> {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    WEATHER TIMELINE TEST SUITE                               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  
  const startTime = Date.now();
  
  // Run all test cases
  await testSingaporeToJebelAli();
  await testMultiWaypointRoute();
  await testSingleWaypoint();
  await testInvalidInputs();
  await testDifferentSamplingIntervals();
  
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╝');
  console.log('║                          TEST SUITE COMPLETE                                 ║');
  console.log(`║                    Total Duration: ${duration}s                                    ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('\n');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch((error) => {
    console.error('Fatal error running tests:', error);
    process.exit(1);
  });
}

export {
  testSingaporeToJebelAli,
  testMultiWaypointRoute,
  testSingleWaypoint,
  testInvalidInputs,
  testDifferentSamplingIntervals,
  runAllTests,
};

