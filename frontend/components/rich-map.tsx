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

  // Use all bunker ports when provided (FoundPort[] from state); merge in rank/cost from analysis
  const recByCode = new Map<string, any>();
  if (analysis?.recommendations?.length) {
    for (const r of analysis.recommendations) {
      const code = r.port_code || r.port_name;
      if (code) recByCode.set(String(code), r);
    }
  }
  const bunkerPorts: any[] =
    Array.isArray(bunkerPortsProp) && bunkerPortsProp.length > 0
      ? bunkerPortsProp
          .map((item: any) => {
            const port = item.port ?? item;
            const code = port.port_code ?? item.port_code ?? port.port_code;
            const name = port.name ?? item.port_name ?? port.port_name ?? code;
            const details = code ? getPortDetails(code) : null;
            const coords = port.coordinates ?? item.coordinates ?? details?.coordinates;
            const rec = code ? recByCode.get(String(code)) : null;
            if (!coords) return null;
            return {
              ...(details || {}),
              port_code: code,
              name,
              port_name: name,
              coordinates: coords,
              rank: rec?.rank,
              total_cost: rec?.total_cost ?? rec?.total_cost_usd,
              total_cost_usd: rec?.total_cost_usd ?? rec?.total_cost,
              savings_vs_most_expensive: rec?.savings_vs_most_expensive,
              deviation_nm: rec?.deviation_nm ?? (item.distance_from_route_nm != null ? item.distance_from_route_nm * 2 : undefined),
              distance_from_route_nm: rec?.distance_from_route_nm ?? item.distance_from_route_nm,
            };
          })
          .filter((p: any) => p != null)
      : (analysis?.recommendations
          ?.map((rec: any) => {
            const portDetails = getPortDetails(rec.port_code);
            return portDetails ? { ...portDetails, ...rec } : null;
          })
          .filter((p: any) => p !== null) ?? []);

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
