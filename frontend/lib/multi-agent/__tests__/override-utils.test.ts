/**
 * Tests for override-utils: hasParameterOverride, getParameterWithOverride, logOverrideUsage.
 * Ensures route agent and future agents correctly detect and use supervisor recovery overrides.
 */

import './setup-env';

import {
  hasParameterOverride,
  getParameterWithOverride,
  logOverrideUsage,
} from '../utils/override-utils';
import type { MultiAgentState } from '../state';

function minimalState(overrides: Partial<MultiAgentState> = {}): MultiAgentState {
  return {
    messages: [],
    correlation_id: '',
    next_agent: '',
    route_data: null,
    vessel_timeline: null,
    weather_forecast: null,
    weather_consumption: null,
    port_weather_status: null,
    bunker_ports: null,
    port_prices: null,
    bunker_analysis: null,
    multi_bunker_plan: null,
    final_recommendation: null,
    formatted_response: null,
    synthesized_insights: null,
    agent_errors: {},
    agent_status: {},
    agent_context: null,
    selected_route_id: null,
    weather_agent_partial: false,
    standalone_port_weather: null,
    compliance_data: null,
    vessel_consumption: null,
    rob_tracking: null,
    rob_waypoints: null,
    rob_safety_status: null,
    eca_consumption: null,
    eca_summary: null,
    vessel_name: null,
    vessel_profile: null,
    agent_call_counts: { route_agent: 0, weather_agent: 0, bunker_agent: 0 },
    reasoning_history: [],
    current_thought: null,
    next_action: null,
    recovery_attempts: 0,
    needs_clarification: false,
    clarification_question: null,
    port_overrides: undefined,
    agent_overrides: undefined,
    ...overrides,
  } as MultiAgentState;
}

export function testOverrideUtils(): void {
  console.log('\n🧪 [OVERRIDE-UTILS-TEST] Starting override-utils validation...\n');

  // hasParameterOverride: state.port_overrides
  let state = minimalState({ port_overrides: { origin: 'JPYOK' } });
  if (!hasParameterOverride(state, 'route_agent', 'origin')) {
    throw new Error('hasParameterOverride(route_agent, origin) should be true when port_overrides.origin set');
  }
  if (hasParameterOverride(state, 'route_agent', 'destination')) {
    throw new Error('hasParameterOverride(route_agent, destination) should be false when only origin set');
  }
  console.log('✅ hasParameterOverride: state.port_overrides.origin');

  state = minimalState({ port_overrides: { destination: 'ESLPA' } });
  if (!hasParameterOverride(state, 'route_agent', 'destination')) {
    throw new Error('hasParameterOverride(route_agent, destination) should be true when port_overrides.destination set');
  }
  console.log('✅ hasParameterOverride: state.port_overrides.destination');

  // hasParameterOverride: agent_context.route_agent.port_overrides
  state = minimalState({
    agent_context: {
      route_agent: {
        needs_weather_timeline: false,
        required_tools: [],
        task_description: '',
        priority: 'critical',
        port_overrides: { origin: 'SGSIN', destination: 'NLRTM' },
      },
      finalize: { complexity: 'low', needs_weather_analysis: false, needs_bunker_analysis: false },
    },
  });
  if (!hasParameterOverride(state, 'route_agent', 'origin') || !hasParameterOverride(state, 'route_agent', 'destination')) {
    throw new Error('hasParameterOverride should be true for agent_context.route_agent.port_overrides');
  }
  console.log('✅ hasParameterOverride: agent_context.route_agent.port_overrides');

  // hasParameterOverride: no overrides
  state = minimalState();
  if (hasParameterOverride(state, 'route_agent', 'origin') || hasParameterOverride(state, 'route_agent', 'destination')) {
    throw new Error('hasParameterOverride should be false when no overrides');
  }
  console.log('✅ hasParameterOverride: false when no overrides');

  // hasParameterOverride: agent_overrides
  state = minimalState({
    agent_overrides: { weather_agent: { port: 'SGSIN', date: '2024-12-01' } },
  });
  if (!hasParameterOverride(state, 'weather_agent', 'port') || !hasParameterOverride(state, 'weather_agent', 'date')) {
    throw new Error('hasParameterOverride should be true for agent_overrides');
  }
  console.log('✅ hasParameterOverride: agent_overrides');

  // getParameterWithOverride: state.port_overrides
  state = minimalState({ port_overrides: { origin: 'JPYOK', destination: 'ESLPA' } });
  if (getParameterWithOverride(state, 'route_agent', 'origin') !== 'JPYOK' ||
      getParameterWithOverride(state, 'route_agent', 'destination') !== 'ESLPA') {
    throw new Error('getParameterWithOverride should return port_overrides values');
  }
  console.log('✅ getParameterWithOverride: state.port_overrides');

  // getParameterWithOverride: agent_context fallback
  state = minimalState({
    agent_context: {
      route_agent: {
        needs_weather_timeline: false,
        required_tools: [],
        task_description: '',
        priority: 'critical',
        port_overrides: { origin: 'SGSIN', destination: 'NLRTM' },
      },
      finalize: { complexity: 'low', needs_weather_analysis: false, needs_bunker_analysis: false },
    },
  });
  if (getParameterWithOverride(state, 'route_agent', 'origin') !== 'SGSIN' ||
      getParameterWithOverride(state, 'route_agent', 'destination') !== 'NLRTM') {
    throw new Error('getParameterWithOverride should return agent_context.route_agent.port_overrides');
  }
  console.log('✅ getParameterWithOverride: agent_context fallback');

  // getParameterWithOverride: defaultValue
  state = minimalState();
  if (getParameterWithOverride(state, 'route_agent', 'origin', 'default') !== 'default') {
    throw new Error('getParameterWithOverride should return default when no override');
  }
  if (getParameterWithOverride(state, 'route_agent', 'origin') !== undefined) {
    throw new Error('getParameterWithOverride should return undefined when no override and no default');
  }
  console.log('✅ getParameterWithOverride: defaultValue');

  // getParameterWithOverride: agent_overrides
  state = minimalState({
    agent_overrides: { weather_agent: { port: 'AEFJR', date: '2024-12-15' } },
  });
  if (getParameterWithOverride(state, 'weather_agent', 'port') !== 'AEFJR' ||
      getParameterWithOverride(state, 'weather_agent', 'date') !== '2024-12-15') {
    throw new Error('getParameterWithOverride should return agent_overrides values');
  }
  console.log('✅ getParameterWithOverride: agent_overrides');

  // logOverrideUsage: no call when empty (just ensure it does not throw)
  logOverrideUsage('route_agent', {}, 'supervisor');
  console.log('✅ logOverrideUsage: no-op when overrides empty');

  // logOverrideUsage: logs (capture not required for unit test; we only verify it runs)
  logOverrideUsage('route_agent', { origin: 'JPYOK', destination: 'ESLPA' }, 'supervisor');
  console.log('✅ logOverrideUsage: logs override keys/values');

  console.log('\n✅ [OVERRIDE-UTILS-TEST] All override-utils tests passed.\n');
}
