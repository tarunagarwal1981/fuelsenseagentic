# FuelSense 360 - Maritime Bunker Port Optimization Agent

An AI-powered multi-agent system designed to optimize maritime bunker port operations using advanced decision-making capabilities.

## Overview

FuelSense 360 is a TypeScript-based AI agent that leverages Anthropic's Claude API and LangGraph to provide intelligent optimization solutions for maritime bunker port operations. The system features a multi-agent architecture with specialized agents for routing, weather analysis, bunker planning, and compliance checking.

## Project Structure

```
FuelSense/
├── frontend/                    # Main Next.js application
│   ├── app/                     # Next.js App Router
│   │   ├── api/                 # API routes
│   │   │   ├── chat/            # Basic chat endpoint
│   │   │   ├── chat-langgraph/  # LangGraph-based chat
│   │   │   ├── chat-multi-agent/# Multi-agent orchestration
│   │   │   └── monitoring/      # Performance monitoring
│   │   ├── chat-multi-agent/    # Multi-agent chat page
│   │   ├── analytics/           # Analytics dashboard
│   │   └── compare/             # Implementation comparison
│   ├── components/              # React components
│   │   ├── cards/               # Response card components
│   │   │   ├── executive-decision-card.tsx
│   │   │   ├── informational-response-card.tsx
│   │   │   ├── validation-result-card.tsx
│   │   │   └── comparison-result-card.tsx
│   │   ├── template-response/   # Template rendering
│   │   ├── ui/                  # Shadcn UI components
│   │   ├── bunker-response-viewer.tsx
│   │   ├── map-viewer.tsx
│   │   └── weather-card.tsx
│   ├── lib/                     # Core libraries
│   │   ├── config/              # Configuration loaders
│   │   ├── data/                # Static data (ports, prices, vessels)
│   │   ├── engines/             # Business logic engines
│   │   │   ├── capacity-validation-engine.ts
│   │   │   ├── eca-consumption-engine.ts
│   │   │   ├── rob-tracking-engine.ts
│   │   │   ├── safety-margin-engine.ts
│   │   │   └── weather-adjustment-engine.ts
│   │   ├── formatters/          # Response formatters & synthesis
│   │   ├── multi-agent/         # Multi-agent orchestration
│   │   │   ├── synthesis/       # Response synthesis engine
│   │   │   ├── agent-nodes.ts
│   │   │   ├── execution-planner.ts
│   │   │   └── supervisor-planner.ts
│   │   ├── registry/            # Agent/tool registries
│   │   ├── tools/               # Agent tools
│   │   │   ├── bunker-analyzer.ts
│   │   │   ├── marine-weather.ts
│   │   │   ├── port-finder.ts
│   │   │   ├── price-fetcher.ts
│   │   │   ├── route-calculator.ts
│   │   │   └── weather-timeline.ts
│   │   └── validators/          # Input validation
│   ├── config/                  # YAML configurations
│   │   ├── agents/              # Agent configs
│   │   └── workflows/           # Workflow definitions
│   └── tests/                   # Test suites
├── config/                      # Root-level configurations
│   ├── prompts/                 # LLM prompts
│   ├── insights/                # Insight extraction rules
│   └── response-templates/      # Response template schemas
├── src/                         # Legacy/standalone implementations
└── netlify.toml                 # Netlify deployment config
```

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Anthropic API key
- LangChain/LangSmith API key (optional, for monitoring)

## Installation

1. Clone the repository

2. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```

3. Create environment file:
   ```bash
   cp .env.example .env.local
   ```

4. Add your API keys to `.env.local`:
   ```
   ANTHROPIC_API_KEY=your_api_key_here
   LANGCHAIN_API_KEY=your_langsmith_key_here    # Optional
   LANGCHAIN_TRACING_V2=true                     # Optional
   LANGCHAIN_PROJECT=fuelsense-360               # Optional
   ```

## Development

Run the development server:
```bash
cd frontend
npm run dev
```

The application will be available at `http://localhost:3000`.

### Available Pages

- `/chat-multi-agent` - Main multi-agent chat interface
- `/chat-langgraph` - LangGraph-based chat
- `/analytics` - Performance analytics dashboard
- `/compare` - Implementation comparison view

## Building

Build for production:
```bash
cd frontend
npm run build
```

Start production server:
```bash
npm start
```

## Testing

Run all tests:
```bash
cd frontend
npm run test:all
```

Run specific test suites:
```bash
npm run test:synthesis      # Synthesis engine tests
npm run test:components     # Component tests
npm run test:baseline       # Baseline integration tests
npm run type-check          # TypeScript type checking
```

## Key Features

- **Multi-Agent Architecture**: Specialized agents for route planning, weather analysis, bunker optimization, and compliance
- **Response Synthesis**: Intelligent synthesis of agent outputs into actionable recommendations
- **Query Classification**: Automatic classification of queries (informational, decision-required, validation, comparison)
- **Interactive Map**: Route visualization with port markers and ECA zones
- **Weather Integration**: Real-time weather impact analysis
- **ECA Compliance**: Emission Control Area fuel consumption calculations

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude |
| `LANGCHAIN_API_KEY` | No | LangSmith API key for monitoring |
| `LANGCHAIN_TRACING_V2` | No | Enable LangSmith tracing |
| `LANGCHAIN_PROJECT` | No | LangSmith project name |
| `LLM_MODEL` | No | Model to use (default: claude-haiku-4-5-20251001) |

### YAML Configurations

- `config/response-templates/` - Response template definitions
- `frontend/config/agents/` - Agent configuration files
- `frontend/config/workflows/` - Workflow definitions

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

For deployment checklist, see [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md).

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture documentation.

## License

ISC

