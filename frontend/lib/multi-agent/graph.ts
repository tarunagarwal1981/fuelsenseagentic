/**
 * Multi-Agent Graph Construction
 * 
 * Builds the LangGraph state machine for multi-agent orchestration.
 * Coordinates the workflow between supervisor, route agent, weather agent,
 * bunker agent, and finalize node.
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
  weatherAgentNode,
  bunkerAgentNode,
  finalizeNode,
} from './agent-nodes';
import {
  routeAgentTools,
  weatherAgentTools,
  bunkerAgentTools,
} from './tools';
import { AgentRegistry } from './registry';

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

  // Route based on supervisor's decision
  if (!nextAgent || nextAgent === '') {
    console.log('🔀 [SUPERVISOR-ROUTER] No next agent specified, defaulting to route_agent');
    return 'route_agent';
  }

  // Validate next agent value
  const validAgents = ['route_agent', 'weather_agent', 'bunker_agent', 'finalize'];
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
  const messages = state.messages;

  console.log(`🔀 [AGENT-TOOL-ROUTER] Decision point - Total messages: ${messages.length}`);

  // Circuit breaker: escape if agent is stuck
  if (shouldEscapeToSupervisor(state)) {
    return 'supervisor';
  }

  // Safety check: prevent runaway execution
  if (messages.length > 60) {
    console.warn(`⚠️ [AGENT-TOOL-ROUTER] Too many messages (${messages.length}), forcing supervisor`);
    return 'supervisor';
  }

  // Edge case: no messages
  if (messages.length === 0) {
    console.log('🔀 [AGENT-TOOL-ROUTER] ❌ No messages → supervisor');
    return 'supervisor';
  }

  // CRITICAL FIX: Only check the LAST message, not historical messages
  // This prevents routing on old tool_calls that were already executed
  const lastMessage = messages[messages.length - 1];
  
  // Log what we're examining with proper type identification
  console.log(`🔍 [AGENT-TOOL-ROUTER] Examining last message:`);
  let msgType: string;
  if (lastMessage instanceof AIMessage) {
    msgType = lastMessage.tool_calls && lastMessage.tool_calls.length > 0 
      ? 'AIMessage(with_tools)' 
      : 'AIMessage';
  } else if (lastMessage instanceof ToolMessage) {
    msgType = 'ToolMessage';
  } else {
    msgType = 'HumanMessage/Other';
  }
  
  // Type guard: ensure lastMessage is an AIMessage with tool_calls
  if (!(lastMessage instanceof AIMessage)) {
    console.log(`🔀 [AGENT-TOOL-ROUTER] ❌ Last message is not AIMessage (${msgType}) → supervisor`);
    return 'supervisor';
  }

  const toolCount = lastMessage.tool_calls?.length || 0;
  const toolNames = lastMessage.tool_calls?.map(tc => tc.name).join(', ') || 'none';
  
  console.log(`  [LAST] ${msgType}${toolCount > 0 ? ` → ${toolCount} tools: ${toolNames}` : ''}`);

  // Check if last message has tool_calls
  if (!lastMessage.tool_calls || !Array.isArray(lastMessage.tool_calls) || lastMessage.tool_calls.length === 0) {
    console.log('🔀 [AGENT-TOOL-ROUTER] ❌ Last message has no tool_calls → supervisor');
    return 'supervisor';
  }

  // CRITICAL FIX: Check if these tool_calls have already been executed
  // Extract tool_call IDs, filtering out any undefined/null values
  const toolCallIds = new Set<string>(
    lastMessage.tool_calls
      .map(tc => tc.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );
  
  if (toolCallIds.size === 0) {
    console.warn('⚠️ [AGENT-TOOL-ROUTER] Tool calls have no IDs, routing to tools anyway');
    return 'tools';
  }
  
  // Look for ToolMessages that match these tool_call_ids
  // Search forward through all messages to find ToolMessages with matching tool_call_ids
  const executedToolCallIds = new Set<string>();
  
  // Search through all messages using proper type guards
  for (const msg of messages) {
    // Type guard: check if message is a ToolMessage with a tool_call_id
    if (msg instanceof ToolMessage && msg.tool_call_id) {
      const toolCallId: string = msg.tool_call_id;
      if (toolCallIds.has(toolCallId)) {
        executedToolCallIds.add(toolCallId);
        console.log(`  ✓ Found executed tool: ${toolCallId}`);
      }
    }
  }
  
  // Determine which tool_calls are still unexecuted
  const unexecutedToolCallIds = Array.from(toolCallIds).filter(
    id => !executedToolCallIds.has(id)
  );
  
  // Route to tools ONLY if there are unexecuted tool_calls
  if (unexecutedToolCallIds.length > 0) {
    console.log(
      `🔀 [AGENT-TOOL-ROUTER] ✅✅ ROUTING TO TOOLS! ${unexecutedToolCallIds.length}/${toolCallIds.size} unexecuted tools: ${toolNames}`
    );
    return 'tools';
  }

  // All tool_calls have been executed - return to supervisor
  console.log(
    `🔀 [AGENT-TOOL-ROUTER] ❌ All ${toolCallIds.size} tool_calls already executed → supervisor`
  );
  return 'supervisor';
}

// ============================================================================
// Graph Construction
// ============================================================================

/**
 * Multi-Agent Workflow Graph
 * 
 * State machine that orchestrates the multi-agent system:
 * 
 * Flow:
 * 1. Supervisor → Routes to appropriate agent
 * 2. Agent → Uses tools or returns to supervisor
 * 3. Tools → Execute and return to agent
 * 4. Finalize → Synthesizes recommendation and ends
 */
const workflow = new StateGraph(MultiAgentStateAnnotation)
  // ========================================================================
  // Agent Nodes
  // ========================================================================
  .addNode('supervisor', supervisorAgentNode)
  .addNode('route_agent', routeAgentNode)
  .addNode('weather_agent', weatherAgentNode)
  .addNode('bunker_agent', bunkerAgentNode)
  .addNode('finalize', finalizeNode)

  // ========================================================================
  // Tool Nodes (one per agent)
  // ========================================================================
  .addNode('route_tools', new ToolNode(routeAgentTools))
  .addNode('weather_tools', new ToolNode(weatherAgentTools))
  .addNode('bunker_tools', new ToolNode(bunkerAgentTools))

  // ========================================================================
  // Entry Point
  // ========================================================================
  .setEntryPoint('supervisor')

  // ========================================================================
  // Supervisor Routing
  // ========================================================================
  .addConditionalEdges('supervisor', supervisorRouter, {
    route_agent: 'route_agent',
    weather_agent: 'weather_agent',
    bunker_agent: 'bunker_agent',
    finalize: 'finalize',
    [END]: END,
  })

  // ========================================================================
  // Route Agent Workflow
  // ========================================================================
  .addConditionalEdges('route_agent', agentToolRouter, {
    tools: 'route_tools',
    supervisor: 'supervisor',
  })
  .addEdge('route_tools', 'route_agent')

  // ========================================================================
  // Weather Agent Workflow
  // ========================================================================
  .addConditionalEdges('weather_agent', agentToolRouter, {
    tools: 'weather_tools',
    supervisor: 'supervisor',
  })
  .addEdge('weather_tools', 'weather_agent')

  // ========================================================================
  // Bunker Agent Workflow
  // ========================================================================
  .addConditionalEdges('bunker_agent', agentToolRouter, {
    tools: 'bunker_tools',
    supervisor: 'supervisor',
  })
  .addEdge('bunker_tools', 'bunker_agent')

  // ========================================================================
  // Finalize to End
  // ========================================================================
  .addEdge('finalize', END);

// ============================================================================
// Compile and Export
// ============================================================================

/**
 * Compiled Multi-Agent Application
 * 
 * The compiled graph ready for execution.
 * Use with: await multiAgentApp.invoke(initialState, { recursionLimit: 50 })
 */
export const multiAgentApp = workflow.compile();

console.log('✅ Multi-Agent LangGraph compiled successfully');
console.log('📊 Graph structure:');
console.log('   - Entry: supervisor');
console.log('   - Agents: route_agent, weather_agent, bunker_agent');
console.log('   - Tools: route_tools, weather_tools, bunker_tools');
console.log('   - Final: finalize → END');

