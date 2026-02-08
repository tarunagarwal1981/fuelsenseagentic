# FuelSense 360

AI-powered maritime bunker optimization and voyage planning. Multi-agent system using Claude, LangGraph, and FuelSense APIs.

## Features

- **AI-FIRST Routing**: LLM Intent Classification primary (GPT-4o-mini), regex patterns fallback; natural language understanding with 7-day Redis caching
- **Multi-Agent Architecture**: Supervisor routes to specialist agents (route, weather, bunker, compliance, vessel info, vessel selection)
- **Vessel Intelligence**: Vessel count/list, noon reports (ROB, position), consumption profiles, vessel specs
- **Bunker Planning**: Route calculation, bunker port finding, fuel pricing, cost-benefit analysis
- **Weather Integration**: Marine weather forecasts, weather-adjusted consumption
- **ECA Compliance**: Emission Control Area detection and MGO requirements
- **Response Synthesis**: Structured insights, recommendations, and template-based formatting
- **Template-First with LLM Fallback**: Finalize uses templates when available; falls back to LLM-generated responses when templates fail or don't exist (user always gets a response)
- **LLM-First Synthesis (optional)**: When `LLM_FIRST_SYNTHESIS=true`, Finalize uses LLM to generate intent-aware responses from compact context; templates remain fallback. Scalable for 25+ agents.
- **Registry-Driven**: Agent and tool registries; valid agents derived from registry (scalable to 25+ agents)
- **Component Registry**: YAML-based mapping of agent state outputs → React UI components; decouples data from presentation; supports text-only and hybrid (text + interactive components) responses

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
│   │   ├── services/        # Route, bunker, weather, component-matcher
│   │   └── repositories/    # Port, price, vessel repos
│   ├── config/              # YAML (agents, templates, component-registry)
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
| `OPENAI_API_KEY` | No | GPT-4o-mini for intent classification (fallback: Claude) |
| `UPSTASH_REDIS_REST_URL` | Yes | Redis REST URL (cache + LangGraph checkpointer) |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Redis token |
| `NEXT_PUBLIC_FUELSENSE_API_URL` | No | FuelSense API (bunker ports, vessel details, datalogs, consumption profiles) |
| `NEXT_PUBLIC_SUPABASE_URL` | No | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No | Supabase anon key |
| `LLM_FIRST_SYNTHESIS` | No | When true, Finalize uses LLM-first synthesis; template fallback on failure (default: false) |

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

## Finalize Response Flow (Component Registry)

The Finalize agent uses a **Component Registry** to map agent state to renderable React components:

1. **Component Matching**: `ComponentMatcherService` loads `lib/config/component-registry.yaml`, matches state fields to components (RouteMap, CostComparison, ECAComplianceCard, WeatherTimeline), and resolves props via `props_mapping`.
2. **Response Types**:
   - **Hybrid** (components available): LLM generates contextual intro text; `formatted_response` includes `type: 'hybrid'`, `text`, and `components` manifest for frontend.
   - **Text-only** (no components match): LLM synthesizes full response; `formatted_response` has `type: 'text_only'` and `content`.
3. **Frontend**: `HybridResponseRenderer` renders text + dynamic components; unknown components show graceful degradation.

Key modules: `lib/config/component-registry.yaml`, `lib/config/component-loader.ts`, `lib/services/component-matcher.service.ts`, `components/hybrid-response-renderer.tsx`.

## Deployment

- **Netlify**: Set base directory to `frontend`, build `npm run build`, publish `frontend/.next`
- Set env vars in Netlify dashboard (ANTHROPIC_API_KEY, Redis, etc.)

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md).

- **Query routing**: AI-FIRST 3-tier framework (LLM → regex fallback → Tier 3 reasoning)

## License

ISC
