// tests/compare-implementations.test.ts - Multi-Agent endpoint test
const TEST_QUERIES = [
  "Calculate route from Singapore to Rotterdam at 14 knots",
  "Find cheapest bunker from SGSIN to NLRTM",
  "What's the fuel price at Fujairah?",
  "Analyze bunker options for 1000 MT fuel from Dubai to Shanghai",
];

async function testEndpoint(query: string) {
  const startTime = Date.now();

  try {
    const response = await fetch(`http://localhost:3000/api/chat-multi-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: query,
        origin: "Singapore",
        destination: "Rotterdam",
      }),
    });

    if (!response.ok) {
      return {
        query,
        duration: Date.now() - startTime,
        success: false,
        error: `HTTP ${response.status}`,
      };
    }

    const reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }

    const duration = Date.now() - startTime;
    return { query, duration, success: true };
  } catch (error) {
    return {
      query,
      duration: Date.now() - startTime,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function runComparison() {
  console.log("🧪 Running Multi-Agent Tests...\n");

  for (const query of TEST_QUERIES) {
    console.log(`\n📝 Testing: "${query}"\n`);

    const result = await testEndpoint(query);
    const status = result.success ? "✓" : "✗";

    console.log(
      `🤖 Multi-Agent: ${status} ${result.duration}ms${
        !result.success ? ` (${result.error})` : ""
      }`
    );
  }
}

if (require.main === module) {
  runComparison();
}
