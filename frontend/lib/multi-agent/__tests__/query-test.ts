/**
 * Query Test Runner
 * 
 * Tests the multi-agent system with real user queries.
 * This allows testing the full execution flow including:
 * - Supervisor planning
 * - Agent routing
 * - Tool execution
 * - Final recommendations
 */

// Load environment variables FIRST
import './setup-env';

import { multiAgentApp } from '../graph';
import { HumanMessage } from '@langchain/core/messages';
import type { MultiAgentState } from '../state';

/**
 * Test a user query through the multi-agent system
 */
export async function testQuery(
  userQuery: string,
  options?: {
    origin?: string;
    destination?: string;
    vessel_speed?: number;
    departure_date?: string;
  }
): Promise<void> {
  console.log('\n🧪 [QUERY-TEST] Starting query test...\n');
  console.log('='.repeat(80));
  console.log(`📝 Query: "${userQuery}"`);
  if (options) {
    console.log(`📋 Options:`, options);
  }
  console.log('='.repeat(80));
  
  // Build user message with context
  let userMessage = userQuery;
  if (options) {
    const contextParts: string[] = [];
    if (options.origin) contextParts.push(`Origin: ${options.origin}`);
    if (options.destination) contextParts.push(`Destination: ${options.destination}`);
    if (options.vessel_speed) contextParts.push(`Vessel speed: ${options.vessel_speed} knots`);
    if (options.departure_date) contextParts.push(`Departure date: ${options.departure_date}`);
    
    if (contextParts.length > 0) {
      userMessage = `${userQuery}\n\nContext:\n${contextParts.join('\n')}`;
    }
  }
  
  const humanMessage = new HumanMessage(userMessage);
  
  // Initial state
  const initialState: MultiAgentState = {
    messages: [humanMessage],
    next_agent: '',
    route_data: null,
    vessel_timeline: null,
    weather_forecast: null,
    weather_consumption: null,
    port_weather_status: null,
    bunker_ports: null,
    port_prices: null,
    bunker_analysis: null,
    final_recommendation: null,
    formatted_response: null,
    synthesized_insights: null,
    agent_errors: {},
    agent_status: {},
    agent_context: null,
    selected_route_id: null,
    weather_agent_partial: false,
    compliance_data: null,
    vessel_consumption: null,
    agent_call_counts: {
      route_agent: 0,
      weather_agent: 0,
      bunker_agent: 0,
    },
  };
  
  console.log('\n🚀 [QUERY-TEST] Starting graph execution...\n');
  const startTime = Date.now();
  
  try {
    // Stream graph execution
    // Increased recursion limit to 60 for complex multi-agent queries
    // Complex queries with multiple agents and tool calls may need more iterations
    const streamResult = await multiAgentApp.stream(
      initialState,
      {
        streamMode: 'values',
        recursionLimit: 60,
      }
    );
    
    let stepCount = 0;
    let lastNode = '';
    let finalState: MultiAgentState | null = null;
    
    // Process stream events
    for await (const event of streamResult) {
      stepCount++;
      const nodeName = Object.keys(event)[0];
      const state = event[nodeName] as MultiAgentState;
      finalState = state;
      
      if (nodeName !== lastNode) {
        console.log(`\n📍 [STEP ${stepCount}] Node: ${nodeName}`);
        lastNode = nodeName;
        
        // Show agent context if available
        if (state.agent_context) {
          const ctx = state.agent_context;
          if (ctx.route_agent) {
            console.log(`   📋 Route Agent Context:`);
            console.log(`      - Required tools: ${ctx.route_agent.required_tools.join(', ') || 'all'}`);
            console.log(`      - Priority: ${ctx.route_agent.priority}`);
          }
          if (ctx.weather_agent) {
            console.log(`   📋 Weather Agent Context:`);
            console.log(`      - Required tools: ${ctx.weather_agent.required_tools.join(', ') || 'all'}`);
            console.log(`      - Priority: ${ctx.weather_agent.priority}`);
          }
          if (ctx.bunker_agent) {
            console.log(`   📋 Bunker Agent Context:`);
            console.log(`      - Required tools: ${ctx.bunker_agent.required_tools.join(', ') || 'all'}`);
            console.log(`      - Priority: ${ctx.bunker_agent.priority}`);
          }
        }
        
        // Show next agent
        if (state.next_agent) {
          console.log(`   ➡️  Next: ${state.next_agent}`);
        }
        
        // Show agent status
        if (state.agent_status && Object.keys(state.agent_status).length > 0) {
          console.log(`   📊 Agent Status:`, Object.entries(state.agent_status)
            .map(([agent, status]) => `${agent}=${status}`)
            .join(', '));
        }
        
        // Show errors if any
        if (state.agent_errors && Object.keys(state.agent_errors).length > 0) {
          console.log(`   ⚠️  Errors:`, Object.keys(state.agent_errors).join(', '));
        }
      }
    }
    
    const executionTime = Date.now() - startTime;
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ [QUERY-TEST] Execution completed!\n');
    console.log(`📊 Execution Summary:`);
    console.log(`   - Total steps: ${stepCount}`);
    console.log(`   - Execution time: ${executionTime}ms (${(executionTime / 1000).toFixed(2)}s)`);
    
    if (finalState) {
      console.log(`\n📦 Final State:`);
      console.log(`   - Route data: ${finalState.route_data ? '✅' : '❌'}`);
      console.log(`   - Vessel timeline: ${finalState.vessel_timeline ? '✅' : '❌'}`);
      console.log(`   - Weather forecast: ${finalState.weather_forecast ? '✅' : '❌'}`);
      console.log(`   - Weather consumption: ${finalState.weather_consumption ? '✅' : '❌'}`);
      console.log(`   - Bunker ports: ${finalState.bunker_ports ? `✅ (${finalState.bunker_ports.length} ports)` : '❌'}`);
      console.log(`   - Port prices: ${finalState.port_prices ? '✅' : '❌'}`);
      console.log(`   - Bunker analysis: ${finalState.bunker_analysis ? '✅' : '❌'}`);
      console.log(`   - Final recommendation: ${finalState.final_recommendation ? '✅' : '❌'}`);
      
      // Show final recommendation if available
      if (finalState.final_recommendation) {
        console.log(`\n💡 Final Recommendation:`);
        const rec = finalState.final_recommendation;
        if (typeof rec === 'string') {
          console.log(`   ${rec.substring(0, 500)}${rec.length > 500 ? '...' : ''}`);
        } else {
          console.log(`   ${JSON.stringify(rec, null, 2).substring(0, 500)}...`);
        }
      }
      
      // Show errors if any
      if (finalState.agent_errors && Object.keys(finalState.agent_errors).length > 0) {
        console.log(`\n❌ Errors encountered:`);
        for (const [agent, error] of Object.entries(finalState.agent_errors)) {
          console.log(`   - ${agent}: ${error}`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(80));
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error('\n❌ [QUERY-TEST] Execution failed:', error);
    console.log(`   - Execution time: ${executionTime}ms`);
    throw error;
  }
}

// Run test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const query = process.argv[2] || 
    "Calculate fuel consumption from Singapore to Rotterdam departing December 25. My vessel consumes 35 MT per day at 14 knots. Include weather impact.";
  
  const options: {
    origin?: string;
    destination?: string;
    vessel_speed?: number;
    departure_date?: string;
  } = {};
  
  // Parse options from command line if provided
  if (process.argv.includes('--origin')) {
    const idx = process.argv.indexOf('--origin');
    options.origin = process.argv[idx + 1];
  }
  if (process.argv.includes('--destination')) {
    const idx = process.argv.indexOf('--destination');
    options.destination = process.argv[idx + 1];
  }
  if (process.argv.includes('--speed')) {
    const idx = process.argv.indexOf('--speed');
    options.vessel_speed = parseFloat(process.argv[idx + 1]);
  }
  if (process.argv.includes('--date')) {
    const idx = process.argv.indexOf('--date');
    options.departure_date = process.argv[idx + 1];
  }
  
  testQuery(query, options).catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

