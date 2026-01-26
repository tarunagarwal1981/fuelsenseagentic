# API Reference

Complete API reference for the FuelSense 360 Service and Repository layers.

## Table of Contents

1. [ServiceContainer](#servicecontainer)
2. [Repositories](#repositories)
   - [PortRepository](#portrepository)
   - [PriceRepository](#pricerepository)
   - [VesselRepository](#vesselrepository)
3. [Services](#services)
   - [RouteService](#routeservice)
   - [BunkerService](#bunkerservice)
   - [WeatherService](#weatherservice)
4. [Types](#types)
5. [Usage Examples](#usage-examples)

## ServiceContainer

The ServiceContainer provides dependency injection for all repositories and services.

### Methods

#### `getInstance(): ServiceContainer`

Get singleton instance of ServiceContainer.

```typescript
const container = ServiceContainer.getInstance();
```

#### `getPortRepository(): PortRepository`

Get PortRepository instance.

```typescript
const portRepo = container.getPortRepository();
```

#### `getPriceRepository(): PriceRepository`

Get PriceRepository instance.

```typescript
const priceRepo = container.getPriceRepository();
```

#### `getVesselRepository(): VesselRepository`

Get VesselRepository instance.

```typescript
const vesselRepo = container.getVesselRepository();
```

#### `getRouteService(): RouteService`

Get RouteService instance.

```typescript
const routeService = container.getRouteService();
```

#### `getBunkerService(): BunkerService`

Get BunkerService instance.

```typescript
const bunkerService = container.getBunkerService();
```

#### `getWeatherService(): WeatherService`

Get WeatherService instance.

```typescript
const weatherService = container.getWeatherService();
```

#### `isCacheEnabled(): boolean`

Check if Redis caching is enabled.

```typescript
if (container.isCacheEnabled()) {
  console.log('Cache is active');
}
```

#### `cleanup(): Promise<void>`

Clear all caches (useful for testing).

```typescript
await container.cleanup();
```

## Repositories

### PortRepository

Port data access with geospatial queries.

#### `findByCode(code: string): Promise<Port | null>`

Find port by UNLOCODE.

**Parameters**:
- `code` (string): Port code (e.g., "SGSIN")

**Returns**: `Promise<Port | null>`

**Example**:
```typescript
const port = await portRepo.findByCode('SGSIN');
if (port) {
  console.log(port.name); // "Singapore"
  console.log(port.coordinates); // [1.2897, 103.8501]
}
```

**Port Type**:
```typescript
interface Port {
  id: string;
  code: string;
  name: string;
  country: string;
  coordinates: [number, number]; // [lat, lon]
  bunkerCapable: boolean;
  fuelsAvailable: string[];
  timezone: string;
}
```

#### `findBunkerPorts(): Promise<Port[]>`

Get all bunker-capable ports.

**Returns**: `Promise<Port[]>`

**Example**:
```typescript
const bunkerPorts = await portRepo.findBunkerPorts();
console.log(`Found ${bunkerPorts.length} bunker ports`);
```

#### `findNearby(lat: number, lon: number, radiusNm: number): Promise<Port[]>`

Find ports within radius using Haversine formula.

**Parameters**:
- `lat` (number): Latitude in decimal degrees
- `lon` (number): Longitude in decimal degrees
- `radiusNm` (number): Search radius in nautical miles

**Returns**: `Promise<Port[]>`

**Example**:
```typescript
const nearbyPorts = await portRepo.findNearby(1.2897, 103.8501, 50);
// Find ports within 50nm of Singapore
```

#### `searchByName(query: string): Promise<Port[]>`

Case-insensitive name search.

**Parameters**:
- `query` (string): Search query

**Returns**: `Promise<Port[]>`

**Example**:
```typescript
const ports = await portRepo.searchByName('singapore');
// Returns ports matching "singapore" (case-insensitive)
```

### PriceRepository

Fuel price data access with time-series queries.

#### `getLatestPrices(query: PriceQuery): Promise<Record<string, number>>`

Get most recent prices for fuel types at a port.

**Parameters**:
```typescript
interface PriceQuery {
  portCode: string;
  fuelTypes: string[]; // e.g., ['VLSFO', 'LSGO']
}
```

**Returns**: `Promise<Record<string, number>>` - Map of fuelType → priceUSD

**Example**:
```typescript
const prices = await priceRepo.getLatestPrices({
  portCode: 'SGSIN',
  fuelTypes: ['VLSFO', 'LSGO'],
});

console.log(prices.VLSFO); // 650.50
console.log(prices.LSGO); // 720.00
```

#### `getPriceHistory(query: PriceHistoryQuery): Promise<FuelPrice[]>`

Get historical prices over time period.

**Parameters**:
```typescript
interface PriceHistoryQuery {
  portCode: string;
  fuelType: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number; // Default: 100
}
```

**Returns**: `Promise<FuelPrice[]>`

**Example**:
```typescript
const history = await priceRepo.getPriceHistory({
  portCode: 'SGSIN',
  fuelType: 'VLSFO',
  limit: 30, // Last 30 records
});

history.forEach(price => {
  console.log(`${price.date}: $${price.priceUSD}/MT`);
});
```

**FuelPrice Type**:
```typescript
interface FuelPrice {
  id?: string;
  portCode: string;
  fuelType: 'VLSFO' | 'LSGO' | 'MGO' | 'LSMGO';
  priceUSD: number;
  date: string; // YYYY-MM-DD
  source: string;
  updatedAt?: Date;
}
```

#### `getAveragePrices(query: AveragePriceQuery): Promise<Record<string, number>>`

Calculate average prices over period.

**Parameters**:
```typescript
interface AveragePriceQuery {
  portCode: string;
  fuelTypes: string[];
  startDate: Date;
  endDate: Date;
}
```

**Returns**: `Promise<Record<string, number>>`

**Example**:
```typescript
const averages = await priceRepo.getAveragePrices({
  portCode: 'SGSIN',
  fuelTypes: ['VLSFO'],
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31'),
});

console.log(`Average VLSFO price: $${averages.VLSFO}/MT`);
```

#### `addPrice(price: Omit<FuelPrice, 'id'>): Promise<FuelPrice>`

Insert new price record.

**Parameters**:
- `price`: FuelPrice without id

**Returns**: `Promise<FuelPrice>`

**Example**:
```typescript
const newPrice = await priceRepo.addPrice({
  portCode: 'SGSIN',
  fuelType: 'VLSFO',
  priceUSD: 650.50,
  date: '2024-01-15',
  source: 'manual',
});

console.log(`Created price record: ${newPrice.id}`);
```

### VesselRepository

Vessel profile data access with consumption calculations.

#### `findByName(name: string): Promise<VesselProfile | null>`

Find vessel by name (case-insensitive).

**Parameters**:
- `name` (string): Vessel name

**Returns**: `Promise<VesselProfile | null>`

**Example**:
```typescript
const vessel = await vesselRepo.findByName('MV Example');
```

#### `findByIMO(imo: string): Promise<VesselProfile | null>`

Find vessel by IMO number.

**Parameters**:
- `imo` (string): IMO number

**Returns**: `Promise<VesselProfile | null>`

**Example**:
```typescript
const vessel = await vesselRepo.findByIMO('1234567');
```

#### `getConsumptionAtSpeed(vesselId: string, speed: number): Promise<ConsumptionData | null>`

Interpolate consumption for given speed.

**Parameters**:
- `vesselId` (string): Vessel ID
- `speed` (number): Speed in knots

**Returns**: `Promise<ConsumptionData | null>`

**Example**:
```typescript
const consumption = await vesselRepo.getConsumptionAtSpeed('vessel-001', 14);
if (consumption) {
  console.log(`VLSFO: ${consumption.vlsfo} MT/day`);
  console.log(`MGO: ${consumption.mgo} MT/day`);
}
```

**ConsumptionData Type**:
```typescript
interface ConsumptionData {
  speed: number;
  vlsfo: number; // MT/day
  mgo: number; // MT/day
  total: number; // MT/day
}
```

#### `validateCapacity(vesselId: string, rob: { VLSFO: number; LSMGO: number }): Promise<boolean>`

Check if ROB values fit within vessel capacity.

**Parameters**:
- `vesselId` (string): Vessel ID
- `rob`: Remaining on Board fuel quantities

**Returns**: `Promise<boolean>`

**Example**:
```typescript
const isValid = await vesselRepo.validateCapacity('vessel-001', {
  VLSFO: 500,
  LSMGO: 100,
});

if (!isValid) {
  console.error('ROB exceeds vessel capacity!');
}
```

**VesselProfile Type**:
```typescript
interface VesselProfile {
  id: string;
  name: string;
  imo?: string;
  vesselType: string;
  dwt: number;
  currentROB?: {
    VLSFO: number;
    LSMGO: number;
    lastUpdated?: Date;
  };
  tankCapacity: {
    VLSFO: number;
    LSMGO: number;
    total: number;
  };
  atSea: Array<{
    speed: number;
    vlsfo: number;
    mgo: number;
  }>;
  inPort: {
    vlsfo: number;
    mgo: number;
  };
  operationalSpeed: number;
}
```

## Services

### RouteService

Route calculation with ECA zone detection and timeline calculation.

#### `calculateRoute(params: RouteParams): Promise<RouteData>`

Calculate route between two ports.

**Parameters**:
```typescript
interface RouteParams {
  origin: string; // Port code
  destination: string; // Port code
  speed: number; // Knots
  departureDate: Date;
}
```

**Returns**: `Promise<RouteData>`

**Example**:
```typescript
const route = await routeService.calculateRoute({
  origin: 'SGSIN',
  destination: 'USNYC',
  speed: 14,
  departureDate: new Date('2024-02-01'),
});

console.log(`Distance: ${route.totalDistanceNm} nm`);
console.log(`Estimated hours: ${route.estimatedHours}`);
console.log(`Route type: ${route.routeType}`);
console.log(`ECA segments: ${route.ecaSegments.length}`);
```

**RouteData Type**:
```typescript
interface RouteData {
  origin: Port;
  destination: Port;
  waypoints: Waypoint[];
  totalDistanceNm: number;
  timeline: Timeline;
  ecaSegments: ECASegment[];
  estimatedHours: number;
  routeType: string;
}

interface Waypoint {
  coordinates: [number, number]; // [lat, lon]
  distanceFromPreviousNm: number;
  distanceFromStartNm: number;
  inECA: boolean;
  ecaZoneName?: string;
}

interface TimelineEntry {
  waypoint: Waypoint;
  eta: Date;
  distanceFromStartNm: number;
}

interface ECASegment {
  startWaypointIndex: number;
  endWaypointIndex: number;
  zoneName: string;
  distanceNm: number;
  startTime: Date;
  endTime: Date;
}
```

### BunkerService

Bunker port finding and analysis.

#### `findBunkerPorts(params: FindBunkerPortsParams): Promise<BunkerPort[]>`

Find bunker ports near a route.

**Parameters**:
```typescript
interface FindBunkerPortsParams {
  route: RouteData;
  maxDeviation: number; // Nautical miles
  fuelTypes: string[]; // e.g., ['VLSFO', 'LSGO']
}
```

**Returns**: `Promise<BunkerPort[]>`

**Example**:
```typescript
const route = await routeService.calculateRoute({...});

const bunkerPorts = await bunkerService.findBunkerPorts({
  route,
  maxDeviation: 100, // Within 100nm of route
  fuelTypes: ['VLSFO', 'LSGO'],
});

bunkerPorts.forEach(port => {
  console.log(`${port.name}: ${port.deviation}nm deviation`);
});
```

**BunkerPort Type**:
```typescript
interface BunkerPort {
  code: string;
  name: string;
  country: string;
  coordinates: [number, number];
  deviation: number; // Nautical miles from route
  fuelsAvailable: string[];
}
```

#### `analyzeBunkerOptions(params: AnalyzeBunkerOptionsParams): Promise<BunkerAnalysis>`

Analyze bunker options and rank by total cost.

**Parameters**:
```typescript
interface AnalyzeBunkerOptionsParams {
  ports: BunkerPort[];
  requiredFuel: number; // MT
  currentROB: number; // MT
  fuelType: string;
}
```

**Returns**: `Promise<BunkerAnalysis>`

**Example**:
```typescript
const analysis = await bunkerService.analyzeBunkerOptions({
  ports: bunkerPorts,
  requiredFuel: 1000,
  currentROB: 500,
  fuelType: 'VLSFO',
});

if (analysis.recommended) {
  console.log(`Best option: ${analysis.recommended.port.name}`);
  console.log(`Total cost: $${analysis.recommended.totalCost}`);
  console.log(`Savings: $${analysis.savings}`);
}
```

**BunkerAnalysis Type**:
```typescript
interface BunkerAnalysis {
  options: BunkerOption[];
  recommended: BunkerOption | null;
  savings: number; // USD
}

interface BunkerOption {
  port: BunkerPort;
  fuelType: string;
  pricePerMT: number;
  quantity: number;
  bunkerCost: number;
  deviationCost: number;
  totalCost: number;
}
```

### WeatherService

Marine weather fetching and impact analysis.

#### `fetchMarineWeather(params: FetchMarineWeatherParams): Promise<MarineWeather>`

Fetch weather forecast for location and date.

**Parameters**:
```typescript
interface FetchMarineWeatherParams {
  latitude: number;
  longitude: number;
  date: Date;
}
```

**Returns**: `Promise<MarineWeather>`

**Example**:
```typescript
const weather = await weatherService.fetchMarineWeather({
  latitude: 1.2897,
  longitude: 103.8501,
  date: new Date('2024-02-01'),
});

console.log(`Wave height: ${weather.waveHeight}m`);
console.log(`Wind speed: ${weather.windSpeed} knots`);
console.log(`Wind direction: ${weather.windDirection}°`);
```

**MarineWeather Type**:
```typescript
interface MarineWeather {
  waveHeight: number; // Meters
  windSpeed: number; // Knots
  windDirection: number; // Degrees (0-360)
  datetime: Date;
}
```

#### `calculateWeatherImpact(params: CalculateWeatherImpactParams): Promise<WeatherImpact>`

Calculate fuel consumption multiplier based on weather.

**Parameters**:
```typescript
interface CalculateWeatherImpactParams {
  weather: MarineWeather;
  vesselType: string;
  speed: number; // Knots
}
```

**Returns**: `Promise<WeatherImpact>`

**Example**:
```typescript
const impact = await weatherService.calculateWeatherImpact({
  weather,
  vesselType: 'container',
  speed: 14,
});

console.log(`Consumption multiplier: ${impact.multiplier}`);
console.log(`Safety rating: ${impact.safetyRating}`);
console.log(`Recommendation: ${impact.recommendation}`);
```

**WeatherImpact Type**:
```typescript
interface WeatherImpact {
  multiplier: number; // e.g., 1.15 = 15% increase
  safetyRating: 'safe' | 'caution' | 'unsafe';
  recommendation: string;
}
```

#### `checkPortWeatherSafety(params: CheckPortWeatherSafetyParams): Promise<PortWeatherSafety>`

Assess bunkering safety based on weather conditions.

**Parameters**:
```typescript
interface CheckPortWeatherSafetyParams {
  portCode: string;
  date: Date;
}
```

**Returns**: `Promise<PortWeatherSafety>`

**Example**:
```typescript
const safety = await weatherService.checkPortWeatherSafety({
  portCode: 'SGSIN',
  date: new Date('2024-02-01'),
});

if (safety.isSafe) {
  console.log('✅ Safe for bunkering');
} else {
  console.log('⚠️ Unsafe conditions:', safety.restrictions);
}
console.log(safety.recommendation);
```

**PortWeatherSafety Type**:
```typescript
interface PortWeatherSafety {
  portCode: string;
  date: Date;
  weather: MarineWeather;
  isSafe: boolean;
  restrictions: string[];
  recommendation: string;
}
```

## Usage Examples

### Complete Bunker Planning Flow

```typescript
import { ServiceContainer } from '@/lib/repositories/service-container';

async function planBunkering() {
  const container = ServiceContainer.getInstance();
  const routeService = container.getRouteService();
  const bunkerService = container.getBunkerService();
  const weatherService = container.getWeatherService();
  const priceRepo = container.getPriceRepository();

  // 1. Calculate route
  const route = await routeService.calculateRoute({
    origin: 'SGSIN',
    destination: 'USNYC',
    speed: 14,
    departureDate: new Date('2024-02-01'),
  });

  // 2. Find bunker ports
  const bunkerPorts = await bunkerService.findBunkerPorts({
    route,
    maxDeviation: 100,
    fuelTypes: ['VLSFO', 'LSGO'],
  });

  // 3. Analyze options
  const analysis = await bunkerService.analyzeBunkerOptions({
    ports: bunkerPorts,
    requiredFuel: 1000,
    currentROB: 500,
    fuelType: 'VLSFO',
  });

  // 4. Check weather for recommended port
  if (analysis.recommended) {
    const safety = await weatherService.checkPortWeatherSafety({
      portCode: analysis.recommended.port.code,
      date: new Date('2024-02-05'), // Estimated arrival
    });

    console.log('Recommended port:', analysis.recommended.port.name);
    console.log('Total cost:', analysis.recommended.totalCost);
    console.log('Weather safe:', safety.isSafe);
  }
}
```

### Price Monitoring

```typescript
async function monitorPrices() {
  const container = ServiceContainer.getInstance();
  const priceRepo = container.getPriceRepository();

  const ports = ['SGSIN', 'USNYC', 'GBLON'];
  const fuelTypes = ['VLSFO', 'LSGO'];

  for (const portCode of ports) {
    const prices = await priceRepo.getLatestPrices({
      portCode,
      fuelTypes,
    });

    console.log(`${portCode}:`);
    console.log(`  VLSFO: $${prices.VLSFO}/MT`);
    console.log(`  LSGO: $${prices.LSGO}/MT`);

    // Get price history
    const history = await priceRepo.getPriceHistory({
      portCode,
      fuelType: 'VLSFO',
      limit: 7, // Last 7 days
    });

    const avgPrice = history.reduce((sum, p) => sum + p.priceUSD, 0) / history.length;
    console.log(`  Average (7 days): $${avgPrice.toFixed(2)}/MT`);
  }
}
```

### Vessel Consumption Analysis

```typescript
async function analyzeConsumption() {
  const container = ServiceContainer.getInstance();
  const vesselRepo = container.getVesselRepository();

  const vessel = await vesselRepo.findByName('MV Example');
  if (!vessel) return;

  // Get consumption at different speeds
  const speeds = [12, 14, 16, 18];
  for (const speed of speeds) {
    const consumption = await vesselRepo.getConsumptionAtSpeed(vessel.id, speed);
    if (consumption) {
      console.log(`${speed} knots: ${consumption.total} MT/day`);
    }
  }

  // Validate capacity
  const isValid = await vesselRepo.validateCapacity(vessel.id, {
    VLSFO: 500,
    LSMGO: 100,
  });

  console.log('Capacity valid:', isValid);
}
```

## Error Handling

All repository and service methods throw errors that should be caught:

```typescript
try {
  const port = await portRepo.findByCode('INVALID');
  if (!port) {
    console.log('Port not found');
  }
} catch (error) {
  console.error('Error fetching port:', error);
}
```

Common errors:
- **Port not found**: Returns `null` (not an error)
- **Database connection failure**: Falls back to JSON, logs warning
- **Cache failure**: Falls back to database, logs warning
- **Invalid input**: Throws validation error

## Performance Considerations

- **Caching**: First request hits database/JSON, subsequent requests use cache
- **Cache TTL**: 
  - Ports: 24 hours
  - Prices: 1 hour
  - Routes: 1 hour
  - Weather: 15 minutes
- **Batch Operations**: Use `Promise.all()` for parallel requests when possible
- **Database Queries**: Use indexes for frequently queried fields

## Next Steps

- Read [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
- Read [SETUP.md](./SETUP.md) for setup instructions
- Read [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for migration guide
