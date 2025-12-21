// lib/langgraph/state.ts
import { Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";

// Type definitions (keep these the same)
export interface Route {
  distance_nm: number;
  waypoints: Array<{ lat: number; lon: number }>;
  estimated_hours: number;
  origin_port_code?: string;
  destination_port_code?: string;
  route_type?: string;
}

export interface Port {
  code: string;
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  distance_from_route_nm?: number;
  nearest_waypoint_index?: number;
}

export interface PortFuelPrices {
  port_code: string;
  port_name: string;
  prices: {
    VLSFO?: number;
    LSGO?: number;
    MGO?: number;
  };
  last_updated: string;
  is_stale?: boolean;
}

export interface BunkerRecommendation {
  port_code: string;
  port_name: string;
  distance_from_route_nm: number;
  fuel_cost_usd: number;
  deviation_cost_usd: number;
  total_cost_usd: number;
  rank: number;
  savings_vs_worst_usd?: number;
}

export interface BunkerAnalysis {
  recommendations: BunkerRecommendation[];
  best_option: BunkerRecommendation;
  worst_option: BunkerRecommendation;
  max_savings_usd: number;
}

// LangGraph State Definition - UPDATED to use BaseMessage
export const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  route: Annotation<Route | null>({
    reducer: (x, y) => {
      // If y is provided and not null, use it; otherwise keep x
      const result = y !== null && y !== undefined ? y : x;
      if (result) {
        console.log("🔄 Route reducer: updating route", result.origin_port_code, "->", result.destination_port_code);
      }
      return result;
    },
    default: () => null,
  }),
  ports: Annotation<Port[] | null>({
    reducer: (x, y) => {
      const result = y !== null && y !== undefined ? y : x;
      if (result) {
        console.log("🔄 Ports reducer: updating ports", result.length, "ports");
      }
      return result;
    },
    default: () => null,
  }),
  prices: Annotation<PortFuelPrices[] | null>({
    reducer: (x, y) => {
      const result = y !== null && y !== undefined ? y : x;
      if (result) {
        console.log("🔄 Prices reducer: updating prices", result.length, "ports");
      }
      return result;
    },
    default: () => null,
  }),
  analysis: Annotation<BunkerAnalysis | null>({
    reducer: (x, y) => {
      const result = y !== null && y !== undefined ? y : x;
      if (result) {
        console.log("🔄 Analysis reducer: updating analysis", result.recommendations?.length || 0, "recommendations");
      }
      return result;
    },
    default: () => null,
  }),
});

export type BunkerState = typeof StateAnnotation.State;
