// app/api/chat/route.ts
import Anthropic from '@anthropic-ai/sdk';
import { routeCalculatorToolSchema, executeRouteCalculatorTool } from '@/lib/tools/route-calculator';
import { portFinderToolSchema, executePortFinderTool } from '@/lib/tools/port-finder';
import { priceFetcherToolSchema, executePriceFetcherTool } from '@/lib/tools/price-fetcher';
import { bunkerAnalyzerToolSchema, executeBunkerAnalyzerTool } from '@/lib/tools/bunker-analyzer';

// Edge runtime for fast responses
export const runtime = 'edge';

// Validate API key
if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY environment variable is not set. Please configure it in Netlify environment variables.");
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(req: Request) {
  // Double-check API key at request time
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({
        error: "Server configuration error: ANTHROPIC_API_KEY is not set. Please configure it in Netlify environment variables.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { messages, options = {} } = await req.json();
    
    const {
      fuelQuantityMT = 1000,
      vesselSpeed = 14,
      vesselConsumption = 35,
    } = options;
    
    console.log('🤖 [MANUAL-API] Agent started with', messages.length, 'messages');
    console.log('📝 [MANUAL-API] Last user message:', messages[messages.length - 1]?.content?.substring(0, 100));
    console.log('⚙️ [MANUAL-API] Options:', { fuelQuantityMT, vesselSpeed, vesselConsumption });
    
    // Create a ReadableStream for streaming responses (better Netlify compatibility)
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial keep-alive comment to establish connection
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
          
          const anthropicMessages: Anthropic.MessageParam[] = messages;
        
        let continueLoop = true;
        let loopCount = 0;
        const MAX_LOOPS = 20;
        
        // Store results for final summary
        let calculatedRoute: any = null;
        let foundPorts: any[] = [];
        let fetchedPrices: any = null;
        let analysisResult: any = null;
        
        while (continueLoop && loopCount < MAX_LOOPS) {
          loopCount++;
          console.log(`🔄 [MANUAL-API] Loop iteration ${loopCount}/${MAX_LOOPS}`);
          
          // Stream thinking indicator
          const thinkingEvent = `data: ${JSON.stringify({ type: 'thinking', loop: loopCount })}\n\n`;
          controller.enqueue(encoder.encode(thinkingEvent));
          console.log(`✅ [MANUAL-API] Thinking event enqueued for loop ${loopCount}`);
          
          // Send keep-alive comment after every thinking event to prevent connection timeout
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
          
          // Model selection - can be overridden via env var
          // Available models (cheapest to most expensive):
          // - "claude-haiku-4-5-20251001" (cheapest, excellent tool calling) ⭐ RECOMMENDED
          // - "claude-3-haiku-20240307" (very cheap, good for simple tasks)
          // - "claude-sonnet-4-20250514" (balanced, more expensive)
          // - "claude-opus-4-20250514" (most capable, most expensive)
          const MODEL = process.env.LLM_MODEL || 'claude-haiku-4-5-20251001'; // Default to Haiku 4.5 (best value)
          
          console.log(`🤖 [MANUAL-API] Calling LLM with model: ${MODEL}, message count: ${anthropicMessages.length}`);
          const llmStartTime = Date.now();
          
          // Set up keep-alive interval during LLM call to prevent Netlify from closing connection
          const llmKeepAliveInterval = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(': keep-alive\n\n'));
              console.log(`💚 [MANUAL-API] Sent keep-alive during LLM call`);
            } catch (e) {
              console.warn('⚠️ [MANUAL-API] Error sending keep-alive during LLM:', e);
              clearInterval(llmKeepAliveInterval);
            }
          }, 2000); // Send keep-alive every 2 seconds during LLM call
          
          let response;
          try {
            response = await anthropic.messages.create({
              model: MODEL,
              max_tokens: 4096,
              tools: [
                {
                  name: routeCalculatorToolSchema.name,
                  description: routeCalculatorToolSchema.description,
                  input_schema: {
                    ...routeCalculatorToolSchema.input_schema,
                    required: [...routeCalculatorToolSchema.input_schema.required],
                  },
                },
                {
                  name: portFinderToolSchema.name,
                  description: portFinderToolSchema.description,
                  input_schema: {
                    ...portFinderToolSchema.input_schema,
                    required: [...portFinderToolSchema.input_schema.required],
                  },
                },
                {
                  name: priceFetcherToolSchema.name,
                  description: priceFetcherToolSchema.description,
                  input_schema: {
                    ...priceFetcherToolSchema.input_schema,
                    required: [...priceFetcherToolSchema.input_schema.required],
                  },
                },
                {
                  name: bunkerAnalyzerToolSchema.name,
                  description: bunkerAnalyzerToolSchema.description,
                  input_schema: {
                    ...bunkerAnalyzerToolSchema.input_schema,
                    required: [...bunkerAnalyzerToolSchema.input_schema.required],
                  },
                },
              ],
              messages: anthropicMessages,
            });
          } finally {
            // Always clear the keep-alive interval when LLM call completes
            clearInterval(llmKeepAliveInterval);
            console.log(`🛑 [MANUAL-API] Cleared keep-alive interval after LLM call`);
          }
          
          const llmDuration = Date.now() - llmStartTime;
          console.log(`⏱️ [MANUAL-API] LLM responded in ${llmDuration}ms`);
          console.log(`📊 [MANUAL-API] LLM response - stop_reason: ${response.stop_reason}, content blocks: ${response.content.length}`);
          console.log(`📊 [MANUAL-API] Current state before processing: route=${!!calculatedRoute}, ports=${foundPorts.length}, prices=${!!fetchedPrices}, analysis=${!!analysisResult}`);
          
          if (response.stop_reason === 'tool_use') {
            const toolUseBlock = response.content.find(
              (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
            );
            
            if (!toolUseBlock) {
              console.warn("⚠️ [MANUAL-API] Tool use block not found, breaking loop");
              break;
            }
            
            console.log(`🔧 [MANUAL-API] Executing tool: ${toolUseBlock.name}`);
            console.log(`📥 [MANUAL-API] Tool input:`, JSON.stringify(toolUseBlock.input).substring(0, 200));
            
            // Stream tool usage
            const toolUseEvent = `data: ${JSON.stringify({ 
              type: 'tool_use', 
              tool: toolUseBlock.name 
            })}\n\n`;
            controller.enqueue(encoder.encode(toolUseEvent));
            console.log(`✅ [MANUAL-API] Tool use event enqueued: ${toolUseBlock.name}`);
            // Keep-alive after tool use to prevent connection timeout
            controller.enqueue(encoder.encode(': keep-alive\n\n'));
            
            let toolResult: any;
            const toolStartTime = Date.now();
            
            // Set up keep-alive interval during tool execution to prevent Netlify from closing connection
            const keepAliveInterval = setInterval(() => {
              try {
                controller.enqueue(encoder.encode(': keep-alive\n\n'));
                console.log(`💚 [MANUAL-API] Sent keep-alive during tool execution`);
              } catch (e) {
                console.warn('⚠️ [MANUAL-API] Error sending keep-alive:', e);
                clearInterval(keepAliveInterval);
              }
            }, 2000); // Send keep-alive every 2 seconds during tool execution
            
            try {
              // Execute tool
              switch (toolUseBlock.name) {
                case 'calculate_route':
                  console.log("🗺️ [MANUAL-API] Executing calculate_route tool...");
                  toolResult = await executeRouteCalculatorTool(toolUseBlock.input);
                  calculatedRoute = toolResult;
                  console.log(`✅ [MANUAL-API] Route calculated: ${toolResult?.distance_nm}nm, ${toolResult?.estimated_hours}h`);
                  break;
                  
                case 'find_ports_near_route':
                  console.log("⚓ [MANUAL-API] Executing find_ports_near_route tool...");
                  toolResult = await executePortFinderTool(toolUseBlock.input);
                  foundPorts = toolResult.ports || [];
                  console.log(`✅ [MANUAL-API] Found ${foundPorts.length} ports near route`);
                  break;
                  
                case 'fetch_fuel_prices':
                  console.log("💰 [MANUAL-API] Executing fetch_fuel_prices tool...");
                  toolResult = await executePriceFetcherTool(toolUseBlock.input);
                  fetchedPrices = toolResult;
                  const priceCount = toolResult?.prices_by_port ? Object.keys(toolResult.prices_by_port).length : 0;
                  console.log(`✅ [MANUAL-API] Fetched prices for ${priceCount} ports`);
                  break;
                  
                case 'analyze_bunker_options':
                  console.log("📊 [MANUAL-API] Executing analyze_bunker_options tool...");
                  // Ensure we use the actual fetchedPrices we stored, not what LLM might pass
                  const analyzerInput = {
                    ...(toolUseBlock.input as any),
                    port_prices: fetchedPrices || (toolUseBlock.input as any).port_prices, // Use stored prices if available
                    fuel_quantity_mt: (toolUseBlock.input as any).fuel_quantity_mt || fuelQuantityMT,
                    vessel_speed_knots: (toolUseBlock.input as any).vessel_speed_knots || vesselSpeed,
                    vessel_consumption_mt_per_day: (toolUseBlock.input as any).vessel_consumption_mt_per_day || vesselConsumption,
                  };
                  
                  // Validate port_prices structure before calling
                  if (!analyzerInput.port_prices || !analyzerInput.port_prices.prices_by_port) {
                    console.error("❌ [MANUAL-API] Invalid port_prices in analyzer input:", {
                      hasPortPrices: !!analyzerInput.port_prices,
                      hasPricesByPort: !!analyzerInput.port_prices?.prices_by_port,
                      fetchedPricesHasPricesByPort: !!fetchedPrices?.prices_by_port,
                    });
                    throw new Error("Port prices data is missing or invalid. Please fetch fuel prices first.");
                  }
                  
                  toolResult = await executeBunkerAnalyzerTool(analyzerInput);
                  analysisResult = toolResult;
                  const recCount = toolResult?.recommendations?.length || 0;
                  console.log(`✅ [MANUAL-API] Analysis complete: ${recCount} recommendations`);
                  break;
                  
                default:
                  console.warn(`⚠️ [MANUAL-API] Unknown tool: ${toolUseBlock.name}`);
                  toolResult = { error: `Unknown tool: ${toolUseBlock.name}` };
              }
            } finally {
              // Always clear the keep-alive interval when tool execution completes
              clearInterval(keepAliveInterval);
              console.log(`🛑 [MANUAL-API] Cleared keep-alive interval after tool execution`);
            }
            
            const toolDuration = Date.now() - toolStartTime;
            console.log(`⏱️ [MANUAL-API] Tool ${toolUseBlock.name} completed in ${toolDuration}ms`);
            
            // Add to message history
            anthropicMessages.push({
              role: 'assistant',
              content: response.content,
            });
            
            anthropicMessages.push({
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: toolUseBlock.id,
                  content: JSON.stringify(toolResult),
                },
              ],
            });
            
          } else if (response.stop_reason === 'end_turn') {
            console.log("✅ [MANUAL-API] LLM provided final answer (end_turn)");
            const textBlock = response.content.find(
              (block): block is Anthropic.TextBlock => block.type === 'text'
            );
            
            // Check if we have complete data
            const hasCompleteData = analysisResult && analysisResult.recommendations && analysisResult.recommendations.length > 0;
            const hasRouteOnly = calculatedRoute && foundPorts.length === 0 && !fetchedPrices && !analysisResult;
            const hasRouteAndPorts = calculatedRoute && foundPorts.length > 0 && !fetchedPrices && !analysisResult;
            const hasRoutePortsAndPrices = calculatedRoute && foundPorts.length > 0 && fetchedPrices && !analysisResult;
            
            console.log(`📊 [MANUAL-API] Data completeness check:`, {
              hasCompleteData,
              hasRouteOnly,
              hasRouteAndPorts,
              hasRoutePortsAndPrices,
              hasRoute: !!calculatedRoute,
              portsCount: foundPorts.length,
              hasPrices: !!fetchedPrices,
              hasAnalysis: !!analysisResult,
            });
            
            // If we don't have complete analysis, force continuation
            if (!hasCompleteData) {
              if (hasRouteOnly) {
                // Only have route - need to find ports
                console.warn("⚠️ [MANUAL-API] Only have route data - forcing continuation to find ports");
                anthropicMessages.push({
                  role: 'assistant',
                  content: response.content,
                });
                anthropicMessages.push({
                  role: 'user',
                  content: "Good, you've calculated the route. Now please find bunker ports near this route, fetch their fuel prices, and then analyze the options to provide ranked recommendations with cost analysis.",
                });
                console.log("🔄 [MANUAL-API] Added follow-up message to find ports");
                continue; // Continue loop
              } else if (hasRouteAndPorts) {
                // Have route and ports - need to fetch prices
                console.warn("⚠️ [MANUAL-API] Have route and ports but no prices - forcing continuation to fetch prices");
                anthropicMessages.push({
                  role: 'assistant',
                  content: response.content,
                });
                anthropicMessages.push({
                  role: 'user',
                  content: "Good, you've found the ports. Now please fetch the current fuel prices for these ports, and then analyze the options to provide ranked recommendations with cost analysis.",
                });
                console.log("🔄 [MANUAL-API] Added follow-up message to fetch prices");
                continue; // Continue loop
              } else if (hasRoutePortsAndPrices) {
                // Have route, ports, and prices - need to analyze
                console.warn("⚠️ [MANUAL-API] Have route, ports, and prices but no analysis - forcing continuation to analyze");
                anthropicMessages.push({
                  role: 'assistant',
                  content: response.content,
                });
                anthropicMessages.push({
                  role: 'user',
                  content: "Good, you have the route, ports, and prices. Now please analyze the bunker options and provide ranked recommendations with cost analysis including total cost, deviation cost, and savings.",
                });
                console.log("🔄 [MANUAL-API] Added follow-up message to analyze");
                continue; // Continue loop
              } else if (textBlock) {
                // Check if text suggests premature ending
                const textLower = textBlock.text.toLowerCase();
                const isPrematureEnd = !textLower.includes("analysis") && 
                                      !textLower.includes("recommendation") && 
                                      !textLower.includes("option") &&
                                      !textLower.includes("bunker");
                
                if (isPrematureEnd) {
                  console.warn("⚠️ [MANUAL-API] LLM ended prematurely - text doesn't mention analysis");
                  anthropicMessages.push({
                    role: 'assistant',
                    content: response.content,
                  });
                  anthropicMessages.push({
                    role: 'user',
                    content: "Please continue with the full analysis. I need you to complete all steps: find bunker ports, fetch fuel prices, and provide ranked recommendations with cost analysis.",
                  });
                  console.log("🔄 [MANUAL-API] Added follow-up message to continue");
                  continue; // Continue loop
                }
              }
            }
            
            if (textBlock) {
              console.log(`📝 [MANUAL-API] Final text response length: ${textBlock.text.length} chars`);
              // Stream the final text response
              const textEvent = `data: ${JSON.stringify({ 
                type: 'text', 
                content: textBlock.text 
              })}\n\n`;
              controller.enqueue(encoder.encode(textEvent));
              console.log("✅ [MANUAL-API] Text event enqueued, length:", textBlock.text.length);
              // Keep-alive after text
              controller.enqueue(encoder.encode(': keep-alive\n\n'));
              
              // Stream structured data for UI - send even if incomplete
              if (calculatedRoute || foundPorts.length > 0 || fetchedPrices || analysisResult) {
                console.log("📊 [MANUAL-API] Sending analysis data to frontend:", {
                  hasRoute: !!calculatedRoute,
                  portsCount: foundPorts.length,
                  hasPrices: !!fetchedPrices,
                  hasAnalysis: !!analysisResult,
                  recommendationsCount: analysisResult?.recommendations?.length || 0,
                });
                const analysisEvent = `data: ${JSON.stringify({ 
                  type: 'analysis',
                  route: calculatedRoute,
                  ports: foundPorts,
                  prices: fetchedPrices,
                  analysis: analysisResult,
                })}\n\n`;
                controller.enqueue(encoder.encode(analysisEvent));
                console.log("✅ [MANUAL-API] Analysis event enqueued");
                // Keep-alive after analysis
                controller.enqueue(encoder.encode(': keep-alive\n\n'));
              } else {
                console.log("⚠️ [MANUAL-API] No data to send");
              }
            } else {
              console.warn("⚠️ [MANUAL-API] No text block found in end_turn response");
            }
            
            continueLoop = false;
            console.log("🛑 [MANUAL-API] Loop ending - received end_turn");
          } else {
            console.log(`🛑 [MANUAL-API] Loop ending - stop_reason: ${response.stop_reason}`);
            continueLoop = false;
          }
        }
        
        console.log(`✅ [MANUAL-API] Agent loop completed after ${loopCount} iterations`);
        console.log(`📊 [MANUAL-API] Final state: route=${!!calculatedRoute}, ports=${foundPorts.length}, prices=${!!fetchedPrices}, analysis=${!!analysisResult}`);
        
        // Stream done signal
        console.log("🏁 [MANUAL-API] Sending done signal");
        
        // Send a keep-alive right before done to ensure connection is still open
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
          console.log("✅ [MANUAL-API] Keep-alive sent before done event");
        } catch (e) {
          console.warn('⚠️ [MANUAL-API] Error sending keep-alive before done:', e);
        }
        
        const doneEvent = `data: ${JSON.stringify({ type: 'done' })}\n\n`;
        try {
          controller.enqueue(encoder.encode(doneEvent));
          console.log("✅ [MANUAL-API] Done event enqueued");
          
          // Send another keep-alive after done to ensure it's transmitted
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
          console.log("✅ [MANUAL-API] Keep-alive sent after done event");
          
          // Longer delay to ensure all events are sent before closing
          // This gives Netlify time to flush the stream
          await new Promise(resolve => setTimeout(resolve, 1000));
          controller.close();
          console.log("✅ [MANUAL-API] Stream closed successfully");
        } catch (closeError) {
          console.error('❌ [MANUAL-API] Error closing stream:', closeError);
          // Try to close anyway
          try {
            controller.close();
          } catch (e) {
            console.error('❌ [MANUAL-API] Error in final close attempt:', e);
          }
        }
        
      } catch (error: any) {
        console.error('❌ [MANUAL-API] Agent error:', error);
        try {
          const errorEvent = `data: ${JSON.stringify({ 
            type: 'error', 
            error: error.message 
          })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
          await new Promise(resolve => setTimeout(resolve, 100));
          controller.close();
        } catch (closeError) {
          console.error('❌ [MANUAL-API] Error closing stream after error:', closeError);
        }
      }
      },
    });
    
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx/proxy buffering
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
    
  } catch (error: any) {
    console.error('❌ [MANUAL-API] API route error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        } 
      }
    );
  }
}

// Handle OPTIONS for CORS
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

