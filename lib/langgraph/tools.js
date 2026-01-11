"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tools = exports.analyzeBunkerTool = exports.fetchPricesTool = exports.findPortsTool = exports.calculateRouteTool = void 0;
// lib/langgraph/tools.ts
const tools_1 = require("@langchain/core/tools");
const route_calculator_1 = require("@/lib/tools/route-calculator");
const port_finder_1 = require("@/lib/tools/port-finder");
const price_fetcher_1 = require("@/lib/tools/price-fetcher");
const bunker_analyzer_1 = require("@/lib/tools/bunker-analyzer");
// Tool 1: Route Calculator
exports.calculateRouteTool = (0, tools_1.tool)(async (input) => {
    console.log("🗺️ LangGraph: Executing calculate_route");
    return await (0, route_calculator_1.executeRouteCalculatorTool)(input);
}, {
    name: "calculate_route",
    description: "Calculate the maritime route between two ports using SeaRoute API. Returns distance in nautical miles, estimated voyage time, and waypoints.",
    schema: route_calculator_1.routeCalculatorInputSchema,
});
// Tool 2: Port Finder
exports.findPortsTool = (0, tools_1.tool)(async (input) => {
    console.log("⚓ LangGraph: Executing find_bunker_ports");
    return await (0, port_finder_1.executePortFinderTool)(input);
}, {
    name: "find_bunker_ports",
    description: "Find bunker ports along a maritime route within a specified deviation distance. Uses Haversine formula to calculate distances.",
    schema: port_finder_1.portFinderInputSchema,
});
// Tool 3: Price Fetcher
exports.fetchPricesTool = (0, tools_1.tool)(async (input) => {
    console.log("💰 LangGraph: Executing get_fuel_prices");
    return await (0, price_fetcher_1.executePriceFetcherTool)(input);
}, {
    name: "get_fuel_prices",
    description: "Fetch current fuel prices for specified ports. Returns prices for VLSFO, LSGO, and MGO with freshness indicators.",
    schema: price_fetcher_1.priceFetcherInputSchema,
});
// Tool 4: Bunker Analyzer
exports.analyzeBunkerTool = (0, tools_1.tool)(async (input) => {
    console.log("📊 LangGraph: Executing analyze_bunker_options");
    return await (0, bunker_analyzer_1.executeBunkerAnalyzerTool)(input);
}, {
    name: "analyze_bunker_options",
    description: "Analyze and rank bunker port options based on total cost (fuel cost + deviation cost). Returns ranked recommendations with cost breakdown.",
    schema: bunker_analyzer_1.bunkerAnalyzerInputSchema,
});
// Export all tools as array
exports.tools = [
    exports.calculateRouteTool,
    exports.findPortsTool,
    exports.fetchPricesTool,
    exports.analyzeBunkerTool,
];
//# sourceMappingURL=tools.js.map