import type { BaseMessage } from "@langchain/core/messages";
export interface Route {
    distance_nm: number;
    waypoints: Array<{
        lat: number;
        lon: number;
    }>;
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
export declare const StateAnnotation: import("@langchain/langgraph").AnnotationRoot<{
    messages: import("@langchain/langgraph").BinaryOperatorAggregate<BaseMessage<import("@langchain/core/messages").MessageStructure, import("@langchain/core/messages").MessageType>[], BaseMessage<import("@langchain/core/messages").MessageStructure, import("@langchain/core/messages").MessageType>[]>;
    route: import("@langchain/langgraph").BinaryOperatorAggregate<Route | null, Route | null>;
    ports: import("@langchain/langgraph").BinaryOperatorAggregate<Port[] | null, Port[] | null>;
    prices: import("@langchain/langgraph").BinaryOperatorAggregate<PortFuelPrices[] | null, PortFuelPrices[] | null>;
    analysis: import("@langchain/langgraph").BinaryOperatorAggregate<BunkerAnalysis | null, BunkerAnalysis | null>;
}>;
export type BunkerState = typeof StateAnnotation.State;
//# sourceMappingURL=state.d.ts.map