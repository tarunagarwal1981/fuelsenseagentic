/**
 * Multi-Agent System Monitoring
 * 
 * Provides monitoring and analytics for the multi-agent system including:
 * - Agent execution times
 * - Success/failure rates
 * - API cost tracking
 * - Performance metrics
 */

// ============================================================================
// Monitoring Data Structures
// ============================================================================

interface AgentExecutionMetrics {
  agent: string;
  executionCount: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  successCount: number;
  failureCount: number;
  successRate: number;
}

interface ToolCallMetrics {
  tool: string;
  callCount: number;
  totalTime: number;
  averageTime: number;
  successCount: number;
  failureCount: number;
}

interface APICostMetrics {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number; // USD
}

interface SystemMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageExecutionTime: number;
  agentMetrics: AgentExecutionMetrics[];
  toolMetrics: ToolCallMetrics[];
  costMetrics: APICostMetrics;
  timestamp: string;
}

// ============================================================================
// In-Memory Metrics Storage (Production: Use database or external service)
// ============================================================================

const metricsStore: {
  agentExecutions: Map<string, number[]>; // agent -> [execution times]
  agentSuccesses: Map<string, number>; // agent -> success count
  agentFailures: Map<string, number>; // agent -> failure count
  toolCalls: Map<string, number[]>; // tool -> [execution times]
  toolSuccesses: Map<string, number>; // tool -> success count
  toolFailures: Map<string, number>; // tool -> failure count
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
  };
} = {
  agentExecutions: new Map(),
  agentSuccesses: new Map(),
  agentFailures: new Map(),
  toolCalls: new Map(),
  toolSuccesses: new Map(),
  toolFailures: new Map(),
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  tokenUsage: {
    inputTokens: 0,
    outputTokens: 0,
  },
};

// ============================================================================
// Monitoring Functions
// ============================================================================

/**
 * Record agent execution
 */
export function recordAgentExecution(
  agent: string,
  duration: number,
  success: boolean = true
): void {
  if (!metricsStore.agentExecutions.has(agent)) {
    metricsStore.agentExecutions.set(agent, []);
    metricsStore.agentSuccesses.set(agent, 0);
    metricsStore.agentFailures.set(agent, 0);
  }

  const executions = metricsStore.agentExecutions.get(agent)!;
  executions.push(duration);

  // Keep only last 1000 executions per agent to prevent memory bloat
  if (executions.length > 1000) {
    executions.shift();
  }

  if (success) {
    const current = metricsStore.agentSuccesses.get(agent) || 0;
    metricsStore.agentSuccesses.set(agent, current + 1);
  } else {
    const current = metricsStore.agentFailures.get(agent) || 0;
    metricsStore.agentFailures.set(agent, current + 1);
  }

  console.log(
    `📊 [MONITORING] Agent ${agent}: ${duration}ms, ${success ? '✅' : '❌'}`
  );
}

/**
 * Record tool call execution
 */
export function recordToolCall(
  tool: string,
  duration: number,
  success: boolean = true
): void {
  if (!metricsStore.toolCalls.has(tool)) {
    metricsStore.toolCalls.set(tool, []);
    metricsStore.toolSuccesses.set(tool, 0);
    metricsStore.toolFailures.set(tool, 0);
  }

  const calls = metricsStore.toolCalls.get(tool)!;
  calls.push(duration);

  // Keep only last 1000 calls per tool
  if (calls.length > 1000) {
    calls.shift();
  }

  if (success) {
    const current = metricsStore.toolSuccesses.get(tool) || 0;
    metricsStore.toolSuccesses.set(tool, current + 1);
  } else {
    const current = metricsStore.toolFailures.get(tool) || 0;
    metricsStore.toolFailures.set(tool, current + 1);
  }
}

/**
 * Record request completion
 */
export function recordRequest(success: boolean, executionTime: number): void {
  metricsStore.totalRequests++;
  if (success) {
    metricsStore.successfulRequests++;
  } else {
    metricsStore.failedRequests++;
  }

  console.log(
    `📊 [MONITORING] Request: ${success ? '✅' : '❌'}, ${executionTime}ms`
  );
}

/**
 * Record token usage (for cost tracking)
 */
export function recordTokenUsage(
  inputTokens: number,
  outputTokens: number
): void {
  metricsStore.tokenUsage.inputTokens += inputTokens;
  metricsStore.tokenUsage.outputTokens += outputTokens;
}

/**
 * Get agent execution metrics
 */
export function getAgentMetrics(): AgentExecutionMetrics[] {
  const metrics: AgentExecutionMetrics[] = [];

  for (const [agent, executions] of metricsStore.agentExecutions.entries()) {
    if (executions.length === 0) continue;

    const totalTime = executions.reduce((sum, time) => sum + time, 0);
    const averageTime = totalTime / executions.length;
    const minTime = Math.min(...executions);
    const maxTime = Math.max(...executions);
    const successCount = metricsStore.agentSuccesses.get(agent) || 0;
    const failureCount = metricsStore.agentFailures.get(agent) || 0;
    const totalCount = successCount + failureCount;
    const successRate = totalCount > 0 ? (successCount / totalCount) * 100 : 0;

    metrics.push({
      agent,
      executionCount: executions.length,
      totalTime,
      averageTime,
      minTime,
      maxTime,
      successCount,
      failureCount,
      successRate,
    });
  }

  return metrics;
}

/**
 * Get tool call metrics
 */
export function getToolMetrics(): ToolCallMetrics[] {
  const metrics: ToolCallMetrics[] = [];

  for (const [tool, calls] of metricsStore.toolCalls.entries()) {
    if (calls.length === 0) continue;

    const totalTime = calls.reduce((sum, time) => sum + time, 0);
    const averageTime = totalTime / calls.length;
    const successCount = metricsStore.toolSuccesses.get(tool) || 0;
    const failureCount = metricsStore.toolFailures.get(tool) || 0;

    metrics.push({
      tool,
      callCount: calls.length,
      totalTime,
      averageTime,
      successCount,
      failureCount,
    });
  }

  return metrics;
}

/**
 * Estimate API costs based on token usage
 * 
 * Pricing (as of 2024, adjust as needed):
 * - Claude Sonnet 4: $3/1M input tokens, $15/1M output tokens
 * - Claude Opus 4: $15/1M input tokens, $75/1M output tokens
 * - Claude Haiku 4: $0.25/1M input tokens, $1.25/1M output tokens
 */
export function estimateAPICost(model: string = 'claude-sonnet-4-20250514'): APICostMetrics {
  const { inputTokens, outputTokens } = metricsStore.tokenUsage;
  const totalTokens = inputTokens + outputTokens;

  // Pricing per million tokens
  const pricing: Record<string, { input: number; output: number }> = {
    'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
    'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
    'claude-haiku-4-5-20251001': { input: 0.25, output: 1.25 },
  };

  const prices = pricing[model] || pricing['claude-sonnet-4-20250514'];
  const inputCost = (inputTokens / 1_000_000) * prices.input;
  const outputCost = (outputTokens / 1_000_000) * prices.output;
  const estimatedCost = inputCost + outputCost;

  return {
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCost,
  };
}

/**
 * Get comprehensive system metrics
 */
export function getSystemMetrics(): SystemMetrics {
  const agentMetrics = getAgentMetrics();
  const toolMetrics = getToolMetrics();
  const costMetrics = estimateAPICost();

  // Calculate average execution time from all agent executions
  let totalExecutionTime = 0;
  let totalExecutions = 0;
  for (const executions of metricsStore.agentExecutions.values()) {
    totalExecutionTime += executions.reduce((sum, time) => sum + time, 0);
    totalExecutions += executions.length;
  }
  const averageExecutionTime =
    totalExecutions > 0 ? totalExecutionTime / totalExecutions : 0;

  return {
    totalRequests: metricsStore.totalRequests,
    successfulRequests: metricsStore.successfulRequests,
    failedRequests: metricsStore.failedRequests,
    averageExecutionTime,
    agentMetrics,
    toolMetrics,
    costMetrics,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Reset all metrics (useful for testing or periodic resets)
 */
export function resetMetrics(): void {
  metricsStore.agentExecutions.clear();
  metricsStore.agentSuccesses.clear();
  metricsStore.agentFailures.clear();
  metricsStore.toolCalls.clear();
  metricsStore.toolSuccesses.clear();
  metricsStore.toolFailures.clear();
  metricsStore.totalRequests = 0;
  metricsStore.successfulRequests = 0;
  metricsStore.failedRequests = 0;
  metricsStore.tokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
  };
  console.log('🔄 [MONITORING] Metrics reset');
}

/**
 * Log system metrics summary
 */
export function logMetricsSummary(): void {
  const metrics = getSystemMetrics();

  console.log('\n📊 ========== MONITORING SUMMARY ==========');
  console.log(`Total Requests: ${metrics.totalRequests}`);
  console.log(
    `Success Rate: ${((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(2)}%`
  );
  console.log(`Average Execution Time: ${metrics.averageExecutionTime.toFixed(0)}ms`);
  console.log('\nAgent Metrics:');
  metrics.agentMetrics.forEach((m) => {
    console.log(
      `  ${m.agent}: ${m.executionCount} executions, avg ${m.averageTime.toFixed(0)}ms, ${m.successRate.toFixed(1)}% success`
    );
  });
  console.log('\nTool Metrics:');
  metrics.toolMetrics.forEach((m) => {
    console.log(
      `  ${m.tool}: ${m.callCount} calls, avg ${m.averageTime.toFixed(0)}ms`
    );
  });
  console.log('\nCost Metrics:');
  console.log(
    `  Model: ${metrics.costMetrics.model}`
  );
  console.log(
    `  Tokens: ${metrics.costMetrics.totalTokens.toLocaleString()} (${metrics.costMetrics.inputTokens.toLocaleString()} in, ${metrics.costMetrics.outputTokens.toLocaleString()} out)`
  );
  console.log(
    `  Estimated Cost: $${metrics.costMetrics.estimatedCost.toFixed(4)}`
  );
  console.log('===========================================\n');
}

// Export types for use in other modules
export type {
  AgentExecutionMetrics,
  ToolCallMetrics,
  APICostMetrics,
  SystemMetrics,
};

