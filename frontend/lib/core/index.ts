/**
 * Core Module - FuelSense 360
 *
 * Production-grade Agent Registry and related utilities.
 */

export { AgentRegistry } from './AgentRegistry';
export type {
  AgentRegistration,
  AgentRegistrationInput,
  AgentHandler,
  ExecutionContext,
  ExecutionPlan,
  AgentMetadata,
  AgentStatus,
} from './types/AgentTypes';
export { registerAgent, Agent } from './decorators/AgentDecorator';
export type { AgentRegistrationOptions } from './decorators/AgentDecorator';
export { registerAllCoreAgents } from './agents';
