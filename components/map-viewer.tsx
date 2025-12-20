// components/map-viewer.tsx
'use client';

interface MapViewerProps {
  route: any;
  originPort: any;
  destinationPort: any;
  bunkerPorts?: any[];
}

export function MapViewer({ route, originPort, destinationPort, bunkerPorts = [] }: MapViewerProps) {
  // Placeholder component - will be implemented with Leaflet later
  return (
    <div className="w-full h-[600px] bg-muted rounded-lg flex items-center justify-center border-2 border-dashed">
      <div className="text-center">
        <p className="text-muted-foreground mb-2">Map visualization</p>
        <p className="text-sm text-muted-foreground">Route: {route?.origin_port_code} → {route?.destination_port_code}</p>
        {bunkerPorts.length > 0 && (
          <p className="text-sm text-muted-foreground mt-1">{bunkerPorts.length} bunker ports</p>
        )}
      </div>
    </div>
  );
}

