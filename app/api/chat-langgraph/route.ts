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

          for await (const event of streamResult) {
            console.log("📤 Streaming event");

            // Extract final response
            const lastMsg = event.messages[event.messages.length - 1];
            
            // Check if message is AIMessage and has tool_calls
            const toolCalls = lastMsg instanceof AIMessage ? lastMsg.tool_calls : undefined;
            
            // Send event to client
            const data = JSON.stringify({
              type: "graph_event",
              route: event.route,
              ports: event.ports,
              prices: event.prices,
              analysis: event.analysis,
              message: lastMsg.content,
              tool_calls: toolCalls,
            });

            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
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
