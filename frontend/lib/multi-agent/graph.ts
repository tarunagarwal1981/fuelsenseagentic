/**
 * Multi-Agent Graph Construction
 *
 * Builds the LangGraph state machine for multi-agent orchestration.
 * Coordinates the workflow between supervisor, route agent, weather agent,
 * bunker agent, and finalize node.
 *
 * Persistence: use getMultiAgentApp() for production (Redis/MemorySaver with
 * retry and logging). multiAgentApp is the sync, no-checkpointer build for
 * tests and backward compatibility.
 */

import { StateGraph, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import {
  MultiAgentStateAnnotation,
  type MultiAgentState,
} from './state';
// Import agent-nodes to trigger agent registrations
import './agent-nodes';
import {
  supervisorAgentNode,
  routeAgentNode,
  complianceAgentNode,
  weatherAgentNode,
  bunkerAgentNode,
  finalizeNode,
} from './agent-nodes';
import { AgentRegistry } from './registry';
import { getCheckpointer } from '@/lib/persistence/redis-checkpointer';

export { getCheckpointMetrics } from '@/lib/persistence/redis-checkpointer';

// ============================================================================
// Registry Validation
// ============================================================================

// Validate registry is populated before graph compilation
const registeredAgents = AgentRegistry.getAllAgents();
console.log(`📚 [REGISTRY] Loaded ${registeredAgents.length} agents:`, 
  registeredAgents.map(a => a.agent_name).join(', ')
);

if (registeredAgents.length === 0) {
  throw new Error('Agent registry is empty - agents failed to register. Check agent-nodes.ts registrations.');
}

// ============================================================================
// Router Functions
// ============================================================================

/**
 * Supervisor Router
 * 
 * Routes to the next agent based on supervisor's decision in state.next_agent.
 * 
 * AGENTIC MODE: Supports supervisor self-loop for ReAct pattern reasoning,
 * and clarification handling for ambiguous queries.
 */
function supervisorRouter(state: MultiAgentState): string | typeof END {
  const nextAgent = state.next_agent;

  console.log(`🔀 [SUPERVISOR-ROUTER] Routing decision: ${nextAgent || 'none'}`);

  // Safety check: prevent infinite loops
  if (state.messages.length > 100) {
    console.warn(
      `⚠️ [SUPERVISOR-ROUTER] Too many messages (${state.messages.length}), forcing END to prevent infinite loop`
    );
    return END;
  }
  
  // AGENTIC MODE: Check reasoning step limit
  const reasoningSteps = state.reasoning_history?.length || 0;
  if (reasoningSteps > 15) {
    console.warn(
      `⚠️ [SUPERVISOR-ROUTER] Too many reasoning steps (${reasoningSteps}), forcing finalize`
    );
    return 'finalize';
  }

  // AGENTIC MODE: If needs clarification, go to finalize to generate question
  if (state.needs_clarification) {
    console.log('❓ [SUPERVISOR-ROUTER] User clarification needed, routing to finalize');
    return 'finalize';
  }

  // Route based on supervisor's decision
  if (!nextAgent || nextAgent === '') {
    console.log('🔀 [SUPERVISOR-ROUTER] No next agent specified, defaulting to route_agent');
    return 'route_agent';
  }

  // AGENTIC MODE: Allow supervisor self-loop for continued reasoning
  if (nextAgent === 'supervisor') {
    console.log('🔄 [SUPERVISOR-ROUTER] Supervisor self-loop for continued reasoning');
    return 'supervisor';
  }

  // Validate next agent value
  const validAgents = ['route_agent', 'compliance_agent', 'weather_agent', 'bunker_agent', 'finalize'];
  if (validAgents.includes(nextAgent)) {
    console.log(`🔀 [SUPERVISOR-ROUTER] Routing to: ${nextAgent}`);
    return nextAgent;
  }

  // If finalize is complete, end
  if (nextAgent === 'finalize' && state.final_recommendation) {
    console.log('🔀 [SUPERVISOR-ROUTER] Final recommendation complete, ending');
    return END;
  }

  // Default to route_agent if invalid
  console.warn(`⚠️ [SUPERVISOR-ROUTER] Invalid next_agent: ${nextAgent}, defaulting to route_agent`);
  return 'route_agent';
}

/**
 * Circuit breaker: Check if weather agent has been called repeatedly without progress
 */
function shouldEscapeToSupervisor(state: MultiAgentState): boolean {
  const recentMessages = state.messages.slice(-10);
  const weatherAgentMessages = recentMessages.filter(msg => {
    if (msg instanceof AIMessage) {
      const content = msg.content?.toString() || '';
      return content.includes('[WEATHER-AGENT]') || 
             (msg.tool_calls && msg.tool_calls.some((tc: any) => 
               tc.name === 'fetch_marine_weather' || 
               tc.name === 'calculate_weather_consumption'));
    }
    return false;
  });
  
  // If weather agent has been called 3+ times recently without progress, escape
  if (weatherAgentMessages.length >= 3) {
    console.log('⚠️ [ROUTER] Weather agent called 3+ times without progress - escaping to supervisor');
    return true;
  }
  
  return false;
}

/**
 * Agent Tool Router
 * 
 * Routes agent to tools if tool calls are present AND UNEXECUTED, otherwise back to supervisor.
 * 
 * @param state - The current multi-agent state containing messages and agent context
 * @returns 'tools' if unexecuted tool_calls are found, 'supervisor' otherwise
 * 
 * @remarks
 * CRITICAL FIX: This function was refactored to prevent infinite loops caused by routing
 * on already-executed tool_calls. The key improvements:
 * 
 * 1. **Only checks the LAST message**: Previously searched through last 10 messages,
 *    which could find old AIMessages with tool_calls that were already executed.
 * 
 * 2. **Verifies execution status**: Before routing to tools, checks if ToolMessages
 *    with matching tool_call_ids exist in the message history. Only routes if there
 *    are unexecuted tool_calls.
 * 
 * 3. **Proper type guards**: Uses instanceof checks for AIMessage and ToolMessage
 *    instead of duck typing, ensuring type safety and correct behavior.
 * 
 * 4. **Prevents infinite loops**: By ensuring we only route on unexecuted tool_calls,
 *    we prevent the router from repeatedly finding the same executed tool_calls and
 *    routing to tools indefinitely.
 */
export function agentToolRouter(state: MultiAgentState): 'tools' | 'supervisor' {
  const messages = state.messages || [];
  
  // Circuit breaker: escape if agent is stuck (check early)
  if (shouldEscapeToSupervisor(state)) {
    return 'supervisor';
  }

  // Safety check: prevent runaway execution
  if (messages.length > 60) {
    console.warn(`⚠️ [AGENT-TOOL-ROUTER] Too many messages (${messages.length}), forcing supervisor`);
    return 'supervisor';
  }
  
  // Early validation
  if (messages.length === 0) {
    console.error("❌ [ROUTER] No messages in state");
    return "supervisor";
  }
  
  const lastMessage = messages[messages.length - 1];
  
  // Multiple type detection methods (handles LangChain quirks)
  const isAIMessage = lastMessage instanceof AIMessage || 
                      (lastMessage as any)._getType?.() === 'ai' ||
                      lastMessage.constructor.name === 'AIMessage' ||
                      (lastMessage as any).type === 'ai';
  
  // Validate tool_calls structure
  const hasToolCallsProperty = 'tool_calls' in lastMessage;
  const toolCallsIsArray = Array.isArray((lastMessage as any).tool_calls);
  const toolCallsHasItems = (lastMessage as any).tool_calls && (lastMessage as any).tool_calls.length > 0;
  
  // Validate each tool call has required fields
  const allToolCallsValid = toolCallsHasItems && 
    (lastMessage as any).tool_calls.every((tc: any) => 
      tc.name && 
      tc.id && 
      tc.args !== undefined
    );
  
  console.log("🔀 [ROUTER-ANALYSIS]", {
    is_ai_message: isAIMessage,
    has_tool_calls_prop: hasToolCallsProperty,
    tool_calls_is_array: toolCallsIsArray,
    tool_calls_count: (lastMessage as any).tool_calls?.length || 0,
    all_valid: allToolCallsValid,
    decision: allToolCallsValid ? "→ tools" : "→ supervisor"
  });
  
  // Route to tools if valid tool calls exist
  if (allToolCallsValid) {
    // Check if these tool_calls have already been executed
    const toolCalls = (lastMessage as any).tool_calls;
    const toolCallIds = new Set<string>(
      toolCalls
        .map((tc: any) => tc.id)
        .filter((id: any): id is string => typeof id === 'string' && id.length > 0)
    );
    
    if (toolCallIds.size === 0) {
      console.warn('⚠️ [AGENT-TOOL-ROUTER] Tool calls have no IDs, routing to tools anyway');
      console.log("  ✅ Routing to tools node");
      console.log("  📋 Tools to execute:", toolCalls.map((tc: any) => tc.name).join(", "));
      return "tools";
    }
    
    // Check for already executed tool calls
    const executedToolCallIds = new Set<string>();
    for (const msg of messages) {
      const toolCallId = (msg as any).tool_call_id;
      if (toolCallId && typeof toolCallId === 'string' && toolCallIds.has(toolCallId)) {
        executedToolCallIds.add(toolCallId);
      }
    }
    
    const unexecutedToolCallIds = Array.from(toolCallIds).filter(
      id => !executedToolCallIds.has(id)
    );
    
    if (unexecutedToolCallIds.length > 0) {
      console.log("  ✅ Routing to tools node");
      console.log("  📋 Tools to execute:", toolCalls.map((tc: any) => tc.name).join(", "));
      return "tools";
    } else {
      console.log("  ⚠️ All tool calls already executed → supervisor");
      return "supervisor";
    }
  }
  
  // Check for completion signals
  const messageName = (lastMessage as any).name;
  const messageContent = typeof (lastMessage as any).content === 'string' 
    ? (lastMessage as any).content 
    : String((lastMessage as any).content || '');
  
  if (messageName?.includes("_complete") || 
      messageName?.includes("_error") ||
      (messageContent && messageContent.toLowerCase().includes("complete"))) {
    console.log("  ✅ Completion signal detected → supervisor");
    return "supervisor";
  }
  
  console.log("  ⚠️ No valid tool calls → supervisor");
  return "supervisor";
}

// ============================================================================
// Graph Construction
// ============================================================================

/**
 * Multi-Agent Workflow Graph
 * 
 * State machine that orchestrates the multi-agent system:
 * 
 * Workflow:
 * 1. Supervisor → Routes to appropriate agent
 * 2. Route Agent → Deterministic workflow (no tools node needed)
 * 3. Weather Agent → Deterministic workflow (no tools node needed)
 * 4. Bunker Agent → Deterministic workflow (no tools node needed)
 * 5. Finalize → Synthesizes recommendation and ends
 */
const workflow = new StateGraph(MultiAgentStateAnnotation)
  // ========================================================================
  // Agent Nodes
  // ========================================================================
  .addNode('supervisor', supervisorAgentNode)
  .addNode('route_agent', routeAgentNode)      // Now deterministic workflow
  .addNode('compliance_agent', complianceAgentNode)  // Deterministic workflow
  .addNode('weather_agent', weatherAgentNode)  // Now deterministic workflow
  .addNode('bunker_agent', bunkerAgentNode)    // Now deterministic workflow
  .addNode('finalize', finalizeNode)           // Still LLM-based

  // ========================================================================
  // Tool Nodes (REMOVED - all agents now deterministic workflows)
  // ========================================================================
  // No tool nodes needed - all agents call functions directly

  // ========================================================================
  // Entry Point
  // ========================================================================
  .setEntryPoint('supervisor')

  // ========================================================================
  // Supervisor Routing
  // Includes supervisor self-loop for agentic ReAct pattern
  // ========================================================================
  .addConditionalEdges('supervisor', supervisorRouter, {
    route_agent: 'route_agent',
    compliance_agent: 'compliance_agent',
    weather_agent: 'weather_agent',
    bunker_agent: 'bunker_agent',
    finalize: 'finalize',
    supervisor: 'supervisor',  // AGENTIC: Allow supervisor self-loop for continued reasoning
    [END]: END,
  })

  // ========================================================================
  // Route Agent Workflow (deterministic - goes straight back to supervisor)
  // ========================================================================
  .addEdge('route_agent', 'supervisor')

  // ========================================================================
  // Compliance Agent Workflow (deterministic - goes straight back to supervisor)
  // ========================================================================
  .addEdge('compliance_agent', 'supervisor')

  // ========================================================================
  // Weather Agent Workflow (deterministic - goes straight back to supervisor)
  // ========================================================================
  .addEdge('weather_agent', 'supervisor')

  // ========================================================================
  // Bunker Agent Workflow (deterministic - goes straight back to supervisor)
  // ========================================================================
  .addEdge('bunker_agent', 'supervisor')

  // ========================================================================
  // Finalize to End
  // ========================================================================
  .addEdge('finalize', END);

// ============================================================================
// Compile and Export
// ============================================================================

/**
 * Compiled Multi-Agent Application (no checkpointer, for tests and backward compatibility).
 * Use getMultiAgentApp() for production with Redis/MemorySaver persistence.
 */
export const multiAgentApp = workflow.compile();

/**
 * Returns the compiled multi-agent app with Redis (or MemorySaver) checkpointer.
 * Use for /api/chat-multi-agent to enable checkpoint persistence and recovery.
 *
 * - Checkpointer: from getCheckpointer() (RedisSaver when Upstash env is set, else MemorySaver).
 * - Wrapped with retry (max 3) and logging for put/putWrites.
 */
export async function getMultiAgentApp() {
  console.log('🔧 [GRAPH] Getting checkpointer...');
  
  let checkpointer;
  try {
    checkpointer = await getCheckpointer();
    console.log('✅ [GRAPH] Checkpointer obtained:', checkpointer?.constructor?.name || 'unknown');
  } catch (error) {
    console.error('❌ [GRAPH] Failed to get checkpointer:', error);
    console.error('   Error details:', error instanceof Error ? error.message : String(error));
    console.error('   Error stack:', error instanceof Error ? error.stack : 'no stack');
    throw error;
  }
  
  console.log('🔧 [GRAPH] Compiling workflow with checkpointer...');
  
  let compiledApp;
  try {
    compiledApp = workflow.compile({ checkpointer });
    console.log('✅ [GRAPH] Workflow compiled successfully');
    console.log('🔍 [GRAPH] Compiled app type:', compiledApp?.constructor?.name || 'unknown');
    console.log('🔍 [GRAPH] Compiled app has stream:', typeof compiledApp?.stream === 'function');
    console.log('🔍 [GRAPH] Compiled app has invoke:', typeof compiledApp?.invoke === 'function');
  } catch (error) {
    console.error('❌ [GRAPH] Workflow compilation failed:', error);
    console.error('   Error details:', error instanceof Error ? error.message : String(error));
    console.error('   Error stack:', error instanceof Error ? error.stack : 'no stack');
    throw error;
  }
  
  return compiledApp;
}

console.log('✅ Multi-Agent LangGraph compiled successfully');
console.log('📊 Graph structure:');
console.log('   - Entry: supervisor');
console.log('   - Agents: route_agent (deterministic), weather_agent (deterministic), bunker_agent (LLM)');
console.log('   - Tools: None (all agents are now deterministic workflows)');
console.log('   - Final: finalize (LLM) → END');

