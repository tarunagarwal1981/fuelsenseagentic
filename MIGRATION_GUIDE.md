# Migration Guide: From Direct JSON Access to Service/Repository Layer

This guide documents the migration from direct JSON file access to the new Service and Repository layer architecture with 3-tier caching (Cache → Database → JSON Fallback).

## Table of Contents

1. [Overview](#overview)
2. [What Changed](#what-changed)
3. [Tool-by-Tool Migration](#tool-by-tool-migration)
4. [Adding New Services](#adding-new-services)
5. [Adding New Repositories](#adding-new-repositories)
6. [Migration Checklist](#migration-checklist)

## Overview

### Before: Direct JSON Access

```typescript
// Old approach - direct JSON import
import portsData from '@/lib/data/ports.json';

function findPort(code: string) {
  return portsData.find(p => p.port_code === code);
}
```

**Problems**:
- No caching
- No database integration
- No error handling
- Tight coupling to file system
- Difficult to test

### After: Repository Pattern

```typescript
// New approach - repository with 3-tier fallback
import { ServiceContainer } from '@/lib/repositories/service-container';

const container = ServiceContainer.getInstance();
const portRepo = container.getPortRepository();

const port = await portRepo.findByCode('SGSIN');
// Automatically tries: Cache → Database → JSON Fallback
```

**Benefits**:
- ✅ Automatic caching (Redis)
- ✅ Database integration (Supabase)
- ✅ Graceful fallback to JSON
- ✅ Testable with dependency injection
- ✅ Consistent error handling

## What Changed

### Architecture Changes

| Component | Before | After |
|-----------|--------|-------|
| **Data Access** | Direct JSON imports | Repository pattern with 3-tier fallback |
| **Business Logic** | In tools | Service layer |
| **Caching** | None | Redis (Upstash) |
| **Database** | None | Supabase |
| **Dependency Management** | Global imports | ServiceContainer (DI) |

### File Structure Changes

```
Before:
frontend/lib/
├── tools/
│   ├── route-calculator.ts (contains all logic)
│   └── price-fetcher.ts (direct JSON import)
└── data/
    ├── ports.json
    └── prices.json

After:
frontend/lib/
├── repositories/
│   ├── base-repository.ts (3-tier fallback)
│   ├── port-repository.ts
│   ├── price-repository.ts
│   ├── vessel-repository.ts
│   └── service-container.ts (DI)
├── services/
│   ├── route.service.ts
│   ├── bunker.service.ts
│   └── weather.service.ts
└── tools/
    ├── route-calculator.ts (thin wrapper)
    └── price-fetcher.ts (uses repository)
```

## Tool-by-Tool Migration

### 1. route-calculator.ts

**Before**:
```typescript
import portsData from '@/lib/data/ports.json';

export async function calculateRoute(input: RouteInput) {
  // Load ports from JSON
  const originPort = portsData.find(p => p.port_code === input.origin);
  const destPort = portsData.find(p => p.port_code === input.destination);
  
  // Direct API call
  const response = await fetch('https://api.searoute.com/...');
  
  // Manual ECA detection
  // Manual timeline calculation
  // Manual caching (if any)
  
  return routeData;
}
```

**After**:
```typescript
import { ServiceContainer } from '@/lib/repositories/service-container';

export async function calculateRoute(input: RouteInput) {
  // Get service from container
  const container = ServiceContainer.getInstance();
  const routeService = container.getRouteService();
  
  // Delegate to service
  const routeData = await routeService.calculateRoute({
    origin: input.origin,
    destination: input.destination,
    speed: input.speed,
    departureDate: new Date(input.departure_date),
  });
  
  // Map service output to tool format
  return mapToToolFormat(routeData);
}
```

**Changes**:
- ✅ Removed direct JSON import
- ✅ Removed API call logic (moved to `SeaRouteAPIClient`)
- ✅ Removed ECA detection (moved to `RouteService`)
- ✅ Removed timeline calculation (moved to `RouteService`)
- ✅ Removed caching logic (handled by service)
- ✅ Tool is now a thin wrapper around service

### 2. price-fetcher.ts

**Before**:
```typescript
import pricesData from '@/lib/data/prices.json';

let pricesCache: Map<string, any> = new Map();

function loadPricesData() {
  // Load from JSON
  return pricesData;
}

export async function fetchPrices(input: PriceInput) {
  const prices = loadPricesData();
  // Manual filtering and formatting
  return formattedPrices;
}
```

**After**:
```typescript
import { ServiceContainer } from '@/lib/repositories/service-container';

export async function fetchPrices(input: PriceInput) {
  const container = ServiceContainer.getInstance();
  const priceRepo = container.getPriceRepository();
  
  const results = [];
  for (const portCode of input.port_codes) {
    const prices = await priceRepo.getLatestPrices({
      portCode,
      fuelTypes: input.fuel_types,
    });
    
    const history = await priceRepo.getPriceHistory({
      portCode,
      fuelType: input.fuel_types[0],
      limit: 1,
    });
    
    results.push({
      port_code: portCode,
      prices,
      updated_at: history[0]?.updatedAt,
    });
  }
  
  return formatForTool(results);
}
```

**Changes**:
- ✅ Removed direct JSON import
- ✅ Removed manual cache (`Map`)
- ✅ Uses `PriceRepository.getLatestPrices()`
- ✅ Uses `PriceRepository.getPriceHistory()` for freshness
- ✅ Automatic 3-tier fallback

### 3. port-weather.ts

**Before**:
```typescript
export async function checkPortWeather(input: PortWeatherInput) {
  // Direct API call to Open-Meteo
  const response = await fetch('https://marine-api.open-meteo.com/...');
  const data = await response.json();
  
  // Manual weather classification
  // Manual safety calculation
  // Manual retry logic
  
  return weatherResults;
}
```

**After**:
```typescript
import { ServiceContainer } from '@/lib/repositories/service-container';

export async function checkPortWeather(input: PortWeatherInput) {
  const container = ServiceContainer.getInstance();
  const weatherService = container.getWeatherService();
  
  const results = [];
  for (const port of input.bunker_ports) {
    const safety = await weatherService.checkPortWeatherSafety({
      portCode: port.port_code,
      date: new Date(port.estimated_arrival),
    });
    
    results.push({
      port_code: port.port_code,
      bunkering_feasible: safety.isSafe,
      weather_risk: classifyRisk(safety),
      recommendation: safety.recommendation,
    });
  }
  
  return results;
}
```

**Changes**:
- ✅ Removed direct API calls (moved to `OpenMeteoAPIClient`)
- ✅ Removed weather classification logic (moved to `WeatherService`)
- ✅ Removed retry logic (handled by API client)
- ✅ Uses `WeatherService.checkPortWeatherSafety()`

### 4. marine-weather.ts

**Before**:
```typescript
export async function fetchMarineWeather(input: MarineWeatherInput) {
  // Complex batching logic
  // Circuit breaker implementation
  // Retry with exponential backoff
  // Manual caching
  // Historical estimation
  
  return weatherData;
}
```

**After**:
```typescript
import { ServiceContainer } from '@/lib/repositories/service-container';

export async function fetchMarineWeather(input: MarineWeatherInput) {
  const container = ServiceContainer.getInstance();
  const weatherService = container.getWeatherService();
  
  const results = [];
  for (const position of input.positions) {
    const weather = await weatherService.fetchMarineWeather({
      latitude: position.lat,
      longitude: position.lon,
      date: new Date(position.datetime),
    });
    
    results.push({
      position: { lat: position.lat, lon: position.lon },
      datetime: position.datetime,
      weather: {
        wave_height_m: weather.waveHeight,
        wind_speed_knots: weather.windSpeed,
        wind_direction_deg: weather.windDirection,
        sea_state: classifySeaState(weather.waveHeight),
      },
      forecast_confidence: determineConfidence(position.datetime),
    });
  }
  
  return results;
}
```

**Changes**:
- ✅ Removed batching logic (handled by service)
- ✅ Removed circuit breaker (handled by API client)
- ✅ Removed retry logic (handled by API client)
- ✅ Removed manual caching (handled by service)
- ✅ Simplified to service calls

### 5. weather-consumption.ts

**Before**:
```typescript
function getWaveHeightMultiplier(waveHeightM: number): number {
  // Manual calculation
}

function getWindDirectionMultiplier(windDir: number, heading: number): number {
  // Manual calculation
}

export async function calculateWeatherConsumption(input: WeatherInput) {
  // Manual multiplier calculation for each data point
  // Manual averaging
  // Manual alerts generation
  
  return result;
}
```

**After**:
```typescript
import { ServiceContainer } from '@/lib/repositories/service-container';

export async function calculateWeatherConsumption(input: WeatherInput) {
  const container = ServiceContainer.getInstance();
  const weatherService = container.getWeatherService();
  
  const multipliers = [];
  for (const dataPoint of input.weather_data) {
    const impact = await weatherService.calculateWeatherImpact({
      weather: {
        waveHeight: dataPoint.weather.wave_height_m,
        windSpeed: dataPoint.weather.wind_speed_knots,
        windDirection: dataPoint.weather.wind_direction_deg,
        datetime: new Date(dataPoint.datetime),
      },
      vesselType: 'container',
      speed: 14,
    });
    
    multipliers.push(impact.multiplier);
  }
  
  const avgMultiplier = multipliers.reduce((a, b) => a + b, 0) / multipliers.length;
  // Calculate adjusted consumption...
  
  return result;
}
```

**Changes**:
- ✅ Removed multiplier calculation functions (moved to `WeatherService`)
- ✅ Uses `WeatherService.calculateWeatherImpact()`
- ✅ Simplified logic

### 6. bunker-analyzer.ts

**Before**:
```typescript
export async function analyzeBunkerOptions(input: BunkerInput) {
  // Direct access to port_prices input
  // Manual cost calculation
  // Manual deviation calculation
  // Manual ranking
  
  return analysis;
}
```

**After**:
```typescript
import { ServiceContainer } from '@/lib/repositories/service-container';

export async function analyzeBunkerOptions(input: BunkerInput) {
  const container = ServiceContainer.getInstance();
  const priceRepo = container.getPriceRepository();
  
  // Use repository if port_prices not provided (backwards compatibility)
  let pricesByPort = input.port_prices?.prices_by_port || {};
  
  if (Object.keys(pricesByPort).length === 0) {
    // Fetch from repository
    for (const port of input.bunker_ports) {
      const prices = await priceRepo.getLatestPrices({
        portCode: port.port_code,
        fuelTypes: [input.fuel_type],
      });
      // Build pricesByPort...
    }
  }
  
  // Rest of analysis logic...
  
  return analysis;
}
```

**Changes**:
- ✅ Added repository fallback for price data
- ✅ Maintains backwards compatibility with `port_prices` input
- ✅ Can fetch prices from repository if not provided

## Adding New Services

### Step 1: Create Service File

Create `frontend/lib/services/my-service.ts`:

```typescript
import { PortRepository } from '@/lib/repositories/port-repository';
import { RedisCache } from '@/lib/repositories/cache-client';

export class MyService {
  constructor(
    private portRepo: PortRepository,
    private cache: RedisCache
  ) {}

  async doSomething(params: { portCode: string }): Promise<Result> {
    // 1. Try cache
    const cacheKey = `fuelsense:my-service:${params.portCode}`;
    const cached = await this.cache.get<Result>(cacheKey);
    if (cached) return cached;

    // 2. Business logic
    const port = await this.portRepo.findByCode(params.portCode);
    if (!port) throw new Error('Port not found');

    const result: Result = {
      // ... calculate result
    };

    // 3. Cache result
    await this.cache.set(cacheKey, result, 3600); // 1 hour TTL

    return result;
  }
}
```

### Step 2: Add to ServiceContainer

Update `frontend/lib/repositories/service-container.ts`:

```typescript
import { MyService } from '@/lib/services/my-service';

export class ServiceContainer {
  private myService!: MyService;

  private initializeServices(): void {
    // ... existing services

    this.myService = new MyService(
      this.portRepo,
      this.cache as RedisCache
    );
  }

  public getMyService(): MyService {
    return this.myService;
  }
}
```

### Step 3: Use in Tool

```typescript
import { ServiceContainer } from '@/lib/repositories/service-container';

export async function myTool(input: ToolInput) {
  const container = ServiceContainer.getInstance();
  const myService = container.getMyService();
  
  const result = await myService.doSomething({
    portCode: input.port_code,
  });
  
  return formatForTool(result);
}
```

## Adding New Repositories

### Step 1: Create Repository File

Create `frontend/lib/repositories/my-repository.ts`:

```typescript
import { BaseRepository } from './base-repository';
import { RedisCache } from './cache-client';
import { SupabaseClient } from '@supabase/supabase-js';
import * as path from 'path';

export interface MyEntity {
  id: string;
  name: string;
  // ... other fields
}

export class MyRepository extends BaseRepository<MyEntity> {
  constructor(cache: RedisCache, db: SupabaseClient) {
    const fallbackPath = path.join(process.cwd(), 'frontend', 'lib', 'data');
    
    super(cache, db, {
      tableName: 'my_entities',
      fallbackPath,
    });
  }

  // Override cache TTL if needed
  protected getCacheTTL(): number {
    return 3600; // 1 hour
  }

  // Add custom query methods
  async findByName(name: string): Promise<MyEntity | null> {
    const cacheKey = `fuelsense:my_entities:name:${name}`;
    
    // Try cache
    const cached = await this.cache.get<MyEntity>(cacheKey);
    if (cached) return cached;

    // Try database
    const { data } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('name', name)
      .single();

    if (data) {
      await this.cache.set(cacheKey, data, this.getCacheTTL());
      return data as MyEntity;
    }

    // Try JSON fallback
    const fallback = await this.loadFromFallbackByName(name);
    if (fallback) {
      await this.cache.set(cacheKey, fallback, this.getCacheTTL());
      return fallback;
    }

    return null;
  }

  private async loadFromFallbackByName(name: string): Promise<MyEntity | null> {
    // Custom fallback logic
    // ...
  }
}
```

### Step 2: Create Database Table

Run SQL in Supabase:

```sql
CREATE TABLE IF NOT EXISTS my_entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- ... other columns
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_my_entities_name ON my_entities(name);
```

### Step 3: Add to ServiceContainer

Update `frontend/lib/repositories/service-container.ts`:

```typescript
import { MyRepository } from './my-repository';

export class ServiceContainer {
  private myRepo!: MyRepository;

  private initializeRepositories(): void {
    // ... existing repositories

    this.myRepo = new MyRepository(
      this.cache as RedisCache,
      this.db
    );
  }

  public getMyRepository(): MyRepository {
    return this.myRepo;
  }
}
```

### Step 4: Create JSON Fallback File

Create `frontend/lib/data/my_entities.json`:

```json
[
  {
    "id": "entity-1",
    "name": "Entity One"
  },
  {
    "id": "entity-2",
    "name": "Entity Two"
  }
]
```

## Migration Checklist

### Pre-Migration

- [ ] Review all tools that directly import JSON files
- [ ] Identify all API calls that should be moved to API clients
- [ ] Document current data access patterns
- [ ] Set up Upstash Redis account
- [ ] Set up Supabase account and create tables
- [ ] Configure environment variables

### During Migration

- [ ] Create repositories for each data type
- [ ] Create services for business logic
- [ ] Update ServiceContainer with new components
- [ ] Refactor tools to use services/repositories
- [ ] Remove direct JSON imports
- [ ] Remove manual caching logic
- [ ] Update tests to use ServiceContainer

### Post-Migration

- [ ] Verify all tools work correctly
- [ ] Check cache hit rates
- [ ] Verify database fallback works
- [ ] Verify JSON fallback works
- [ ] Run integration tests
- [ ] Update documentation
- [ ] Monitor error logs

### Testing

```bash
# Run integration tests
npm run test:integration:services

# Run performance benchmarks
npm run test:performance

# Check cache hit rates
# Look for [CACHE HIT] vs [DB HIT] vs [FALLBACK HIT] in logs
```

## Common Issues

### Issue: Tool still imports JSON directly

**Solution**: Replace with repository call:
```typescript
// ❌ Bad
import portsData from '@/lib/data/ports.json';

// ✅ Good
const container = ServiceContainer.getInstance();
const portRepo = container.getPortRepository();
const port = await portRepo.findByCode('SGSIN');
```

### Issue: Service not found in container

**Solution**: Ensure service is initialized in `ServiceContainer.initializeServices()`

### Issue: Cache always misses

**Solution**: 
1. Check Redis credentials
2. Verify `container.isCacheEnabled()` returns `true`
3. Check cache key format matches pattern

### Issue: Database fallback not working

**Solution**:
1. Verify JSON files exist in `frontend/lib/data/`
2. Check JSON format matches repository expectations
3. Verify fallback path in repository constructor

## Benefits Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Performance** | Slow (file I/O) | Fast (cached) |
| **Availability** | Single point of failure | 3-tier fallback |
| **Testability** | Difficult (file system) | Easy (DI) |
| **Scalability** | Limited | Database-backed |
| **Maintainability** | Low (scattered logic) | High (centralized) |

## Next Steps

- Read [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
- Read [API_REFERENCE.md](./API_REFERENCE.md) for API documentation
- Read [SETUP.md](./SETUP.md) for setup instructions
