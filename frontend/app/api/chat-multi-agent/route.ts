/**
 * Multi-Agent Chat API Endpoint
 * 
 * API endpoint that uses the multi-agent LangGraph system for comprehensive
 * bunker optimization with route planning, weather analysis, and bunker recommendations.
 */

export const runtime = 'edge';

import { multiAgentApp } from '@/lib/multi-agent/graph';
import { MultiAgentStateAnnotation } from '@/lib/multi-agent/state';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import {
  withTimeout,
  TIMEOUTS,
  startPerformanceMonitoring,
  getPerformanceMetrics,
  resetPerformanceMetrics,
  clearExpiredCache,
  cleanupStateData,
} from '@/lib/multi-agent/optimizations';
import {
  recordRequest,
  recordAgentExecution,
  getSystemMetrics,
  logMetricsSummary,
} from '@/lib/multi-agent/monitoring';
import {
  getTestVariant,
  recordABTestResult,
} from '@/lib/utils/ab-testing';

/**
 * Request body interface
 */
interface MultiAgentRequest {
  message: string;
  origin?: string;
  destination?: string;
  vessel_speed?: number;
  departure_date?: string;
}

/**
 * Response interface
 */
interface MultiAgentResponse {
  recommendation: string;
  route_data: any;
  weather_data: any;
  bunker_data: any;
  metadata: {
    agents_called: string[];
    total_tool_calls: number;
    execution_time_ms: number;
    ab_test_request_id?: string;
  };
}

export async function POST(req: Request) {
  const startTime = Date.now();
  console.log('📨 [MULTI-AGENT-API] Received request');

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ [MULTI-AGENT-API] ANTHROPIC_API_KEY is not set');
    return new Response(
      JSON.stringify({
        error:
          'Server configuration error: ANTHROPIC_API_KEY is not set. Please configure it in Netlify environment variables.',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  }

  try {
    // Parse request body
    const body: MultiAgentRequest = await req.json();
    const { message, origin, destination, vessel_speed, departure_date } = body;

    console.log('📝 [MULTI-AGENT-API] Request details:');
    console.log(`   - Message: ${message.substring(0, 100)}...`);
    console.log(`   - Origin: ${origin || 'not provided'}`);
    console.log(`   - Destination: ${destination || 'not provided'}`);
    console.log(`   - Vessel speed: ${vessel_speed || 'not provided'}`);
    console.log(`   - Departure date: ${departure_date || 'not provided'}`);

    // Build initial message with context
    let userMessage = message;
    if (origin || destination || vessel_speed || departure_date) {
      const contextParts: string[] = [];
      if (origin) contextParts.push(`Origin: ${origin}`);
      if (destination) contextParts.push(`Destination: ${destination}`);
      if (vessel_speed) contextParts.push(`Vessel speed: ${vessel_speed} knots`);
      if (departure_date) contextParts.push(`Departure date: ${departure_date}`);

      userMessage = `${message}\n\nContext:\n${contextParts.join('\n')}`;
    }

    const humanMessage = new HumanMessage(userMessage);

    // A/B Testing: Determine variant (for comparison, we always use multi-agent here)
    // But we can track this request for A/B testing
    let variant: 'multi-agent' = 'multi-agent'; // This endpoint is multi-agent
    const requestStartTime = Date.now();

    // Track agent transitions and tool calls
    const agentsCalled: string[] = [];
    let totalToolCalls = 0;
    let lastAgent = '';

    // Start performance monitoring
    startPerformanceMonitoring();
    
    // Clear expired cache entries periodically
    clearExpiredCache();

    // Check if multi-agent is enabled (feature flag)
    const multiAgentEnabled = process.env.MULTI_AGENT_ENABLED !== 'false';
    if (!multiAgentEnabled) {
      console.warn('⚠️ [MULTI-AGENT-API] Multi-agent system disabled via feature flag');
      return new Response(
        JSON.stringify({
          error: 'Multi-agent system is temporarily disabled. Please use /api/chat-langgraph',
          fallback_endpoint: '/api/chat-langgraph',
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    console.log('🚀 [MULTI-AGENT-API] Starting multi-agent graph execution...');

    // Execute the multi-agent graph with total timeout
    const finalState = await withTimeout(
      multiAgentApp.invoke(
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
        },
        {
          recursionLimit: 100, // Increased limit for multi-agent workflow
        }
      ),
      TIMEOUTS.TOTAL,
      'Total execution timeout exceeded (90s)'
    );

    // Clean up state data to reduce memory footprint
    const cleanedState = cleanupStateData(finalState);

    const executionTime = Date.now() - startTime;
    console.log(`✅ [MULTI-AGENT-API] Graph execution completed in ${executionTime}ms`);

    // Get performance metrics
    const perfMetrics = getPerformanceMetrics();
    if (perfMetrics) {
      console.log('📊 [MULTI-AGENT-API] Performance metrics:', {
        totalTime: perfMetrics.totalTime,
        agentTimes: perfMetrics.agentTimes,
        toolCallCounts: Object.keys(perfMetrics.toolCallTimes).length,
      });
    }

    // Record successful request
    recordRequest(true, executionTime);

    // Record A/B test result
    const requestId = recordABTestResult({
      variant,
      responseTime: executionTime,
      success: true,
      cost: perfMetrics?.totalTime ? (perfMetrics.totalTime / 1000) * 0.0001 : undefined, // Rough estimate
      metadata: {
        agentTimes: perfMetrics?.agentTimes,
        toolCalls: totalToolCalls,
        cacheHit: false, // Could be enhanced to track cache hits
      },
    });

    // Extract final recommendation
    const recommendation =
      cleanedState.final_recommendation ||
      (finalState.messages.length > 0
        ? (() => {
            // Try to find final AI message without tool calls
            for (let i = finalState.messages.length - 1; i >= 0; i--) {
              const msg = finalState.messages[i];
              if (msg instanceof AIMessage && !msg.tool_calls) {
                const content =
                  typeof msg.content === 'string'
                    ? msg.content
                    : String(msg.content || '');
                if (content.trim()) {
                  return content;
                }
              }
            }
            return 'Analysis completed. Please check the results below.';
          })()
        : 'No recommendation generated.');

    // Count tool calls from messages
    for (const msg of finalState.messages) {
      if (msg instanceof AIMessage && msg.tool_calls) {
        totalToolCalls += msg.tool_calls.length;
      }
    }

    // Track agent transitions from next_agent changes
    // This is a simplified tracking - in a real implementation, you might want to track state transitions
    if (finalState.next_agent) {
      agentsCalled.push(finalState.next_agent);
    }

    // Log final state
    console.log('📊 [MULTI-AGENT-API] Final state:');
    console.log(`   - Route data: ${finalState.route_data ? '✅' : '❌'}`);
    console.log(`   - Vessel timeline: ${finalState.vessel_timeline ? '✅' : '❌'}`);
    console.log(`   - Weather forecast: ${finalState.weather_forecast ? '✅' : '❌'}`);
    console.log(`   - Weather consumption: ${finalState.weather_consumption ? '✅' : '❌'}`);
    console.log(`   - Port weather: ${finalState.port_weather_status ? '✅' : '❌'}`);
    console.log(`   - Bunker ports: ${finalState.bunker_ports ? '✅' : '❌'}`);
    console.log(`   - Port prices: ${finalState.port_prices ? '✅' : '❌'}`);
    console.log(`   - Bunker analysis: ${finalState.bunker_analysis ? '✅' : '❌'}`);
    console.log(`   - Final recommendation: ${finalState.final_recommendation ? '✅' : '❌'}`);
    console.log(`   - Total tool calls: ${totalToolCalls}`);
    console.log(`   - Messages: ${finalState.messages.length}`);

    // Build response
    const response: MultiAgentResponse = {
      recommendation,
      route_data: cleanedState.route_data
        ? {
            distance_nm: cleanedState.route_data.distance_nm,
            estimated_hours: cleanedState.route_data.estimated_hours,
            waypoints: cleanedState.route_data.waypoints,
            route_type: cleanedState.route_data.route_type,
            origin_port_code: cleanedState.route_data.origin_port_code,
            destination_port_code: cleanedState.route_data.destination_port_code,
          }
        : null,
      weather_data: cleanedState.weather_consumption
        ? {
            base_consumption_mt: cleanedState.weather_consumption.base_consumption_mt,
            adjusted_consumption_mt:
              cleanedState.weather_consumption.weather_adjusted_consumption_mt,
            additional_fuel_mt: cleanedState.weather_consumption.additional_fuel_needed_mt,
            increase_percent:
              cleanedState.weather_consumption.consumption_increase_percent,
            weather_summary: cleanedState.weather_consumption.voyage_weather_summary,
            alerts_count: cleanedState.weather_consumption.weather_alerts.length,
            port_weather: cleanedState.port_weather_status,
          }
        : null,
      bunker_data: cleanedState.bunker_analysis
        ? {
            recommendations: cleanedState.bunker_analysis.recommendations,
            best_option: cleanedState.bunker_analysis.best_option,
            worst_option: cleanedState.bunker_analysis.worst_option,
            max_savings_usd: cleanedState.bunker_analysis.max_savings_usd,
            analysis_summary: cleanedState.bunker_analysis.analysis_summary,
          }
        : null,
      metadata: {
        agents_called: agentsCalled.length > 0 ? agentsCalled : ['supervisor'],
        total_tool_calls: totalToolCalls,
        execution_time_ms: executionTime,
        ab_test_request_id: requestId, // Include for frontend satisfaction tracking
      },
    };

    console.log('✅ [MULTI-AGENT-API] Response prepared successfully');
    console.log(`📤 [MULTI-AGENT-API] Returning response with ${JSON.stringify(response).length} bytes`);

    // Reset performance metrics for next request
    resetPerformanceMetrics();

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error('❌ [MULTI-AGENT-API] Error:', error);
    console.error(
      `❌ [MULTI-AGENT-API] Error details:`,
      error instanceof Error ? error.message : String(error)
    );
    if (error instanceof Error && error.stack) {
      console.error('❌ [MULTI-AGENT-API] Stack trace:', error.stack);
    }

    // Record failed request
    recordRequest(false, executionTime);

    // Record A/B test result for failure
    recordABTestResult({
      variant: 'multi-agent', // This endpoint is always multi-agent
      responseTime: executionTime,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        execution_time_ms: executionTime,
        fallback_endpoint: '/api/chat-langgraph', // Suggest fallback
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

