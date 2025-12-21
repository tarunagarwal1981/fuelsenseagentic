// tests/compare-implementations.test.ts
const TEST_QUERIES = [
  "Calculate route from Singapore to Rotterdam at 14 knots",
  "Find cheapest bunker from SGSIN to NLRTM",
  "What's the fuel price at Fujairah?",
  "Analyze bunker options for 1000 MT fuel from Dubai to Shanghai",
];

async function testEndpoint(endpoint: string, query: string) {
  const startTime = Date.now();

  try {
    const response = await fetch(`http://localhost:3000/api/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: query }],
      }),
    });

    if (!response.ok) {
      return {
        endpoint,
        query,
        duration: Date.now() - startTime,
        success: false,
        error: `HTTP ${response.status}`,
      };
    }

    // Consume the stream to get accurate timing
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }

    const duration = Date.now() - startTime;
    return { endpoint, query, duration, success: true };
  } catch (error) {
    return {
      endpoint,
      query,
      duration: Date.now() - startTime,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function runComparison() {
  console.log("🧪 Running Comparison Tests...\n");

  for (const query of TEST_QUERIES) {
    console.log(`\n📝 Testing: "${query}"\n`);

    const [manualResult, langGraphResult] = await Promise.all([
      testEndpoint("chat", query),
      testEndpoint("chat-langgraph", query),
    ]);

    const manualStatus = manualResult.success ? "✓" : "✗";
    const langGraphStatus = langGraphResult.success ? "✓" : "✗";

    console.log(
      `⚙️  Manual:    ${manualStatus} ${manualResult.duration}ms${
        !manualResult.success ? ` (${manualResult.error})` : ""
      }`
    );
    console.log(
      `🔷 LangGraph: ${langGraphStatus} ${langGraphResult.duration}ms${
        !langGraphResult.success ? ` (${langGraphResult.error})` : ""
      }`
    );

    if (manualResult.success && langGraphResult.success) {
      const diff = langGraphResult.duration - manualResult.duration;
      const diffPercent = ((diff / manualResult.duration) * 100).toFixed(1);

      console.log(
        `📊 Difference: ${diff > 0 ? "+" : ""}${diff}ms (${diffPercent}%)`
      );
    }
  }
}

// Run if called directly
if (require.main === module) {
  runComparison();
}

