// app/api/chat-langgraph/route.ts
// Node.js runtime required: LangGraph tools use ServiceContainer/repositories (fs, path, process.cwd)
export const runtime = "nodejs";

import { app } from "@/lib/langgraph/graph";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

// Helper function to clean markdown formatting
function cleanMarkdown(text: string): string {
  if (!text) return text;
  
  let cleaned = text;
  
  // Remove code blocks first (to avoid processing markdown inside code)
  cleaned = cleaned.replace(/```[\s\S]*?```/g, (match) => {
    return match.replace(/```[\w]*\n?/g, '').replace(/```/g, '').trim();
  });
  
  // Remove inline code
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');
  
  // Remove bold markers - handle both **text** and __text__
  // Process multiple times to catch nested or edge cases
  for (let i = 0; i < 3; i++) {
    cleaned = cleaned.replace(/\*\*([^*]+?)\*\*/g, '$1');
    cleaned = cleaned.replace(/__([^_]+?)__/g, '$1');
  }
  // Remove any remaining ** or __ pairs
  cleaned = cleaned.replace(/\*\*/g, '');
  cleaned = cleaned.replace(/__/g, '');
  
  // Remove italic markers - handle both *text* and _text_
  // Process multiple times to catch all cases
  for (let i = 0; i < 3; i++) {
    cleaned = cleaned.replace(/\*([^*\n]+?)\*/g, '$1');
    cleaned = cleaned.replace(/_([^_\n]+?)_/g, '$1');
  }
  
  // Remove headers (# Header)
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
  
  // Remove horizontal rules
  cleaned = cleaned.replace(/^[-*_]{3,}$/gm, '');
  
  // Remove links but keep text [text](url) -> text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
  
  // Remove images ![alt](url) -> alt
  cleaned = cleaned.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1');
  
  // Remove strikethrough
  cleaned = cleaned.replace(/~~([^~]+)~~/g, '$1');
  
  // Remove list markers but keep content
  cleaned = cleaned.replace(/^[-*+]\s+/gm, '');
  cleaned = cleaned.replace(/^\d+\.\s+/gm, '');
  
  // Clean up extra whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' '); // Multiple spaces/tabs to single space
  
  return cleaned.trim();
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
          // Send initial keep-alive comment to establish connection
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
          
          console.log("🚀 [API] Starting graph stream...");
          const inputPreview = typeof humanMessage.content === 'string' 
            ? humanMessage.content.substring(0, 100) 
            : String(humanMessage.content || '').substring(0, 100);
          console.log("📝 [API] Input message:", inputPreview);
          
          // Stream graph execution with increased recursion limit
          // Default is 25, but complex queries may need more iterations
          const streamResult = await app.stream(
            { messages: [humanMessage] },
            { 
              streamMode: "values",
              recursionLimit: 100, // Increased to handle complex multi-step queries (route -> ports -> prices -> analysis)
            }
          );

          console.log("✅ [API] Stream created, iterating events...");
          let iterationCount = 0;
          
          // Set up keep-alive interval during graph execution to prevent Netlify from closing connection
          const keepAliveInterval = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(': keep-alive\n\n'));
              console.log(`💚 [API] Sent keep-alive during graph execution`);
            } catch (e) {
              console.warn('⚠️ [API] Error sending keep-alive:', e);
              clearInterval(keepAliveInterval);
            }
          }, 2000); // Send keep-alive every 2 seconds during graph execution

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
            if (event.route) {
              accumulatedState.route = event.route;
              console.log("📌 [API] Accumulated route:", event.route.distance_nm, "nm");
            }
            if (event.ports) {
              accumulatedState.ports = event.ports;
              console.log("📌 [API] Accumulated ports:", event.ports.length);
            }
            if (event.prices) {
              accumulatedState.prices = event.prices;
              console.log("📌 [API] Accumulated prices:", event.prices.length);
            }
            if (event.analysis) {
              accumulatedState.analysis = event.analysis;
              console.log("📌 [API] Accumulated analysis:", event.analysis.recommendations?.length || 0, "recommendations");
            }

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
                console.log("✅ [API] Text event enqueued, length:", finalTextResponse.length);
                // Keep-alive after text
                controller.enqueue(encoder.encode(': keep-alive\n\n'));
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
            
            // Send keep-alive after every few events to prevent connection timeout
            if (eventCount % 3 === 0) {
              controller.enqueue(encoder.encode(': keep-alive\n\n'));
            }
          }
          
          // Clear keep-alive interval when graph execution completes
          clearInterval(keepAliveInterval);
          console.log(`🛑 [API] Cleared keep-alive interval after graph execution`);
          
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
          // Send if we have ANY data (route, ports, prices, or analysis) - partial data is better than nothing
          const hasRoute = accumulatedState.route && accumulatedState.route.distance_nm;
          const hasPorts = accumulatedState.ports && Array.isArray(accumulatedState.ports) && accumulatedState.ports.length > 0;
          const hasPrices = accumulatedState.prices && Array.isArray(accumulatedState.prices) && accumulatedState.prices.length > 0;
          const hasAnalysis = accumulatedState.analysis && accumulatedState.analysis.recommendations;
          
          console.log("📊 [API] Final accumulated state check:", {
            hasRoute: !!hasRoute,
            hasPorts: !!hasPorts,
            hasPrices: !!hasPrices,
            hasAnalysis: !!hasAnalysis,
            routeDistance: accumulatedState.route?.distance_nm,
            portsCount: accumulatedState.ports?.length || 0,
            pricesCount: accumulatedState.prices?.length || 0,
            analysisRecs: accumulatedState.analysis?.recommendations?.length || 0,
          });
          
          // Send analysis event if we have ANY data - even just route is useful for map display
          if (hasRoute || hasPorts || hasPrices || hasAnalysis) {
            console.log("📤 [API] Sending analysis event with available data:", {
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
            console.log("✅ [API] Analysis event sent");
            // Keep-alive after analysis
            controller.enqueue(encoder.encode(': keep-alive\n\n'));
          } else {
            console.warn("⚠️ [API] Not sending analysis event - no data available:", {
              hasRoute: !!hasRoute,
              hasPorts: !!hasPorts,
              hasPrices: !!hasPrices,
              hasAnalysis: !!hasAnalysis,
            });
          }

          // Send completion
          console.log("🏁 [API] Sending [DONE] signal and closing stream");
          
          // Send keep-alive before done to ensure connection is still open
          try {
            controller.enqueue(encoder.encode(': keep-alive\n\n'));
            console.log("✅ [API] Keep-alive sent before done event");
          } catch (e) {
            console.warn('⚠️ [API] Error sending keep-alive before done:', e);
          }
          
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          
          // Send another keep-alive after done to ensure it's transmitted
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
          console.log("✅ [API] Keep-alive sent after done event");
          
          // Longer delay to ensure all events are sent before closing
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          controller.close();
          console.log("✅ [API] Stream closed successfully");
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
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no", // Disable nginx/proxy buffering
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
