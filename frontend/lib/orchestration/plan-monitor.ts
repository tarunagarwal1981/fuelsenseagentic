/**
 * Plan Monitor
 *
 * Tracks and reports on plan execution metrics.
 * Provides insights for optimization and debugging.
 */

import type {
  ExecutionPlan,
  PlanExecutionResult,
  StageExecutionResult,
} from '@/lib/types/execution-plan';
import { logAgentExecution } from '@/lib/monitoring/axiom-logger';
import { AgentRegistry } from '@/lib/registry/agent-registry';

// ============================================================================
// Types
// ============================================================================

export interface PlanMetrics {
  planId: string;
  workflowId: string;
  queryType: string;
  success: boolean;
  durationMs: number;
  estimatedDurationMs: number;
  durationAccuracyPercent: number;
  actualCostUSD: number;
  estimatedCostUSD: number;
  costAccuracyPercent: number;
  llmCalls: number;
  apiCalls: number;
  stagesTotal: number;
  stagesCompleted: number;
  stagesFailed: number;
  stagesSkipped: number;
  errorCount: number;
  timestamp: Date;
}

export interface StageMetrics {
  stageId: string;
  agentId: string;
  status: 'success' | 'failed' | 'skipped' | 'timeout';
  durationMs: number;
  estimatedDurationMs: number;
  producedFieldsCount: number;
  toolCallsCount: number;
  timestamp: Date;
}

export interface AggregateMetrics {
  totalPlans: number;
  successRate: number;
  avgDurationMs: number;
  avgCostUSD: number;
  avgDurationAccuracy: number;
  avgCostAccuracy: number;
  avgLLMCalls: number;
  avgAPICalls: number;
  stageSuccessRates: Record<string, number>;
  workflowBreakdown: Record<string, number>;
  queryTypeBreakdown: Record<string, number>;
}

// ============================================================================
// In-Memory Metrics Storage
// ============================================================================

const recentMetrics: PlanMetrics[] = [];
const MAX_STORED_METRICS = 1000;

// ============================================================================
// Plan Monitor Class
// ============================================================================

export class PlanMonitor {
  /**
   * Track plan execution metrics
   */
  trackExecution(plan: ExecutionPlan, result: PlanExecutionResult): PlanMetrics {
    const durationAccuracy = plan.estimates.estimatedDurationMs > 0
      ? (result.durationMs / plan.estimates.estimatedDurationMs) * 100
      : 0;

    const costAccuracy = plan.estimates.estimatedCostUSD > 0
      ? (result.costs.actualCostUSD / plan.estimates.estimatedCostUSD) * 100
      : 0;

    const metrics: PlanMetrics = {
      planId: plan.planId,
      workflowId: plan.workflowId,
      queryType: plan.queryType,
      success: result.success,
      durationMs: result.durationMs,
      estimatedDurationMs: plan.estimates.estimatedDurationMs,
      durationAccuracyPercent: Math.round(durationAccuracy),
      actualCostUSD: result.costs.actualCostUSD,
      estimatedCostUSD: plan.estimates.estimatedCostUSD,
      costAccuracyPercent: Math.round(costAccuracy),
      llmCalls: result.costs.llmCalls,
      apiCalls: result.costs.apiCalls,
      stagesTotal: plan.stages.length,
      stagesCompleted: result.stagesCompleted.length,
      stagesFailed: result.stagesFailed.length,
      stagesSkipped: result.stagesSkipped.length,
      errorCount: result.errors.length,
      timestamp: new Date(),
    };

    // Store in memory
    recentMetrics.push(metrics);
    if (recentMetrics.length > MAX_STORED_METRICS) {
      recentMetrics.shift();
    }

    // Log to Axiom
    this.logToAxiom(metrics);

    // Update agent metrics based on execution
    this.updateAgentMetrics(plan, result);

    return metrics;
  }

  /**
   * Track individual stage metrics
   */
  trackStage(
    planId: string,
    stage: { stageId: string; agentId: string; estimatedDurationMs: number },
    result: StageExecutionResult
  ): StageMetrics {
    const metrics: StageMetrics = {
      stageId: stage.stageId,
      agentId: stage.agentId,
      status: result.status,
      durationMs: result.durationMs,
      estimatedDurationMs: stage.estimatedDurationMs,
      producedFieldsCount: result.producedFields.length,
      toolCallsCount: result.toolCalls?.length || 0,
      timestamp: new Date(),
    };

    return metrics;
  }

  /**
   * Get aggregate metrics for recent executions
   */
  getAggregateMetrics(): AggregateMetrics {
    if (recentMetrics.length === 0) {
      return {
        totalPlans: 0,
        successRate: 0,
        avgDurationMs: 0,
        avgCostUSD: 0,
        avgDurationAccuracy: 0,
        avgCostAccuracy: 0,
        avgLLMCalls: 0,
        avgAPICalls: 0,
        stageSuccessRates: {},
        workflowBreakdown: {},
        queryTypeBreakdown: {},
      };
    }

    const successCount = recentMetrics.filter((m) => m.success).length;
    const totalDuration = recentMetrics.reduce((sum, m) => sum + m.durationMs, 0);
    const totalCost = recentMetrics.reduce((sum, m) => sum + m.actualCostUSD, 0);
    const totalDurationAccuracy = recentMetrics.reduce((sum, m) => sum + m.durationAccuracyPercent, 0);
    const totalCostAccuracy = recentMetrics.reduce((sum, m) => sum + m.costAccuracyPercent, 0);
    const totalLLMCalls = recentMetrics.reduce((sum, m) => sum + m.llmCalls, 0);
    const totalAPICalls = recentMetrics.reduce((sum, m) => sum + m.apiCalls, 0);

    // Workflow breakdown
    const workflowBreakdown: Record<string, number> = {};
    for (const m of recentMetrics) {
      workflowBreakdown[m.workflowId] = (workflowBreakdown[m.workflowId] || 0) + 1;
    }

    // Query type breakdown
    const queryTypeBreakdown: Record<string, number> = {};
    for (const m of recentMetrics) {
      queryTypeBreakdown[m.queryType] = (queryTypeBreakdown[m.queryType] || 0) + 1;
    }

    return {
      totalPlans: recentMetrics.length,
      successRate: (successCount / recentMetrics.length) * 100,
      avgDurationMs: totalDuration / recentMetrics.length,
      avgCostUSD: totalCost / recentMetrics.length,
      avgDurationAccuracy: totalDurationAccuracy / recentMetrics.length,
      avgCostAccuracy: totalCostAccuracy / recentMetrics.length,
      avgLLMCalls: totalLLMCalls / recentMetrics.length,
      avgAPICalls: totalAPICalls / recentMetrics.length,
      stageSuccessRates: {}, // Would need stage-level tracking
      workflowBreakdown,
      queryTypeBreakdown,
    };
  }

  /**
   * Get recent metrics
   */
  getRecentMetrics(limit: number = 100): PlanMetrics[] {
    return recentMetrics.slice(-limit);
  }

  /**
   * Generate execution report
   */
  generateReport(plan: ExecutionPlan, result: PlanExecutionResult): string {
    const durationAccuracy = plan.estimates.estimatedDurationMs > 0
      ? ((result.durationMs / plan.estimates.estimatedDurationMs) * 100).toFixed(1)
      : 'N/A';

    const costAccuracy = plan.estimates.estimatedCostUSD > 0
      ? ((result.costs.actualCostUSD / plan.estimates.estimatedCostUSD) * 100).toFixed(1)
      : 'N/A';

    const stageDetails = result.stageResults
      .map((sr) => {
        const icon = sr.status === 'success' ? '✅' : sr.status === 'skipped' ? '⏭️' : '❌';
        return `   ${icon} ${sr.stageId}: ${sr.durationMs}ms`;
      })
      .join('\n');

    const errorDetails = result.errors.length > 0
      ? `\n❌ Errors:\n${result.errors.map((e) => `   - ${e.stageId}: ${e.error}`).join('\n')}`
      : '';

    return `
📊 Plan Execution Report
========================

Plan ID: ${plan.planId}
Workflow: ${plan.workflowId}
Query Type: ${plan.queryType}
Status: ${result.success ? '✅ Success' : '❌ Failed'}

⏱️  Duration:
   Estimated: ${plan.estimates.estimatedDurationMs}ms
   Actual: ${result.durationMs}ms
   Accuracy: ${durationAccuracy}%

💰 Cost:
   Estimated: $${plan.estimates.estimatedCostUSD.toFixed(4)}
   Actual: $${result.costs.actualCostUSD.toFixed(4)}
   Accuracy: ${costAccuracy}%
   LLM Calls: ${result.costs.llmCalls}
   API Calls: ${result.costs.apiCalls}

📈 Stages:
   Total: ${plan.stages.length}
   Completed: ${result.stagesCompleted.length}
   Failed: ${result.stagesFailed.length}
   Skipped: ${result.stagesSkipped.length}

📋 Stage Details:
${stageDetails}
${errorDetails}

🔄 Comparison to Legacy:
   Legacy LLM Calls: ~5+
   Plan-Based LLM Calls: ${result.costs.llmCalls}
   Savings: ${Math.max(0, 5 - result.costs.llmCalls)} LLM calls (~${Math.max(0, (5 - result.costs.llmCalls) * 0.02).toFixed(2)} USD)
`;
  }

  /**
   * Generate summary for logging
   */
  generateSummary(plan: ExecutionPlan, result: PlanExecutionResult): string {
    return `Plan ${plan.planId.slice(0, 8)}... | ${result.success ? 'OK' : 'FAIL'} | ${result.durationMs}ms | $${result.costs.actualCostUSD.toFixed(4)} | ${result.stagesCompleted.length}/${plan.stages.length} stages`;
  }

  /**
   * Log metrics to Axiom
   */
  private logToAxiom(metrics: PlanMetrics): void {
    try {
      logAgentExecution('plan_executor', metrics.planId, metrics.durationMs, 
        metrics.success ? 'success' : 'failed', {
        workflowId: metrics.workflowId,
        queryType: metrics.queryType,
        stagesCompleted: metrics.stagesCompleted,
        stagesFailed: metrics.stagesFailed,
        stagesSkipped: metrics.stagesSkipped,
        llmCalls: metrics.llmCalls,
        apiCalls: metrics.apiCalls,
        actualCostUSD: metrics.actualCostUSD,
        estimatedCostUSD: metrics.estimatedCostUSD,
        durationAccuracyPercent: metrics.durationAccuracyPercent,
        costAccuracyPercent: metrics.costAccuracyPercent,
      });
    } catch (error) {
      console.warn('Failed to log to Axiom:', error);
    }
  }

  /**
   * Update agent metrics based on execution results
   */
  private updateAgentMetrics(plan: ExecutionPlan, result: PlanExecutionResult): void {
    const agentRegistry = AgentRegistry.getInstance();

    for (const stageResult of result.stageResults) {
      if (stageResult.status === 'success') {
        // Record successful execution
        agentRegistry.recordExecution(
          stageResult.agentId,
          true,
          stageResult.durationMs
        );
      } else if (stageResult.status === 'failed') {
        // Record failed execution
        agentRegistry.recordExecution(
          stageResult.agentId,
          false,
          stageResult.durationMs
        );
      }
    }
  }

  /**
   * Clear stored metrics
   */
  clearMetrics(): void {
    recentMetrics.length = 0;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let monitorInstance: PlanMonitor | null = null;

export function getPlanMonitor(): PlanMonitor {
  if (!monitorInstance) {
    monitorInstance = new PlanMonitor();
  }
  return monitorInstance;
}
