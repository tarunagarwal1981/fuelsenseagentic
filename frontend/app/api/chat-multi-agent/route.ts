/**
 * Multi-Agent Chat API Endpoint
 *
 * API endpoint that uses the multi-agent LangGraph system for comprehensive
 * bunker optimization with route planning, weather analysis, and bunker recommendations.
 *
 * Uses Server-Sent Events (SSE) streaming to send progressive updates as each agent completes.
 * Checkpoint persistence (Redis/MemorySaver) via getMultiAgentApp(); thread_id enables
 * conversation continuity and recovery across server restarts.
 */

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getMultiAgentApp } from '@/lib/multi-agent/graph';
import { validateMultiAgentStateShape } from '@/lib/multi-agent/state';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { randomUUID } from 'crypto';
import { generateCorrelationId, formatLogWithCorrelation } from '@/lib/utils/correlation';
import { runWithCorrelation } from '@/lib/monitoring/correlation-context';
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
import { registerAllTools, verifyToolRegistration } from '@/lib/registry/tools';
import { registerAllAgents, verifyAgentRegistration } from '@/lib/registry/agents';
import {
  initializeConfigurations,
  getConfigurationSummary,
  verifyConfigurations,
  isFeatureEnabled,
} from '@/lib/config/registry-loader';

// ============================================================================
// System Initialization
// ============================================================================

let systemInitialized = false;

/**
 * Initialize all system components (configurations, registries)
 * Called lazily on first request to avoid blocking module load
 */
async function initializeSystem(): Promise<void> {
  if (systemInitialized) return;

  console.log('🚀 [SYSTEM] Initializing FuelSense 360...');
  const startTime = Date.now();

  // Step 1: Load YAML configurations
  try {
    await initializeConfigurations({
      enableHotReload: process.env.NODE_ENV === 'development',
    });

    const summary = getConfigurationSummary();
    console.log('📊 [CONFIG] Configuration summary:');
    console.log(`   Agents: ${summary.agents} (${summary.enabled.agents.length} enabled)`);
    console.log(`   Tools: ${summary.tools} (${summary.enabled.tools.length} enabled)`);
    console.log(`   Workflows: ${summary.workflows}`);
    console.log(`   Business Rules: ${summary.rules}`);
    console.log(`   Feature Flags: ${summary.features} (${summary.enabled.features.length} enabled)`);

    // Verify configuration integrity
    const verification = verifyConfigurations();
    if (!verification.valid) {
      console.error('❌ [CONFIG] Configuration verification failed:', verification.errors);
    }
    if (verification.warnings.length > 0) {
      console.warn('⚠️  [CONFIG] Configuration warnings:', verification.warnings);
    }
  } catch (error) {
    console.error('❌ [CONFIG] Failed to initialize configurations:', error);
    // Continue without YAML configs - registries can still work
  }

  // Step 2: Initialize Tool Registry
  try {
    registerAllTools();
    const verification = verifyToolRegistration();
    if (!verification.allRegistered) {
      console.error('❌ [TOOL-REGISTRY] Tool registration verification failed:', verification);
    } else {
      console.log('✅ [TOOL-REGISTRY] All tools registered and verified');
    }
  } catch (error) {
    console.error('❌ [TOOL-REGISTRY] Failed to initialize tool registry:', error);
  }

  // Step 3: Initialize Agent Registry
  try {
    registerAllAgents();
    const verification = verifyAgentRegistration();
    if (!verification.allRegistered) {
      console.error('❌ [AGENT-REGISTRY] Agent registration verification failed:', verification);
    } else {
      console.log('✅ [AGENT-REGISTRY] All agents registered and verified');
    }
  } catch (error) {
    console.error('❌ [AGENT-REGISTRY] Failed to initialize agent registry:', error);
  }

  systemInitialized = true;
  const duration = Date.now() - startTime;
  console.log(`✅ [SYSTEM] FuelSense 360 initialized in ${duration}ms`);
}

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
  /** For conversation continuity and checkpoint recovery. Omit for new conversation. */
  thread_id?: string;
  /** For tracing; send on continuation to keep the same ID. */
  correlation_id?: string;
}

export async function POST(req: Request) {
  // Initialize system on first request (lazy initialization)
  await initializeSystem();

  const startTime = Date.now();
  let correlation_id = generateCorrelationId();
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
          'X-Correlation-ID': correlation_id,
        },
      }
    );
  }

  try {
    // Parse request body
    const body: MultiAgentRequest = await req.json();
    const { message, origin, destination, vessel_speed, departure_date, selectedRouteId, messages, thread_id: bodyThreadId, correlation_id: bodyCorrelationId } = body;

    correlation_id = bodyCorrelationId?.trim() || correlation_id;
    const thread_id = bodyThreadId?.trim() || randomUUID();
    const isContinuation = !!bodyThreadId?.trim();
    if (isContinuation) {
      console.log(formatLogWithCorrelation(correlation_id, 'Checkpoint recovery: loading state', { thread_id }));
    }

    console.log(formatLogWithCorrelation(correlation_id, 'Request started', { message: message.substring(0, 80) }));
    console.log('📝 [MULTI-AGENT-API] Request details:');
    console.log(`   - Message: ${message.substring(0, 100)}...`);
    console.log(`   - Origin: ${origin || 'not provided'}`);
    console.log(`   - Destination: ${destination || 'not provided'}`);
    console.log(`   - Vessel speed: ${vessel_speed || 'not provided'}`);
    console.log(`   - Departure date: ${departure_date || 'not provided'}`);
    console.log(`   - thread_id: ${thread_id} (${isContinuation ? 'continuation' : 'new'})`);

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
            'X-Correlation-ID': correlation_id,
          },
        }
      );
    }

    console.log('🚀 [MULTI-AGENT-API] Starting multi-agent graph execution with streaming...');

    let app;
    try {
      app = await getMultiAgentApp();
      
      // Validate app is properly initialized
      if (!app) {
        throw new Error('getMultiAgentApp() returned null/undefined');
      }
      
      console.log('✅ [MULTI-AGENT-API] App initialized successfully');
      console.log('🔍 [DEBUG] App type:', app.constructor.name);
      console.log('🔍 [DEBUG] App has stream:', typeof app.stream === 'function');
      console.log('🔍 [DEBUG] App has invoke:', typeof app.invoke === 'function');
      console.log('🔍 [DEBUG] App methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(app)));
      
      if (typeof app.stream !== 'function') {
        throw new Error('Multi-agent app missing stream method');
      }
    } catch (e) {
      console.error('❌ [MULTI-AGENT-API] App initialization failed:', e);
      console.error('   Error details:', e instanceof Error ? e.message : String(e));
      console.error('   Error stack:', e instanceof Error ? e.stack : 'no stack');
      const errorMessage = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        {
          error: 'Failed to initialize multi-agent system. Please try again.',
          type: 'initialization_error',
          details: errorMessage,
        },
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'X-Correlation-ID': correlation_id,
          },
        }
      );
    }

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        await runWithCorrelation(correlation_id, async () => {
        try {
          // Send session with thread_id and correlation_id for continuity and tracing
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'session', thread_id, correlation_id })}\n\n`)
          );
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
        multi_bunker_plan: null,
            final_recommendation: null,
            formatted_response: null,
            synthesized_insights: null,
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

          // Build input: for continuation only send the new message (checkpoint has the rest, including correlation_id)
          const input = isContinuation
            ? { messages: [humanMessage] }
            : {
                messages: [humanMessage],
                correlation_id,
                next_agent: '',
                route_data: initialRouteData,
                vessel_timeline: null,
                weather_forecast: null,
                weather_consumption: null,
                port_weather_status: null,
                bunker_ports: null,
                port_prices: null,
                bunker_analysis: null,
                multi_bunker_plan: null,
                final_recommendation: null,
                agent_errors: {},
                agent_status: {},
                agent_context: null,
                selected_route_id: selectedRouteId || null,
              };

          // Stream graph execution with checkpoint config for persistence and recovery
          console.log('🎬 [STREAM] Stream started, calling app.stream()...');
          
          // Add debug logging before stream call
          console.log('🔍 [DEBUG] About to call app.stream() with:');
          console.log('🔍 [DEBUG] initialInput:', JSON.stringify({
            messages: input.messages?.length || 0,
            correlation_id: input.correlation_id,
            hasOtherFields: Object.keys(input).filter(k => k !== 'messages' && k !== 'correlation_id')
          }, null, 2));
          
          const streamConfig = {
            streamMode: 'values' as const,
            recursionLimit: 60,
            configurable: { thread_id, correlation_id },
          };
          console.log('🔍 [DEBUG] streamConfig:', JSON.stringify(streamConfig, null, 2));
          
          // THIS IS WHERE IT FAILS - Add detailed logging
          let streamResult;
          try {
            streamResult = await app.stream(input, streamConfig);
            console.log('✅ [STREAM] app.stream() returned iterator');
          } catch (streamError) {
            console.error('❌ [STREAM] app.stream() failed:', streamError);
            console.error('❌ [STREAM] Error name:', streamError instanceof Error ? streamError.name : 'unknown');
            console.error('❌ [STREAM] Error message:', streamError instanceof Error ? streamError.message : String(streamError));
            console.error('❌ [STREAM] Error stack:', streamError instanceof Error ? streamError.stack : 'no stack');
            console.error('❌ [STREAM] initialInput:', JSON.stringify(input, null, 2));
            console.error('❌ [STREAM] streamConfig:', JSON.stringify(streamConfig, null, 2));
            throw streamError;
          }

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
            if (event.multi_bunker_plan) accumulatedState.multi_bunker_plan = event.multi_bunker_plan;
            if (event.final_recommendation) accumulatedState.final_recommendation = event.final_recommendation;
            if (event.formatted_response) accumulatedState.formatted_response = event.formatted_response;
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
                      origin_coordinates: accumulatedState.route_data.origin_coordinates,
                      destination_coordinates: accumulatedState.route_data.destination_coordinates,
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
                      origin_port_name: accumulatedState.route_data.origin_port_name,
                      destination_port_name: accumulatedState.route_data.destination_port_name,
                      origin_coordinates: accumulatedState.route_data.origin_coordinates,
                      destination_coordinates: accumulatedState.route_data.destination_coordinates,
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
                    formatted_response: accumulatedState.formatted_response || null,
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
                  formatted_response: accumulatedState.formatted_response || null,
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

          // Verify deserialized state shape after checkpoint persistence
          if (!validateMultiAgentStateShape(accumulatedState)) {
            console.warn('⚠️ [MULTI-AGENT-API] State shape validation failed; checkpoint may have serialization issues.');
          }

          // Send completion signal
          const executionTime = Date.now() - startTime;
          console.log(formatLogWithCorrelation(correlation_id, 'Request completed', { executionTime, success: true }));

          // Record metrics
          recordRequest(true, executionTime);
          resetPerformanceMetrics();

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          const executionTime = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorStack = error instanceof Error ? error.stack : 'no stack';
          
          console.error('❌ [STREAM] Stream controller error:', error);
          console.error('❌ [STREAM] Full error details:');
          console.error('   Error:', errorMessage);
          console.error('   Stack:', errorStack);
          console.error(formatLogWithCorrelation(correlation_id, 'Stream error', { error: errorMessage, executionTime }));

          recordRequest(false, executionTime);

          let finalErrorMessage = errorMessage;
          const isCheckpointOrRedis =
            /redis|checkpoint|ECONNREFUSED|ETIMEDOUT|ECONNRESET|putWrites|put\(/i.test(finalErrorMessage);
          const retryAfter = 30;
          if (isCheckpointOrRedis) {
            finalErrorMessage = `Checkpoint persistence failed after retries. Please retry after ${retryAfter} seconds.`;
          }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                error: finalErrorMessage,
                execution_time_ms: executionTime,
                ...(isCheckpointOrRedis && { retry_after_seconds: retryAfter }),
              })}\n\n`
            )
          );
          controller.close();
        }
        });
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
        'X-Correlation-ID': correlation_id,
      },
    });
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : 'no stack';
    
    console.error('❌ [MULTI-AGENT-API] Stream execution failed');
    console.error('   Error:', errorMessage);
    console.error('   Stack:', errorStack);
    console.error('❌ [MULTI-AGENT-API] Fatal error:', error);

    // Record failed request
    recordRequest(false, executionTime);

    // Record A/B test result for failure
    recordABTestResult({
      variant: 'multi-agent',
      responseTime: executionTime,
      success: false,
      error: errorMessage,
    });

    // Check if it's an Anthropic API error
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
            'X-Correlation-ID': correlation_id,
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
          'X-Correlation-ID': correlation_id,
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
