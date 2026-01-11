export declare const app: import("@langchain/langgraph").CompiledStateGraph<{
    messages: import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure, import("@langchain/core/messages").MessageType>[];
    route: import("./state").Route | null;
    ports: import("./state").Port[] | null;
    prices: import("./state").PortFuelPrices[] | null;
    analysis: import("./state").BunkerAnalysis | null;
}, {
    messages?: import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure, import("@langchain/core/messages").MessageType>[] | undefined;
    route?: import("./state").Route | null | undefined;
    ports?: import("./state").Port[] | null | undefined;
    prices?: import("./state").PortFuelPrices[] | null | undefined;
    analysis?: import("./state").BunkerAnalysis | null | undefined;
}, "tools" | "reducer" | "__start__" | "agent", {
    messages: import("@langchain/langgraph").BinaryOperatorAggregate<import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure, import("@langchain/core/messages").MessageType>[], import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure, import("@langchain/core/messages").MessageType>[]>;
    route: import("@langchain/langgraph").BinaryOperatorAggregate<import("./state").Route | null, import("./state").Route | null>;
    ports: import("@langchain/langgraph").BinaryOperatorAggregate<import("./state").Port[] | null, import("./state").Port[] | null>;
    prices: import("@langchain/langgraph").BinaryOperatorAggregate<import("./state").PortFuelPrices[] | null, import("./state").PortFuelPrices[] | null>;
    analysis: import("@langchain/langgraph").BinaryOperatorAggregate<import("./state").BunkerAnalysis | null, import("./state").BunkerAnalysis | null>;
}, {
    messages: import("@langchain/langgraph").BinaryOperatorAggregate<import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure, import("@langchain/core/messages").MessageType>[], import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure, import("@langchain/core/messages").MessageType>[]>;
    route: import("@langchain/langgraph").BinaryOperatorAggregate<import("./state").Route | null, import("./state").Route | null>;
    ports: import("@langchain/langgraph").BinaryOperatorAggregate<import("./state").Port[] | null, import("./state").Port[] | null>;
    prices: import("@langchain/langgraph").BinaryOperatorAggregate<import("./state").PortFuelPrices[] | null, import("./state").PortFuelPrices[] | null>;
    analysis: import("@langchain/langgraph").BinaryOperatorAggregate<import("./state").BunkerAnalysis | null, import("./state").BunkerAnalysis | null>;
}, import("@langchain/langgraph").StateDefinition, {
    agent: {
        messages: import("@langchain/core/messages").AIMessageChunk<import("@langchain/core/messages").MessageStructure>[];
    };
    tools: import("@langchain/langgraph").UpdateType<{
        messages: import("@langchain/langgraph").BinaryOperatorAggregate<import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure, import("@langchain/core/messages").MessageType>[], import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure, import("@langchain/core/messages").MessageType>[]>;
        route: import("@langchain/langgraph").BinaryOperatorAggregate<import("./state").Route | null, import("./state").Route | null>;
        ports: import("@langchain/langgraph").BinaryOperatorAggregate<import("./state").Port[] | null, import("./state").Port[] | null>;
        prices: import("@langchain/langgraph").BinaryOperatorAggregate<import("./state").PortFuelPrices[] | null, import("./state").PortFuelPrices[] | null>;
        analysis: import("@langchain/langgraph").BinaryOperatorAggregate<import("./state").BunkerAnalysis | null, import("./state").BunkerAnalysis | null>;
    }>;
    reducer: Partial<import("@langchain/langgraph").StateType<{
        messages: import("@langchain/langgraph").BinaryOperatorAggregate<import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure, import("@langchain/core/messages").MessageType>[], import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure, import("@langchain/core/messages").MessageType>[]>;
        route: import("@langchain/langgraph").BinaryOperatorAggregate<import("./state").Route | null, import("./state").Route | null>;
        ports: import("@langchain/langgraph").BinaryOperatorAggregate<import("./state").Port[] | null, import("./state").Port[] | null>;
        prices: import("@langchain/langgraph").BinaryOperatorAggregate<import("./state").PortFuelPrices[] | null, import("./state").PortFuelPrices[] | null>;
        analysis: import("@langchain/langgraph").BinaryOperatorAggregate<import("./state").BunkerAnalysis | null, import("./state").BunkerAnalysis | null>;
    }>>;
}, unknown, unknown>;
//# sourceMappingURL=graph.d.ts.map