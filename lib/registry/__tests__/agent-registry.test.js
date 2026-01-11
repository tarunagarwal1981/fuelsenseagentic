"use strict";
/**
 * Agent Registry Unit Tests
 *
 * Tests for the Agent Registry including:
 * - Agent registration
 * - Duplicate ID rejection
 * - Lookup by ID and capability
 * - YAML config loading
 * - Validation
 * - Error handling
 *
 * Run with: npx tsx lib/registry/__tests__/agent-registry.test.ts
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const agent_registry_1 = require("../agent-registry");
const tool_registry_1 = require("../tool-registry");
// Test executor function
const testExecutor = async (input) => {
    return { result: 'test', input };
};
// Helper to create test registration
function createTestRegistration(overrides) {
    return {
        id: 'test_agent',
        name: 'Test Agent',
        type: 'llm',
        description: 'A test agent',
        produces: ['test_output'],
        consumes: {
            required: ['test_input'],
            optional: [],
        },
        available_tools: [],
        config_file: 'config/agents/test-agent.yaml',
        implementation: '@/lib/agents/test-agent',
        executor: testExecutor,
        ...overrides,
    };
}
// Simple test runner
async function runTests() {
    let passed = 0;
    let failed = 0;
    const test = (name, fn) => {
        return async () => {
            try {
                await fn();
                passed++;
                console.log(`✅ ${name}`);
            }
            catch (error) {
                failed++;
                console.error(`❌ ${name}:`, error instanceof Error ? error.message : error);
                if (error instanceof Error && error.stack) {
                    console.error(error.stack);
                }
            }
        };
    };
    console.log('🧪 Running Agent Registry Tests...\n');
    // Setup: Register some test tools
    await test('Setup: Register test tools', () => {
        tool_registry_1.ToolRegistry.clear();
        tool_registry_1.ToolRegistry.register({
            name: 'find_bunker_ports',
            description: 'Find bunker ports',
            implementation: '@/lib/tools/port-finder',
            configPath: 'config/tools/port-finder.yaml',
        });
        tool_registry_1.ToolRegistry.register({
            name: 'get_fuel_prices',
            description: 'Get fuel prices',
            implementation: '@/lib/tools/price-fetcher',
            configPath: 'config/tools/price-fetcher.yaml',
        });
    })();
    // Test: Register agent successfully
    await test('should register agent successfully', () => {
        agent_registry_1.AgentRegistry.clear();
        const registration = createTestRegistration();
        agent_registry_1.AgentRegistry.register(registration);
        const retrieved = agent_registry_1.AgentRegistry.get('test_agent');
        if (!retrieved)
            throw new Error('Agent should be registered');
        if (retrieved.id !== 'test_agent')
            throw new Error('Agent ID mismatch');
        if (retrieved.name !== 'Test Agent')
            throw new Error('Agent name mismatch');
    })();
    // Test: Reject duplicate ID
    await test('should reject duplicate agent ID', () => {
        agent_registry_1.AgentRegistry.clear();
        const registration1 = createTestRegistration({ id: 'duplicate_agent' });
        const registration2 = createTestRegistration({ id: 'duplicate_agent', name: 'Different Name' });
        agent_registry_1.AgentRegistry.register(registration1);
        try {
            agent_registry_1.AgentRegistry.register(registration2);
            throw new Error('Should have thrown DuplicateAgentError');
        }
        catch (error) {
            if (!(error instanceof agent_registry_1.DuplicateAgentError)) {
                throw new Error(`Expected DuplicateAgentError, got ${error}`);
            }
            if (error.agentId !== 'duplicate_agent') {
                throw new Error('Error should contain agent ID');
            }
        }
    })();
    // Test: Find agent by ID
    await test('should find agent by ID', () => {
        agent_registry_1.AgentRegistry.clear();
        const registration = createTestRegistration({ id: 'findable_agent' });
        agent_registry_1.AgentRegistry.register(registration);
        const found = agent_registry_1.AgentRegistry.get('findable_agent');
        if (!found)
            throw new Error('Agent should be found');
        if (found.id !== 'findable_agent')
            throw new Error('Wrong agent found');
        const notFound = agent_registry_1.AgentRegistry.get('non_existent');
        if (notFound !== null)
            throw new Error('Should return null for non-existent agent');
    })();
    // Test: Find agents by capability
    await test('should find agents by capability', () => {
        agent_registry_1.AgentRegistry.clear();
        const agent1 = createTestRegistration({
            id: 'agent1',
            produces: ['capability_a', 'capability_b'],
        });
        const agent2 = createTestRegistration({
            id: 'agent2',
            produces: ['capability_b', 'capability_c'],
        });
        const agent3 = createTestRegistration({
            id: 'agent3',
            produces: ['capability_d'],
        });
        agent_registry_1.AgentRegistry.register(agent1);
        agent_registry_1.AgentRegistry.register(agent2);
        agent_registry_1.AgentRegistry.register(agent3);
        const agentsWithB = agent_registry_1.AgentRegistry.getByCapability('capability_b');
        if (agentsWithB.length !== 2) {
            throw new Error(`Expected 2 agents, got ${agentsWithB.length}`);
        }
        const ids = agentsWithB.map((a) => a.id).sort();
        if (JSON.stringify(ids) !== JSON.stringify(['agent1', 'agent2'])) {
            throw new Error(`Expected ['agent1', 'agent2'], got ${JSON.stringify(ids)}`);
        }
        const agentsWithD = agent_registry_1.AgentRegistry.getByCapability('capability_d');
        if (agentsWithD.length !== 1)
            throw new Error('Should find one agent with capability_d');
        if (agentsWithD[0].id !== 'agent3')
            throw new Error('Wrong agent found');
        const agentsWithNone = agent_registry_1.AgentRegistry.getByCapability('non_existent');
        if (agentsWithNone.length !== 0)
            throw new Error('Should return empty array');
    })();
    // Test: List all agents
    await test('should list all registered agents', () => {
        agent_registry_1.AgentRegistry.clear();
        agent_registry_1.AgentRegistry.register(createTestRegistration({ id: 'agent1' }));
        agent_registry_1.AgentRegistry.register(createTestRegistration({ id: 'agent2' }));
        agent_registry_1.AgentRegistry.register(createTestRegistration({ id: 'agent3' }));
        const all = agent_registry_1.AgentRegistry.listAll();
        if (all.length !== 3)
            throw new Error(`Expected 3 agents, got ${all.length}`);
        const ids = all.map((a) => a.id).sort();
        if (JSON.stringify(ids) !== JSON.stringify(['agent1', 'agent2', 'agent3'])) {
            throw new Error('Wrong agents listed');
        }
    })();
    // Test: Validate tool references
    await test('should validate tool references', () => {
        agent_registry_1.AgentRegistry.clear();
        tool_registry_1.ToolRegistry.clear();
        tool_registry_1.ToolRegistry.register({
            name: 'valid_tool',
            description: 'Valid tool',
            implementation: '@/lib/tools/valid-tool',
            configPath: 'config/tools/valid-tool.yaml',
        });
        // Should succeed with valid tool
        const validAgent = createTestRegistration({
            id: 'valid_agent',
            available_tools: ['valid_tool'],
        });
        agent_registry_1.AgentRegistry.register(validAgent);
        // Should fail with invalid tool
        const invalidAgent = createTestRegistration({
            id: 'invalid_agent',
            available_tools: ['invalid_tool'],
        });
        try {
            agent_registry_1.AgentRegistry.register(invalidAgent);
            throw new Error('Should have thrown InvalidToolReferenceError');
        }
        catch (error) {
            if (!(error instanceof agent_registry_1.InvalidToolReferenceError)) {
                throw new Error(`Expected InvalidToolReferenceError, got ${error}`);
            }
            if (error.toolName !== 'invalid_tool') {
                throw new Error('Error should contain tool name');
            }
        }
    })();
    // Test: Missing required fields
    await test('should reject agent with missing required fields', () => {
        agent_registry_1.AgentRegistry.clear();
        const invalidAgent = {
            id: 'incomplete_agent',
            // Missing name, type, description, etc.
        };
        try {
            agent_registry_1.AgentRegistry.register(invalidAgent);
            throw new Error('Should have thrown error for missing fields');
        }
        catch (error) {
            if (error instanceof agent_registry_1.MissingRequiredFieldError) {
                if (error.missingFields.length === 0) {
                    throw new Error('Should list missing fields');
                }
            }
            else if (!(error instanceof Error)) {
                throw new Error('Should throw an error');
            }
        }
    })();
    // Test: Load from YAML config
    await test('should load agent from YAML config', async () => {
        agent_registry_1.AgentRegistry.clear();
        tool_registry_1.ToolRegistry.clear();
        // Register tools that the YAML config references
        tool_registry_1.ToolRegistry.register({
            name: 'find_bunker_ports',
            description: 'Find bunker ports',
            implementation: '@/lib/tools/port-finder',
            configPath: 'config/tools/port-finder.yaml',
        });
        tool_registry_1.ToolRegistry.register({
            name: 'get_fuel_prices',
            description: 'Get fuel prices',
            implementation: '@/lib/tools/price-fetcher',
            configPath: 'config/tools/price-fetcher.yaml',
        });
        tool_registry_1.ToolRegistry.register({
            name: 'analyze_bunker_options',
            description: 'Analyze bunker options',
            implementation: '@/lib/tools/bunker-analyzer',
            configPath: 'config/tools/bunker-analyzer.yaml',
        });
        const fixturesDir = path.join(__dirname, 'fixtures');
        const configPath = path.join(fixturesDir, 'example-agent.yaml');
        await agent_registry_1.AgentRegistry.loadFromConfig(configPath, testExecutor);
        const agent = agent_registry_1.AgentRegistry.get('bunker_planner');
        if (!agent)
            throw new Error('Agent should be loaded');
        if (agent.name !== 'Bunker Planner Agent')
            throw new Error('Agent name mismatch');
        if (agent.type !== 'llm')
            throw new Error('Agent type mismatch');
        if (agent.produces.length !== 3)
            throw new Error('Should have 3 produces');
        if (!agent.model)
            throw new Error('Should have model config');
        if (agent.model.provider !== 'anthropic')
            throw new Error('Model provider mismatch');
    })();
    // Test: Config load error handling
    await test('should handle config load errors', async () => {
        agent_registry_1.AgentRegistry.clear();
        const nonExistentPath = path.join(__dirname, 'fixtures', 'non-existent.yaml');
        try {
            await agent_registry_1.AgentRegistry.loadFromConfig(nonExistentPath, testExecutor);
            throw new Error('Should have thrown ConfigLoadError');
        }
        catch (error) {
            if (!(error instanceof agent_registry_1.ConfigLoadError)) {
                throw new Error(`Expected ConfigLoadError, got ${error}`);
            }
            if (!error.message.includes('non-existent.yaml')) {
                throw new Error('Error should mention file path');
            }
        }
    })();
    // Test: Count and has methods
    await test('should provide count and has methods', () => {
        agent_registry_1.AgentRegistry.clear();
        if (agent_registry_1.AgentRegistry.count() !== 0)
            throw new Error('Should start with 0 agents');
        if (agent_registry_1.AgentRegistry.has('test'))
            throw new Error('Should return false for non-existent agent');
        agent_registry_1.AgentRegistry.register(createTestRegistration({ id: 'test' }));
        if (agent_registry_1.AgentRegistry.count() !== 1)
            throw new Error('Should have 1 agent');
        if (!agent_registry_1.AgentRegistry.has('test'))
            throw new Error('Should return true for existing agent');
    })();
    // Test: toJSON export
    await test('should export registry as JSON', () => {
        agent_registry_1.AgentRegistry.clear();
        agent_registry_1.AgentRegistry.register(createTestRegistration({ id: 'json_agent' }));
        const json = agent_registry_1.AgentRegistry.toJSON();
        const parsed = JSON.parse(json);
        if (!parsed.agents)
            throw new Error('JSON should have agents array');
        if (!Array.isArray(parsed.agents))
            throw new Error('Agents should be an array');
        if (parsed.agents.length !== 1)
            throw new Error('Should have 1 agent in JSON');
        if (parsed.total_agents !== 1)
            throw new Error('Should have total_agents count');
        if (parsed.agents[0].id !== 'json_agent')
            throw new Error('Agent ID mismatch in JSON');
        // Executor should not be in JSON
        if (parsed.agents[0].executor)
            throw new Error('Executor should not be serialized');
    })();
    // Summary
    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exit(1);
    }
}
// Run tests if this file is executed directly
if (require.main === module) {
    runTests().catch(console.error);
}
//# sourceMappingURL=agent-registry.test.js.map