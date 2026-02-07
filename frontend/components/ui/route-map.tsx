'use client';

import dynamic from 'next/dynamic';
import type { MapOverlaysData } from '@/lib/formatters/response-formatter';

const MapViewer = dynamic(
  () => import('@/components/map-viewer').then((mod) => mod.MapViewer),
  { ssr: false }
);

interface RouteMapProps {
  routeData: {
    route?: unknown;
    route_data?: unknown;
    originPort?: unknown;
    origin_port?: unknown;
    destinationPort?: unknown;
    destination_port?: unknown;
    bunkerPorts?: unknown[];
    bunker_ports?: unknown[];
  };
  mapOverlays?: MapOverlaysData | null;
}

export function RouteMap({ routeData, mapOverlays }: RouteMapProps) {
  const route = routeData.route ?? routeData.route_data;
  const originPort = routeData.originPort ?? routeData.origin_port;
  const destinationPort = routeData.destinationPort ?? routeData.destination_port;
  const bunkerPorts = routeData.bunkerPorts ?? routeData.bunker_ports ?? [];

  if (!route || !originPort || !destinationPort) {
    return (
      <div className="my-4 p-4 rounded-lg border bg-muted/30 text-muted-foreground text-sm">
        Route map requires route, origin, and destination data.
      </div>
    );
  }

  return (
    <div className="my-4 rounded-lg overflow-hidden border">
      <MapViewer
        route={route}
        originPort={originPort}
        destinationPort={destinationPort}
        bunkerPorts={Array.isArray(bunkerPorts) ? bunkerPorts : []}
        mapOverlays={mapOverlays}
      />
    </div>
  );
}
