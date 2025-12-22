# Route Calculation Timeout - Problem Analysis & Solutions

## Problem Statement

The Maritime Route API (`https://maritime-route-api.onrender.com`) is consistently timing out after 20 seconds for certain routes (e.g., Singapore to Dubai). This causes:

1. **Route agent fails** → Marks itself as `failed` to prevent retry loops ✅ (working correctly)
2. **Supervisor detects failure** → Routes to finalize ✅ (working correctly)  
3. **Finalize provides error message** → User-friendly explanation ✅ (working correctly)
4. **BUT**: No bunker analysis can be performed because bunker agent requires route waypoints

## Root Cause Analysis

### Why is the API timing out?

1. **External API on Render free tier**:
   - Cold starts (first request after inactivity can take 30+ seconds)
   - Resource limitations on free tier
   - Network latency to Render infrastructure

2. **Route complexity**:
   - Singapore to Dubai route may require complex calculations (Suez Canal routing, multiple waypoints)
   - Some routes are computationally expensive

3. **API availability**:
   - Service may be temporarily overloaded
   - Network issues between Netlify and Render

### Why previous queries worked?

- Simpler routes (e.g., Singapore to Rotterdam) may be faster
- API was "warm" (already running, no cold start)
- Different network conditions

## Impact Assessment

### Current Behavior (Working Correctly)
- ✅ Fails fast (20 seconds timeout)
- ✅ Prevents infinite retry loops
- ✅ Provides clear error messages
- ✅ No system crashes or hangs

### What's Missing
- ❌ Cannot provide bunker recommendations when route API fails
- ❌ No fallback mechanism
- ❌ Users get no value when route calculation fails

## Proposed Solutions

### Solution 1: Fallback to Known Common Ports (RECOMMENDED)
**Approach**: When route calculation fails, use a database of common bunker ports for popular routes.

**Pros**:
- Provides value even when route API fails
- Doesn't break existing functionality (if route works, use it)
- Simple to implement
- No changes to timeout/retry logic

**Cons**:
- Less precise than actual route-based analysis
- Requires maintaining a database of common routes

**Implementation**:
1. Create a fallback database mapping common routes to typical bunker ports
2. When route agent fails, supervisor checks if we have a fallback for this route
3. If yes, create synthetic route waypoints (origin → common ports → destination)
4. Continue with bunker analysis using synthetic waypoints
5. Clearly indicate in final response that fallback data was used

**Example**:
```typescript
// Singapore to Dubai fallback
{
  route: "SGSIN-AEDXB",
  common_ports: ["AEFJR", "EGPSD", "LKCMB"], // Fujairah, Port Said, Colombo
  synthetic_waypoints: [
    {lat: 1.29, lon: 103.85},  // Singapore
    {lat: 6.93, lon: 79.85},  // Colombo
    {lat: 31.26, lon: 32.3},  // Port Said
    {lat: 25.12, lon: 56.33}, // Fujairah
    {lat: 25.27, lon: 55.29}  // Dubai
  ]
}
```

### Solution 2: Increase Timeout (NOT RECOMMENDED)
**Approach**: Increase timeout from 20s to 30-40s.

**Pros**:
- Simple change
- May catch slow but successful responses

**Cons**:
- Still fails if API is genuinely down
- Longer wait time for users
- Doesn't solve the root problem
- May hit Netlify function timeout (60s)

### Solution 3: Route Caching (COMPLEMENTARY)
**Approach**: Cache successful route calculations to avoid repeated API calls.

**Pros**:
- Reduces API load
- Faster responses for repeated queries
- Works well with Solution 1

**Cons**:
- Doesn't help if route calculation fails
- Requires cache management
- Routes may change (canal closures, etc.)

### Solution 4: Alternative Route API (FUTURE)
**Approach**: Use a different route calculation service as backup.

**Pros**:
- More reliable
- Better redundancy

**Cons**:
- Requires finding/implementing alternative API
- Additional costs
- More complex

## Recommended Implementation Plan

### Phase 1: Fallback Mechanism (Immediate)
1. Create fallback route database for common routes
2. Modify supervisor to check fallback when route agent fails
3. Create synthetic route data from fallback
4. Continue bunker analysis with synthetic data
5. Update finalize to indicate fallback was used

### Phase 2: Route Caching (Next)
1. Implement route result caching
2. Check cache before calling API
3. Cache successful results for 24 hours

### Phase 3: Monitoring & Optimization (Future)
1. Monitor route API success/failure rates
2. Track which routes timeout most
3. Expand fallback database based on patterns

## Implementation Details

### Files to Modify
1. `frontend/lib/multi-agent/agent-nodes.ts` - Supervisor logic for fallback
2. `frontend/lib/multi-agent/state.ts` - Add fallback flag to state
3. `frontend/lib/tools/route-calculator.ts` - Add fallback route generator
4. `frontend/lib/data/route-fallbacks.json` - New file with fallback routes

### Key Considerations
- **Don't break existing flow**: If route works, use it (no changes)
- **Clear indication**: Always tell user when fallback is used
- **Graceful degradation**: Provide best possible analysis with available data
- **Maintainability**: Easy to add new fallback routes

## Success Criteria
- ✅ System provides bunker recommendations even when route API fails
- ✅ No changes to working queries (backward compatible)
- ✅ Clear indication when fallback data is used
- ✅ Maintains all existing error handling and timeout logic

