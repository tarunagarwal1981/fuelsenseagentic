/**
 * Axiom Diagnostic Script
 * 
 * Diagnoses Axiom connection issues by checking:
 * - Token validity
 * - Available datasets
 * - Org ID configuration
 * 
 * Run with: npx tsx scripts/diagnose-axiom.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
const envPath = resolve(process.cwd(), '.env.local');
config({ path: envPath });

const TOKEN = process.env.AXIOM_TOKEN?.trim();
const ORG_ID = process.env.AXIOM_ORG_ID?.trim();
const DATASET = process.env.AXIOM_DATASET || 'fuelsense';

async function diagnoseAxiom() {
  console.log('\n🔍 Axiom Connection Diagnostics\n');
  console.log('='.repeat(60));
  
  if (!TOKEN) {
    console.log('❌ AXIOM_TOKEN is not set');
    return;
  }
  
  console.log('\n📋 Current Configuration:');
  console.log(`  Token: ${TOKEN.substring(0, 10)}...${TOKEN.substring(TOKEN.length - 4)}`);
  console.log(`  Org ID: ${ORG_ID || 'NOT SET'}`);
  console.log(`  Dataset: ${DATASET}`);
  
  // Try to get datasets using the API directly
  console.log('\n🔧 Testing API Connection...');
  
  const baseUrl = 'https://api.axiom.co/v1';
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  };
  
  // Test 1: Try without org ID
  console.log('\n1️⃣ Testing without Org ID...');
  try {
    const response = await fetch(`${baseUrl}/datasets`, {
      method: 'GET',
      headers,
    });
    
    console.log(`   Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Success! Found ${data.length || 0} datasets`);
      if (data.length > 0) {
        console.log('   Available datasets:');
        data.forEach((ds: any) => {
          console.log(`     - ${ds.name} (id: ${ds.id})`);
        });
      }
    } else {
      const errorText = await response.text();
      console.log(`   ❌ Failed: ${errorText}`);
    }
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  // Test 2: Try with org ID if provided
  if (ORG_ID && ORG_ID !== '<will provide>') {
    console.log(`\n2️⃣ Testing with Org ID: ${ORG_ID}...`);
    try {
      const response = await fetch(`${baseUrl}/datasets`, {
        method: 'GET',
        headers: {
          ...headers,
          'X-Axiom-Org-Id': ORG_ID,
        },
      });
      
      console.log(`   Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`   ✅ Success! Found ${data.length || 0} datasets`);
        if (data.length > 0) {
          console.log('   Available datasets:');
          data.forEach((ds: any) => {
            console.log(`     - ${ds.name} (id: ${ds.id})`);
          });
        }
      } else {
        const errorText = await response.text();
        console.log(`   ❌ Failed: ${errorText}`);
      }
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  // Test 3: Try to get user info to find org ID
  console.log('\n3️⃣ Checking user/organization info...');
  try {
    const response = await fetch(`${baseUrl}/user`, {
      method: 'GET',
      headers,
    });
    
    console.log(`   Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const user = await response.json();
      console.log('   ✅ User info retrieved:');
      console.log(`     Name: ${user.name || 'N/A'}`);
      console.log(`     Email: ${user.email || 'N/A'}`);
      if (user.organizations && user.organizations.length > 0) {
        console.log('   Available organizations:');
        user.organizations.forEach((org: any) => {
          console.log(`     - ${org.name} (id: ${org.id})`);
        });
      }
    } else {
      const errorText = await response.text();
      console.log(`   ❌ Failed: ${errorText}`);
    }
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  // Test 4: Try to check specific dataset
  console.log(`\n4️⃣ Checking dataset: ${DATASET}...`);
  try {
    const response = await fetch(`${baseUrl}/datasets/${DATASET}`, {
      method: 'GET',
      headers: ORG_ID && ORG_ID !== '<will provide>' ? {
        ...headers,
        'X-Axiom-Org-Id': ORG_ID,
      } : headers,
    });
    
    console.log(`   Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const dataset = await response.json();
      console.log('   ✅ Dataset exists:');
      console.log(`     Name: ${dataset.name}`);
      console.log(`     ID: ${dataset.id}`);
      console.log(`     Description: ${dataset.description || 'N/A'}`);
    } else {
      const errorText = await response.text();
      console.log(`   ❌ Dataset not found or inaccessible: ${errorText}`);
    }
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n💡 Recommendations:');
  console.log('   1. Check the output above to find your correct Org ID');
  console.log('   2. Update .env.local with the correct AXIOM_ORG_ID');
  console.log('   3. Verify the dataset name matches one from the list');
  console.log('   4. Ensure your token has "ingest" permission');
  console.log('\n');
}

diagnoseAxiom().catch((error) => {
  console.error('❌ Diagnostic failed:', error);
  process.exit(1);
});
