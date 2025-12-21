// src/agents/__tests__/complete-bunker-agent.test.ts
import 'dotenv/config';
import { runCompleteBunkerAgent, askCompleteBunkerAgent } from '../complete-bunker-agent';

async function testCompleteAgent() {
  console.log('\n🧪 TESTING COMPLETE BUNKER OPTIMIZATION AGENT\n');
  
  // Check for API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ ERROR: ANTHROPIC_API_KEY environment variable is required');
    console.error('Please set it in your .env file');
    process.exit(1);
  }

  try {
    // Test 1: Full optimization
    console.log('📝 Test 1: Full optimization query');
    console.log('Question: I need to bunker 1000 MT of VLSFO on my voyage from Singapore to Rotterdam.');
    console.log('My vessel does 14 knots and burns 35 MT per day.');
    console.log('Find the most economical bunker port considering both fuel price and deviation costs.');
    console.log('\n');
    
    const result1 = await runCompleteBunkerAgent(
      `I need to bunker 1000 MT of VLSFO on my voyage from Singapore to Rotterdam. 
       My vessel does 14 knots and burns 35 MT per day. 
       Find the most economical bunker port considering both fuel price and deviation costs.`,
      {
        showMap: true,
        fuelQuantityMT: 1000,
        vesselSpeed: 14,
        vesselConsumption: 35,
        enableLogging: true,
      }
    );
    
    console.log('\n\n' + '='.repeat(100) + '\n\n');
    
    // Test 2: Different parameters and route
    console.log('📝 Test 2: Different parameters and route');
    console.log('Question: What\'s the cheapest bunker option from Tokyo to Shanghai for 1500 MT of VLSFO?');
    console.log('My ship is faster at 18 knots but burns 45 MT per day.');
    console.log('\n');
    
    const result2 = await askCompleteBunkerAgent(
      `What's the cheapest bunker option from Tokyo to Shanghai for 1500 MT of VLSFO? 
       My ship is faster at 18 knots but burns 45 MT per day.`,
      {
        showMap: true,
        fuelQuantityMT: 1500,
        vesselSpeed: 18,
        vesselConsumption: 45,
        enableLogging: true,
      }
    );
    
    console.log('\n\n' + '='.repeat(100));
    console.log('✅ ALL TESTS COMPLETED\n');
    
    // Summary
    if (result1.analysis) {
      console.log('Test 1 Results:');
      console.log(`  Best Option: ${result1.analysis.best_option.port_name}`);
      console.log(`  Total Cost: $${result1.analysis.best_option.total_cost.toLocaleString()}`);
      console.log(`  Savings: $${result1.analysis.max_savings.toLocaleString()}`);
    }
    
    if (result2.analysis) {
      console.log('\nTest 2 Results:');
      console.log(`  Best Option: ${result2.analysis.best_option.port_name}`);
      console.log(`  Total Cost: $${result2.analysis.best_option.total_cost.toLocaleString()}`);
      console.log(`  Savings: $${result2.analysis.max_savings.toLocaleString()}`);
    }
    
    console.log('\n');
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

testCompleteAgent();

