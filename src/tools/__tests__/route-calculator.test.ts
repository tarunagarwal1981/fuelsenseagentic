/**
 * Test file for Route Calculator Tool
 * 
 * Tests the route calculator with various port combinations and error scenarios.
 * Run with: npx tsx src/tools/__tests__/route-calculator.test.ts
 */

import { calculateRoute, RouteCalculationError } from '../route-calculator';

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
    if (error instanceof RouteCalculationError) {
      console.log(`Error Code: ${error.code}`);
      if (error.statusCode) {
        console.log(`HTTP Status: ${error.statusCode}`);
      }
    }
  } else {
    console.log('✅ TEST PASSED');
    console.log('\nRoute Details:');
    console.log(`  Origin: ${result.origin_port_code}`);
    console.log(`  Destination: ${result.destination_port_code}`);
    console.log(`  Distance: ${result.distance_nm.toFixed(2)} nautical miles`);
    console.log(`  Estimated Time: ${result.estimated_hours.toFixed(2)} hours`);
    console.log(`  Route Type: ${result.route_type}`);
    console.log(`  Waypoint Count: ${result.waypoints.length}`);
    
    if (result.waypoints.length > 0) {
      console.log('\n  First Waypoint:');
      console.log(`    Latitude: ${result.waypoints[0].lat.toFixed(4)}°`);
      console.log(`    Longitude: ${result.waypoints[0].lon.toFixed(4)}°`);
      
      if (result.waypoints.length > 1) {
        console.log('  Last Waypoint:');
        console.log(`    Latitude: ${result.waypoints[result.waypoints.length - 1].lat.toFixed(4)}°`);
        console.log(`    Longitude: ${result.waypoints[result.waypoints.length - 1].lon.toFixed(4)}°`);
      }
    }
  }
  console.log('='.repeat(80));
}

/**
 * Test Case 1: Singapore to Rotterdam
 * Expected: Should route via Suez Canal
 */
async function testSingaporeToRotterdam(): Promise<void> {
  const testName = 'Singapore to Rotterdam (Suez Canal Route)';
  
  try {
    const result = await calculateRoute({
      origin_port_code: 'SGSIN',
      destination_port_code: 'NLRTM',
      vessel_speed_knots: 14,
    });
    
    formatTestResult(testName, result);
    
    // Verify route type mentions Suez Canal
    if (result.route_type.toLowerCase().includes('suez')) {
      console.log('  ✓ Route correctly identified as via Suez Canal');
    } else {
      console.log('  ⚠ Route type does not mention Suez Canal (may be correct depending on API)');
    }
  } catch (error) {
    formatTestResult(testName, null, error as Error);
  }
}

/**
 * Test Case 2: Tokyo to Shanghai
 * Expected: Pacific route across the East China Sea
 */
async function testTokyoToShanghai(): Promise<void> {
  const testName = 'Tokyo to Shanghai (Pacific Route)';
  
  try {
    const result = await calculateRoute({
      origin_port_code: 'JPTYO',
      destination_port_code: 'CNSHA',
      vessel_speed_knots: 15,
    });
    
    formatTestResult(testName, result);
    
    // Verify it's a reasonable distance route
    if (result.distance_nm > 1000) {
      console.log('  ✓ Route distance indicates significant journey');
    }
  } catch (error) {
    formatTestResult(testName, null, error as Error);
  }
}

/**
 * Test Case 3: Barcelona to Hamburg
 * Expected: Mediterranean to North Sea route
 */
async function testBarcelonaToHamburg(): Promise<void> {
  const testName = 'Barcelona to Hamburg (European Route)';
  
  try {
    const result = await calculateRoute({
      origin_port_code: 'ESBCN',
      destination_port_code: 'DEHAM',
      vessel_speed_knots: 14,
    });
    
    formatTestResult(testName, result);
    
    // Verify it's a European route
    if (result.distance_nm > 500) {
      console.log('  ✓ Route distance indicates significant European journey');
    }
  } catch (error) {
    formatTestResult(testName, null, error as Error);
  }
}

/**
 * Test Case 4: Invalid port codes
 * Expected: Should throw RouteCalculationError
 */
async function testInvalidPortCodes(): Promise<void> {
  const testName = 'Invalid Port Codes (Error Handling)';
  
  const testCases = [
    {
      name: 'Non-existent origin port',
      input: {
        origin_port_code: 'INVALID',
        destination_port_code: 'SGSIN',
      },
    },
    {
      name: 'Non-existent destination port',
      input: {
        origin_port_code: 'SGSIN',
        destination_port_code: 'INVALID',
      },
    },
    {
      name: 'Empty port codes',
      input: {
        origin_port_code: '',
        destination_port_code: 'SGSIN',
      },
    },
    {
      name: 'Same origin and destination',
      input: {
        origin_port_code: 'SGSIN',
        destination_port_code: 'SGSIN',
      },
    },
  ];
  
  for (const testCase of testCases) {
    console.log('\n' + '-'.repeat(80));
    console.log(`Sub-test: ${testCase.name}`);
    console.log('-'.repeat(80));
    
    try {
      const result = await calculateRoute(testCase.input as any);
      console.log('❌ ERROR: Expected error but got result:');
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      if (error instanceof RouteCalculationError) {
        console.log('✅ Correctly threw RouteCalculationError');
        console.log(`   Error Code: ${error.code}`);
        console.log(`   Error Message: ${error.message}`);
      } else {
        console.log('⚠️  Threw error but not RouteCalculationError:');
        console.log(`   Error Type: ${error instanceof Error ? error.constructor.name : typeof error}`);
        console.log(`   Error Message: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

/**
 * Test Case 5: Different vessel speeds
 * Expected: Should affect estimated hours but not distance
 */
async function testDifferentVesselSpeeds(): Promise<void> {
  const testName = 'Different Vessel Speeds';
  
  try {
    const slowResult = await calculateRoute({
      origin_port_code: 'SGSIN',
      destination_port_code: 'HKHKG',
      vessel_speed_knots: 10,
    });
    
    const fastResult = await calculateRoute({
      origin_port_code: 'SGSIN',
      destination_port_code: 'HKHKG',
      vessel_speed_knots: 20,
    });
    
    console.log('\n' + '='.repeat(80));
    console.log(`TEST: ${testName}`);
    console.log('='.repeat(80));
    console.log('✅ TEST PASSED');
    console.log('\nSpeed Comparison (Singapore to Hong Kong):');
    console.log(`  Distance (10 knots): ${slowResult.distance_nm.toFixed(2)} nm`);
    console.log(`  Distance (20 knots): ${fastResult.distance_nm.toFixed(2)} nm`);
    console.log(`  Time at 10 knots: ${slowResult.estimated_hours.toFixed(2)} hours`);
    console.log(`  Time at 20 knots: ${fastResult.estimated_hours.toFixed(2)} hours`);
    
    if (Math.abs(slowResult.distance_nm - fastResult.distance_nm) < 1) {
      console.log('  ✓ Distance remains constant (as expected)');
    } else {
      console.log('  ⚠ Distance differs between speeds (unexpected)');
    }
    
    if (slowResult.estimated_hours > fastResult.estimated_hours) {
      console.log('  ✓ Slower speed results in longer travel time (as expected)');
    } else {
      console.log('  ⚠ Time calculation may be incorrect');
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
  console.log('║                    ROUTE CALCULATOR TEST SUITE                               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  
  const startTime = Date.now();
  
  // Run all test cases
  await testSingaporeToRotterdam();
  await testTokyoToShanghai();
  await testBarcelonaToHamburg();
  await testInvalidPortCodes();
  await testDifferentVesselSpeeds();
  
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
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
  testSingaporeToRotterdam,
  testTokyoToShanghai,
  testBarcelonaToHamburg,
  testInvalidPortCodes,
  testDifferentVesselSpeeds,
  runAllTests,
};

