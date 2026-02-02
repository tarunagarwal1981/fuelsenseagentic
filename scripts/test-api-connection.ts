/**
 * Quick API Connection Test
 * 
 * Tests basic connectivity to the WorldPortIndex API and
 * verifies the response format.
 * 
 * Run: npm run test:api-connection
 */

async function testAPIConnection() {
  const baseURL = 'https://uat.fuelsense-api.dexpertsystems.com';
  
  console.log('🧪 Testing API Connection...\n');
  console.log('Base URL:', baseURL);
  console.log('================================================\n');
  
  // Test 1: Basic connectivity
  console.log('Test 1: Check if API is reachable');
  console.log('-----------------------------------');
  console.log('Endpoint: /world-port-index?limit=1');
  try {
    const response = await fetch(`${baseURL}/world-port-index?limit=1`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    
    console.log('✅ API Status:', response.status);
    console.log('✅ API Response OK:', response.ok);
    console.log('✅ Content-Type:', response.headers.get('content-type'));
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Sample data (first 500 chars):');
      console.log(JSON.stringify(data, null, 2).substring(0, 500));
      console.log('...');
    } else {
      const errorText = await response.text();
      console.log('❌ Error response:', errorText.substring(0, 500));
    }
  } catch (error) {
    console.log('❌ Connection failed:', error instanceof Error ? error.message : String(error));
  }
  
  console.log('\n');
  
  // Test 2: Try searching for Singapore
  console.log('Test 2: Search for Singapore');
  console.log('----------------------------');
  console.log('Query: filter=mainPortName||$cont||singapore&limit=1');
  try {
    const response = await fetch(
      `${baseURL}/world-port-index?filter=mainPortName||$cont||singapore&limit=1`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
      }
    );
    
    console.log('Status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Found Singapore:');
      console.log(JSON.stringify(data, null, 2).substring(0, 500));
      console.log('...');
    } else {
      const errorText = await response.text();
      console.log('❌ Singapore search failed (', response.status, '):');
      console.log(errorText.substring(0, 300));
    }
  } catch (error) {
    console.log('❌ Search failed:', error instanceof Error ? error.message : String(error));
  }
  
  console.log('\n');
  
  // Test 3: Try with NestJS CRUD query format
  console.log('Test 3: NestJS CRUD query format');
  console.log('---------------------------------');
  console.log('Query: filter=mainPortName||$contL||singapore&limit=1');
  try {
    const response = await fetch(
      `${baseURL}/world-port-index?filter=mainPortName||$contL||singapore&limit=1`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
      }
    );
    
    console.log('Status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ NestJS CRUD format works:');
      console.log(JSON.stringify(data, null, 2).substring(0, 500));
      console.log('...');
    } else {
      const errorText = await response.text();
      console.log('❌ NestJS CRUD query failed (', response.status, '):');
      console.log(errorText.substring(0, 300));
    }
  } catch (error) {
    console.log('❌ NestJS CRUD query failed:', error instanceof Error ? error.message : String(error));
  }
  
  console.log('\n================================================');
  console.log('✨ Test completed');
}

testAPIConnection()
  .then(() => {
    console.log('\n✅ All tests finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test failed:', error);
    process.exit(1);
  });
