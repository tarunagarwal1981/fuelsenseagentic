# Route Cache & UI Optimization - Implementation Plan

## Overview
Implement a route caching system with a beautiful route selector UI in the right pane, optimizing chat area space and providing fallback route data.

## Phase 1: Route Data Collection

### 1.1 Create Route Collection Script
**File**: `scripts/collect-routes.ts`

**Routes to Collect** (10 common/complex routes):
1. Singapore (SGSIN) → Dubai (AEDXB) - Via Suez
2. Singapore (SGSIN) → Rotterdam (NLRTM) - Via Suez
3. Dubai (AEDXB) → Rotterdam (NLRTM) - Via Suez
4. Singapore (SGSIN) → Fujairah (AEFJR) - Short route
5. Rotterdam (NLRTM) → Singapore (SGSIN) - Return route
6. Singapore (SGSIN) → Colombo (LKCMB) - Indian Ocean
7. Dubai (AEDXB) → Port Said (EGPSD) - Red Sea
8. Rotterdam (NLRTM) → Dubai (AEDXB) - Via Suez
9. Singapore (SGSIN) → Mumbai (INMUN) - Indian Ocean
10. Fujairah (AEFJR) → Rotterdam (NLRTM) - Via Suez

**Script Functionality**:
- Call route API for each route
- Store complete route data (waypoints, distance, duration, route_type)
- Handle timeouts gracefully (retry with longer timeout)
- Save to `frontend/lib/data/cached-routes.json`

**Output Format**:
```json
{
  "routes": [
    {
      "id": "SGSIN-AEDXB",
      "origin_port_code": "SGSIN",
      "destination_port_code": "AEDXB",
      "origin_name": "Singapore",
      "destination_name": "Dubai",
      "distance_nm": 5234.5,
      "estimated_hours": 373.9,
      "route_type": "via Suez Canal",
      "waypoints": [...],
      "cached_at": "2024-12-22T...",
      "popularity": "high"
    },
    ...
  ]
}
```

### 1.2 Execute Script
- Run script via terminal
- Collect all 10 routes
- Verify data completeness
- Store in JSON file

## Phase 2: UI Layout Optimization

### 2.1 Layout Restructure
**Current**: Main content (flex-1) + Right pane (w-64) for performance metrics

**New Layout**:
```
┌─────────────────────────────────────────────────────────┐
│ Header (unchanged)                                       │
├──────────────────────────────┬──────────────────────────┤
│                              │                          │
│  Chat Area (flex-1, min-0)  │  Right Pane (w-80)      │
│  - Messages                  │  - Route Selector       │
│  - Analysis Results         │  - Performance Metrics   │
│  - Map                      │    (collapsible/mini)   │
│                              │                          │
│  Input Area (flex-shrink-0) │                          │
└──────────────────────────────┴──────────────────────────┘
```

**Changes**:
- Right pane: `w-80` (320px) instead of `w-64` (256px) for better route display
- Chat area: `flex-1 min-w-0` to take maximum space
- Performance metrics: Collapsible or smaller section

### 2.2 Right Pane Components

**Route Selector Section** (Primary):
- Beautiful card-based route list
- Each route shows:
  - Origin → Destination
  - Distance (nm)
  - Estimated time
  - Route type badge
  - Click to select
- Search/filter routes
- Selected route highlighted

**Performance Metrics Section** (Secondary):
- Collapsible accordion
- Smaller, compact display
- Or moved to bottom of pane

## Phase 3: Route Selection & Caching Logic

### 3.1 State Management
**Add to component state**:
```typescript
const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
const [cachedRoutes, setCachedRoutes] = useState<CachedRoute[]>([]);
```

### 3.2 Route Selection Flow

**Option A: User selects route from pane**
1. User clicks route in right pane
2. Set `selectedRoute` state
3. Load cached route data
4. Populate route_data in state
5. Continue with weather/bunker analysis

**Option B: User types query**
1. Extract origin/destination from query
2. Check if route exists in cache
3. If yes: Use cached data immediately
4. If no: Try API call
5. If API fails: Check for similar route in cache (fallback)
6. Continue with analysis

### 3.3 Fallback Logic
**In route agent**:
```typescript
// Try API first
try {
  routeResult = await calculateRoute(...);
} catch (error) {
  // Check cache for this route
  const cachedRoute = findCachedRoute(origin, destination);
  if (cachedRoute) {
    routeResult = cachedRoute; // Use cached data
    console.log('Using cached route data');
  } else {
    throw error; // No cache, fail
  }
}
```

## Phase 4: Integration Points

### 4.1 Route Agent Node
- Check for selected route first
- If selected, use cached data
- Otherwise, try API with fallback to cache

### 4.2 Supervisor Logic
- No changes needed (already handles route failures)

### 4.3 Finalize Node
- Indicate when cached route was used
- Show route source (API vs Cache)

## Phase 5: UI Components

### 5.1 Route Selector Component
**File**: `frontend/components/route-selector.tsx`

**Features**:
- Beautiful card grid
- Route badges (popularity, route type)
- Click handler
- Search/filter
- Selected state styling

### 5.2 Performance Metrics Component
**File**: `frontend/components/performance-metrics-pane.tsx`

**Features**:
- Collapsible accordion
- Compact display
- Toggle show/hide

## Implementation Order

1. ✅ Create route collection script
2. ✅ Execute script to collect 10 routes
3. ✅ Create route selector component
4. ✅ Update layout (chat area optimization)
5. ✅ Add route selection state management
6. ✅ Integrate cached route loading in route agent
7. ✅ Add fallback logic
8. ✅ Update finalize to indicate cache usage
9. ✅ Test end-to-end flow

## Files to Create/Modify

### New Files:
- `scripts/collect-routes.ts` - Route collection script
- `frontend/lib/data/cached-routes.json` - Cached route data
- `frontend/components/route-selector.tsx` - Route selector UI
- `frontend/components/performance-metrics-pane.tsx` - Compact metrics

### Modified Files:
- `frontend/components/chat-interface-multi-agent.tsx` - Layout & route selection
- `frontend/lib/multi-agent/agent-nodes.ts` - Route agent fallback logic
- `frontend/lib/tools/route-calculator.ts` - Add cache lookup function

## Success Criteria

- ✅ 10 routes collected and stored in JSON
- ✅ Beautiful route selector in right pane
- ✅ Chat area optimized for maximum space
- ✅ Route selection works seamlessly
- ✅ Fallback to cache when API fails
- ✅ All existing functionality preserved
- ✅ Map plotting works with cached routes
- ✅ Weather calculations work with cached routes
- ✅ Bunker analysis works with cached routes

