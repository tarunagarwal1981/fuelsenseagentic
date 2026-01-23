/**
 * Axiom Connection Test Script
 * 
 * Tests Axiom logging connection and verifies logs are being ingested.
 * 
 * Run with: npx tsx scripts/test-axiom-connection.ts
 */

// Load environment variables
import { config } from 'dotenv';
import { resolve } from 'path';
const envPath = resolve(process.cwd(), '.env.local');
config({ path: envPath });

import { AxiomWithoutBatching } from '@axiomhq/js';

const DATASET = process.env.AXIOM_DATASET || 'fuelsense';
const TOKEN = process.env.AXIOM_TOKEN?.trim();
const ORG_ID = process.env.AXIOM_ORG_ID?.trim();

async function testAxiomConnection() {
  console.log('\n🔍 Testing Axiom Connection...\n');
  console.log('='.repeat(60));
  
  // Check environment variables
  console.log('\n📋 Configuration:');
  console.log(`  Dataset: ${DATASET}`);
  console.log(`  Token: ${TOKEN ? '✅ Set' : '❌ Not set'}`);
  console.log(`  Org ID: ${ORG_ID ? `✅ Set (${ORG_ID})` : '⚠️  Not set (optional)'}`);
  
  if (!TOKEN) {
    console.log('\n❌ AXIOM_TOKEN is not set. Logs will not be sent to Axiom.');
    console.log('\nTo set it up:');
    console.log('  1. Get your token from: https://app.axiom.co/settings/api-tokens');
    console.log('  2. Add to .env.local: AXIOM_TOKEN=your_token_here');
    console.log('  3. Optionally set AXIOM_DATASET and AXIOM_ORG_ID');
    return;
  }
  
  // Test client creation
  console.log('\n🔧 Testing Client Creation...');
  try {
    const client = new AxiomWithoutBatching({
      token: TOKEN,
      orgId: ORG_ID || undefined,
      onError: (e) => {
        console.error('  ❌ Client error:', e);
      },
    });
    console.log('  ✅ Client created successfully');
    
    // Test ingestion with a test event
    console.log('\n📤 Testing Log Ingestion...');
    const testEvent = {
      _time: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      correlation_id: 'test-connection-' + Date.now(),
      environment: 'test',
      level: 'info',
      service: 'axiom-connection-test',
      message: 'Test log from Axiom connection test script',
      test: true,
    };
    
    try {
      await client.ingest(DATASET, [testEvent]);
      console.log('  ✅ Test event ingested successfully');
      console.log(`  📊 Dataset: ${DATASET}`);
      console.log(`  🔗 Correlation ID: ${testEvent.correlation_id}`);
      
      console.log('\n✅ Axiom connection test PASSED!');
      console.log('\n💡 Next steps:');
      console.log(`  1. Stream logs: axiom stream ${DATASET}`);
      console.log(`  2. Query logs: axiom query ${DATASET} --start-time="5m ago"`);
      console.log(`  3. Find test event: axiom query ${DATASET} --start-time="5m ago" 'correlation_id == "${testEvent.correlation_id}"'`);
      
    } catch (ingestError: any) {
      console.error('  ❌ Ingestion failed:', ingestError.message);
      console.error('  Full error:', JSON.stringify(ingestError, null, 2));
      
      if (ingestError.message?.includes('Forbidden') || ingestError.message?.includes('401')) {
        console.error('\n  🔑 Authentication issue:');
        console.error('     - Check that your AXIOM_TOKEN is valid');
        console.error('     - Verify token has "ingest" permission');
        console.error('     - Check that AXIOM_ORG_ID is correct (if set)');
        console.error(`     - Current ORG_ID: ${ORG_ID || 'not set'}`);
      } else if (ingestError.message?.includes('404') || ingestError.message?.includes('Not Found')) {
        console.error('\n  📊 Dataset issue:');
        console.error(`     - Dataset "${DATASET}" may not exist`);
        console.error(`     - Create it: axiom dataset create ${DATASET}`);
        console.error('     - Or use existing dataset: set AXIOM_DATASET=your-dataset');
        console.error(`     - Current dataset: ${DATASET}`);
      } else {
        console.error('\n  ❓ Unknown error - check:');
        console.error('     - Network connectivity');
        console.error('     - Axiom service status');
        console.error('     - Token permissions');
        console.error(`     - Dataset: ${DATASET}`);
        console.error(`     - Org ID: ${ORG_ID || 'not set'}`);
      }
      process.exit(1);
    }
    
  } catch (clientError: any) {
    console.error('  ❌ Failed to create client:', clientError.message);
    process.exit(1);
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
}

// Run test
testAxiomConnection().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
