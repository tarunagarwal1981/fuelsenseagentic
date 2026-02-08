'use client';

import dynamic from 'next/dynamic';
import portsData from '@/lib/data/ports.json';
import type { MapOverlaysData } from '@/lib/formatters/response-formatter';

const MapViewerDynamic = dynamic(
  () => import('./map-viewer').then((mod) => mod.MapViewer),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[600px] bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-200">
        <div className="text-center">
          <p className="text-gray-500">Loading map...</p>
        </div>
      </div>
    ),
  }
);

// Helper function to get port details from ports.json
function getPortDetails(portCode: string) {
  return (portsData as any[]).find((p: any) => p.port_code === portCode);
}

interface RichMapProps {
  route?: any;
  analysis?: any;
  mapOverlays?: MapOverlaysData | null;
  /** Pre-resolved port objects (optional, for when adapter already resolved them) */
  originPort?: any;
  destinationPort?: any;
  bunkerPorts?: any[];
}

export function RichMap({
  route,
  analysis,
  mapOverlays,
  originPort: originPortProp,
  destinationPort: destinationPortProp,
  bunkerPorts: bunkerPortsProp,
}: RichMapProps) {
  if (!route?.waypoints || !route?.origin_port_code || !route?.destination_port_code) {
    return (
      <div className="my-4 p-4 rounded-lg border bg-muted/30 text-muted-foreground text-sm">
        Route map requires route with waypoints, origin, and destination data.
      </div>
    );
  }

  const originPort =
    originPortProp ??
    getPortDetails(route.origin_port_code) ??
    (route.origin_coordinates
      ? {
          port_code: route.origin_port_code,
          name: route.origin_port_name ?? route.origin_port_code,
          country: '',
          coordinates: route.origin_coordinates,
        }
      : null);

  const destinationPort =
    destinationPortProp ??
    getPortDetails(route.destination_port_code) ??
    (route.destination_coordinates
      ? {
          port_code: route.destination_port_code,
          name: route.destination_port_name ?? route.destination_port_code,
          country: '',
          coordinates: route.destination_coordinates,
        }
      : null);

  if (!originPort || !destinationPort) {
    return (
      <div className="my-4 p-4 rounded-lg border bg-muted/30 text-muted-foreground text-sm">
        Could not resolve origin or destination port coordinates.
      </div>
    );
  }

  const bunkerPorts =
    bunkerPortsProp ??
    analysis?.recommendations
      ?.map((rec: any) => {
        const portDetails = getPortDetails(rec.port_code);
        return portDetails ? { ...portDetails, ...rec } : null;
      })
      .filter((p: any) => p !== null) ?? [];

  return (
    <div className="my-4 rounded-lg overflow-hidden border">
      <MapViewerDynamic
        route={route}
        originPort={originPort}
        destinationPort={destinationPort}
        bunkerPorts={Array.isArray(bunkerPorts) ? bunkerPorts : []}
        mapOverlays={mapOverlays}
      />
    </div>
  );
}
