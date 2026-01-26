# Tool Implementation Analysis

## Overview
This document provides a comprehensive analysis of all tool files in the codebase, identifying their current implementation approach and refactoring status.

## Tool Locations

### Frontend Tools (`/frontend/lib/tools/`)
Primary tool implementations used by the multi-agent system.

### Legacy Tools (`/lib/tools/`)
Legacy implementations that may still be referenced but should be migrated.

### Tool Wrappers
- `/frontend/lib/multi-agent/tools.ts` - LangChain tool wrappers for multi-agent system
- `/frontend/lib/langgraph/tools.ts` - LangChain tool wrappers for LangGraph system
- `/lib/langgraph/tools.ts` - Legacy LangGraph tool wrappers

---

## Summary Table

| Tool Name | Current Location | Uses Services? | Needs Refactoring? | Old Pattern Found |
|-----------|-----------------|----------------|-------------------|-------------------|
| **calculate-route** | `/frontend/lib/tools/route-calculator.ts` | ✅ Yes (RouteService) | ❌ No | ❌ No |
| **find-bunker-ports** | `/frontend/lib/tools/port-finder.ts` | ❌ No | ✅ Yes | ✅ Yes (`import('@/lib/data/ports.json')`) |
| **find-bunker-ports** | `/frontend/lib/tools/bunker/find-bunker-ports.ts` | ✅ Yes (RouteService, BunkerService) | ❌ No | ❌ No |
| **get-fuel-prices** | `/frontend/lib/tools/price-fetcher.ts` | ✅ Yes (PriceRepository) | ❌ No | ❌ No |
| **analyze-bunker-options** | `/frontend/lib/tools/bunker-analyzer.ts` | ✅ Yes (PriceRepository) | ❌ No | ❌ No |
| **calculate-weather-timeline** | `/frontend/lib/tools/weather-timeline.ts` | N/A (Pure calculation) | ❌ No | ❌ No |
| **fetch-marine-weather** | `/frontend/lib/tools/marine-weather.ts` | ✅ Yes (WeatherService) | ❌ No | ❌ No |
| **calculate-weather-consumption** | `/frontend/lib/tools/weather-consumption.ts` | ✅ Yes (WeatherService) | ❌ No | ❌ No |
| **check-port-weather** | `/frontend/lib/tools/port-weather.ts` | ✅ Yes (WeatherService) | ❌ No | ❌ No |
| **calculate-route** (legacy) | `/lib/tools/route-calculator.ts` | ❌ No | ✅ Yes | ✅ Yes (`import('@/lib/data/ports.json')`, direct API calls) |
| **find-bunker-ports** (legacy) | `/lib/tools/port-finder.ts` | ❌ No | ✅ Yes | ✅ Yes (`import('@/lib/data/ports.json')`) |
| **get-fuel-prices** (legacy) | `/lib/tools/price-fetcher.ts` | ❌ No | ✅ Yes | ✅ Yes (`import('@/lib/data/prices.json')`) |
| **analyze-bunker-options** (legacy) | `/lib/tools/bunker-analyzer.ts` | ❌ No | ⚠️ Partial | Uses other legacy tools |

---

## Detailed Tool Analysis

### ✅ Refactored Tools (Using Services)

#### 1. `/frontend/lib/tools/route-calculator.ts`
- **Status**: ✅ Fully refactored
- **Uses**: `ServiceContainer.getRouteService()`
- **Implementation**: Delegates all route calculation to RouteService
- **Dependencies**: RouteService, PortRepository (via RouteService)
- **Notes**: Clean service layer implementation

#### 2. `/frontend/lib/tools/price-fetcher.ts`
- **Status**: ✅ Fully refactored
- **Uses**: `ServiceContainer.getPriceRepository()`
- **Implementation**: Uses PriceRepository for all price data access
- **Dependencies**: PriceRepository
- **Notes**: Properly uses repository pattern

#### 3. `/frontend/lib/tools/bunker-analyzer.ts`
- **Status**: ✅ Fully refactored
- **Uses**: `ServiceContainer.getPriceRepository()`
- **Implementation**: Uses PriceRepository for price data
- **Dependencies**: PriceRepository, FoundPort (from port-finder)
- **Notes**: Can fallback to fetching prices if not provided

#### 4. `/frontend/lib/tools/bunker/find-bunker-ports.ts`
- **Status**: ✅ Fully refactored
- **Uses**: `ServiceContainer.getRouteService()`, `ServiceContainer.getBunkerService()`
- **Implementation**: Uses RouteService and BunkerService
- **Dependencies**: RouteService, BunkerService
- **Notes**: Modern service-based implementation

#### 5. `/frontend/lib/tools/marine-weather.ts`
- **Status**: ✅ Fully refactored
- **Uses**: `ServiceContainer.getWeatherService()`
- **Implementation**: Uses WeatherService for weather fetching
- **Dependencies**: WeatherService
- **Notes**: Clean service layer implementation

#### 6. `/frontend/lib/tools/weather-consumption.ts`
- **Status**: ✅ Fully refactored
- **Uses**: `ServiceContainer.getWeatherService()`
- **Implementation**: Uses WeatherService for weather impact calculation
- **Dependencies**: WeatherService
- **Notes**: Properly uses service layer

#### 7. `/frontend/lib/tools/port-weather.ts`
- **Status**: ✅ Fully refactored
- **Uses**: `ServiceContainer.getWeatherService()`
- **Implementation**: Uses WeatherService for port weather safety checks
- **Dependencies**: WeatherService
- **Notes**: Clean service layer implementation

#### 8. `/frontend/lib/tools/weather-timeline.ts`
- **Status**: ✅ No refactoring needed
- **Uses**: N/A (Pure calculation tool)
- **Implementation**: Pure mathematical calculations, no data access
- **Dependencies**: None
- **Notes**: No data access, no refactoring needed

---

### ❌ Tools Needing Refactoring

#### 1. `/frontend/lib/tools/port-finder.ts`
- **Status**: ❌ Needs refactoring
- **Current Implementation**: 
  ```typescript
  const portsModule = await import('@/lib/data/ports.json');
  ```
- **Should Use**: `ServiceContainer.getPortRepository()` or `BunkerService`
- **Dependencies Needed**: PortRepository or BunkerService
- **Priority**: 🔴 HIGH (Active tool used by agents)

#### 2. `/lib/tools/route-calculator.ts` (Legacy)
- **Status**: ❌ Needs refactoring
- **Current Implementation**: 
  ```typescript
  const portsModule = await import('@/lib/data/ports.json');
  // Direct API calls to Maritime Route API
  ```
- **Should Use**: `ServiceContainer.getRouteService()`
- **Dependencies Needed**: RouteService
- **Priority**: 🟡 MEDIUM (Legacy, may not be actively used)

#### 3. `/lib/tools/port-finder.ts` (Legacy)
- **Status**: ❌ Needs refactoring
- **Current Implementation**: 
  ```typescript
  const portsModule = await import('@/lib/data/ports.json');
  ```
- **Should Use**: `ServiceContainer.getPortRepository()` or `BunkerService`
- **Dependencies Needed**: PortRepository or BunkerService
- **Priority**: 🟡 MEDIUM (Legacy, may not be actively used)

#### 4. `/lib/tools/price-fetcher.ts` (Legacy)
- **Status**: ❌ Needs refactoring
- **Current Implementation**: 
  ```typescript
  const pricesModule = await import('@/lib/data/prices.json');
  ```
- **Should Use**: `ServiceContainer.getPriceRepository()`
- **Dependencies Needed**: PriceRepository
- **Priority**: 🟡 MEDIUM (Legacy, may not be actively used)

#### 5. `/lib/tools/bunker-analyzer.ts` (Legacy)
- **Status**: ⚠️ Partial refactoring needed
- **Current Implementation**: Uses other legacy tools (port-finder, price-fetcher)
- **Should Use**: `ServiceContainer.getPriceRepository()`
- **Dependencies Needed**: PriceRepository
- **Priority**: 🟡 MEDIUM (Legacy, depends on other legacy tools)

---

## Old Code Patterns Found

### Pattern 1: Direct JSON Import
```typescript
// ❌ OLD PATTERN
const portsModule = await import('@/lib/data/ports.json');
const pricesModule = await import('@/lib/data/prices.json');
```

**Found in:**
- `/frontend/lib/tools/port-finder.ts` (line 143)
- `/lib/tools/port-finder.ts` (line 143)
- `/lib/tools/price-fetcher.ts` (line 109)
- `/lib/tools/route-calculator.ts` (line 142)

### Pattern 2: Direct API Calls Without Services
```typescript
// ❌ OLD PATTERN
const response = await fetch(`${apiUrl}?${params.toString()}`, {
  method: 'GET',
  // ...
});
```

**Found in:**
- `/lib/tools/route-calculator.ts` (direct Maritime Route API calls)

### Pattern 3: fs.readFileSync (Node.js only)
```typescript
// ❌ OLD PATTERN (Node.js only, won't work in Edge runtime)
const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
```

**Found in:**
- Scripts only (`/scripts/collect-routes.ts`, `/scripts/update-ports-from-csv.ts`)
- Config loaders (acceptable for server-side only code)

---

## Files That Definitely Need Refactoring

### High Priority (Active Tools)
1. **`/frontend/lib/tools/port-finder.ts`**
   - Currently uses: `import('@/lib/data/ports.json')`
   - Should use: `PortRepository` or `BunkerService`
   - Impact: Used by active agents in production

### Medium Priority (Legacy Tools)
2. **`/lib/tools/route-calculator.ts`**
   - Currently uses: `import('@/lib/data/ports.json')` + direct API calls
   - Should use: `RouteService`
   - Impact: Legacy code, may not be actively used

3. **`/lib/tools/port-finder.ts`**
   - Currently uses: `import('@/lib/data/ports.json')`
   - Should use: `PortRepository` or `BunkerService`
   - Impact: Legacy code, may not be actively used

4. **`/lib/tools/price-fetcher.ts`**
   - Currently uses: `import('@/lib/data/prices.json')`
   - Should use: `PriceRepository`
   - Impact: Legacy code, may not be actively used

5. **`/lib/tools/bunker-analyzer.ts`**
   - Currently uses: Other legacy tools
   - Should use: `PriceRepository`
   - Impact: Legacy code, depends on other legacy tools

---

## Service/Repository Dependencies

### Services Available
- ✅ `RouteService` - Route calculation, ECA detection, timeline
- ✅ `WeatherService` - Weather fetching, impact calculation, port safety
- ✅ `BunkerService` - Bunker port finding
- ✅ `PriceRepository` - Price data access
- ✅ `PortRepository` - Port data access (if exists)

### Tools Using Services
- ✅ `route-calculator.ts` → RouteService
- ✅ `price-fetcher.ts` → PriceRepository
- ✅ `bunker-analyzer.ts` → PriceRepository
- ✅ `bunker/find-bunker-ports.ts` → RouteService, BunkerService
- ✅ `marine-weather.ts` → WeatherService
- ✅ `weather-consumption.ts` → WeatherService
- ✅ `port-weather.ts` → WeatherService

### Tools NOT Using Services
- ❌ `port-finder.ts` → Should use PortRepository or BunkerService
- ❌ Legacy tools → Should migrate to services

---

## Recommendations

### Immediate Actions
1. **Refactor `/frontend/lib/tools/port-finder.ts`** (HIGH PRIORITY)
   - Replace `import('@/lib/data/ports.json')` with `PortRepository` or `BunkerService`
   - This is the only active tool still using old patterns

### Future Actions
2. **Audit legacy tools** (`/lib/tools/`)
   - Determine if they're still being used
   - If unused, consider deprecation/removal
   - If used, migrate to service layer

3. **Consolidate duplicate tools**
   - `port-finder.ts` exists in both `/frontend/lib/tools/` and `/lib/tools/`
   - Consider removing legacy versions once refactored

### Testing
- After refactoring, ensure all tool tests pass
- Verify agent workflows still function correctly
- Check that tool wrappers (`/frontend/lib/multi-agent/tools.ts`, etc.) still work

---

## Tool Registration

Tools are registered in:
- `/frontend/lib/registry/tools/index.ts` - Central tool registry
- `/frontend/lib/multi-agent/tools.ts` - LangChain wrappers for multi-agent system
- `/frontend/lib/langgraph/tools.ts` - LangChain wrappers for LangGraph system

Tool execution functions (`execute*Tool`) are imported from individual tool files and wrapped with LangChain tool wrappers.

---

## Summary Statistics

- **Total Tools Analyzed**: 13
- **Fully Refactored**: 8 ✅
- **Needs Refactoring**: 4 ❌
- **Partial Refactoring**: 1 ⚠️
- **No Refactoring Needed**: 1 (pure calculation)

- **Active Tools Using Old Patterns**: 1 (`/frontend/lib/tools/port-finder.ts`)
- **Legacy Tools Using Old Patterns**: 4 (`/lib/tools/*`)

---

*Generated: 2026-01-26*
