# Configuration Loaders

This directory contains configuration loaders for the FuelSense 360 platform.

## YAML Loader

The `yaml-loader.ts` provides a robust YAML configuration loader with:
- Schema validation using Zod
- Caching with TTL support
- Hot-reload in development mode
- Clear error messages
- Type-safe configuration access

## Usage

### Basic Usage

```typescript
import { getYAMLLoader } from '@/lib/config/yaml-loader';
import { z } from 'zod';

// Define schema
const configSchema = z.object({
  name: z.string(),
  description: z.string(),
  value: z.number(),
});

// Load configuration
const loader = getYAMLLoader();
const config = await loader.load('config/my-config.yaml', configSchema);
```

### Loading All Files from Directory

```typescript
// Load all YAML files from a directory
const configs = await loader.loadAll('config/agents', configSchema);

// Access by filename (without extension)
const agentConfig = configs.get('route-agent');
```

### Error Handling

```typescript
import {
  ConfigFileNotFoundError,
  YAMLParsingError,
  ConfigValidationError,
} from '@/lib/config/yaml-loader';

try {
  const config = await loader.load('config/my-config.yaml', configSchema);
} catch (error) {
  if (error instanceof ConfigFileNotFoundError) {
    console.error('Config file not found:', error.message);
  } else if (error instanceof YAMLParsingError) {
    console.error('Invalid YAML:', error.message);
    console.error('Line number:', error.lineNumber);
  } else if (error instanceof ConfigValidationError) {
    console.error('Validation failed:', error.getFormattedErrors());
  }
}
```

### Caching

```typescript
// Clear cache for specific file
await loader.reload('config/my-config.yaml');

// Clear entire cache
loader.clearCache();
```

### Hot-Reload (Development)

Hot-reload is automatically enabled in development mode (`NODE_ENV !== 'production'`).

```typescript
// Manually enable/disable hot-reload
loader.enableHotReload();
loader.disableHotReload();
```

## Agent Configuration Loader

The `agent-loader.ts` provides specialized loading for agent configurations.

### Usage

```typescript
import { loadAgentConfig, loadAllAgentConfigs } from '@/lib/config/agent-loader';

// Load single agent config
const agentConfig = await loadAgentConfig('config/agents/route-agent.yaml');

// Load all agent configs
const agents = await loadAllAgentConfigs('config/agents');
const routeAgent = agents.get('route-agent');
```

### Agent Config Schema

```yaml
name: route-agent
description: Calculates optimal maritime routes
tools:
  - calculate_route
  - calculate_weather_timeline
capabilities:
  - route-calculation
model: claude-haiku-4-5-20251001
temperature: 0.7
maxIterations: 15
```

## Tool Configuration Loader

The `tool-loader.ts` provides specialized loading for tool configurations.

### Usage

```typescript
import { loadToolConfig, loadAllToolConfigs } from '@/lib/config/tool-loader';

// Load single tool config
const toolConfig = await loadToolConfig('config/tools/route-calculator.yaml');

// Load all tool configs
const tools = await loadAllToolConfigs('config/tools');
const routeCalculator = tools.get('route-calculator');
```

### Tool Config Schema

```yaml
name: calculate_route
description: Calculate optimal maritime route
implementation: "@/lib/tools/route-calculator"
inputSchema:
  type: object
  properties:
    origin_port_code:
      type: string
  required:
    - origin_port_code
timeout: 30000
retries: 2
```

## Schema Definition Guide

When defining Zod schemas for configurations:

1. **Use descriptive field names** - Match YAML keys exactly
2. **Provide defaults** - Use `.default()` for optional fields
3. **Add validation** - Use `.min()`, `.max()`, `.email()`, etc.
4. **Document with comments** - Use JSDoc comments

Example:

```typescript
const configSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  port: z.number().int().positive().default(8080),
  timeout: z.number().int().positive().optional(),
});
```

## Error Handling Guide

### File Not Found

```typescript
try {
  await loader.load('config/missing.yaml', schema);
} catch (error) {
  if (error instanceof ConfigFileNotFoundError) {
    // Error message includes expected path
    console.error(error.message);
  }
}
```

### YAML Parsing Errors

```typescript
try {
  await loader.load('config/invalid.yaml', schema);
} catch (error) {
  if (error instanceof YAMLParsingError) {
    console.error('YAML syntax error:', error.message);
    console.error('Line:', error.lineNumber);
  }
  }
}
```

### Validation Errors

```typescript
try {
  await loader.load('config/invalid-schema.yaml', schema);
} catch (error) {
  if (error instanceof ConfigValidationError) {
    console.error('Validation failed:');
    console.error(error.getFormattedErrors());
    // Shows field-by-field errors
  }
}
```

## Performance Considerations

1. **Caching** - Configurations are cached after first load
2. **Hot-reload** - Only enabled in development (disabled in production)
3. **TTL** - Optional TTL can be set for cache entries
4. **Lazy Loading** - Configurations are loaded on-demand

## Examples

See example configuration files:
- `config/agents/example-agent.yaml`
- `config/tools/example-tool.yaml`

