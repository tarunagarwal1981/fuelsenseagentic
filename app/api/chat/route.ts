// app/api/chat/route.ts
import Anthropic from '@anthropic-ai/sdk';
import { routeCalculatorToolSchema, executeRouteCalculatorTool } from '@/lib/tools/route-calculator';
import { portFinderToolSchema, executePortFinderTool } from '@/lib/tools/port-finder';
import { priceFetcherToolSchema, executePriceFetcherTool } from '@/lib/tools/price-fetcher';
import { bunkerAnalyzerToolSchema, executeBunkerAnalyzerTool } from '@/lib/tools/bunker-analyzer';

// Edge runtime for fast responses
export const runtime = 'edge';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const { messages, options = {} } = await req.json();
    
    const {
      fuelQuantityMT = 1000,
      vesselSpeed = 14,
      vesselConsumption = 35,
    } = options;
    
    console.log('🤖 Agent started with', messages.length, 'messages');
    
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
          
          if (response.stop_reason === 'tool_use') {
            const toolUseBlock = response.content.find(
              (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
            );
            
            if (!toolUseBlock) break;
            
            // Stream tool usage
            await writer.write(
              encoder.encode(`data: ${JSON.stringify({ 
                type: 'tool_use', 
                tool: toolUseBlock.name 
              })}\n\n`)
            );
            
            let toolResult: any;
            
            // Execute tool
            switch (toolUseBlock.name) {
              case 'calculate_route':
                toolResult = await executeRouteCalculatorTool(toolUseBlock.input);
                calculatedRoute = toolResult;
                break;
                
              case 'find_ports_near_route':
                toolResult = await executePortFinderTool(toolUseBlock.input);
                foundPorts = toolResult.ports || [];
                break;
                
              case 'fetch_fuel_prices':
                toolResult = await executePriceFetcherTool(toolUseBlock.input);
                fetchedPrices = toolResult;
                break;
                
              case 'analyze_bunker_options':
                const analyzerInput = {
                  ...(toolUseBlock.input as any),
                  fuel_quantity_mt: (toolUseBlock.input as any).fuel_quantity_mt || fuelQuantityMT,
                  vessel_speed_knots: (toolUseBlock.input as any).vessel_speed_knots || vesselSpeed,
                  vessel_consumption_mt_per_day: (toolUseBlock.input as any).vessel_consumption_mt_per_day || vesselConsumption,
                };
                toolResult = await executeBunkerAnalyzerTool(analyzerInput);
                analysisResult = toolResult;
                break;
                
              default:
                toolResult = { error: `Unknown tool: ${toolUseBlock.name}` };
            }
            
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
            const textBlock = response.content.find(
              (block): block is Anthropic.TextBlock => block.type === 'text'
            );
            
            if (textBlock) {
              // Stream the final text response
              await writer.write(
                encoder.encode(`data: ${JSON.stringify({ 
                  type: 'text', 
                  content: textBlock.text 
                })}\n\n`)
              );
              
              // Stream structured data for UI
              if (analysisResult) {
                await writer.write(
                  encoder.encode(`data: ${JSON.stringify({ 
                    type: 'analysis',
                    route: calculatedRoute,
                    ports: foundPorts,
                    prices: fetchedPrices,
                    analysis: analysisResult,
                  })}\n\n`)
                );
              }
            }
            
            continueLoop = false;
          } else {
            continueLoop = false;
          }
        }
        
        // Stream done signal
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        
      } catch (error: any) {
        console.error('Agent error:', error);
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            error: error.message 
          })}\n\n`)
        );
      } finally {
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
    console.error('API route error:', error);
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

