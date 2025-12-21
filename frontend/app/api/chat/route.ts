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
    
    // Create a TransformStream for streaming responses
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    
    // Run agent in background
    (async () => {
      try {
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
          await writer.write(
            encoder.encode(`data: ${JSON.stringify({ type: 'thinking', loop: loopCount })}\n\n`)
          );
          
          // Model selection - can be overridden via env var
          // Available models (cheapest to most expensive):
          // - "claude-haiku-4-5-20251001" (cheapest, excellent tool calling) ⭐ RECOMMENDED
          // - "claude-3-haiku-20240307" (very cheap, good for simple tasks)
          // - "claude-sonnet-4-20250514" (balanced, more expensive)
          // - "claude-opus-4-20250514" (most capable, most expensive)
          const MODEL = process.env.LLM_MODEL || 'claude-haiku-4-5-20251001'; // Default to Haiku 4.5 (best value)
          
          console.log(`🤖 [MANUAL-API] Calling LLM with model: ${MODEL}, message count: ${anthropicMessages.length}`);
          const llmStartTime = Date.now();
          const response = await anthropic.messages.create({
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
            await writer.write(
              encoder.encode(`data: ${JSON.stringify({ 
                type: 'tool_use', 
                tool: toolUseBlock.name 
              })}\n\n`)
            );
            
            let toolResult: any;
            const toolStartTime = Date.now();
            
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
                const analyzerInput = {
                  ...(toolUseBlock.input as any),
                  fuel_quantity_mt: (toolUseBlock.input as any).fuel_quantity_mt || fuelQuantityMT,
                  vessel_speed_knots: (toolUseBlock.input as any).vessel_speed_knots || vesselSpeed,
                  vessel_consumption_mt_per_day: (toolUseBlock.input as any).vessel_consumption_mt_per_day || vesselConsumption,
                };
                toolResult = await executeBunkerAnalyzerTool(analyzerInput);
                analysisResult = toolResult;
                const recCount = toolResult?.recommendations?.length || 0;
                console.log(`✅ [MANUAL-API] Analysis complete: ${recCount} recommendations`);
                break;
                
              default:
                console.warn(`⚠️ [MANUAL-API] Unknown tool: ${toolUseBlock.name}`);
                toolResult = { error: `Unknown tool: ${toolUseBlock.name}` };
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
              await writer.write(
                encoder.encode(`data: ${JSON.stringify({ 
                  type: 'text', 
                  content: textBlock.text 
                })}\n\n`)
              );
              
              // Stream structured data for UI - send even if incomplete
              if (calculatedRoute || foundPorts.length > 0 || fetchedPrices || analysisResult) {
                console.log("📊 [MANUAL-API] Sending analysis data to frontend:", {
                  hasRoute: !!calculatedRoute,
                  portsCount: foundPorts.length,
                  hasPrices: !!fetchedPrices,
                  hasAnalysis: !!analysisResult,
                  recommendationsCount: analysisResult?.recommendations?.length || 0,
                });
                await writer.write(
                  encoder.encode(`data: ${JSON.stringify({ 
                    type: 'analysis',
                    route: calculatedRoute,
                    ports: foundPorts,
                    prices: fetchedPrices,
                    analysis: analysisResult,
                  })}\n\n`)
                );
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
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        
      } catch (error: any) {
        console.error('❌ [MANUAL-API] Agent error:', error);
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            error: error.message 
          })}\n\n`)
        );
      } finally {
        console.log("🏁 [MANUAL-API] Closing stream writer");
        await writer.close();
      }
    })();
    
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
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

