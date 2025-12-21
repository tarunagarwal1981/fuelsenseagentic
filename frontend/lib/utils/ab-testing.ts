/**
 * A/B Testing Framework
 * 
 * Routes traffic between single-agent and multi-agent endpoints,
 * tracks metrics, and enables data-driven comparison.
 */

// ============================================================================
// Types
// ============================================================================

export type TestVariant = 'single-agent' | 'multi-agent';

export interface ABTestResult {
  variant: TestVariant;
  requestId: string;
  timestamp: string;
  responseTime: number;
  success: boolean;
  error?: string;
  userSatisfaction?: number; // 1-5 scale
  accuracy?: number; // 0-1 scale
  cost?: number; // USD
  metadata?: {
    agentTimes?: Record<string, number>;
    toolCalls?: number;
    cacheHit?: boolean;
  };
}

export interface ABTestMetrics {
  variant: TestVariant;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  averageResponseTime: number;
  medianResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  totalCost: number;
  averageCost: number;
  averageSatisfaction: number;
  averageAccuracy: number;
  cacheHitRate: number;
}

export interface ABTestComparison {
  singleAgent: ABTestMetrics;
  multiAgent: ABTestMetrics;
  improvement: {
    responseTime: number; // % improvement
    successRate: number; // % improvement
    cost: number; // % difference
    satisfaction: number; // % improvement
    accuracy: number; // % improvement
  };
  recommendation: 'single-agent' | 'multi-agent' | 'inconclusive';
}

// ============================================================================
// Storage (In-Memory - Production: Use Database)
// ============================================================================

const testResults: ABTestResult[] = [];
const MAX_RESULTS = 10000; // Keep last 10k results

// ============================================================================
// A/B Testing Configuration
// ============================================================================

/**
 * Get A/B test configuration from environment or defaults
 */
function getABTestConfig(): {
  enabled: boolean;
  multiAgentPercentage: number;
  gradualRollout: boolean;
} {
  return {
    enabled: process.env.AB_TEST_ENABLED !== 'false',
    multiAgentPercentage: parseFloat(process.env.AB_TEST_MULTI_AGENT_PERCENTAGE || '50'),
    gradualRollout: process.env.AB_TEST_GRADUAL_ROLLOUT === 'true',
  };
}

/**
 * Determine which variant to use for a request
 */
export function getTestVariant(userId?: string, sessionId?: string): TestVariant {
  const config = getABTestConfig();

  if (!config.enabled) {
    // Default to multi-agent if A/B testing disabled
    return 'multi-agent';
  }

  // Gradual rollout: Use user/session hash for consistent assignment
  if (config.gradualRollout && (userId || sessionId)) {
    const hash = hashString(userId || sessionId || '');
    const percentage = (hash % 100) + 1; // 1-100
    return percentage <= config.multiAgentPercentage ? 'multi-agent' : 'single-agent';
  }

  // Random assignment
  const random = Math.random() * 100;
  return random <= config.multiAgentPercentage ? 'multi-agent' : 'single-agent';
}

/**
 * Simple hash function for consistent user assignment
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// Result Recording
// ============================================================================

/**
 * Record A/B test result
 */
export function recordABTestResult(result: Omit<ABTestResult, 'requestId' | 'timestamp'>): string {
  const requestId = generateRequestId();
  const fullResult: ABTestResult = {
    ...result,
    requestId,
    timestamp: new Date().toISOString(),
  };

  testResults.push(fullResult);

  // Keep only last MAX_RESULTS
  if (testResults.length > MAX_RESULTS) {
    testResults.shift();
  }

  console.log(`📊 [AB-TEST] Recorded ${result.variant}: ${result.success ? '✅' : '❌'} ${result.responseTime}ms`);

  return requestId;
}

/**
 * Record user satisfaction (can be called from frontend)
 */
export function recordUserSatisfaction(
  requestId: string,
  satisfaction: number,
  accuracy?: number
): void {
  const result = testResults.find((r) => r.requestId === requestId);
  if (result) {
    result.userSatisfaction = Math.max(1, Math.min(5, satisfaction)); // Clamp 1-5
    if (accuracy !== undefined) {
      result.accuracy = Math.max(0, Math.min(1, accuracy)); // Clamp 0-1
    }
    console.log(`📊 [AB-TEST] Updated satisfaction for ${requestId}: ${satisfaction}/5`);
  }
}

// ============================================================================
// Metrics Calculation
// ============================================================================

/**
 * Calculate metrics for a variant
 */
export function calculateVariantMetrics(variant: TestVariant): ABTestMetrics {
  const variantResults = testResults.filter((r) => r.variant === variant);

  if (variantResults.length === 0) {
    return {
      variant,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      successRate: 0,
      averageResponseTime: 0,
      medianResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      totalCost: 0,
      averageCost: 0,
      averageSatisfaction: 0,
      averageAccuracy: 0,
      cacheHitRate: 0,
    };
  }

  const successful = variantResults.filter((r) => r.success);
  const failed = variantResults.filter((r) => !r.success);
  const responseTimes = variantResults.map((r) => r.responseTime).sort((a, b) => a - b);
  const costs = variantResults.filter((r) => r.cost !== undefined).map((r) => r.cost!);
  const satisfactions = variantResults.filter((r) => r.userSatisfaction !== undefined).map((r) => r.userSatisfaction!);
  const accuracies = variantResults.filter((r) => r.accuracy !== undefined).map((r) => r.accuracy!);
  const cacheHits = variantResults.filter((r) => r.metadata?.cacheHit === true).length;

  const averageResponseTime = responseTimes.length > 0
    ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
    : 0;

  const medianResponseTime = responseTimes.length > 0
    ? responseTimes[Math.floor(responseTimes.length / 2)]
    : 0;

  const p95ResponseTime = responseTimes.length > 0
    ? responseTimes[Math.floor(responseTimes.length * 0.95)]
    : 0;

  const p99ResponseTime = responseTimes.length > 0
    ? responseTimes[Math.floor(responseTimes.length * 0.99)]
    : 0;

  const totalCost = costs.reduce((sum, c) => sum + c, 0);
  const averageCost = costs.length > 0 ? totalCost / costs.length : 0;

  const averageSatisfaction = satisfactions.length > 0
    ? satisfactions.reduce((sum, s) => sum + s, 0) / satisfactions.length
    : 0;

  const averageAccuracy = accuracies.length > 0
    ? accuracies.reduce((sum, a) => sum + a, 0) / accuracies.length
    : 0;

  const cacheHitRate = variantResults.length > 0
    ? (cacheHits / variantResults.length) * 100
    : 0;

  return {
    variant,
    totalRequests: variantResults.length,
    successfulRequests: successful.length,
    failedRequests: failed.length,
    successRate: variantResults.length > 0 ? (successful.length / variantResults.length) * 100 : 0,
    averageResponseTime,
    medianResponseTime,
    p95ResponseTime,
    p99ResponseTime,
    totalCost,
    averageCost,
    averageSatisfaction,
    averageAccuracy,
    cacheHitRate,
  };
}

/**
 * Compare single-agent vs multi-agent
 */
export function compareVariants(): ABTestComparison {
  const singleAgent = calculateVariantMetrics('single-agent');
  const multiAgent = calculateVariantMetrics('multi-agent');

  const improvement = {
    responseTime: singleAgent.averageResponseTime > 0
      ? ((singleAgent.averageResponseTime - multiAgent.averageResponseTime) / singleAgent.averageResponseTime) * 100
      : 0,
    successRate: singleAgent.successRate > 0
      ? ((multiAgent.successRate - singleAgent.successRate) / singleAgent.successRate) * 100
      : 0,
    cost: singleAgent.averageCost > 0
      ? ((multiAgent.averageCost - singleAgent.averageCost) / singleAgent.averageCost) * 100
      : 0,
    satisfaction: singleAgent.averageSatisfaction > 0
      ? ((multiAgent.averageSatisfaction - singleAgent.averageSatisfaction) / singleAgent.averageSatisfaction) * 100
      : 0,
    accuracy: singleAgent.averageAccuracy > 0
      ? ((multiAgent.averageAccuracy - singleAgent.averageAccuracy) / singleAgent.averageAccuracy) * 100
      : 0,
  };

  // Determine recommendation
  let recommendation: 'single-agent' | 'multi-agent' | 'inconclusive' = 'inconclusive';

  if (multiAgent.totalRequests < 10 || singleAgent.totalRequests < 10) {
    recommendation = 'inconclusive'; // Not enough data
  } else {
    // Score based on multiple factors
    let multiAgentScore = 0;
    let singleAgentScore = 0;

    // Response time (lower is better) - 30% weight
    if (multiAgent.averageResponseTime < singleAgent.averageResponseTime) {
      multiAgentScore += 30;
    } else {
      singleAgentScore += 30;
    }

    // Success rate (higher is better) - 25% weight
    if (multiAgent.successRate > singleAgent.successRate) {
      multiAgentScore += 25;
    } else {
      singleAgentScore += 25;
    }

    // Cost (lower is better) - 20% weight
    if (multiAgent.averageCost < singleAgent.averageCost) {
      multiAgentScore += 20;
    } else {
      singleAgentScore += 20;
    }

    // Satisfaction (higher is better) - 15% weight
    if (multiAgent.averageSatisfaction > singleAgent.averageSatisfaction) {
      multiAgentScore += 15;
    } else {
      singleAgentScore += 15;
    }

    // Accuracy (higher is better) - 10% weight
    if (multiAgent.averageAccuracy > singleAgent.averageAccuracy) {
      multiAgentScore += 10;
    } else {
      singleAgentScore += 10;
    }

    if (multiAgentScore > singleAgentScore + 5) {
      recommendation = 'multi-agent';
    } else if (singleAgentScore > multiAgentScore + 5) {
      recommendation = 'single-agent';
    } else {
      recommendation = 'inconclusive';
    }
  }

  return {
    singleAgent,
    multiAgent,
    improvement,
    recommendation,
  };
}

/**
 * Get all test results (for analysis)
 */
export function getAllTestResults(): ABTestResult[] {
  return [...testResults];
}

/**
 * Get test results for a variant
 */
export function getVariantResults(variant: TestVariant): ABTestResult[] {
  return testResults.filter((r) => r.variant === variant);
}

/**
 * Reset all test results (for testing)
 */
export function resetTestResults(): void {
  testResults.length = 0;
  console.log('🔄 [AB-TEST] Test results reset');
}

/**
 * Get A/B test configuration
 */
export function getABTestConfiguration() {
  return getABTestConfig();
}

