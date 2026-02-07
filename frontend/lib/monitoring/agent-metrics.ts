/**
 * Agent Metrics Module
 *
 * Monitoring and metrics for agent workflows, with specialized support for
 * vessel selection. Tracks comparison counts, performance, business metrics,
 * and errors. Integrates with Axiom for production logging.
 */

import { logCustomEvent, logError } from '@/lib/monitoring/axiom-logger';

// ============================================================================
// Types
// ============================================================================

/** Vessel comparison metrics: counts and aggregates */
export interface VesselSelectionMetrics {
  /** Total number of vessel comparisons run */
  total_comparisons: number;
  /** Sum of vessel counts across all comparisons (for avg calculation) */
  total_vessels_compared: number;
  /** Maximum number of vessels in a single comparison */
  max_vessels_compared: number;
  /** Timestamp of last comparison */
  last_comparison_at: number;
}

/** Performance metrics: timing and throughput */
export interface VesselSelectionPerformance {
  /** Average analysis time per vessel (ms) */
  avg_analysis_time_ms: number;
  /** Total workflow execution time (ms) for last run */
  total_execution_time_ms: number;
  /** Time by workflow step: analysis, ranking, etc. */
  step_times_ms: Record<string, number>;
  /** Number of analyses used for avg_analysis_time calculation */
  analysis_count: number;
}

/** Business metrics: bunker avoidance, cost, recommendations */
export interface VesselSelectionBusinessMetrics {
  /** Percentage of vessels that needed no bunker (can_proceed_without_bunker) */
  bunker_avoidance_rate_pct: number;
  /** Average cost savings vs highest-cost vessel in comparison (USD) */
  avg_cost_savings_usd: number;
  /** Most recommended vessels: vessel_name -> count */
  recommended_vessel_counts: Record<string, number>;
  /** Total vessels analyzed for rate calculations */
  total_vessels_analyzed: number;
  /** Vessels that could proceed without bunker */
  vessels_no_bunker_count: number;
}

/** Error tracking for vessel selection */
export interface VesselSelectionErrorMetrics {
  /** Number of failed vessel analyses */
  failed_analyses: number;
  /** Invalid input rate (empty vessel_names, missing voyage) as fraction 0-1 */
  invalid_input_rate: number;
  /** Number of timeout occurrences */
  timeout_count: number;
  /** Total failures (for rate calculation) */
  total_errors: number;
}

/** Aggregated vessel selection metrics snapshot */
export interface VesselSelectionMetricsSnapshot {
  comparison: VesselSelectionMetrics;
  performance: VesselSelectionPerformance;
  business: VesselSelectionBusinessMetrics;
  errors: VesselSelectionErrorMetrics;
  period_start: number;
  period_end: number;
}

// ============================================================================
// In-Memory Store
// ============================================================================

const MAX_STORED_EVENTS = 1000;

interface ComparisonEvent {
  vessel_count: number;
  timestamp: number;
  correlation_id: string;
  /** Cost savings vs highest-cost vessel in this comparison (USD) */
  cost_savings_usd?: number;
}

interface AnalysisEvent {
  vessel_name: string;
  duration_ms: number;
  can_proceed_without_bunker: boolean;
  total_cost: number;
  timestamp: number;
}

interface RecommendationEvent {
  vessel_name: string;
  rank: number;
  correlation_id: string;
  timestamp: number;
}

interface ErrorEvent {
  type: 'failed_analysis' | 'invalid_input' | 'timeout';
  vessel_name?: string;
  timestamp: number;
}

const comparisonEvents: ComparisonEvent[] = [];
const analysisEvents: AnalysisEvent[] = [];
const recommendationEvents: RecommendationEvent[] = [];
const errorEvents: ErrorEvent[] = [];
let workflowStepTimes: Record<string, number[]> = {};

function trimStore<T>(arr: T[], max: number): void {
  while (arr.length > max) arr.shift();
}

// ============================================================================
// Logging Functions
// ============================================================================

/**
 * Log a vessel comparison run.
 * Call when compareVessels completes or when vessel selection agent finishes.
 */
export function logVesselComparison(params: {
  correlation_id: string;
  vessel_count: number;
  recommended_vessel: string;
  total_execution_time_ms: number;
  origin?: string;
  destination?: string;
  /** Cost savings vs highest-cost vessel in comparison (USD) */
  cost_savings_usd?: number;
}): void {
  const { correlation_id, vessel_count, recommended_vessel, total_execution_time_ms, origin, destination, cost_savings_usd } = params;

  comparisonEvents.push({ vessel_count, timestamp: Date.now(), correlation_id, cost_savings_usd });
  trimStore(comparisonEvents, MAX_STORED_EVENTS);

  logCustomEvent('vessel_selection_comparison', correlation_id, {
    vessel_count,
    recommended_vessel,
    total_execution_time_ms,
    origin,
    destination,
    cost_savings_usd,
  });
}

/**
 * Log a single vessel analysis result.
 * Call for each vessel after analyzeVessel completes.
 */
export function logVesselAnalysis(params: {
  correlation_id: string;
  vessel_name: string;
  duration_ms: number;
  can_proceed_without_bunker: boolean;
  total_voyage_cost: number;
  feasibility_score: number;
  success: boolean;
}): void {
  const {
    correlation_id,
    vessel_name,
    duration_ms,
    can_proceed_without_bunker,
    total_voyage_cost,
    feasibility_score,
    success,
  } = params;

  analysisEvents.push({
    vessel_name,
    duration_ms,
    can_proceed_without_bunker,
    total_cost: total_voyage_cost,
    timestamp: Date.now(),
  });
  trimStore(analysisEvents, MAX_STORED_EVENTS);

  if (!success) {
    errorEvents.push({ type: 'failed_analysis', vessel_name, timestamp: Date.now() });
    trimStore(errorEvents, MAX_STORED_EVENTS);
  }

  logCustomEvent('vessel_selection_analysis', correlation_id, {
    vessel_name,
    duration_ms,
    can_proceed_without_bunker,
    total_voyage_cost,
    feasibility_score,
    success,
  });
}

/**
 * Log a vessel recommendation (ranking result).
 * Call when ranking is produced, typically for top recommended vessel.
 */
export function logVesselRecommendation(params: {
  correlation_id: string;
  vessel_name: string;
  rank: number;
  score: number;
  recommendation_reason?: string;
  total_cost_usd?: number;
}): void {
  const { correlation_id, vessel_name, rank, score, recommendation_reason, total_cost_usd } = params;

  recommendationEvents.push({ vessel_name, rank, correlation_id, timestamp: Date.now() });
  trimStore(recommendationEvents, MAX_STORED_EVENTS);

  logCustomEvent('vessel_selection_recommendation', correlation_id, {
    vessel_name,
    rank,
    score,
    recommendation_reason,
    total_cost_usd,
  });
}

/**
 * Log a vessel selection error.
 */
export function logVesselSelectionError(params: {
  correlation_id: string;
  error_type: 'failed_analysis' | 'invalid_input' | 'timeout';
  vessel_name?: string;
  error_message: string;
}): void {
  const { correlation_id, error_type, vessel_name, error_message } = params;

  errorEvents.push({ type: error_type, vessel_name, timestamp: Date.now() });
  trimStore(errorEvents, MAX_STORED_EVENTS);

  logError(correlation_id, new Error(error_message), {
    agent: 'vessel_selection_agent',
    error_type,
    vessel_name,
  });

  logCustomEvent('vessel_selection_error', correlation_id, {
    error_type,
    vessel_name,
    error_message,
  }, 'warn');
}

/**
 * Record workflow step timing for performance breakdown.
 */
export function logVesselSelectionStep(step_name: string, duration_ms: number): void {
  if (!workflowStepTimes[step_name]) {
    workflowStepTimes[step_name] = [];
  }
  workflowStepTimes[step_name].push(duration_ms);
  trimStore(workflowStepTimes[step_name], 100);
}

// ============================================================================
// Metrics Aggregation
// ============================================================================

/**
 * Get a snapshot of vessel selection metrics for the given period.
 */
export function getVesselSelectionMetricsSnapshot(
  periodMinutes: number = 60
): VesselSelectionMetricsSnapshot {
  const now = Date.now();
  const periodStart = now - periodMinutes * 60 * 1000;

  const recentComparisons = comparisonEvents.filter((e) => e.timestamp >= periodStart);
  const recentAnalyses = analysisEvents.filter((e) => e.timestamp >= periodStart);
  const recentRecommendations = recommendationEvents.filter((e) => e.timestamp >= periodStart);
  const recentErrors = errorEvents.filter((e) => e.timestamp >= periodStart);

  // Comparison metrics
  const totalComparisons = recentComparisons.length;
  const totalVesselsCompared = recentComparisons.reduce((s, e) => s + e.vessel_count, 0);
  const maxVesselsCompared =
    recentComparisons.length > 0 ? Math.max(...recentComparisons.map((e) => e.vessel_count)) : 0;

  // Performance metrics
  const analysisCount = recentAnalyses.length;
  const avgAnalysisTimeMs =
    analysisCount > 0
      ? recentAnalyses.reduce((s, e) => s + e.duration_ms, 0) / analysisCount
      : 0;
  const stepTimesMs: Record<string, number> = {};
  for (const [step, times] of Object.entries(workflowStepTimes)) {
    const periodTimes = times.filter((t) => t !== undefined); // recent filter would need timestamps
    if (periodTimes.length > 0) {
      stepTimesMs[step] =
        periodTimes.reduce((a, b) => a + b, 0) / periodTimes.length;
    }
  }
  const lastComparison = recentComparisons[recentComparisons.length - 1];
  const totalExecutionTimeMs = 0; // Not stored per-comparison; use agent execution log

  // Business metrics
  const vesselsNoBunker = recentAnalyses.filter((e) => e.can_proceed_without_bunker).length;
  const bunkerAvoidanceRatePct =
    analysisCount > 0 ? (vesselsNoBunker / analysisCount) * 100 : 0;

  // Cost savings: from comparison events (stored when logVesselComparison includes cost_savings_usd)
  const comparisonsWithSavings = recentComparisons.filter((c) => c.cost_savings_usd != null && c.cost_savings_usd > 0);
  const avgCostSavingsUsd =
    comparisonsWithSavings.length > 0
      ? comparisonsWithSavings.reduce((s, c) => s + (c.cost_savings_usd ?? 0), 0) / comparisonsWithSavings.length
      : 0;

  const recommendedCounts: Record<string, number> = {};
  for (const r of recentRecommendations) {
    if (r.rank === 1) {
      recommendedCounts[r.vessel_name] = (recommendedCounts[r.vessel_name] ?? 0) + 1;
    }
  }

  // Error metrics
  const failedAnalyses = recentErrors.filter((e) => e.type === 'failed_analysis').length;
  const invalidInputs = recentErrors.filter((e) => e.type === 'invalid_input').length;
  const timeouts = recentErrors.filter((e) => e.type === 'timeout').length;
  const totalErrors = recentErrors.length;
  const totalInputs = totalComparisons + invalidInputs;
  const invalidInputRate = totalInputs > 0 ? invalidInputs / totalInputs : 0;

  return {
    comparison: {
      total_comparisons: totalComparisons,
      total_vessels_compared: totalVesselsCompared,
      max_vessels_compared: maxVesselsCompared,
      last_comparison_at: recentComparisons.length > 0 ? Math.max(...recentComparisons.map((e) => e.timestamp)) : 0,
    },
    performance: {
      avg_analysis_time_ms: Math.round(avgAnalysisTimeMs),
      total_execution_time_ms: totalExecutionTimeMs,
      step_times_ms: stepTimesMs,
      analysis_count: analysisCount,
    },
    business: {
      bunker_avoidance_rate_pct: Math.round(bunkerAvoidanceRatePct * 10) / 10,
      avg_cost_savings_usd: Math.round(avgCostSavingsUsd),
      recommended_vessel_counts: recommendedCounts,
      total_vessels_analyzed: analysisCount,
      vessels_no_bunker_count: vesselsNoBunker,
    },
    errors: {
      failed_analyses: failedAnalyses,
      invalid_input_rate: Math.round(invalidInputRate * 1000) / 1000,
      timeout_count: timeouts,
      total_errors: totalErrors,
    },
    period_start: periodStart,
    period_end: now,
  };
}

/**
 * Clear all stored metrics. Useful for tests or resetting a reporting window.
 */
export function clearVesselSelectionMetrics(): void {
  comparisonEvents.length = 0;
  analysisEvents.length = 0;
  recommendationEvents.length = 0;
  errorEvents.length = 0;
  workflowStepTimes = {};
}
