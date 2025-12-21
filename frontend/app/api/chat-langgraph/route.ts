// app/api/chat-langgraph/route.ts
export const runtime = "edge";

import { app } from "@/lib/langgraph/graph";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

// Helper function to clean markdown formatting
function cleanMarkdown(text: string): string {
  if (!text) return text;
  return text
    // Remove bold/italic markers
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove list markers but keep content
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    // Remove code blocks but keep content
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```/g, '').trim())
    .replace(/`([^`]+)`/g, '$1')
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function POST(req: Request) {
  console.log("📨 LangGraph API: Received request");

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ ANTHROPIC_API_KEY is not set");
    return new Response(
      JSON.stringify({
        error: "Server configuration error: ANTHROPIC_API_KEY is not set. Please configure it in Netlify environment variables.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { messages } = await req.json();

    console.log(`📝 Processing ${messages.length} messages`);

    // Convert last user message to HumanMessage
    const lastMessage = messages[messages.length - 1];
    const humanMessage = new HumanMessage(lastMessage.content);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          console.log("🚀 [API] Starting graph stream...");
          console.log("📝 [API] Input message:", humanMessage.content.substring(0, 100));
          
          // Stream graph execution with increased recursion limit
          // Default is 25, but complex queries may need more iterations
          const streamResult = await app.stream(
            { messages: [humanMessage] },
            { 
              streamMode: "values",
              recursionLimit: 50, // Increased from default 25 to handle complex multi-step queries
            }
          );

          console.log("✅ [API] Stream created, iterating events...");
          let iterationCount = 0;

          // Track accumulated state across all events
          let accumulatedState = {
            route: null as any,
            ports: null as any,
            prices: null as any,
            analysis: null as any,
          };
          
          let finalTextResponse = "";
          let lastEvent: any = null;
          let eventCount = 0;

          for await (const event of streamResult) {
            iterationCount++;
            eventCount++;
            lastEvent = event; // Keep track of the last event
            console.log(`📤 [API] Streaming event #${eventCount} (iteration ${iterationCount})`);
            console.log("📊 [API] State keys:", Object.keys(event));
            console.log("📍 [API] Route:", event.route ? `present (${event.route.distance_nm}nm)` : "null");
            console.log("⚓ [API] Ports:", event.ports ? `${event.ports.length} ports` : "null");
            console.log("💰 [API] Prices:", event.prices ? `${event.prices.length} ports` : "null");
            console.log("📊 [API] Analysis:", event.analysis ? `present (${event.analysis.recommendations?.length || 0} recs)` : "null");
            console.log("💬 [API] Messages:", event.messages ? `${event.messages.length} messages` : "null");
            
            // Log the last message type and content preview
            if (event.messages && event.messages.length > 0) {
              const lastMsg = event.messages[event.messages.length - 1];
              const msgType = lastMsg.constructor.name;
              const hasToolCalls = (lastMsg as any).tool_calls && (lastMsg as any).tool_calls.length > 0;
              const contentPreview = typeof (lastMsg as any).content === 'string' 
                ? (lastMsg as any).content.substring(0, 100) 
                : 'non-string content';
              console.log(`💬 [API] Last message: type=${msgType}, hasToolCalls=${hasToolCalls}, content="${contentPreview}..."`);
            }

            // Accumulate state - keep the latest non-null values
            if (event.route) accumulatedState.route = event.route;
            if (event.ports) accumulatedState.ports = event.ports;
            if (event.prices) accumulatedState.prices = event.prices;
            if (event.analysis) accumulatedState.analysis = event.analysis;

            // Extract final response from messages
            const lastMsg = event.messages && event.messages.length > 0 ? event.messages[event.messages.length - 1] : null;
            
            if (!lastMsg) {
              console.log("⚠️ No messages in event, skipping");
              continue;
            }
            
            // Check if message is AIMessage and has tool_calls
            const toolCalls = lastMsg instanceof AIMessage ? lastMsg.tool_calls : undefined;
            
            // Extract text response (only if no tool calls - means it's the final answer)
            if (lastMsg instanceof AIMessage && !toolCalls && lastMsg.content) {
              const content = typeof lastMsg.content === 'string' ? lastMsg.content : String(lastMsg.content || '');
              if (content.trim()) {
                finalTextResponse = cleanMarkdown(content);
                // Send text immediately when we get it
                const textData = JSON.stringify({
                  type: "text",
                  content: finalTextResponse,
                });
                controller.enqueue(encoder.encode(`data: ${textData}\n\n`));
              }
            }
            
            // Send tool call updates
            if (toolCalls && toolCalls.length > 0) {
              const toolName = toolCalls[0].name;
              const toolLabels: Record<string, string> = {
                calculate_route: "Calculating Route",
                find_bunker_ports: "Finding Bunker Ports",
                get_fuel_prices: "Fetching Fuel Prices",
                analyze_bunker_options: "Analyzing Bunker Options",
              };
              
              const thinkingData = JSON.stringify({
                type: "thinking",
                message: `Using ${toolLabels[toolName] || toolName}...`,
              });
              controller.enqueue(encoder.encode(`data: ${thinkingData}\n\n`));
            }
            
            // Send state updates as graph_event (for backwards compatibility and real-time updates)
            const routeData = accumulatedState.route ? {
              distance_nm: accumulatedState.route.distance_nm,
              waypoints: accumulatedState.route.waypoints || [],
              estimated_hours: accumulatedState.route.estimated_hours,
              origin_port_code: accumulatedState.route.origin_port_code,
              destination_port_code: accumulatedState.route.destination_port_code,
              route_type: accumulatedState.route.route_type,
            } : null;
            
            const graphEventData = JSON.stringify({
              type: "graph_event",
              route: routeData,
              ports: accumulatedState.ports && Array.isArray(accumulatedState.ports) ? accumulatedState.ports : null,
              prices: accumulatedState.prices && Array.isArray(accumulatedState.prices) ? accumulatedState.prices : null,
              analysis: accumulatedState.analysis && accumulatedState.analysis.recommendations ? accumulatedState.analysis : null,
              message: typeof lastMsg.content === 'string' ? lastMsg.content : (lastMsg.content || ''),
              tool_calls: toolCalls,
            });
            controller.enqueue(encoder.encode(`data: ${graphEventData}\n\n`));
          }
          
          console.log(`✅ [API] Stream completed. Processed ${eventCount} events in ${iterationCount} iterations`);
          console.log(`📊 [API] Final state: route=${!!lastEvent?.route}, ports=${!!lastEvent?.ports}, prices=${!!lastEvent?.prices}, analysis=${!!lastEvent?.analysis}`);
          
          // If we didn't get a final text response, try to extract from the last event
          if (!finalTextResponse && lastEvent && lastEvent.messages) {
            console.log("🔍 Searching for final text response in last event...");
            // Find the last AIMessage without tool calls
            for (let i = lastEvent.messages.length - 1; i >= 0; i--) {
              const msg = lastEvent.messages[i];
              if (msg instanceof AIMessage) {
                // Check if it has tool calls - if not, it's a final response
                if (!msg.tool_calls || msg.tool_calls.length === 0) {
                  const content = typeof msg.content === 'string' ? msg.content : String(msg.content || '');
                  if (content.trim()) {
                    finalTextResponse = cleanMarkdown(content);
                    console.log("✅ Found final text response:", finalTextResponse.substring(0, 100));
                    break;
                  }
                }
              }
            }
          }
          
          // After all events, send the final text response (cleaned) if we haven't already
          if (finalTextResponse && finalTextResponse.trim()) {
            const textData = JSON.stringify({
              type: "text",
              content: finalTextResponse,
            });
            controller.enqueue(encoder.encode(`data: ${textData}\n\n`));
            console.log("📤 Sent final text response");
          } else {
            console.warn("⚠️ No final text response found - LLM may have completed without text");
            // Only send default message if we have analysis data to show
            if (accumulatedState.analysis && accumulatedState.analysis.recommendations) {
              const defaultText = JSON.stringify({
                type: "text",
                content: "I've completed the analysis. Please check the map and table below for results.",
              });
              controller.enqueue(encoder.encode(`data: ${defaultText}\n\n`));
            }
          }
          
          // Send analysis event (like manual version) to trigger map/table display
          // Send if we have route + ports + prices (even without analysis, we can show map/table)
          const hasRoute = accumulatedState.route && accumulatedState.route.distance_nm;
          const hasPorts = accumulatedState.ports && Array.isArray(accumulatedState.ports) && accumulatedState.ports.length > 0;
          const hasPrices = accumulatedState.prices && Array.isArray(accumulatedState.prices) && accumulatedState.prices.length > 0;
          const hasAnalysis = accumulatedState.analysis && accumulatedState.analysis.recommendations;
          
          if (hasRoute && (hasPorts || hasPrices || hasAnalysis)) {
            console.log("📤 Sending analysis event:", {
              hasRoute: !!hasRoute,
              hasPorts: !!hasPorts,
              hasPrices: !!hasPrices,
              hasAnalysis: !!hasAnalysis,
            });
            
            const routeData = accumulatedState.route ? {
              distance_nm: accumulatedState.route.distance_nm,
              waypoints: accumulatedState.route.waypoints || [],
              estimated_hours: accumulatedState.route.estimated_hours,
              origin_port_code: accumulatedState.route.origin_port_code,
              destination_port_code: accumulatedState.route.destination_port_code,
              route_type: accumulatedState.route.route_type,
            } : null;
            
            const analysisData = JSON.stringify({
              type: "analysis",
              route: routeData,
              ports: hasPorts ? accumulatedState.ports : null,
              prices: hasPrices ? accumulatedState.prices : null,
              analysis: hasAnalysis ? accumulatedState.analysis : null,
            });
            
            controller.enqueue(encoder.encode(`data: ${analysisData}\n\n`));
            console.log("✅ Analysis event sent");
          } else {
            console.log("⚠️ Not sending analysis event - missing required data:", {
              hasRoute: !!hasRoute,
              hasPorts: !!hasPorts,
              hasPrices: !!hasPrices,
              hasAnalysis: !!hasAnalysis,
            });
          }

          // Send completion
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } catch (error) {
          console.error("❌ Stream error:", error);
          
          const errorData = JSON.stringify({
            type: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          });
          
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("❌ API error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500 }
    );
  }
}
