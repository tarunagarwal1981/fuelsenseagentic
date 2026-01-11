"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/agents/__tests__/bunker-agent.test.ts
require("dotenv/config");
const bunker_agent_1 = require("../bunker-agent");
async function testBunkerAgent() {
    console.log('\n🧪 TESTING MULTI-TOOL BUNKER AGENT\n');
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
        maxIterations: 15,
        showMap: true,
    };
    try {
        // Test 1: Find bunker ports along route
        console.log('📝 Test 1: Find bunker ports along route');
        console.log('Question: I need to sail from Singapore to Rotterdam. Find me bunker ports along the route within 150 nautical miles.');
        console.log('\n');
        await (0, bunker_agent_1.runBunkerAgent)("I need to sail from Singapore to Rotterdam. Find me bunker ports along the route within 150 nautical miles.", config);
        console.log('\n\n' + '='.repeat(80) + '\n\n');
        // Test 2: More complex query (using convenience function)
        console.log('📝 Test 2: Complex query with different ports');
        console.log('Question: What bunker ports are available on the route from Tokyo to Shanghai? I want options within 200nm of the route.');
        console.log('\n');
        await (0, bunker_agent_1.askBunkerAgent)("What bunker ports are available on the route from Tokyo to Shanghai? I want options within 200nm of the route.", {
            showMap: true,
            enableLogging: true,
        });
        console.log('\n\n' + '='.repeat(80));
        console.log('✅ ALL TESTS COMPLETED\n');
    }
    catch (error) {
        console.error('\n❌ Test failed with error:');
        console.error(error instanceof Error ? error.message : error);
        if (error instanceof Error && error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        process.exit(1);
    }
}
testBunkerAgent();
//# sourceMappingURL=bunker-agent.test.js.map