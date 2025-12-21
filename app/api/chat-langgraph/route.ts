// app/api/chat-langgraph/route.ts
export const runtime = "edge";

import { app } from "@/lib/langgraph/graph";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

export async function POST(req: Request) {
  console.log("📨 LangGraph API: Received request");

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
          // Stream graph execution
          const streamResult = await app.stream(
            { messages: [humanMessage] },
            { streamMode: "values" }
          );

          // Track accumulated state across all events
          let accumulatedState = {
            route: null as any,
            ports: null as any,
            prices: null as any,
            analysis: null as any,
          };

          for await (const event of streamResult) {
            console.log("📤 Streaming event");
            console.log("📊 State keys:", Object.keys(event));
            console.log("📍 Route:", event.route ? `present (${event.route.distance_nm}nm)` : "null");
            console.log("⚓ Ports:", event.ports ? `${event.ports.length} ports` : "null");
            console.log("💰 Prices:", event.prices ? `${event.prices.length} ports` : "null");
            console.log("📊 Analysis:", event.analysis ? `present (${event.analysis.recommendations?.length || 0} recs)` : "null");

            // Accumulate state - keep the latest non-null values
            if (event.route) accumulatedState.route = event.route;
            if (event.ports) accumulatedState.ports = event.ports;
            if (event.prices) accumulatedState.prices = event.prices;
            if (event.analysis) accumulatedState.analysis = event.analysis;

            // Extract final response
            const lastMsg = event.messages[event.messages.length - 1];
            
            // Check if message is AIMessage and has tool_calls
            const toolCalls = lastMsg instanceof AIMessage ? lastMsg.tool_calls : undefined;
            
            // Serialize state data properly - use accumulated state
            const routeData = accumulatedState.route ? {
              distance_nm: accumulatedState.route.distance_nm,
              waypoints: accumulatedState.route.waypoints || [],
              estimated_hours: accumulatedState.route.estimated_hours,
              origin_port_code: accumulatedState.route.origin_port_code,
              destination_port_code: accumulatedState.route.destination_port_code,
              route_type: accumulatedState.route.route_type,
            } : null;
            
            // Ensure we have valid data structures
            const portsData = accumulatedState.ports && Array.isArray(accumulatedState.ports) ? accumulatedState.ports : null;
            const pricesData = accumulatedState.prices && Array.isArray(accumulatedState.prices) ? accumulatedState.prices : null;
            const analysisData = accumulatedState.analysis && accumulatedState.analysis.recommendations ? accumulatedState.analysis : null;
            
            // Send event to client with complete accumulated state
            const data = JSON.stringify({
              type: "graph_event",
              route: routeData,
              ports: portsData,
              prices: pricesData,
              analysis: analysisData,
              message: typeof lastMsg.content === 'string' ? lastMsg.content : (lastMsg.content || ''),
              tool_calls: toolCalls,
            });

            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
          
          // Send final state event with all accumulated data
          console.log("📤 Sending final state:", {
            hasRoute: !!accumulatedState.route,
            hasPorts: !!accumulatedState.ports,
            hasPrices: !!accumulatedState.prices,
            hasAnalysis: !!accumulatedState.analysis,
          });
          
          const finalRouteData = accumulatedState.route ? {
            distance_nm: accumulatedState.route.distance_nm,
            waypoints: accumulatedState.route.waypoints || [],
            estimated_hours: accumulatedState.route.estimated_hours,
            origin_port_code: accumulatedState.route.origin_port_code,
            destination_port_code: accumulatedState.route.destination_port_code,
            route_type: accumulatedState.route.route_type,
          } : null;
          
          const finalData = JSON.stringify({
            type: "graph_event",
            route: finalRouteData,
            ports: accumulatedState.ports && Array.isArray(accumulatedState.ports) ? accumulatedState.ports : null,
            prices: accumulatedState.prices && Array.isArray(accumulatedState.prices) ? accumulatedState.prices : null,
            analysis: accumulatedState.analysis && accumulatedState.analysis.recommendations ? accumulatedState.analysis : null,
            message: "",
            tool_calls: undefined,
          });
          
          controller.enqueue(encoder.encode(`data: ${finalData}\n\n`));

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
