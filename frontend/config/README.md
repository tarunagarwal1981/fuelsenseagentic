# Configuration Schema Documentation

This directory contains YAML configuration files for the FuelSense application. All configuration files are validated using Zod schemas to ensure type safety and catch errors early.

## Hot-Reload (Development Mode)

In development mode, configuration files are automatically reloaded when changed. This allows you to modify YAML configs without restarting the server.

### Enabling Hot-Reload

Hot-reload is automatically enabled when:
- `NODE_ENV !== 'production'`
- `chokidar` package is installed

To install chokidar:
```bash
npm install chokidar
npm install -D @types/chokidar
```

### How It Works

1. **File Watching**: ConfigLoader watches the `config/` directory for changes
2. **Cache Invalidation**: When a file changes, related cache entries are automatically invalidated
3. **Automatic Reload**: Configs are reloaded on the next access
4. **Event Logging**: All reload events are logged with 🔥 [HOT-RELOAD] prefix

### Supported File Types

- `agents/*.yaml` - Agent configurations
- `workflows/*.yaml` - Workflow configurations
- `feature-flags.yaml` or `feature-flags/*.yaml` - Feature flags
- `business-rules/*.yaml` - Business rules

### Manual Refresh

You can manually refresh a config:
```typescript
const loader = ConfigLoader.getInstance();
loader.refresh('agent', 'my-agent-id');
loader.refresh('workflow', 'my-workflow-id');
```

### Testing Hot-Reload

Run the hot-reload test:
```bash
tsx tests/unit/registry/hot-reload.test.ts
```

## Schema Validation

All configuration files are validated at load time using Zod schemas. Invalid configurations will throw descriptive errors with field paths to help identify issues quickly.

## Configuration Types

### Agent Configuration (`agents/*.yaml`)

**Required Fields:**
- `agent_id` (string, min length: 1): Unique identifier for the agent
- `agent_name` (string, min length: 1): Human-readable name
- `agent_type` (enum): One of `'deterministic'`, `'llm'`, or `'hybrid'`
- `description` (string): Description of the agent's purpose

**Optional Fields:**
- `capabilities` (array of strings): List of agent capabilities
- `dependencies` (array of strings): List of agent dependencies
- `tools` (array of strings): List of tools available to the agent
- `status` (enum): One of `'available'`, `'beta'`, or `'coming_soon'`
- `execution` (object):
  - `type` (string): Execution type
  - `average_duration_ms` (number): Average execution duration
  - `max_duration_ms` (number): Maximum execution duration
  - `cost_per_call` (number): Cost per execution
  - `retry_strategy` (object):
    - `max_retries` (number): Maximum retry attempts
    - `backoff` (string): Backoff strategy
- `produces` (array of strings): Outputs produced by the agent
- `consumes` (object):
  - `required` (array of strings): Required inputs
  - `optional` (array of strings): Optional inputs
- `validation` (object):
  - `pre_execution` (array of strings): Pre-execution validation rules
  - `post_execution` (array of strings): Post-execution validation rules
- `human_approval` (object):
  - `required` (boolean): Whether human approval is required
  - `threshold` (object or null):
    - `field` (string): Field to check
    - `operator` (string): Comparison operator
    - `value` (number): Threshold value
- `metadata` (object):
  - `version` (string): Version number
  - `last_updated` (string): Last update timestamp
  - `maintainer` (string): Maintainer information
  - `documentation` (string): Documentation URL

**Example:**
```yaml
agent_id: route_agent
agent_name: Route Calculator Agent
agent_type: deterministic
description: Calculates optimal maritime routes
capabilities:
  - route_calculation
  - distance_estimation
tools:
  - calculate-route
status: available
```

### Workflow Configuration (`workflows/*.yaml`)

**Required Fields:**
- `id` (string): Unique identifier for the workflow (e.g., `bunker_planning`)
- `name` (string): Human-readable name
- `stages` (array): Array of workflow stages
- `execution` (object): Execution configuration
  - `maxTotalTimeMs` (number): Maximum total execution time in milliseconds

**Optional Fields:**
- `description` (string): Description of the workflow
- `queryTypes` (array of strings): Supported query types for workflow matching
- `intentPatterns` (array of strings): Regex patterns for intent matching
- `requiredInputs` (array of strings): Required input fields
- `finalOutputs` (array of strings): Output fields produced by workflow
- `enabled` (boolean): Whether workflow is enabled (default: true)
- `tags` (array of strings): Tags for categorization
- `metadata` (object):
  - `version` (string): Version number
  - `lastUpdated` (string): Last update timestamp

**Stage Object:**
- `id` (string): Unique identifier for the stage
- `agentId` (string): Agent ID to execute in this stage
- `order` (number): Execution order (1, 2, 3...)
- `required` (boolean): Whether stage is required (default: true)
- `parallelWith` (array of strings): Stage IDs that can run in parallel
- `skipIf` (object): Conditions to skip this stage

**Execution Object:**
- `maxTotalTimeMs` (number): Maximum total execution time (1000-600000)
- `allowParallelStages` (boolean): Whether parallel execution is allowed
- `continueOnError` (boolean): Whether to continue if a stage fails

**Example:**
```yaml
id: bunker_planning
name: Bunker Planning Workflow
description: Complete bunker planning workflow with route calculation and cost optimization

queryTypes:
  - bunker_planning
  - route_optimization
  - cost_optimization

intentPatterns:
  - ".*bunker.*"
  - ".*fuel.*port.*"

stages:
  - id: route_calculation
    agentId: route_agent
    order: 1
    required: true

  - id: weather_analysis
    agentId: weather_agent
    order: 2
    required: false
    parallelWith:
      - compliance_check

  - id: compliance_check
    agentId: compliance_agent
    order: 2
    required: false
    parallelWith:
      - weather_analysis

  - id: bunker_planning
    agentId: bunker_agent
    order: 3
    required: true

  - id: finalization
    agentId: finalize
    order: 4
    required: true

execution:
  maxTotalTimeMs: 120000
  allowParallelStages: true
  continueOnError: true

requiredInputs:
  - origin
  - destination

finalOutputs:
  - route_data
  - weather_forecast
  - bunker_analysis
  - final_response

enabled: true

metadata:
  version: "1.0.0"
  lastUpdated: "2025-01-24"
```

**Validation Rules:**
- Each stage must reference a valid agent ID (agent must exist in AgentRegistry)
- Stage IDs must be unique within a workflow
- Stages with the same `order` can run in parallel if `allowParallelStages` is true
- `parallelWith` references must point to valid stage IDs
- `maxTotalTimeMs` should be between 1000ms (1 second) and 600000ms (10 minutes)

### Feature Flags (`feature-flags.yaml`)

**Structure:**
```yaml
flags:
  feature_name: true
  another_feature: false
```

**Schema:**
- `flags` (object): Record of feature names to boolean values

**Example:**
```yaml
flags:
  enable_route_agent: true
  enable_weather_integration: true
  enable_bunker_agent: true
  enable_agentic_supervisor: false
```

### Business Rules (`business-rules/*.yaml`)

Business rules can be defined in individual files or as arrays within files.

**Required Fields:**
- `rule_id` (string): Unique identifier for the rule
- `rule_name` (string): Human-readable name
- `description` (string): Description of the rule
- `condition` (string): Condition expression to evaluate
- `action` (string): Action to take when condition is met
- `priority` (number): Priority level (lower = higher priority)
- `enabled` (boolean): Whether the rule is enabled

**File Formats Supported:**

1. **Single rule object:**
```yaml
rule_id: safety_margin_check
rule_name: Safety Margin Check
description: Ensure minimum fuel safety buffer
condition: "rob_after_bunker < (total_consumption * 0.15)"
action: add_warning
priority: 1
enabled: true
```

2. **Array of rules:**
```yaml
- rule_id: rule1
  rule_name: Rule One
  description: First rule
  condition: "value > 10"
  action: block_operation
  priority: 1
  enabled: true
- rule_id: rule2
  rule_name: Rule Two
  description: Second rule
  condition: "value < 5"
  action: add_warning
  priority: 2
  enabled: true
```

3. **File with `rules` key:**
```yaml
rules:
  - rule_id: rule1
    rule_name: Rule One
    description: First rule
    condition: "value > 10"
    action: block_operation
    priority: 1
    enabled: true
```

## Validation Errors

When a configuration file fails validation, you'll receive an error message with:
- The file/configuration that failed
- Field paths showing exactly where the error occurred
- Specific validation error messages

**Example Error:**
```
Agent config validation failed for test-agent: agent_id: Required, agent_type: Invalid enum value. Expected 'deterministic' | 'llm' | 'hybrid', received 'invalid'
```

## Testing

Run the config loader tests to verify your configurations:

```bash
npm run test
```

The test suite includes:
- Valid configuration loading
- Invalid configuration detection
- Missing required fields
- Invalid enum values
- Invalid data types
- Error message field paths

## Best Practices

1. **Always validate locally**: Test your YAML files before committing
2. **Use descriptive names**: Make `agent_id`, `workflow_id`, and `rule_id` descriptive
3. **Document complex conditions**: Add comments explaining complex business rules
4. **Version your configs**: Use the `metadata.version` field to track changes
5. **Enable/disable features**: Use feature flags to control feature rollout
6. **Test edge cases**: Ensure your business rules handle edge cases correctly

## Troubleshooting

### Common Validation Errors

1. **Missing required fields**: Ensure all required fields are present
2. **Invalid enum values**: Check that enum fields use only allowed values
3. **Type mismatches**: Ensure arrays are arrays, numbers are numbers, etc.
4. **Nested object errors**: Check nested objects like `execution.retry_strategy`

### Getting Help

If you encounter validation errors:
1. Check the error message for the exact field path
2. Review the schema documentation above
3. Compare with existing valid configuration files
4. Run the test suite to see examples of valid configurations
