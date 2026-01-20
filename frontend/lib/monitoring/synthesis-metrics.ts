/**
 * Synthesis Metrics Module
 * 
 * Tracks performance, cost, and accuracy metrics for the synthesis engine.
 * Provides real-time monitoring and alerting capabilities.
 */

// ============================================================================
// Types
// ============================================================================

export interface SynthesisMetrics {
  /** Unique identifier for this query */
  query_id: string;
  /** Classified query type */
  query_type: 'informational' | 'decision-required' | 'validation' | 'comparison';
  /** Time taken for synthesis in milliseconds */
  synthesis_latency_ms: number;
  /** Estimated cost in USD for this synthesis call */
  synthesis_cost_usd: number;
  /** Whether the classification was accurate (if verified) */
  classification_accurate?: boolean;
  /** Whether the filtering decisions were appropriate (if verified) */
  filtering_appropriate?: boolean;
  /** Number of input tokens used */
  input_tokens: number;
  /** Number of output tokens generated */
  output_tokens: number;
  /** Model used for synthesis */
  model: string;
  /** Timestamp of the synthesis */
  timestamp: number;
  /** Details surfaced flags */
  details_surfaced: {
    multi_port_analysis: boolean;
    alternatives: boolean;
    rob_waypoints: boolean;
    weather_details: boolean;
    eca_details: boolean;
  };
  /** Number of strategic priorities generated */
  priorities_count: number;
  /** Number of critical risks identified */
  risks_count: number;
}

export interface MetricsSummary {
  /** Total number of queries processed */
  total_queries: number;
  /** Breakdown by query type */
  by_query_type: Record<string, number>;
  /** Average latency in milliseconds */
  avg_latency_ms: number;
  /** P95 latency in milliseconds */
  p95_latency_ms: number;
  /** Total cost in USD */
  total_cost_usd: number;
  /** Average cost per query in USD */
  avg_cost_per_query_usd: number;
  /** Classification accuracy percentage (if verified) */
  classification_accuracy_pct?: number;
  /** Details surfacing rate (percentage of queries with at least one detail flag true) */
  details_surfacing_rate_pct: number;
  /** Time period (start timestamp) */
  period_start: number;
  /** Time period (end timestamp) */
  period_end: number;
}

// ============================================================================
// Pricing Constants (Claude Haiku as of Jan 2026)
// ============================================================================

const PRICING = {
  'claude-3-5-haiku-20241022': {
    input_per_1m: 0.80,   // $0.80 per 1M input tokens
    output_per_1m: 4.00,  // $4.00 per 1M output tokens
  },
  'claude-3-haiku-20240307': {
    input_per_1m: 0.25,   // $0.25 per 1M input tokens
    output_per_1m: 1.25,  // $1.25 per 1M output tokens
  },
  'claude-3-5-sonnet-20241022': {
    input_per_1m: 3.00,   // $3.00 per 1M input tokens
    output_per_1m: 15.00, // $15.00 per 1M output tokens
  },
  // Default fallback
  'default': {
    input_per_1m: 0.80,
    output_per_1m: 4.00,
  },
};

// ============================================================================
// In-Memory Metrics Store (for development)
// ============================================================================

const metricsStore: SynthesisMetrics[] = [];
const MAX_STORED_METRICS = 1000;

// ============================================================================
// Cost Calculation
// ============================================================================

export function calculateSynthesisCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = PRICING[model as keyof typeof PRICING] || PRICING.default;
  
  const inputCost = (inputTokens / 1_000_000) * pricing.input_per_1m;
  const outputCost = (outputTokens / 1_000_000) * pricing.output_per_1m;
  
  return inputCost + outputCost;
}

// ============================================================================
// Metrics Recording
// ============================================================================

export function recordSynthesisMetrics(metrics: SynthesisMetrics): void {
  // Add to in-memory store
  metricsStore.push(metrics);
  
  // Keep store bounded
  if (metricsStore.length > MAX_STORED_METRICS) {
    metricsStore.shift();
  }
  
  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log('📊 [METRICS]', {
      query_id: metrics.query_id,
      query_type: metrics.query_type,
      latency_ms: metrics.synthesis_latency_ms,
      cost_usd: metrics.synthesis_cost_usd.toFixed(6),
      tokens: `${metrics.input_tokens}/${metrics.output_tokens}`,
    });
  }
  
  // Send to analytics endpoint in production
  if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined') {
    sendMetricsToBackend(metrics).catch((error) => {
      console.error('Failed to send metrics:', error);
    });
  }
  
  // Check for alerts
  checkMetricsAlerts(metrics);
}

async function sendMetricsToBackend(metrics: SynthesisMetrics): Promise<void> {
  try {
    await fetch('/api/monitoring', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'synthesis_metrics',
        data: metrics,
      }),
    });
  } catch (error) {
    // Silently fail - metrics are non-critical
    console.warn('Metrics submission failed:', error);
  }
}

// ============================================================================
// Alerting
// ============================================================================

interface AlertThresholds {
  latency_warning_ms: number;
  latency_critical_ms: number;
  cost_warning_usd: number;
  cost_critical_usd: number;
}

const DEFAULT_THRESHOLDS: AlertThresholds = {
  latency_warning_ms: 2000,   // 2 seconds
  latency_critical_ms: 5000,  // 5 seconds
  cost_warning_usd: 0.005,    // $0.005
  cost_critical_usd: 0.01,    // $0.01
};

function checkMetricsAlerts(
  metrics: SynthesisMetrics,
  thresholds: AlertThresholds = DEFAULT_THRESHOLDS
): void {
  // Latency alerts
  if (metrics.synthesis_latency_ms > thresholds.latency_critical_ms) {
    console.error(`🚨 [ALERT] Critical latency: ${metrics.synthesis_latency_ms}ms (query: ${metrics.query_id})`);
  } else if (metrics.synthesis_latency_ms > thresholds.latency_warning_ms) {
    console.warn(`⚠️ [ALERT] High latency: ${metrics.synthesis_latency_ms}ms (query: ${metrics.query_id})`);
  }
  
  // Cost alerts
  if (metrics.synthesis_cost_usd > thresholds.cost_critical_usd) {
    console.error(`🚨 [ALERT] Critical cost: $${metrics.synthesis_cost_usd.toFixed(4)} (query: ${metrics.query_id})`);
  } else if (metrics.synthesis_cost_usd > thresholds.cost_warning_usd) {
    console.warn(`⚠️ [ALERT] High cost: $${metrics.synthesis_cost_usd.toFixed(4)} (query: ${metrics.query_id})`);
  }
}

// ============================================================================
// Metrics Aggregation
// ============================================================================

export function getMetricsSummary(
  periodMinutes: number = 60
): MetricsSummary {
  const now = Date.now();
  const periodStart = now - (periodMinutes * 60 * 1000);
  
  // Filter to time period
  const periodMetrics = metricsStore.filter(m => m.timestamp >= periodStart);
  
  if (periodMetrics.length === 0) {
    return {
      total_queries: 0,
      by_query_type: {},
      avg_latency_ms: 0,
      p95_latency_ms: 0,
      total_cost_usd: 0,
      avg_cost_per_query_usd: 0,
      details_surfacing_rate_pct: 0,
      period_start: periodStart,
      period_end: now,
    };
  }
  
  // Count by query type
  const byQueryType: Record<string, number> = {};
  for (const m of periodMetrics) {
    byQueryType[m.query_type] = (byQueryType[m.query_type] || 0) + 1;
  }
  
  // Calculate latencies
  const latencies = periodMetrics.map(m => m.synthesis_latency_ms).sort((a, b) => a - b);
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p95Index = Math.floor(latencies.length * 0.95);
  const p95Latency = latencies[p95Index] || latencies[latencies.length - 1];
  
  // Calculate costs
  const totalCost = periodMetrics.reduce((sum, m) => sum + m.synthesis_cost_usd, 0);
  const avgCost = totalCost / periodMetrics.length;
  
  // Calculate details surfacing rate
  const queriesWithDetails = periodMetrics.filter(m => 
    Object.values(m.details_surfaced).some(v => v === true)
  ).length;
  const detailsRate = (queriesWithDetails / periodMetrics.length) * 100;
  
  // Calculate classification accuracy if available
  const verifiedMetrics = periodMetrics.filter(m => m.classification_accurate !== undefined);
  const accuracyPct = verifiedMetrics.length > 0
    ? (verifiedMetrics.filter(m => m.classification_accurate).length / verifiedMetrics.length) * 100
    : undefined;
  
  return {
    total_queries: periodMetrics.length,
    by_query_type: byQueryType,
    avg_latency_ms: Math.round(avgLatency),
    p95_latency_ms: Math.round(p95Latency),
    total_cost_usd: totalCost,
    avg_cost_per_query_usd: avgCost,
    classification_accuracy_pct: accuracyPct,
    details_surfacing_rate_pct: Math.round(detailsRate),
    period_start: periodStart,
    period_end: now,
  };
}

// ============================================================================
// Metrics Export
// ============================================================================

export function exportMetrics(): SynthesisMetrics[] {
  return [...metricsStore];
}

export function clearMetrics(): void {
  metricsStore.length = 0;
}

// ============================================================================
// Utility: Generate Unique Query ID
// ============================================================================

export function generateQueryId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `synth_${timestamp}_${random}`;
}

// ============================================================================
// Utility: Create Metrics Object
// ============================================================================

export function createMetricsFromSynthesis(
  queryId: string,
  synthesis: any,
  latencyMs: number,
  inputTokens: number,
  outputTokens: number,
  model: string
): SynthesisMetrics {
  const cost = calculateSynthesisCost(model, inputTokens, outputTokens);
  
  return {
    query_id: queryId,
    query_type: synthesis?.query_type || 'decision-required',
    synthesis_latency_ms: latencyMs,
    synthesis_cost_usd: cost,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    model,
    timestamp: Date.now(),
    details_surfaced: {
      multi_port_analysis: synthesis?.details_to_surface?.show_multi_port_analysis || false,
      alternatives: synthesis?.details_to_surface?.show_alternatives || false,
      rob_waypoints: synthesis?.details_to_surface?.show_rob_waypoints || false,
      weather_details: synthesis?.details_to_surface?.show_weather_details || false,
      eca_details: synthesis?.details_to_surface?.show_eca_details || false,
    },
    priorities_count: synthesis?.strategic_priorities?.length || 0,
    risks_count: synthesis?.critical_risks?.length || 0,
  };
}
