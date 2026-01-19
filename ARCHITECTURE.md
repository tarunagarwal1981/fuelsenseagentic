# FuelSense Architecture

## Layered Architecture Block Diagram

```mermaid
block-beta
    columns 1
    
    block:frontend["FRONTEND"]
        columns 3
        NextJS["Next.js App"]
        ChatUI["Chat Interface"]
        MapViewer["Map Viewer"]
    end
    
    block:api["API LAYER"]
        columns 2
        ChatRoute["chat/route.ts"]
        LangGraphRoute["chat-langgraph/route.ts"]
    end
    
    block:orchestrator["SUPERVISOR / ORCHESTRATOR"]
        columns 2
        SupervisorAgent["Supervisor Agent"]
        ExecutionPlanner["Execution Planner"]
    end
    
    block:agents["AGENTS"]
        columns 4
        RouteAgent["Route Agent"]
        WeatherAgent["Weather Agent"]
        BunkerAgent["Bunker Agent"]
        FinalizeAgent["Finalize Agent"]
    end
    
    block:tools["TOOLS"]
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
    
    block:engines["ENGINES"]
        columns 5
        CapacityEngine["Capacity Validation"]
        ECAEngine["ECA Consumption"]
        ROBEngine["ROB Tracking"]
        SafetyEngine["Safety Margin"]
        WeatherEngine["Weather Adjustment"]
    end
    
    block:formatters["FORMATTERS / SYNTHESIS"]
        columns 3
        ResponseFormatter["Response Formatter"]
        InsightExtractor["Insight Extractor"]
        SynthesisEngine["Synthesis Engine"]
    end
    
    block:config["YAML CONFIGURATION"]
        columns 4
        SynthesisConfig["synthesis-config.yaml"]
        ExtractionRules["extraction-rules.yaml"]
        ResponseTemplates["Response Templates"]
        SchemaConfig["_SCHEMA.yaml"]
    end
    
    block:resources["DATA RESOURCES"]
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

| Layer | Components |
|-------|------------|
| Frontend | Next.js App, Chat Interface, Map Viewer |
| API Layer | chat/route.ts, chat-langgraph/route.ts |
| Supervisor/Orchestrator | Supervisor Agent, Execution Planner |
| Agents | Route, Weather, Bunker, Finalize Agents |
| Tools | 8 tools (Route Calculator, Port Finder, Price Fetcher, etc.) |
| Engines | 5 engines (Capacity, ECA, ROB, Safety, Weather) |
| Formatters/Synthesis | Response Formatter, Insight Extractor, Synthesis Engine |
| YAML Configuration | synthesis-config.yaml, extraction-rules.yaml, templates |
| Data Resources | ports.json, prices.json, vessels.json, cached-routes.json |
| Memory (Future) | Conversation Memory, Voyage History, User Preferences |
