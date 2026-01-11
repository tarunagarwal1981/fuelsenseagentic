/**
 * Test file for Route Calculator Tool
 *
 * Tests the route calculator with various port combinations and error scenarios.
 * Run with: npx tsx src/tools/__tests__/route-calculator.test.ts
 */
/**
 * Test Case 1: Singapore to Rotterdam
 * Expected: Should route via Suez Canal
 */
declare function testSingaporeToRotterdam(): Promise<void>;
/**
 * Test Case 2: Tokyo to Shanghai
 * Expected: Pacific route across the East China Sea
 */
declare function testTokyoToShanghai(): Promise<void>;
/**
 * Test Case 3: Barcelona to Hamburg
 * Expected: Mediterranean to North Sea route
 */
declare function testBarcelonaToHamburg(): Promise<void>;
/**
 * Test Case 4: Invalid port codes
 * Expected: Should throw RouteCalculationError
 */
declare function testInvalidPortCodes(): Promise<void>;
/**
 * Test Case 5: Different vessel speeds
 * Expected: Should affect estimated hours but not distance
 */
declare function testDifferentVesselSpeeds(): Promise<void>;
/**
 * Main test runner
 */
declare function runAllTests(): Promise<void>;
export { testSingaporeToRotterdam, testTokyoToShanghai, testBarcelonaToHamburg, testInvalidPortCodes, testDifferentVesselSpeeds, runAllTests, };
//# sourceMappingURL=route-calculator.test.d.ts.map