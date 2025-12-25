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
 * Routes agent to tools if tool calls are present, otherwise back to supervisor.
 */
function agentToolRouter(state: MultiAgentState): 'tools' | 'supervisor' {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1];

  console.log(
    `🔀 [AGENT-TOOL-ROUTER] Decision point - Messages: ${messages.length}, Last message type: ${lastMessage.constructor.name}`
  );

  // NEW: Add escape hatch for repeated agent calls
  if (shouldEscapeToSupervisor(state)) {
    return 'supervisor';
  }

  // Safety check: prevent infinite loops
  // Lower threshold to catch loops earlier (50 instead of 100)
  if (messages.length > 50) {
    console.warn(
      `⚠️ [AGENT-TOOL-ROUTER] Too many messages (${messages.length}), forcing supervisor to prevent infinite loop`
    );
    return 'supervisor';
  }
  
  // Additional check: If last message is an AIMessage without tool calls and we have many messages,
  // likely stuck in a loop - force supervisor to handle it
  if (messages.length > 20 && lastMessage instanceof AIMessage && 
      (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0)) {
    const content = lastMessage.content?.toString() || '';
    // If it's a weather agent message without tool calls, we're stuck
    if (content.includes('[WEATHER-AGENT]') || content.includes('No tools called')) {
      console.warn(
        `⚠️ [AGENT-TOOL-ROUTER] Detected weather agent loop (${messages.length} messages, no tool calls) - forcing supervisor`
      );
      return 'supervisor';
    }
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

