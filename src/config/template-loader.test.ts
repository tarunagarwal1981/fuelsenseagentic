/**
 * Template Loader Test Script
 * 
 * Run with: npx tsx src/config/template-loader.test.ts
 */

import { TemplateLoader, getTemplateLoader } from './template-loader';

console.log('='.repeat(60));
console.log('TEMPLATE LOADER TESTS');
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

// Create fresh loader for tests
const loader = new TemplateLoader();

console.log('\n--- Test: Load bunker-planning template ---');
test('should load bunker-planning template', () => {
  const template = loader.loadTemplate('bunker-planning');
  return template !== null;
});

test('should have correct query_type', () => {
  const template = loader.loadTemplate('bunker-planning');
  return template?.template.query_type === 'bunker-planning';
});

test('should have more than 5 sections', () => {
  const template = loader.loadTemplate('bunker-planning');
  return (template?.template.sections.length ?? 0) > 5;
});

test('should have business rules', () => {
  const template = loader.loadTemplate('bunker-planning');
  return (template?.template.business_rules?.length ?? 0) > 0;
});

console.log('\n--- Test: Load route-only template ---');
test('should load route-only template', () => {
  const template = loader.loadTemplate('route-only');
  return template !== null;
});

test('should have correct query_type for route-only', () => {
  const template = loader.loadTemplate('route-only');
  return template?.template.query_type === 'route-only';
});

console.log('\n--- Test: Non-existent template ---');
test('should return null for non-existent template', () => {
  const template = loader.loadTemplate('non-existent');
  return template === null;
});

console.log('\n--- Test: Caching ---');
test('should cache templates (same instance returned)', () => {
  loader.clearCache();
  const template1 = loader.loadTemplate('bunker-planning');
  const template2 = loader.loadTemplate('bunker-planning');
  return template1 === template2;
});

console.log('\n--- Test: List templates ---');
test('should list available templates', () => {
  const templates = loader.listTemplates();
  console.log(`   Available templates: ${templates.join(', ')}`);
  return templates.includes('bunker-planning') && templates.includes('route-only');
});

test('should not include _SCHEMA in list', () => {
  const templates = loader.listTemplates();
  return !templates.includes('_SCHEMA');
});

console.log('\n--- Test: Singleton ---');
test('getTemplateLoader returns singleton', () => {
  const loader1 = getTemplateLoader();
  const loader2 = getTemplateLoader();
  return loader1 === loader2;
});

// Summary
console.log('\n' + '='.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  process.exit(1);
}

// Display loaded template details
console.log('\n--- Template Details ---');
const bunkerTemplate = loader.loadTemplate('bunker-planning');
if (bunkerTemplate) {
  console.log('\nBunker Planning Sections:');
  bunkerTemplate.template.sections.forEach((s, i) => {
    console.log(`  ${i + 1}. [Tier ${s.tier}] ${s.title} (${s.visibility})`);
  });
  
  console.log('\nBusiness Rules:');
  bunkerTemplate.template.business_rules?.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.name} → ${r.action} "${r.target}"`);
  });
}
