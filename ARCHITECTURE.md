# FuelSense Architecture

## Project Structure

```
FuelSense/
├── frontend/                    # Main Next.js application
│   ├── app/                     # Next.js App Router
│   │   ├── api/                 # API routes
│   │   │   ├── chat/            # Basic chat endpoint
│   │   │   ├── chat-langgraph/  # LangGraph-based chat
│   │   │   ├── chat-multi-agent/# Multi-agent orchestration
│   │   │   ├── monitoring/      # Performance monitoring
│   │   │   └── test-*/          # Test endpoints (weather, etc.)
│   │   ├── chat/                # Chat page
│   │   ├── chat-langgraph/      # LangGraph chat page
│   │   ├── chat-multi-agent/    # Multi-agent chat page
│   │   ├── analytics/           # Analytics dashboard
│   │   └── compare/             # Implementation comparison
│   ├── components/              # React components
│   │   ├── cards/               # Response card components
│   │   │   ├── comparison-result-card.tsx
│   │   │   ├── executive-decision-card.tsx
│   │   │   ├── informational-response-card.tsx
│   │   │   ├── priority-card.tsx
│   │   │   ├── risk-alert-card.tsx
│   │   │   └── validation-result-card.tsx
│   │   ├── template-response/   # Template-based response rendering
│   │   ├── ui/                  # Shadcn UI components
│   │   ├── bunker-response-viewer.tsx
│   │   ├── chat-interface-multi-agent.tsx
│   │   ├── map-viewer.tsx
│   │   ├── weather-card.tsx
│   │   └── voyage-timeline.tsx
│   ├── lib/                     # Core libraries
│   │   ├── config/              # Configuration loaders
│   │   ├── data/                # Static data (ports, prices, vessels)
│   │   ├── engines/             # Business logic engines
│   │   ├── formatters/          # Response formatters & synthesis
│   │   ├── langgraph/           # LangGraph implementation
│   │   ├── monitoring/          # Synthesis metrics
│   │   ├── multi-agent/         # Multi-agent orchestration
│   │   │   ├── synthesis/       # Response synthesis engine
│   │   │   └── helpers/         # Agent helpers
│   │   ├── registry/            # Agent/tool/workflow registries
│   │   ├── services/            # Business services
│   │   ├── tools/               # Agent tools
│   │   ├── types/               # TypeScript types
│   │   ├── utils/               # Utility functions
│   │   └── validators/          # Input validation
│   ├── config/                  # YAML configurations
│   │   ├── agents/              # Agent configurations
│   │   ├── validation-rules/    # Validation rules
│   │   └── workflows/           # Workflow definitions
│   └── tests/                   # Test suites
├── config/                      # Root-level configurations
│   ├── prompts/                 # LLM prompts
│   ├── insights/                # Insight extraction rules
│   └── response-templates/      # Response template schemas
└── src/                         # Legacy/standalone implementations
```

## Layered Architecture Block Diagram

```mermaid
block-beta
    columns 1
    
    block:frontend["FRONTEND (frontend/)"]
        columns 4
        NextJS["Next.js App"]
        ChatUI["Chat Interface"]
        MapViewer["Map Viewer"]
        ResponseCards["Response Cards"]
    end
    
    block:api["API LAYER (frontend/app/api/)"]
        columns 3
        ChatRoute["chat/route.ts"]
        LangGraphRoute["chat-langgraph/route.ts"]
        MultiAgentRoute["chat-multi-agent/route.ts"]
    end
    
    block:orchestrator["SUPERVISOR / ORCHESTRATOR (frontend/lib/multi-agent/)"]
        columns 3
        SupervisorAgent["Supervisor Agent"]
        ExecutionPlanner["Execution Planner"]
        IntentAnalyzer["Intent Analyzer"]
    end
    
    block:agents["AGENTS (frontend/lib/multi-agent/)"]
        columns 4
        RouteAgent["Route Agent"]
        WeatherAgent["Weather Agent"]
        BunkerAgent["Bunker Agent"]
        ComplianceAgent["Compliance Agent"]
    end
    
    block:tools["TOOLS (frontend/lib/tools/)"]
        columns 4
        RouteCalc["Route Calculator"]
        PortFinder["Port Finder"]
        PriceFetcher["Price Fetcher"]
        BunkerAnalyzer["Bunker Analyzer"]
        WeatherTimeline["Weather Timeline"]
        MarineWeather["Marine Weather"]
        WeatherConsumption["Weather Consumption"]
        PortWeather["Port Weather"]
    end
    
    block:engines["ENGINES (frontend/lib/engines/)"]
        columns 6
        CapacityEngine["Capacity Validation"]
        ECAEngine["ECA Consumption"]
        ROBEngine["ROB Tracking"]
        SafetyEngine["Safety Margin"]
        WeatherEngine["Weather Adjustment"]
        MultiPortEngine["Multi-Port Planner"]
    end
    
    block:formatters["FORMATTERS / SYNTHESIS (frontend/lib/formatters/, frontend/lib/multi-agent/synthesis/)"]
        columns 4
        ResponseFormatter["Response Formatter"]
        InsightExtractor["Insight Extractor"]
        SynthesisEngine["Synthesis Engine"]
        TemplateFormatter["Template Formatter"]
    end
    
    block:config["YAML CONFIGURATION (config/, frontend/config/)"]
        columns 4
        SynthesisConfig["synthesis-config.yaml"]
        ExtractionRules["extraction-rules.yaml"]
        ResponseTemplates["Response Templates"]
        AgentConfigs["Agent Configs"]
    end
    
    block:resources["DATA RESOURCES (frontend/lib/data/)"]
        columns 4
        PortsData["ports.json"]
        PricesData["prices.json"]
        VesselsData["vessels.json"]
        CachedRoutes["cached-routes.json"]
    end
    
    block:memory["MEMORY (Future)"]
        columns 3
        ConversationMemory["Conversation Memory"]
        VoyageHistory["Voyage History"]
        UserPreferences["User Preferences"]
    end
```

## Layer Summary

| Layer | Location | Components |
|-------|----------|------------|
| Frontend | `frontend/app/`, `frontend/components/` | Next.js App, Chat Interface, Map Viewer, Response Cards |
| API Layer | `frontend/app/api/` | chat, chat-langgraph, chat-multi-agent routes |
| Supervisor/Orchestrator | `frontend/lib/multi-agent/` | Supervisor Agent, Execution Planner, Intent Analyzer |
| Agents | `frontend/lib/multi-agent/` | Route, Weather, Bunker, Compliance Agents |
| Tools | `frontend/lib/tools/` | 8 tools (Route Calculator, Port Finder, Weather tools, etc.) |
| Engines | `frontend/lib/engines/` | 6 engines (Capacity, ECA, ROB, Safety, Weather, Multi-Port) |
| Formatters/Synthesis | `frontend/lib/formatters/`, `frontend/lib/multi-agent/synthesis/` | Response Formatter, Insight Extractor, Synthesis Engine |
| Registries | `frontend/lib/registry/` | Agent Registry, Tool Registry, Workflow Registry |
| YAML Configuration | `config/`, `frontend/config/` | synthesis-config.yaml, agent configs, templates |
| Data Resources | `frontend/lib/data/` | ports.json, prices.json, vessels.json, cached-routes.json |
| Memory (Future) | - | Conversation Memory, Voyage History, User Preferences |

## Key Components

### Response Cards (`frontend/components/cards/`)
- **ExecutiveDecisionCard**: For decision-required queries with recommendations
- **InformationalResponseCard**: For general information queries
- **ValidationResultCard**: For validation/verification queries
- **ComparisonResultCard**: For comparison queries
- **PriorityCard**: For displaying prioritized items
- **RiskAlertCard**: For critical risk alerts

### Multi-Agent System (`frontend/lib/multi-agent/`)
- **Supervisor Planner**: Orchestrates agent execution
- **Agent Nodes**: Individual agent implementations
- **Synthesis Engine**: Combines agent outputs into coherent responses
- **Intent Analyzer**: Classifies query types

### Engines (`frontend/lib/engines/`)
- **Capacity Validation**: Validates vessel fuel capacity
- **ECA Consumption**: Calculates ECA zone fuel consumption
- **ROB Tracking**: Tracks Remaining on Board fuel
- **Safety Margin**: Ensures safety buffer calculations
- **Weather Adjustment**: Adjusts for weather conditions
- **Multi-Port Planner**: Plans multi-port bunkering strategies
