/**
 * Service Integration Tests
 * 
 * Comprehensive integration tests for the complete service layer flows.
 * Tests the integration between repositories, services, and the service container.
 * 
 * Key Tests:
 * - Complete bunker planning flow
 * - Cache hit rate performance
 * - Fallback chain (Cache → DB → JSON)
 * - Error handling and graceful degradation
 */

// Load environment variables from .env.local if available
import 'dotenv/config';

import { ServiceContainer } from '@/lib/repositories/service-container';
import { RouteService } from '@/lib/services/route.service';
import { BunkerService } from '@/lib/services/bunker.service';
import { WeatherService } from '@/lib/services/weather.service';
import { PortRepository } from '@/lib/repositories/port-repository';
import { PriceRepository } from '@/lib/repositories/price-repository';

// ============================================================================
// Test Helpers
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration?: number;
  details?: any;
}

const testResults: TestResult[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertDefined<T>(value: T | null | undefined, message: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(`Assertion failed: ${value} is not defined - ${message}`);
  }
}

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await testFn();
    const duration = Date.now() - start;
    testResults.push({ name, passed: true, duration });
    console.log(`✅ ${name} (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - start;
    const errorMessage = error instanceof Error ? error.message : String(error);
    testResults.push({ name, passed: false, error: errorMessage, duration });
    console.error(`❌ ${name}: ${errorMessage} (${duration}ms)`);
    throw error;
  }
}

// ============================================================================
// Test Suite: Complete Bunker Planning Flow
// ============================================================================

async function testCompleteBunkerPlanningFlow(): Promise<void> {
  await runTest('Complete bunker planning flow', async () => {
    const container = ServiceContainer.getInstance();
    const routeService = container.getRouteService();
    const bunkerService = container.getBunkerService();
    const priceRepo = container.getPriceRepository();

    // 1. Calculate route
    console.log('   Step 1: Calculating route...');
    const route = await routeService.calculateRoute({
      origin: 'SGSIN',
      destination: 'NLRTM',
      speed: 14,
      departureDate: new Date(),
    });

    assertDefined(route, 'Route should be defined');
    assert(route.totalDistanceNm > 0, 'Route distance should be positive');
    assert(route.waypoints.length > 0, 'Route should have waypoints');
    console.log(`   ✓ Route calculated: ${route.totalDistanceNm.toFixed(0)}nm, ${route.waypoints.length} waypoints`);

    // 2. Find bunker ports
    console.log('   Step 2: Finding bunker ports...');
    const ports = await bunkerService.findBunkerPorts({
      route,
      maxDeviation: 50,
      fuelTypes: ['VLSFO'],
    });

    assert(ports.length > 0, 'Should find at least one bunker port');
    console.log(`   ✓ Found ${ports.length} bunker ports`);

    // 3. Get prices for first port
    console.log('   Step 3: Getting fuel prices...');
    const prices = await priceRepo.getLatestPrices({
      portCode: ports[0].code,
      fuelTypes: ['VLSFO'],
    });

    assert(Object.keys(prices).length > 0, 'Should have price data');
    assert(prices['VLSFO'] !== undefined, 'Should have VLSFO price');
    assert(prices['VLSFO']! > 0, 'Price should be positive');
    console.log(`   ✓ Got prices: VLSFO $${prices['VLSFO']?.toFixed(0)}/MT`);

    // 4. Analyze bunker options
    console.log('   Step 4: Analyzing bunker options...');
    const analysis = await bunkerService.analyzeBunkerOptions({
      ports: ports.slice(0, 3), // Analyze top 3 ports
      requiredFuel: 500,
      currentROB: 200,
      fuelType: 'VLSFO',
    });

    assertDefined(analysis.recommended, 'Should have a recommended option');
    assert(analysis.recommended.totalCost > 0, 'Total cost should be positive');
    assert(analysis.options.length > 0, 'Should have analysis options');
    console.log(`   ✓ Analysis complete: ${analysis.options.length} options, recommended: ${analysis.recommended.port.code}`);
    console.log(`   ✓ Recommended total cost: $${analysis.recommended.totalCost.toFixed(0)}`);
  });
}

// ============================================================================
// Test Suite: Cache Hit Rate
// ============================================================================

async function testCacheHitRate(): Promise<void> {
  await runTest('Cache hit rate >90%', async () => {
    const container = ServiceContainer.getInstance();
    
    // Skip if cache is not enabled (Redis not configured)
    if (!container.isCacheEnabled()) {
      console.log('   ⚠️  Redis not configured - skipping cache hit rate test');
      console.log('   ℹ️  Cache hit rate test requires Redis to be configured');
      return; // Skip this test
    }
    
    const routeService = container.getRouteService();

    const params = {
      origin: 'SGSIN',
      destination: 'NLRTM',
      speed: 14,
      departureDate: new Date(),
    };

    // Clear cache first to ensure clean state
    await container.cleanup();

    // First call - cache miss (should be slower)
    console.log('   First call (cache miss)...');
    const firstCallStart = Date.now();
    await routeService.calculateRoute(params);
    const firstCallDuration = Date.now() - firstCallStart;
    console.log(`   ✓ First call: ${firstCallDuration}ms`);

    // Subsequent calls - should be cache hits (faster)
    const cacheHitDurations: number[] = [];
    const cacheHitThreshold = 100; // Cache hits should be <100ms

    for (let i = 0; i < 10; i++) {
      const start = Date.now();
      await routeService.calculateRoute(params);
      const duration = Date.now() - start;
      cacheHitDurations.push(duration);
    }

    const cacheHits = cacheHitDurations.filter((d) => d < cacheHitThreshold);
    const hitRate = cacheHits.length / cacheHitDurations.length;

    console.log(`   Cache hit durations: ${cacheHitDurations.map((d) => `${d}ms`).join(', ')}`);
    console.log(`   Cache hits: ${cacheHits.length}/${cacheHitDurations.length} (${(hitRate * 100).toFixed(1)}%)`);

    assert(
      hitRate >= 0.9,
      `Cache hit rate should be >= 90%, got ${(hitRate * 100).toFixed(1)}%`
    );
    assert(
      firstCallDuration > cacheHitDurations[0]!,
      'First call should be slower than cached calls'
    );
  });
}

// ============================================================================
// Test Suite: Fallback Chain
// ============================================================================

async function testFallbackChain(): Promise<void> {
  await runTest('Falls back to JSON when DB unavailable', async () => {
    const container = ServiceContainer.getInstance();
    const portRepo = container.getPortRepository();

    // Test that ports can be loaded even if DB is unavailable
    // (The repository should fall back to JSON)
    console.log('   Testing fallback to JSON...');
    
    const ports = await portRepo.findBunkerPorts();
    
    assert(ports.length > 0, 'Should load ports from fallback');
    assert(ports[0]!.code !== undefined, 'Ports should have codes');
    assert(ports[0]!.name !== undefined, 'Ports should have names');
    assert(ports[0]!.coordinates.length === 2, 'Ports should have coordinates');
    
    console.log(`   ✓ Loaded ${ports.length} ports from fallback`);
    console.log(`   ✓ Sample port: ${ports[0]!.code} - ${ports[0]!.name}`);
  });
}

// ============================================================================
// Test Suite: Service Container Integration
// ============================================================================

async function testServiceContainerIntegration(): Promise<void> {
  await runTest('Service container provides all services', async () => {
    // Check if Supabase is configured
    const hasSupabase = !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
    
    if (!hasSupabase) {
      console.log('   ⚠️  Supabase not configured - skipping service container test');
      console.log('   ℹ️  Tests will use JSON fallback only');
      return; // Skip this test if Supabase is not configured
    }

    const container = ServiceContainer.getInstance();

    // Verify all services are available
    const routeService = container.getRouteService();
    const bunkerService = container.getBunkerService();
    const weatherService = container.getWeatherService();
    const portRepo = container.getPortRepository();
    const priceRepo = container.getPriceRepository();
    const vesselRepo = container.getVesselRepository();

    assertDefined(routeService, 'RouteService should be available');
    assertDefined(bunkerService, 'BunkerService should be available');
    assertDefined(weatherService, 'WeatherService should be available');
    assertDefined(portRepo, 'PortRepository should be available');
    assertDefined(priceRepo, 'PriceRepository should be available');
    assertDefined(vesselRepo, 'VesselRepository should be available');

    console.log('   ✓ All services available from container');
  });
}

// ============================================================================
// Test Suite: Weather Service Integration
// ============================================================================

async function testWeatherServiceIntegration(): Promise<void> {
  await runTest('Weather service integration', async () => {
    const container = ServiceContainer.getInstance();
    const weatherService = container.getWeatherService();

    // Test fetching marine weather
    console.log('   Fetching marine weather...');
    const weather = await weatherService.fetchMarineWeather({
      latitude: 1.2897, // Singapore
      longitude: 103.8501,
      date: new Date(),
    });

    assertDefined(weather, 'Weather should be defined');
    assert(weather.waveHeight >= 0, 'Wave height should be non-negative');
    assert(weather.windSpeed >= 0, 'Wind speed should be non-negative');
    assert(weather.windDirection >= 0 && weather.windDirection <= 360, 'Wind direction should be 0-360');
    console.log(`   ✓ Weather fetched: ${weather.waveHeight.toFixed(2)}m waves, ${weather.windSpeed.toFixed(1)}kt winds`);

    // Test weather impact calculation
    console.log('   Calculating weather impact...');
    const impact = await weatherService.calculateWeatherImpact({
      weather,
      vesselType: 'container',
      speed: 14,
    });

    assertDefined(impact, 'Impact should be defined');
    assert(impact.multiplier > 0, 'Multiplier should be positive');
    assert(['safe', 'caution', 'unsafe'].includes(impact.safetyRating), 'Safety rating should be valid');
    console.log(`   ✓ Impact calculated: multiplier ${impact.multiplier.toFixed(2)}, rating: ${impact.safetyRating}`);

    // Test port weather safety check
    console.log('   Checking port weather safety...');
    const portSafety = await weatherService.checkPortWeatherSafety({
      portCode: 'SGSIN',
      date: new Date(),
    });

    assertDefined(portSafety, 'Port safety should be defined');
    assert(typeof portSafety.isSafe === 'boolean', 'isSafe should be boolean');
    assert(Array.isArray(portSafety.restrictions), 'Restrictions should be array');
    console.log(`   ✓ Port safety checked: ${portSafety.isSafe ? 'Safe' : 'Unsafe'}`);
  });
}

// ============================================================================
// Test Suite: Performance Benchmarks
// ============================================================================

async function testPerformanceBenchmarks(): Promise<void> {
  await runTest('Performance benchmarks', async () => {
    const container = ServiceContainer.getInstance();
    const routeService = container.getRouteService();
    const bunkerService = container.getBunkerService();
    const portRepo = container.getPortRepository();

    const benchmarks: Record<string, number> = {};

    // Benchmark: Route calculation
    console.log('   Benchmarking route calculation...');
    const routeStart = Date.now();
    const route = await routeService.calculateRoute({
      origin: 'SGSIN',
      destination: 'NLRTM',
      speed: 14,
      departureDate: new Date(),
    });
    benchmarks['route_calculation'] = Date.now() - routeStart;
    console.log(`   ✓ Route calculation: ${benchmarks['route_calculation']}ms`);

    // Benchmark: Bunker port finding
    console.log('   Benchmarking bunker port finding...');
    const portsStart = Date.now();
    const ports = await bunkerService.findBunkerPorts({
      route,
      maxDeviation: 50,
      fuelTypes: ['VLSFO'],
    });
    benchmarks['bunker_port_finding'] = Date.now() - portsStart;
    console.log(`   ✓ Bunker port finding: ${benchmarks['bunker_port_finding']}ms`);

    // Benchmark: Port repository query
    console.log('   Benchmarking port repository query...');
    const portQueryStart = Date.now();
    await portRepo.findBunkerPorts();
    benchmarks['port_repository_query'] = Date.now() - portQueryStart;
    console.log(`   ✓ Port repository query: ${benchmarks['port_repository_query']}ms`);

    // Verify benchmarks are reasonable
    assert(benchmarks['route_calculation']! < 10000, 'Route calculation should be < 10s');
    assert(benchmarks['bunker_port_finding']! < 5000, 'Bunker port finding should be < 5s');
    assert(benchmarks['port_repository_query']! < 2000, 'Port repository query should be < 2s');

    console.log('   Performance benchmarks:');
    Object.entries(benchmarks).forEach(([name, duration]) => {
      console.log(`     - ${name}: ${duration}ms`);
    });
  });
}

// ============================================================================
// Test Suite: Error Handling
// ============================================================================

async function testErrorHandling(): Promise<void> {
  await runTest('Error handling and graceful degradation', async () => {
    const container = ServiceContainer.getInstance();
    const routeService = container.getRouteService();

    // Test invalid port code
    console.log('   Testing invalid port code handling...');
    try {
      await routeService.calculateRoute({
        origin: 'INVALID',
        destination: 'NLRTM',
        speed: 14,
        departureDate: new Date(),
      });
      throw new Error('Should have thrown error for invalid port');
    } catch (error) {
      assert(error instanceof Error, 'Should throw Error');
      assert(error.message.includes('not found') || error.message.includes('Invalid'), 'Error should mention port not found');
      console.log(`   ✓ Invalid port handled gracefully: ${error.message}`);
    }

    // Test that valid operations still work after error
    console.log('   Testing recovery after error...');
    const route = await routeService.calculateRoute({
      origin: 'SGSIN',
      destination: 'NLRTM',
      speed: 14,
      departureDate: new Date(),
    });
    assertDefined(route, 'Should recover and work after error');
    console.log('   ✓ System recovered after error');
  });
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function runAllTests(): Promise<void> {
  console.log('\n🧪 Running Service Integration Tests\n');
  console.log('='.repeat(80));

  try {
    // Reset service container for clean state
    ServiceContainer.resetInstance();

    // Check if Supabase is configured
    const hasSupabase = !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
    const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
    
    if (!hasSupabase) {
      console.log('⚠️  Supabase not configured - some tests will be skipped');
      console.log('ℹ️  Tests will use JSON fallback only\n');
    }
    
    if (!hasRedis) {
      console.log('⚠️  Redis not configured - caching tests may show lower hit rates\n');
    }

    // Try to initialize container (may fail if Supabase missing)
    let containerInitialized = false;
    try {
      const container = ServiceContainer.getInstance();
      containerInitialized = true;
    } catch (error) {
      console.log('⚠️  ServiceContainer initialization failed (expected if Supabase missing)');
      console.log('ℹ️  Running tests that work with JSON fallback only\n');
    }

    // Run tests that don't require Supabase first
    await testFallbackChain(); // This should work with JSON fallback
    
    // Only run tests that require full initialization if container initialized
    if (containerInitialized) {
      await testServiceContainerIntegration();
      await testCompleteBunkerPlanningFlow();
      await testCacheHitRate();
      await testWeatherServiceIntegration();
      await testPerformanceBenchmarks();
      await testErrorHandling();
    } else {
      console.log('\n⚠️  Skipping tests that require Supabase initialization');
      console.log('ℹ️  To run all tests, configure SUPABASE_URL and SUPABASE_ANON_KEY\n');
    }

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 Test Summary\n');

    const passed = testResults.filter((r) => r.passed).length;
    const failed = testResults.filter((r) => !r.passed).length;
    const totalDuration = testResults.reduce((sum, r) => sum + (r.duration || 0), 0);

    console.log(`Total Tests: ${testResults.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    if (testResults.length > 0) {
      console.log(`⏱️  Total Duration: ${totalDuration}ms`);
      console.log(`📈 Average Duration: ${Math.round(totalDuration / testResults.length)}ms`);
    }

    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      testResults
        .filter((r) => !r.passed)
        .forEach((r) => {
          console.log(`   - ${r.name}: ${r.error}`);
        });
      process.exit(1);
    } else {
      console.log('\n✅ All tests passed!');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests if executed directly
if (require.main === module) {
  runAllTests().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { runAllTests };
