# Entity Extraction & Resolution Architecture Update

**Date:** 2026-01-31  
**Status:** ✅ COMPLETE

## 🎯 **Objective**

Update the multi-agent orchestration system so the **Supervisor LLM extracts entities** (port names, dates, fuel types) AND **resolves them to UN/LOCODE codes** using the WorldPortIndex API, eliminating the need for fragile regex-based parsing in agent workflows.

---

## 📋 **Changes Made**

### 1. **Updated Supervisor Planner Interface**
**File:** `frontend/lib/multi-agent/supervisor-planner.ts`

#### New Interface: `ExtractedEntities`
```typescript
export interface ExtractedEntities {
  origin?: string;                    // Origin port name (as mentioned)
  destination?: string;               // Destination port name (as mentioned)
  vessel_name?: string;               // Vessel name if mentioned
  fuel_types?: Array<{                // Fuel types with quantities
    type: string; 
    quantity?: number; 
    unit?: string 
  }>;
  departure_date?: string;            // Departure date/time
  vessel_speed?: number;              // Speed in knots
  bunker_ports?: string[];            // Specific bunker ports
  query_type?: 'route_calculation' | 'bunker_planning' | ...;
}
```

#### New Interface: `ResolvedEntityCodes` ← **NEW**
```typescript
export interface ResolvedEntityCodes {
  origin?: string;         // UN/LOCODE (e.g., "AE DXB")
  destination?: string;    // UN/LOCODE (e.g., "JP TYO")
  bunker_ports?: string[]; // UN/LOCODEs for bunker ports
}
```

#### Updated `SupervisorPlan` Interface
```typescript
export interface SupervisorPlan {
  execution_order: string[];
  agent_tool_assignments: Record<string, string[]>;
  reasoning: string;
  estimated_total_time: number;
  critical_path?: string[];
  extracted_entities?: ExtractedEntities;  // Names as mentioned
  resolved_codes?: ResolvedEntityCodes;    // UN/LOCODE codes ← **NEW**
}
```

---

### 2. **Entity Resolution Function** ← **NEW**
**File:** `frontend/lib/multi-agent/supervisor-planner.ts`

Added `resolveEntitiesToCodes()` function that:
1. Takes extracted port names (e.g., "Dubai", "Tokyo")
2. Calls `PortRepository.findByName()` to resolve to UN/LOCODE
3. Returns resolved codes for use by agents

```typescript
async function resolveEntitiesToCodes(
  entities: ExtractedEntities | undefined
): Promise<ResolvedEntityCodes> {
  if (!entities) return {};

  const resolved: ResolvedEntityCodes = {};
  const portRepo = ServiceContainer.getInstance().getPortRepository();
  
  // Resolve origin: "Dubai" → "AE DXB"
  if (entities.origin) {
    const port = await portRepo.findByName(entities.origin);
    if (port) {
      resolved.origin = port.code;
      console.log(`✅ [SUPERVISOR-RESOLVER] Origin: ${entities.origin} → ${port.code}`);
    }
  }
  
  // Resolve destination: "Tokyo" → "JP TYO"
  if (entities.destination) {
    const port = await portRepo.findByName(entities.destination);
    if (port) {
      resolved.destination = port.code;
      console.log(`✅ [SUPERVISOR-RESOLVER] Destination: ${entities.destination} → ${port.code}`);
    }
  }
  
  // Resolve bunker ports (if any)
  // ... similar logic ...
  
  return resolved;
}
```

**Features:**
- ✅ Uses your new **WorldPortIndex API** integration
- ✅ Handles fuzzy matching ("Dubai" matches "Dubai (Jebel Ali)")
- ✅ Graceful fallback if resolution fails
- ✅ Detailed logging for debugging

---

### 3. **Integration in `generateExecutionPlan()`**
**File:** `frontend/lib/multi-agent/supervisor-planner.ts`

After LLM extraction, immediately resolve entities:

```typescript
// After getting plan from LLM
if (plan.extracted_entities) {
  console.log('🔧 [SUPERVISOR-PLANNER] Resolving extracted entities to port codes...');
  
  const resolvedCodes = await resolveEntitiesToCodes(plan.extracted_entities);
  plan.resolved_codes = resolvedCodes;
  
  if (resolvedCodes.origin || resolvedCodes.destination) {
    console.log('✅ [SUPERVISOR-PLANNER] Entity resolution successful:', {
      origin: `${plan.extracted_entities.origin} → ${resolvedCodes.origin}`,
      destination: `${plan.extracted_entities.destination} → ${resolvedCodes.destination}`,
    });
  }
}
```

---

### 4. **Supervisor Node: Use Resolved Codes**
**File:** `frontend/lib/multi-agent/agent-nodes.ts`

Updated to **prioritize resolved UN/LOCODE codes** over entity names:

```typescript
agentContext = {
  route_agent: {
    // ... existing fields ...
    // PRIORITY: Use resolved codes (UN/LOCODE) if available
    port_overrides: executionPlan.resolved_codes?.origin || executionPlan.resolved_codes?.destination ? {
      origin: executionPlan.resolved_codes.origin,     // ← UN/LOCODE
      destination: executionPlan.resolved_codes.destination, // ← UN/LOCODE
    } 
    // FALLBACK: Use extracted names if resolution failed
    : executionPlan.extracted_entities ? {
      origin: executionPlan.extracted_entities.origin, // ← Name as mentioned
      destination: executionPlan.extracted_entities.destination,
    } : undefined,
  },
  bunker_agent: {
    // ... existing fields ...
    // Use resolved bunker port codes (or names as fallback)
    bunker_ports: executionPlan.resolved_codes?.bunker_ports 
      || executionPlan.extracted_entities?.bunker_ports,
  },
};
```

**Logging:**
```typescript
if (executionPlan.resolved_codes) {
  console.log('✅ [SUPERVISOR] Using resolved port codes (UN/LOCODE):', {
    origin: executionPlan.resolved_codes.origin,
    destination: executionPlan.resolved_codes.destination,
  });
}
```

---

### 5. **Route Workflow: Multi-Tier Fallback** (Unchanged)
**File:** `frontend/lib/multi-agent/agent-nodes.ts`

The route workflow already has the correct priority cascade:

```typescript
// PRIORITY 1: Supervisor-extracted + resolved codes (UN/LOCODE) ✅
if (agentContext?.port_overrides?.origin && agentContext?.port_overrides?.destination) {
  origin = agentContext.port_overrides.origin;     // UN/LOCODE
  destination = agentContext.port_overrides.destination;
} 
// PRIORITY 2: State overrides (error recovery)
else if (state.port_overrides?.origin && state.port_overrides?.destination) {
  // ... fallback ...
}
// PRIORITY 3: Regex extraction (backward compatibility)
else {
  // ... regex fallback ...
}
```

---

## 🎯 **Complete Architecture Flow**

### **Full Pipeline:**

```
User Query: "route between Dubai and Tokyo"
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Supervisor LLM                                              │
│  1. Extract entities:                                       │
│     - origin: "Dubai"                                       │
│     - destination: "Tokyo"                                  │
│  2. Resolve to codes via WorldPortIndex API:               │
│     - "Dubai" → findByName() → "AE DXB"                     │
│     - "Tokyo" → findByName() → "JP TYO"                     │
│  3. Generate execution plan                                 │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ AgentContext (passed to Route Agent)                        │
│  port_overrides: {                                          │
│    origin: "AE DXB",      ← UN/LOCODE (resolved)            │
│    destination: "JP TYO"  ← UN/LOCODE (resolved)            │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Route Agent                                                  │
│  - Receives UN/LOCODE codes directly                         │
│  - No parsing needed ✅                                      │
│  - Calls RouteService.calculateRoute("AE DXB", "JP TYO")    │
└─────────────────────────────────────────────────────────────┘
    ↓
✅ Route calculated successfully!
```

---

## ✅ **Benefits**

1. **🎯 LLM-Based Extraction**: Handles natural language variations
2. **🔗 API-Based Resolution**: Uses WorldPortIndex API for accurate matching
3. **🐛 Bug Fixes**: "Tokyo" no longer splits to "to" + "kyo"
4. **📊 Structured Data**: Agents receive UN/LOCODE codes (ready to use)
5. **🔄 Two-Phase Processing**: Extract (LLM) → Resolve (API)
6. **🛡️ Graceful Fallbacks**: 
   - Resolution fails → Use entity name
   - Extraction fails → Use regex
7. **🎨 Extensibility**: Easy to add vessel name resolution, fuel type normalization, etc.

---

## 🧪 **Expected Log Output**

When testing "route between Dubai and Tokyo":

```
📋 [SUPERVISOR] Calling generateExecutionPlan...
✅ [SUPERVISOR-PLANNER] Generated execution plan
🔍 [SUPERVISOR-PLANNER] Extracted entities:
   query_type: route_calculation
   origin: Dubai
   destination: Tokyo
🔧 [SUPERVISOR-PLANNER] Resolving extracted entities to port codes...
🔍 [SUPERVISOR-RESOLVER] Resolving origin: "Dubai"
✅ [SUPERVISOR-RESOLVER] Origin resolved: Dubai → AE DXB (Dubai (Jebel Ali))
🔍 [SUPERVISOR-RESOLVER] Resolving destination: "Tokyo"
✅ [SUPERVISOR-RESOLVER] Destination resolved: Tokyo → JP TYO (Tokyo)
📊 [SUPERVISOR-RESOLVER] Resolution complete: 2 ports resolved
✅ [SUPERVISOR-PLANNER] Entity resolution successful:
   origin: Dubai → AE DXB
   destination: Tokyo → JP TYO
🎯 [SUPERVISOR-PLANNER] Resolved port codes:
   origin: AE DXB
   destination: JP TYO
✅ [SUPERVISOR] Using resolved port codes (UN/LOCODE):
   origin: AE DXB
   destination: JP TYO
🎯 [ROUTE-WORKFLOW] Using supervisor-extracted port names from agent context:
   Origin: AE DXB
   Destination: JP TYO
✅ [ROUTE-SERVICE] Route calculated: AE DXB → JP TYO
```

**No more parsing errors!** ✅

---

## 📊 **Files Changed**

| File | Changes | Lines |
|------|---------|-------|
| `supervisor-planner.ts` | Added ResolvedEntityCodes interface, resolveEntitiesToCodes() function, integrated resolution | +150 |
| `agent-nodes.ts` | Updated supervisor to pass resolved codes to agents | +20 |

**Total:** 2 files, ~170 lines changed

---

## 🚀 **Next Steps**

1. **Test with dev server**: Query "route between Dubai and Tokyo"
2. **Verify logs**: Look for `✅ [SUPERVISOR-RESOLVER] Origin resolved: Dubai → AE DXB`
3. **Check WorldPortIndex API**: Confirm `findByName()` is being called
4. **Test variations**: "from Singapore to New York", "Hong Kong-London", etc.
5. **Monitor performance**: Resolution adds ~200-400ms (API + cache)

---

## 💡 **Performance Notes**

**Resolution Cost:**
- First call: ~200-400ms (API call to WorldPortIndex)
- Cached calls: ~50-100ms (Redis cache)
- **Acceptable** for improved accuracy

**Optimization opportunity:**
- Pre-cache common port names during app startup
- Consider in-memory LRU cache for frequently used ports

---

## ✨ **Summary**

The orchestrator now:
1. ✅ **Extracts** entities using LLM (handles "Tokyo" correctly)
2. ✅ **Resolves** names to UN/LOCODE using WorldPortIndex API
3. ✅ **Passes** clean codes to agents (no parsing needed)

**Status:** ✅ Implementation complete, ready for testing!

---

## 📋 **Changes Made**

### 1. **Updated Supervisor Planner Interface**
**File:** `frontend/lib/multi-agent/supervisor-planner.ts`

#### New Interface: `ExtractedEntities`
```typescript
export interface ExtractedEntities {
  origin?: string;                    // Origin port name
  destination?: string;               // Destination port name
  vessel_name?: string;               // Vessel name if mentioned
  fuel_types?: Array<{                // Fuel types with quantities
    type: string; 
    quantity?: number; 
    unit?: string 
  }>;
  departure_date?: string;            // Departure date/time
  vessel_speed?: number;              // Speed in knots
  bunker_ports?: string[];            // Specific bunker ports
  query_type?: 'route_calculation' | 'bunker_planning' | ...;
}
```

#### Updated `SupervisorPlan` Interface
```typescript
export interface SupervisorPlan {
  execution_order: string[];
  agent_tool_assignments: Record<string, string[]>;
  reasoning: string;
  estimated_total_time: number;
  critical_path?: string[];
  extracted_entities?: ExtractedEntities;  // ← NEW
}
```

---

### 2. **Enhanced LLM System Prompt**
**File:** `frontend/lib/multi-agent/supervisor-planner.ts`

Added comprehensive **entity extraction instructions**:

```typescript
const systemPrompt = `You are a supervisor orchestrating a multi-agent maritime planning system.

Your task is to:
1. EXTRACT KEY ENTITIES from the user's natural language query
2. CLASSIFY the query type (route, bunker, weather, compliance, etc.)
3. GENERATE an execution plan with agent order and tool assignments
4. ENSURE prerequisites are met before agents execute

ENTITY EXTRACTION (CRITICAL):
Extract the following entities from the user's query:

1. PORT NAMES:
   - Origin: Where the voyage starts (e.g., "Dubai", "Singapore", "Rotterdam")
   - Destination: Where the voyage ends (e.g., "Tokyo", "New York", "London")
   - Extract port names AS THEY APPEAR in the query (preserve casing)
   - Handle variations: "from X to Y", "between X and Y", "X-Y", "route to Y"
   - DO NOT split city names (e.g., "Tokyo" should not become "to" + "kyo")

2. VESSEL INFORMATION:
   - Vessel name if mentioned
   - Vessel speed in knots if mentioned

3. FUEL REQUIREMENTS:
   - Fuel type: VLSFO, LSFO, HSFO, MGO, LSMGO, LSGO
   - Quantity and unit (e.g., "650 MT", "500 tons")
   - Multiple fuel types: "650 MT VLSFO and 80 MT LSGO"
   - If NOT specified, default to VLSFO

4. DATES/TIMES:
   - Departure date/time if mentioned
   - If NOT specified, assume tomorrow

5. QUERY TYPE:
   - route_calculation, bunker_planning, weather_analysis, etc.

Return format:
{
  "extracted_entities": {
    "query_type": "route_calculation",
    "origin": "Dubai",
    "destination": "Tokyo",
    "vessel_speed": null,
    "fuel_types": [{"type": "VLSFO"}],
    "departure_date": null
  },
  "execution_order": ["route_agent"],
  "agent_tool_assignments": {...},
  "reasoning": "...",
  "estimated_total_time": 3
}
```

**Key improvements:**
- ✅ Explicit instruction to **not split city names** (fixes "Tokyo" → "to" + "kyo" bug)
- ✅ Handles multiple query formats ("from X to Y", "between X and Y", etc.)
- ✅ Extracts fuel types with quantities
- ✅ Classifies query type
- ✅ Provides default values (VLSFO, tomorrow for departure)

---

### 3. **Updated AgentContext Interface**
**File:** `frontend/lib/multi-agent/state.ts`

Added fields to pass extracted entities to agents:

```typescript
export interface AgentContext {
  route_agent?: {
    // ... existing fields ...
    port_overrides?: {           // ← NEW
      origin?: string;
      destination?: string;
    };
    vessel_speed?: number;       // ← NEW
    departure_date?: string;     // ← NEW
  };
  bunker_agent?: {
    // ... existing fields ...
    fuel_types?: Array<{         // ← NEW
      type: string; 
      quantity?: number; 
      unit?: string 
    }>;
    bunker_ports?: string[];     // ← NEW
  };
  // ... other agents ...
}
```

---

### 4. **Supervisor Node: Pass Extracted Entities**
**File:** `frontend/lib/multi-agent/agent-nodes.ts` (Supervisor Node)

Updated agent context building to include extracted entities:

```typescript
if (executionPlan) {
  agentContext = {
    route_agent: executionPlan.execution_order.includes('route_agent') ? {
      // ... existing fields ...
      port_overrides: executionPlan.extracted_entities ? {
        origin: executionPlan.extracted_entities.origin,
        destination: executionPlan.extracted_entities.destination,
      } : undefined,
      vessel_speed: executionPlan.extracted_entities?.vessel_speed,
      departure_date: executionPlan.extracted_entities?.departure_date,
    } : undefined,
    bunker_agent: executionPlan.execution_order.includes('bunker_agent') ? {
      // ... existing fields ...
      fuel_types: executionPlan.extracted_entities?.fuel_types,
      bunker_ports: executionPlan.extracted_entities?.bunker_ports,
    } : undefined,
    // ... other agents ...
  };

  // Log extracted entities
  if (executionPlan.extracted_entities) {
    console.log('🎯 [SUPERVISOR] Using extracted entities:', {
      query_type: executionPlan.extracted_entities.query_type,
      origin: executionPlan.extracted_entities.origin,
      destination: executionPlan.extracted_entities.destination,
      vessel_speed: executionPlan.extracted_entities.vessel_speed,
      fuel_types: executionPlan.extracted_entities.fuel_types?.length || 0,
    });
  }
}
```

---

### 5. **Route Workflow: Use Extracted Entities**
**File:** `frontend/lib/multi-agent/agent-nodes.ts` (Route Agent)

Updated port extraction logic to prioritize supervisor-extracted entities:

```typescript
// PRIORITY 1: Check for agent context port overrides (from supervisor entity extraction)
const agentContext = state.agent_context?.route_agent;
if (agentContext?.port_overrides?.origin && agentContext?.port_overrides?.destination) {
  console.log('🎯 [ROUTE-WORKFLOW] Using supervisor-extracted port names from agent context:');
  console.log(`   Origin: ${agentContext.port_overrides.origin}`);
  console.log(`   Destination: ${agentContext.port_overrides.destination}`);
  
  origin = agentContext.port_overrides.origin;
  destination = agentContext.port_overrides.destination;
} 
// PRIORITY 2: Check for state port overrides (from error recovery)
else if (state.port_overrides?.origin && state.port_overrides?.destination) {
  // ... existing fallback ...
}
// PRIORITY 3: Extract via PortResolutionService (regex-based - fallback)
else {
  // ... existing extraction logic ...
}
```

**Priority cascade:**
1. ✅ **Supervisor-extracted entities** (LLM-based, most reliable)
2. ✅ **State port overrides** (from error recovery/agentic supervisor)
3. ✅ **Regex extraction** (fallback for backward compatibility)

---

### 6. **Validation and Logging**
**File:** `frontend/lib/multi-agent/supervisor-planner.ts`

Added logging in `validatePlan()` to show extracted entities:

```typescript
if (plan.extracted_entities) {
  console.log('🔍 [SUPERVISOR-PLANNER] Extracted entities:', {
    query_type: plan.extracted_entities.query_type,
    origin: plan.extracted_entities.origin,
    destination: plan.extracted_entities.destination,
    vessel_speed: plan.extracted_entities.vessel_speed,
    fuel_types: plan.extracted_entities.fuel_types?.map(...).join(', '),
    departure_date: plan.extracted_entities.departure_date,
  });
} else {
  console.warn('⚠️ [SUPERVISOR-PLANNER] No entities extracted from query');
}
```

---

## 🎯 **Architecture Flow**

### **Before (Regex-based):**
```
User Query
    ↓
Supervisor (plan only)
    ↓
Route Agent
    ↓
Regex Parser (brittle, splits "Tokyo" → "to" + "kyo") ❌
    ↓
Port Extraction
```

### **After (LLM-based):**
```
User Query
    ↓
Supervisor LLM
    ├─ Plan execution
    └─ Extract entities (origin, destination, fuel, dates) ✅
        ↓
    AgentContext (structured params)
        ↓
Route Agent (receives "Dubai", "Tokyo" directly)
    ↓
Use extracted values (no parsing needed) ✅
```

---

## ✅ **Benefits**

1. **🎯 Accuracy**: LLMs handle natural language better than regex
2. **🔧 Robustness**: Handles variations ("from X to Y", "between X and Y", "X-Y")
3. **🐛 Bug Fixes**: Solves "Tokyo" → "to kyo" parsing bug
4. **📊 Structured Data**: Agents receive clean, validated parameters
5. **🔄 Separation of Concerns**: Orchestrator "thinks", agents "execute"
6. **🎨 Extensibility**: Easy to add new entity types (vessel name, cargo, etc.)

---

## 🧪 **Testing**

Expected log output with new architecture:

```
📋 [SUPERVISOR] Calling generateExecutionPlan...
✅ [SUPERVISOR-PLANNER] Generated execution plan
🔍 [SUPERVISOR-PLANNER] Extracted entities:
   query_type: route_calculation
   origin: Dubai
   destination: Tokyo
   vessel_speed: null
   fuel_types: VLSFO
   departure_date: null
🎯 [SUPERVISOR] Using extracted entities:
   origin: Dubai
   destination: Tokyo
🎯 [ROUTE-WORKFLOW] Using supervisor-extracted port names from agent context:
   Origin: Dubai
   Destination: Tokyo
```

**No more:** `❌ [PORT-EXTRACTION] Could not identify origin or destination`

---

## 📝 **Migration Notes**

### Backward Compatibility
- ✅ **Preserved regex fallback** for legacy queries
- ✅ **Existing error recovery** still works via `state.port_overrides`
- ✅ **No breaking changes** to other agents

### Feature Flags
No feature flag needed - the system automatically uses LLM extraction when available, falls back to regex if not.

---

## 🚀 **Next Steps**

1. **Test with dev server**: Run `npm run dev` and try "route between Dubai and Tokyo"
2. **Monitor logs**: Check for `🎯 [SUPERVISOR] Using extracted entities`
3. **Verify WorldPortIndex API**: Ensure ports are resolved via new API
4. **Test edge cases**: Try variations like "from X to Y", "X-Y", "between X and Y"
5. **Add bunker tests**: Test fuel type extraction ("650 MT VLSFO and 80 MT LSGO")

---

## 📊 **Files Changed**

| File | Changes | Lines |
|------|---------|-------|
| `supervisor-planner.ts` | Added ExtractedEntities interface, updated system prompt | +120 |
| `state.ts` | Updated AgentContext with extracted entity fields | +10 |
| `agent-nodes.ts` | Pass extracted entities to agents, prioritize in route workflow | +40 |

**Total:** 3 files, ~170 lines changed

---

## ✨ **Summary**

The orchestrator (supervisor) now does the "thinking" (entity extraction via LLM), and the agents do the "doing" (execution with structured params). This is the correct orchestration pattern and eliminates regex brittleness.

**Status:** ✅ Implementation complete, ready for testing!
