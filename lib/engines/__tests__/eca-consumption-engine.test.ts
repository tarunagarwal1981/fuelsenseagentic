/**
 * Comprehensive Unit Tests for ECA Consumption Engine
 * 
 * Tests cover:
 * - Calculate consumption outside ECA
 * - Calculate consumption inside ECA (fuel replacement)
 * - Apply weather factor correctly
 * - Calculate for route segment
 * - Handle zero base consumption (edge case)
 * - Validate inputs (negative values, invalid weather factor, etc.)
 * - Verify total consumption consistency (same total inside/outside ECA)
 * - Test explanation strings
 * 
 * Run with: npx tsx lib/engines/__tests__/eca-consumption-engine.test.ts
 */

import {
  ECAConsumptionEngineImpl,
  InvalidConsumptionError,
  InvalidWeatherFactorError,
  InvalidECAFlagError,
  RouteSegment,
} from '../eca-consumption-engine';

/**
 * Test result formatter
 */
function formatTestResult(
  testName: string,
  passed: boolean,
  details?: string,
  error?: Error
): void {
  console.log('\n' + '='.repeat(80));
  console.log(`TEST: ${testName}`);
  console.log('='.repeat(80));
  
  if (passed) {
    console.log('✅ TEST PASSED');
    if (details) {
      console.log(details);
    }
  } else {
    console.log('❌ TEST FAILED');
    if (error) {
      console.log(`Error Type: ${error.constructor.name}`);
      console.log(`Error Message: ${error.message}`);
    }
    if (details) {
      console.log(details);
    }
  }
  console.log('='.repeat(80));
}

/**
 * Test 1: Calculate consumption outside ECA
 */
function testCalculateConsumptionOutsideECA(): void {
  const engine = new ECAConsumptionEngineImpl();
  
  try {
    const result = engine.calculateConsumption({
      base_vlsfo_per_day: 20,
      base_lsmgo_per_day: 1,
      is_in_eca: false,
      weather_factor: 1.0,
    });
    
    // Expected: VLSFO = 20, LSMGO = 1, Total = 21
    const passed = 
      Math.abs(result.vlsfo - 20) < 0.01 &&
      Math.abs(result.lsmgo - 1) < 0.01 &&
      Math.abs(result.total - 21) < 0.01 &&
      result.explanation.includes('Outside ECA');
    
    formatTestResult(
      'Calculate consumption outside ECA',
      passed,
      `VLSFO=${result.vlsfo.toFixed(2)}MT/day (expected 20), LSMGO=${result.lsmgo.toFixed(2)}MT/day (expected 1), Total=${result.total.toFixed(2)}MT/day (expected 21)`
    );
    
    return passed;
  } catch (error) {
    formatTestResult(
      'Calculate consumption outside ECA',
      false,
      undefined,
      error as Error
    );
    return false;
  }
}

/**
 * Test 2: Calculate consumption inside ECA (fuel replacement)
 */
function testCalculateConsumptionInsideECA(): void {
  const engine = new ECAConsumptionEngineImpl();
  
  try {
    const result = engine.calculateConsumption({
      base_vlsfo_per_day: 20,
      base_lsmgo_per_day: 1,
      is_in_eca: true,
      weather_factor: 1.0,
    });
    
    // Expected: VLSFO = 0 (replaced), LSMGO = 21 (20 + 1), Total = 21
    const passed = 
      result.vlsfo === 0 &&
      Math.abs(result.lsmgo - 21) < 0.01 &&
      Math.abs(result.total - 21) < 0.01 &&
      result.explanation.includes('REPLACED') &&
      result.explanation.includes('Inside ECA');
    
    formatTestResult(
      'Calculate consumption inside ECA (fuel replacement)',
      passed,
      `VLSFO=${result.vlsfo}MT/day (expected 0, replaced), LSMGO=${result.lsmgo.toFixed(2)}MT/day (expected 21), Total=${result.total.toFixed(2)}MT/day (expected 21, same as outside ECA)`
    );
    
    return passed;
  } catch (error) {
    formatTestResult(
      'Calculate consumption inside ECA (fuel replacement)',
      false,
      undefined,
      error as Error
    );
    return false;
  }
}

/**
 * Test 3: Verify total consumption consistency (same total inside/outside ECA)
 */
function testTotalConsumptionConsistency(): void {
  const engine = new ECAConsumptionEngineImpl();
  
  try {
    const outsideResult = engine.calculateConsumption({
      base_vlsfo_per_day: 20,
      base_lsmgo_per_day: 1,
      is_in_eca: false,
      weather_factor: 1.0,
    });
    
    const insideResult = engine.calculateConsumption({
      base_vlsfo_per_day: 20,
      base_lsmgo_per_day: 1,
      is_in_eca: true,
      weather_factor: 1.0,
    });
    
    // Total should be the same
    const passed = Math.abs(outsideResult.total - insideResult.total) < 0.01;
    
    formatTestResult(
      'Verify total consumption consistency',
      passed,
      `Outside ECA total: ${outsideResult.total.toFixed(2)}MT/day, Inside ECA total: ${insideResult.total.toFixed(2)}MT/day (should be equal)`
    );
    
    return passed;
  } catch (error) {
    formatTestResult(
      'Verify total consumption consistency',
      false,
      undefined,
      error as Error
    );
    return false;
  }
}

/**
 * Test 4: Apply weather factor correctly (1.0)
 */
function testWeatherFactorOne(): void {
  const engine = new ECAConsumptionEngineImpl();
  
  try {
    const result = engine.calculateConsumption({
      base_vlsfo_per_day: 20,
      base_lsmgo_per_day: 1,
      is_in_eca: false,
      weather_factor: 1.0,
    });
    
    // Expected: No change from base
    const passed = 
      Math.abs(result.vlsfo - 20) < 0.01 &&
      Math.abs(result.lsmgo - 1) < 0.01;
    
    formatTestResult(
      'Apply weather factor correctly (1.0)',
      passed,
      `Weather factor 1.0: VLSFO=${result.vlsfo.toFixed(2)}MT/day (expected 20), LSMGO=${result.lsmgo.toFixed(2)}MT/day (expected 1)`
    );
    
    return passed;
  } catch (error) {
    formatTestResult(
      'Apply weather factor correctly (1.0)',
      false,
      undefined,
      error as Error
    );
    return false;
  }
}

/**
 * Test 5: Apply weather factor correctly (1.2)
 */
function testWeatherFactorOnePointTwo(): void {
  const engine = new ECAConsumptionEngineImpl();
  
  try {
    const result = engine.calculateConsumption({
      base_vlsfo_per_day: 20,
      base_lsmgo_per_day: 1,
      is_in_eca: false,
      weather_factor: 1.2,
    });
    
    // Expected: 20% increase
    const expected_vlsfo = 20 * 1.2;
    const expected_lsmgo = 1 * 1.2;
    
    const passed = 
      Math.abs(result.vlsfo - expected_vlsfo) < 0.01 &&
      Math.abs(result.lsmgo - expected_lsmgo) < 0.01;
    
    formatTestResult(
      'Apply weather factor correctly (1.2)',
      passed,
      `Weather factor 1.2: VLSFO=${result.vlsfo.toFixed(2)}MT/day (expected ${expected_vlsfo}), LSMGO=${result.lsmgo.toFixed(2)}MT/day (expected ${expected_lsmgo})`
    );
    
    return passed;
  } catch (error) {
    formatTestResult(
      'Apply weather factor correctly (1.2)',
      false,
      undefined,
      error as Error
    );
    return false;
  }
}

/**
 * Test 6: Apply weather factor correctly (2.0)
 */
function testWeatherFactorTwo(): void {
  const engine = new ECAConsumptionEngineImpl();
  
  try {
    const result = engine.calculateConsumption({
      base_vlsfo_per_day: 20,
      base_lsmgo_per_day: 1,
      is_in_eca: false,
      weather_factor: 2.0,
    });
    
    // Expected: 100% increase (doubled)
    const expected_vlsfo = 20 * 2.0;
    const expected_lsmgo = 1 * 2.0;
    
    const passed = 
      Math.abs(result.vlsfo - expected_vlsfo) < 0.01 &&
      Math.abs(result.lsmgo - expected_lsmgo) < 0.01;
    
    formatTestResult(
      'Apply weather factor correctly (2.0)',
      passed,
      `Weather factor 2.0: VLSFO=${result.vlsfo.toFixed(2)}MT/day (expected ${expected_vlsfo}), LSMGO=${result.lsmgo.toFixed(2)}MT/day (expected ${expected_lsmgo})`
    );
    
    return passed;
  } catch (error) {
    formatTestResult(
      'Apply weather factor correctly (2.0)',
      false,
      undefined,
      error as Error
    );
    return false;
  }
}

/**
 * Test 7: Calculate for route segment (outside ECA)
 */
function testCalculateSegmentConsumptionOutsideECA(): void {
  const engine = new ECAConsumptionEngineImpl();
  
  try {
    const segment: RouteSegment = {
      distance_nm: 336, // 1 day at 14 knots
      time_hours: 24,
      is_in_eca: false,
      weather_factor: 1.0,
      segment_id: 'segment_1',
    };
    
    const result = engine.calculateSegmentConsumption({
      segment,
      base_consumption: {
        vlsfo_per_day: 20,
        lsmgo_per_day: 1,
      },
    });
    
    // Expected: 1 day of consumption
    // VLSFO = 20 MT/day * 1 day = 20 MT
    // LSMGO = 1 MT/day * 1 day = 1 MT
    const passed = 
      Math.abs(result.vlsfo - 20) < 0.01 &&
      Math.abs(result.lsmgo - 1) < 0.01 &&
      Math.abs(result.time_days - 1.0) < 0.01 &&
      result.time_hours === 24 &&
      result.distance_nm === 336;
    
    formatTestResult(
      'Calculate for route segment (outside ECA)',
      passed,
      `Segment consumption: VLSFO=${result.vlsfo.toFixed(2)}MT (expected 20), LSMGO=${result.lsmgo.toFixed(2)}MT (expected 1), Time=${result.time_days.toFixed(2)} days`
    );
    
    return passed;
  } catch (error) {
    formatTestResult(
      'Calculate for route segment (outside ECA)',
      false,
      undefined,
      error as Error
    );
    return false;
  }
}

/**
 * Test 8: Calculate for route segment (inside ECA)
 */
function testCalculateSegmentConsumptionInsideECA(): void {
  const engine = new ECAConsumptionEngineImpl();
  
  try {
    const segment: RouteSegment = {
      distance_nm: 336, // 1 day at 14 knots
      time_hours: 24,
      is_in_eca: true,
      weather_factor: 1.0,
      segment_id: 'segment_2',
    };
    
    const result = engine.calculateSegmentConsumption({
      segment,
      base_consumption: {
        vlsfo_per_day: 20,
        lsmgo_per_day: 1,
      },
    });
    
    // Expected: 1 day of consumption in ECA
    // VLSFO = 0 MT (replaced)
    // LSMGO = 21 MT/day * 1 day = 21 MT
    const passed = 
      result.vlsfo === 0 &&
      Math.abs(result.lsmgo - 21) < 0.01 &&
      Math.abs(result.time_days - 1.0) < 0.01;
    
    formatTestResult(
      'Calculate for route segment (inside ECA)',
      passed,
      `Segment consumption: VLSFO=${result.vlsfo}MT (expected 0, replaced), LSMGO=${result.lsmgo.toFixed(2)}MT (expected 21), Time=${result.time_days.toFixed(2)} days`
    );
    
    return passed;
  } catch (error) {
    formatTestResult(
      'Calculate for route segment (inside ECA)',
      false,
      undefined,
      error as Error
    );
    return false;
  }
}

/**
 * Test 9: Calculate for route segment with weather factor
 */
function testCalculateSegmentConsumptionWithWeather(): void {
  const engine = new ECAConsumptionEngineImpl();
  
  try {
    const segment: RouteSegment = {
      distance_nm: 168, // 0.5 days at 14 knots
      time_hours: 12,
      is_in_eca: false,
      weather_factor: 1.2,
      segment_id: 'segment_3',
    };
    
    const result = engine.calculateSegmentConsumption({
      segment,
      base_consumption: {
        vlsfo_per_day: 20,
        lsmgo_per_day: 1,
      },
    });
    
    // Expected: 0.5 days with weather factor 1.2
    // VLSFO = 20 * 1.2 * 0.5 = 12 MT
    // LSMGO = 1 * 1.2 * 0.5 = 0.6 MT
    const expected_vlsfo = 20 * 1.2 * 0.5;
    const expected_lsmgo = 1 * 1.2 * 0.5;
    
    const passed = 
      Math.abs(result.vlsfo - expected_vlsfo) < 0.01 &&
      Math.abs(result.lsmgo - expected_lsmgo) < 0.01 &&
      Math.abs(result.time_days - 0.5) < 0.01;
    
    formatTestResult(
      'Calculate for route segment with weather factor',
      passed,
      `Segment consumption: VLSFO=${result.vlsfo.toFixed(2)}MT (expected ${expected_vlsfo}), LSMGO=${result.lsmgo.toFixed(2)}MT (expected ${expected_lsmgo}), Weather factor=1.2`
    );
    
    return passed;
  } catch (error) {
    formatTestResult(
      'Calculate for route segment with weather factor',
      false,
      undefined,
      error as Error
    );
    return false;
  }
}

/**
 * Test 10: Handle zero base consumption (edge case - should fail)
 */
function testZeroBaseConsumption(): void {
  const engine = new ECAConsumptionEngineImpl();
  
  try {
    engine.calculateConsumption({
      base_vlsfo_per_day: 0,
      base_lsmgo_per_day: 1,
      is_in_eca: false,
      weather_factor: 1.0,
    });
    
    formatTestResult(
      'Handle zero base consumption',
      false,
      'Expected InvalidConsumptionError but no error was thrown'
    );
    return false;
  } catch (error) {
    if (error instanceof InvalidConsumptionError) {
      formatTestResult(
        'Handle zero base consumption',
        true,
        `Correctly rejected zero base consumption. Error: ${error.message}`
      );
      return true;
    } else {
      formatTestResult(
        'Handle zero base consumption',
        false,
        undefined,
        error as Error
      );
      return false;
    }
  }
}

/**
 * Test 11: Validate negative base VLSFO consumption
 */
function testNegativeBaseVLSFO(): void {
  const engine = new ECAConsumptionEngineImpl();
  
  try {
    engine.calculateConsumption({
      base_vlsfo_per_day: -10,
      base_lsmgo_per_day: 1,
      is_in_eca: false,
      weather_factor: 1.0,
    });
    
    formatTestResult(
      'Validate negative base VLSFO consumption',
      false,
      'Expected InvalidConsumptionError but no error was thrown'
    );
    return false;
  } catch (error) {
    if (error instanceof InvalidConsumptionError) {
      formatTestResult(
        'Validate negative base VLSFO consumption',
        true,
        `Correctly rejected negative VLSFO consumption. Error: ${error.message}`
      );
      return true;
    } else {
      formatTestResult(
        'Validate negative base VLSFO consumption',
        false,
        undefined,
        error as Error
      );
      return false;
    }
  }
}

/**
 * Test 12: Validate negative base LSMGO consumption
 */
function testNegativeBaseLSMGO(): void {
  const engine = new ECAConsumptionEngineImpl();
  
  try {
    engine.calculateConsumption({
      base_vlsfo_per_day: 20,
      base_lsmgo_per_day: -1,
      is_in_eca: false,
      weather_factor: 1.0,
    });
    
    formatTestResult(
      'Validate negative base LSMGO consumption',
      false,
      'Expected InvalidConsumptionError but no error was thrown'
    );
    return false;
  } catch (error) {
    if (error instanceof InvalidConsumptionError) {
      formatTestResult(
        'Validate negative base LSMGO consumption',
        true,
        `Correctly rejected negative LSMGO consumption. Error: ${error.message}`
      );
      return true;
    } else {
      formatTestResult(
        'Validate negative base LSMGO consumption',
        false,
        undefined,
        error as Error
      );
      return false;
    }
  }
}

/**
 * Test 13: Validate weather factor < 1.0
 */
function testInvalidWeatherFactor(): void {
  const engine = new ECAConsumptionEngineImpl();
  
  try {
    engine.calculateConsumption({
      base_vlsfo_per_day: 20,
      base_lsmgo_per_day: 1,
      is_in_eca: false,
      weather_factor: 0.9, // Invalid: < 1.0
    });
    
    formatTestResult(
      'Validate weather factor < 1.0',
      false,
      'Expected InvalidWeatherFactorError but no error was thrown'
    );
    return false;
  } catch (error) {
    if (error instanceof InvalidWeatherFactorError) {
      formatTestResult(
        'Validate weather factor < 1.0',
        true,
        `Correctly rejected weather factor < 1.0. Error: ${error.message}`
      );
      return true;
    } else {
      formatTestResult(
        'Validate weather factor < 1.0',
        false,
        undefined,
        error as Error
      );
      return false;
    }
  }
}

/**
 * Test 14: Validate weather factor = 1.0 (boundary case)
 */
function testWeatherFactorBoundaryOne(): void {
  const engine = new ECAConsumptionEngineImpl();
  
  try {
    const result = engine.calculateConsumption({
      base_vlsfo_per_day: 20,
      base_lsmgo_per_day: 1,
      is_in_eca: false,
      weather_factor: 1.0, // Valid: exactly 1.0
    });
    
    const passed = result.total > 0;
    
    formatTestResult(
      'Validate weather factor = 1.0 (boundary case)',
      passed,
      `Weather factor 1.0 accepted: Total=${result.total.toFixed(2)}MT/day`
    );
    
    return passed;
  } catch (error) {
    formatTestResult(
      'Validate weather factor = 1.0 (boundary case)',
      false,
      undefined,
      error as Error
    );
    return false;
  }
}

/**
 * Test 15: Validate non-boolean ECA flag
 */
function testInvalidECAFlag(): void {
  const engine = new ECAConsumptionEngineImpl();
  
  try {
    engine.calculateConsumption({
      base_vlsfo_per_day: 20,
      base_lsmgo_per_day: 1,
      is_in_eca: 'true' as any, // Invalid: not a boolean
      weather_factor: 1.0,
    });
    
    formatTestResult(
      'Validate non-boolean ECA flag',
      false,
      'Expected InvalidECAFlagError but no error was thrown'
    );
    return false;
  } catch (error) {
    if (error instanceof InvalidECAFlagError) {
      formatTestResult(
        'Validate non-boolean ECA flag',
        true,
        `Correctly rejected non-boolean ECA flag. Error: ${error.message}`
      );
      return true;
    } else {
      formatTestResult(
        'Validate non-boolean ECA flag',
        false,
        undefined,
        error as Error
      );
      return false;
    }
  }
}

/**
 * Test 16: Test explanation strings
 */
function testExplanationStrings(): void {
  const engine = new ECAConsumptionEngineImpl();
  
  try {
    const outsideResult = engine.calculateConsumption({
      base_vlsfo_per_day: 20,
      base_lsmgo_per_day: 1,
      is_in_eca: false,
      weather_factor: 1.0,
    });
    
    const insideResult = engine.calculateConsumption({
      base_vlsfo_per_day: 20,
      base_lsmgo_per_day: 1,
      is_in_eca: true,
      weather_factor: 1.0,
    });
    
    const passed = 
      outsideResult.explanation.includes('Outside ECA') &&
      insideResult.explanation.includes('Inside ECA') &&
      insideResult.explanation.includes('REPLACED') &&
      outsideResult.explanation.length > 0 &&
      insideResult.explanation.length > 0;
    
    formatTestResult(
      'Test explanation strings',
      passed,
      `Outside ECA explanation: ${outsideResult.explanation.substring(0, 100)}...\nInside ECA explanation: ${insideResult.explanation.substring(0, 100)}...`
    );
    
    return passed;
  } catch (error) {
    formatTestResult(
      'Test explanation strings',
      false,
      undefined,
      error as Error
    );
    return false;
  }
}

/**
 * Test 17: Edge case - zero distance segment
 */
function testZeroDistanceSegment(): void {
  const engine = new ECAConsumptionEngineImpl();
  
  try {
    const segment: RouteSegment = {
      distance_nm: 0,
      time_hours: 0,
      is_in_eca: false,
      weather_factor: 1.0,
      segment_id: 'zero_segment',
    };
    
    const result = engine.calculateSegmentConsumption({
      segment,
      base_consumption: {
        vlsfo_per_day: 20,
        lsmgo_per_day: 1,
      },
    });
    
    // Expected: Zero consumption
    const passed = 
      result.vlsfo === 0 &&
      result.lsmgo === 0 &&
      result.total === 0 &&
      result.time_days === 0;
    
    formatTestResult(
      'Edge case - zero distance segment',
      passed,
      `Zero segment: VLSFO=${result.vlsfo}MT, LSMGO=${result.lsmgo}MT, Total=${result.total}MT`
    );
    
    return passed;
  } catch (error) {
    formatTestResult(
      'Edge case - zero distance segment',
      false,
      undefined,
      error as Error
    );
    return false;
  }
}

/**
 * Test 18: Edge case - negative distance segment (should fail)
 */
function testNegativeDistanceSegment(): void {
  const engine = new ECAConsumptionEngineImpl();
  
  try {
    const segment: RouteSegment = {
      distance_nm: -100,
      time_hours: 24,
      is_in_eca: false,
      weather_factor: 1.0,
      segment_id: 'negative_segment',
    };
    
    engine.calculateSegmentConsumption({
      segment,
      base_consumption: {
        vlsfo_per_day: 20,
        lsmgo_per_day: 1,
      },
    });
    
    formatTestResult(
      'Edge case - negative distance segment',
      false,
      'Expected InvalidConsumptionError but no error was thrown'
    );
    return false;
  } catch (error) {
    if (error instanceof InvalidConsumptionError) {
      formatTestResult(
        'Edge case - negative distance segment',
        true,
        `Correctly rejected negative distance. Error: ${error.message}`
      );
      return true;
    } else {
      formatTestResult(
        'Edge case - negative distance segment',
        false,
        undefined,
        error as Error
      );
      return false;
    }
  }
}

/**
 * Main test runner
 */
function runAllTests(): void {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                ECA CONSUMPTION ENGINE TEST SUITE                           ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  
  const startTime = Date.now();
  const results: boolean[] = [];
  
  // Run all test cases
  results.push(testCalculateConsumptionOutsideECA());
  results.push(testCalculateConsumptionInsideECA());
  results.push(testTotalConsumptionConsistency());
  results.push(testWeatherFactorOne());
  results.push(testWeatherFactorOnePointTwo());
  results.push(testWeatherFactorTwo());
  results.push(testCalculateSegmentConsumptionOutsideECA());
  results.push(testCalculateSegmentConsumptionInsideECA());
  results.push(testCalculateSegmentConsumptionWithWeather());
  results.push(testZeroBaseConsumption());
  results.push(testNegativeBaseVLSFO());
  results.push(testNegativeBaseLSMGO());
  results.push(testInvalidWeatherFactor());
  results.push(testWeatherFactorBoundaryOne());
  results.push(testInvalidECAFlag());
  results.push(testExplanationStrings());
  results.push(testZeroDistanceSegment());
  results.push(testNegativeDistanceSegment());
  
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  const passed = results.filter(r => r).length;
  const total = results.length;
  const coverage = (passed / total * 100).toFixed(1);
  
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                          TEST SUITE COMPLETE                                 ║');
  console.log(`║                    Tests Passed: ${passed}/${total} (${coverage}%)                              ║`);
  console.log(`║                    Total Duration: ${duration}s                                    ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  if (passed === total) {
    console.log('✅ ALL TESTS PASSED - 100% COVERAGE ACHIEVED');
    process.exit(0);
  } else {
    console.log(`❌ ${total - passed} TEST(S) FAILED`);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests();
}

export {
  testCalculateConsumptionOutsideECA,
  testCalculateConsumptionInsideECA,
  testTotalConsumptionConsistency,
  testWeatherFactorOne,
  testWeatherFactorOnePointTwo,
  testWeatherFactorTwo,
  testCalculateSegmentConsumptionOutsideECA,
  testCalculateSegmentConsumptionInsideECA,
  testCalculateSegmentConsumptionWithWeather,
  testZeroBaseConsumption,
  testNegativeBaseVLSFO,
  testNegativeBaseLSMGO,
  testInvalidWeatherFactor,
  testWeatherFactorBoundaryOne,
  testInvalidECAFlag,
  testExplanationStrings,
  testZeroDistanceSegment,
  testNegativeDistanceSegment,
  runAllTests,
};

