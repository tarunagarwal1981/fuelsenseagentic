// lib/langgraph/tools.ts
import { tool } from "@langchain/core/tools";
import { executeRouteCalculatorTool, routeCalculatorInputSchema } from "@/lib/tools/route-calculator";
import { executePortFinderTool, portFinderInputSchema } from "@/lib/tools/port-finder";
import { executePriceFetcherTool, priceFetcherInputSchema } from "@/lib/tools/price-fetcher";
import { executeBunkerAnalyzerTool, bunkerAnalyzerInputSchema } from "@/lib/tools/bunker-analyzer";

// Tool 1: Route Calculator
export const calculateRouteTool = tool(
  async (input) => {
    console.log("🗺️ LangGraph: Executing calculate_route");
    return await executeRouteCalculatorTool(input);
  },
  {
    name: "calculate_route",
    description: "Calculate the maritime route between two ports using SeaRoute API. Returns distance in nautical miles, estimated voyage time, and waypoints.",
    schema: routeCalculatorInputSchema,
  }
);

// Tool 2: Port Finder
export const findPortsTool = tool(
  async (input) => {
    console.log("⚓ LangGraph: Executing find_bunker_ports");
    return await executePortFinderTool(input);
  },
  {
    name: "find_bunker_ports",
    description: "Find bunker ports along a maritime route within a specified deviation distance. Uses Haversine formula to calculate distances.",
    schema: portFinderInputSchema,
  }
);

// Tool 3: Price Fetcher
export const fetchPricesTool = tool(
  async (input) => {
    console.log("💰 LangGraph: Executing get_fuel_prices");
    return await executePriceFetcherTool(input);
  },
  {
    name: "get_fuel_prices",
    description: "Fetch current fuel prices for specified ports. Returns prices for VLSFO, LSGO, and MGO with freshness indicators.",
    schema: priceFetcherInputSchema,
  }
);

// Tool 4: Bunker Analyzer
export const analyzeBunkerTool = tool(
  async (input) => {
    console.log("📊 LangGraph: Executing analyze_bunker_options");
    return await executeBunkerAnalyzerTool(input);
  },
  {
    name: "analyze_bunker_options",
    description: "Analyze and rank bunker port options based on total cost (fuel cost + deviation cost). Returns ranked recommendations with cost breakdown.",
    schema: bunkerAnalyzerInputSchema,
  }
);

// Export all tools as array
export const tools = [
  calculateRouteTool,
  findPortsTool,
  fetchPricesTool,
  analyzeBunkerTool,
];

