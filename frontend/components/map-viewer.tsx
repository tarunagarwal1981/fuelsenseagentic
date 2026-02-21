// components/map-viewer.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { MapOverlaysData } from '@/lib/formatters/response-formatter';
import {
  waypointToCoords,
  validateCoordinates,
} from '@/lib/utils/coordinate-validator';

// Dynamically import Leaflet to avoid SSR issues
const L = typeof window !== 'undefined' ? require('leaflet') : null;

// Fix for default marker icons in Next.js
if (typeof window !== 'undefined' && L) {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  });
}

interface MapViewerProps {
  route: any;
  originPort: any;
  destinationPort: any;
  bunkerPorts?: any[];
  mapOverlays?: MapOverlaysData | null;  // NEW
}

export function MapViewer({ route, originPort, destinationPort, bunkerPorts = [], mapOverlays }: MapViewerProps) {
  const [showECAZones, setShowECAZones] = useState(true);
  const [showSwitchingPoints, setShowSwitchingPoints] = useState(true);
  const [showFuelTypeRoute, setShowFuelTypeRoute] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const ecaZoneLayersRef = useRef<any[]>([]);
  const switchingPointLayersRef = useRef<any[]>([]);
  const routeLayersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!mapRef.current || !L || !route || !originPort || !destinationPort) return;

    // Clean up existing map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
    }

    // Create map with scrollWheelZoom disabled by default to allow page scrolling
    // Users can zoom using: zoom controls (+/- buttons), double-click, or drag to pan
    const map = L.map(mapRef.current, {
      zoomControl: true,
      scrollWheelZoom: false, // Disabled to allow smooth page scrolling
      dragging: true,
      touchZoom: true,
      doubleClickZoom: true,
      boxZoom: true,
      keyboard: true,
    });

    // CartoDB tiles: Positron (light) or Dark Matter when .dark
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    const tileUrl = isDark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    L.tileLayer(tileUrl, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Collect all coordinates for bounds
    const allCoords: [number, number][] = [];

    // Origin marker (navy circle)
    if (originPort.coordinates) {
      const originCoords: [number, number] = [originPort.coordinates.lat, originPort.coordinates.lon];
      allCoords.push(originCoords);
      const originMarker = L.circleMarker(originCoords, {
        radius: 8,
        fillColor: '#072638',
        color: '#fff',
        weight: 2,
        fillOpacity: 1,
      }).addTo(map);
      originMarker.bindPopup(`
        <div class="min-w-[160px] p-3 rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-md">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">🚢 Origin: ${originPort.name}</div>
          <div style="font-size: 12px; color: var(--muted-foreground);">${originPort.port_code}</div>
          <div style="font-size: 12px; color: var(--muted-foreground);">${originPort.country || ''}</div>
        </div>
      `);
    }

    // Destination marker (navy circle)
    if (destinationPort.coordinates) {
      const destCoords: [number, number] = [destinationPort.coordinates.lat, destinationPort.coordinates.lon];
      allCoords.push(destCoords);
      const destMarker = L.circleMarker(destCoords, {
        radius: 8,
        fillColor: '#072638',
        color: '#fff',
        weight: 2,
        fillOpacity: 1,
      }).addTo(map);
      destMarker.bindPopup(`
        <div class="min-w-[160px] p-3 rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-md">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">🎯 Destination: ${destinationPort.name}</div>
          <div style="font-size: 12px; color: var(--muted-foreground);">${destinationPort.port_code}</div>
          <div style="font-size: 12px; color: var(--muted-foreground);">${destinationPort.country || ''}</div>
        </div>
      `);
    }

    // Clear previous layer refs
    ecaZoneLayersRef.current = [];
    switchingPointLayersRef.current = [];
    routeLayersRef.current = [];

    // Add route polyline(s) - with fuel type coloring if available
    if (route.waypoints && route.waypoints.length > 0) {
      if (showFuelTypeRoute && mapOverlays?.fuelTypeRoute && mapOverlays.fuelTypeRoute.length > 0) {
        // Draw route segments by fuel type
        mapOverlays.fuelTypeRoute.forEach((segment, idx) => {
          const segmentCoords: [number, number][] = segment.segment
            .map(([lon, lat]) => [lat, lon] as [number, number])
            .filter((coord): coord is [number, number] => {
              const [lat, lon] = coord;
              return typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon);
            });

          if (segmentCoords.length > 0) {
            allCoords.push(...segmentCoords);
            
            const polyline = L.polyline(segmentCoords, {
              color: segment.style.color || (segment.fuelType === 'MGO' ? '#CD1030' : '#219495'),
              weight: segment.style.weight || 3,
              opacity: 0.7,
              dashArray: segment.style.dashArray,
            }).addTo(map);

            const fuelLabel = segment.fuelType === 'MGO' ? '🔴 MGO Required' : '🟢 VLSFO';
            polyline.bindPopup(`
              <div style="font-weight: bold; margin-bottom: 4px;">📍 Route Segment</div>
              <div style="font-size: 12px;">${fuelLabel}</div>
              <div style="font-size: 12px;">Length: ${segmentCoords.length} waypoints</div>
            `);

            routeLayersRef.current.push(polyline);
          }
        });
      } else {
        // Default route (single polyline)
        // Normalize waypoints: support Waypoint ({ coordinates: [lat, lon] }), [lat, lon], or { lat, lon }
        const waypointCoords: [number, number][] = route.waypoints
          .map((wp: any) => {
            const coords = waypointToCoords(wp);
            if (!coords) {
              console.warn('🗺️ [MAP] Invalid waypoint (skipping):', wp);
              return null;
            }
            if (!validateCoordinates(coords)) {
              console.warn('🗺️ [MAP] Waypoint out of range (skipping):', coords);
              return null;
            }
            return [coords.lat, coords.lon] as [number, number];
          })
          .filter((coord: any): coord is [number, number] => coord !== null);

        if (waypointCoords.length > 0) {
          // Add waypoints to bounds
          allCoords.push(...waypointCoords);

          // Draw route polyline (teal-500)
          const polyline = L.polyline(waypointCoords, {
            color: '#219495',
            weight: 3,
            opacity: 0.7,
          }).addTo(map);

          // Add route info to polyline
          const distance = route.distance_nm ? `${route.distance_nm.toFixed(1)} nm` : 'N/A';
          const time = route.estimated_hours ? `${route.estimated_hours.toFixed(1)} hours` : 'N/A';
          
          polyline.bindPopup(`
            <div style="font-weight: bold; margin-bottom: 4px;">📍 Route</div>
            <div style="font-size: 12px;">Distance: ${distance}</div>
            <div style="font-size: 12px;">Time: ${time}</div>
            <div style="font-size: 12px;">Waypoints: ${waypointCoords.length}</div>
          `);

          routeLayersRef.current.push(polyline);
        } else {
          console.warn('No valid waypoints found in route:', route);
        }
      }
    }

    // Add ECA Zone Polygons
    if (showECAZones && mapOverlays?.ecaZones && mapOverlays.ecaZones.length > 0) {
      mapOverlays.ecaZones.forEach((zone, idx) => {
        const zoneCoords: [number, number][] = zone.polygon
          .map(([lon, lat]) => [lat, lon] as [number, number])
          .filter((coord): coord is [number, number] => {
            const [lat, lon] = coord;
            return typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon);
          });

        if (zoneCoords.length > 0) {
          // Add zone bounds to map bounds
          zoneCoords.forEach(coord => allCoords.push(coord));

          const polygon = L.polygon(zoneCoords, {
            fillColor: zone.style.fillColor || 'rgba(205, 16, 48, 0.07)',
            color: zone.style.strokeColor || '#CD1030',
            weight: zone.style.strokeWidth || 1,
            fillOpacity: 1,
          }).addTo(map);

          polygon.bindPopup(`
            <div style="font-weight: bold; margin-bottom: 4px;">${zone.name}</div>
            <div style="font-size: 12px; color: #666;">ECA Zone: ${zone.code}</div>
            <div style="font-size: 12px; color: #ef4444; margin-top: 4px;">⚠️ MGO Required</div>
          `);

          ecaZoneLayersRef.current.push(polygon);
        }
      });
    }

    // Add Switching Point Markers
    if (showSwitchingPoints && mapOverlays?.switchingPoints && mapOverlays.switchingPoints.length > 0) {
      mapOverlays.switchingPoints.forEach((point, idx) => {
        const [lon, lat] = point.location;
        
        if (typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon)) {
          allCoords.push([lat, lon]);

          // Create custom icon with emoji
          const customIcon = L.divIcon({
            html: `<div style="font-size: 24px; text-align: center; line-height: 1;">${point.icon}</div>`,
            className: 'switching-point-marker',
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          });

          const marker = L.marker([lat, lon], { icon: customIcon }).addTo(map);

          const instructionsHtml = point.popup.instructions
            .map((inst: string) => `<li style="margin: 2px 0;">${inst}</li>`)
            .join('');

          marker.bindPopup(`
            <div style="font-weight: bold; margin-bottom: 4px; font-size: 14px;">${point.popup.title}</div>
            <div style="font-size: 12px; margin-bottom: 2px;"><strong>Time:</strong> ${point.popup.timeFromStart}</div>
            <div style="font-size: 12px; margin-bottom: 4px;"><strong>Location:</strong> ${point.popup.coordinates}</div>
            <div style="font-size: 11px; color: #666; margin-top: 6px; border-top: 1px solid #ddd; padding-top: 4px;">
              <strong>Instructions:</strong>
              <ul style="margin: 4px 0; padding-left: 16px;">
                ${instructionsHtml}
              </ul>
            </div>
          `);

          switchingPointLayersRef.current.push(marker);
        }
      });
    }

    // Bunker port markers: circleMarker — recommended orange, alternative teal, other grey
    bunkerPorts.forEach((port: any) => {
      const coords = port.coordinates;
      if (!coords) return;
      const lat = coords.lat ?? coords.latitude;
      const lon = coords.lon ?? coords.longitude;
      if (lat == null || lon == null) return;

      const portCoords: [number, number] = [Number(lat), Number(lon)];
      allCoords.push(portCoords);

      const isBest = port.rank === 1;
      const hasRank = port.rank != null;
      const fillColor = isBest ? '#F9A82B' : hasRank ? '#219495' : '#9EA2AE';
      const radius = isBest ? 10 : hasRank ? 8 : 4;

      const portMarker = L.circleMarker(portCoords, {
        radius,
        fillColor,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 1,
      }).addTo(map);

      const totalCost = (port.total_cost ?? port.total_cost_usd) != null ? `$${Number(port.total_cost ?? port.total_cost_usd).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : null;
      const savings = port.savings_vs_most_expensive != null ? `$${Number(port.savings_vs_most_expensive).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : null;
      const deviationNm = port.deviation_nm ?? (port.distance_from_route_nm != null ? port.distance_from_route_nm * 2 : null);
      const deviation = deviationNm != null ? `${Number(deviationNm).toFixed(1)} nm` : null;

      portMarker.bindPopup(`
        <div class="min-w-[160px] p-3 rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-md" style="font-family: var(--font-inter), Inter, sans-serif;">
          <div style="font-weight: 600; font-family: var(--font-poppins), Poppins, sans-serif; font-size: 14px; margin-bottom: 4px; color: var(--foreground);">
            ${isBest ? '🏆 ' : '⚓ '}${port.name || port.port_name || port.port_code || 'Bunker port'}
          </div>
          <div style="font-size: 12px; color: var(--muted-foreground);">${port.port_code || ''}</div>
          ${port.rank != null ? `<div style="font-size: 12px; margin-top: 4px; color: var(--foreground);"><strong>Rank:</strong> #${port.rank}</div>` : ''}
          ${totalCost != null ? `<div style="font-size: 12px; color: var(--foreground);"><strong>Total Cost:</strong> ${totalCost}</div>` : ''}
          ${savings != null ? `<div style="font-size: 12px; color: ${isBest ? '#00A27D' : '#CD1030'};"><strong>${isBest ? 'Savings:' : 'Extra Cost:'}</strong> ${savings}</div>` : ''}
          ${deviation != null ? `<div style="font-size: 12px; color: var(--muted-foreground);"><strong>Deviation:</strong> ${deviation}</div>` : ''}
        </div>
      `);
    });

    // Fit map to show all markers
    if (allCoords.length > 0) {
      const bounds = L.latLngBounds(allCoords);
      map.fitBounds(bounds, { padding: [50, 50] });
    }

    // Route statistics control (design system card style)
    const statsHtml = `
      <div class="min-w-[160px] p-3 rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-md text-sm">
        <div style="font-weight: 600; margin-bottom: 5px; border-bottom: 1px solid var(--border); padding-bottom: 5px;">Route Statistics</div>
        <div style="margin-bottom: 3px;"><strong>Distance:</strong> ${route.distance_nm ? `${route.distance_nm.toFixed(1)} nm` : 'N/A'}</div>
        <div style="margin-bottom: 3px;"><strong>Time:</strong> ${route.estimated_hours ? `${route.estimated_hours.toFixed(1)} hours` : 'N/A'}</div>
        <div style="margin-bottom: 3px;"><strong>Waypoints:</strong> ${route.waypoints?.length || 0}</div>
        <div style="margin-top: 5px; padding-top: 5px; border-top: 1px solid var(--border);"><strong>Bunker Ports:</strong> ${bunkerPorts.length}</div>
        ${mapOverlays?.ecaZones ? `<div style="margin-top: 3px;"><strong>ECA Zones:</strong> ${mapOverlays.ecaZones.length}</div>` : ''}
        ${mapOverlays?.switchingPoints ? `<div style="margin-top: 3px;"><strong>Switching Points:</strong> ${mapOverlays.switchingPoints.length}</div>` : ''}
      </div>
    `;

    const statsControl = L.control({ position: 'topright' });
    statsControl.onAdd = () => {
      const div = L.DomUtil.create('div', 'route-stats');
      div.innerHTML = statsHtml;
      return div;
    };
    statsControl.addTo(map);

    // Add Layer Control (toggle overlays)
    if (mapOverlays && (mapOverlays.ecaZones.length > 0 || mapOverlays.switchingPoints.length > 0 || mapOverlays.fuelTypeRoute.length > 0)) {
      const overlayControl = L.control({ position: 'topleft' });
      overlayControl.onAdd = () => {
        const div = L.DomUtil.create('div', 'overlay-control');
        div.style.cssText = 'background: white; padding: 8px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.2); font-size: 11px;';
        div.innerHTML = `
          <div style="font-weight: bold; margin-bottom: 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px;">Layers</div>
          ${mapOverlays.ecaZones.length > 0 ? `
            <label style="display: flex; align-items: center; cursor: pointer; margin-bottom: 4px;">
              <input type="checkbox" ${showECAZones ? 'checked' : ''} style="margin-right: 6px;" 
                onchange="if (window.currentMap && window.currentMap.toggleECAZones) window.currentMap.toggleECAZones(this.checked)" />
              <span>ECA Zones (${mapOverlays.ecaZones.length})</span>
            </label>
          ` : ''}
          ${mapOverlays.switchingPoints.length > 0 ? `
            <label style="display: flex; align-items: center; cursor: pointer; margin-bottom: 4px;">
              <input type="checkbox" ${showSwitchingPoints ? 'checked' : ''} style="margin-right: 6px;"
                onchange="if (window.currentMap && window.currentMap.toggleSwitchingPoints) window.currentMap.toggleSwitchingPoints(this.checked)" />
              <span>Switching Points (${mapOverlays.switchingPoints.length})</span>
            </label>
          ` : ''}
          ${mapOverlays.fuelTypeRoute.length > 0 ? `
            <label style="display: flex; align-items: center; cursor: pointer;">
              <input type="checkbox" ${showFuelTypeRoute ? 'checked' : ''} style="margin-right: 6px;"
                onchange="if (window.currentMap && window.currentMap.toggleFuelTypeRoute) window.currentMap.toggleFuelTypeRoute(this.checked)" />
              <span>Fuel Type Route</span>
            </label>
          ` : ''}
        `;
        return div;
      };
      overlayControl.addTo(map);

      // Store toggle functions on map instance (for checkbox handlers)
      (map as any).toggleECAZones = (checked: boolean) => {
        setShowECAZones(checked);
        ecaZoneLayersRef.current.forEach(layer => {
          if (checked) {
            map.addLayer(layer);
          } else {
            map.removeLayer(layer);
          }
        });
      };

      (map as any).toggleSwitchingPoints = (checked: boolean) => {
        setShowSwitchingPoints(checked);
        switchingPointLayersRef.current.forEach(layer => {
          if (checked) {
            map.addLayer(layer);
          } else {
            map.removeLayer(layer);
          }
        });
      };

      (map as any).toggleFuelTypeRoute = (checked: boolean) => {
        setShowFuelTypeRoute(checked);
        // Note: Route layers would need to be recreated, so this is a simplified toggle
        // In a production app, you'd want to store both default and fuel-type routes
      };
    }

    mapInstanceRef.current = map;
    (window as any).currentMap = map;

    // Cleanup function
    return () => {
      // Clean up global map reference
      if ((window as any).currentMap === map) {
        delete (window as any).currentMap;
      }

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [route, originPort, destinationPort, bunkerPorts, mapOverlays, showECAZones, showSwitchingPoints, showFuelTypeRoute]);

  if (!route || !originPort || !destinationPort) {
    return (
      <div className="w-full h-[600px] bg-muted rounded-lg flex items-center justify-center border-2 border-dashed">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">Loading map data...</p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    // Load Leaflet CSS dynamically
    if (typeof window !== 'undefined') {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      link.crossOrigin = '';
      document.head.appendChild(link);

      // Add custom styles for switching point markers
      const style = document.createElement('style');
      style.textContent = `
        .switching-point-marker {
          background: transparent !important;
          border: none !important;
          text-align: center;
          line-height: 1;
        }
        .switching-point-marker div {
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        }
      `;
      document.head.appendChild(style);

      return () => {
        // Cleanup: remove the stylesheet when component unmounts
        const existingLink = document.querySelector(`link[href="${link.href}"]`);
        if (existingLink) {
          existingLink.remove();
        }
        // Cleanup: remove custom styles
        const existingStyle = document.querySelector('style[data-switching-points]');
        if (existingStyle) {
          existingStyle.remove();
        }
        style.remove();
      };
    }
  }, []);

  return (
    <div className="w-full h-[600px] rounded-lg overflow-hidden border relative">
      <div ref={mapRef} className="w-full h-full" style={{ zIndex: 0 }} />
      <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-md text-xs text-gray-600 shadow-sm pointer-events-none z-10">
        Use + / - buttons or double-click to zoom
      </div>
    </div>
  );
}
