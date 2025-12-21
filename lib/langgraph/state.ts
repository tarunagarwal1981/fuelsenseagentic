// lib/langgraph/state.ts
import { Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";

// Type definitions (keep these the same)
export interface Route {
  distance_nm: number;
  waypoints: Array<{ lat: number; lon: number }>;
  estimated_hours: number;
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
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  ports: Annotation<Port[] | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  prices: Annotation<PortFuelPrices[] | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  analysis: Annotation<BunkerAnalysis | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
});

export type BunkerState = typeof StateAnnotation.State;
