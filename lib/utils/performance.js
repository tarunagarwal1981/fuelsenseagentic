"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceMonitor = void 0;
exports.logPerformance = logPerformance;
class PerformanceMonitor {
    metrics;
    constructor(version) {
        this.metrics = {
            startTime: Date.now(),
            toolCalls: 0,
            llmCalls: 0,
            version,
        };
    }
    recordToolCall() {
        this.metrics.toolCalls++;
    }
    recordLLMCall() {
        this.metrics.llmCalls++;
    }
    finish() {
        this.metrics.endTime = Date.now();
        this.metrics.duration = this.metrics.endTime - this.metrics.startTime;
        return this.metrics;
    }
    getMetrics() {
        return this.metrics;
    }
}
exports.PerformanceMonitor = PerformanceMonitor;
// Log to console or send to analytics
function logPerformance(metrics) {
    console.log(`
╔════════════════════════════════════════╗
║     PERFORMANCE METRICS                ║
╠════════════════════════════════════════╣
║ Version:    ${metrics.version.padEnd(20)} ║
║ Duration:   ${(metrics.duration || 0).toString().padEnd(20)}ms ║
║ Tool Calls: ${metrics.toolCalls.toString().padEnd(20)} ║
║ LLM Calls:  ${metrics.llmCalls.toString().padEnd(20)} ║
╚════════════════════════════════════════╝
  `);
}
//# sourceMappingURL=performance.js.map