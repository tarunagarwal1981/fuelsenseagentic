# Recursion Limit Error Investigation

## Problem Summary
The system hits a recursion limit of 50 iterations when the weather agent gets stuck in a loop, even though weather_forecast already exists in state.

## Root Causes Identified

### 1. **Tool Selection Happens Before State Check** (CRITICAL)
**Location**: `frontend/lib/multi-agent/agent-nodes.ts:1346-1394`

**Issue**: 
- The `weatherTools` array is built at line 1346-1352 **BEFORE** checking if `weather_forecast` already exists
- `fetchMarineWeatherTool` is **ALWAYS** included in the tools array (line 1347)
- When `weather_forecast` exists and only `calculate_weather_consumption` is needed, the LLM still sees `fetch_marine_weather` in the tools
- The LLM tries to use `fetch_marine_weather` but needs the full vessel_timeline data, which isn't in the messages
- The LLM asks for data instead of calling the tool, creating a loop

**Evidence from logs**:
```
✅ [WEATHER-AGENT] Weather forecast exists, need to calculate consumption (from context)
🔧 [WEATHER-AGENT] Tools available: [ 'fetch_marine_weather', 'calculate_weather_consumption' ]
🤖 [WEATHER-AGENT] Agent response: "I need the complete vessel_timeline data with all 142 positions..."
⚠️ [WEATHER-AGENT] No tool calls in response!
```

**Fix Required**: 
- Move tool selection AFTER the weather_forecast existence check
- If `weather_forecast` exists, ONLY include `calculate_weather_consumption` (if needed)
- Don't include `fetch_marine_weather` if weather_forecast already exists

### 2. **Supervisor Doesn't Check Agent Failure Status Before Routing** (CRITICAL)
**Location**: `frontend/lib/multi-agent/agent-nodes.ts:512-518, 536-541`

**Issue**:
- Supervisor routes to `weather_agent` at lines 512-518 and 536-541 without checking if it has already failed
- Even after weather_agent marks itself as `failed`, supervisor continues routing to it
- This creates an infinite loop: weather_agent fails → supervisor routes to it again → weather_agent fails → repeat

**Evidence from logs**:
```
⚠️ [WEATHER-AGENT] LLM failed to call tools after previous attempt - marking as failed
🔀 [SUPERVISOR-ROUTER] Routing decision: weather_agent
🔀 [SUPERVISOR-ROUTER] Routing to: weather_agent
```

**Fix Required**:
- Check `state.agent_status?.weather_agent === 'failed'` before routing to weather_agent
- If weather_agent has failed, either skip to next step or finalize

### 3. **Loop Detection Thresholds Too High**
**Location**: `frontend/lib/multi-agent/agent-nodes.ts:316, 326`

**Issue**:
- Loop detection only triggers at 15+ messages (line 316) or 25+ messages (line 326)
- But the recursion limit is 50, so by the time detection triggers, we're already close to the limit
- The weather agent shows "Failed attempts: 19" but the hard limit check at line 1320 only triggers if `!state.weather_forecast`, but weather_forecast EXISTS

**Evidence from logs**:
```
🔢 [WEATHER-AGENT] Failed attempts: 19
✅ [WEATHER-AGENT] Weather forecast exists, need to calculate consumption
```

**Fix Required**:
- The hard limit check at line 1320 should also trigger if weather_forecast exists but consumption calculation is failing repeatedly
- Lower loop detection thresholds or make them more aggressive

### 4. **Hard Limit Check Doesn't Account for Consumption Calculation Failures**
**Location**: `frontend/lib/multi-agent/agent-nodes.ts:1320`

**Issue**:
- The hard limit check at line 1320 only checks `!state.weather_forecast`
- But when weather_forecast exists and consumption is needed, failures in consumption calculation aren't caught by this check
- The agent keeps trying to calculate consumption but the LLM doesn't call the tool

**Fix Required**:
- Check for both weather_forecast AND weather_consumption failures
- If weather_forecast exists but consumption calculation has failed multiple times, mark as failed

### 5. **State Updates Not Persisting**
**Location**: Multiple locations

**Issue**:
- When weather_agent marks itself as `failed`, the state update might not be persisting properly
- Or the supervisor is checking state before the update is applied
- Need to verify state reducer behavior

## Recommended Fixes (Priority Order)

### Priority 1: Fix Tool Selection Logic
Move tool selection AFTER state checks:
```typescript
// Check if weather_forecast exists FIRST
if (state.weather_forecast && !state.weather_consumption) {
  if (needsConsumption) {
    // ONLY include consumption tool
    const weatherTools = [calculateWeatherConsumptionTool];
    // ... continue with LLM call
  }
} else if (!state.weather_forecast) {
  // Only include fetch_marine_weather if forecast doesn't exist
  const weatherTools = [fetchMarineWeatherTool, ...];
}
```

### Priority 2: Add Failure Check in Supervisor Routing
Before routing to weather_agent, check:
```typescript
if (state.agent_status?.weather_agent === 'failed') {
  // Skip weather_agent, proceed to next step
  if (needsBunker) {
    return { next_agent: "bunker_agent", ... };
  } else {
    return { next_agent: "finalize", ... };
  }
}
```

### Priority 3: Fix Hard Limit Check
Update the hard limit check to account for consumption failures:
```typescript
if (failedWeatherAttempts >= 2) {
  if (!state.weather_forecast || 
      (state.weather_forecast && needsConsumption && !state.weather_consumption)) {
    // Mark as failed
  }
}
```

### Priority 4: Lower Loop Detection Thresholds
Make loop detection more aggressive:
- Check for weather_agent failures at 10+ messages instead of 15+
- Add immediate check if weather_agent is marked as failed

## Testing Plan
1. Test with weather_forecast already in state, needs consumption
2. Test with weather_agent marked as failed
3. Test loop detection at various message counts
4. Verify state updates persist correctly

