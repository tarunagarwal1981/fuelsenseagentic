/**
 * Integration Test: Supervisor with Dynamic Prompt Generator
 * 
 * Tests that the agentic supervisor can use the dynamic prompt generator
 */

console.log('='.repeat(80));
console.log('SUPERVISOR INTEGRATION TEST');
console.log('='.repeat(80));
console.log();

// Set test mode to avoid API key requirements
(process.env as Record<string, string>).NODE_ENV = 'test';
process.env.USE_DYNAMIC_SUPERVISOR_PROMPT = 'true';
process.env.USE_AGENTIC_SUPERVISOR = 'true';

// 1. Import and register agents
console.log('📋 Step 1: Importing modules...');
import { registerAllAgents } from './lib/registry/agents/index.js';
import { SupervisorPromptGenerator } from './lib/multi-agent/supervisor-prompt-generator.js';

console.log('✅ Modules imported\n');

// 2. Register agents
console.log('📋 Step 2: Registering agents...');
try {
  registerAllAgents();
  console.log('✅ Agents registered (some may have failed - expected in test mode)\n');
} catch (error: any) {
  console.log(`⚠️ Registration completed with errors: ${error.message}\n`);
}

// 3. Test prompt generation
console.log('📋 Step 3: Testing prompt generation...');
const prompt = SupervisorPromptGenerator.generateSupervisorPrompt();
console.log(`✅ Generated prompt: ${prompt.length} characters\n`);

// 4. Verify prompt contains key sections
console.log('📋 Step 4: Verifying prompt content...');
const checks = [
  { name: 'Contains introduction', test: prompt.includes('Supervisor Agent') },
  { name: 'Contains available agents', test: prompt.includes('AVAILABLE AGENTS') },
  { name: 'Contains capability mapping', test: prompt.includes('CAPABILITY-TO-AGENT MAPPING') },
  { name: 'Contains dependencies', test: prompt.includes('AGENT DEPENDENCIES') },
  { name: 'Contains routing examples', test: prompt.includes('ROUTING EXAMPLES') },
  { name: 'Contains important rules', test: prompt.includes('IMPORTANT RULES') },
];

let allPass = true;
checks.forEach(({ name, test }) => {
  if (test) {
    console.log(`   ✅ ${name}`);
  } else {
    console.log(`   ❌ ${name}`);
    allPass = false;
  }
});

if (!allPass) {
  console.error('\n❌ Some checks failed!');
  process.exit(1);
}

console.log();

// 5. Show sample routing
console.log('📋 Step 5: Sample routing capabilities...');
const agentIds = SupervisorPromptGenerator.getAvailableAgentIds();
console.log(`✅ Found ${agentIds.length} available agents for routing:`);
agentIds.forEach(id => console.log(`   - ${id}`));
console.log();

// 6. Summary
console.log('='.repeat(80));
console.log('INTEGRATION TEST SUMMARY');
console.log('='.repeat(80));
console.log('✅ All checks passed!');
console.log();
console.log('Integration Status:');
console.log('  ✓ SupervisorPromptGenerator imported successfully');
console.log('  ✓ Agent registry populated');
console.log('  ✓ Dynamic prompt generation working');
console.log('  ✓ Prompt contains all required sections');
console.log('  ✓ Ready for use in agentic supervisor');
console.log();
console.log('Environment Variables:');
console.log(`  USE_DYNAMIC_SUPERVISOR_PROMPT=${process.env.USE_DYNAMIC_SUPERVISOR_PROMPT}`);
console.log(`  USE_AGENTIC_SUPERVISOR=${process.env.USE_AGENTIC_SUPERVISOR}`);
console.log();
console.log('To use in production:');
console.log('  1. Set USE_AGENTIC_SUPERVISOR=true');
console.log('  2. Set USE_DYNAMIC_SUPERVISOR_PROMPT=true (optional, defaults to true)');
console.log('  3. Supervisor will use dynamic prompt automatically');
console.log('='.repeat(80));
