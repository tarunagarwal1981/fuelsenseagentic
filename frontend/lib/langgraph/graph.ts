// lib/langgraph/graph.ts
import { StateGraph, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage } from "@langchain/core/messages";
import { StateAnnotation, type BunkerState } from "./state";
import { agentNode, reducerNode } from "./nodes";
import { tools } from "./tools";

// Router function - decides next step after agent
function routeAgentDecision(state: BunkerState): "tools" | typeof END {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1];

  // Check if LLM called a tool (only AIMessage has tool_calls)
  if (lastMessage instanceof AIMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    console.log("🔀 Router: Going to tools node");
    return "tools";
  }

  // LLM is done
  console.log("🔀 Router: Going to END");
  return END;
}

// Create the graph
const workflow = new StateGraph(StateAnnotation)
  // Add nodes
  .addNode("agent", agentNode)
  .addNode("tools", new ToolNode(tools))
  .addNode("reducer", reducerNode)
  
  // Set entry point
  .setEntryPoint("agent")
  
  // Add conditional edge from agent
  .addConditionalEdges("agent", routeAgentDecision, {
    tools: "tools",
    [END]: END,
  })
  
  // Add edge from tools to reducer, then reducer back to agent
  .addEdge("tools", "reducer")
  .addEdge("reducer", "agent");

// Compile the graph
// Note: recursionLimit is set when invoking, not when compiling
export const app = workflow.compile();

console.log("✅ LangGraph compiled successfully");

