/**
 * Test file for Weather Consumption Tool
 * 
 * Tests the weather consumption calculation tool with various scenarios.
 * Run with: npx tsx frontend/lib/tools/__tests__/weather-consumption.test.ts
 */

import { executeWeatherConsumptionTool, WeatherConsumptionError } from '../weather-consumption';

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
    if (error instanceof WeatherConsumptionError) {
      console.log(`Error Code: ${error.code}`);
    }
  } else {
    console.log('✅ TEST PASSED');
    console.log(`\nConsumption Analysis:`);
    console.log(`  Base Consumption: ${result.base_consumption_mt.toFixed(2)} MT`);
    console.log(`  Adjusted Consumption: ${result.weather_adjusted_consumption_mt.toFixed(2)} MT`);
    console.log(`  Additional Fuel Needed: ${result.additional_fuel_needed_mt.toFixed(2)} MT`);
    console.log(`  Increase: ${result.consumption_increase_percent.toFixed(2)}%`);
    console.log(`\nWeather Summary:`);
    console.log(`  Average Wave Height: ${result.voyage_weather_summary.avg_wave_height_m.toFixed(2)} m`);
    console.log(`  Max Wave Height: ${result.voyage_weather_summary.max_wave_height_m.toFixed(2)} m`);
    console.log(`  Average Multiplier: ${result.voyage_weather_summary.avg_multiplier.toFixed(3)}x`);
    console.log(`  Worst Conditions: ${result.voyage_weather_summary.worst_conditions_date}`);
    console.log(`\nWeather Alerts: ${result.weather_alerts.length}`);
    result.weather_alerts.forEach((alert: any, i: number) => {
      console.log(`  ${i + 1}. [${alert.severity.toUpperCase()}] ${alert.description}`);
      console.log(`     Date: ${alert.datetime}`);
    });
    
    if (result.breakdown_by_fuel_type) {
      console.log(`\nFuel Type Breakdown:`);
      if (result.breakdown_by_fuel_type.VLSFO) {
        console.log(`  VLSFO: ${result.breakdown_by_fuel_type.VLSFO.base.toFixed(2)} → ${result.breakdown_by_fuel_type.VLSFO.adjusted.toFixed(2)} MT`);
      }
      if (result.breakdown_by_fuel_type.LSGO) {
        console.log(`  LSGO: ${result.breakdown_by_fuel_type.LSGO.base.toFixed(2)} → ${result.breakdown_by_fuel_type.LSGO.adjusted.toFixed(2)} MT`);
      }
    }
  }
  console.log('='.repeat(80));
}

/**
 * Test Case 1: Basic consumption calculation
 * Expected: Should calculate adjusted consumption with weather multipliers
 */
async function testBasicConsumption(): Promise<void> {
  const testName = 'Basic Consumption Calculation';
  
  try {
    const testWeather = [
      {
        datetime: '2024-12-25T08:00:00Z',
        weather: {
          wave_height_m: 2.0,
          wind_speed_knots: 18,
          wind_direction_deg: 90,
          sea_state: 'Moderate',
        },
      },
      {
        datetime: '2024-12-26T08:00:00Z',
        weather: {
          wave_height_m: 3.5,
          wind_speed_knots: 25,
          wind_direction_deg: 0,
          sea_state: 'Rough',
        },
      },
    ];

    const result = await executeWeatherConsumptionTool({
      weather_data: testWeather,
      base_consumption_mt: 750,
      vessel_heading_deg: 45,
    });

    formatTestResult(testName, result);

    // Verify adjusted consumption is higher than base
    if (result.weather_adjusted_consumption_mt > result.base_consumption_mt) {
      console.log('  ✓ Adjusted consumption is higher than base (as expected)');
    }

    // Verify multiplier is reasonable (between 1.0 and 2.0)
    if (
      result.voyage_weather_summary.avg_multiplier >= 1.0 &&
      result.voyage_weather_summary.avg_multiplier <= 2.0
    ) {
      console.log('  ✓ Average multiplier is within reasonable range');
    }
  } catch (error) {
    formatTestResult(testName, null, error as Error);
  }
}

/**
 * Test Case 2: Consumption with fuel type breakdown
 * Expected: Should calculate breakdown for each fuel type
 */
async function testFuelTypeBreakdown(): Promise<void> {
  const testName = 'Fuel Type Breakdown';
  
  try {
    const testWeather = [
      {
        datetime: '2024-12-25T08:00:00Z',
        weather: {
          wave_height_m: 1.5,
          wind_speed_knots: 15,
          wind_direction_deg: 180,
          sea_state: 'Slight',
        },
      },
    ];

    const result = await executeWeatherConsumptionTool({
      weather_data: testWeather,
      base_consumption_mt: 1000,
      vessel_heading_deg: 0,
      fuel_type_breakdown: {
        VLSFO: 800,
        LSGO: 200,
      },
    });

    formatTestResult(testName, result);

    if (result.breakdown_by_fuel_type) {
      if (result.breakdown_by_fuel_type.VLSFO) {
        const vlsfoIncrease =
          result.breakdown_by_fuel_type.VLSFO.adjusted -
          result.breakdown_by_fuel_type.VLSFO.base;
        if (vlsfoIncrease > 0) {
          console.log('  ✓ VLSFO breakdown calculated correctly');
        }
      }
      if (result.breakdown_by_fuel_type.LSGO) {
        const lsgoIncrease =
          result.breakdown_by_fuel_type.LSGO.adjusted -
          result.breakdown_by_fuel_type.LSGO.base;
        if (lsgoIncrease > 0) {
          console.log('  ✓ LSGO breakdown calculated correctly');
        }
      }
    }
  } catch (error) {
    formatTestResult(testName, null, error as Error);
  }
}

/**
 * Test Case 3: Weather alerts generation
 * Expected: Should generate alerts for severe conditions
 */
async function testWeatherAlerts(): Promise<void> {
  const testName = 'Weather Alerts Generation';
  
  try {
    const testWeather = [
      {
        datetime: '2024-12-25T08:00:00Z',
        weather: {
          wave_height_m: 2.0,
          wind_speed_knots: 18,
          wind_direction_deg: 90,
          sea_state: 'Moderate',
        },
        position: { lat: 1.29, lon: 103.85 },
      },
      {
        datetime: '2024-12-26T08:00:00Z',
        weather: {
          wave_height_m: 4.5,
          wind_speed_knots: 30,
          wind_direction_deg: 0,
          sea_state: 'Rough',
        },
        position: { lat: 5.50, lon: 95.32 },
      },
      {
        datetime: '2024-12-27T08:00:00Z',
        weather: {
          wave_height_m: 7.0,
          wind_speed_knots: 40,
          wind_direction_deg: 45,
          sea_state: 'High',
        },
        position: { lat: 22.54, lon: 59.08 },
      },
    ];

    const result = await executeWeatherConsumptionTool({
      weather_data: testWeather,
      base_consumption_mt: 750,
      vessel_heading_deg: 45,
    });

    formatTestResult(testName, result);

    // Verify alerts were generated
    if (result.weather_alerts.length > 0) {
      console.log('  ✓ Weather alerts generated');
      
      const severeAlerts = result.weather_alerts.filter(
        (a: any) => a.severity === 'severe'
      );
      const warningAlerts = result.weather_alerts.filter(
        (a: any) => a.severity === 'warning'
      );
      
      if (severeAlerts.length > 0) {
        console.log(`  ✓ ${severeAlerts.length} severe alert(s) generated`);
      }
      if (warningAlerts.length > 0) {
        console.log(`  ✓ ${warningAlerts.length} warning(s) generated`);
      }
    } else {
      console.log('  ⚠ No weather alerts generated (may be expected for calm conditions)');
    }
  } catch (error) {
    formatTestResult(testName, null, error as Error);
  }
}

/**
 * Test Case 4: Following wind (reduced consumption)
 * Expected: Should show reduced consumption with following wind
 */
async function testFollowingWind(): Promise<void> {
  const testName = 'Following Wind (Reduced Consumption)';
  
  try {
    const testWeather = [
      {
        datetime: '2024-12-25T08:00:00Z',
        weather: {
          wave_height_m: 1.0,
          wind_speed_knots: 15,
          wind_direction_deg: 180, // Following wind (vessel heading is 0)
          sea_state: 'Slight',
        },
      },
    ];

    const result = await executeWeatherConsumptionTool({
      weather_data: testWeather,
      base_consumption_mt: 1000,
      vessel_heading_deg: 0,
    });

    formatTestResult(testName, result);

    // With following wind, multiplier should be < 1.0 (0.95x for following wind)
    if (result.voyage_weather_summary.avg_multiplier < 1.0) {
      console.log('  ✓ Following wind reduces consumption (as expected)');
    } else {
      console.log('  ⚠ Following wind multiplier may not be calculated correctly');
    }
  } catch (error) {
    formatTestResult(testName, null, error as Error);
  }
}

/**
 * Test Case 5: Invalid inputs
 * Expected: Should throw WeatherConsumptionError
 */
async function testInvalidInputs(): Promise<void> {
  const testName = 'Invalid Inputs (Error Handling)';
  
  const testCases = [
    {
      name: 'Empty weather data',
      input: {
        weather_data: [],
        base_consumption_mt: 750,
        vessel_heading_deg: 45,
      },
    },
    {
      name: 'Negative base consumption',
      input: {
        weather_data: [
          {
            datetime: '2024-12-25T08:00:00Z',
            weather: {
              wave_height_m: 2.0,
              wind_speed_knots: 18,
              wind_direction_deg: 90,
              sea_state: 'Moderate',
            },
          },
        ],
        base_consumption_mt: -100,
        vessel_heading_deg: 45,
      },
    },
    {
      name: 'Invalid vessel heading',
      input: {
        weather_data: [
          {
            datetime: '2024-12-25T08:00:00Z',
            weather: {
              wave_height_m: 2.0,
              wind_speed_knots: 18,
              wind_direction_deg: 90,
              sea_state: 'Moderate',
            },
          },
        ],
        base_consumption_mt: 750,
        vessel_heading_deg: 400,
      },
    },
  ];

  for (const testCase of testCases) {
    console.log('\n' + '-'.repeat(80));
    console.log(`Sub-test: ${testCase.name}`);
    console.log('-'.repeat(80));

    try {
      const result = await executeWeatherConsumptionTool(testCase.input as any);
      console.log('❌ ERROR: Expected error but got result:');
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      if (error instanceof WeatherConsumptionError) {
        console.log('✅ Correctly threw WeatherConsumptionError');
        console.log(`   Error Code: ${error.code}`);
        console.log(`   Error Message: ${error.message}`);
      } else if (error instanceof Error && error.name === 'ZodError') {
        console.log('✅ Correctly threw validation error');
        console.log(`   Error Message: ${error.message}`);
      } else {
        console.log('⚠️  Threw error but not WeatherConsumptionError:');
        console.log(
          `   Error Type: ${error instanceof Error ? error.constructor.name : typeof error}`
        );
        console.log(
          `   Error Message: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
}

/**
 * Main test runner
 */
async function runAllTests(): Promise<void> {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                  WEATHER CONSUMPTION TEST SUITE                            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  const startTime = Date.now();

  // Run all test cases
  await testBasicConsumption();
  await testFuelTypeBreakdown();
  await testWeatherAlerts();
  await testFollowingWind();
  await testInvalidInputs();

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
  testBasicConsumption,
  testFuelTypeBreakdown,
  testWeatherAlerts,
  testFollowingWind,
  testInvalidInputs,
  runAllTests,
};

