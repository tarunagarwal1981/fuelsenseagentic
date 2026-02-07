/**
 * Core Agent Registry Unit Tests
 *
 * Tests the production-grade AgentRegistry:
 * - Singleton pattern and lazy initialization
 * - Registration/deregistration
 * - Capability-based lookup
 * - Execution plan generation
 * - Health checks
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load env first
config({ path: resolve(process.cwd(), '.env.local') });

import { AgentRegistry } from '../AgentRegistry';
import { registerAgent } from '../decorators/AgentDecorator';
import type { ExecutionContext } from '../types/AgentTypes';

const createMockHandler = (result: unknown) =>
  async (_input: unknown, _ctx: ExecutionContext) => result;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export async function testCoreAgentRegistry(): Promise<void> {
  console.log('\n🧪 [CORE-AGENT-REGISTRY] Starting Core Agent Registry tests...\n');

  AgentRegistry.resetInstance();

  try {
    // Singleton
    const a = AgentRegistry.getInstance();
    const b = AgentRegistry.getInstance();
    assert(a === b, 'getInstance should return same instance');
    console.log('  ✅ Singleton: same instance');

    // Reset and register
    AgentRegistry.resetInstance();
    const registry = AgentRegistry.getInstance();

    registerAgent(
      {
        id: 'entity-extraction',
        name: 'Entity Extraction',
        version: '1.0.0',
        capabilities: ['entity_extraction'],
        priority: 1,
        dependencies: [],
        status: 'active',
      },
      createMockHandler({})
    );

    const agent = registry.getAgent('entity-extraction');
    assert(agent !== null, 'Agent should be found');
    assert(agent!.id === 'entity-extraction', 'Agent id should match');
    assert(agent!.capabilities.includes('entity_extraction'), 'Agent should have capability');
    console.log('  ✅ Registration and getAgent');

    // Deregister
    const removed = registry.deregisterAgent('entity-extraction');
    assert(removed === true, 'Deregister should return true');
    assert(registry.getAgent('entity-extraction') === null, 'Agent should be removed');
    console.log('  ✅ Deregistration');

    // getAgentsByCapability
    AgentRegistry.resetInstance();
    const reg = AgentRegistry.getInstance();
    reg.initialize();

    registerAgent(
      {
        id: 'route-agent',
        name: 'Route',
        version: '1.0.0',
        capabilities: ['route_calculation'],
        priority: 2,
        dependencies: [],
        status: 'active',
        graphNodeName: 'route_agent',
      },
      createMockHandler({})
    );
    registerAgent(
      {
        id: 'weather-agent',
        name: 'Weather',
        version: '1.0.0',
        capabilities: ['weather_forecast'],
        priority: 3,
        dependencies: ['route-agent'],
        status: 'active',
        graphNodeName: 'weather_agent',
      },
      createMockHandler({})
    );
    registerAgent(
      {
        id: 'bunker-agent',
        name: 'Bunker',
        version: '1.0.0',
        capabilities: ['bunker_analysis'],
        priority: 4,
        dependencies: ['route-agent', 'weather-agent'],
        status: 'active',
        graphNodeName: 'bunker_agent',
      },
      createMockHandler({})
    );

    const routeAgents = reg.getAgentsByCapability('route_calculation');
    assert(routeAgents.length >= 1, 'Should find route agents');
    assert(routeAgents.some((a) => a.id === 'route-agent'), 'Should include route-agent');
    console.log('  ✅ getAgentsByCapability');

    // getExecutionPlan
    const plan = reg.getExecutionPlan('bunker_planning');
    const ids = plan.map((a) => a.id);
    assert(ids.includes('route-agent'), 'Plan should include route-agent');
    assert(ids.includes('weather-agent'), 'Plan should include weather-agent');
    assert(ids.includes('bunker-agent'), 'Plan should include bunker-agent');
    assert(ids.indexOf('route-agent') < ids.indexOf('weather-agent'), 'Route before weather');
    assert(ids.indexOf('weather-agent') < ids.indexOf('bunker-agent'), 'Weather before bunker');
    console.log('  ✅ getExecutionPlan');

    // getExecutionPlanAsNodeNames
    const nodeNames = reg.getExecutionPlanAsNodeNames('bunker_planning');
    assert(nodeNames.includes('route_agent'), 'Should include route_agent');
    assert(nodeNames.includes('weather_agent'), 'Should include weather_agent');
    assert(nodeNames.includes('bunker_agent'), 'Should include bunker_agent');
    assert(nodeNames.includes('finalize'), 'Should include finalize');
    console.log('  ✅ getExecutionPlanAsNodeNames');

    // executeAgent
    registerAgent(
      {
        id: 'echo-agent',
        name: 'Echo',
        version: '1.0.0',
        capabilities: ['echo'],
        priority: 1,
        dependencies: [],
        status: 'active',
      },
      createMockHandler({ echoed: true })
    );

    const runTest = async () => {
      const result = await reg.executeAgent(
        'echo-agent',
        { input: 'test' },
        { correlationId: 'test-123' }
      );
      assert(
        typeof result === 'object' && result !== null && 'echoed' in result && (result as any).echoed === true,
        'Execute should return result'
      );
      console.log('  ✅ executeAgent');

      // Agent not found
      let threw = false;
      try {
        await reg.executeAgent('nonexistent', {}, { correlationId: 'test' });
      } catch {
        threw = true;
      }
      assert(threw, 'Should throw for nonexistent agent');
      console.log('  ✅ executeAgent throws for missing agent');

      // healthCheck
      const ok = await reg.healthCheck('echo-agent');
      assert(ok === true, 'Health check should pass');
      const notOk = await reg.healthCheck('nonexistent');
      assert(notOk === false, 'Health check should fail for missing');
      console.log('  ✅ healthCheck');

      // getHealthStatus
      const status = reg.getHealthStatus();
      assert(status['echo-agent'] !== undefined, 'Should have status');
      assert(status['echo-agent'].status === 'active', 'Status should be active');
      console.log('  ✅ getHealthStatus');
    };

    // Run async tests
    await runTest();
  } finally {
    AgentRegistry.resetInstance();
  }
}

export async function runCoreAgentRegistryTests(): Promise<void> {
  console.log('\n📋 [CORE-REGISTRY-TEST] Running Core Agent Registry tests...\n');
  try {
    await testCoreAgentRegistry();
    console.log('\n✅ [CORE-REGISTRY-TEST] All Core Agent Registry tests passed!\n');
  } catch (error) {
    console.error('\n❌ [CORE-REGISTRY-TEST] Test failed:', error);
    throw error;
  }
}

// Run when executed directly (tsx)
const isMain = process.argv[1]?.endsWith('AgentRegistry.test.ts');
if (isMain) {
  runCoreAgentRegistryTests()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
