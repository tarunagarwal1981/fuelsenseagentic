// src/agents/__tests__/route-agent.test.ts
import 'dotenv/config';
import { runRouteAgent } from '../route-agent';

async function testAgentWithMap() {
  console.log('\n🧪 TESTING ROUTE AGENT WITH MAP VISUALIZATION\n');
  
  // Check for API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ ERROR: ANTHROPIC_API_KEY environment variable is required');
    console.error('Please set it in your .env file');
    process.exit(1);
  }

  const config = {
    apiKey,
    enableLogging: true,
    maxIterations: 10,
    showMap: true, // Enable map visualization
  };

  try {
    // Test: Singapore to Rotterdam with map
    console.log('📝 Test: Route with map visualization');
    console.log('Question: Show me the route from Singapore to Rotterdam with waypoints');
    console.log('\n');
    
    const response = await runRouteAgent(
      "Show me the route from Singapore to Rotterdam with waypoints",
      config
    );
    
    console.log('\n✅ Response:');
    console.log(response.message);
    console.log(`\n📊 Tool calls: ${response.toolCalls}, Tokens: ${response.tokensUsed?.input || 'N/A'} input / ${response.tokensUsed?.output || 'N/A'} output`);
    
    console.log('\n\n' + '='.repeat(80));
    console.log('\n✅ TEST COMPLETED - Map should have opened in your browser!\n');
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

testAgentWithMap();

