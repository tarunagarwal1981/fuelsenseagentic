/**
 * Template-Aware Formatter Test Script
 * 
 * Run with: npx tsx frontend/lib/formatters/template-aware-formatter.test.ts
 */

import { TemplateLoader, getTemplateLoader } from '../config/template-loader';
import { formatResponseWithTemplate } from './template-aware-formatter';
import { extractContent, getNestedValue } from './content-extractors';
import type { MultiAgentState } from '../multi-agent/state';

console.log('='.repeat(60));
console.log('TEMPLATE-AWARE FORMATTER TESTS');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean) {
  try {
    const result = fn();
    if (result) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.log(`❌ ${name} - assertion failed`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ ${name} - ${error}`);
    failed++;
  }
}

// ============================================================================
// Template Loader Tests
// ============================================================================

console.log('\n--- Template Loader Tests ---');

const loader = new TemplateLoader();

test('should load bunker-planning template', () => {
  const result = loader.loadTemplate('bunker-planning');
  return result.exists && result.template !== undefined;
});

test('should load route-only template', () => {
  const result = loader.loadTemplate('route-only');
  return result.exists && result.template !== undefined;
});

test('should return exists: false for non-existent template', () => {
  const result = loader.loadTemplate('non-existent-template');
  return !result.exists && result.error !== undefined;
});

test('should list available templates', () => {
  const templates = loader.listTemplates();
  return templates.includes('bunker-planning') && templates.includes('route-only');
});

// ============================================================================
// Formatter Tests with Mock State
// ============================================================================

console.log('\n--- Formatter Tests with Mock State ---');

// Create a mock state for testing
function createMockState(overrides: Partial<MultiAgentState> = {}): MultiAgentState {
  return {
    messages: [],
    next_agent: '',
    agent_context: null,
    agent_call_counts: {},
    selected_route_id: null,
    route_data: {
      distance_nm: 5000,
      estimated_hours: 240,
      waypoints: [],
      route_type: 'Direct',
      origin_port_code: 'SGSIN',
      destination_port_code: 'NLRTM',
    },
    vessel_timeline: null,
    weather_forecast: null,
    weather_consumption: null,
    port_weather_status: null,
    weather_agent_partial: false,
    standalone_port_weather: null,
    bunker_ports: [
      { port_code: 'AEJEA', port_name: 'Fujairah', coordinates: { lat: 25.1, lon: 56.4 } } as any,
      { port_code: 'LKCMB', port_name: 'Colombo', coordinates: { lat: 6.9, lon: 79.8 } } as any,
    ],
    port_prices: null,
    bunker_analysis: {
      recommendations: [
        {
          port_code: 'AEJEA',
          port_name: 'Fujairah',
          distance_from_route_nm: 5,
          fuel_cost_usd: 350000,
          deviation_cost_usd: 500,
          total_cost_usd: 350500,
          rank: 1,
        },
        {
          port_code: 'LKCMB',
          port_name: 'Colombo',
          distance_from_route_nm: 50,
          fuel_cost_usd: 340000,
          deviation_cost_usd: 15000,
          total_cost_usd: 355000,
          rank: 2,
        },
      ],
      best_option: {
        port_code: 'AEJEA',
        port_name: 'Fujairah',
        distance_from_route_nm: 5,
        fuel_cost_usd: 350000,
        deviation_cost_usd: 500,
        total_cost_usd: 350500,
        rank: 1,
      },
      worst_option: {
        port_code: 'LKCMB',
        port_name: 'Colombo',
        distance_from_route_nm: 50,
        fuel_cost_usd: 340000,
        deviation_cost_usd: 15000,
        total_cost_usd: 355000,
        rank: 2,
      },
      max_savings_usd: 4500,
      analysis_summary: 'Fujairah is the best option',
    },
    compliance_data: null,
    vessel_consumption: null,
    rob_tracking: null,
    rob_waypoints: null,
    rob_safety_status: null,
    eca_consumption: null,
    eca_summary: null,
    vessel_name: 'MV Test Vessel',
    vessel_profile: null,
    final_recommendation: null,
    formatted_response: null,
    synthesized_insights: null,
    agent_errors: {},
    agent_status: {
      bunker_agent: 'success',
      route_agent: 'success',
    },
    ...overrides,
  } as MultiAgentState;
}

test('should format response with bunker-planning template', () => {
  const state = createMockState();
  const response = formatResponseWithTemplate(state, 'bunker-planning');
  
  return (
    response.template_metadata !== undefined &&
    response.template_metadata.query_type === 'bunker-planning' &&
    response.template_metadata.template_name === 'Bunker Planning Response'
  );
});

test('should auto-detect query type as bunker-planning', () => {
  const state = createMockState({
    agent_status: { bunker_agent: 'success', route_agent: 'success' },
  });
  const response = formatResponseWithTemplate(state);
  
  return response.template_metadata?.query_type === 'bunker-planning';
});

test('should auto-detect query type as route-only', () => {
  const state = createMockState({
    agent_status: { route_agent: 'success' },
    bunker_analysis: null,
        multi_bunker_plan: null,
  });
  const response = formatResponseWithTemplate(state);
  
  return response.template_metadata?.query_type === 'route-only';
});

test('should organize sections by tier', () => {
  const state = createMockState();
  const response = formatResponseWithTemplate(state, 'bunker-planning');
  
  return (
    response.sections_by_tier !== undefined &&
    Array.isArray(response.sections_by_tier.tier_1_visible) &&
    Array.isArray(response.sections_by_tier.tier_2_expandable) &&
    Array.isArray(response.sections_by_tier.tier_3_technical)
  );
});

test('should have tier 1 sections', () => {
  const state = createMockState();
  const response = formatResponseWithTemplate(state, 'bunker-planning');
  
  return (response.sections_by_tier?.tier_1_visible?.length ?? 0) > 0;
});

test('should include text output', () => {
  const state = createMockState();
  const response = formatResponseWithTemplate(state, 'bunker-planning');
  
  return response.text !== undefined && response.text.length > 0;
});

test('should preserve structured data from existing formatter', () => {
  const state = createMockState();
  const response = formatResponseWithTemplate(state, 'bunker-planning');
  
  return response.structured !== undefined;
});

test('should fallback to default when template not found', () => {
  const state = createMockState();
  const response = formatResponseWithTemplate(state, 'non-existent-template');
  
  return (
    response.template_metadata?.template_name === 'default' &&
    response.template_metadata?.sections_count === 0
  );
});

// ============================================================================
// Content Extractor Tests
// ============================================================================

console.log('\n--- Content Extractor Tests ---');

test('getNestedValue should extract simple path', () => {
  const obj = { route_data: { distance_nm: 5000 } };
  const value = getNestedValue(obj, 'route_data.distance_nm');
  return value === 5000;
});

test('getNestedValue should extract array index', () => {
  const obj = { recommendations: [{ port_name: 'Fujairah' }, { port_name: 'Colombo' }] };
  const value = getNestedValue(obj, 'recommendations[1].port_name');
  return value === 'Colombo';
});

test('getNestedValue should return null for missing path', () => {
  const obj = { route_data: { distance_nm: 5000 } };
  const value = getNestedValue(obj, 'missing.path');
  return value === null;
});

test('extractContent should extract bunker_analysis', () => {
  const state = createMockState();
  const content = extractContent('bunker_analysis', state);
  return content.includes('Fujairah') && content.includes('Recommended Port');
});

test('extractContent should handle array paths', () => {
  const state = createMockState();
  const content = extractContent(['vessel_profile', 'route_data'], state);
  // Should return content (even if empty string due to null profile)
  return typeof content === 'string';
});

test('extractContent should format as comparison_table', () => {
  const state = createMockState();
  const content = extractContent('bunker_ports', state, 'comparison_table');
  // Should return a markdown table
  return content.includes('|') && content.includes('Port');
});

// ============================================================================
// Business Rules Tests
// ============================================================================

console.log('\n--- Business Rules Tests ---');

test('should apply safety warning rule when voyage unsafe', () => {
  const state = createMockState({
    rob_safety_status: {
      overall_safe: false,
      minimum_rob_days: 0.5,
      violations: ['ROB below safety margin at waypoint 3'],
    },
  });
  const response = formatResponseWithTemplate(state, 'bunker-planning');
  
  // Check that rules were applied
  return (response.template_metadata?.rules_applied ?? 0) > 0;
});

test('should hide ECA section when no ECA zones', () => {
  const state = createMockState({
    compliance_data: null,
  });
  const response = formatResponseWithTemplate(state, 'bunker-planning');
  
  // ECA section should not be in tier 2
  const hasECASection = response.sections_by_tier?.tier_2_expandable?.some(
    s => s.id === 'eca_compliance_summary'
  );
  
  return !hasECASection;
});

// ============================================================================
// Content Rendering Tests
// ============================================================================

console.log('\n--- Content Rendering Tests ---');

test('should render primary_recommendation section with port name', () => {
  const state = createMockState();
  const response = formatResponseWithTemplate(state, 'bunker-planning');
  
  // Find the primary recommendation section
  const primaryRec = response.sections_by_tier?.tier_1_visible?.find(
    s => s.id === 'primary_recommendation'
  );
  
  return primaryRec !== undefined && primaryRec.content.includes('Fujairah');
});

test('should render cost_summary section with costs', () => {
  const state = createMockState();
  const response = formatResponseWithTemplate(state, 'bunker-planning');
  
  // Find the cost summary section
  const costSummary = response.sections_by_tier?.tier_1_visible?.find(
    s => s.id === 'cost_summary'
  );
  
  return costSummary !== undefined && costSummary.content.includes('$');
});

test('should render route_summary for route-only template', () => {
  const state = createMockState({
    agent_status: { route_agent: 'success' },
    bunker_analysis: null,
        multi_bunker_plan: null,
  });
  const response = formatResponseWithTemplate(state, 'route-only');
  
  // Should have route summary in tier 1
  const routeSummary = response.sections_by_tier?.tier_1_visible?.find(
    s => s.id === 'route_summary'
  );
  
  return routeSummary !== undefined && routeSummary.content.includes('5,000');
});

// ============================================================================
// Insight Extraction Tests
// ============================================================================

console.log('\n--- Insight Extraction Tests ---');

test('should include insights array in response', () => {
  const state = createMockState();
  const response = formatResponseWithTemplate(state, 'bunker-planning');
  
  return response.insights !== undefined && Array.isArray(response.insights);
});

test('should extract cost savings insight when max_savings > 5000', () => {
  const state = createMockState({
    bunker_analysis: {
      ...createMockState().bunker_analysis!,
      max_savings_usd: 10000,
    },
  });
  const response = formatResponseWithTemplate(state, 'bunker-planning');
  
  const savingsInsight = response.insights?.find(i => i.id === 'significant_cost_savings');
  return savingsInsight !== undefined;
});

test('should extract critical insight for very low safety margin', () => {
  const state = createMockState({
    rob_safety_status: {
      overall_safe: false,
      minimum_rob_days: 1.5,
      violations: ['Margin below minimum'],
    },
  });
  const response = formatResponseWithTemplate(state, 'bunker-planning');
  
  const criticalInsight = response.insights?.find(i => 
    i.id === 'very_low_safety_margin' && i.priority === 'critical'
  );
  return criticalInsight !== undefined;
});

test('should extract low safety margin insight (3-5 days)', () => {
  const state = createMockState({
    rob_safety_status: {
      overall_safe: true,
      minimum_rob_days: 4.0,
      violations: [],
    },
  });
  const response = formatResponseWithTemplate(state, 'bunker-planning');
  
  const lowMarginInsight = response.insights?.find(i => i.id === 'low_safety_margin');
  return lowMarginInsight !== undefined;
});

test('should extract departure port optimal insight', () => {
  const state = createMockState({
    bunker_analysis: {
      ...createMockState().bunker_analysis!,
      best_option: {
        ...createMockState().bunker_analysis!.best_option,
        distance_from_route_nm: 2,
      },
    },
  });
  const response = formatResponseWithTemplate(state, 'bunker-planning');
  
  const optimalInsight = response.insights?.find(i => i.id === 'departure_port_optimal');
  return optimalInsight !== undefined;
});

test('should sort insights by priority (critical first)', () => {
  const state = createMockState({
    rob_safety_status: {
      overall_safe: false,
      minimum_rob_days: 1.0,
      violations: ['Critical violation'],
    },
    bunker_analysis: {
      ...createMockState().bunker_analysis!,
      max_savings_usd: 10000,
    },
  });
  const response = formatResponseWithTemplate(state, 'bunker-planning');
  
  if (!response.insights || response.insights.length < 2) return false;
  
  // First insight should be critical
  return response.insights[0].priority === 'critical';
});

test('should prepend critical insights to text output', () => {
  const state = createMockState({
    rob_safety_status: {
      overall_safe: false,
      minimum_rob_days: 1.0,
      violations: ['Critical violation'],
    },
  });
  const response = formatResponseWithTemplate(state, 'bunker-planning');
  
  // Text should start with critical alerts section
  return response.text?.includes('Critical Alerts') || response.text?.includes('CRITICAL');
});

// ============================================================================
// Summary
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  process.exit(1);
}

// ============================================================================
// Display Sample Output
// ============================================================================

console.log('\n--- Sample Output ---');

const sampleState = createMockState();
const sampleResponse = formatResponseWithTemplate(sampleState, 'bunker-planning');

console.log('\nTemplate Metadata:');
console.log(JSON.stringify(sampleResponse.template_metadata, null, 2));

console.log('\nSections by Tier:');
console.log(`  Tier 1 (Visible): ${sampleResponse.sections_by_tier?.tier_1_visible?.length || 0} sections`);
sampleResponse.sections_by_tier?.tier_1_visible?.forEach(s => {
  console.log(`    - ${s.title} (${s.word_count} words)`);
});

console.log(`  Tier 2 (Expandable): ${sampleResponse.sections_by_tier?.tier_2_expandable?.length || 0} sections`);
sampleResponse.sections_by_tier?.tier_2_expandable?.forEach(s => {
  console.log(`    - ${s.title} (${s.word_count} words, ${s.collapsed ? 'collapsed' : 'expanded'})`);
});

console.log(`  Tier 3 (Technical): ${sampleResponse.sections_by_tier?.tier_3_technical?.length || 0} sections`);
sampleResponse.sections_by_tier?.tier_3_technical?.forEach(s => {
  console.log(`    - ${s.title} (${s.word_count} words, ${s.collapsed ? 'collapsed' : 'expanded'})`);
});

console.log('\nInsights Extracted:');
console.log(`  Total: ${sampleResponse.insights?.length || 0} insights`);
sampleResponse.insights?.forEach(insight => {
  console.log(`    - [${insight.priority.toUpperCase()}] ${insight.id}: ${insight.message.substring(0, 60)}...`);
});

console.log('\nText Output Preview (first 500 chars):');
console.log(sampleResponse.text?.substring(0, 500) + '...');
