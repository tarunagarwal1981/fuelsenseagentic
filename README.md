# FuelSense 360

AI-powered maritime bunker optimization and voyage planning. Multi-agent system using Claude, LangGraph, and FuelSense APIs.

## Features

- **Multi-Agent Architecture**: Supervisor routes to specialist agents (route, weather, bunker, compliance, vessel info, vessel selection)
- **Vessel Intelligence**: Vessel count/list, noon reports (ROB, position), consumption profiles, vessel specs
- **Bunker Planning**: Route calculation, bunker port finding, fuel pricing, cost-benefit analysis
- **Weather Integration**: Marine weather forecasts, weather-adjusted consumption
- **ECA Compliance**: Emission Control Area detection and MGO requirements
- **Response Synthesis**: Structured insights, recommendations, and template-based formatting
- **Template-First with LLM Fallback**: Finalize uses templates when available; falls back to LLM-generated responses when templates fail or don't exist (user always gets a response)
- **Registry-Driven**: Agent and tool registries; valid agents derived from registry (scalable to 25+ agents)

## Project Structure

```
FuelSense/
├── frontend/                 # Next.js app
│   ├── app/                  # Pages & API routes
│   │   ├── api/chat-multi-agent/  # Main chat API
│   │   ├── analytics/       # Analytics dashboard
│   │   └── compare/         # Implementation comparison
│   ├── components/          # React components & cards
│   ├── lib/
│   │   ├── multi-agent/     # LangGraph, agents, synthesis, llm-response-generator
│   │   ├── tools/           # Route, weather, bunker, vessel tools
│   │   ├── engines/         # ECA, ROB, capacity, etc.
│   │   ├── registry/        # Agent, tool, workflow registries
│   │   ├── services/        # Route, bunker, weather services
│   │   └── repositories/    # Port, price, vessel repos
│   ├── config/              # YAML (agents, templates, workflows)
│   └── tests/               # Integration, unit, e2e tests
├── config/                  # Prompts, insights, templates
└── scripts/                 # Utilities
```

## Prerequisites

- Node.js v18+
- Anthropic API key
- Upstash Redis (cache + LangGraph checkpointer)
- Supabase (optional, for DB)
- FuelSense API URL (for bunker ports, vessel data)

## Quick Start

```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local with API keys
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `UPSTASH_REDIS_REST_URL` | Yes | Redis REST URL (cache + LangGraph checkpointer) |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Redis token |
| `NEXT_PUBLIC_FUELSENSE_API_URL` | No | FuelSense API (bunker ports, vessel details, datalogs, consumption profiles) |
| `NEXT_PUBLIC_SUPABASE_URL` | No | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No | Supabase anon key |

Create `.env.local` from `.env.example` in `frontend/`. Without Redis, a mock cache is used; without Supabase, JSON fallback works.

## Build & Run

```bash
cd frontend
npm run build
npm start
```

## Testing

Tests live in `frontend/tests/` (integration, unit, e2e) and colocated `__tests__/` (lib, components).

```bash
cd frontend
npm run type-check          # TypeScript
npm run test:all            # Synthesis, template, components
npm run test:registry       # Agent registry
npm run test:agentic        # Agentic supervisor
npm run test:baseline       # Baseline integration
npm run test:e2e:essential  # E2E essential queries
```

## Agents & Tools

| Agent | Tools | Purpose |
|-------|-------|---------|
| vessel_info_agent | fetch_noon_report, fetch_vessel_specs, fetch_consumption_profile | Vessel count, specs, noon reports, consumption |
| route_agent | calculate_route, calculate_weather_timeline | Route calculation |
| weather_agent | fetch_marine_weather, calculate_weather_consumption, check_bunker_port_weather | Weather & consumption |
| bunker_agent | (deterministic) | Port finding, pricing, analysis |
| compliance_agent | validate_eca_zones | ECA zones |
| vessel_selection_agent | (deterministic) | Multi-vessel comparison |
| entity_extractor | - | Extract vessel/port entities |
| finalize | - | Synthesize response (template-first, LLM fallback) |

## Finalize Response Flow

The Finalize agent uses a **template-first, LLM fallback** strategy:

1. **Phase 1 – Synthesis**: Auto-discovery synthesis (`AutoSynthesisEngine`) extracts data from executed agents.
2. **Phase 2 – Rendering**:
   - **Template-first**: `ContextAwareTemplateSelector` picks a template from synthesis context; `TemplateLoader` loads it (returns `{ exists, name, template?, error? }` instead of throwing).
   - **LLM fallback**: If the template is missing or fails, `generateLLMResponse` uses the LLM to generate a response from the full synthesis context.
3. **Legacy fallback**: When synthesis fails, `generateLegacyTextOutput` uses direct formatting.

Key modules: `lib/multi-agent/llm-response-generator.ts`, `lib/config/template-loader.ts`, `lib/formatters/context-aware-template-selector.ts`.

## Deployment

- **Netlify**: Set base directory to `frontend`, build `npm run build`, publish `frontend/.next`
- Set env vars in Netlify dashboard (ANTHROPIC_API_KEY, Redis, etc.)

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md).

## License

ISC
