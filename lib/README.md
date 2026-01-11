# Library Directory

This directory contains the core implementation code for the FuelSense 360 platform.

## Structure

- `agents/` - Agent implementations (moved from src/agents/)
- `engines/` - Agent execution engines and orchestration logic
- `tools/` - Tool implementations (consolidated from src/tools/ and lib/tools/)
- `workflow/` - Workflow orchestration (moved from lib/langgraph/)
- `registry/` - Agent and tool registry system
- `validators/` - Validation utilities and business rule validators
- `config/` - Configuration loaders and parsers
- `types/` - TypeScript type definitions (consolidated from src/types/ and lib/types/)

## Purpose

This directory contains all executable code, while `config/` contains declarative configurations that drive the system behavior.

