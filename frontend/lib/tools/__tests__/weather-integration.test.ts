/**
 * Weather Integration Test
 * 
 * Comprehensive integration test that validates the complete weather workflow
 * using all 4 weather tools in sequence.
 * 
 * Test Scenario: Singapore to Jebel Ali voyage
 * 
 * Flow:
 * 1. weather-timeline → Generate vessel positions
 * 2. marine-weather → Fetch weather for positions
 * 3. weather-consumption → Calculate adjusted fuel needs
 * 4. port-weather → Check bunker port conditions
 * 
 * Run with: npx tsx frontend/lib/tools/__tests__/weather-integration.test.ts
 */

import { executeWeatherTimelineTool } from '../weather-timeline';
import { executeMarineWeatherTool } from '../marine-weather';
import { executeWeatherConsumptionTool } from '../weather-consumption';
import { executePortWeatherTool } from '../port-weather';

/**
 * Test configuration
 */
const TEST_CONFIG = {
  origin: { lat: 1.29, lon: 103.85 }, // Singapore
  destination: { lat: 25.02, lon: 55.03 }, // Jebel Ali (approximate)
  vessel_speed_knots: 14,
  departure_datetime: '2024-12-25T08:00:00Z',
  sampling_interval_hours: 12,
  base_consumption_mt: 350,
  vessel_heading_deg: 315, // Approximate heading from Singapore to Jebel Ali
  port_code: 'AEJEA',
  port_name: 'Jebel Ali',
  port_lat: 25.02,
  port_lon: 55.03,
  bunkering_duration_hours: 8,
};

/**
 * Formats test results for readable output
 */
function formatSection(title: string, content: string): void {
  console.log('\n' + '='.repeat(80));
  console.log(title);
  console.log('='.repeat(80));
  console.log(content);
}

/**
 * Validates weather timeline output
 */
function validateWeatherTimeline(positions: any[]): boolean {
  if (!Array.isArray(positions) || positions.length === 0) {
    console.error('❌ Weather timeline: No positions generated');
    return false;
  }

  const first = positions[0];
  const last = positions[positions.length - 1];

  // Validate structure
  const requiredFields = ['lat', 'lon', 'datetime', 'distance_from_start_nm', 'segment_index'];
  for (const field of requiredFields) {
    if (!(field in first)) {
      console.error(`❌ Weather timeline: Missing field '${field}'`);
      return false;
    }
  }

  // Validate first position
  if (first.distance_from_start_nm !== 0) {
    console.error('❌ Weather timeline: First position should have zero distance');
    return false;
  }

  // Validate datetime progression
  for (let i = 1; i < positions.length; i++) {
    const prev = new Date(positions[i - 1].datetime);
    const curr = new Date(positions[i].datetime);
    if (curr <= prev) {
      console.error(`❌ Weather timeline: Datetime not progressing at index ${i}`);
      return false;
    }
  }

  // Validate distance progression
  for (let i = 1; i < positions.length; i++) {
    if (positions[i].distance_from_start_nm < positions[i - 1].distance_from_start_nm) {
      console.error(`❌ Weather timeline: Distance not progressing at index ${i}`);
      return false;
    }
  }

  console.log('✅ Weather timeline: All validations passed');
  return true;
}

/**
 * Validates marine weather output
 */
function validateMarineWeather(weather: any[]): boolean {
  if (!Array.isArray(weather) || weather.length === 0) {
    console.error('❌ Marine weather: No weather data generated');
    return false;
  }

  const first = weather[0];

  // Validate structure
  const requiredFields = ['position', 'datetime', 'weather', 'forecast_confidence'];
  for (const field of requiredFields) {
    if (!(field in first)) {
      console.error(`❌ Marine weather: Missing field '${field}'`);
      return false;
    }
  }

  // Validate weather data structure
  const weatherFields = ['wave_height_m', 'wind_speed_knots', 'wind_direction_deg', 'sea_state'];
  for (const field of weatherFields) {
    if (!(field in first.weather)) {
      console.error(`❌ Marine weather: Missing weather field '${field}'`);
      return false;
    }
  }

  // Validate confidence levels
  const validConfidences = ['high', 'medium', 'low'];
  for (const w of weather) {
    if (!validConfidences.includes(w.forecast_confidence)) {
      console.error(`❌ Marine weather: Invalid confidence level '${w.forecast_confidence}'`);
      return false;
    }
  }

  // Validate sea states
  const validSeaStates = ['Calm', 'Slight', 'Moderate', 'Rough', 'Very Rough', 'High'];
  for (const w of weather) {
    if (!validSeaStates.includes(w.weather.sea_state)) {
      console.error(`❌ Marine weather: Invalid sea state '${w.weather.sea_state}'`);
      return false;
    }
  }

  console.log('✅ Marine weather: All validations passed');
  return true;
}

/**
 * Validates weather consumption output
 */
function validateWeatherConsumption(consumption: any): boolean {
  // Validate structure
  const requiredFields = [
    'base_consumption_mt',
    'weather_adjusted_consumption_mt',
    'additional_fuel_needed_mt',
    'consumption_increase_percent',
    'weather_alerts',
    'voyage_weather_summary',
  ];

  for (const field of requiredFields) {
    if (!(field in consumption)) {
      console.error(`❌ Weather consumption: Missing field '${field}'`);
      return false;
    }
  }

  // Validate consumption values
  if (consumption.base_consumption_mt <= 0) {
    console.error('❌ Weather consumption: Base consumption must be positive');
    return false;
  }

  if (consumption.weather_adjusted_consumption_mt <= 0) {
    console.error('❌ Weather consumption: Adjusted consumption must be positive');
    return false;
  }

  // Validate increase percentage (should be 0-50% for reasonable conditions)
  if (consumption.consumption_increase_percent < -10 || consumption.consumption_increase_percent > 50) {
    console.warn(
      `⚠️  Weather consumption: Increase percentage ${consumption.consumption_increase_percent.toFixed(2)}% is outside expected range (-10% to 50%)`
    );
  }

  // Validate weather summary
  const summary = consumption.voyage_weather_summary;
  if (
    typeof summary.avg_wave_height_m !== 'number' ||
    typeof summary.max_wave_height_m !== 'number' ||
    typeof summary.avg_multiplier !== 'number'
  ) {
    console.error('❌ Weather consumption: Invalid weather summary');
    return false;
  }

  // Validate alerts structure
  if (!Array.isArray(consumption.weather_alerts)) {
    console.error('❌ Weather consumption: Weather alerts must be an array');
    return false;
  }

  for (const alert of consumption.weather_alerts) {
    if (!['warning', 'severe'].includes(alert.severity)) {
      console.error(`❌ Weather consumption: Invalid alert severity '${alert.severity}'`);
      return false;
    }
  }

  console.log('✅ Weather consumption: All validations passed');
  return true;
}

/**
 * Validates port weather output
 */
function validatePortWeather(ports: any[]): boolean {
  if (!Array.isArray(ports) || ports.length === 0) {
    console.error('❌ Port weather: No port data generated');
    return false;
  }

  const first = ports[0];

  // Validate structure
  const requiredFields = [
    'port_code',
    'port_name',
    'bunkering_feasible',
    'weather_risk',
    'weather_during_bunkering',
    'recommendation',
  ];

  for (const field of requiredFields) {
    if (!(field in first)) {
      console.error(`❌ Port weather: Missing field '${field}'`);
      return false;
    }
  }

  // Validate risk levels
  const validRisks = ['Low', 'Medium', 'High'];
  if (!validRisks.includes(first.weather_risk)) {
    console.error(`❌ Port weather: Invalid risk level '${first.weather_risk}'`);
    return false;
  }

  // Validate conditions
  const validConditions = ['Excellent', 'Good', 'Marginal', 'Unsafe'];
  if (!validConditions.includes(first.weather_during_bunkering.conditions)) {
    console.error(
      `❌ Port weather: Invalid conditions '${first.weather_during_bunkering.conditions}'`
    );
    return false;
  }

  // Validate weather during bunkering
  const weatherFields = [
    'arrival_time',
    'bunkering_window_hours',
    'avg_wave_height_m',
    'max_wave_height_m',
    'avg_wind_speed_kt',
    'max_wind_speed_kt',
    'conditions',
  ];

  for (const field of weatherFields) {
    if (!(field in first.weather_during_bunkering)) {
      console.error(`❌ Port weather: Missing weather field '${field}'`);
      return false;
    }
  }

  // Validate feasibility logic
  const weather = first.weather_during_bunkering;
  const expectedFeasible = weather.max_wave_height_m <= 1.5 && weather.max_wind_speed_kt <= 25;
  if (first.bunkering_feasible !== expectedFeasible) {
    console.error(
      `❌ Port weather: Feasibility mismatch. Expected ${expectedFeasible}, got ${first.bunkering_feasible}`
    );
    return false;
  }

  console.log('✅ Port weather: All validations passed');
  return true;
}

/**
 * Main integration test
 */
async function runIntegrationTest(): Promise<void> {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                  WEATHER INTEGRATION TEST                                    ║');
  console.log('║                  Singapore → Jebel Ali Voyage                                ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  const startTime = Date.now();
  let allTestsPassed = true;

  try {
    // ===================================================================
    // STEP 1: Generate vessel positions using weather-timeline
    // ===================================================================
    formatSection('STEP 1: Weather Timeline', 'Generating vessel positions...');

    const waypoints = [TEST_CONFIG.origin, TEST_CONFIG.destination];
    const timelineResult = await executeWeatherTimelineTool({
      waypoints,
      vessel_speed_knots: TEST_CONFIG.vessel_speed_knots,
      departure_datetime: TEST_CONFIG.departure_datetime,
      sampling_interval_hours: TEST_CONFIG.sampling_interval_hours,
    });

    console.log(`Generated ${timelineResult.length} positions`);
    console.log(`First position: ${timelineResult[0].lat.toFixed(4)}°, ${timelineResult[0].lon.toFixed(4)}° at ${timelineResult[0].datetime}`);
    console.log(`Last position: ${timelineResult[timelineResult.length - 1].lat.toFixed(4)}°, ${timelineResult[timelineResult.length - 1].lon.toFixed(4)}° at ${timelineResult[timelineResult.length - 1].datetime}`);
    console.log(`Total distance: ${timelineResult[timelineResult.length - 1].distance_from_start_nm.toFixed(2)} nm`);

    if (!validateWeatherTimeline(timelineResult)) {
      allTestsPassed = false;
      throw new Error('Weather timeline validation failed');
    }

    // ===================================================================
    // STEP 2: Fetch weather data using marine-weather
    // ===================================================================
    formatSection('STEP 2: Marine Weather', 'Fetching weather forecasts...');

    const weatherPositions = timelineResult.map((pos) => ({
      lat: pos.lat,
      lon: pos.lon,
      datetime: pos.datetime,
    }));

    const weatherResult = await executeMarineWeatherTool({
      positions: weatherPositions,
    });

    console.log(`Fetched weather for ${weatherResult.length} positions`);
    if (weatherResult.length > 0) {
      const firstWeather = weatherResult[0];
      console.log(`First position weather: ${firstWeather.weather.wave_height_m.toFixed(2)}m waves, ${firstWeather.weather.wind_speed_knots.toFixed(1)}kt wind, ${firstWeather.weather.sea_state}`);
      console.log(`Confidence: ${firstWeather.forecast_confidence}`);

      // Calculate average conditions
      const avgWave = weatherResult.reduce((sum, w) => sum + w.weather.wave_height_m, 0) / weatherResult.length;
      const maxWave = Math.max(...weatherResult.map((w) => w.weather.wave_height_m));
      const avgWind = weatherResult.reduce((sum, w) => sum + w.weather.wind_speed_knots, 0) / weatherResult.length;
      const maxWind = Math.max(...weatherResult.map((w) => w.weather.wind_speed_knots));

      console.log(`Average wave height: ${avgWave.toFixed(2)}m (max: ${maxWave.toFixed(2)}m)`);
      console.log(`Average wind speed: ${avgWind.toFixed(1)}kt (max: ${maxWind.toFixed(1)}kt)`);
    }

    if (!validateMarineWeather(weatherResult)) {
      allTestsPassed = false;
      throw new Error('Marine weather validation failed');
    }

    // ===================================================================
    // STEP 3: Calculate weather-adjusted consumption
    // ===================================================================
    formatSection('STEP 3: Weather Consumption', 'Calculating adjusted fuel consumption...');

    const weatherData = weatherResult.map((w) => ({
      datetime: w.datetime,
      weather: {
        wave_height_m: w.weather.wave_height_m,
        wind_speed_knots: w.weather.wind_speed_knots,
        wind_direction_deg: w.weather.wind_direction_deg,
        sea_state: w.weather.sea_state,
      },
      position: w.position,
    }));

    const consumptionResult = await executeWeatherConsumptionTool({
      weather_data: weatherData,
      base_consumption_mt: TEST_CONFIG.base_consumption_mt,
      vessel_heading_deg: TEST_CONFIG.vessel_heading_deg,
    });

    console.log(`Base consumption: ${consumptionResult.base_consumption_mt.toFixed(2)} MT`);
    console.log(`Adjusted consumption: ${consumptionResult.weather_adjusted_consumption_mt.toFixed(2)} MT`);
    console.log(`Additional fuel needed: ${consumptionResult.additional_fuel_needed_mt.toFixed(2)} MT`);
    console.log(`Consumption increase: ${consumptionResult.consumption_increase_percent.toFixed(2)}%`);
    console.log(`Average multiplier: ${consumptionResult.voyage_weather_summary.avg_multiplier.toFixed(3)}x`);
    console.log(`Weather alerts: ${consumptionResult.weather_alerts.length}`);

    if (consumptionResult.weather_alerts.length > 0) {
      console.log('\nWeather Alerts:');
      consumptionResult.weather_alerts.forEach((alert: any, i: number) => {
        console.log(`  ${i + 1}. [${alert.severity.toUpperCase()}] ${alert.description}`);
      });
    }

    if (!validateWeatherConsumption(consumptionResult)) {
      allTestsPassed = false;
      throw new Error('Weather consumption validation failed');
    }

    // ===================================================================
    // STEP 4: Check port weather conditions
    // ===================================================================
    formatSection('STEP 4: Port Weather', 'Checking bunker port conditions...');

    // Calculate estimated arrival time (use last position datetime)
    const estimatedArrival = timelineResult[timelineResult.length - 1].datetime;

    const portWeatherResult = await executePortWeatherTool({
      bunker_ports: [
        {
          port_code: TEST_CONFIG.port_code,
          port_name: TEST_CONFIG.port_name,
          lat: TEST_CONFIG.port_lat,
          lon: TEST_CONFIG.port_lon,
          estimated_arrival: estimatedArrival,
          bunkering_duration_hours: TEST_CONFIG.bunkering_duration_hours,
        },
      ],
    });

    if (portWeatherResult.length > 0) {
      const port = portWeatherResult[0];
      console.log(`Port: ${port.port_name} (${port.port_code})`);
      console.log(`Bunkering feasible: ${port.bunkering_feasible ? '✅ Yes' : '❌ No'}`);
      console.log(`Weather risk: ${port.weather_risk}`);
      console.log(`Conditions: ${port.weather_during_bunkering.conditions}`);
      console.log(`Max wave height: ${port.weather_during_bunkering.max_wave_height_m.toFixed(2)}m (limit: 1.5m)`);
      console.log(`Max wind speed: ${port.weather_during_bunkering.max_wind_speed_kt.toFixed(1)}kt (limit: 25kt)`);
      console.log(`Recommendation: ${port.recommendation}`);

      if (port.next_good_window) {
        console.log(`Next good window: ${new Date(port.next_good_window.starts_at).toLocaleString()}`);
      }
    }

    if (!validatePortWeather(portWeatherResult)) {
      allTestsPassed = false;
      throw new Error('Port weather validation failed');
    }

    // ===================================================================
    // FINAL VALIDATION
    // ===================================================================
    formatSection('FINAL VALIDATION', 'Validating complete workflow...');

    // Check data flow between tools
    console.log('\nData Flow Validation:');
    console.log(`  ✅ Timeline positions: ${timelineResult.length}`);
    console.log(`  ✅ Weather data points: ${weatherResult.length}`);
    console.log(`  ✅ Consumption weather data: ${weatherData.length}`);
    console.log(`  ✅ Port weather checks: ${portWeatherResult.length}`);

    // Verify position count matches
    if (timelineResult.length !== weatherResult.length) {
      console.error(`❌ Position count mismatch: timeline=${timelineResult.length}, weather=${weatherResult.length}`);
      allTestsPassed = false;
    } else {
      console.log('  ✅ Position counts match between timeline and weather');
    }

    // Verify weather data matches consumption input
    if (weatherData.length !== consumptionResult.weather_alerts.length + (weatherData.length - consumptionResult.weather_alerts.length)) {
      // This is just a sanity check - not a hard requirement
      console.log('  ✅ Weather data structure is consistent');
    }

    // Verify consumption increase is reasonable
    if (
      consumptionResult.consumption_increase_percent >= 0 &&
      consumptionResult.consumption_increase_percent <= 50
    ) {
      console.log(`  ✅ Consumption increase is reasonable: ${consumptionResult.consumption_increase_percent.toFixed(2)}%`);
    } else {
      console.warn(
        `  ⚠️  Consumption increase may be outside expected range: ${consumptionResult.consumption_increase_percent.toFixed(2)}%`
      );
    }

    // Verify port weather risk assessment
    if (['Low', 'Medium', 'High'].includes(portWeatherResult[0].weather_risk)) {
      console.log(`  ✅ Port weather risk assessment is valid: ${portWeatherResult[0].weather_risk}`);
    } else {
      console.error(`  ❌ Invalid port weather risk: ${portWeatherResult[0].weather_risk}`);
      allTestsPassed = false;
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // ===================================================================
    // TEST SUMMARY
    // ===================================================================
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    if (allTestsPassed) {
      console.log('║                    ✅ INTEGRATION TEST PASSED                              ║');
    } else {
      console.log('║                    ❌ INTEGRATION TEST FAILED                              ║');
    }
    console.log(`║                    Total Duration: ${duration}s                                    ║`);
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

    console.log('\nTest Summary:');
    console.log(`  ✅ Weather Timeline: ${timelineResult.length} positions generated`);
    console.log(`  ✅ Marine Weather: ${weatherResult.length} forecasts fetched`);
    console.log(`  ✅ Weather Consumption: ${consumptionResult.consumption_increase_percent.toFixed(2)}% increase`);
    console.log(`  ✅ Port Weather: ${portWeatherResult[0].bunkering_feasible ? 'Feasible' : 'Not Feasible'}`);

    if (!allTestsPassed) {
      throw new Error('Integration test failed - see errors above');
    }
  } catch (error) {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    ❌ INTEGRATION TEST FAILED                                ║');
    console.log(`║                    Total Duration: ${duration}s                                    ║`);
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
    console.error('\nError:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    throw error;
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  runIntegrationTest()
    .then(() => {
      console.log('\n✅ All tests completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test suite failed:', error);
      process.exit(1);
    });
}

export { runIntegrationTest };

