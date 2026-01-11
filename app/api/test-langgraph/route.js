"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runtime = void 0;
exports.GET = GET;
// app/api/test-langgraph/route.ts
exports.runtime = "edge";
const graph_1 = require("@/lib/workflow/graph");
const messages_1 = require("@langchain/core/messages");
async function GET() {
    console.log("🧪 Testing LangGraph...");
    try {
        const result = await graph_1.app.invoke({
            messages: [
                new messages_1.HumanMessage("Calculate route from Singapore (SGSIN) to Rotterdam (NLRTM) at 14 knots"),
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
    }
    catch (error) {
        console.error("❌ Test failed:", error);
        return Response.json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
        }, { status: 500 });
    }
}
//# sourceMappingURL=route.js.map