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

  console.log(`🔀 [ROUTER] Decision point - Messages: ${messages.length}, Last message type: ${lastMessage.constructor.name}`);

  // Safety check: prevent infinite loops
  if (messages.length > 50) {
    console.warn("⚠️ [ROUTER] Too many messages (" + messages.length + "), forcing END to prevent infinite loop");
    return END;
  }

  // Check if LLM called a tool (only AIMessage has tool_calls)
  if (lastMessage instanceof AIMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    console.log(`🔀 [ROUTER] Going to tools node - Tool calls: ${lastMessage.tool_calls.length}, First tool: ${lastMessage.tool_calls[0].name}`);
    return "tools";
  }

  // Check if we have a final answer (AIMessage with content but no tool calls)
  if (lastMessage instanceof AIMessage) {
    const content = typeof lastMessage.content === 'string' 
      ? lastMessage.content 
      : String(lastMessage.content || '');
    const hasToolCalls = lastMessage.tool_calls && lastMessage.tool_calls.length > 0;
    
    console.log(`🔀 [ROUTER] AIMessage check - Has content: ${!!content.trim()}, Content length: ${content.length}, Has tool calls: ${hasToolCalls}`);
    
    // If there's content and no tool calls, we're done
    if (content.trim() && !hasToolCalls) {
      console.log("🔀 [ROUTER] LLM provided final answer, going to END");
      return END;
    }
    
    // If no content and no tool calls, something might be wrong
    if (!content.trim() && !hasToolCalls) {
      console.warn("⚠️ [ROUTER] AIMessage has no content and no tool calls - forcing END");
      return END;
    }
  }

  // LLM is done (no tool calls, or not an AIMessage)
  console.log("🔀 [ROUTER] Default case - Going to END");
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

