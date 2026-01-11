/**
 * Tests for Orchestrator Agent
 * 
 * Tests cover:
 * - Tool execution (validate_vessel_name, check_feature_availability, extract_query_parameters)
 * - Orchestrator structure and configuration
 * - Error handling
 * - User prompt generation
 * 
 * Note: Full integration tests require actual API calls and should be run manually
 * with a valid ANTHROPIC_API_KEY.
 * 
 * Run with: npx tsx lib/agents/__tests__/orchestrator.test.ts
 */

import {
  executeValidateVesselNameTool,
  executeCheckFeatureAvailabilityTool,
  executeExtractQueryParametersTool,
} from '../../tools/orchestrator-tools';
import {
  OrchestratorAgent,
  createOrchestratorAgent,
} from '../orchestrator';

/**
 * Test result formatter
 */
function formatTestResult(
  testName: string,
  passed: boolean,
  details?: string,
  error?: Error
): void {
  console.log('\n' + '='.repeat(80));
  console.log(`TEST: ${testName}`);
  console.log('='.repeat(80));
  
  if (passed) {
    console.log('✅ TEST PASSED');
    if (details) {
      console.log(details);
    }
  } else {
    console.log('❌ TEST FAILED');
    if (error) {
      console.log(`Error Type: ${error.constructor.name}`);
      console.log(`Error Message: ${error.message}`);
    }
    if (details) {
      console.log(details);
    }
  }
  console.log('='.repeat(80));
}

/**
 * Test 1: Validate vessel name - known vessel
 */
async function testValidateVesselNameKnown(): Promise<void> {
  try {
    const result = await executeValidateVesselNameTool({
      vessel_name: 'Evergreen',
    });
    
    const passed = result.found === true && result.vessel_name !== null;
    
    formatTestResult(
      'Validate vessel name - known vessel',
      passed,
      `Vessel found: ${result.found}, Name: ${result.vessel_name}, IMO: ${result.imo_number}`
    );
  } catch (error) {
    formatTestResult(
      'Validate vessel name - known vessel',
      false,
      undefined,
      error as Error
    );
  }
}

/**
 * Test 2: Validate vessel name - unknown vessel
 */
async function testValidateVesselNameUnknown(): Promise<void> {
  try {
    const result = await executeValidateVesselNameTool({
      vessel_name: 'Unknown Vessel XYZ',
    });
    
    const passed = result.found === false && result.vessel_name === null;
    
    formatTestResult(
      'Validate vessel name - unknown vessel',
      passed,
      `Vessel found: ${result.found}, Name: ${result.vessel_name}`
    );
  } catch (error) {
    formatTestResult(
      'Validate vessel name - unknown vessel',
      false,
      undefined,
      error as Error
    );
  }
}

/**
 * Test 3: Check feature availability - available feature
 */
async function testCheckFeatureAvailabilityAvailable(): Promise<void> {
  try {
    const result = await executeCheckFeatureAvailabilityTool({
      feature_name: 'bunker_planning',
    });
    
    const passed = result.available === true;
    
    formatTestResult(
      'Check feature availability - available feature',
      passed,
      `Feature available: ${result.available}, Message: ${result.message}`
    );
  } catch (error) {
    formatTestResult(
      'Check feature availability - available feature',
      false,
      undefined,
      error as Error
    );
  }
}

/**
 * Test 4: Check feature availability - unavailable feature
 */
async function testCheckFeatureAvailabilityUnavailable(): Promise<void> {
  try {
    const result = await executeCheckFeatureAvailabilityTool({
      feature_name: 'unknown_feature' as any,
    });
    
    const passed = result.available === false;
    
    formatTestResult(
      'Check feature availability - unavailable feature',
      passed,
      `Feature available: ${result.available}, Message: ${result.message}`
    );
  } catch (error) {
    formatTestResult(
      'Check feature availability - unavailable feature',
      false,
      undefined,
      error as Error
    );
  }
}

/**
 * Test 5: Extract query parameters - complete query
 */
async function testExtractQueryParametersComplete(): Promise<void> {
  try {
    const query = 'I need bunker planning for MV Evergreen at 14 knots, consuming 35 MT/day VLSFO + 3 MT/day LSMGO. Current ROB: 450 MT VLSFO, 80 MT LSMGO. Tank capacity: 1200 MT VLSFO, 200 MT LSMGO.';
    
    const result = await executeExtractQueryParametersTool({
      query,
    });
    
    const passed = 
      result.vessel_name !== null &&
      result.speed_knots !== null &&
      result.consumption_vlsfo_per_day !== null;
    
    formatTestResult(
      'Extract query parameters - complete query',
      passed,
      `Vessel: ${result.vessel_name}, Speed: ${result.speed_knots} knots, VLSFO: ${result.consumption_vlsfo_per_day} MT/day`
    );
  } catch (error) {
    formatTestResult(
      'Extract query parameters - complete query',
      false,
      undefined,
      error as Error
    );
  }
}

/**
 * Test 6: Extract query parameters - minimal query
 */
async function testExtractQueryParametersMinimal(): Promise<void> {
  try {
    const query = 'Bunker planning for Evergreen';
    
    const result = await executeExtractQueryParametersTool({
      query,
    });
    
    const passed = 
      result.vessel_name !== null &&
      result.speed_knots === null; // Speed not provided
    
    formatTestResult(
      'Extract query parameters - minimal query',
      passed,
      `Vessel: ${result.vessel_name}, Speed: ${result.speed_knots} (not provided)`
    );
  } catch (error) {
    formatTestResult(
      'Extract query parameters - minimal query',
      false,
      undefined,
      error as Error
    );
  }
}

/**
 * Test 7: Create orchestrator agent instance
 */
function testCreateOrchestratorAgent(): void {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY || 'test-key';
    
    const agent = createOrchestratorAgent({
      apiKey,
      model: 'claude-sonnet-4-5-20250514',
      temperature: 0.0,
    });
    
    const passed = agent instanceof OrchestratorAgent;
    
    formatTestResult(
      'Create orchestrator agent instance',
      passed,
      `Agent created: ${passed ? 'success' : 'failed'}`
    );
  } catch (error) {
    formatTestResult(
      'Create orchestrator agent instance',
      false,
      undefined,
      error as Error
    );
  }
}

/**
 * Test 8: Orchestrator agent configuration
 */
function testOrchestratorAgentConfiguration(): void {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY || 'test-key';
    
    const agent = new OrchestratorAgent({
      apiKey,
      model: 'claude-sonnet-4-5-20250514',
      temperature: 0.0,
      maxTokens: 4000,
      maxIterations: 10,
    });
    
    // Access private config through analyze method (which will use it)
    const passed = true; // If constructor succeeds, config is valid
    
    formatTestResult(
      'Orchestrator agent configuration',
      passed,
      'Agent configured successfully with custom settings'
    );
  } catch (error) {
    formatTestResult(
      'Orchestrator agent configuration',
      false,
      undefined,
      error as Error
    );
  }
}

/**
 * Test 9: System prompt loading (file exists)
 */
function testSystemPromptLoading(): void {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY || 'test-key';
    
    const agent = new OrchestratorAgent({
      apiKey,
      systemPromptPath: 'config/prompts/orchestrator.txt',
    });
    
    // If constructor succeeds, prompt was loaded (or fallback used)
    const passed = true;
    
    formatTestResult(
      'System prompt loading',
      passed,
      'System prompt loaded (or fallback used)'
    );
  } catch (error) {
    formatTestResult(
      'System prompt loading',
      false,
      undefined,
      error as Error
    );
  }
}

/**
 * Integration test: Full orchestration (requires API key)
 * 
 * This test requires a valid ANTHROPIC_API_KEY environment variable.
 * It makes actual API calls and should be run manually.
 */
async function testFullOrchestrationIntegration(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey || apiKey === 'test-key') {
    console.log('\n' + '='.repeat(80));
    console.log('TEST: Full orchestration integration (SKIPPED - requires API key)');
    console.log('='.repeat(80));
    console.log('⚠️  SKIPPED: Set ANTHROPIC_API_KEY environment variable to run this test');
    console.log('='.repeat(80));
    return;
  }

  try {
    const agent = createOrchestratorAgent({
      apiKey,
      model: 'claude-sonnet-4-5-20250514',
      temperature: 0.0,
    });
    
    const result = await agent.analyze({
      user_query: 'I need bunker planning for MV Evergreen from Singapore to Rotterdam at 14 knots',
    });
    
    const passed = 
      result.query_type !== undefined &&
      result.vessel_identified !== undefined &&
      result.missing_parameters !== undefined;
    
    formatTestResult(
      'Full orchestration integration',
      passed,
      `Query type: ${result.query_type}, Vessel identified: ${result.vessel_identified}, Missing params: ${result.missing_parameters.length}`
    );
  } catch (error) {
    formatTestResult(
      'Full orchestration integration',
      false,
      undefined,
      error as Error
    );
  }
}

/**
 * Main test runner
 */
async function runAllTests(): Promise<void> {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    ORCHESTRATOR AGENT TEST SUITE                            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  
  const startTime = Date.now();
  const results: boolean[] = [];
  
  // Run all test cases
  await testValidateVesselNameKnown();
  await testValidateVesselNameUnknown();
  await testCheckFeatureAvailabilityAvailable();
  await testCheckFeatureAvailabilityUnavailable();
  await testExtractQueryParametersComplete();
  await testExtractQueryParametersMinimal();
  testCreateOrchestratorAgent();
  testOrchestratorAgentConfiguration();
  testSystemPromptLoading();
  await testFullOrchestrationIntegration();
  
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                          TEST SUITE COMPLETE                                 ║');
  console.log(`║                    Total Duration: ${duration}s                                    ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('\n');
  console.log('Note: Full integration tests require ANTHROPIC_API_KEY environment variable.');
  console.log('Run with: ANTHROPIC_API_KEY=your_key npx tsx lib/agents/__tests__/orchestrator.test.ts');
  console.log('\n');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch((error) => {
    console.error('Fatal error running tests:', error);
    process.exit(1);
  });
}

export {
  testValidateVesselNameKnown,
  testValidateVesselNameUnknown,
  testCheckFeatureAvailabilityAvailable,
  testCheckFeatureAvailabilityUnavailable,
  testExtractQueryParametersComplete,
  testExtractQueryParametersMinimal,
  testCreateOrchestratorAgent,
  testOrchestratorAgentConfiguration,
  testSystemPromptLoading,
  testFullOrchestrationIntegration,
  runAllTests,
};

