/**
 * Multi-Agent Chat API Endpoint
 * 
 * API endpoint that uses the multi-agent LangGraph system for comprehensive
 * bunker optimization with route planning, weather analysis, and bunker recommendations.
 * 
 * Uses Server-Sent Events (SSE) streaming to send progressive updates as each agent completes.
 */

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
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
  selectedRouteId?: string;
  messages?: Array<{ role: string; content: string }>;
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
    const { message, origin, destination, vessel_speed, departure_date, selectedRouteId, messages } = body;

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

    console.log('🚀 [MULTI-AGENT-API] Starting multi-agent graph execution with streaming...');

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial keep-alive
          controller.enqueue(encoder.encode(': keep-alive\n\n'));

          // Track what we've already sent
          let lastSentRoute = false;
          let lastSentWeather = false;
          let lastSentBunker = false;
          let lastSentFinal = false;
          
          // Track previous agent to detect transitions
          let previousAgent = '';
          
          // Track accumulated state
          let accumulatedState: any = {
            route_data: null,
            vessel_timeline: null,
            weather_forecast: null,
            weather_consumption: null,
            port_weather_status: null,
            bunker_ports: null,
            port_prices: null,
            bunker_analysis: null,
            final_recommendation: null,
            agent_errors: {},
            agent_status: {},
          };

          // Keep-alive interval
          const keepAliveInterval = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(': keep-alive\n\n'));
            } catch (e) {
              clearInterval(keepAliveInterval);
            }
          }, 2000);

          // Check if we should use cached route
          let initialRouteData = null;
          if (selectedRouteId) {
            try {
              // Use dynamic import for JSON file (works in serverless environments)
              const cachedRoutesModule = await import('@/lib/data/cached-routes.json');
              const cachedRoutesData = cachedRoutesModule.default || cachedRoutesModule;
              const cachedRoute = cachedRoutesData.routes.find(
                (r: any) => r.id === selectedRouteId
              );
              if (cachedRoute) {
                initialRouteData = {
                  distance_nm: cachedRoute.distance_nm,
                  estimated_hours: cachedRoute.estimated_hours,
                  waypoints: cachedRoute.waypoints,
                  route_type: cachedRoute.route_type,
                  origin_port_code: cachedRoute.origin_port_code,
                  destination_port_code: cachedRoute.destination_port_code,
                  _from_cache: true,
                };
                console.log(`✅ [MULTI-AGENT-API] Loaded cached route: ${cachedRoute.origin_name} → ${cachedRoute.destination_name}`);
              }
            } catch (error) {
              console.warn(`⚠️ [MULTI-AGENT-API] Failed to load cached route: ${error}`);
            }
          }

          // Stream graph execution
          // Increased recursion limit to 60 for complex multi-agent queries
          // Complex queries with multiple agents and tool calls may need more iterations
          const streamResult = await multiAgentApp.stream(
            {
              messages: [humanMessage],
              next_agent: '',
              route_data: initialRouteData,
              vessel_timeline: null,
              weather_forecast: null,
              weather_consumption: null,
              port_weather_status: null,
              bunker_ports: null,
              port_prices: null,
              bunker_analysis: null,
              final_recommendation: null,
              agent_errors: {},
              agent_status: {},
              agent_context: null,
              selected_route_id: selectedRouteId || null,
            },
            {
              streamMode: 'values',
              recursionLimit: 60, // Increased from 30 to handle complex multi-agent workflows
            }
          );

          // Process stream events
          for await (const event of streamResult) {
            // Detect agent transitions and send agent_start events
            if (event.next_agent && event.next_agent !== previousAgent && event.next_agent !== '__end__') {
              console.log(`📤 [STREAM] Agent transition: ${previousAgent} → ${event.next_agent}`);
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'agent_start',
                    agent: event.next_agent,
                  })}\n\n`
                )
              );
              previousAgent = event.next_agent;
            }

            // Update accumulated state
            if (event.route_data) accumulatedState.route_data = event.route_data;
            if (event.vessel_timeline) accumulatedState.vessel_timeline = event.vessel_timeline;
            if (event.weather_forecast) accumulatedState.weather_forecast = event.weather_forecast;
            if (event.weather_consumption) accumulatedState.weather_consumption = event.weather_consumption;
            if (event.port_weather_status) accumulatedState.port_weather_status = event.port_weather_status;
            if (event.bunker_ports) accumulatedState.bunker_ports = event.bunker_ports;
            if (event.port_prices) accumulatedState.port_prices = event.port_prices;
            if (event.bunker_analysis) accumulatedState.bunker_analysis = event.bunker_analysis;
            if (event.final_recommendation) accumulatedState.final_recommendation = event.final_recommendation;
            if (event.agent_errors) accumulatedState.agent_errors = { ...accumulatedState.agent_errors, ...event.agent_errors };
            if (event.agent_status) accumulatedState.agent_status = { ...accumulatedState.agent_status, ...event.agent_status };

            // Send granular route_data event immediately when available
            if (accumulatedState.route_data && !lastSentRoute) {
              console.log('📤 [STREAM] Sending route_data event');
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'route_data',
                    data: {
                      distance_nm: accumulatedState.route_data.distance_nm,
                      estimated_hours: accumulatedState.route_data.estimated_hours,
                      waypoints: accumulatedState.route_data.waypoints,
                      route_type: accumulatedState.route_data.route_type,
                      origin_port_code: accumulatedState.route_data.origin_port_code,
                      destination_port_code: accumulatedState.route_data.destination_port_code,
                      origin_port_name: accumulatedState.route_data.origin_port_name,
                      destination_port_name: accumulatedState.route_data.destination_port_name,
                    },
                  })}\n\n`
                )
              );
              // Send agent_complete for route_agent
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'agent_complete',
                    agent: 'route_agent',
                  })}\n\n`
                )
              );
            }

            // Stream route data when available (backward compatibility)
            if (accumulatedState.route_data && !lastSentRoute) {
              console.log('📤 [STREAM] Sending route_complete event');
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'route_complete',
                    data: {
                      distance_nm: accumulatedState.route_data.distance_nm,
                      estimated_hours: accumulatedState.route_data.estimated_hours,
                      waypoints: accumulatedState.route_data.waypoints,
                      route_type: accumulatedState.route_data.route_type,
                      origin_port_code: accumulatedState.route_data.origin_port_code,
                      destination_port_code: accumulatedState.route_data.destination_port_code,
                    },
                  })}\n\n`
                )
              );
              lastSentRoute = true;
            }

            // Send granular weather_data event immediately when available
            if ((accumulatedState.weather_forecast || accumulatedState.weather_consumption) && !lastSentWeather) {
              console.log('📤 [STREAM] Sending weather_data event');
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'weather_data',
                    data: {
                      weather_forecast: accumulatedState.weather_forecast,
                      weather_consumption: accumulatedState.weather_consumption,
                      port_weather_status: accumulatedState.port_weather_status,
                    },
                  })}\n\n`
                )
              );
              // Send agent_complete for weather_agent
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'agent_complete',
                    agent: 'weather_agent',
                  })}\n\n`
                )
              );
            }

            // Stream weather data when available (backward compatibility)
            if (accumulatedState.weather_consumption && !lastSentWeather) {
              console.log('📤 [STREAM] Sending weather_complete event');
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'weather_complete',
                    data: {
                      base_consumption_mt: accumulatedState.weather_consumption.base_consumption_mt,
                      adjusted_consumption_mt: accumulatedState.weather_consumption.weather_adjusted_consumption_mt,
                      additional_fuel_mt: accumulatedState.weather_consumption.additional_fuel_needed_mt,
                      increase_percent: accumulatedState.weather_consumption.consumption_increase_percent,
                      weather_summary: accumulatedState.weather_consumption.voyage_weather_summary,
                      alerts_count: accumulatedState.weather_consumption.weather_alerts?.length || 0,
                      port_weather: accumulatedState.port_weather_status,
                    },
                  })}\n\n`
                )
              );
              lastSentWeather = true;
            }

            // Send granular bunker_data event immediately when available
            if ((accumulatedState.bunker_ports || accumulatedState.port_prices || accumulatedState.bunker_analysis) && !lastSentBunker) {
              console.log('📤 [STREAM] Sending bunker_data event');
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'bunker_data',
                    data: {
                      bunker_ports: accumulatedState.bunker_ports,
                      port_prices: accumulatedState.port_prices,
                      bunker_analysis: accumulatedState.bunker_analysis,
                    },
                  })}\n\n`
                )
              );
              // Send agent_complete for bunker_agent
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'agent_complete',
                    agent: 'bunker_agent',
                  })}\n\n`
                )
              );
            }

            // Stream bunker data when available (backward compatibility)
            if (accumulatedState.bunker_analysis && !lastSentBunker) {
              console.log('📤 [STREAM] Sending bunker_complete event');
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'bunker_complete',
                    data: {
                      recommendations: accumulatedState.bunker_analysis.recommendations,
                      best_option: accumulatedState.bunker_analysis.best_option,
                      worst_option: accumulatedState.bunker_analysis.worst_option,
                      max_savings_usd: accumulatedState.bunker_analysis.max_savings_usd,
                      analysis_summary: accumulatedState.bunker_analysis.analysis_summary,
                    },
                  })}\n\n`
                )
              );
              lastSentBunker = true;
            }

            // Stream final recommendation when available
            if (accumulatedState.final_recommendation && !lastSentFinal) {
              console.log('📤 [STREAM] Sending final recommendation');
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'final_complete',
                    recommendation: accumulatedState.final_recommendation,
                    errors: Object.keys(accumulatedState.agent_errors).length > 0 ? {
                      agent_errors: accumulatedState.agent_errors,
                      agent_status: accumulatedState.agent_status,
                    } : undefined,
                    warnings: Object.entries(accumulatedState.agent_status || {})
                      .filter(([_, status]) => status === 'failed' || status === 'skipped')
                      .map(([agent, status]) => {
                        const error = accumulatedState.agent_errors[agent];
                        return `${agent} ${status}: ${error?.error || 'Unknown error'}`;
                      }),
                  })}\n\n`
                )
              );
              lastSentFinal = true;
            }
          }

          clearInterval(keepAliveInterval);

          // Final check: Send final recommendation if it wasn't sent yet
          if (accumulatedState.final_recommendation && !lastSentFinal) {
            console.log('📤 [STREAM] Sending final recommendation (final check)');
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'final_complete',
                  recommendation: accumulatedState.final_recommendation,
                  errors: Object.keys(accumulatedState.agent_errors).length > 0 ? {
                    agent_errors: accumulatedState.agent_errors,
                    agent_status: accumulatedState.agent_status,
                  } : undefined,
                  warnings: Object.entries(accumulatedState.agent_status || {})
                    .filter(([_, status]) => status === 'failed' || status === 'skipped')
                    .map(([agent, status]) => {
                      const error = accumulatedState.agent_errors[agent];
                      return `${agent} ${status}: ${error?.error || 'Unknown error'}`;
                    }),
                })}\n\n`
              )
            );
            lastSentFinal = true;
          }

          // Send completion signal
          const executionTime = Date.now() - startTime;
          console.log(`✅ [MULTI-AGENT-API] Stream completed in ${executionTime}ms`);

          // Record metrics
          recordRequest(true, executionTime);
          resetPerformanceMetrics();

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          const executionTime = Date.now() - startTime;
          console.error('❌ [MULTI-AGENT-API] Stream error:', error);
          
          recordRequest(false, executionTime);

          // Send error with any partial results we have
          const errorMessage = error instanceof Error ? error.message : String(error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                error: errorMessage,
                execution_time_ms: executionTime,
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    console.error('❌ [MULTI-AGENT-API] Fatal error:', error);
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
      variant: 'multi-agent',
      responseTime: executionTime,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Check if it's an Anthropic API error
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage?.includes('credit balance') || errorMessage?.includes('insufficient credits')) {
      return NextResponse.json(
        {
          error: 'Anthropic API credits exhausted. Please add credits to continue.',
          type: 'credit_error',
          details: errorMessage,
          execution_time_ms: executionTime,
          fallback_endpoint: '/api/chat-langgraph',
        },
        { 
          status: 402, // Payment Required
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        }
      );
    }

    // Generic error response
    return NextResponse.json(
      {
        error: 'An error occurred processing your request',
        type: 'internal_error',
        details: errorMessage,
        execution_time_ms: executionTime,
        fallback_endpoint: '/api/chat-langgraph',
      },
      { 
        status: 500,
        headers: {
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
