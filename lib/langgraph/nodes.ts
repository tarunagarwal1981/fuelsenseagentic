// lib/langgraph/nodes.ts
import { ChatAnthropic } from "@langchain/anthropic";
import type { BunkerState } from "./state";
import { tools } from "./tools";

// Create LLM instance
const llm = new ChatAnthropic({
  model: "claude-sonnet-4-20250514",
  temperature: 0,
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Bind tools to LLM
const llmWithTools = llm.bindTools(tools);

// Agent Node - LLM makes decisions here
export async function agentNode(state: BunkerState) {
  console.log("🧠 Agent Node: LLM making decision...");
  console.log(`📊 Current state: ${state.messages.length} messages`);

  try {
    // Messages are already BaseMessage[] types, pass them directly
    const response = await llmWithTools.invoke(state.messages);
    
    console.log("✅ Agent Node: LLM responded");
    
    // Check if LLM called a tool
    if (response.tool_calls && response.tool_calls.length > 0) {
      console.log(`🔧 Agent wants to call: ${response.tool_calls[0].name}`);
    } else {
      console.log("✅ Agent is done, providing final answer");
    }

    return { messages: [response] };
  } catch (error) {
    console.error("❌ Agent Node error:", error);
    throw error;
  }
}
