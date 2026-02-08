/**
 * Component Matcher Service
 * Determines which React components should render based on available state data
 */

import type { MultiAgentState } from '@/lib/multi-agent/state';
import type {
  ComponentRegistryConfig,
  ComponentDefinition,
  MatchedComponent,
} from '@/lib/types/component-registry';

export class ComponentMatcherService {
  constructor(private registry: ComponentRegistryConfig) {}

  /**
   * Match state to renderable components
   */
  matchComponents(state: MultiAgentState, queryType?: string): MatchedComponent[] {
    const matched: MatchedComponent[] = [];

    // Get components for query type if specified
    let componentsToCheck = this.registry.components;
    if (queryType && this.registry.query_type_mappings[queryType]) {
      const relevantComponentIds =
        this.registry.query_type_mappings[queryType].components;
      componentsToCheck = this.registry.components.filter((c) =>
        relevantComponentIds.includes(c.id)
      );
      console.log(
        `[COMPONENT-MATCHER] Checking ${componentsToCheck.length} components for query type: ${queryType}`
      );
    }

    for (const componentDef of componentsToCheck) {
      const match = this.tryMatchComponent(componentDef, state);
      matched.push(match);
    }

    // Sort by priority (lower = higher priority, shown first)
    return matched.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Try to match a single component definition to state
   */
  private tryMatchComponent(
    def: ComponentDefinition,
    state: MultiAgentState
  ): MatchedComponent {
    // Check required fields
    const missingFields: string[] = [];
    for (const field of def.required_state_fields) {
      if (!this.hasStateField(state, field)) {
        missingFields.push(field);
      }
    }

    // Check render conditions
    let conditionsMet = true;
    if (def.render_conditions && def.render_conditions.length > 0) {
      conditionsMet = this.evaluateConditions(def.render_conditions, state);
    }

    const canRender = missingFields.length === 0 && conditionsMet;

    // Resolve props from state
    const props = canRender ? this.resolveProps(def.props_mapping, state) : {};

    return {
      id: def.id,
      component: def.component,
      props,
      tier: def.tier,
      priority: def.priority,
      canRender,
      missingFields: missingFields.length > 0 ? missingFields : undefined,
    };
  }

  /**
   * Check if state has a field (supports nested paths like "route_data.waypoints")
   */
  private hasStateField(state: MultiAgentState, fieldPath: string): boolean {
    const parts = fieldPath.split('.');
    const stateObj = state as Record<string, unknown>;
    let current: unknown = stateObj;

    for (const part of parts) {
      if (!current || typeof current !== 'object' || !(part in current)) {
        return false;
      }
      current = (current as Record<string, unknown>)[part];
    }

    // Check if the value exists and is not empty
    if (current === null || current === undefined) {
      return false;
    }

    // For arrays, check if they have elements
    if (Array.isArray(current) && current.length === 0) {
      return false;
    }

    return true;
  }

  /**
   * Resolve component props from state using props_mapping
   */
  private resolveProps(
    mapping: Record<string, string>,
    state: MultiAgentState
  ): Record<string, unknown> {
    const props: Record<string, unknown> = {};

    for (const [propName, statePath] of Object.entries(mapping)) {
      const value = this.getStateValue(state, statePath);
      if (value !== undefined) {
        props[propName] = value;
      }
    }

    return props;
  }

  /**
   * Get value from state using dot notation path
   */
  private getStateValue(state: MultiAgentState, path: string): unknown {
    const parts = path.split('.');
    const stateObj = state as Record<string, unknown>;
    let current: unknown = stateObj;

    for (const part of parts) {
      if (!current || typeof current !== 'object' || !(part in current)) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Evaluate render conditions (safe JavaScript evaluation)
   */
  private evaluateConditions(
    conditions: string[],
    state: MultiAgentState
  ): boolean {
    try {
      for (const condition of conditions) {
        const result = this.safeEval(condition, state);
        if (!result) {
          return false;
        }
      }
      return true;
    } catch (error) {
      console.warn(`[COMPONENT-MATCHER] Condition evaluation failed:`, error);
      return false;
    }
  }

  /**
   * Safe evaluation of conditions against state
   */
  private safeEval(condition: string, state: MultiAgentState): boolean {
    try {
      const stateObj = state as Record<string, unknown>;
      const keys = Object.keys(stateObj);
      const values = Object.values(stateObj);

      const func = new Function(...keys, `return ${condition}`);
      const result = func(...values);

      return Boolean(result);
    } catch {
      return false;
    }
  }

  /**
   * Get fallback strategy when no components match
   */
  getFallbackStrategy(): 'llm_synthesis' | 'text_only' {
    return this.registry.fallback?.strategy ?? 'text_only';
  }

  /**
   * Get LLM config for fallback synthesis
   */
  getFallbackLLMConfig():
    | { model: string; temperature: number; max_tokens: number }
    | undefined {
    return this.registry.fallback?.llm_config;
  }
}
