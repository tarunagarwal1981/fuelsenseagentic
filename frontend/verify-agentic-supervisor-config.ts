/**
 * Verify Agentic Supervisor Configuration
 * 
 * Checks that environment variables are correctly set for agentic supervisor
 */

console.log('='.repeat(80));
console.log('AGENTIC SUPERVISOR CONFIGURATION VERIFICATION');
console.log('='.repeat(80));
console.log();

// Load environment variables
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

console.log('📋 Environment Variables:');
console.log();

// Check supervisor mode settings
const USE_AGENTIC_SUPERVISOR = process.env.USE_AGENTIC_SUPERVISOR;
const USE_DYNAMIC_SUPERVISOR_PROMPT = process.env.USE_DYNAMIC_SUPERVISOR_PROMPT;
const USE_PLAN_BASED_SUPERVISOR = process.env.USE_PLAN_BASED_SUPERVISOR;

console.log('🎯 Supervisor Mode Configuration:');
console.log(`   USE_AGENTIC_SUPERVISOR: ${USE_AGENTIC_SUPERVISOR || '(not set - will default to false)'}`);
console.log(`   USE_DYNAMIC_SUPERVISOR_PROMPT: ${USE_DYNAMIC_SUPERVISOR_PROMPT || '(not set - will default to true)'}`);
console.log(`   USE_PLAN_BASED_SUPERVISOR: ${USE_PLAN_BASED_SUPERVISOR || '(not set - will default to false)'}`);
console.log();

// Determine which supervisor will be active
let activeSupervisor = 'legacy';
if (USE_PLAN_BASED_SUPERVISOR === 'true') {
  activeSupervisor = 'plan-based';
} else if (USE_AGENTIC_SUPERVISOR === 'true') {
  activeSupervisor = 'agentic';
}

console.log('📊 Active Supervisor:');
console.log(`   ${activeSupervisor.toUpperCase()}`);
console.log();

// Check if configuration is correct for agentic supervisor
const isAgenticEnabled = USE_AGENTIC_SUPERVISOR === 'true';
const isDynamicPromptEnabled = USE_DYNAMIC_SUPERVISOR_PROMPT !== 'false'; // defaults to true

console.log('✅ Configuration Status:');
console.log();

if (isAgenticEnabled) {
  console.log('   ✅ Agentic Supervisor ENABLED');
  
  if (isDynamicPromptEnabled) {
    console.log('   ✅ Dynamic Prompt Generation ENABLED');
    console.log('   ✅ Prompts will be auto-generated from Agent Registry');
  } else {
    console.log('   ⚠️  Dynamic Prompt Generation DISABLED');
    console.log('   ⚠️  Will use legacy hardcoded prompts (not recommended)');
  }
  
  console.log();
  console.log('🎉 Configuration is CORRECT for agentic supervisor with dynamic prompts!');
  console.log();
  console.log('Expected behavior:');
  console.log('   1. Supervisor will use LLM reasoning for routing decisions');
  console.log('   2. System prompts auto-generated from Agent Registry');
  console.log('   3. New agents automatically included in routing logic');
  console.log('   4. Look for this log message:');
  console.log('      "🎯 [AGENTIC-SUPERVISOR] Using dynamic prompt generator"');
  
} else {
  console.log('   ⚠️  Agentic Supervisor NOT ENABLED');
  console.log(`   Current mode: ${activeSupervisor.toUpperCase()}`);
  console.log();
  console.log('To enable agentic supervisor with dynamic prompts:');
  console.log('   1. Set USE_AGENTIC_SUPERVISOR=true in .env.local');
  console.log('   2. (Optional) Set USE_DYNAMIC_SUPERVISOR_PROMPT=true');
  console.log('   3. Restart the application');
}

console.log();

// Check required API keys
console.log('🔑 API Keys:');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (ANTHROPIC_API_KEY) {
  console.log('   ✅ ANTHROPIC_API_KEY is set');
} else {
  console.log('   ❌ ANTHROPIC_API_KEY is NOT set (required for agentic supervisor)');
}

if (OPENAI_API_KEY) {
  console.log('   ✅ OPENAI_API_KEY is set');
} else {
  console.log('   ⚠️  OPENAI_API_KEY is NOT set (optional, fallback available)');
}

console.log();

// Summary
console.log('='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));

if (isAgenticEnabled && isDynamicPromptEnabled && ANTHROPIC_API_KEY) {
  console.log('✅ All systems GO! Agentic supervisor with dynamic prompts is ready.');
  console.log();
  console.log('Next steps:');
  console.log('   1. Restart the application (npm run dev)');
  console.log('   2. Submit a test query');
  console.log('   3. Check logs for "🎯 [AGENTIC-SUPERVISOR] Using dynamic prompt generator"');
  console.log('   4. Verify routing decisions are correct');
} else {
  console.log('⚠️  Configuration incomplete or agentic supervisor not enabled.');
  console.log();
  console.log('Required for agentic supervisor:');
  console.log(`   ${isAgenticEnabled ? '✅' : '❌'} USE_AGENTIC_SUPERVISOR=true`);
  console.log(`   ${isDynamicPromptEnabled ? '✅' : '❌'} USE_DYNAMIC_SUPERVISOR_PROMPT=true (or not set)`);
  console.log(`   ${ANTHROPIC_API_KEY ? '✅' : '❌'} ANTHROPIC_API_KEY is set`);
}

console.log('='.repeat(80));
