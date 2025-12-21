// app/api/test-langgraph/route.ts
export const runtime = "edge";

import { app } from "@/lib/langgraph/graph";
import { HumanMessage } from "@langchain/core/messages";

export async function GET() {
  console.log("🧪 Testing LangGraph...");

  try {
    const result = await app.invoke({
      messages: [
        new HumanMessage("Calculate route from Singapore (SGSIN) to Rotterdam (NLRTM) at 14 knots"),
      ],
    });

    console.log("✅ Test successful!");

    const lastMessage = result.messages[result.messages.length - 1];

    return Response.json({
      success: true,
      result: {
        route: result.route,
        ports: result.ports,
        prices: result.prices,
        analysis: result.analysis,
        messageCount: result.messages.length,
        lastMessageContent: lastMessage.content,
        lastMessageType: lastMessage._getType(),
      },
    });
  } catch (error) {
    console.error("❌ Test failed:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
