// lib/utils/performance.ts
export interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  toolCalls: number;
  llmCalls: number;
  tokensUsed?: number;
  version: "manual" | "langgraph";
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics;

  constructor(version: "manual" | "langgraph") {
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

// Log to console or send to analytics
export function logPerformance(metrics: PerformanceMetrics) {
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

