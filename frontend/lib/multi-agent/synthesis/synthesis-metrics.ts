/**
 * Synthesis Metrics Tracking
 * 
 * Tracks synthesis attempts, successes, failures, costs, and durations
 * for monitoring and optimization purposes.
 */

// ============================================================================
// Types
// ============================================================================

export interface SynthesisMetrics {
  total_synthesis_attempts: number;
  total_synthesis_success: number;
  total_synthesis_failures: number;
  total_synthesis_skipped: number;
  total_cost_usd: number;
  average_duration_ms: number;
  last_synthesis_timestamp: number | null;
}

// ============================================================================
// Metrics Tracker Class
// ============================================================================

export class SynthesisMetricsTracker {
  private metrics: SynthesisMetrics = {
    total_synthesis_attempts: 0,
    total_synthesis_success: 0,
    total_synthesis_failures: 0,
    total_synthesis_skipped: 0,
    total_cost_usd: 0,
    average_duration_ms: 0,
    last_synthesis_timestamp: null,
  };
  
  private durations: number[] = [];
  
  /**
   * Record a synthesis attempt
   */
  public recordAttempt(): void {
    this.metrics.total_synthesis_attempts++;
  }
  
  /**
   * Record a successful synthesis
   */
  public recordSuccess(cost_usd: number, duration_ms: number): void {
    this.metrics.total_synthesis_success++;
    this.metrics.total_cost_usd += cost_usd;
    this.metrics.last_synthesis_timestamp = Date.now();
    this.durations.push(duration_ms);
    this.updateAverageDuration();
    
    // Log occasionally for visibility
    if (this.metrics.total_synthesis_success % 5 === 0) {
      this.logMetrics();
    }
  }
  
  /**
   * Record a failed synthesis
   */
  public recordFailure(): void {
    this.metrics.total_synthesis_failures++;
  }
  
  /**
   * Record a skipped synthesis
   */
  public recordSkipped(): void {
    this.metrics.total_synthesis_skipped++;
  }
  
  /**
   * Update the average duration
   */
  private updateAverageDuration(): void {
    if (this.durations.length === 0) return;
    const sum = this.durations.reduce((a, b) => a + b, 0);
    this.metrics.average_duration_ms = Math.round(sum / this.durations.length);
  }
  
  /**
   * Get current metrics
   */
  public getMetrics(): SynthesisMetrics {
    return { ...this.metrics };
  }
  
  /**
   * Get success rate as a percentage
   */
  public getSuccessRate(): number {
    const total = this.metrics.total_synthesis_success + this.metrics.total_synthesis_failures;
    if (total === 0) return 0;
    return Math.round((this.metrics.total_synthesis_success / total) * 100);
  }
  
  /**
   * Log current metrics to console
   */
  public logMetrics(): void {
    const m = this.metrics;
    console.log('📊 [SYNTHESIS-METRICS] Current metrics:');
    console.log(`   Attempts: ${m.total_synthesis_attempts}`);
    console.log(`   Success: ${m.total_synthesis_success} (${this.getSuccessRate()}%)`);
    console.log(`   Failures: ${m.total_synthesis_failures}`);
    console.log(`   Skipped: ${m.total_synthesis_skipped}`);
    console.log(`   Total Cost: $${m.total_cost_usd.toFixed(4)}`);
    console.log(`   Avg Duration: ${m.average_duration_ms}ms`);
  }
  
  /**
   * Reset metrics (for testing)
   */
  public reset(): void {
    this.metrics = {
      total_synthesis_attempts: 0,
      total_synthesis_success: 0,
      total_synthesis_failures: 0,
      total_synthesis_skipped: 0,
      total_cost_usd: 0,
      average_duration_ms: 0,
      last_synthesis_timestamp: null,
    };
    this.durations = [];
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let metricsInstance: SynthesisMetricsTracker | null = null;

/**
 * Get the singleton metrics tracker instance
 */
export function getSynthesisMetrics(): SynthesisMetricsTracker {
  if (!metricsInstance) {
    metricsInstance = new SynthesisMetricsTracker();
  }
  return metricsInstance;
}

/**
 * Reset the metrics tracker (for testing)
 */
export function resetSynthesisMetrics(): void {
  if (metricsInstance) {
    metricsInstance.reset();
  }
}
