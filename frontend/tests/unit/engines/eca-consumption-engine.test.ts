/**
 * ECA Consumption Engine Tests
 * 
 * Validates ECA fuel switching logic and consumption calculations.
 */

import { ECAConsumptionEngine } from '../../../lib/engines/eca-consumption-engine';

/**
 * Test ECA Consumption Engine functionality
 */
export function testECAConsumptionEngine(): void {
  console.log('\n🧪 [ECA-CONSUMPTION-TEST] Starting ECA consumption engine validation...\n');
  
  const engine = new ECAConsumptionEngine();
  let allPassed = true;
  
  const baseConsumption = {
    main_engine_mt_per_day: 30,
    auxiliary_mt_per_day: 3,
    total_mt_per_day: 33,
  };

  // Test 1: Consumption outside ECA correctly
  console.log('📋 Test 1: Consumption outside ECA');
  try {
    const result = engine.calculateConsumption({
      base_consumption: baseConsumption,
      route_segments: [
        {
          segment_id: 'seg1',
          from: 'Singapore',
          to: 'Colombo',
          distance_nm: 1500,
          is_eca: false,
        },
      ],
      speed_knots: 14,
    });

    if (result.segments.length !== 1) {
      console.error(`❌ Test 1 FAILED: Expected 1 segment, got ${result.segments.length}`);
      allPassed = false;
    } else {
      const seg = result.segments[0];
      const vlsfoPerDay = seg.consumption_mt_per_day.VLSFO;
      const lsmgoPerDay = seg.consumption_mt_per_day.LSMGO;
      
      if (Math.abs(vlsfoPerDay - 30) > 0.1) {
        console.error(`❌ Test 1 FAILED: Expected VLSFO ~30 MT/day, got ${vlsfoPerDay}`);
        allPassed = false;
      } else if (Math.abs(lsmgoPerDay - 3) > 0.1) {
        console.error(`❌ Test 1 FAILED: Expected LSMGO ~3 MT/day, got ${lsmgoPerDay}`);
        allPassed = false;
      } else if (seg.main_engine.fuel_type !== 'VLSFO') {
        console.error(`❌ Test 1 FAILED: Expected main engine fuel type VLSFO, got ${seg.main_engine.fuel_type}`);
        allPassed = false;
      } else {
        console.log('✅ Test 1 PASSED: Consumption outside ECA calculated correctly');
        console.log(`   - VLSFO: ${vlsfoPerDay.toFixed(1)} MT/day`);
        console.log(`   - LSMGO: ${lsmgoPerDay.toFixed(1)} MT/day`);
        console.log(`   - Main engine fuel: ${seg.main_engine.fuel_type}`);
      }
    }
  } catch (error) {
    console.error('❌ Test 1 FAILED with error:', error);
    allPassed = false;
  }

  // Test 2: Switch to LSMGO inside ECA
  console.log('\n📋 Test 2: Switch to LSMGO inside ECA');
  try {
    const result = engine.calculateConsumption({
      base_consumption: baseConsumption,
      route_segments: [
        {
          segment_id: 'seg1',
          from: 'Rotterdam',
          to: 'Hamburg',
          distance_nm: 500,
          is_eca: true,
          eca_zone_name: 'North Sea ECA',
        },
      ],
      speed_knots: 14,
    });

    if (result.segments.length !== 1) {
      console.error(`❌ Test 2 FAILED: Expected 1 segment, got ${result.segments.length}`);
      allPassed = false;
    } else {
      const seg = result.segments[0];
      const vlsfoPerDay = seg.consumption_mt_per_day.VLSFO;
      const lsmgoPerDay = seg.consumption_mt_per_day.LSMGO;
      
      if (vlsfoPerDay !== 0) {
        console.error(`❌ Test 2 FAILED: Expected VLSFO 0 in ECA, got ${vlsfoPerDay}`);
        allPassed = false;
      } else if (Math.abs(lsmgoPerDay - 33) > 0.1) {
        console.error(`❌ Test 2 FAILED: Expected LSMGO ~33 MT/day (30+3), got ${lsmgoPerDay}`);
        allPassed = false;
      } else if (seg.main_engine.fuel_type !== 'LSMGO') {
        console.error(`❌ Test 2 FAILED: Expected main engine fuel type LSMGO, got ${seg.main_engine.fuel_type}`);
        allPassed = false;
      } else {
        console.log('✅ Test 2 PASSED: Fuel switching in ECA works correctly');
        console.log(`   - VLSFO: ${vlsfoPerDay} MT/day (switched off)`);
        console.log(`   - LSMGO: ${lsmgoPerDay.toFixed(1)} MT/day (main + aux)`);
        console.log(`   - Main engine fuel: ${seg.main_engine.fuel_type}`);
      }
    }
  } catch (error) {
    console.error('❌ Test 2 FAILED with error:', error);
    allPassed = false;
  }

  // Test 3: Mixed ECA/non-ECA route
  console.log('\n📋 Test 3: Mixed ECA/non-ECA route');
  try {
    const result = engine.calculateConsumption({
      base_consumption: baseConsumption,
      route_segments: [
        {
          segment_id: 'seg1',
          from: 'Singapore',
          to: 'Suez',
          distance_nm: 4000,
          is_eca: false,
        },
        {
          segment_id: 'seg2',
          from: 'Suez',
          to: 'Rotterdam',
          distance_nm: 3000,
          is_eca: true,
          eca_zone_name: 'Mediterranean ECA',
        },
      ],
      speed_knots: 14,
    });

    if (result.segments.length !== 2) {
      console.error(`❌ Test 3 FAILED: Expected 2 segments, got ${result.segments.length}`);
      allPassed = false;
    } else {
      const seg1 = result.segments[0]; // Outside ECA
      const seg2 = result.segments[1]; // Inside ECA
      
      if (seg1.consumption_mt_per_day.VLSFO <= 0) {
        console.error('❌ Test 3 FAILED: First segment (non-ECA) should have VLSFO consumption');
        allPassed = false;
      } else if (seg2.consumption_mt_per_day.VLSFO !== 0) {
        console.error('❌ Test 3 FAILED: Second segment (ECA) should have no VLSFO consumption');
        allPassed = false;
      } else if (seg2.consumption_mt_per_day.LSMGO <= 30) {
        console.error(`❌ Test 3 FAILED: Second segment (ECA) should have LSMGO > 30 (main+aux), got ${seg2.consumption_mt_per_day.LSMGO}`);
        allPassed = false;
      } else {
        const expectedEcaPercentage = (3000 / 7000) * 100;
        if (Math.abs(result.eca_percentage - expectedEcaPercentage) > 0.1) {
          console.error(`❌ Test 3 FAILED: Expected ECA percentage ~${expectedEcaPercentage.toFixed(1)}%, got ${result.eca_percentage.toFixed(1)}%`);
          allPassed = false;
        } else {
          console.log('✅ Test 3 PASSED: Mixed ECA/non-ECA route handled correctly');
          console.log(`   - Segments: ${result.segments.length}`);
          console.log(`   - ECA distance: ${result.eca_distance_nm} nm`);
          console.log(`   - ECA percentage: ${result.eca_percentage.toFixed(1)}%`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Test 3 FAILED with error:', error);
    allPassed = false;
  }

  // Test 4: Adjustment factors
  console.log('\n📋 Test 4: Adjustment factors');
  try {
    const result = engine.calculateConsumption({
      base_consumption: baseConsumption,
      route_segments: [
        {
          segment_id: 'seg1',
          from: 'Singapore',
          to: 'Colombo',
          distance_nm: 1500,
          is_eca: false,
        },
      ],
      speed_knots: 14,
      weather_factor: 1.2,  // 20% increase
      fouling_factor: 1.1,  // 10% increase
      loading_factor: 1.05, // 5% increase
    });

    // Main engine: 30 * 1.2 * 1.1 * 1.05 = 41.58
    // Auxiliary: 3 * 1.2 = 3.6
    const expectedVLSFO = 41.58;
    const expectedLSMGO = 3.6;
    const actualVLSFO = result.segments[0].consumption_mt_per_day.VLSFO;
    const actualLSMGO = result.segments[0].consumption_mt_per_day.LSMGO;
    
    if (Math.abs(actualVLSFO - expectedVLSFO) > 0.1) {
      console.error(`❌ Test 4 FAILED: Expected VLSFO ~${expectedVLSFO}, got ${actualVLSFO}`);
      allPassed = false;
    } else if (Math.abs(actualLSMGO - expectedLSMGO) > 0.1) {
      console.error(`❌ Test 4 FAILED: Expected LSMGO ~${expectedLSMGO}, got ${actualLSMGO}`);
      allPassed = false;
    } else {
      console.log('✅ Test 4 PASSED: Adjustment factors applied correctly');
      console.log(`   - VLSFO: ${actualVLSFO.toFixed(2)} MT/day (30 * 1.2 * 1.1 * 1.05)`);
      console.log(`   - LSMGO: ${actualLSMGO.toFixed(2)} MT/day (3 * 1.2)`);
    }
  } catch (error) {
    console.error('❌ Test 4 FAILED with error:', error);
    allPassed = false;
  }

  // Test 5: Validate ECA logic
  console.log('\n📋 Test 5: Validate ECA logic');
  try {
    const result = engine.calculateConsumption({
      base_consumption: baseConsumption,
      route_segments: [
        {
          segment_id: 'seg1',
          from: 'Singapore',
          to: 'Colombo',
          distance_nm: 1500,
          is_eca: false,
        },
        {
          segment_id: 'seg2',
          from: 'Colombo',
          to: 'Rotterdam',
          distance_nm: 6000,
          is_eca: true,
        },
      ],
      speed_knots: 14,
    });

    const validation = engine.validateECALogic(result);
    
    if (!validation.is_valid) {
      console.error('❌ Test 5 FAILED: ECA logic validation failed');
      validation.issues.forEach(issue => console.error(`   - ${issue}`));
      allPassed = false;
    } else {
      console.log('✅ Test 5 PASSED: ECA logic validation passed');
      console.log(`   - Issues found: ${validation.issues.length}`);
    }
  } catch (error) {
    console.error('❌ Test 5 FAILED with error:', error);
    allPassed = false;
  }

  // Test 6: Single segment consumption
  console.log('\n📋 Test 6: Single segment consumption');
  try {
    // 1680 nm = 5 days at 14 knots
    const consumption = engine.calculateSegmentConsumption(
      baseConsumption,
      1680,
      14,
      false, // Not ECA
      { weather: 1.1, fouling: 1.0, loading: 1.0 }
    );

    // 5 days * (30 * 1.1) = 165 VLSFO
    // 5 days * (3 * 1.1) = 16.5 LSMGO
    const expectedVLSFO = 165;
    const expectedLSMGO = 16.5;
    
    if (Math.abs(consumption.VLSFO - expectedVLSFO) > 1) {
      console.error(`❌ Test 6 FAILED: Expected VLSFO ~${expectedVLSFO}, got ${consumption.VLSFO}`);
      allPassed = false;
    } else if (Math.abs(consumption.LSMGO - expectedLSMGO) > 0.5) {
      console.error(`❌ Test 6 FAILED: Expected LSMGO ~${expectedLSMGO}, got ${consumption.LSMGO}`);
      allPassed = false;
    } else {
      console.log('✅ Test 6 PASSED: Single segment consumption calculated correctly');
      console.log(`   - VLSFO: ${consumption.VLSFO.toFixed(1)} MT`);
      console.log(`   - LSMGO: ${consumption.LSMGO.toFixed(1)} MT`);
      console.log(`   - Total: ${consumption.total.toFixed(1)} MT`);
    }
  } catch (error) {
    console.error('❌ Test 6 FAILED with error:', error);
    allPassed = false;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ [ECA-CONSUMPTION-TEST] All tests passed!');
  } else {
    console.log('❌ [ECA-CONSUMPTION-TEST] Some tests failed');
  }
  console.log('='.repeat(60));
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testECAConsumptionEngine();
}
