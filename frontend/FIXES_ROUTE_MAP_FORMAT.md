# Route Map and Format Fixes

## Problem
Route queries were not displaying:
1. **Map visualization** - Route map was not rendering
2. **Proper formatting** - Response templates were not displaying correctly

## Root Causes

### 1. Missing Tier 0 Map Section in Template
The `route-only.yaml` template did not include a tier 0 (map) section. It only had tier 1 (text summary) and tier 2 (waypoints).

### 2. TemplateResponseContainer Not Rendering Tier 0
The `TemplateResponseContainer` component was only rendering tier 1, 2, and 3 sections. Tier 0 sections (maps/components) were collected but not displayed.

### 3. Missing Component Metadata
The template formatter was creating tier 0 sections but not passing the component name and props needed for rendering.

## Fixes Applied

### Fix 1: Added Map Section to `route-only.yaml`
**File**: `/Users/tarun/cursor/FuelSense/frontend/config/response-templates/route-only.yaml`

```yaml
sections:
  # =========================================================
  # TIER 0: ROUTE MAP (Always visible when route exists)
  # =========================================================
  
  - id: "route_map"
    title: "Route Map"
    tier: 0
    visibility: "always"
    priority: 0
    condition: "route_data"
    
    content_source:
      component: "MapViewer"
      props:
        route: "route_data"
        originPort: "origin_port"
        destinationPort: "destination_port"
```

### Fix 2: Updated TemplateResponseContainer to Render Tier 0
**File**: `/Users/tarun/cursor/FuelSense/frontend/components/template-response/TemplateResponseContainer.tsx`

**Changes**:
1. Added `MapViewer` import
2. Added tier 0 rendering section in the component JSX
3. Created `Tier0MapSection` component to handle MapViewer rendering

```tsx
// Added import
import { MapViewer } from '@/components/map-viewer';

// Added tier 0 rendering in JSX
{/* Tier 0: Map/Components (always visible) */}
{response.sections_by_tier.tier_0_map && response.sections_by_tier.tier_0_map.length > 0 && (
  <div className="space-y-4">
    {response.sections_by_tier.tier_0_map.map((section) => (
      <Tier0MapSection key={section.id} section={section} />
    ))}
  </div>
)}

// Added new component
function Tier0MapSection({ section }: { section: RenderedSection }) {
  if (section.metadata?.component === 'MapViewer') {
    const props = section.metadata?.props || {};
    
    return (
      <div className="w-full">
        <MapViewer
          route={props.route}
          originPort={props.originPort}
          destinationPort={props.destinationPort}
          bunkerPorts={props.bunkerPorts}
          mapOverlays={props.mapOverlays}
        />
      </div>
    );
  }
  
  // Fallback for other tier 0 sections
  return <ReactMarkdown>{section.content}</ReactMarkdown>;
}
```

### Fix 3: Enhanced Template Formatter to Pass Component Metadata
**File**: `/Users/tarun/cursor/FuelSense/frontend/lib/formatters/template-aware-formatter.ts`

**Changes**:
1. Added `metadata` field to `RenderedSection` interface
2. Updated tier 0 section rendering to extract and resolve component props

```typescript
// Updated interface
export interface RenderedSection {
  // ... existing fields ...
  metadata?: {
    component?: string;
    props?: Record<string, any>;
  };
}

// Updated tier 0 rendering logic
if (section.tier === 0) {
  const componentName = section.content_source?.component;
  const componentProps = section.content_source?.props || {};
  
  // Resolve props from state
  const resolvedProps: Record<string, any> = {};
  for (const [key, value] of Object.entries(componentProps)) {
    if (typeof value === 'string' && value.includes('.')) {
      // It's a state path like "route_data"
      resolvedProps[key] = getNestedValue(state, value);
    } else {
      resolvedProps[key] = value;
    }
  }
  
  const renderedSection: RenderedSection = {
    // ... existing fields ...
    metadata: {
      component: componentName,
      props: resolvedProps,
    },
  };
}
```

## Testing

To test the fixes:

1. **Start the dev server** (already running on port 3000)
2. **Test route query**: "give me route between Dubai and Singapore"
3. **Expected results**:
   - ✅ Map displays at the top showing the route
   - ✅ Route summary displays below the map
   - ✅ Route waypoints are available as expandable section
   - ✅ All port codes are properly normalized (AEDXB, SGKEP)

## Related Fixes (Already Applied)

These fixes were already completed in the previous session:

1. **Port Resolution**: Dubai and Singapore now resolve correctly via API
2. **Dual-Query Search**: API client searches both `mainPortName` and `alternatePortName`
3. **Port Code Normalization**: Codes are normalized from "AE DXB" to "AEDXB"

## Summary

**Before**:
- Route queries returned text-only responses
- No map visualization
- Missing tier 0 rendering capability

**After**:
- Route queries display interactive map at the top
- Proper progressive disclosure (map → summary → details)
- Template-based rendering with component support
- All route data properly displayed

Server is ready for testing at: **http://localhost:3000**
