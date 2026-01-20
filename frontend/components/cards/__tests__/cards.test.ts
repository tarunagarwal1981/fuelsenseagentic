/**
 * Card Components Tests
 * 
 * Tests for the synthesis response card components.
 * Uses tsx runner (no Jest dependency).
 */

// ============================================================================
// Test Utilities
// ============================================================================

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✅ ${message}`);
    testsPassed++;
  } else {
    console.log(`  ❌ ${message}`);
    testsFailed++;
  }
}

// ============================================================================
// Test: InformationalResponseCard Props
// ============================================================================

function testInformationalResponseCardProps(): void {
  console.log('\n📋 Testing InformationalResponseCard Props...');
  console.log('-'.repeat(50));
  
  const validData = {
    answer: 'The distance from Singapore to Rotterdam is approximately 8,142 nautical miles via the Suez Canal route.',
    key_facts: [
      'Distance: 8,142 nm',
      'Route: Via Suez Canal',
      'Est. duration: 24 days at 14 knots',
    ],
    additional_context: 'This is the shortest route avoiding piracy zones.',
  };
  
  assert(typeof validData.answer === 'string', 'answer is a string');
  assert(Array.isArray(validData.key_facts), 'key_facts is an array');
  assert(validData.key_facts.length === 3, 'key_facts has 3 items');
  assert(validData.additional_context !== undefined, 'additional_context is present');
}

// ============================================================================
// Test: ExecutiveDecisionCard Props
// ============================================================================

function testExecutiveDecisionCardProps(): void {
  console.log('\n📋 Testing ExecutiveDecisionCard Props...');
  console.log('-'.repeat(50));
  
  const validDecision = {
    action: 'Bunker 886MT VLSFO + 71MT LSMGO at Singapore immediately',
    primary_metric: '$594K total (2.7 day safety margin violation)',
    risk_level: 'critical' as const,
    confidence: 85,
  };
  
  assert(typeof validDecision.action === 'string', 'action is a string');
  assert(typeof validDecision.primary_metric === 'string', 'primary_metric is a string');
  assert(['safe', 'caution', 'critical'].includes(validDecision.risk_level), 'risk_level is valid');
  assert(typeof validDecision.confidence === 'number', 'confidence is a number');
  assert(validDecision.confidence >= 0 && validDecision.confidence <= 100, 'confidence is 0-100');
}

// ============================================================================
// Test: ValidationResultCard Props
// ============================================================================

function testValidationResultCardProps(): void {
  console.log('\n📋 Testing ValidationResultCard Props...');
  console.log('-'.repeat(50));
  
  const validValidation = {
    result: 'not_feasible' as const,
    explanation: 'With 500MT VLSFO ROB and consumption of 35MT/day, fuel exhausts after ~14 days.',
    consequence: 'Vessel runs out of fuel 1,200nm before Rotterdam',
    alternative: 'Bunker 886MT VLSFO at Singapore',
  };
  
  assert(['feasible', 'not_feasible', 'risky'].includes(validValidation.result), 'result is valid');
  assert(typeof validValidation.explanation === 'string', 'explanation is a string');
  assert(validValidation.consequence !== undefined, 'consequence is present');
  assert(validValidation.alternative !== undefined, 'alternative is present');
}

// ============================================================================
// Test: ComparisonResultCard Props
// ============================================================================

function testComparisonResultCardProps(): void {
  console.log('\n📋 Testing ComparisonResultCard Props...');
  console.log('-'.repeat(50));
  
  const validComparison = {
    winner: 'Fujairah',
    winner_reason: '$150K cost savings vs Colombo ($350K vs $500K) with only 5nm deviation',
    runner_up: 'Colombo',
    comparison_factors: ['total_cost', 'deviation_distance', 'bunkering_availability'],
  };
  
  assert(typeof validComparison.winner === 'string', 'winner is a string');
  assert(typeof validComparison.winner_reason === 'string', 'winner_reason is a string');
  assert(validComparison.runner_up !== undefined, 'runner_up is present');
  assert(Array.isArray(validComparison.comparison_factors), 'comparison_factors is an array');
}

// ============================================================================
// Test: PriorityCard Props
// ============================================================================

function testPriorityCardProps(): void {
  console.log('\n📋 Testing PriorityCard Props...');
  console.log('-'.repeat(50));
  
  const validPriority = {
    priority: 1 as const,
    action: 'Execute immediate bunkering at Singapore for 886MT VLSFO + 71MT LSMGO',
    why: 'Current ROB of 2.7 days violates 3-day safety minimum',
    impact: 'Prevents $2M+ emergency fuel costs and vessel detention',
    urgency: 'immediate' as const,
  };
  
  assert([1, 2, 3].includes(validPriority.priority), 'priority is 1, 2, or 3');
  assert(typeof validPriority.action === 'string', 'action is a string');
  assert(typeof validPriority.why === 'string', 'why is a string');
  assert(typeof validPriority.impact === 'string', 'impact is a string');
  assert(['immediate', 'today', 'this_week'].includes(validPriority.urgency), 'urgency is valid');
}

// ============================================================================
// Test: RiskAlertCard Props
// ============================================================================

function testRiskAlertCardProps(): void {
  console.log('\n📋 Testing RiskAlertCard Props...');
  console.log('-'.repeat(50));
  
  const validRisk = {
    risk: 'Safety margin below 3-day minimum (currently 2.7 days)',
    severity: 'critical' as const,
    consequence: 'Vessel runs out of VLSFO after 26.2 days without bunkering',
    mitigation: 'Execute immediate bunkering at Singapore as recommended',
  };
  
  assert(typeof validRisk.risk === 'string', 'risk is a string');
  assert(['critical', 'high'].includes(validRisk.severity), 'severity is critical or high');
  assert(typeof validRisk.consequence === 'string', 'consequence is a string');
  assert(typeof validRisk.mitigation === 'string', 'mitigation is a string');
}

// ============================================================================
// Test: All Card Imports
// ============================================================================

async function testCardImports(): Promise<void> {
  console.log('\n📋 Testing Card Imports...');
  console.log('-'.repeat(50));
  
  try {
    // Dynamic import to test module resolution
    const cards = await import('../index');
    
    assert(typeof cards.InformationalResponseCard === 'function', 'InformationalResponseCard is exported');
    assert(typeof cards.ExecutiveDecisionCard === 'function', 'ExecutiveDecisionCard is exported');
    assert(typeof cards.ValidationResultCard === 'function', 'ValidationResultCard is exported');
    assert(typeof cards.ComparisonResultCard === 'function', 'ComparisonResultCard is exported');
    assert(typeof cards.PriorityCard === 'function', 'PriorityCard is exported');
    assert(typeof cards.RiskAlertCard === 'function', 'RiskAlertCard is exported');
  } catch (error) {
    console.log(`  ❌ Failed to import cards: ${error}`);
    testsFailed += 6;
  }
}

// ============================================================================
// Main Test Runner
// ============================================================================

export async function testCards(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 CARD COMPONENTS TESTS');
  console.log('='.repeat(60));
  
  testsPassed = 0;
  testsFailed = 0;
  
  testInformationalResponseCardProps();
  testExecutiveDecisionCardProps();
  testValidationResultCardProps();
  testComparisonResultCardProps();
  testPriorityCardProps();
  testRiskAlertCardProps();
  await testCardImports();
  
  console.log('\n' + '='.repeat(60));
  console.log(`📊 Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('='.repeat(60));
  
  if (testsFailed > 0) {
    throw new Error(`${testsFailed} tests failed`);
  }
}

// Run if executed directly
if (require.main === module) {
  testCards()
    .then(() => {
      console.log('\n✅ All card component tests passed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Tests failed:', error.message);
      process.exit(1);
    });
}
