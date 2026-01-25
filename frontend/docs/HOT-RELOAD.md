# Hot-Reload Configuration Guide

## Overview

The ConfigLoader now supports hot-reload of YAML configuration files in development mode. This allows you to modify agent, workflow, feature flag, and business rule configurations without restarting the server.

## Installation

Hot-reload requires the `chokidar` package:

```bash
npm install chokidar
npm install -D @types/chokidar
```

## How It Works

### Automatic Detection

Hot-reload is automatically enabled when:
- `NODE_ENV !== 'production'` (development mode)
- `chokidar` package is installed

If chokidar is not installed, you'll see a warning but the system will continue to work without hot-reload.

### File Watching

The ConfigLoader watches the `config/` directory for changes to:
- `agents/*.yaml` - Agent configurations
- `workflows/*.yaml` - Workflow configurations  
- `feature-flags.yaml` or `feature-flags/*.yaml` - Feature flags
- `business-rules/*.yaml` - Business rules

### Cache Invalidation

When a file changes:
1. The file watcher detects the change
2. Related cache entries are automatically invalidated
3. The config is reloaded on next access
4. Validation errors are logged if the new config is invalid

### Event Logging

All hot-reload events are logged with the `🔥 [HOT-RELOAD]` prefix:
- `🔥 [HOT-RELOAD] Enabled for config files` - Watcher started
- `🔥 [HOT-RELOAD] Config changed: <path>` - File changed
- `🔄 [HOT-RELOAD] Reloading agent: <id>` - Reloading config
- `✅ [HOT-RELOAD] Agent <id> reloaded successfully` - Reload complete

## Usage

### Automatic Reload

Simply edit any YAML config file and save. The changes will be picked up automatically:

```bash
# Edit a config file
vim config/agents/my-agent.yaml

# Save the file - hot-reload will detect and reload automatically
# No server restart needed!
```

### Manual Refresh

You can manually refresh a specific config:

```typescript
import { ConfigLoader } from '@/lib/registry/config-loader';

const loader = ConfigLoader.getInstance();

// Refresh an agent config
loader.refresh('agent', 'my-agent-id');

// Refresh a workflow config
loader.refresh('workflow', 'my-workflow-id');

// Clear all cache
loader.clearCache();
```

### Cleanup on Shutdown

For proper cleanup in Next.js API routes or serverless functions:

```typescript
// In your API route or shutdown handler
import { ConfigLoader } from '@/lib/registry/config-loader';

// On shutdown
process.on('SIGTERM', async () => {
  const loader = ConfigLoader.getInstance();
  await loader.close();
});

process.on('SIGINT', async () => {
  const loader = ConfigLoader.getInstance();
  await loader.close();
  process.exit(0);
});
```

## Testing

Run the hot-reload test:

```bash
npm run test:hot-reload
```

Or directly:

```bash
tsx tests/unit/registry/hot-reload.test.ts
```

## Production Mode

Hot-reload is **automatically disabled** in production (`NODE_ENV=production`). This ensures:
- No file watchers are created
- No performance overhead
- No unnecessary dependencies

## Troubleshooting

### Hot-reload not working?

1. **Check NODE_ENV**: Ensure `NODE_ENV !== 'production'`
   ```bash
   echo $NODE_ENV
   ```

2. **Check chokidar installation**:
   ```bash
   npm list chokidar
   ```

3. **Check logs**: Look for `🔥 [HOT-RELOAD]` messages in console

4. **Verify file paths**: Ensure config files are in the correct directories

### File changes not detected?

- Wait 1-2 seconds after saving (file watcher needs time to detect)
- Check file permissions
- Ensure files end with `.yaml` or `.yml`
- Check console for error messages

### Cache not invalidating?

- Use `loader.clearCache()` to manually clear
- Use `loader.refresh('agent', 'id')` to refresh specific configs
- Check that file paths match expected patterns

## Best Practices

1. **Test changes incrementally**: Make small changes and verify they work
2. **Check validation errors**: Invalid configs will log errors but won't crash
3. **Use version control**: Hot-reload makes it easy to test, but commit working configs
4. **Monitor logs**: Watch for `🔥 [HOT-RELOAD]` messages to confirm reloads
5. **Cleanup on shutdown**: Always call `loader.close()` in production shutdown handlers

## Example Workflow

```bash
# 1. Start dev server
npm run dev

# 2. Edit a config file
vim config/agents/route-agent.yaml

# 3. Save - watch console for:
#    🔥 [HOT-RELOAD] Config changed: config/agents/route-agent.yaml
#    🔄 [HOT-RELOAD] Reloading agent: route-agent
#    ✅ [HOT-RELOAD] Agent route-agent reloaded successfully

# 4. Test the change immediately - no restart needed!
```

## Limitations

- Hot-reload only works in development mode
- Requires chokidar package to be installed
- File watcher has a small delay (1-2 seconds) for detection
- Invalid configs will log errors but won't crash the system
- Cache invalidation is per-file, not per-directory
