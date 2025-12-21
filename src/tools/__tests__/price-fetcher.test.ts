// src/tools/__tests__/price-fetcher.test.ts
import { executePriceFetcherTool, fetchPrices, formatCurrency } from '../price-fetcher';

async function testPriceFetcher() {
  console.log('\n🧪 TESTING PRICE FETCHER TOOL\n');
  console.log('='.repeat(80));
  
  try {
    // Test 1: Get VLSFO prices for multiple ports
    console.log('\n📦 Test 1: Get VLSFO prices for 3 ports');
    const result1 = await executePriceFetcherTool({
      port_codes: ['SGSIN', 'AEJEA', 'LKCMB'],
      fuel_types: ['VLSFO'],
    });
    
    console.log(`\n   Results: ${result1.total_prices} prices found for ${result1.ports_with_prices} port(s)`);
    console.log('\n   Price Comparison:');
    
    const priceList: Array<{ port_code: string; price: number; formatted: string; hours_old: number }> = [];
    
    for (const [portCode, prices] of Object.entries(result1.prices_by_port)) {
      const vlsfoPrice = prices.find(p => p.price.fuel_type === 'VLSFO');
      if (vlsfoPrice) {
        priceList.push({
          port_code: portCode,
          price: vlsfoPrice.price.price_per_mt,
          formatted: vlsfoPrice.formatted_price,
          hours_old: vlsfoPrice.hours_since_update,
        });
      }
    }
    
    // Sort by price
    priceList.sort((a, b) => a.price - b.price);
    
    priceList.forEach((item, i) => {
      const freshness = item.hours_old < 24 ? '✅' : '⚠️';
      console.log(
        `   ${(i + 1).toString().padStart(2)}. ${item.port_code.padEnd(8)} ${item.formatted.padStart(10)}/MT  ` +
        `${item.hours_old.toFixed(1).padStart(5)}h old ${freshness}`
      );
    });
    
    // Find cheapest
    if (priceList.length > 0) {
      const cheapest = priceList[0];
      console.log(`\n   🏆 Cheapest: ${cheapest.port_code} at ${cheapest.formatted}/MT`);
    }
    
    // Test 2: Get all fuel types for one port
    console.log('\n\n📦 Test 2: Get all fuel types for Jebel Ali (AEJEA)');
    const result2 = await executePriceFetcherTool({
      port_codes: ['AEJEA'],
    });
    
    if (result2.prices_by_port['AEJEA']) {
      console.log('\n   Available fuels:');
      result2.prices_by_port['AEJEA'].forEach((priceData) => {
        const freshness = priceData.is_fresh ? '✅' : '⚠️';
        console.log(
          `   ${priceData.price.fuel_type.padEnd(10)} ${priceData.formatted_price.padStart(10)}/MT  ` +
          `${priceData.hours_since_update.toFixed(1).padStart(5)}h old ${freshness}`
        );
      });
    } else {
      console.log('   ⚠️  No prices found for AEJEA');
    }
    
    // Test 3: Multiple ports, all fuel types
    console.log('\n\n📦 Test 3: Get all fuel types for multiple ports');
    const result3 = await executePriceFetcherTool({
      port_codes: ['SGSIN', 'NLRTM', 'HKHKG'],
    });
    
    console.log(`\n   Results: ${result3.total_prices} prices found for ${result3.ports_with_prices} port(s)`);
    
    for (const [portCode, prices] of Object.entries(result3.prices_by_port)) {
      console.log(`\n   ${portCode}:`);
      prices.forEach((priceData) => {
        const freshness = priceData.is_fresh ? '✅' : '⚠️';
        console.log(
          `     ${priceData.price.fuel_type.padEnd(10)} ${priceData.formatted_price.padStart(10)}/MT  ` +
          `${priceData.hours_since_update.toFixed(1).padStart(5)}h old ${freshness}`
        );
      });
    }
    
    // Test 4: Missing data handling
    console.log('\n\n📦 Test 4: Request price for port with no data');
    const result4 = await executePriceFetcherTool({
      port_codes: ['XXXXX', 'SGSIN'], // One invalid, one valid
    });
    
    console.log(`   Ports with prices: ${result4.ports_with_prices}`);
    console.log(`   Ports not found: ${result4.ports_not_found.join(', ') || 'none'}`);
    
    if (result4.stale_price_warnings.length > 0) {
      console.log(`\n   ⚠️  Stale price warnings: ${result4.stale_price_warnings.length}`);
      result4.stale_price_warnings.slice(0, 3).forEach(warning => {
        console.log(`     ${warning.port_code} ${warning.fuel_type}: ${warning.hours_old.toFixed(1)}h old`);
      });
    }
    
    // Test 5: Filter by multiple fuel types
    console.log('\n\n📦 Test 5: Get VLSFO and MGO prices for Singapore');
    const result5 = await executePriceFetcherTool({
      port_codes: ['SGSIN'],
      fuel_types: ['VLSFO', 'MGO'],
    });
    
    if (result5.prices_by_port['SGSIN']) {
      console.log('\n   Filtered results:');
      result5.prices_by_port['SGSIN'].forEach((priceData) => {
        console.log(
          `   ${priceData.price.fuel_type.padEnd(10)} ${priceData.formatted_price.padStart(10)}/MT`
        );
      });
    }
    
    // Test 6: Currency formatting helper
    console.log('\n\n📦 Test 6: Currency formatting helper');
    console.log(`   USD: ${formatCurrency(492.74, 'USD')}`);
    console.log(`   EUR: ${formatCurrency(450.50, 'EUR')}`);
    console.log(`   GBP: ${formatCurrency(380.25, 'GBP')}`);
    console.log(`   JPY: ${formatCurrency(75000, 'JPY')}`);
    
    // Test 7: Direct function call
    console.log('\n\n📦 Test 7: Direct function call test');
    const directResult = await fetchPrices({
      port_codes: ['ROTTERDAM', 'SINGAPORE'], // Test with port names (should fail gracefully)
    });
    
    console.log(`   Direct call: ${directResult.total_prices} prices found`);
    
    console.log('\n' + '='.repeat(80));
    console.log('🎉 Price Fetcher Tests Complete!\n');
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testPriceFetcher();

