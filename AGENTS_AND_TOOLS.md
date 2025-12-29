# Agents and Tools Inventory

This document provides a comprehensive list of all agents and tools in the FuelSense system.

## Agents

### Multi-Agent System (LangGraph)
Located in: `frontend/lib/multi-agent/`

The multi-agent system uses a supervisor pattern to orchestrate specialized agents:

1. **Supervisor Agent** (`supervisorAgentNode`)
   - Routes requests to appropriate specialized agents
   - Coordinates workflow between agents
   - Makes routing decisions based on user queries

2. **Route Agent** (`routeAgentNode`)
   - Calculates maritime routes between ports
   - Generates vessel timeline along routes
   - Tools: `calculate_route`, `calculate_weather_timeline`

3. **Weather Agent** (`weatherAgentNode`)
   - Analyzes weather impact on voyages
   - Fetches marine weather forecasts
   - Calculates weather-adjusted fuel consumption
   - Checks port weather conditions
   - Tools: `fetch_marine_weather`, `calculate_weather_consumption`, `check_bunker_port_weather`

4. **Bunker Agent** (`bunkerAgentNode`)
   - Finds bunker ports along routes
   - Fetches fuel prices
   - Analyzes and ranks bunker options
   - Tools: `find_bunker_ports`, `get_fuel_prices`, `analyze_bunker_options`

5. **Finalize Node** (`finalizeNode`)
   - Synthesizes final recommendations
   - Combines results from all agents
   - Generates comprehensive response

### Standalone Agents
Located in: `src/agents/`

1. **Bunker Agent** (`bunker-agent.ts`)
   - Function: `runBunkerAgent()`
   - Purpose: Multi-tool agent for bunker optimization
   - Capabilities:
     - Calculate maritime routes
     - Find bunker ports along routes
     - Provide optimization recommendations
     - Visualize routes and ports on maps

2. **Complete Bunker Agent** (`complete-bunker-agent.ts`)
   - Function: `runCompleteBunkerAgent()`
   - Purpose: Comprehensive agent that orchestrates all bunker optimization tools
   - Capabilities:
     - Route calculation
     - Port finding
     - Price fetching
     - Cost-benefit analysis
   - Automatically chains tools together

3. **Route Agent** (`route-agent.ts`)
   - Function: `runRouteAgent()`
   - Purpose: AI agent for maritime route questions
   - Capabilities:
     - Answer questions about maritime routes
     - Execute route calculator tool
     - Generate map visualizations

4. **Demo Agent** (`demo.ts`)
   - Purpose: Demonstration/testing agent

---

## Tools

### Tool Implementations
Located in: `frontend/lib/tools/` and `lib/tools/`

These are the actual tool execution functions:

1. **Route Calculator** (`route-calculator.ts`)
   - Function: `executeRouteCalculatorTool()`
   - Purpose: Calculate optimal maritime route between two ports
   - Input: `origin_port_code`, `destination_port_code`, `vessel_speed_knots`
   - Output: Distance, estimated hours, waypoints, route type

2. **Weather Timeline** (`weather-timeline.ts`)
   - Function: `executeWeatherTimelineTool()`
   - Purpose: Calculate vessel position at regular intervals along a route
   - Input: `waypoints`, `vessel_speed_knots`, `departure_datetime`, `sampling_interval_hours`
   - Output: Array of positions with coordinates, datetime, distance

3. **Marine Weather** (`marine-weather.ts`)
   - Function: `executeMarineWeatherTool()`
   - Purpose: Fetch marine weather forecast for vessel positions
   - Input: Array of positions with coordinates and datetime
   - Output: Weather forecasts (wave height, wind speed, wind direction, sea state)

4. **Weather Consumption** (`weather-consumption.ts`)
   - Function: `executeWeatherConsumptionTool()`
   - Purpose: Calculate fuel consumption adjusted for weather conditions
   - Input: `weather_data`, `base_consumption_mt`, `vessel_heading_deg`, `fuel_type_breakdown`
   - Output: Weather-adjusted consumption, additional fuel needed, weather alerts

5. **Port Weather** (`port-weather.ts`)
   - Function: `executePortWeatherTool()`
   - Purpose: Check if bunker ports have safe weather conditions for bunkering
   - Input: Array of bunker ports with arrival times
   - Output: Weather risk assessment, bunkering feasibility, recommendations

6. **Port Finder** (`port-finder.ts`)
   - Function: `executePortFinderTool()`
   - Purpose: Find bunker ports along a maritime route within deviation distance
   - Input: `route_waypoints`, `max_deviation_nm`
   - Output: Array of ports with distances from route

7. **Price Fetcher** (`price-fetcher.ts`)
   - Function: `executePriceFetcherTool()`
   - Purpose: Fetch current fuel prices for specified ports
   - Input: `port_codes`, `fuel_types` (optional)
   - Output: Prices by port for VLSFO, LSGO, MGO

8. **Bunker Analyzer** (`bunker-analyzer.ts`)
   - Function: `executeBunkerAnalyzerTool()`
   - Purpose: Analyze and rank bunker port options based on total cost
   - Input: `bunker_ports`, `port_prices`, `fuel_quantity_mt`, `fuel_type`, `vessel_speed_knots`, `vessel_consumption_mt_per_day`
   - Output: Ranked recommendations with cost breakdown

### Tool Wrappers

#### Multi-Agent System Tools
Located in: `frontend/lib/multi-agent/tools.ts`

**Route Agent Tools:**
- `calculateRouteTool` (wraps `executeRouteCalculatorTool`)
- `calculateWeatherTimelineTool` (wraps `executeWeatherTimelineTool`)

**Weather Agent Tools:**
- `fetchMarineWeatherTool` (wraps `executeMarineWeatherTool`)
- `calculateWeatherConsumptionTool` (wraps `executeWeatherConsumptionTool`)
- `checkPortWeatherTool` (wraps `executePortWeatherTool`)

**Bunker Agent Tools:**
- `findBunkerPortsTool` (wraps `executePortFinderTool`)
- `getFuelPricesTool` (wraps `executePriceFetcherTool`)
- `analyzeBunkerOptionsTool` (wraps `executeBunkerAnalyzerTool`)

**Exports:**
- `routeAgentTools` - Array of route agent tools
- `weatherAgentTools` - Array of weather agent tools
- `bunkerAgentTools` - Array of bunker agent tools
- `allTools` - Combined array of all tools

#### LangGraph Tools
Located in: `lib/langgraph/tools.ts` and `frontend/lib/langgraph/tools.ts`

These are simpler tool wrappers for the basic LangGraph implementation:

- `calculateRouteTool` (wraps `executeRouteCalculatorTool`)
- `findPortsTool` (wraps `executePortFinderTool`)
- `fetchPricesTool` (wraps `executePriceFetcherTool`)
- `analyzeBunkerTool` (wraps `executeBunkerAnalyzerTool`)

**Export:**
- `tools` - Array of all LangGraph tools

---

## Summary

### Total Agents: 9
- **Multi-Agent System:** 5 agents (Supervisor, Route, Weather, Bunker, Finalize)
- **Standalone Agents:** 4 agents (Bunker, Complete Bunker, Route, Demo)

### Total Tools: 8 unique tool implementations
1. Route Calculator
2. Weather Timeline
3. Marine Weather
4. Weather Consumption
5. Port Weather
6. Port Finder
7. Price Fetcher
8. Bunker Analyzer

### Tool Distribution by Agent Type

**Route Agent Tools (2):**
- calculate_route
- calculate_weather_timeline

**Weather Agent Tools (3):**
- fetch_marine_weather
- calculate_weather_consumption
- check_bunker_port_weather

**Bunker Agent Tools (3):**
- find_bunker_ports
- get_fuel_prices
- analyze_bunker_options

---

## Notes

- The multi-agent system is the primary production system located in `frontend/lib/multi-agent/`
- Standalone agents in `src/agents/` appear to be older implementations or for specific use cases
- Tool implementations are duplicated in both `lib/tools/` and `frontend/lib/tools/` - the frontend versions are the active ones
- The LangGraph tools are simpler wrappers used in the basic LangGraph implementation
- The multi-agent system tools include more sophisticated error handling and logging


