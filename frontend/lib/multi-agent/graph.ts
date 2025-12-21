/**
 * Multi-Agent Graph Construction
 * 
 * Builds the LangGraph state machine for multi-agent orchestration.
 * Coordinates the workflow between supervisor, route agent, weather agent,
 * bunker agent, and finalize node.
 */

import { StateGraph, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { AIMessage } from '@langchain/core/messages';
import {
  MultiAgentStateAnnotation,
  type MultiAgentState,
} from './state';
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
 * Agent Tool Router
 * 
 * Routes agent to tools if tool calls are present, otherwise back to supervisor.
 */
function agentToolRouter(state: MultiAgentState): 'tools' | 'supervisor' {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1];

  console.log(
    `🔀 [AGENT-TOOL-ROUTER] Decision point - Messages: ${messages.length}, Last message type: ${lastMessage.constructor.name}`
  );

  // Safety check: prevent infinite loops
  if (messages.length > 100) {
    console.warn(
      `⚠️ [AGENT-TOOL-ROUTER] Too many messages (${messages.length}), forcing supervisor to prevent infinite loop`
    );
    return 'supervisor';
  }

  // Check if LLM called a tool (only AIMessage has tool_calls)
  if (lastMessage instanceof AIMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    console.log(
      `🔀 [AGENT-TOOL-ROUTER] Going to tools node - Tool calls: ${lastMessage.tool_calls.length}, First tool: ${lastMessage.tool_calls[0].name}`
    );
    return 'tools';
  }

  // No tool calls - return to supervisor for next routing decision
  console.log('🔀 [AGENT-TOOL-ROUTER] No tool calls, returning to supervisor');
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

