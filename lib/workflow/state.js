"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateAnnotation = void 0;
// lib/workflow/state.ts
const langgraph_1 = require("@langchain/langgraph");
// LangGraph State Definition - UPDATED to use BaseMessage
exports.StateAnnotation = langgraph_1.Annotation.Root({
    messages: (0, langgraph_1.Annotation)({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    route: (0, langgraph_1.Annotation)({
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
    ports: (0, langgraph_1.Annotation)({
        reducer: (x, y) => {
            const result = y !== null && y !== undefined ? y : x;
            if (result) {
                console.log("🔄 Ports reducer: updating ports", result.length, "ports");
            }
            return result;
        },
        default: () => null,
    }),
    prices: (0, langgraph_1.Annotation)({
        reducer: (x, y) => {
            const result = y !== null && y !== undefined ? y : x;
            if (result) {
                console.log("🔄 Prices reducer: updating prices", result.length, "ports");
            }
            return result;
        },
        default: () => null,
    }),
    analysis: (0, langgraph_1.Annotation)({
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
//# sourceMappingURL=state.js.map