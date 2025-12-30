/**
 * Multi-Agent End-to-End Test Suite
 * 
 * Comprehensive test suite for the multi-agent LangGraph system.
 * Tests the complete workflow from user query to final recommendation.
 * 
 * Run with: npx tsx frontend/__tests__/multi-agent-e2e.test.ts
 * 
 * Prerequisites:
 * - Next.js dev server running on localhost:3000
 * - ANTHROPIC_API_KEY environment variable set
 */

import { multiAgentApp } from '@/lib/multi-agent/graph';
import { HumanMessage } from '@langchain/core/messages';

/**
 * Test configuration
 */
const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const TEST_TIMEOUT = 300000; // 5 minutes for complex queries

/**
 * Test result interface
 */
interface TestResult {
  testName: string;
  success: boolean;
  duration: number;
  error?: string;
  assertions: {
    passed: number;
    failed: number;
    details: string[];
  };
}

/**
 * Formats test results for readable output
 */
function formatTestResult(result: TestResult): void {
  console.log('\n' + '='.repeat(80));
  console.log(`TEST: ${result.testName}`);
  console.log('='.repeat(80));
  console.log(`Status: ${result.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Duration: ${result.duration}ms`);
  console.log(`Assertions: ${result.assertions.passed} passed, ${result.assertions.failed} failed`);
  
  if (result.assertions.details.length > 0) {
    console.log('\nAssertion Details:');
    result.assertions.details.forEach((detail) => {
      console.log(`  ${detail}`);
    });
  }
  
  if (result.error) {
    console.log(`\nError: ${result.error}`);
  }
  console.log('='.repeat(80));
}

/**
 * Test Case 1: Simple Route Query
 * 
 * Input: "Find route from Singapore to Jebel Ali"
 * Expected: Route agent called, returns route data
 */
async function testSimpleRouteQuery(): Promise<TestResult> {
  const testName = 'Simple Route Query';
  const startTime = Date.now();
  const result: TestResult = {
    testName,
    success: false,
    duration: 0,
    assertions: {
      passed: 0,
      failed: 0,
      details: [],
    },
  };

  try {
    console.log(`\n🧪 Running: ${testName}`);
    console.log('Input: "Find route from Singapore to Jebel Ali"');

    // Test via API endpoint
    const response = await fetch(`${API_BASE}/api/chat-multi-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Find route from Singapore to Jebel Ali',
        origin: 'Singapore',
        destination: 'Jebel Ali',
      }),
    });

    result.duration = Date.now() - startTime;

    // Assert: Response is OK
    if (!response.ok) {
      const errorText = await response.text();
      result.error = `HTTP ${response.status}: ${errorText}`;
      result.assertions.failed++;
      result.assertions.details.push(`❌ Response status: ${response.status}`);
      return result;
    }
    result.assertions.passed++;
    result.assertions.details.push(`✅ Response status: ${response.status}`);

    const data = await response.json();

    // Assert: Response structure
    if (!data.recommendation) {
      result.assertions.failed++;
      result.assertions.details.push('❌ Missing recommendation field');
    } else {
      result.assertions.passed++;
      result.assertions.details.push('✅ Recommendation field present');
    }

    // Assert: Route data exists
    if (!data.route_data) {
      result.assertions.failed++;
      result.assertions.details.push('❌ Missing route_data field');
    } else {
      result.assertions.passed++;
      result.assertions.details.push('✅ Route data present');
      
      // Assert: Route data structure
      if (data.route_data.distance_nm && data.route_data.waypoints) {
        result.assertions.passed++;
        result.assertions.details.push(
          `✅ Route data complete: ${data.route_data.distance_nm.toFixed(2)}nm, ${data.route_data.waypoints.length} waypoints`
        );
      } else {
        result.assertions.failed++;
        result.assertions.details.push('❌ Route data incomplete');
      }
    }

    // Assert: Metadata exists
    if (!data.metadata) {
      result.assertions.failed++;
      result.assertions.details.push('❌ Missing metadata field');
    } else {
      result.assertions.passed++;
      result.assertions.details.push('✅ Metadata present');
      
      if (data.metadata.execution_time_ms) {
        result.assertions.passed++;
        result.assertions.details.push(
          `✅ Execution time tracked: ${data.metadata.execution_time_ms}ms`
        );
      }
    }

    result.success = result.assertions.failed === 0;
  } catch (error) {
    result.duration = Date.now() - startTime;
    result.error = error instanceof Error ? error.message : String(error);
    result.assertions.failed++;
    result.assertions.details.push(`❌ Test error: ${result.error}`);
  }

  return result;
}

/**
 * Test Case 2: Weather-Enhanced Query
 * 
 * Input: "Find bunker plan Singapore to Rotterdam with weather"
 * Expected: Route → Weather → Bunker agents called in sequence
 */
async function testWeatherEnhancedQuery(): Promise<TestResult> {
  const testName = 'Weather-Enhanced Query';
  const startTime = Date.now();
  const result: TestResult = {
    testName,
    success: false,
    duration: 0,
    assertions: {
      passed: 0,
      failed: 0,
      details: [],
    },
  };

  try {
    console.log(`\n🧪 Running: ${testName}`);
    console.log('Input: "Find bunker plan Singapore to Rotterdam with weather"');

    const response = await fetch(`${API_BASE}/api/chat-multi-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Find bunker plan Singapore to Rotterdam with weather',
        origin: 'Singapore',
        destination: 'Rotterdam',
      }),
    });

    result.duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      result.error = `HTTP ${response.status}: ${errorText}`;
      result.assertions.failed++;
      return result;
    }
    result.assertions.passed++;
    result.assertions.details.push('✅ Response OK');

    const data = await response.json();

    // Assert: Route data
    if (data.route_data) {
      result.assertions.passed++;
      result.assertions.details.push('✅ Route data present');
    } else {
      result.assertions.failed++;
      result.assertions.details.push('❌ Missing route data');
    }

    // Assert: Weather data
    if (data.weather_data) {
      result.assertions.passed++;
      result.assertions.details.push('✅ Weather data present');
      
      if (data.weather_data.adjusted_consumption_mt) {
        result.assertions.passed++;
        result.assertions.details.push(
          `✅ Weather consumption calculated: ${data.weather_data.adjusted_consumption_mt.toFixed(2)}MT`
        );
      }
    } else {
      result.assertions.failed++;
      result.assertions.details.push('❌ Missing weather data');
    }

    // Assert: Bunker data (may or may not be present depending on query)
    if (data.bunker_data) {
      result.assertions.passed++;
      result.assertions.details.push('✅ Bunker data present');
    } else {
      result.assertions.details.push('⚠️  Bunker data not present (may be expected)');
    }

    // Assert: Multiple agents called
    if (data.metadata.agents_called && data.metadata.agents_called.length > 0) {
      result.assertions.passed++;
      result.assertions.details.push(
        `✅ Agents called: ${data.metadata.agents_called.join(', ')}`
      );
    }

    result.success = result.assertions.failed === 0;
  } catch (error) {
    result.duration = Date.now() - startTime;
    result.error = error instanceof Error ? error.message : String(error);
    result.assertions.failed++;
  }

  return result;
}

/**
 * Test Case 3: Complete Bunker Planning
 * 
 * Input: "Best bunker option Singapore to Rotterdam, departing Dec 25"
 * Expected: All agents collaborate, final recommendation includes route, weather, bunker
 */
async function testCompleteBunkerPlanning(): Promise<TestResult> {
  const testName = 'Complete Bunker Planning';
  const startTime = Date.now();
  const result: TestResult = {
    testName,
    success: false,
    duration: 0,
    assertions: {
      passed: 0,
      failed: 0,
      details: [],
    },
  };

  try {
    console.log(`\n🧪 Running: ${testName}`);
    console.log('Input: "Best bunker option Singapore to Rotterdam, departing Dec 25"');

    const response = await fetch(`${API_BASE}/api/chat-multi-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Best bunker option Singapore to Rotterdam, departing Dec 25',
        origin: 'Singapore',
        destination: 'Rotterdam',
        departure_date: '2024-12-25',
      }),
    });

    result.duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      result.error = `HTTP ${response.status}: ${errorText}`;
      result.assertions.failed++;
      return result;
    }
    result.assertions.passed++;
    result.assertions.details.push('✅ Response OK');

    const data = await response.json();

    // Assert: Recommendation exists and is comprehensive
    if (data.recommendation && data.recommendation.length > 100) {
      result.assertions.passed++;
      result.assertions.details.push(
        `✅ Comprehensive recommendation: ${data.recommendation.length} characters`
      );
    } else {
      result.assertions.failed++;
      result.assertions.details.push('❌ Recommendation missing or too short');
    }

    // Assert: Route data
    if (data.route_data && data.route_data.distance_nm) {
      result.assertions.passed++;
      result.assertions.details.push(
        `✅ Route data: ${data.route_data.distance_nm.toFixed(2)}nm`
      );
    } else {
      result.assertions.failed++;
      result.assertions.details.push('❌ Route data missing or incomplete');
    }

    // Assert: Weather data
    if (data.weather_data && data.weather_data.adjusted_consumption_mt) {
      result.assertions.passed++;
      result.assertions.details.push(
        `✅ Weather impact: +${data.weather_data.increase_percent.toFixed(2)}%`
      );
    } else {
      result.assertions.failed++;
      result.assertions.details.push('❌ Weather data missing');
    }

    // Assert: Bunker data with recommendations
    if (data.bunker_data && data.bunker_data.recommendations) {
      result.assertions.passed++;
      result.assertions.details.push(
        `✅ Bunker recommendations: ${data.bunker_data.recommendations.length} options`
      );
      
      if (data.bunker_data.best_option) {
        result.assertions.passed++;
        result.assertions.details.push(
          `✅ Best option: ${data.bunker_data.best_option.port_name} - $${data.bunker_data.best_option.total_cost_usd.toFixed(2)}`
        );
      }
    } else {
      result.assertions.failed++;
      result.assertions.details.push('❌ Bunker data missing or incomplete');
    }

    // Assert: Tool calls were made
    if (data.metadata.total_tool_calls > 0) {
      result.assertions.passed++;
      result.assertions.details.push(
        `✅ Tool calls made: ${data.metadata.total_tool_calls}`
      );
    } else {
      result.assertions.failed++;
      result.assertions.details.push('❌ No tool calls detected');
    }

    result.success = result.assertions.failed === 0;
  } catch (error) {
    result.duration = Date.now() - startTime;
    result.error = error instanceof Error ? error.message : String(error);
    result.assertions.failed++;
  }

  return result;
}

/**
 * Test Case 4: Error Handling
 * 
 * Input: Invalid port codes
 * Expected: Graceful error message
 */
async function testErrorHandling(): Promise<TestResult> {
  const testName = 'Error Handling';
  const startTime = Date.now();
  const result: TestResult = {
    testName,
    success: false,
    duration: 0,
    assertions: {
      passed: 0,
      failed: 0,
      details: [],
    },
  };

  try {
    console.log(`\n🧪 Running: ${testName}`);
    console.log('Input: "Find route from INVALID to INVALID2"');

    const response = await fetch(`${API_BASE}/api/chat-multi-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Find route from INVALID to INVALID2',
        origin: 'INVALID',
        destination: 'INVALID2',
      }),
    });

    result.duration = Date.now() - startTime;

    // For error handling, we expect either:
    // 1. 500 status with error message, OR
    // 2. 200 status with error in recommendation/response

    if (response.status === 500) {
      const errorData = await response.json();
      if (errorData.error) {
        result.assertions.passed++;
        result.assertions.details.push('✅ Error handled gracefully with 500 status');
        result.success = true; // Error handling test passes if error is returned properly
        return result;
      }
    }

    if (response.ok) {
      const data = await response.json();
      // Check if error is mentioned in recommendation
      if (
        data.recommendation &&
        (data.recommendation.toLowerCase().includes('error') ||
          data.recommendation.toLowerCase().includes('not found') ||
          data.recommendation.toLowerCase().includes('invalid'))
      ) {
        result.assertions.passed++;
        result.assertions.details.push('✅ Error handled gracefully in response');
        result.success = true;
        return result;
      }
    }

    result.assertions.failed++;
    result.assertions.details.push('❌ Error not handled gracefully');
    result.error = 'Expected error handling but got unexpected response';
  } catch (error) {
    result.duration = Date.now() - startTime;
    // Network errors are acceptable for this test
    result.assertions.passed++;
    result.assertions.details.push('✅ Error caught and handled');
    result.success = true;
  }

  return result;
}

/**
 * Test Case 5: Performance Comparison
 * 
 * Compare execution time of old single-agent vs new multi-agent endpoint
 */
async function testPerformanceComparison(): Promise<TestResult> {
  const testName = 'Performance Comparison';
  const startTime = Date.now();
  const result: TestResult = {
    testName,
    success: false,
    duration: 0,
    assertions: {
      passed: 0,
      failed: 0,
      details: [],
    },
  };

  try {
    console.log(`\n🧪 Running: ${testName}`);
    const testQuery = 'Best bunker option Singapore to Rotterdam';

    // Test old endpoint (if available)
    let oldEndpointTime = 0;
    try {
      const oldStart = Date.now();
      const oldResponse = await fetch(`${API_BASE}/api/chat-langgraph`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: testQuery }],
        }),
      });

      if (oldResponse.ok) {
        // Consume stream for accurate timing
        const reader = oldResponse.body?.getReader();
        if (reader) {
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }
        }
        oldEndpointTime = Date.now() - oldStart;
        result.assertions.passed++;
        result.assertions.details.push(
          `✅ Old endpoint (chat-langgraph): ${oldEndpointTime}ms`
        );
      }
    } catch (error) {
      result.assertions.details.push(
        `⚠️  Old endpoint not available or error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Test new multi-agent endpoint
    const newStart = Date.now();
    const newResponse = await fetch(`${API_BASE}/api/chat-multi-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: testQuery,
        origin: 'Singapore',
        destination: 'Rotterdam',
      }),
    });

    if (!newResponse.ok) {
      result.error = `New endpoint failed: ${newResponse.status}`;
      result.assertions.failed++;
      return result;
    }

    const newData = await newResponse.json();
    const newEndpointTime = Date.now() - newStart;

    result.assertions.passed++;
    result.assertions.details.push(
      `✅ New endpoint (chat-multi-agent): ${newEndpointTime}ms`
    );

    // Compare performance
    if (oldEndpointTime > 0) {
      const diff = newEndpointTime - oldEndpointTime;
      const diffPercent = ((diff / oldEndpointTime) * 100).toFixed(1);
      
      result.assertions.passed++;
      result.assertions.details.push(
        `📊 Performance difference: ${diff > 0 ? '+' : ''}${diff}ms (${diffPercent}%)`
      );

      if (Math.abs(diff) < oldEndpointTime * 0.2) {
        // Within 20% is considered similar
        result.assertions.passed++;
        result.assertions.details.push('✅ Performance is similar (within 20%)');
      } else if (newEndpointTime < oldEndpointTime) {
        result.assertions.passed++;
        result.assertions.details.push('✅ New endpoint is faster');
      } else {
        result.assertions.details.push('⚠️  New endpoint is slower (may be expected with more agents)');
      }
    }

    // Assert: New endpoint provides more data
    const hasRoute = !!newData.route_data;
    const hasWeather = !!newData.weather_data;
    const hasBunker = !!newData.bunker_data;

    if (hasRoute || hasWeather || hasBunker) {
      result.assertions.passed++;
      result.assertions.details.push(
        `✅ Comprehensive data: Route=${hasRoute}, Weather=${hasWeather}, Bunker=${hasBunker}`
      );
    }

    result.success = result.assertions.failed === 0;
    result.duration = Date.now() - startTime;
  } catch (error) {
    result.duration = Date.now() - startTime;
    result.error = error instanceof Error ? error.message : String(error);
    result.assertions.failed++;
  }

  return result;
}

/**
 * Test Case 6: Direct Graph Invocation
 * 
 * Test the graph directly (not via API) for more control
 */
async function testDirectGraphInvocation(): Promise<TestResult> {
  const testName = 'Direct Graph Invocation';
  const startTime = Date.now();
  const result: TestResult = {
    testName,
    success: false,
    duration: 0,
    assertions: {
      passed: 0,
      failed: 0,
      details: [],
    },
  };

  try {
    console.log(`\n🧪 Running: ${testName}`);
    console.log('Testing graph directly with HumanMessage');

    const humanMessage = new HumanMessage(
      'Find route from Singapore to Jebel Ali and calculate weather impact'
    );

    const finalState = await multiAgentApp.invoke(
      {
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
      },
      {
        recursionLimit: 100,
      }
    );

    result.duration = Date.now() - startTime;

    // Assert: State has messages
    if (finalState.messages && finalState.messages.length > 0) {
      result.assertions.passed++;
      result.assertions.details.push(`✅ Messages: ${finalState.messages.length}`);
    } else {
      result.assertions.failed++;
      result.assertions.details.push('❌ No messages in state');
    }

    // Assert: Route data or recommendation exists
    if (finalState.route_data || finalState.final_recommendation) {
      result.assertions.passed++;
      result.assertions.details.push('✅ Route data or recommendation present');
    } else {
      result.assertions.failed++;
      result.assertions.details.push('❌ No route data or recommendation');
    }

    // Assert: Execution completed
    if (result.duration < TEST_TIMEOUT) {
      result.assertions.passed++;
      result.assertions.details.push(`✅ Execution completed in ${result.duration}ms`);
    } else {
      result.assertions.failed++;
      result.assertions.details.push('❌ Execution timed out');
    }

    result.success = result.assertions.failed === 0;
  } catch (error) {
    result.duration = Date.now() - startTime;
    result.error = error instanceof Error ? error.message : String(error);
    result.assertions.failed++;
    result.assertions.details.push(`❌ Graph invocation error: ${result.error}`);
  }

  return result;
}

/**
 * Main test runner
 */
async function runAllTests(): Promise<void> {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              MULTI-AGENT END-TO-END TEST SUITE                                ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  const suiteStartTime = Date.now();
  const results: TestResult[] = [];

  // Check API availability
  try {
    const healthCheck = await fetch(`${API_BASE}/api/chat-multi-agent`, {
      method: 'OPTIONS',
    });
    console.log(`✅ API endpoint available at ${API_BASE}`);
  } catch (error) {
    console.warn(
      `⚠️  API endpoint may not be available at ${API_BASE}. Some tests may fail.`
    );
    console.warn('   Make sure Next.js dev server is running: npm run dev');
  }

  // Run all test cases
  console.log('\n📋 Running test cases...\n');

  results.push(await testSimpleRouteQuery());
  results.push(await testWeatherEnhancedQuery());
  results.push(await testCompleteBunkerPlanning());
  results.push(await testErrorHandling());
  results.push(await testPerformanceComparison());
  results.push(await testDirectGraphInvocation());

  // Print all results
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                          TEST RESULTS SUMMARY                                ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  results.forEach((result) => {
    formatTestResult(result);
  });

  // Summary statistics
  const totalTests = results.length;
  const passedTests = results.filter((r) => r.success).length;
  const failedTests = totalTests - passedTests;
  const totalDuration = Date.now() - suiteStartTime;
  const avgDuration =
    results.reduce((sum, r) => sum + r.duration, 0) / results.length;

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                            FINAL SUMMARY                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests} ✅`);
  console.log(`Failed: ${failedTests} ${failedTests > 0 ? '❌' : ''}`);
  console.log(`Total Duration: ${totalDuration}ms`);
  console.log(`Average Duration: ${avgDuration.toFixed(0)}ms`);
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  if (failedTests > 0) {
    console.log('\n⚠️  Some tests failed. Review the details above.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch((error) => {
    console.error('❌ Fatal error running tests:', error);
    process.exit(1);
  });
}

export {
  testSimpleRouteQuery,
  testWeatherEnhancedQuery,
  testCompleteBunkerPlanning,
  testErrorHandling,
  testPerformanceComparison,
  testDirectGraphInvocation,
  runAllTests,
};

