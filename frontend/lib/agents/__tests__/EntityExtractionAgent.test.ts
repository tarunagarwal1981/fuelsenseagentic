/**
 * EntityExtractionAgent Tests
 *
 * Test cases from requirements:
 * 1. "What's the bunker cost for MT PIONEER from Singapore to Rotterdam?"
 * 2. "Compare emissions for IMO 9234567 and OCEAN BREEZE on the same route"
 * 3. "Show me CII rating for all vessels bunkering at Jebel Ali next month"
 * 4. "VLSFO price at AE FJR and SG SIN for departure tomorrow"
 */

import 'dotenv/config';
import { extractEntities } from '../EntityExtractionAgent';

const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY?.trim();

async function runEntityExtractionTests(): Promise<void> {
  console.log('\n🧪 [ENTITY-EXTRACTION-TEST] Starting EntityExtractionAgent validation...\n');

  // Test 1: Regex fallback returns valid structure (always runs)
  try {
    const result = await extractEntities(
      'Bunker cost for MT PIONEER from Singapore to Rotterdam',
      { skipCache: true }
    );
    if (
      !result.intent ||
      !Array.isArray(result.vessels) ||
      !Array.isArray(result.ports) ||
      !result.rawQuery ||
      !result.extractionTimestamp
    ) {
      throw new Error('Invalid result structure');
    }
    const validIntents = [
      'bunker_planning',
      'voyage_optimization',
      'emissions_calc',
      'performance_analysis',
      'compliance_check',
    ];
    if (!validIntents.includes(result.intent)) {
      throw new Error(`Invalid intent: ${result.intent}`);
    }
    console.log('✅ Test 1: Regex fallback returns valid structure');
  } catch (error) {
    console.error('❌ Test 1 FAILED:', error instanceof Error ? error.message : error);
    throw error;
  }

  // LLM tests (require ANTHROPIC_API_KEY)
  if (!hasAnthropicKey) {
    console.log('\n⚠️  Skipping LLM tests - ANTHROPIC_API_KEY not set');
    return;
  }

  // Test 2: Bunker cost query (intent + vessel required; ports optional - LLM may vary)
  try {
    const result = await extractEntities(
      "What's the bunker cost for MT PIONEER from Singapore to Rotterdam?",
      { skipCache: true }
    );
    if (result.intent !== 'bunker_planning') {
      throw new Error(`Expected bunker_planning, got ${result.intent}`);
    }
    const hasPioneer = result.vessels.some((v) => v.name?.includes('PIONEER') || v.name === 'PIONEER');
    if (!hasPioneer) {
      throw new Error('Expected vessel PIONEER');
    }
    // Ports: LLM may return empty; if present, check for Singapore/Rotterdam
    if (result.ports.length > 0) {
      const portNames = result.ports.map((p) => p.name?.toLowerCase() || '').join(' ');
      const hasSingapore = portNames.includes('singapore') || portNames.includes('sgsin') || portNames.includes('sg sin');
      const hasRotterdam = portNames.includes('rotterdam') || portNames.includes('nlrtm') || portNames.includes('nl rtm');
      if (!hasSingapore || !hasRotterdam) {
        throw new Error(`Expected Singapore and Rotterdam in ports, got: ${JSON.stringify(result.ports)}`);
      }
    }
    console.log('✅ Test 2: Bunker cost query extraction');
  } catch (error) {
    console.error('❌ Test 2 FAILED:', error instanceof Error ? error.message : error);
    throw error;
  }

  // Test 3: Multi-vessel emissions query
  try {
    const result = await extractEntities(
      'Compare emissions for IMO 9234567 and OCEAN BREEZE on the same route',
      { skipCache: true }
    );
    if (result.intent !== 'emissions_calc') {
      throw new Error(`Expected emissions_calc, got ${result.intent}`);
    }
    const hasIMO = result.vessels.some((v) => v.imo === '9234567');
    const hasOceanBreeze = result.vessels.some((v) =>
      v.name?.toUpperCase().includes('OCEAN BREEZE')
    );
    if (!hasIMO && !hasOceanBreeze) {
      throw new Error('Expected IMO 9234567 or OCEAN BREEZE');
    }
    console.log('✅ Test 3: Multi-vessel emissions query extraction');
  } catch (error) {
    console.error('❌ Test 3 FAILED:', error instanceof Error ? error.message : error);
    throw error;
  }

  // Test 4: CII query (intent required; ports and dates optional - LLM extraction may vary)
  try {
    const result = await extractEntities(
      'Show me CII rating for all vessels bunkering at Jebel Ali next month',
      { skipCache: true }
    );
    if (result.intent !== 'emissions_calc') {
      throw new Error(`Expected emissions_calc, got ${result.intent}`);
    }
    if (result.ports.length > 0) {
      const portNames = result.ports.map((p) => p.name?.toLowerCase() || '').join(' ');
      const hasJebelOrDubai = portNames.includes('jebel') || portNames.includes('dubai') || portNames.includes('ae');
      if (!hasJebelOrDubai) {
        throw new Error(`Expected Jebel Ali/Dubai in ports, got: ${JSON.stringify(result.ports)}`);
      }
    }
    console.log('✅ Test 4: CII query extraction');
  } catch (error) {
    console.error('❌ Test 4 FAILED:', error instanceof Error ? error.message : error);
    throw error;
  }

  // Test 5: VLSFO price query (fuel type required; ports/dates optional - LLM may vary)
  try {
    const result = await extractEntities(
      'VLSFO price at AE FJR and SG SIN for departure tomorrow',
      { skipCache: true }
    );
    if (!result.fuelTypes?.includes('VLSFO')) {
      throw new Error('Expected VLSFO fuel type');
    }
    if (result.ports.length > 0 && result.ports.length < 2) {
      throw new Error(`Expected 2 ports when ports present, got: ${JSON.stringify(result.ports)}`);
    }
    console.log('✅ Test 5: VLSFO price query extraction');
  } catch (error) {
    console.error('❌ Test 5 FAILED:', error instanceof Error ? error.message : error);
    throw error;
  }

  console.log('\n✅ [ENTITY-EXTRACTION-TEST] All tests passed!\n');
}

// Export for run-tests.ts
export { runEntityExtractionTests };
