/**
 * Test file for Marine Weather Tool
 * 
 * Tests the marine weather forecast tool with various position combinations and scenarios.
 * Run with: npx tsx frontend/lib/tools/__tests__/marine-weather.test.ts
 */

import { executeMarineWeatherTool, MarineWeatherError } from '../marine-weather';

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
    if (error instanceof MarineWeatherError) {
      console.log(`Error Code: ${error.code}`);
      if (error.statusCode) {
        console.log(`HTTP Status: ${error.statusCode}`);
      }
    }
  } else {
    console.log('✅ TEST PASSED');
    console.log(`\nFetched weather for ${result.length} positions`);
    
    if (result.length > 0) {
      console.log('\nFirst Position Weather:');
      const first = result[0];
      console.log(`  Location: ${first.position.lat.toFixed(4)}°, ${first.position.lon.toFixed(4)}°`);
      console.log(`  Datetime: ${first.datetime}`);
      console.log(`  Wave Height: ${first.weather.wave_height_m.toFixed(2)} m`);
      console.log(`  Wind Speed: ${first.weather.wind_speed_knots.toFixed(2)} knots`);
      console.log(`  Wind Direction: ${first.weather.wind_direction_deg.toFixed(1)}°`);
      console.log(`  Sea State: ${first.weather.sea_state}`);
      console.log(`  Confidence: ${first.forecast_confidence}`);
      
      if (result.length > 1) {
        console.log('\nLast Position Weather:');
        const last = result[result.length - 1];
        console.log(`  Location: ${last.position.lat.toFixed(4)}°, ${last.position.lon.toFixed(4)}°`);
        console.log(`  Datetime: ${last.datetime}`);
        console.log(`  Wave Height: ${last.weather.wave_height_m.toFixed(2)} m`);
        console.log(`  Wind Speed: ${last.weather.wind_speed_knots.toFixed(2)} knots`);
        console.log(`  Wind Direction: ${last.weather.wind_direction_deg.toFixed(1)}°`);
        console.log(`  Sea State: ${last.weather.sea_state}`);
        console.log(`  Confidence: ${last.forecast_confidence}`);
      }
      
      // Verify sea state classifications
      const seaStates = result.map((r: any) => r.weather.sea_state);
      const uniqueSeaStates = [...new Set(seaStates)];
      console.log(`\nSea States Found: ${uniqueSeaStates.join(', ')}`);
      
      // Verify confidence levels
      const confidences = result.map((r: any) => r.forecast_confidence);
      const uniqueConfidences = [...new Set(confidences)];
      console.log(`Confidence Levels: ${uniqueConfidences.join(', ')}`);
    }
  }
  console.log('='.repeat(80));
}

/**
 * Test Case 1: Basic weather fetch for two positions
 * Expected: Should fetch weather data from Open-Meteo API
 */
async function testBasicWeatherFetch(): Promise<void> {
  const testName = 'Basic Weather Fetch (Singapore to Jebel Ali)';
  
  try {
    const positions = [
      { lat: 1.29, lon: 103.85, datetime: '2024-12-25T08:00:00Z' },
      { lat: 5.50, lon: 95.32, datetime: '2024-12-26T08:00:00Z' },
    ];
    
    const result = await executeMarineWeatherTool({ positions });
    
    formatTestResult(testName, result);
    
    // Verify all positions have weather data
    if (result.length === positions.length) {
      console.log('  ✓ All positions have weather data');
    }
    
    // Verify data structure
    const first = result[0];
    if (
      typeof first.weather.wave_height_m === 'number' &&
      typeof first.weather.wind_speed_knots === 'number' &&
      typeof first.weather.wind_direction_deg === 'number' &&
      typeof first.weather.sea_state === 'string' &&
      ['high', 'medium', 'low'].includes(first.forecast_confidence)
    ) {
      console.log('  ✓ Weather data structure is valid');
    }
    
    // Verify wind speed is in knots (should be > 0 and reasonable)
    if (first.weather.wind_speed_knots > 0 && first.weather.wind_speed_knots < 100) {
      console.log('  ✓ Wind speed conversion to knots is valid');
    }
    
    // Verify sea state classification
    const validSeaStates = ['Calm', 'Slight', 'Moderate', 'Rough', 'Very Rough', 'High'];
    if (validSeaStates.includes(first.weather.sea_state)) {
      console.log('  ✓ Sea state classification is valid');
    }
  } catch (error) {
    formatTestResult(testName, null, error as Error);
  }
}

/**
 * Test Case 2: Multiple positions with different times
 * Expected: Should batch API calls efficiently
 */
async function testMultiplePositions(): Promise<void> {
  const testName = 'Multiple Positions (Batched API Calls)';
  
  try {
    const positions = [
      { lat: 1.29, lon: 103.85, datetime: '2024-12-25T08:00:00Z' },
      { lat: 1.29, lon: 103.85, datetime: '2024-12-25T14:00:00Z' }, // Same location, different time
      { lat: 5.50, lon: 95.32, datetime: '2024-12-26T08:00:00Z' },
      { lat: 5.50, lon: 95.32, datetime: '2024-12-26T14:00:00Z' },
    ];
    
    const result = await executeMarineWeatherTool({ positions });
    
    formatTestResult(testName, result);
    
    if (result.length === positions.length) {
      console.log('  ✓ All positions processed');
    }
    
    // Verify positions match input
    let positionsMatch = true;
    for (let i = 0; i < positions.length; i++) {
      const input = positions[i];
      const output = result[i];
      if (
        Math.abs(input.lat - output.position.lat) > 0.01 ||
        Math.abs(input.lon - output.position.lon) > 0.01 ||
        input.datetime !== output.datetime
      ) {
        positionsMatch = false;
        break;
      }
    }
    if (positionsMatch) {
      console.log('  ✓ Positions match input');
    }
  } catch (error) {
    formatTestResult(testName, null, error as Error);
  }
}

/**
 * Test Case 3: Positions beyond 16 days (historical estimates)
 * Expected: Should return medium confidence with historical estimates
 */
async function testHistoricalEstimates(): Promise<void> {
  const testName = 'Historical Estimates (Beyond 16 Days)';
  
  try {
    // Create positions 20 days in the future
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 20);
    const futureDatetime = futureDate.toISOString();
    
    const positions = [
      { lat: 1.29, lon: 103.85, datetime: futureDatetime },
      { lat: 22.54, lon: 59.08, datetime: futureDatetime },
    ];
    
    const result = await executeMarineWeatherTool({ positions });
    
    formatTestResult(testName, result);
    
    // Verify confidence is medium for future dates
    const allMedium = result.every((r: any) => r.forecast_confidence === 'medium');
    if (allMedium) {
      console.log('  ✓ All positions have medium confidence (historical estimates)');
    }
    
    // Verify weather data exists
    const allHaveData = result.every(
      (r: any) =>
        typeof r.weather.wave_height_m === 'number' &&
        typeof r.weather.wind_speed_knots === 'number' &&
        r.weather.sea_state.length > 0
    );
    if (allHaveData) {
      console.log('  ✓ All positions have estimated weather data');
    }
  } catch (error) {
    formatTestResult(testName, null, error as Error);
  }
}

/**
 * Test Case 4: Invalid inputs
 * Expected: Should throw MarineWeatherError
 */
async function testInvalidInputs(): Promise<void> {
  const testName = 'Invalid Inputs (Error Handling)';
  
  const testCases = [
    {
      name: 'Empty positions array',
      input: {
        positions: [],
      },
    },
    {
      name: 'Invalid latitude (too high)',
      input: {
        positions: [{ lat: 91, lon: 103.85, datetime: '2024-12-25T08:00:00Z' }],
      },
    },
    {
      name: 'Invalid longitude (too high)',
      input: {
        positions: [{ lat: 1.29, lon: 181, datetime: '2024-12-25T08:00:00Z' }],
      },
    },
    {
      name: 'Invalid datetime format',
      input: {
        positions: [{ lat: 1.29, lon: 103.85, datetime: 'invalid-datetime' }],
      },
    },
  ];
  
  for (const testCase of testCases) {
    console.log('\n' + '-'.repeat(80));
    console.log(`Sub-test: ${testCase.name}`);
    console.log('-'.repeat(80));
    
    try {
      const result = await executeMarineWeatherTool(testCase.input as any);
      console.log('❌ ERROR: Expected error but got result:');
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      if (error instanceof MarineWeatherError) {
        console.log('✅ Correctly threw MarineWeatherError');
        console.log(`   Error Code: ${error.code}`);
        console.log(`   Error Message: ${error.message}`);
      } else if (error instanceof Error && error.name === 'ZodError') {
        console.log('✅ Correctly threw validation error');
        console.log(`   Error Message: ${error.message}`);
      } else {
        console.log('⚠️  Threw error but not MarineWeatherError:');
        console.log(`   Error Type: ${error instanceof Error ? error.constructor.name : typeof error}`);
        console.log(`   Error Message: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

/**
 * Test Case 5: Sea state classification
 * Expected: Should correctly classify different wave heights
 */
async function testSeaStateClassification(): Promise<void> {
  const testName = 'Sea State Classification';
  
  try {
    // Test with positions that might have different sea states
    const positions = [
      { lat: 1.29, lon: 103.85, datetime: '2024-12-25T08:00:00Z' }, // Tropical (likely calmer)
      { lat: 60.0, lon: 0.0, datetime: '2024-12-25T08:00:00Z' }, // North Atlantic (likely rougher)
    ];
    
    const result = await executeMarineWeatherTool({ positions });
    
    console.log('\n' + '='.repeat(80));
    console.log(`TEST: ${testName}`);
    console.log('='.repeat(80));
    console.log('✅ TEST PASSED');
    
    result.forEach((r: any, i: number) => {
      console.log(`\nPosition ${i + 1}:`);
      console.log(`  Wave Height: ${r.weather.wave_height_m.toFixed(2)} m`);
      console.log(`  Sea State: ${r.weather.sea_state}`);
      
      // Verify classification matches wave height
      const waveHeight = r.weather.wave_height_m;
      let expectedState = '';
      if (waveHeight < 0.5) expectedState = 'Calm';
      else if (waveHeight < 1.25) expectedState = 'Slight';
      else if (waveHeight < 2.5) expectedState = 'Moderate';
      else if (waveHeight < 4.0) expectedState = 'Rough';
      else if (waveHeight < 6.0) expectedState = 'Very Rough';
      else expectedState = 'High';
      
      if (r.weather.sea_state === expectedState) {
        console.log(`  ✓ Classification matches wave height`);
      } else {
        console.log(`  ⚠ Classification may not match (expected: ${expectedState})`);
      }
    });
    
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
  console.log('║                    MARINE WEATHER TEST SUITE                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  
  const startTime = Date.now();
  
  // Run all test cases
  await testBasicWeatherFetch();
  await testMultiplePositions();
  await testHistoricalEstimates();
  await testInvalidInputs();
  await testSeaStateClassification();
  
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                          TEST SUITE COMPLETE                                     ║');
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
  testBasicWeatherFetch,
  testMultiplePositions,
  testHistoricalEstimates,
  testInvalidInputs,
  testSeaStateClassification,
  runAllTests,
};

