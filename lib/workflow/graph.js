"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
// lib/workflow/graph.ts
const langgraph_1 = require("@langchain/langgraph");
const prebuilt_1 = require("@langchain/langgraph/prebuilt");
const messages_1 = require("@langchain/core/messages");
const state_1 = require("./state");
const nodes_1 = require("./nodes");
const tools_1 = require("./tools");
// Router function - decides next step after agent
function routeAgentDecision(state) {
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1];
    // Check if LLM called a tool (only AIMessage has tool_calls)
    if (lastMessage instanceof messages_1.AIMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
        console.log("🔀 Router: Going to tools node");
        return "tools";
    }
    // LLM is done
    console.log("🔀 Router: Going to END");
    return langgraph_1.END;
}
// Create the graph
const workflow = new langgraph_1.StateGraph(state_1.StateAnnotation)
    // Add nodes
    .addNode("agent", nodes_1.agentNode)
    .addNode("tools", new prebuilt_1.ToolNode(tools_1.tools))
    .addNode("reducer", nodes_1.reducerNode)
    // Set entry point
    .setEntryPoint("agent")
    // Add conditional edge from agent
    .addConditionalEdges("agent", routeAgentDecision, {
    tools: "tools",
    [langgraph_1.END]: langgraph_1.END,
})
    // Add edge from tools to reducer, then reducer back to agent
    .addEdge("tools", "reducer")
    .addEdge("reducer", "agent");
// Compile the graph
exports.app = workflow.compile();
console.log("✅ LangGraph compiled successfully");
//# sourceMappingURL=graph.js.map