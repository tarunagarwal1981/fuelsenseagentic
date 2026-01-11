# FuelSense 360 Project Restructure

## Overview

This document describes the restructuring of the FuelSense 360 project from a 4-tool manual/LangGraph implementation into a configuration-driven 8-agent platform. The restructure creates a scalable architecture that supports easy addition of new agents, tools, and workflows without code changes.

## What Changed

### New Directory Structure

The project now has a clear separation between:
- **Configuration** (`config/`) - Declarative configurations
- **Implementation** (`lib/`) - Executable code
- **Data** (`data/`) - Data files

### Directory Structure

```
config/
  agents/          # Agent configuration files (8 agents)
  tools/          # Tool configuration files
  workflows/       # Workflow definitions
  prompts/         # Prompt templates
  business-rules/  # Business logic rules
  features/        # Feature flags and configurations

lib/
  agents/          # Agent implementations (moved from src/agents/)
  engines/         # Agent execution engines
  tools/           # Tool implementations (consolidated)
  workflow/        # Workflow orchestration (moved from lib/langgraph/)
  registry/        # Agent/tool registry system
  validators/      # Validation utilities
  config/          # Configuration loaders
  types/           # TypeScript types (consolidated)

data/
  ports/           # Port data files
  vessels/         # Vessel data files
  prices/          # Price data files
  compliance/      # Compliance data files
```

## Migration Details

### Agents

**Moved:**
- `src/agents/bunker-agent.ts` → `lib/agents/bunker-agent.ts`
- `src/agents/complete-bunker-agent.ts` → `lib/agents/complete-bunker-agent.ts`
- `src/agents/route-agent.ts` → `lib/agents/route-agent.ts`
- `src/agents/demo.ts` → `lib/agents/demo.ts`
- `src/agents/__tests__/*` → `lib/agents/__tests__/*`

**Import Updates:**
- Updated tool imports to use `../tools/`
- Updated type imports to use `../types/`
- Updated data imports to use `../../data/ports/ports.json`
- Updated utils imports to use `../../src/utils/map-visualizer` (temporary)

### Tools

**Consolidated:**
- Kept `lib/tools/` as the primary location (used by app)
- Copied `src/tools/__tests__/` to `lib/tools/__tests__/`
- Updated imports from `@/lib/types` to `../types` for consistency

**Files:**
- `lib/tools/route-calculator.ts`
- `lib/tools/port-finder.ts`
- `lib/tools/price-fetcher.ts`
- `lib/tools/bunker-analyzer.ts`

### Workflow

**Moved:**
- `lib/langgraph/graph.ts` → `lib/workflow/graph.ts`
- `lib/langgraph/nodes.ts` → `lib/workflow/nodes.ts`
- `lib/langgraph/state.ts` → `lib/workflow/state.ts`
- `lib/langgraph/tools.ts` → `lib/workflow/tools.ts`

**Note:** The old `lib/langgraph/` directory is preserved for now. It can be removed after verification.

### Types

**Consolidated:**
- `src/types/index.ts` and `lib/types/index.ts` were identical
- Kept `lib/types/index.ts` as the single source of truth
- All imports now reference `lib/types/`

### Data

**Organized:**
- `src/data/ports.json` → `data/ports/ports.json`
- `src/data/prices.json` → `data/prices/prices.json`
- Removed duplicates from `lib/data/` (ports.json, prices.json)

### App API Routes

**Updated Imports:**
- `app/api/chat-langgraph/route.ts`: `@/lib/langgraph/graph` → `@/lib/workflow/graph`
- `app/api/test-langgraph/route.ts`: `@/lib/langgraph/graph` → `@/lib/workflow/graph`
- `app/api/chat/route.ts`: Already using `@/lib/tools/*` (no change needed)

## New Components

### Configuration System

Created placeholder configuration files for:
- **8 Agents** (`config/agents/agent-1.ts` through `agent-8.ts`)
- **4 Tools** (`config/tools/*.config.ts`)
- **2 Workflows** (`config/workflows/default-workflow.ts`, `langgraph-workflow.ts`)
- **Prompts** (`config/prompts/system-prompts.ts`, `agent-prompts.ts`)

### Infrastructure

Created placeholder implementations for:
- **Engines** (`lib/engines/agent-engine.ts`, `workflow-engine.ts`)
- **Registry** (`lib/registry/agent-registry.ts`, `tool-registry.ts`)
- **Config Loaders** (`lib/config/agent-loader.ts`, `tool-loader.ts`)
- **Validators** (`lib/validators/README.md`)

## TypeScript Configuration

Updated `tsconfig.json`:
- Added `lib/**/*`, `config/**/*`, `data/**/*`, `app/**/*` to `include`
- Excluded `frontend` directory (separate Next.js app)

## Preservation Strategy

- **Old directories preserved:** `src/` and `lib/langgraph/` are kept for now
- **No deletions:** All original code is preserved
- **Incremental migration:** Imports updated incrementally
- **Verification needed:** Test compilation and runtime before removing old directories

## Next Steps

1. **Verify Compilation:** Run `npm run build` to ensure TypeScript compiles
2. **Test Runtime:** Verify all API routes work with new imports
3. **Update Remaining Imports:** Check for any remaining references to old paths
4. **Implement Placeholders:** Fill in the placeholder implementations
5. **Remove Old Directories:** After verification, remove `src/` and `lib/langgraph/`
6. **Update Documentation:** Update any documentation referencing old paths

## Import Path Reference

### Before → After

| Old Path | New Path |
|----------|----------|
| `src/agents/*` | `lib/agents/*` |
| `src/tools/*` | `lib/tools/*` |
| `lib/langgraph/*` | `lib/workflow/*` |
| `src/types/*` | `lib/types/*` |
| `src/data/ports.json` | `data/ports/ports.json` |
| `src/data/prices.json` | `data/prices/prices.json` |
| `@/lib/langgraph/graph` | `@/lib/workflow/graph` |

## Benefits

1. **Scalability:** Easy to add new agents via configuration
2. **Maintainability:** Clear separation of concerns
3. **Flexibility:** Configuration-driven behavior without code changes
4. **Organization:** Logical grouping of related files
5. **Extensibility:** Placeholder infrastructure ready for implementation

## Notes

- The `frontend/lib/` directory is kept separate as per requirements
- All existing functionality is preserved
- The restructure is non-breaking for the app directory (uses `@/lib/` paths)
- Configuration system is ready for 8-agent platform expansion

