# Agent Registry

The Agent Registry is a centralized catalog of all agents with their capabilities, tools, and configurations. It supports auto-registration patterns and YAML configuration loading.

## Features

- **Auto-Registration**: Agents can self-register on import
- **YAML Configuration**: Load agent configurations from YAML files
- **Validation**: Comprehensive validation of agent definitions
- **Lookup**: Find agents by ID or capability
- **Thread-Safe**: Singleton pattern for safe concurrent access

## Usage

### Auto-Registration Pattern

Each agent file should export an `agentRegistration` object and register it automatically:

```typescript
// lib/agents/my-agent.ts
import { AgentRegistry, AgentRegistration } from '../registry/agent-registry';

// Define executor function
async function myAgentExecutor(input: any): Promise<any> {
  // Agent implementation
  return { result: 'success' };
}

// Export registration
export const agentRegistration: AgentRegistration = {
  id: 'my_agent',
  name: 'My Agent',
  type: 'llm',
  description: 'Agent description',
  produces: ['output_capability'],
  consumes: {
    required: ['input_data'],
    optional: [],
  },
  available_tools: ['tool1', 'tool2'],
  config_file: 'config/agents/my-agent.yaml',
  implementation: '@/lib/agents/my-agent',
  executor: myAgentExecutor,
};

// Auto-register on import
AgentRegistry.register(agentRegistration);
```

### Manual Registration

You can also register agents manually:

```typescript
import { AgentRegistry } from '@/lib/registry/agent-registry';

const registration: AgentRegistration = {
  // ... registration data
};

AgentRegistry.register(registration);
```

### Loading from YAML Config

Load agent registration from a YAML file:

```typescript
import { AgentRegistry } from '@/lib/registry/agent-registry';

async function myAgentExecutor(input: any): Promise<any> {
  // Implementation
}

// Load from YAML and register
await AgentRegistry.loadFromConfig(
  'config/agents/my-agent-registration.yaml',
  myAgentExecutor
);
```

### YAML Configuration Format

```yaml
id: my_agent
name: My Agent
type: llm
description: Agent description
produces:
  - output_capability_1
  - output_capability_2
consumes:
  required:
    - required_input_1
    - required_input_2
  optional:
    - optional_input_1
available_tools:
  - tool1
  - tool2
config_file: config/agents/my-agent.yaml
prompt_file: config/prompts/my-agent-prompt.txt
implementation: "@/lib/agents/my-agent"
model:
  provider: anthropic
  name: claude-haiku-4-5-20251001
  temperature: 0.7
  max_tokens: 4096
```

### Looking Up Agents

```typescript
import { AgentRegistry } from '@/lib/registry/agent-registry';

// Get agent by ID
const agent = AgentRegistry.get('bunker_planner');
if (agent) {
  console.log(`Found agent: ${agent.name}`);
}

// Find agents by capability
const agents = AgentRegistry.getByCapability('bunker_recommendations');
agents.forEach(agent => {
  console.log(`${agent.name} produces bunker_recommendations`);
});

// List all agents
const allAgents = AgentRegistry.listAll();
console.log(`Total agents: ${allAgents.length}`);

// Check if agent exists
if (AgentRegistry.has('my_agent')) {
  console.log('Agent is registered');
}

// Get count
console.log(`Registered agents: ${AgentRegistry.count()}`);
```

### Export Registry

Export registry as JSON for debugging or LLM consumption:

```typescript
const json = AgentRegistry.toJSON();
console.log(json);
```

## Agent Types

- **`deterministic`**: No LLM, pure logic-based agent
- **`llm`**: LLM-based agent with tool calling
- **`hybrid`**: Combination of deterministic and LLM logic
- **`tool_based`**: Agent that primarily uses tools

## Validation

The registry validates:

1. **Required Fields**: All required fields must be present
2. **Unique IDs**: Agent IDs must be unique
3. **Tool References**: All referenced tools must exist in ToolRegistry
4. **Schema Validation**: All data must match the Zod schema

## Error Handling

### DuplicateAgentError

Thrown when attempting to register an agent with an existing ID:

```typescript
try {
  AgentRegistry.register(registration);
} catch (error) {
  if (error instanceof DuplicateAgentError) {
    console.error(`Agent ${error.agentId} already registered`);
    console.error(`Existing: ${error.existingAgent.name}`);
  }
}
```

### InvalidToolReferenceError

Thrown when an agent references a tool that doesn't exist:

```typescript
try {
  AgentRegistry.register(registration);
} catch (error) {
  if (error instanceof InvalidToolReferenceError) {
    console.error(`Invalid tool: ${error.toolName}`);
    console.error(`Available tools: ${error.availableTools.join(', ')}`);
  }
}
```

### MissingRequiredFieldError

Thrown when required fields are missing:

```typescript
try {
  AgentRegistry.register(registration);
} catch (error) {
  if (error instanceof MissingRequiredFieldError) {
    console.error(`Missing fields: ${error.missingFields.join(', ')}`);
  }
}
```

### ConfigLoadError

Thrown when loading YAML configuration fails:

```typescript
try {
  await AgentRegistry.loadFromConfig(path, executor);
} catch (error) {
  if (error instanceof ConfigLoadError) {
    console.error(`Failed to load: ${error.configPath}`);
    console.error(`Error: ${error.originalError.message}`);
  }
}
```

## Examples

See example implementations:

- `lib/agents/bunker-agent.ts` - Example agent with auto-registration
- `lib/registry/__tests__/fixtures/example-agent.yaml` - Example YAML config
- `lib/registry/__tests__/agent-registry.test.ts` - Test examples

## Thread Safety

The registry uses a singleton pattern with static methods, making it thread-safe for concurrent access. All operations are synchronous except for `loadFromConfig()`.

## Best Practices

1. **Register Tools First**: Ensure all tools are registered in ToolRegistry before registering agents
2. **Use Auto-Registration**: Prefer auto-registration pattern for cleaner code
3. **Validate Early**: Register agents during application startup
4. **Handle Errors**: Always handle registration errors gracefully
5. **Use YAML for Config**: Store agent metadata in YAML for easy updates

