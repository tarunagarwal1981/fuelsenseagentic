export interface PerformanceMetrics {
    startTime: number;
    endTime?: number;
    duration?: number;
    toolCalls: number;
    llmCalls: number;
    tokensUsed?: number;
    version: "manual" | "langgraph";
}
export declare class PerformanceMonitor {
    private metrics;
    constructor(version: "manual" | "langgraph");
    recordToolCall(): void;
    recordLLMCall(): void;
    finish(): PerformanceMetrics;
    getMetrics(): PerformanceMetrics;
}
export declare function logPerformance(metrics: PerformanceMetrics): void;
//# sourceMappingURL=performance.d.ts.map