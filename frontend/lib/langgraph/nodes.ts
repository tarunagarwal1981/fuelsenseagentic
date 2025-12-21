// lib/langgraph/nodes.ts
import { ChatAnthropic } from "@langchain/anthropic";
import { ToolMessage } from "@langchain/core/messages";
import type { BunkerState } from "./state";
import { tools } from "./tools";

// Create LLM instance
// Model options based on available models (from cheapest to most expensive):
// 
// CHEAPEST OPTIONS (Best for cost savings):
// - "claude-haiku-4-5-20251001" - Newest Haiku, excellent tool calling, cheapest ⭐ RECOMMENDED
// - "claude-3-haiku-20240307" - Older Haiku, very cheap, good for simple tasks
//
// BALANCED OPTIONS:
// - "claude-sonnet-4-20250514" - Good balance, more expensive but very capable
//
// MOST CAPABLE (Most expensive):
// - "claude-opus-4-20250514" - Most capable, highest cost
// - "claude-opus-4-5-20251101" - Latest Opus, most expensive
//
// For bunker optimization (tool calling + structured reasoning):
// ⭐ RECOMMENDED: claude-haiku-4-5-20251001 (best value - cheap + excellent tool calling)
//
// Switch models by setting LLM_MODEL env var or changing the default below:
const MODEL = process.env.LLM_MODEL || "claude-haiku-4-5-20251001"; // Default to Haiku 4.5 (best value)

// Validate API key is present
if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY environment variable is not set. Please configure it in Netlify environment variables.");
}

const llm = new ChatAnthropic({
  model: MODEL,
  temperature: 0,
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Bind tools to LLM
const llmWithTools = llm.bindTools(tools);

// Agent Node - LLM makes decisions here
export async function agentNode(state: BunkerState) {
  console.log("🧠 Agent Node: LLM making decision...");
  console.log(`📊 Current state: ${state.messages.length} messages`);

  // Safety check: prevent infinite loops
  if (state.messages.length > 50) {
    console.warn("⚠️ Too many messages, forcing final response");
    const finalMessage = new (await import("@langchain/core/messages")).AIMessage({
      content: "I've completed the analysis. Please check the results below.",
    });
    return { messages: [finalMessage] };
  }

  try {
    // Messages are already BaseMessage[] types, pass them directly
    const response = await llmWithTools.invoke(state.messages);
    
    console.log("✅ Agent Node: LLM responded");
    
    // Check if LLM called a tool
    if (response.tool_calls && response.tool_calls.length > 0) {
      console.log(`🔧 Agent wants to call: ${response.tool_calls[0].name}`);
      
      // Safety: if we've called tools many times, check if we should force a final answer
      const toolCallCount = state.messages.filter((msg: any) => 
        msg instanceof (await import("@langchain/core/messages")).AIMessage && msg.tool_calls
      ).length;
      
      if (toolCallCount > 10) {
        console.warn("⚠️ Many tool calls detected, agent should provide final answer soon");
      }
    } else {
      console.log("✅ Agent is done, providing final answer");
    }

    return { messages: [response] };
  } catch (error) {
    console.error("❌ Agent Node error:", error);
    throw error;
  }
}

// Reducer Node - Extract tool results and update state
export async function reducerNode(state: BunkerState) {
  console.log("🔄 Reducer Node: Processing tool results...");
  console.log(`📊 Total messages: ${state.messages.length}`);
  
  const updates: Partial<BunkerState> = {};
  
  // Find ALL tool messages and extract data from each
  const toolMessages = state.messages.filter(
    (msg) => msg instanceof ToolMessage
  ) as ToolMessage[];
  
  console.log(`🔧 Found ${toolMessages.length} tool messages`);
  
  // Build a map of tool_call_id to AIMessage for quick lookup
  const toolCallMap = new Map<string, { toolName: string; aiMessage: any }>();
  
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];
    if ((msg as any).tool_calls) {
      const aiMessage = msg as any;
      for (const toolCall of aiMessage.tool_calls || []) {
        toolCallMap.set(toolCall.id, { toolName: toolCall.name, aiMessage });
        console.log(`📌 Mapped tool call ${toolCall.id} -> ${toolCall.name}`);
      }
    }
  }
  
  console.log(`🗺️ Tool call map size: ${toolCallMap.size}`);
  
  // Process each tool message
  for (const toolMessage of toolMessages) {
    try {
      console.log(`🔍 Processing tool message with ID: ${toolMessage.tool_call_id}`);
      console.log(`📝 Tool message content type: ${typeof toolMessage.content}`);
      console.log(`📝 Tool message content length: ${typeof toolMessage.content === 'string' ? toolMessage.content.length : 'N/A'}`);
      
      const toolCallInfo = toolCallMap.get(toolMessage.tool_call_id);
      if (!toolCallInfo) {
        console.warn(`⚠️ No matching tool call found for ${toolMessage.tool_call_id}`);
        console.warn(`⚠️ Available tool call IDs:`, Array.from(toolCallMap.keys()));
        continue;
      }
      
      const { toolName } = toolCallInfo;
      console.log(`🔍 Processing tool: ${toolName}`);
      
      // Parse tool result - handle both string and object formats
      let toolResult: any;
      if (typeof toolMessage.content === 'string') {
        // Check if this is an error message first
        if (toolMessage.content.startsWith('Error:') || toolMessage.content.includes('Error:')) {
          console.warn(`⚠️ Skipping error tool result: ${toolMessage.content.substring(0, 100)}`);
          continue; // Skip error messages
        }
        
        try {
          toolResult = JSON.parse(toolMessage.content);
          console.log(`✅ Parsed JSON tool result`);
        } catch (e) {
          // If parsing fails, try to extract JSON from the string
          console.warn(`⚠️ Failed to parse as JSON:`, e);
          // Sometimes the content might be wrapped or have extra text
          const jsonMatch = toolMessage.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              toolResult = JSON.parse(jsonMatch[0]);
              console.log(`✅ Extracted and parsed JSON from string`);
            } catch {
              console.warn(`⚠️ Failed to extract JSON, skipping this tool result`);
              continue; // Skip if we can't parse it
            }
          } else {
            console.warn(`⚠️ No JSON found in content, skipping this tool result`);
            continue; // Skip if no JSON found
          }
        }
      } else {
        toolResult = toolMessage.content;
        console.log(`✅ Using tool result as object directly`);
      }
      
      // Skip if result is an error
      if (typeof toolResult === 'string' && (toolResult.startsWith('Error:') || toolResult.includes('Error:'))) {
        console.warn(`⚠️ Skipping error tool result`);
        continue;
      }
      
      console.log(`📦 Tool result type: ${typeof toolResult}`);
      if (toolResult && typeof toolResult === 'object') {
        console.log(`📦 Tool result keys: ${Object.keys(toolResult).join(', ')}`);
        console.log(`📦 Tool result sample:`, JSON.stringify(toolResult).substring(0, 300));
      } else {
        console.log(`📦 Tool result value:`, String(toolResult).substring(0, 200));
      }
      
            // Extract data based on tool name
            if (toolName === 'calculate_route' && toolResult) {
              // Handle both direct result and wrapped result
              const routeData = toolResult.distance_nm !== undefined ? toolResult : (toolResult.result || toolResult.data || toolResult);
              if (routeData && routeData.distance_nm !== undefined) {
                updates.route = {
                  distance_nm: routeData.distance_nm,
                  waypoints: routeData.waypoints || [],
                  estimated_hours: routeData.estimated_hours,
                  origin_port_code: routeData.origin_port_code,
                  destination_port_code: routeData.destination_port_code,
                  route_type: routeData.route_type,
                };
                console.log("✅ Extracted route data:", JSON.stringify(updates.route).substring(0, 100));
              } else {
                console.warn("⚠️ Route data missing distance_nm:", Object.keys(routeData || {}));
              }
            } else if (toolName === 'find_bunker_ports' && toolResult) {
              // Handle both formats: { ports: [...] } and direct array
              const portsData = toolResult.ports !== undefined ? toolResult : (toolResult.result || toolResult.data || toolResult);
              const portsArray = portsData.ports || (Array.isArray(portsData) ? portsData : []);
              if (portsArray.length > 0) {
                updates.ports = portsArray.map((p: any) => ({
                  code: p.port?.port_code || p.code || p.port_code,
                  name: p.port?.name || p.name || p.port_name,
                  country: p.port?.country || p.country,
                  latitude: p.port?.coordinates?.lat || p.port?.latitude || p.latitude || p.coordinates?.lat,
                  longitude: p.port?.coordinates?.lon || p.port?.longitude || p.longitude || p.coordinates?.lon,
                  distance_from_route_nm: p.distance_from_route_nm,
                  nearest_waypoint_index: p.nearest_waypoint_index,
                }));
                console.log("✅ Extracted ports data:", updates.ports?.length, "ports");
              } else {
                console.warn("⚠️ No ports found in result:", Object.keys(portsData || {}));
              }
            } else if (toolName === 'get_fuel_prices' && toolResult) {
        // Handle both formats: { prices_by_port: {...} } and direct object
        const pricesByPort = toolResult.prices_by_port || toolResult;
        if (pricesByPort && typeof pricesByPort === 'object') {
          updates.prices = Object.entries(pricesByPort).map(([portCode, priceData]: [string, any]) => {
            const prices = Array.isArray(priceData) ? priceData : [priceData];
            return {
              port_code: portCode,
              port_name: prices[0]?.price?.port_name || prices[0]?.port_name || portCode,
              prices: {
                VLSFO: prices.find((p: any) => p.price?.fuel_type === 'VLSFO' || p.fuel_type === 'VLSFO')?.price?.price_per_mt || prices.find((p: any) => p.fuel_type === 'VLSFO')?.price_per_mt,
                LSGO: prices.find((p: any) => p.price?.fuel_type === 'LSGO' || p.fuel_type === 'LSGO')?.price?.price_per_mt || prices.find((p: any) => p.fuel_type === 'LSGO')?.price_per_mt,
                MGO: prices.find((p: any) => p.price?.fuel_type === 'MGO' || p.fuel_type === 'MGO')?.price?.price_per_mt || prices.find((p: any) => p.fuel_type === 'MGO')?.price_per_mt,
              },
              last_updated: prices[0]?.price?.last_updated || prices[0]?.last_updated || new Date().toISOString(),
              is_stale: prices[0]?.is_fresh === false || prices[0]?.is_stale === true,
            };
          });
          console.log("✅ Extracted prices data:", updates.prices?.length, "ports");
        }
            } else if (toolName === 'analyze_bunker_options' && toolResult) {
              // Handle both direct result and wrapped result
              const analysisData = toolResult.recommendations !== undefined ? toolResult : (toolResult.result || toolResult.data || toolResult);
              if (analysisData && (analysisData.recommendations || analysisData.best_option)) {
                updates.analysis = {
                  recommendations: analysisData.recommendations || [],
                  best_option: analysisData.best_option,
                  worst_option: analysisData.worst_option,
                  max_savings_usd: analysisData.max_savings || analysisData.max_savings_usd || 0,
                };
                console.log("✅ Extracted analysis data:", updates.analysis?.recommendations?.length, "recommendations");
                if (updates.analysis?.best_option) {
                  console.log("✅ Best option:", updates.analysis.best_option.port_name);
                }
              } else {
                console.warn("⚠️ Analysis data missing recommendations/best_option:", Object.keys(analysisData || {}));
              }
            }
    } catch (error) {
      console.error(`❌ Error parsing tool result for ${toolMessage.tool_call_id}:`, error);
    }
  }
  
  console.log("📤 Returning updates:", Object.keys(updates));
  if (Object.keys(updates).length > 0) {
    console.log("📦 Update details:", {
      hasRoute: !!updates.route,
      hasPorts: !!updates.ports,
      hasPrices: !!updates.prices,
      hasAnalysis: !!updates.analysis,
      routeOrigin: updates.route?.origin_port_code,
      routeDest: updates.route?.destination_port_code,
      portsCount: updates.ports?.length,
      pricesCount: updates.prices?.length,
      analysisRecs: updates.analysis?.recommendations?.length,
    });
  }
  return updates;
}
