/**
 * Core Agent Registrations - FuelSense 360
 *
 * Registers all agents with the production Agent Registry.
 * Wraps existing LangGraph agents and adds new specialized agents.
 */

import { AgentRegistry } from '../AgentRegistry';
import { registerAgent } from '../decorators/AgentDecorator';
import { isAgentEnabled, AGENT_VERSIONS } from '@/lib/config/agents.config';
import { extractEntities } from '@/lib/agents/EntityExtractionAgent';
import type { ExecutionContext } from '../types/AgentTypes';
import type { MultiAgentState } from '@/lib/multi-agent/state';

// Lazy imports to avoid circular dependencies
let routeAgentNode: ((state: MultiAgentState) => Promise<Partial<MultiAgentState>>) | null = null;
let weatherAgentNode: ((state: MultiAgentState) => Promise<Partial<MultiAgentState>>) | null = null;
let bunkerAgentNode: ((state: MultiAgentState) => Promise<Partial<MultiAgentState>>) | null = null;
let complianceAgentNode: ((state: MultiAgentState) => Promise<Partial<MultiAgentState>>) | null = null;
let finalizeNode: ((state: MultiAgentState) => Promise<Partial<MultiAgentState>>) | null = null;

function getRouteAgentNode() {
  if (!routeAgentNode) {
    const { routeAgentNode: fn } = require('@/lib/multi-agent/agent-nodes');
    routeAgentNode = fn;
  }
  return routeAgentNode!;
}

function getWeatherAgentNode() {
  if (!weatherAgentNode) {
    const { weatherAgentNode: fn } = require('@/lib/multi-agent/agent-nodes');
    weatherAgentNode = fn;
  }
  return weatherAgentNode!;
}

function getBunkerAgentNode() {
  if (!bunkerAgentNode) {
    const { bunkerAgentNode: fn } = require('@/lib/multi-agent/agent-nodes');
    bunkerAgentNode = fn;
  }
  return bunkerAgentNode!;
}

function getComplianceAgentNode() {
  if (!complianceAgentNode) {
    const { complianceAgentNode: fn } = require('@/lib/multi-agent/agent-nodes');
    complianceAgentNode = fn;
  }
  return complianceAgentNode!;
}

function getFinalizeNode() {
  if (!finalizeNode) {
    const { finalizeNode: fn } = require('@/lib/multi-agent/agent-nodes');
    finalizeNode = fn;
  }
  return finalizeNode!;
}

/**
 * Adapter: Convert ExecutionContext + input to LangGraph state format
 */
function toStateFormat(input: unknown, context: ExecutionContext): MultiAgentState {
  const state = (input as { state?: MultiAgentState })?.state ?? context.state ?? {};
  const base = state as Record<string, unknown>;
  return {
    ...base,
    messages: base.messages ?? [],
    correlation_id: context.correlationId || (base.correlation_id as string),
  } as MultiAgentState;
}

/**
 * Register Entity Extraction Agent
 */
function registerEntityExtractionAgent(): void {
  if (!isAgentEnabled('entity-extraction')) return;

  registerAgent(
    {
      id: 'entity-extraction',
      name: 'Entity Extraction Agent',
      version: AGENT_VERSIONS['entity-extraction'] ?? '1.0.0',
      capabilities: ['entity_extraction', 'intent_classification', 'vessel_extraction', 'port_extraction'],
      priority: 1,
      dependencies: [],
      status: 'active',
      intents: ['bunker_planning', 'voyage_optimization', 'emissions_calc', 'compliance_check'],
    },
    async (input, context) => {
      const query = typeof input === 'string' ? input : (input as any)?.query ?? String(input);
      const { ServiceContainer } = await import('@/lib/repositories/service-container');
      const cache = ServiceContainer.getInstance().getCache();
      return extractEntities(query, {
        correlationId: context.correlationId,
        cache: cache as any,
      });
    }
  );
}

/**
 * Register Route Agent (wraps existing LangGraph node)
 */
function registerRouteAgent(): void {
  if (!isAgentEnabled('route-agent')) return;

  registerAgent(
    {
      id: 'route-agent',
      name: 'Route Calculator Agent',
      version: AGENT_VERSIONS['route-agent'] ?? '1.0.0',
      capabilities: ['route_calculation', 'waypoints', 'vessel_timeline'],
      priority: 2,
      dependencies: ['entity-extraction'],
      status: 'active',
      intents: ['bunker_planning', 'voyage_optimization', 'route_calculation'],
      graphNodeName: 'route_agent',
    },
    async (input, context) => {
      const state = toStateFormat(input, context);
      const node = getRouteAgentNode();
      return node(state);
    }
  );
}

/**
 * Register Weather Agent
 */
function registerWeatherAgent(): void {
  if (!isAgentEnabled('weather-agent')) return;

  registerAgent(
    {
      id: 'weather-agent',
      name: 'Weather Analysis Agent',
      version: AGENT_VERSIONS['weather-agent'] ?? '1.0.0',
      capabilities: ['weather_forecast', 'weather_consumption', 'port_weather'],
      priority: 3,
      dependencies: ['route-agent'],
      status: 'active',
      intents: ['bunker_planning', 'weather_analysis'],
      graphNodeName: 'weather_agent',
    },
    async (input, context) => {
      const state = toStateFormat(input, context);
      const node = getWeatherAgentNode();
      return node(state);
    }
  );
}

/**
 * Register Bunker Agent
 */
function registerBunkerAgent(): void {
  if (!isAgentEnabled('bunker-agent')) return;

  registerAgent(
    {
      id: 'bunker-agent',
      name: 'Bunker Optimization Agent',
      version: AGENT_VERSIONS['bunker-agent'] ?? '1.0.0',
      capabilities: ['bunker_analysis', 'bunker_ports', 'fuel_prices'],
      priority: 4,
      dependencies: ['route-agent', 'weather-agent'],
      status: 'active',
      intents: ['bunker_planning', 'voyage_optimization'],
      graphNodeName: 'bunker_agent',
    },
    async (input, context) => {
      const state = toStateFormat(input, context);
      const node = getBunkerAgentNode();
      return node(state);
    }
  );
}

/**
 * Register Vessel Data Agent (placeholder - beta)
 */
function registerVesselDataAgent(): void {
  if (!isAgentEnabled('vessel-data')) return;

  registerAgent(
    {
      id: 'vessel-data',
      name: 'Vessel Data Agent',
      version: AGENT_VERSIONS['vessel-data'] ?? '0.1.0',
      capabilities: ['vessel_lookup', 'noon_report_fetch', 'consumption_profile'],
      priority: 2,
      dependencies: ['entity-extraction'],
      status: 'maintenance',
      featureFlag: 'AGENT_VESSEL_DATA',
    },
    async () => ({ error: 'Vessel Data Agent not yet implemented' })
  );
}

/**
 * Register Fleet Optimizer Agent (placeholder - beta)
 */
function registerFleetOptimizerAgent(): void {
  if (!isAgentEnabled('fleet-optimizer')) return;

  registerAgent(
    {
      id: 'fleet-optimizer',
      name: 'Fleet Optimizer Agent',
      version: AGENT_VERSIONS['fleet-optimizer'] ?? '0.1.0',
      capabilities: ['fleet_optimization', 'multi_vessel_analysis'],
      priority: 5,
      dependencies: ['route-agent', 'bunker-agent'],
      status: 'maintenance',
      featureFlag: 'AGENT_FLEET_OPTIMIZER',
    },
    async () => ({ error: 'Fleet Optimizer Agent not yet implemented' })
  );
}

/**
 * Register Compliance Agent (wraps existing LangGraph node)
 */
function registerComplianceAgent(): void {
  if (!isAgentEnabled('compliance-agent')) return;

  registerAgent(
    {
      id: 'compliance-agent',
      name: 'Compliance Agent',
      version: AGENT_VERSIONS['compliance-agent'] ?? '1.0.0',
      capabilities: ['compliance_check', 'eca_validation', 'compliance_data'],
      priority: 4,
      dependencies: ['route-agent'],
      status: 'active',
      intents: ['compliance_check', 'emissions_calc'],
      graphNodeName: 'compliance_agent',
    },
    async (input, context) => {
      const state = toStateFormat(input, context);
      const node = getComplianceAgentNode();
      return node(state);
    }
  );
}

/**
 * Register Finalize Agent (wraps synthesis node)
 */
function registerFinalizeAgent(): void {
  if (!isAgentEnabled('finalize-agent')) return;

  registerAgent(
    {
      id: 'finalize-agent',
      name: 'Finalize Agent',
      version: AGENT_VERSIONS['finalize-agent'] ?? '1.0.0',
      capabilities: ['synthesis', 'response_formatting'],
      priority: 10,
      dependencies: ['route-agent', 'weather-agent', 'bunker-agent'],
      status: 'active',
      intents: ['bunker_planning', 'voyage_optimization', 'weather_analysis', 'compliance_check'],
      graphNodeName: 'finalize',
    },
    async (input, context) => {
      const state = toStateFormat(input, context);
      const node = getFinalizeNode();
      return node(state);
    }
  );
}

/**
 * Register all agents with the core registry
 */
export function registerAllCoreAgents(): void {
  const registry = AgentRegistry.getInstance();
  registry.initialize();

  registerEntityExtractionAgent();
  registerRouteAgent();
  registerWeatherAgent();
  registerBunkerAgent();
  registerComplianceAgent();
  registerFinalizeAgent();
  registerVesselDataAgent();
  registerFleetOptimizerAgent();

  console.log(
    `✅ [CORE-REGISTRY] Registered ${registry.getAllAgentIds().length} agents`
  );
}
