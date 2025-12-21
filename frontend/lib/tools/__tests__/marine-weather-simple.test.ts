/**
 * Simple test for Marine Weather Tool
 * 
 * This is a simplified test that can be run manually to verify the tool works.
 * Run with: tsx frontend/lib/tools/__tests__/marine-weather-simple.test.ts
 */

import { executeMarineWeatherTool } from '../marine-weather';

async function simpleTest() {
  console.log('Testing Marine Weather Tool...\n');
  
  const positions = [
    { lat: 1.29, lon: 103.85, datetime: '2024-12-25T08:00:00Z' },
    { lat: 5.50, lon: 95.32, datetime: '2024-12-26T08:00:00Z' },
  ];

  try {
    const result = await executeMarineWeatherTool({ positions });

    console.log(`✅ Success! Fetched weather for ${result.length} positions\n`);
    
    result.forEach((weather, i) => {
      console.log(`Position ${i + 1}:`);
      console.log(`  Location: ${weather.position.lat.toFixed(4)}, ${weather.position.lon.toFixed(4)}`);
      console.log(`  Datetime: ${weather.datetime}`);
      console.log(`  Wave Height: ${weather.weather.wave_height_m.toFixed(2)} m`);
      console.log(`  Wind Speed: ${weather.weather.wind_speed_knots.toFixed(2)} knots`);
      console.log(`  Wind Direction: ${weather.weather.wind_direction_deg.toFixed(1)}°`);
      console.log(`  Sea State: ${weather.weather.sea_state}`);
      console.log(`  Confidence: ${weather.forecast_confidence}\n`);
    });
    
    // Verify data structure
    const first = result[0];
    if (
      typeof first.weather.wave_height_m === 'number' &&
      typeof first.weather.wind_speed_knots === 'number' &&
      typeof first.weather.wind_direction_deg === 'number' &&
      typeof first.weather.sea_state === 'string' &&
      ['high', 'medium', 'low'].includes(first.forecast_confidence)
    ) {
      console.log('✅ Weather data structure is valid');
    }
    
    // Verify wind speed is in knots
    if (first.weather.wind_speed_knots > 0 && first.weather.wind_speed_knots < 100) {
      console.log('✅ Wind speed conversion to knots is valid');
    }
    
    // Verify sea state classification
    const validSeaStates = ['Calm', 'Slight', 'Moderate', 'Rough', 'Very Rough', 'High'];
    if (validSeaStates.includes(first.weather.sea_state)) {
      console.log('✅ Sea state classification is valid');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
    }
    process.exit(1);
  }
}

simpleTest();

