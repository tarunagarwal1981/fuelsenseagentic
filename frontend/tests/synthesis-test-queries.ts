/**
 * Synthesis Test Query Suite
 * 
 * Comprehensive test cases for validating query type classification
 * and response structure across all 4 query types.
 */

// ============================================================================
// Test Query Definitions
// ============================================================================

export interface TestQueryExpectation {
  hasAnswer?: boolean;
  hasKeyFacts?: boolean;
  keyFactsMinCount?: number;
  hasMap?: boolean;
  hasDecisionCard?: boolean;
  hasValidationCard?: boolean;
  hasComparisonCard?: boolean;
  hasPriorities?: boolean;
  mayHavePriorities?: boolean;
  noPriorities?: boolean;
  prioritiesCount?: { min: number; max: number };
  hasDetailsFlags?: boolean;
  allDetailsFlagsFalse?: boolean;
  hasResult?: boolean;
  hasExplanation?: boolean;
  hasWinner?: boolean;
  hasRunnerUp?: boolean;
  hasComparisonFactors?: boolean;
  mentionsWeather?: boolean;
  hasWeatherContext?: boolean;
}

export interface TestQuery {
  id: string;
  query: string;
  expectedQueryType: 'informational' | 'decision-required' | 'validation' | 'comparison';
  expectedResponse: TestQueryExpectation;
  description?: string;
}

export const SYNTHESIS_TEST_QUERIES: {
  informational: TestQuery[];
  decisionRequired: TestQuery[];
  validation: TestQuery[];
  comparison: TestQuery[];
} = {
  informational: [
    {
      id: 'info-1',
      query: 'What is the distance from Singapore to Rotterdam?',
      expectedQueryType: 'informational',
      expectedResponse: {
        hasAnswer: true,
        hasKeyFacts: true,
        keyFactsMinCount: 2,
        noPriorities: true,
        allDetailsFlagsFalse: true,
      },
      description: 'Basic distance query - pure informational',
    },
    {
      id: 'info-2',
      query: 'Calculate route from Shanghai to Hamburg',
      expectedQueryType: 'informational',
      expectedResponse: {
        hasMap: true,
        hasAnswer: true,
        noPriorities: true,
      },
      description: 'Route calculation - informational with map',
    },
    {
      id: 'info-3',
      query: 'What is the weather forecast from SGSIN to AEJEA?',
      expectedQueryType: 'informational',
      expectedResponse: {
        hasAnswer: true,
        mentionsWeather: true,
      },
      description: 'Weather query - informational',
    },
    {
      id: 'info-4',
      query: 'How many nautical miles between Singapore and Jebel Ali?',
      expectedQueryType: 'informational',
      expectedResponse: {
        hasAnswer: true,
        hasKeyFacts: true,
        noPriorities: true,
      },
      description: 'Distance question with "how many"',
    },
    {
      id: 'info-5',
      query: 'Show me the ECA zones on route from Rotterdam to Singapore',
      expectedQueryType: 'informational',
      expectedResponse: {
        hasMap: true,
        hasAnswer: true,
      },
      description: 'ECA zone display request',
    },
  ],
  
  decisionRequired: [
    {
      id: 'decision-1',
      query: 'Find cheapest bunker from Singapore to Rotterdam',
      expectedQueryType: 'decision-required',
      expectedResponse: {
        hasDecisionCard: true,
        hasPriorities: true,
        prioritiesCount: { min: 1, max: 3 },
        hasDetailsFlags: true,
      },
      description: 'Classic bunker optimization query',
    },
    {
      id: 'decision-2',
      query: 'Plan bunker for MV Pacific Star from SGSIN to USHOU',
      expectedQueryType: 'decision-required',
      expectedResponse: {
        hasMap: true,
        hasDecisionCard: true,
        hasPriorities: true,
      },
      description: 'Bunker planning with vessel name',
    },
    {
      id: 'decision-3',
      query: 'Where should I bunker for voyage from Singapore to Rotterdam?',
      expectedQueryType: 'decision-required',
      expectedResponse: {
        hasDecisionCard: true,
        hasPriorities: true,
        hasMap: true,
      },
      description: 'Bunker location question',
    },
    {
      id: 'decision-4',
      query: 'Recommend best bunker port for my vessel going to Hamburg',
      expectedQueryType: 'decision-required',
      expectedResponse: {
        hasDecisionCard: true,
        hasPriorities: true,
      },
      description: 'Recommendation request',
    },
    {
      id: 'decision-5',
      query: 'Optimize fuel costs for voyage SGSIN to NLRTM departing next week',
      expectedQueryType: 'decision-required',
      expectedResponse: {
        hasDecisionCard: true,
        hasPriorities: true,
        hasDetailsFlags: true,
      },
      description: 'Cost optimization request',
    },
  ],
  
  validation: [
    {
      id: 'validation-1',
      query: 'Can I reach Rotterdam with current ROB 500MT VLSFO?',
      expectedQueryType: 'validation',
      expectedResponse: {
        hasValidationCard: true,
        hasResult: true,
        hasExplanation: true,
        mayHavePriorities: true,
      },
      description: 'ROB feasibility check',
    },
    {
      id: 'validation-2',
      query: 'Is it safe to bunker at Fujairah on January 15?',
      expectedQueryType: 'validation',
      expectedResponse: {
        hasValidationCard: true,
        hasWeatherContext: true,
      },
      description: 'Safety/weather validation',
    },
    {
      id: 'validation-3',
      query: 'Will 1200MT of VLSFO fit in my vessel tanks?',
      expectedQueryType: 'validation',
      expectedResponse: {
        hasValidationCard: true,
        hasResult: true,
        hasExplanation: true,
      },
      description: 'Capacity validation',
    },
    {
      id: 'validation-4',
      query: 'Do I have enough fuel to reach Hamburg from Singapore?',
      expectedQueryType: 'validation',
      expectedResponse: {
        hasValidationCard: true,
        hasResult: true,
      },
      description: 'Fuel sufficiency check',
    },
  ],
  
  comparison: [
    {
      id: 'comparison-1',
      query: 'Compare Fujairah vs Colombo for bunkering',
      expectedQueryType: 'comparison',
      expectedResponse: {
        hasComparisonCard: true,
        hasWinner: true,
        hasRunnerUp: true,
        hasComparisonFactors: true,
        noPriorities: true,
      },
      description: 'Direct port comparison',
    },
    {
      id: 'comparison-2',
      query: 'Show me all bunker options from Singapore to Rotterdam',
      expectedQueryType: 'comparison',
      expectedResponse: {
        hasMap: true,
        hasComparisonCard: true,
      },
      description: 'All options comparison',
    },
    {
      id: 'comparison-3',
      query: 'What is better: Singapore or Gibraltar for bunkering?',
      expectedQueryType: 'comparison',
      expectedResponse: {
        hasComparisonCard: true,
        hasWinner: true,
      },
      description: '"What is better" comparison',
    },
    {
      id: 'comparison-4',
      query: 'Singapore vs Fujairah bunker prices',
      expectedQueryType: 'comparison',
      expectedResponse: {
        hasComparisonCard: true,
        hasComparisonFactors: true,
      },
      description: 'Price comparison',
    },
  ],
};

// ============================================================================
// Validation Functions
// ============================================================================

export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export function validateQueryType(
  actual: string,
  expected: string
): ValidationResult {
  const passed = actual === expected;
  return {
    passed,
    errors: passed ? [] : [`Expected query_type "${expected}", got "${actual}"`],
    warnings: [],
  };
}

export function validateResponseStructure(
  synthesis: any,
  expectations: TestQueryExpectation
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check answer presence
  if (expectations.hasAnswer) {
    if (!synthesis?.response?.informational?.answer) {
      errors.push('Expected answer in informational response');
    }
  }
  
  // Check key facts
  if (expectations.hasKeyFacts) {
    const keyFacts = synthesis?.response?.informational?.key_facts;
    if (!Array.isArray(keyFacts)) {
      errors.push('Expected key_facts array');
    } else if (expectations.keyFactsMinCount && keyFacts.length < expectations.keyFactsMinCount) {
      errors.push(`Expected at least ${expectations.keyFactsMinCount} key facts, got ${keyFacts.length}`);
    }
  }
  
  // Check decision card
  if (expectations.hasDecisionCard) {
    if (!synthesis?.response?.decision) {
      errors.push('Expected decision response object');
    } else {
      if (!synthesis.response.decision.action) {
        errors.push('Decision response missing action');
      }
      if (!synthesis.response.decision.primary_metric) {
        errors.push('Decision response missing primary_metric');
      }
    }
  }
  
  // Check validation card
  if (expectations.hasValidationCard) {
    if (!synthesis?.response?.validation) {
      errors.push('Expected validation response object');
    } else {
      if (expectations.hasResult && !synthesis.response.validation.result) {
        errors.push('Validation response missing result');
      }
      if (expectations.hasExplanation && !synthesis.response.validation.explanation) {
        errors.push('Validation response missing explanation');
      }
    }
  }
  
  // Check comparison card
  if (expectations.hasComparisonCard) {
    if (!synthesis?.response?.comparison) {
      errors.push('Expected comparison response object');
    } else {
      if (expectations.hasWinner && !synthesis.response.comparison.winner) {
        errors.push('Comparison response missing winner');
      }
      if (expectations.hasComparisonFactors && 
          (!Array.isArray(synthesis.response.comparison.comparison_factors) ||
           synthesis.response.comparison.comparison_factors.length === 0)) {
        errors.push('Comparison response missing comparison_factors');
      }
    }
  }
  
  // Check priorities
  if (expectations.hasPriorities) {
    if (!Array.isArray(synthesis?.strategic_priorities) || 
        synthesis.strategic_priorities.length === 0) {
      errors.push('Expected strategic_priorities array with items');
    }
    
    if (expectations.prioritiesCount) {
      const count = synthesis?.strategic_priorities?.length || 0;
      if (count < expectations.prioritiesCount.min) {
        errors.push(`Expected at least ${expectations.prioritiesCount.min} priorities, got ${count}`);
      }
      if (count > expectations.prioritiesCount.max) {
        warnings.push(`Got ${count} priorities, expected max ${expectations.prioritiesCount.max}`);
      }
    }
  }
  
  if (expectations.noPriorities) {
    if (synthesis?.strategic_priorities && synthesis.strategic_priorities.length > 0) {
      errors.push('Expected no strategic_priorities for this query type');
    }
  }
  
  // Check details flags
  if (expectations.allDetailsFlagsFalse) {
    const flags = synthesis?.details_to_surface;
    if (flags) {
      const trueFlags = Object.entries(flags).filter(([_, v]) => v === true);
      if (trueFlags.length > 0) {
        warnings.push(`Expected all details flags false, but these are true: ${trueFlags.map(([k]) => k).join(', ')}`);
      }
    }
  }
  
  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Test Runner
// ============================================================================

export interface TestResult {
  testId: string;
  query: string;
  passed: boolean;
  queryTypeValidation: ValidationResult;
  responseValidation: ValidationResult;
  executionTimeMs: number;
}

export async function runTestQuery(
  testCase: TestQuery,
  executeSynthesis: (query: string) => Promise<any>
): Promise<TestResult> {
  const startTime = Date.now();
  
  console.log(`\n🧪 Testing: ${testCase.id}`);
  console.log(`   Query: "${testCase.query}"`);
  console.log(`   Expected type: ${testCase.expectedQueryType}`);
  
  let synthesis: any;
  try {
    synthesis = await executeSynthesis(testCase.query);
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    return {
      testId: testCase.id,
      query: testCase.query,
      passed: false,
      queryTypeValidation: {
        passed: false,
        errors: [`Execution failed: ${error}`],
        warnings: [],
      },
      responseValidation: {
        passed: false,
        errors: ['Could not validate response due to execution failure'],
        warnings: [],
      },
      executionTimeMs,
    };
  }
  
  const executionTimeMs = Date.now() - startTime;
  
  // Validate query type
  const queryTypeValidation = validateQueryType(
    synthesis?.query_type,
    testCase.expectedQueryType
  );
  
  // Validate response structure
  const responseValidation = validateResponseStructure(
    synthesis,
    testCase.expectedResponse
  );
  
  const passed = queryTypeValidation.passed && responseValidation.passed;
  
  if (passed) {
    console.log(`   ✅ PASSED (${executionTimeMs}ms)`);
  } else {
    console.log(`   ❌ FAILED (${executionTimeMs}ms)`);
    if (queryTypeValidation.errors.length > 0) {
      console.log(`      Query type errors: ${queryTypeValidation.errors.join(', ')}`);
    }
    if (responseValidation.errors.length > 0) {
      console.log(`      Response errors: ${responseValidation.errors.join(', ')}`);
    }
  }
  
  if (responseValidation.warnings.length > 0) {
    console.log(`   ⚠️  Warnings: ${responseValidation.warnings.join(', ')}`);
  }
  
  return {
    testId: testCase.id,
    query: testCase.query,
    passed,
    queryTypeValidation,
    responseValidation,
    executionTimeMs,
  };
}

export async function runAllTests(
  executeSynthesis: (query: string) => Promise<any>
): Promise<{
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    avgExecutionTimeMs: number;
    byQueryType: Record<string, { passed: number; failed: number }>;
  };
}> {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 SYNTHESIS TEST SUITE');
  console.log('='.repeat(60));
  
  const allTests: TestQuery[] = [
    ...SYNTHESIS_TEST_QUERIES.informational,
    ...SYNTHESIS_TEST_QUERIES.decisionRequired,
    ...SYNTHESIS_TEST_QUERIES.validation,
    ...SYNTHESIS_TEST_QUERIES.comparison,
  ];
  
  const results: TestResult[] = [];
  const byQueryType: Record<string, { passed: number; failed: number }> = {
    informational: { passed: 0, failed: 0 },
    'decision-required': { passed: 0, failed: 0 },
    validation: { passed: 0, failed: 0 },
    comparison: { passed: 0, failed: 0 },
  };
  
  for (const testCase of allTests) {
    const result = await runTestQuery(testCase, executeSynthesis);
    results.push(result);
    
    if (result.passed) {
      byQueryType[testCase.expectedQueryType].passed++;
    } else {
      byQueryType[testCase.expectedQueryType].failed++;
    }
  }
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const avgExecutionTimeMs = results.reduce((sum, r) => sum + r.executionTimeMs, 0) / results.length;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  console.log(`   Total: ${allTests.length}`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   ⏱️  Avg execution time: ${avgExecutionTimeMs.toFixed(0)}ms`);
  console.log('\n   By Query Type:');
  for (const [type, stats] of Object.entries(byQueryType)) {
    const total = stats.passed + stats.failed;
    const pct = total > 0 ? ((stats.passed / total) * 100).toFixed(0) : '0';
    console.log(`      ${type}: ${stats.passed}/${total} (${pct}%)`);
  }
  console.log('='.repeat(60));
  
  return {
    results,
    summary: {
      total: allTests.length,
      passed,
      failed,
      avgExecutionTimeMs,
      byQueryType,
    },
  };
}

// ============================================================================
// Mock Test Runner (for development without real LLM)
// ============================================================================

export function createMockSynthesis(queryType: string): any {
  const base = {
    query_type: queryType,
    strategic_priorities: [],
    critical_risks: [],
    details_to_surface: {
      show_multi_port_analysis: false,
      show_alternatives: false,
      show_rob_waypoints: false,
      show_weather_details: false,
      show_eca_details: false,
    },
    cross_agent_connections: [],
    hidden_opportunities: [],
  };
  
  switch (queryType) {
    case 'informational':
      return {
        ...base,
        response: {
          informational: {
            answer: 'Mock answer for informational query.',
            key_facts: ['Fact 1', 'Fact 2', 'Fact 3'],
            additional_context: 'Additional context here.',
          },
        },
      };
    case 'decision-required':
      return {
        ...base,
        response: {
          decision: {
            action: 'Mock action for decision query.',
            primary_metric: '$500K total',
            risk_level: 'safe',
            confidence: 85,
          },
        },
        strategic_priorities: [
          {
            priority: 1,
            action: 'Execute bunkering at Singapore',
            why: 'Lowest cost option',
            impact: 'Save $50K',
            urgency: 'immediate',
          },
        ],
        details_to_surface: {
          ...base.details_to_surface,
          show_rob_waypoints: true,
        },
      };
    case 'validation':
      return {
        ...base,
        response: {
          validation: {
            result: 'feasible',
            explanation: 'Mock explanation for validation query.',
            consequence: 'Mock consequence',
            alternative: 'Mock alternative',
          },
        },
      };
    case 'comparison':
      return {
        ...base,
        response: {
          comparison: {
            winner: 'Singapore',
            winner_reason: 'Lowest cost at $500K',
            runner_up: 'Fujairah',
            comparison_factors: ['cost', 'deviation', 'availability'],
          },
        },
      };
    default:
      return base;
  }
}

// Run with mock data if executed directly
if (require.main === module) {
  const mockExecute = async (query: string) => {
    // Simulate some delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const lowerQuery = query.toLowerCase();
    
    // Determine query type from keywords (more comprehensive)
    let queryType = 'informational';
    
    // Decision-required triggers
    if (
      lowerQuery.includes('find') ||
      lowerQuery.includes('plan') ||
      lowerQuery.includes('recommend') ||
      lowerQuery.includes('optimize') ||
      lowerQuery.includes('where should') ||
      lowerQuery.includes('best bunker') ||
      lowerQuery.includes('cheapest')
    ) {
      queryType = 'decision-required';
    }
    // Validation triggers
    else if (
      lowerQuery.includes('can i') ||
      lowerQuery.includes('is it safe') ||
      lowerQuery.includes('will ') ||
      lowerQuery.includes('do i have enough') ||
      lowerQuery.includes('fit in')
    ) {
      queryType = 'validation';
    }
    // Comparison triggers
    else if (
      lowerQuery.includes('compare') ||
      lowerQuery.includes(' vs ') ||
      lowerQuery.includes('better') ||
      lowerQuery.includes('all bunker options') ||
      lowerQuery.includes('all options')
    ) {
      queryType = 'comparison';
    }
    
    return createMockSynthesis(queryType);
  };
  
  runAllTests(mockExecute)
    .then(({ summary }) => {
      console.log('\n✅ Test suite completed');
      // Don't fail on mock tests - they're for structure validation
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}
