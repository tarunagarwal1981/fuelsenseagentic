// components/map-viewer.tsx
'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

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
}

export function MapViewer({ route, originPort, destinationPort, bunkerPorts = [] }: MapViewerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

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

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    // Collect all coordinates for bounds
    const allCoords: [number, number][] = [];

    // Add origin marker (green)
    if (originPort.coordinates) {
      const originCoords: [number, number] = [originPort.coordinates.lat, originPort.coordinates.lon];
      allCoords.push(originCoords);
      
      const originMarker = L.marker(originCoords, {
        icon: L.icon({
          iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41],
        }),
      }).addTo(map);

      originMarker.bindPopup(`
        <div style="font-weight: bold; margin-bottom: 4px;">🚢 Origin: ${originPort.name}</div>
        <div style="font-size: 12px; color: #666;">${originPort.port_code}</div>
        <div style="font-size: 12px; color: #666;">${originPort.country || ''}</div>
      `);
    }

    // Add destination marker (red)
    if (destinationPort.coordinates) {
      const destCoords: [number, number] = [destinationPort.coordinates.lat, destinationPort.coordinates.lon];
      allCoords.push(destCoords);
      
      const destMarker = L.marker(destCoords, {
        icon: L.icon({
          iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41],
        }),
      }).addTo(map);

      destMarker.bindPopup(`
        <div style="font-weight: bold; margin-bottom: 4px;">🎯 Destination: ${destinationPort.name}</div>
        <div style="font-size: 12px; color: #666;">${destinationPort.port_code}</div>
        <div style="font-size: 12px; color: #666;">${destinationPort.country || ''}</div>
      `);
    }

    // Add route polyline
    if (route.waypoints && route.waypoints.length > 0) {
      const waypointCoords: [number, number][] = route.waypoints.map((wp: any) => [
        wp.lat || wp[0],
        wp.lon || wp[1],
      ] as [number, number]);

      // Add waypoints to bounds
      allCoords.push(...waypointCoords);

      // Draw route polyline
      const polyline = L.polyline(waypointCoords, {
        color: '#3b82f6',
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
        <div style="font-size: 12px;">Waypoints: ${route.waypoints.length}</div>
      `);
    }

    // Add bunker port markers (blue/gold)
    bunkerPorts.forEach((port: any, index: number) => {
      if (!port.coordinates) return;

      const portCoords: [number, number] = [port.coordinates.lat, port.coordinates.lon];
      allCoords.push(portCoords);

      // Use gold marker for best option (rank 1), blue for others
      const isBest = port.rank === 1;
      const markerColor = isBest ? 'gold' : 'blue';
      const iconUrl = isBest
        ? 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-gold.png'
        : 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png';

      const portMarker = L.marker(portCoords, {
        icon: L.icon({
          iconUrl,
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41],
        }),
      }).addTo(map);

      const totalCost = port.total_cost ? `$${port.total_cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : 'N/A';
      const savings = port.savings_vs_most_expensive ? `$${port.savings_vs_most_expensive.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : 'N/A';
      const deviation = port.deviation_nm ? `${port.deviation_nm.toFixed(1)} nm` : 'N/A';

      portMarker.bindPopup(`
        <div style="font-weight: bold; margin-bottom: 4px;">
          ${isBest ? '🏆 ' : '⚓ '}${port.name || port.port_name || port.port_code}
        </div>
        <div style="font-size: 12px; color: #666;">${port.port_code}</div>
        ${port.rank ? `<div style="font-size: 12px; margin-top: 4px;"><strong>Rank:</strong> #${port.rank}</div>` : ''}
        ${port.total_cost ? `<div style="font-size: 12px;"><strong>Total Cost:</strong> ${totalCost}</div>` : ''}
        ${port.savings_vs_most_expensive ? `<div style="font-size: 12px; color: ${isBest ? '#10b981' : '#ef4444'};"><strong>${isBest ? 'Savings:' : 'Extra Cost:'}</strong> ${savings}</div>` : ''}
        ${port.deviation_nm ? `<div style="font-size: 12px;"><strong>Deviation:</strong> ${deviation}</div>` : ''}
      `);
    });

    // Fit map to show all markers
    if (allCoords.length > 0) {
      const bounds = L.latLngBounds(allCoords);
      map.fitBounds(bounds, { padding: [50, 50] });
    }

    // Add route statistics control
    const statsHtml = `
      <div style="background: white; padding: 10px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.2); font-size: 12px; min-width: 200px;">
        <div style="font-weight: bold; margin-bottom: 5px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Route Statistics</div>
        <div style="margin-bottom: 3px;"><strong>Distance:</strong> ${route.distance_nm ? `${route.distance_nm.toFixed(1)} nm` : 'N/A'}</div>
        <div style="margin-bottom: 3px;"><strong>Time:</strong> ${route.estimated_hours ? `${route.estimated_hours.toFixed(1)} hours` : 'N/A'}</div>
        <div style="margin-bottom: 3px;"><strong>Waypoints:</strong> ${route.waypoints?.length || 0}</div>
        <div style="margin-top: 5px; padding-top: 5px; border-top: 1px solid #ddd;"><strong>Bunker Ports:</strong> ${bunkerPorts.length}</div>
      </div>
    `;

    const statsControl = L.control({ position: 'topright' });
    statsControl.onAdd = () => {
      const div = L.DomUtil.create('div', 'route-stats');
      div.innerHTML = statsHtml;
      return div;
    };
    statsControl.addTo(map);

    mapInstanceRef.current = map;

    // Cleanup function
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [route, originPort, destinationPort, bunkerPorts]);

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

      return () => {
        // Cleanup: remove the stylesheet when component unmounts
        const existingLink = document.querySelector(`link[href="${link.href}"]`);
        if (existingLink) {
          existingLink.remove();
        }
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
