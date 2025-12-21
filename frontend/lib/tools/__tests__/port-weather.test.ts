/**
 * Test file for Port Weather Tool
 * 
 * Tests the port weather check tool with various port scenarios.
 * Run with: npx tsx frontend/lib/tools/__tests__/port-weather.test.ts
 */

import { executePortWeatherTool, PortWeatherError } from '../port-weather';

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
    if (error instanceof PortWeatherError) {
      console.log(`Error Code: ${error.code}`);
      if (error.statusCode) {
        console.log(`HTTP Status: ${error.statusCode}`);
      }
    }
  } else {
    console.log('✅ TEST PASSED');
    console.log(`\nChecked ${result.length} port(s)`);
    
    result.forEach((port: any, i: number) => {
      console.log(`\nPort ${i + 1}: ${port.port_name} (${port.port_code})`);
      console.log(`  Bunkering Feasible: ${port.bunkering_feasible ? '✅ Yes' : '❌ No'}`);
      console.log(`  Weather Risk: ${port.weather_risk}`);
      console.log(`  Conditions: ${port.weather_during_bunkering.conditions}`);
      console.log(`  Arrival: ${port.weather_during_bunkering.arrival_time}`);
      console.log(`  Bunkering Window: ${port.weather_during_bunkering.bunkering_window_hours} hours`);
      console.log(`  Avg Wave Height: ${port.weather_during_bunkering.avg_wave_height_m.toFixed(2)} m`);
      console.log(`  Max Wave Height: ${port.weather_during_bunkering.max_wave_height_m.toFixed(2)} m`);
      console.log(`  Avg Wind Speed: ${port.weather_during_bunkering.avg_wind_speed_kt.toFixed(1)} kt`);
      console.log(`  Max Wind Speed: ${port.weather_during_bunkering.max_wind_speed_kt.toFixed(1)} kt`);
      console.log(`  Recommendation: ${port.recommendation}`);
      if (port.next_good_window) {
        console.log(`  Next Good Window: ${port.next_good_window.starts_at} (${port.next_good_window.duration_hours}h)`);
      }
    });
  }
  console.log('='.repeat(80));
}

/**
 * Test Case 1: Basic port weather check
 * Expected: Should check weather conditions for bunkering
 */
async function testBasicPortCheck(): Promise<void> {
  const testName = 'Basic Port Weather Check (Jebel Ali)';
  
  try {
    const testPorts = [
      {
        port_code: 'AEJEA',
        port_name: 'Jebel Ali',
        lat: 25.02,
        lon: 55.03,
        estimated_arrival: '2024-12-28T14:00:00Z',
        bunkering_duration_hours: 8,
      },
    ];

    const result = await executePortWeatherTool({ bunker_ports: testPorts });

    formatTestResult(testName, result);

    // Verify result structure
    if (result.length === testPorts.length) {
      console.log('  ✓ All ports processed');
    }

    const first = result[0];
    if (
      typeof first.bunkering_feasible === 'boolean' &&
      ['Low', 'Medium', 'High'].includes(first.weather_risk) &&
      typeof first.weather_during_bunkering.avg_wave_height_m === 'number'
    ) {
      console.log('  ✓ Result structure is valid');
    }

    // Verify feasibility logic
    const weather = first.weather_during_bunkering;
    const expectedFeasible =
      weather.max_wave_height_m <= 1.5 && weather.max_wind_speed_kt <= 25;
    if (first.bunkering_feasible === expectedFeasible) {
      console.log('  ✓ Feasibility calculation is correct');
    }
  } catch (error) {
    formatTestResult(testName, null, error as Error);
  }
}

/**
 * Test Case 2: Multiple ports
 * Expected: Should check weather for all ports
 */
async function testMultiplePorts(): Promise<void> {
  const testName = 'Multiple Ports Check';
  
  try {
    const testPorts = [
      {
        port_code: 'SGSIN',
        port_name: 'Singapore',
        lat: 1.29,
        lon: 103.85,
        estimated_arrival: '2024-12-28T08:00:00Z',
        bunkering_duration_hours: 8,
      },
      {
        port_code: 'AEJEA',
        port_name: 'Jebel Ali',
        lat: 25.02,
        lon: 55.03,
        estimated_arrival: '2024-12-29T14:00:00Z',
        bunkering_duration_hours: 12,
      },
    ];

    const result = await executePortWeatherTool({ bunker_ports: testPorts });

    formatTestResult(testName, result);

    if (result.length === testPorts.length) {
      console.log('  ✓ All ports processed');
    }

    // Verify port codes match
    const portCodesMatch = result.every(
      (r: any, i: number) => r.port_code === testPorts[i].port_code
    );
    if (portCodesMatch) {
      console.log('  ✓ Port codes match input');
    }
  } catch (error) {
    formatTestResult(testName, null, error as Error);
  }
}

/**
 * Test Case 3: Invalid inputs
 * Expected: Should throw PortWeatherError
 */
async function testInvalidInputs(): Promise<void> {
  const testName = 'Invalid Inputs (Error Handling)';
  
  const testCases = [
    {
      name: 'Empty ports array',
      input: {
        bunker_ports: [],
      },
    },
    {
      name: 'Invalid latitude',
      input: {
        bunker_ports: [
          {
            port_code: 'TEST',
            port_name: 'Test Port',
            lat: 91,
            lon: 0,
            estimated_arrival: '2024-12-28T14:00:00Z',
          },
        ],
      },
    },
    {
      name: 'Invalid datetime',
      input: {
        bunker_ports: [
          {
            port_code: 'TEST',
            port_name: 'Test Port',
            lat: 25.02,
            lon: 55.03,
            estimated_arrival: 'invalid-datetime',
          },
        ],
      },
    },
  ];

  for (const testCase of testCases) {
    console.log('\n' + '-'.repeat(80));
    console.log(`Sub-test: ${testCase.name}`);
    console.log('-'.repeat(80));

    try {
      const result = await executePortWeatherTool(testCase.input as any);
      console.log('❌ ERROR: Expected error but got result:');
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      if (error instanceof PortWeatherError) {
        console.log('✅ Correctly threw PortWeatherError');
        console.log(`   Error Code: ${error.code}`);
        console.log(`   Error Message: ${error.message}`);
      } else if (error instanceof Error && error.name === 'ZodError') {
        console.log('✅ Correctly threw validation error');
        console.log(`   Error Message: ${error.message}`);
      } else {
        console.log('⚠️  Threw error but not PortWeatherError:');
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
  console.log('║                      PORT WEATHER TEST SUITE                               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  const startTime = Date.now();

  // Run all test cases
  await testBasicPortCheck();
  await testMultiplePorts();
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
  testBasicPortCheck,
  testMultiplePorts,
  testInvalidInputs,
  runAllTests,
};

