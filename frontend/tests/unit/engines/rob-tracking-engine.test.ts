/**
 * ROB Tracking Engine Tests
 * 
 * Validates ROB tracking functionality including consumption, bunkering, and safety margins.
 */

import { ROBTrackingEngine } from '../../../lib/engines/rob-tracking-engine';

/**
 * Test ROB Tracking Engine functionality
 */
export function testROBTrackingEngine(): void {
  console.log('\n🧪 [ROB-TRACKING-TEST] Starting ROB tracking engine validation...\n');
  
  const engine = new ROBTrackingEngine();
  let allPassed = true;
  
  // Test 1: Simple voyage tracking
  console.log('📋 Test 1: Simple voyage tracking');
  try {
    const result = engine.calculateROBTracking({
      initial_rob: { VLSFO: 1000, LSMGO: 100 },
      vessel_capacity: { VLSFO: 2000, LSMGO: 200 },
      segments: [
        {
          from: 'Singapore',
          to: 'Colombo',
          distance_nm: 1500,
          consumption_mt_per_day: { VLSFO: 30, LSMGO: 3 },
          duration_days: 5,
        },
      ],
      safety_margin_days: 3,
    });

    if (!result.overall_safe) {
      console.error('❌ Test 1 FAILED: Voyage should be safe');
      allPassed = false;
    } else if (result.final_rob.VLSFO !== 850 || result.final_rob.LSMGO !== 85) {
      console.error(`❌ Test 1 FAILED: Expected final ROB VLSFO=850, LSMGO=85, got VLSFO=${result.final_rob.VLSFO}, LSMGO=${result.final_rob.LSMGO}`);
      allPassed = false;
    } else {
      console.log('✅ Test 1 PASSED: Simple voyage tracking works correctly');
      console.log(`   - Final ROB: VLSFO=${result.final_rob.VLSFO}, LSMGO=${result.final_rob.LSMGO}`);
      console.log(`   - Waypoints: ${result.waypoints.length}`);
    }
  } catch (error) {
    console.error('❌ Test 1 FAILED with error:', error);
    allPassed = false;
  }

  // Test 2: Negative ROB detection
  console.log('\n📋 Test 2: Negative ROB detection');
  try {
    const result = engine.calculateROBTracking({
      initial_rob: { VLSFO: 100, LSMGO: 10 },
      vessel_capacity: { VLSFO: 2000, LSMGO: 200 },
      segments: [
        {
          from: 'Singapore',
          to: 'Rotterdam',
          distance_nm: 8000,
          consumption_mt_per_day: { VLSFO: 30, LSMGO: 3 },
          duration_days: 20,
        },
      ],
      safety_margin_days: 3,
    });

    if (result.overall_safe) {
      console.error('❌ Test 2 FAILED: Voyage should be unsafe (negative ROB)');
      allPassed = false;
    } else if (result.safety_violations.length === 0) {
      console.error('❌ Test 2 FAILED: Should have safety violations');
      allPassed = false;
    } else if (!result.safety_violations[0].issue.includes('Negative ROB')) {
      console.error(`❌ Test 2 FAILED: Expected negative ROB violation, got: ${result.safety_violations[0].issue}`);
      allPassed = false;
    } else {
      console.log('✅ Test 2 PASSED: Negative ROB violation detected');
      console.log(`   - Violations: ${result.safety_violations.length}`);
      console.log(`   - Issue: ${result.safety_violations[0].issue}`);
    }
  } catch (error) {
    console.error('❌ Test 2 FAILED with error:', error);
    allPassed = false;
  }

  // Test 3: Bunker stop handling
  console.log('\n📋 Test 3: Bunker stop handling');
  try {
    const result = engine.calculateROBTracking({
      initial_rob: { VLSFO: 500, LSMGO: 50 },
      vessel_capacity: { VLSFO: 2000, LSMGO: 200 },
      segments: [
        {
          from: 'Singapore',
          to: 'Colombo',
          distance_nm: 1500,
          consumption_mt_per_day: { VLSFO: 30, LSMGO: 3 },
          duration_days: 5,
        },
        {
          from: 'Colombo',
          to: 'Rotterdam',
          distance_nm: 6000,
          consumption_mt_per_day: { VLSFO: 30, LSMGO: 3 },
          duration_days: 15,
        },
      ],
      bunker_stops: [
        {
          port_name: 'Colombo',
          quantity_to_bunker: { VLSFO: 600, LSMGO: 60 },
          segment_index: 0,
        },
      ],
      safety_margin_days: 3,
    });

    if (!result.overall_safe) {
      console.error('❌ Test 3 FAILED: Voyage with bunker stop should be safe');
      allPassed = false;
    } else {
      const colomboAfter = result.waypoints.find(w => w.location.includes('After Bunker'));
      if (!colomboAfter) {
        console.error('❌ Test 3 FAILED: Should have bunker waypoint');
        allPassed = false;
      } else if (colomboAfter.rob_after_action.VLSFO <= colomboAfter.rob_before_action.VLSFO) {
        console.error('❌ Test 3 FAILED: ROB should increase after bunkering');
        allPassed = false;
      } else {
        console.log('✅ Test 3 PASSED: Bunker stop handled correctly');
        console.log(`   - Waypoints: ${result.waypoints.length}`);
        console.log(`   - Colombo after bunker ROB: VLSFO=${colomboAfter.rob_after_action.VLSFO}, LSMGO=${colomboAfter.rob_after_action.LSMGO}`);
      }
    }
  } catch (error) {
    console.error('❌ Test 3 FAILED with error:', error);
    allPassed = false;
  }

  // Test 4: Capacity overflow detection
  console.log('\n📋 Test 4: Capacity overflow detection');
  try {
    const validation = engine.validateBunkerCapacity(
      { VLSFO: 1800, LSMGO: 180 },
      { VLSFO: 2000, LSMGO: 200 },
      { VLSFO: 500, LSMGO: 50 }
    );

    if (validation.fits) {
      console.error('❌ Test 4 FAILED: Bunker quantity should not fit');
      allPassed = false;
    } else if (validation.overflow.VLSFO !== 300) {
      console.error(`❌ Test 4 FAILED: Expected overflow VLSFO=300, got ${validation.overflow.VLSFO}`);
      allPassed = false;
    } else {
      console.log('✅ Test 4 PASSED: Capacity overflow detected correctly');
      console.log(`   - Overflow: VLSFO=${validation.overflow.VLSFO}, LSMGO=${validation.overflow.LSMGO}`);
      console.log(`   - Available: VLSFO=${validation.available_capacity.VLSFO}, LSMGO=${validation.available_capacity.LSMGO}`);
    }
  } catch (error) {
    console.error('❌ Test 4 FAILED with error:', error);
    allPassed = false;
  }

  // Test 5: Safety margin calculation
  console.log('\n📋 Test 5: Safety margin calculation');
  try {
    const result = engine.calculateROBTracking({
      initial_rob: { VLSFO: 90, LSMGO: 9 }, // Exactly 3 days at 30/3 consumption
      vessel_capacity: { VLSFO: 2000, LSMGO: 200 },
      segments: [
        {
          from: 'Singapore',
          to: 'Colombo',
          distance_nm: 1500,
          consumption_mt_per_day: { VLSFO: 30, LSMGO: 3 },
          duration_days: 1,
        },
      ],
      safety_margin_days: 3,
    });

    // After consuming for 1 day, should have 60 VLSFO and 6 LSMGO left = 2 days
    const finalWaypoint = result.waypoints[result.waypoints.length - 1];
    const expectedMargin = 2; // 60/30 = 2 days for VLSFO, 6/3 = 2 days for LSMGO
    
    if (Math.abs(finalWaypoint.safety_margin_days - expectedMargin) > 0.1) {
      console.error(`❌ Test 5 FAILED: Expected safety margin ${expectedMargin} days, got ${finalWaypoint.safety_margin_days}`);
      allPassed = false;
    } else {
      console.log('✅ Test 5 PASSED: Safety margin calculated correctly');
      console.log(`   - Safety margin: ${finalWaypoint.safety_margin_days.toFixed(1)} days`);
      console.log(`   - ROB after 1 day: VLSFO=${finalWaypoint.rob_after_action.VLSFO}, LSMGO=${finalWaypoint.rob_after_action.LSMGO}`);
    }
  } catch (error) {
    console.error('❌ Test 5 FAILED with error:', error);
    allPassed = false;
  }

  // Test 6: Multi-segment voyage with multiple bunker stops
  console.log('\n📋 Test 6: Multi-segment voyage with multiple bunker stops');
  try {
    const result = engine.calculateROBTracking({
      initial_rob: { VLSFO: 400, LSMGO: 40 },
      vessel_capacity: { VLSFO: 2000, LSMGO: 200 },
      segments: [
        {
          from: 'Singapore',
          to: 'Colombo',
          distance_nm: 1500,
          consumption_mt_per_day: { VLSFO: 30, LSMGO: 3 },
          duration_days: 5,
        },
        {
          from: 'Colombo',
          to: 'Suez',
          distance_nm: 2000,
          consumption_mt_per_day: { VLSFO: 30, LSMGO: 3 },
          duration_days: 7,
        },
        {
          from: 'Suez',
          to: 'Rotterdam',
          distance_nm: 3000,
          consumption_mt_per_day: { VLSFO: 30, LSMGO: 3 },
          duration_days: 10,
        },
      ],
      bunker_stops: [
        {
          port_name: 'Colombo',
          quantity_to_bunker: { VLSFO: 500, LSMGO: 50 },
          segment_index: 0,
        },
        {
          port_name: 'Suez',
          quantity_to_bunker: { VLSFO: 400, LSMGO: 40 },
          segment_index: 1,
        },
      ],
      safety_margin_days: 3,
    });

    if (!result.overall_safe) {
      console.error('❌ Test 6 FAILED: Multi-segment voyage should be safe');
      console.error(`   - Violations: ${result.safety_violations.length}`);
      result.safety_violations.forEach(v => console.error(`     - ${v.location}: ${v.issue}`));
      allPassed = false;
    } else if (result.waypoints.length < 5) {
      console.error(`❌ Test 6 FAILED: Expected at least 5 waypoints, got ${result.waypoints.length}`);
      allPassed = false;
    } else {
      const bunkerWaypoints = result.waypoints.filter(w => w.location.includes('After Bunker'));
      if (bunkerWaypoints.length !== 2) {
        console.error(`❌ Test 6 FAILED: Expected 2 bunker waypoints, got ${bunkerWaypoints.length}`);
        allPassed = false;
      } else {
        console.log('✅ Test 6 PASSED: Multi-segment voyage with bunker stops handled correctly');
        console.log(`   - Total waypoints: ${result.waypoints.length}`);
        console.log(`   - Bunker stops: ${bunkerWaypoints.length}`);
        console.log(`   - Final ROB: VLSFO=${result.final_rob.VLSFO}, LSMGO=${result.final_rob.LSMGO}`);
      }
    }
  } catch (error) {
    console.error('❌ Test 6 FAILED with error:', error);
    allPassed = false;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ [ROB-TRACKING-TEST] All tests passed!');
  } else {
    console.log('❌ [ROB-TRACKING-TEST] Some tests failed');
  }
  console.log('='.repeat(60));
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testROBTrackingEngine();
}
