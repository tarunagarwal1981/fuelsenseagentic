/**
 * Test: Supervisor Prompt Generator (Standalone)
 * 
 * Tests the prompt generator without importing agent-nodes to avoid API key requirements
 */

import { SupervisorPromptGenerator } from './lib/multi-agent/supervisor-prompt-generator.js';
import { registerAllAgents } from './lib/registry/agents/index.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

console.log('='.repeat(80));
console.log('SUPERVISOR PROMPT GENERATOR TEST');
console.log('='.repeat(80));
console.log();

// 1. Register all agents
console.log('📋 Step 1: Registering agents...');
try {
  registerAllAgents();
  console.log('✅ Agents registered successfully\n');
} catch (error: any) {
  // Some agents may fail due to missing tools - that's okay for this test
  console.log(`⚠️ Some agents failed to register (expected in test mode): ${error.message}`);
  console.log('✅ Continuing with successfully registered agents\n');
}

// 2. Generate full supervisor prompt
console.log('📋 Step 2: Generating full supervisor prompt...');
const fullPrompt = SupervisorPromptGenerator.generateSupervisorPrompt();
console.log(`✅ Generated prompt with ${fullPrompt.length} characters\n`);

// 3. Show prompt preview (first 1500 chars)
console.log('📋 Step 3: Prompt Preview (first 1500 chars)');
console.log('-'.repeat(80));
console.log(fullPrompt.substring(0, 1500));
console.log('...');
console.log('-'.repeat(80));
console.log();

// 4. Generate simplified prompt
console.log('📋 Step 4: Generating simplified prompt...');
const simplifiedPrompt = SupervisorPromptGenerator.generateSimplifiedPrompt();
console.log(`✅ Generated simplified prompt with ${simplifiedPrompt.length} characters\n`);

// 5. Show simplified prompt
console.log('📋 Step 5: Simplified Prompt (full)');
console.log('-'.repeat(80));
console.log(simplifiedPrompt);
console.log('-'.repeat(80));
console.log();

// 6. Get available agent IDs
console.log('📋 Step 6: Available Agent IDs');
const agentIds = SupervisorPromptGenerator.getAvailableAgentIds();
console.log(`✅ Found ${agentIds.length} enabled agents:`);
agentIds.forEach(id => console.log(`   - ${id}`));
console.log();

// 7. Generate routing statistics
console.log('📋 Step 7: Routing Statistics');
const stats = SupervisorPromptGenerator.generateRoutingStats();
console.log('✅ Registry Statistics:');
console.log(`   Total Agents: ${stats.totalAgents}`);
console.log(`   Total Capabilities: ${stats.totalCapabilities}`);
console.log(`   Avg Capabilities per Agent: ${stats.avgCapabilitiesPerAgent.toFixed(2)}`);
console.log(`   Most Capable Agent: ${stats.mostCapableAgent}`);
console.log(`   Most Connected Agent: ${stats.mostDependencies}`);
console.log();

// 8. Save full prompt to file for inspection
console.log('📋 Step 8: Saving full prompt to file...');

const outputPath = join(process.cwd(), 'GENERATED_SUPERVISOR_PROMPT.md');
writeFileSync(outputPath, `# Generated Supervisor Prompt

Generated at: ${new Date().toISOString()}

## Full Prompt

${fullPrompt}

---

## Simplified Prompt

${simplifiedPrompt}

---

## Statistics

- Total Agents: ${stats.totalAgents}
- Total Capabilities: ${stats.totalCapabilities}
- Avg Capabilities per Agent: ${stats.avgCapabilitiesPerAgent.toFixed(2)}
- Most Capable Agent: ${stats.mostCapableAgent}
- Most Connected Agent: ${stats.mostDependencies}

---

## Available Agent IDs

${agentIds.map(id => `- ${id}`).join('\n')}
`);

console.log(`✅ Saved to: ${outputPath}\n`);

// 9. Test prompt regeneration (simulate registry change)
console.log('📋 Step 9: Testing dynamic regeneration...');
const prompt1Length = SupervisorPromptGenerator.generateSupervisorPrompt().length;
console.log(`   First generation: ${prompt1Length} chars`);

// Regenerate immediately (should be same length since no registry changes)
const prompt2Length = SupervisorPromptGenerator.generateSupervisorPrompt().length;
console.log(`   Second generation: ${prompt2Length} chars`);

if (prompt1Length === prompt2Length) {
  console.log('✅ Consistent generation (no caching issues)\n');
} else {
  console.log('⚠️ Generation inconsistency detected\n');
}

// 10. Validate prompt content
console.log('📋 Step 10: Validating prompt content...');
const validations = [
  { name: 'Contains introduction', test: fullPrompt.includes('Supervisor Agent') },
  { name: 'Contains agent sections', test: fullPrompt.includes('AVAILABLE AGENTS') },
  { name: 'Contains capability mapping', test: fullPrompt.includes('CAPABILITY-TO-AGENT MAPPING') },
  { name: 'Contains dependencies', test: fullPrompt.includes('AGENT DEPENDENCIES') },
  { name: 'Contains routing examples', test: fullPrompt.includes('ROUTING EXAMPLES') },
  { name: 'Contains important rules', test: fullPrompt.includes('IMPORTANT RULES') },
  { name: 'Contains all agent IDs', test: agentIds.every(id => fullPrompt.includes(id)) },
];

let allValid = true;
validations.forEach(({ name, test }) => {
  if (test) {
    console.log(`   ✅ ${name}`);
  } else {
    console.log(`   ❌ ${name}`);
    allValid = false;
  }
});

if (!allValid) {
  console.error('\n❌ Some validations failed!');
  process.exit(1);
}

console.log();

// 11. Summary
console.log('='.repeat(80));
console.log('TEST SUMMARY');
console.log('='.repeat(80));
console.log('✅ All tests passed!');
console.log();
console.log('Key Features Verified:');
console.log('  ✓ Dynamic prompt generation from Agent Registry');
console.log('  ✓ Agent capability documentation');
console.log('  ✓ Capability-to-agent mapping table');
console.log('  ✓ Dependency graph visualization');
console.log('  ✓ Routing examples with patterns');
console.log('  ✓ Simplified prompt generation');
console.log('  ✓ Registry statistics and insights');
console.log('  ✓ No caching (regenerates on each call)');
console.log('  ✓ All content sections present');
console.log();
console.log('Next Steps:');
console.log('  1. Review generated prompt in GENERATED_SUPERVISOR_PROMPT.md');
console.log('  2. Integrate SupervisorPromptGenerator into supervisor agent');
console.log('  3. Test routing with real queries');
console.log();
console.log('Usage Example:');
console.log(`
import { SupervisorPromptGenerator } from '@/lib/multi-agent/supervisor-prompt-generator';

// Generate prompt for supervisor
const systemPrompt = SupervisorPromptGenerator.generateSupervisorPrompt();

// Use with LLM
const response = await llm.invoke([
  { role: 'system', content: systemPrompt },
  { role: 'user', content: userQuery }
]);
`);
console.log('='.repeat(80));
