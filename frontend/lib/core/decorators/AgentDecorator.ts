/**
 * Agent Decorator - FuelSense 360
 *
 * Factory pattern for declarative agent registration.
 * Use registerAgent() for explicit registration (no decorator support needed).
 *
 * For @Agent() decorator: enable "experimentalDecorators": true in tsconfig.json
 */

import type { AgentRegistrationInput, AgentHandler } from '../types/AgentTypes';
import { AgentRegistry } from '../AgentRegistry';

// ============================================================================
// Registration Options
// ============================================================================

export interface AgentRegistrationOptions
  extends Omit<AgentRegistrationInput, 'handler'> {}

// ============================================================================
// registerAgent - Primary API
// ============================================================================

/**
 * Register an agent with the registry.
 * Use this for explicit registration (works without decorator support).
 *
 * @example
 * ```typescript
 * export const entityExtractionAgent = registerAgent(
 *   {
 *     id: 'entity-extraction',
 *     name: 'Entity Extraction Agent',
 *     version: '1.0.0',
 *     capabilities: ['entity_extraction', 'intent_classification'],
 *     priority: 1,
 *     dependencies: [],
 *     status: 'active',
 *   },
 *   async (input, context) => extractEntities(String(input), {
 *     correlationId: context.correlationId,
 *   })
 * );
 * ```
 */
export function registerAgent(
  options: AgentRegistrationOptions,
  handler: AgentHandler
): void {
  const registry = AgentRegistry.getInstance();
  registry.registerAgent({
    ...options,
    handler,
    metadata: {
      avgExecutionTime: 0,
      successRate: 1,
      lastHealthCheck: 0,
    },
  });
}

// ============================================================================
// Agent() - Decorator-style factory (for future decorator support)
// ============================================================================

/**
 * Create an agent registration config.
 * Use with registerAgent for a fluent API:
 *
 * ```typescript
 * const config = Agent({ id: 'my-agent', ... });
 * registerAgent(config, myHandler);
 * ```
 */
export function Agent(options: AgentRegistrationOptions): AgentRegistrationOptions {
  return options;
}
