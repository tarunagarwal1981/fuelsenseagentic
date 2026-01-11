"use strict";
/**
 * Demo script for the Route Agent
 *
 * Run with: npx tsx src/agents/demo.ts
 *
 * Make sure to set ANTHROPIC_API_KEY in your .env file
 */
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const route_agent_1 = require("./route-agent");
async function main() {
    console.log('\n🚢 Route Agent Demo\n');
    console.log('='.repeat(80));
    const questions = [
        'What is the distance from Singapore to Rotterdam?',
        'Calculate the route from Tokyo to Shanghai with a vessel speed of 15 knots.',
        'How long would it take to travel from Barcelona to Hamburg at 14 knots?',
    ];
    for (const question of questions) {
        console.log(`\n📝 Question: ${question}\n`);
        try {
            const response = await (0, route_agent_1.askRouteAgent)(question, {
                enableLogging: true,
            });
            console.log('\n💬 Response:');
            console.log(response.message);
            console.log(`\n📊 Metadata: ${response.toolCalls} tool call(s), ${response.tokensUsed?.input || 'N/A'} input tokens, ${response.tokensUsed?.output || 'N/A'} output tokens`);
            console.log('\n' + '-'.repeat(80));
        }
        catch (error) {
            console.error('❌ Error:', error instanceof Error ? error.message : error);
            console.log('\n' + '-'.repeat(80));
        }
    }
}
main().catch(console.error);
//# sourceMappingURL=demo.js.map