import type { BunkerState } from "./state";
export declare function agentNode(state: BunkerState): Promise<{
    messages: import("@langchain/core/messages").AIMessageChunk<import("@langchain/core/messages").MessageStructure>[];
}>;
export declare function reducerNode(state: BunkerState): Promise<Partial<import("@langchain/langgraph").StateType<{
    messages: import("@langchain/langgraph").BinaryOperatorAggregate<import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure, import("@langchain/core/messages").MessageType>[], import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure, import("@langchain/core/messages").MessageType>[]>;
    route: import("@langchain/langgraph").BinaryOperatorAggregate<import("./state").Route | null, import("./state").Route | null>;
    ports: import("@langchain/langgraph").BinaryOperatorAggregate<import("./state").Port[] | null, import("./state").Port[] | null>;
    prices: import("@langchain/langgraph").BinaryOperatorAggregate<import("./state").PortFuelPrices[] | null, import("./state").PortFuelPrices[] | null>;
    analysis: import("@langchain/langgraph").BinaryOperatorAggregate<import("./state").BunkerAnalysis | null, import("./state").BunkerAnalysis | null>;
}>>>;
//# sourceMappingURL=nodes.d.ts.map